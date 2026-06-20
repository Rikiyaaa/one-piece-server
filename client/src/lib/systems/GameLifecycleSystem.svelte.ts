/**
 * Game Lifecycle System — orchestrates startGame / resetBoard / confirmNewGame
 * / leaveRoom.  These tie together many subsystems so they live here rather
 * than in +page.svelte.
 */
import { tick } from 'svelte';
import type { CardData } from '../types';
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { cardDatabaseSystem } from './CardDatabaseSystem.svelte';
import { boardSystem } from './BoardSystem.svelte';
import { boardSettingsSystem } from './BoardSettingsSystem.svelte';
import { deckSystem } from './DeckSystem.svelte';
import { deckBuilderSystem } from './DeckBuilderSystem.svelte';
import { lifeSystem } from './LifeSystem.svelte';
import { undoSystem } from './UndoSystem.svelte';

class GameLifecycleSystem {
  /** First-game entry — fades Lobby, builds deck, spawns leader + life + hand. */
  async startGame() {
    networkingSystem.lobbyFading = true;
    await cardDatabaseSystem.loadCardDB((msg, side) => gameCycleSystem.addLog(msg, side));

    const leader =
      deckBuilderSystem.dbLeader ||
      cardDatabaseSystem.cardDb.find(c => c.id === 'OP01-012') ||
      cardDatabaseSystem.cardDb.find(c => c.type === 'Leader');
    const lifeCount = deckBuilderSystem.getLeaderLife(leader);

    gameCycleSystem.myLife = lifeCount;
    gameCycleSystem.oppLife = lifeCount;
    gameCycleSystem.myMaxLife = lifeCount;
    gameCycleSystem.myDon = deckBuilderSystem.dbDonCount > 0 ? deckBuilderSystem.dbDonCount : 10;
    gameCycleSystem.myDonSpent = 0;
    gameCycleSystem.oppDon = 10;
    gameCycleSystem.oppDonSpent = 0;
    gameCycleSystem.phase = 0;
    gameCycleSystem.turn = 1;
    undoSystem.clear();
    cardStateSystem.attackLines = [];
    gameCycleSystem.myLifeCards = [];
    gameCycleSystem.mulliganAvailable = false;

    deckSystem.buildDeck(deckBuilderSystem.dbCards, deckBuilderSystem.dbDonCount);

    // Wait for Lobby fade-out, then mount game UI
    await new Promise(r => setTimeout(r, 3000));
    networkingSystem.gameStarted = true;

    await tick(); // let #playfield render before measuring
    // Force the board layout back to defaults now that #playfield exists,
    // so positions are always correct on game start without needing a
    // manual "Reset เป็นค่าเริ่มต้น" click.
    boardSettingsSystem.autoResetToDefaults();
    if (leader) {
      const pos = boardSystem.getDefaultCardPos(leader);
      this.spawnLeader(leader, pos.x, pos.y);
    }

    lifeSystem.spawnLifeCards(lifeCount);

    setTimeout(() => {
      for (let i = 0; i < 5; i++) setTimeout(() => deckSystem.drawCard(), i * 90);
    }, 400);
    setTimeout(
      () => networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length }),
      700
    );
    setTimeout(() => {
      gameCycleSystem.mulliganAvailable = true;
    }, 900);
    gameCycleSystem.addLog(
      `เริ่มเกม! ชีวิต ${lifeCount} ใบ (จาก Leader: ${leader?.name || 'ไม่มี'})`,
      'system'
    );
  }

  /** Reset board for a new game (after first game). */
  async resetBoard() {
    cardStateSystem.clear();
    gameCycleSystem.myHand = [];
    gameCycleSystem.myTrash = [];
    gameCycleSystem.myDeck = [];
    gameCycleSystem.myLifeCards = [];

    const leader = deckBuilderSystem.dbLeader || cardDatabaseSystem.cardDb.find(c => c.type === 'Leader');
    const lifeCount = deckBuilderSystem.getLeaderLife(leader);

    gameCycleSystem.myLife = lifeCount;
    gameCycleSystem.oppLife = lifeCount;
    gameCycleSystem.myMaxLife = lifeCount;
    gameCycleSystem.myDon = deckBuilderSystem.dbDonCount > 0 ? deckBuilderSystem.dbDonCount : 10;
    gameCycleSystem.myDonSpent = 0;
    gameCycleSystem.oppDon = 10;
    gameCycleSystem.oppDonSpent = 0;
    gameCycleSystem.oppHandCount = 0;
    gameCycleSystem.phase = 0;
    gameCycleSystem.turn = 1;
    undoSystem.clear();
    cardStateSystem.attackLines = [];
    gameCycleSystem.mulliganAvailable = false;
    deckSystem.buildDeck(deckBuilderSystem.dbCards, deckBuilderSystem.dbDonCount);

    await tick();

    if (leader) {
      const pos = boardSystem.getDefaultCardPos(leader);
      this.spawnLeader(leader, pos.x, pos.y);
    }

    lifeSystem.spawnLifeCards(lifeCount);

    setTimeout(() => {
      for (let i = 0; i < 5; i++) setTimeout(() => deckSystem.drawCard(), i * 90);
    }, 400);
    setTimeout(
      () => networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length }),
      700
    );
    setTimeout(
      () =>
        networkingSystem.send('don_change', {
          total: gameCycleSystem.myDon,
          spent: gameCycleSystem.myDonSpent,
        }),
      700
    );
    setTimeout(() => {
      gameCycleSystem.mulliganAvailable = true;
    }, 900);
  }

  private spawnLeader(leader: CardData, x: number, y: number) {
    const cid = cardStateSystem.createCardState(leader, false, 'mine', null, networkingSystem.isHost);
    cardStateSystem.cards[cid].x = x;
    cardStateSystem.cards[cid].y = y;
    networkingSystem.send('card_spawn', { cid, cardId: leader.id, x, y, faceDown: false });
    return cid;
  }

  confirmNewGame() {
    if (!confirm('รีเซ็ตบอร์ดทั้งสองฝ่าย?')) return;
    networkingSystem.send('new_game', {});
    gameCycleSystem.addLog('เริ่มเกมใหม่...', 'system');
  }

  leaveRoom() {
    if (!confirm('ออกจากห้อง?')) return;
    networkingSystem.leaveRoom();
    undoSystem.clear();
    cardStateSystem.attackLines = [];
  }
}

export const gameLifecycleSystem = new GameLifecycleSystem();
