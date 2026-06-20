import { Client, type Room } from 'colyseus.js';
import { GameState } from 'shared';
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { cardDatabaseSystem } from './CardDatabaseSystem.svelte';
import { boardSystem, PHASES, CARD_W, CARD_H } from './BoardSystem.svelte';
import { remoteHandlerSystem } from './RemoteHandlerSystem.svelte';
import { donSystem } from './DonSystem.svelte';
import { deckSystem } from './DeckSystem.svelte';

/**
 * Networking System — Colyseus room lifecycle, message routing, reconnect-token
 * persistence, server-state rebuild, and sync helpers.
 *
 * Holds:
 *   - room / connected / mySessionId / isHost / oppName (reactive)
 *   - lobby state: lobbyView / lobbyStatus / lobbyStatusCls / roomIdDisplay / countdown
 *     / gameStarted / matchInitialized / isRestoringFromReconnect / lobbyFading
 *   - auth: authChecked / myName
 *
 * All incoming messages are routed to the appropriate system's handler.
 */
class NetworkingSystem {
  room = $state<Room | null>(null);
  connected = $state(false);
  mySessionId = $state('');
  isHost = $state(false);
  oppName = $state('คู่ต่อสู้');

  // ── Lobby / lifecycle state (kept here because it's tightly coupled to room) ──
  gameStarted = $state(false);
  lobbyFading = $state(false);
  matchInitialized = $state(false);
  isRestoringFromReconnect = false;
  private _lifecycleBusy = false;
  authChecked = $state(false);

  myName = $state('Player 1');
  lobbyView = $state<'form' | 'waiting'>('form');
  lobbyStatus = $state('');
  lobbyStatusCls = $state('');
  roomIdDisplay = $state('');
  countdown = $state(0);

  // ── Reconnect-token persistence ──
  // localStorage (not sessionStorage) survives full tab reloads; tabId in
  // sessionStorage prevents cross-tab collisions.
  static TAB_ID_KEY = 'cardgame_tab_id';
  static RECONNECT_KEY = 'cardgame_reconnect';

  getTabId(): string {
    if (typeof sessionStorage === 'undefined') return 'ssr';
    let id = sessionStorage.getItem(NetworkingSystem.TAB_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2);
      sessionStorage.setItem(NetworkingSystem.TAB_ID_KEY, id);
    }
    return id;
  }

  saveReconnectInfo(r: Room) {
    try {
      const key = `${NetworkingSystem.RECONNECT_KEY}_${this.getTabId()}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          token: r.reconnectionToken,
          roomId: r.roomId,
          savedAt: Date.now(),
        })
      );
    } catch {}
  }

  loadReconnectInfo(): { token: string; roomId: string } | null {
    try {
      const key = `${NetworkingSystem.RECONNECT_KEY}_${this.getTabId()}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - (parsed.savedAt ?? 0) > 10 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  clearReconnectInfo() {
    try {
      const key = `${NetworkingSystem.RECONNECT_KEY}_${this.getTabId()}`;
      localStorage.removeItem(key);
    } catch {}
  }

  getApiBase() {
    if (import.meta.env.VITE_SERVER_URL) {
      return import.meta.env.VITE_SERVER_URL.replace(/^ws/, 'http');
    }
    if (typeof window === 'undefined') return 'http://localhost:2567';
    const proto = window.location.protocol === 'https:' ? 'https' : 'http';
    return `${proto}://${window.location.hostname}:2567`;
  }

  get SERVER_URL() {
    if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
    if (typeof window === 'undefined') return 'ws://localhost:2567';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.hostname}:2567`;
  }

  setStatus(msg: string, cls: string) {
    this.lobbyStatus = msg;
    this.lobbyStatusCls = cls;
  }

  send(type: string, data: any = {}) {
    if (this.room) this.room.send(type, data);
  }

  // ── Sync helpers — broadcast local state to server for reconnect restore ──
  syncHandState() {
    const handIds = gameCycleSystem.myHand
      .map(cid => cardStateSystem.cards[cid]?.data?.id)
      .filter(Boolean);
    this.send('sync_hand', { hand: handIds });
  }
  syncDeckState() {
    this.send('sync_deck', { deck: [...gameCycleSystem.myDeck] });
  }
  syncLifeCards() {
    this.send('sync_life_cards', { lifeCards: [...gameCycleSystem.myLifeCards] });
  }
  syncTrash() {
    this.send('sync_trash', { trashCards: [...gameCycleSystem.myTrash] });
  }
  syncAllState() {
    this.syncHandState();
    this.syncDeckState();
    this.syncLifeCards();
    this.syncTrash();
  }

  // ════════════════════════════════════════════════
  //   ROOM SETUP — wire up all message handlers
  // ════════════════════════════════════════════════
  setupRoom(
    callbacks: {
      startGame: () => void;
      resetBoard: () => void;
    }
  ) {
    const room = this.room;
    if (!room) return;
    this.mySessionId = room.sessionId;

    room.onMessage('assign_role', (d: any) => {
      this.isHost = d.isHost;
      this.mySessionId = d.sessionId;
      room?.send('client_ready', {});
    });

    room.onStateChange((state: any) => this.handleStateChange(state));

    room.onMessage('game_ready', (d: any) => {
      const p1 = d.player1.name;
      const p2 = d.player2.name;
      if (this.isHost) this.oppName = p2;
      else this.oppName = p1;
      this.setStatus('พบคู่ต่อสู้แล้ว!', 'ok');
    });

    room.onMessage('hello', (d: any) => {
      this.oppName = d.name;
      gameCycleSystem.addLog(`${d.name} เชื่อมต่อแล้ว`, 'system');
    });
    room.onMessage('hello_ack', (d: any) => {
      this.oppName = d.name;
    });

    room.onMessage('card_spawn', remoteHandlerSystem.handleRemoteCardSpawn.bind(remoteHandlerSystem));
    room.onMessage('card_move', remoteHandlerSystem.handleRemoteCardMove.bind(remoteHandlerSystem));
    room.onMessage('card_remove', remoteHandlerSystem.handleRemoteCardRemove.bind(remoteHandlerSystem));
    room.onMessage('card_tap', remoteHandlerSystem.handleRemoteCardTap.bind(remoteHandlerSystem));
    room.onMessage('card_flip', remoteHandlerSystem.handleRemoteCardFlip.bind(remoteHandlerSystem));
    room.onMessage('card_rotate', remoteHandlerSystem.handleRemoteCardRotate.bind(remoteHandlerSystem));

    room.onMessage('don_card_spawn', donSystem.handleRemoteDonSpawn.bind(donSystem));
    room.onMessage('don_card_move', donSystem.handleRemoteDonMove.bind(donSystem));
    room.onMessage('don_card_tap', donSystem.handleRemoteDonTap.bind(donSystem));
    room.onMessage('don_card_remove', donSystem.handleRemoteDonRemove.bind(donSystem));
    room.onMessage('don_change', (d: any) => {
      gameCycleSystem.oppDon = d.total;
      gameCycleSystem.oppDonSpent = d.spent;
    });

    room.onMessage('life_change', (d: any) => {
      gameCycleSystem.oppLife = d.val;
      gameCycleSystem.addLog(`${this.oppName}: ชีวิต ${d.val}`, 'opp');
    });
    room.onMessage('phase', (d: any) => {
      gameCycleSystem.phase = d.phase;
      gameCycleSystem.turn = d.turn;
      gameCycleSystem.addLog(`${this.oppName}: Phase→${PHASES[d.phase]}`, 'opp');
    });
    room.onMessage('hand_count', (d: any) => {
      gameCycleSystem.oppHandCount = d.count;
    });
    room.onMessage('draw', () => {
      gameCycleSystem.oppHandCount++;
    });
    room.onMessage('deck_count', (d: any) => {
      gameCycleSystem.oppDeckCount = d.count;
    });
    room.onMessage('shuffle', () => {
      gameCycleSystem.addLog(`${this.oppName}: สับสำรับ`, 'opp');
      deckSystem.playShuffleAnim('opp');
    });
    room.onMessage('log', (d: any) =>
      gameCycleSystem.addLog(`${this.oppName}: ${d.msg}`, 'opp')
    );
    room.onMessage('dice_result', (d: any) => {
      // Dice log entry — actual animation handled by +page.svelte via callback
      gameCycleSystem.addLog(`🎲 ${this.oppName} ทอยลูกเต๋า`, 'opp');
      (this as any)._lastOppDice = { total: d.total, values: d.values, ts: Date.now() };
    });
    room.onMessage('new_game', () =>
      gameCycleSystem.addLog(`${this.oppName}: เริ่มเกมใหม่`, 'opp')
    );

    // ✅ Both players receive game_start and trigger their own startGame/resetBoard
    room.onMessage('game_start', () => {
      if (this._lifecycleBusy) return; // game_restore กำลัง rebuild อยู่ ไม่ขัดกัน
      if (!this.matchInitialized) {
        this.matchInitialized = true;
        gameCycleSystem.addLog('เริ่มเกม! จั่ว 5 ใบ...', 'system');
        // Small delay so Lobby can show "พบคู่ต่อสู้" before transitioning
        setTimeout(() => callbacks.startGame(), 2000);
      } else {
        gameCycleSystem.addLog('รีเซ็ตบอร์ด... จั่ว 5 ใบใหม่', 'system');
        callbacks.resetBoard();
      }
    });

    // ✅ game_restore = reconnect (not new game) → rebuild board from state
    room.onMessage('game_restore', () => {
      if (this._lifecycleBusy) return; // ป้องกัน double-fire
      gameCycleSystem.addLog('เชื่อมต่อกลับสำเร็จ! กู้คืนบอร์ด...', 'system');
      if (this.isRestoringFromReconnect) return; // onMount already rebuilding
      this._lifecycleBusy = true;
      if (!this.gameStarted) this.gameStarted = true;
      if (this.room?.state) this.rebuildBoardFromState(this.room.state);
      setTimeout(() => {
        this.syncAllState();
        this._lifecycleBusy = false;
      }, 300);
    });

    room.onMessage('cursor', remoteHandlerSystem.handleRemoteCursor.bind(remoteHandlerSystem));
    room.onMessage('card_drag_start', remoteHandlerSystem.handleRemoteCardDragStart.bind(remoteHandlerSystem));
    room.onMessage('card_drag_move', remoteHandlerSystem.handleRemoteCardDragMove.bind(remoteHandlerSystem));
    room.onMessage('card_drag_end', remoteHandlerSystem.handleRemoteCardDragEnd.bind(remoteHandlerSystem));
    room.onMessage('attack_line', remoteHandlerSystem.handleRemoteAttackLine.bind(remoteHandlerSystem));
    room.onMessage('card_counter', (d: any) => {
      const c = cardStateSystem.cards[d.cid];
      if (c) c.counter = d.val;
    });
    room.onMessage('player_left', () => {
      this.connected = false;
      gameCycleSystem.addLog(`${this.oppName} หลุดการเชื่อมต่อ`, 'system');
    });
    room.onMessage('player_reconnected', () => {
      this.connected = true;
      gameCycleSystem.addLog(`${this.oppName} เชื่อมต่อกลับมาแล้ว`, 'system');
    });

    this.connected = true;
  }

  private handleStateChange(state: any) {
    if (!state) return;
    const room = this.room;
    if (!room) return;
    if (state.player1SessionId) {
      this.isHost = room.sessionId === state.player1SessionId;
    }
    if (state.player1SessionId && state.player2SessionId) {
      if (this.isHost) {
        this.oppName = state.player2.name || 'Player 2';
        this.myName = state.player1.name || 'Player 1';
      } else {
        this.oppName = state.player1.name || 'Player 1';
        this.myName = state.player2.name || 'Player 2';
      }
      this.setStatus('พบคู่ต่อสู้แล้ว!', 'ok');
    } else {
      if (this.isHost) {
        this.myName = state.player1.name || 'Player 1';
      } else {
        this.myName = state.player2?.name || this.myName;
      }
      this.oppName = 'รอคู่ต่อสู้...';
      this.setStatus('รอคู่ต่อสู้...', '');
    }
  }

  /** Rebuild board from server state after reconnect. */
  rebuildBoardFromState(state: any) {
    if (!state) return;
    const room = this.room;
    cardStateSystem.clear();

    const amPlayer1 = room ? state.player1SessionId === room.sessionId : this.isHost;
    const myPs = amPlayer1 ? state.player1 : state.player2;
    const oppPs = amPlayer1 ? state.player2 : state.player1;
    if (!myPs || !oppPs) return;
    this.isHost = amPlayer1;

    gameCycleSystem.myLife = myPs.life;
    gameCycleSystem.oppLife = oppPs.life;
    gameCycleSystem.myDon = myPs.donTotal;
    gameCycleSystem.myDonSpent = myPs.donSpent;
    gameCycleSystem.oppDon = oppPs.donTotal;
    gameCycleSystem.oppDonSpent = oppPs.donSpent;
    gameCycleSystem.oppHandCount = oppPs.handCount;
    gameCycleSystem.myDeckCount = myPs.deckCount;
    gameCycleSystem.oppDeckCount = oppPs.deckCount;
    gameCycleSystem.phase = PHASES.indexOf(state.phase) >= 0 ? PHASES.indexOf(state.phase) : 0;
    gameCycleSystem.turn = state.turn;

    // Restore field cards (mine)
    myPs.field.forEach((card: any, cid: string) => {
      const data = cardDatabaseSystem.cardMap[card.cardId];
      if (!data) return;
      cardStateSystem.cards[cid] = {
        data,
        cid,
        owner: 'mine',
        faceDown: card.faceDown,
        tapped: card.isTapped,
        rotation: card.rotation,
        inHand: false,
        isDon: card.isDon,
        counter: card.counter || undefined,
        x: card.x,
        y: card.y,
      };
      const n = parseInt(cid.replace(/\D/g, ''), 10);
      if (!isNaN(n) && n >= cardStateSystem.nextCid) cardStateSystem.nextCid = n + 1;
    });

    // Restore field cards (opp) — mirror coordinates
    oppPs.field.forEach((card: any, cid: string) => {
      const data = cardDatabaseSystem.cardMap[card.cardId];
      if (!data) return;
      const { x, y } = remoteHandlerSystem.remoteM(card.x, card.y);
      cardStateSystem.cards[cid] = {
        data,
        cid,
        owner: 'opp',
        faceDown: card.faceDown,
        tapped: card.isTapped,
        rotation: card.rotation,
        inHand: false,
        isDon: card.isDon,
        counter: card.counter || undefined,
        x,
        y,
      };
    });

    // Restore hand
    const savedHand: string[] = Array.from(myPs.hand ?? []);
    if (savedHand.length > 0) {
      gameCycleSystem.myHand = [];
      savedHand.forEach((cardId: string) => {
        const data = cardDatabaseSystem.cardMap[cardId];
        if (!data) return;
        const cid = cardStateSystem.createCardState(data, false, 'mine', null, this.isHost);
        cardStateSystem.cards[cid].inHand = true;
        gameCycleSystem.myHand.push(cid);
      });
      gameCycleSystem.myHandCount = gameCycleSystem.myHand.length;
    }

    // Restore deck
    const savedDeck: string[] = Array.from(myPs.deck ?? []);
    if (savedDeck.length > 0) {
      gameCycleSystem.myDeck = [...savedDeck];
      gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    }

    // Restore life cards
    const savedLife: string[] = Array.from(myPs.lifeCards ?? []);
    if (savedLife.length > 0) {
      gameCycleSystem.myLifeCards = [...savedLife];
    }

    // Restore trash
    const savedTrash: string[] = Array.from(myPs.trashCards ?? []);
    if (savedTrash.length > 0) {
      gameCycleSystem.myTrash = [...savedTrash];
    }
  }

  /** Join-or-create the matchmaking room. */
  async joinOrCreateRoom() {
    this.setStatus('กำลังค้นหา/สร้างห้อง...', '');
    try {
      const client = new Client(this.SERVER_URL);
      this.room = await client.joinOrCreate<GameState>(
        'card_game',
        { name: this.myName },
        GameState
      );
      this.roomIdDisplay = this.room.roomId;
      this.mySessionId = this.room.sessionId;
      this.saveReconnectInfo(this.room);
      this._registerBeforeUnload();
      this.setStatus('เชื่อมต่อสำเร็จ! รอคู่ต่อสู้...', 'ok');
      return true;
    } catch (e: any) {
      this.setStatus('ไม่สามารถเข้าห้องได้: ' + e.message, 'err');
      this.lobbyView = 'form';
      return false;
    }
  }

  /** Reconnect using a saved token (page reload / brief disconnect). */
  async reconnectWithToken(token: string): Promise<boolean> {
    try {
      const client = new Client(this.SERVER_URL);
      this.room = await client.reconnect<GameState>(token, GameState);
      this.roomIdDisplay = this.room.roomId;
      this.mySessionId = this.room.sessionId;
      this.saveReconnectInfo(this.room);
      this._registerBeforeUnload();
      return true;
    } catch {
      this.clearReconnectInfo();
      this.room = null;
      // แสดง error ให้ผู้เล่นรู้ว่าเซสชันหมดอายุ ไม่ใช่เงียบๆ กลับ lobby
      this.setStatus('เซสชันหมดอายุหรือห้องถูกปิดไปแล้ว — กรุณาเข้าห้องใหม่', 'err');
      this.lobbyView = 'form';
      return false;
    }
  }

  // ── beforeunload: แจ้ง server ว่าเป็น refresh ไม่ใช่ออกห้องจริง ──
  private _unloadHandler: (() => void) | null = null;

  private _registerBeforeUnload() {
    if (this._unloadHandler) return; // ลงทะเบียนแค่ครั้งเดียว
    this._unloadHandler = () => {
      // going_away บอก server ว่า disconnect นี้มาจาก refresh/close tab
      // → server จะ allowReconnection แทนที่จะ dispose ห้องทันที
      if (this.room) this.room.send('going_away', {});
    };
    window.addEventListener('beforeunload', this._unloadHandler);
  }

  leaveRoom() {
    // ออกจากห้องจริง → ถอด beforeunload ออกก่อน ไม่ส่ง going_away
    // เพื่อให้ server รู้ว่าเป็น consented leave จริงๆ ไม่ใช่ refresh
    if (this._unloadHandler) {
      window.removeEventListener('beforeunload', this._unloadHandler);
      this._unloadHandler = null;
    }
    this.room?.leave();
    this.room = null;
    this.gameStarted = false;
    this.lobbyView = 'form';
    this.connected = false;
    this.matchInitialized = false;
    this.lobbyFading = false;
    this.clearReconnectInfo();
  }
}

export const networkingSystem = new NetworkingSystem();
