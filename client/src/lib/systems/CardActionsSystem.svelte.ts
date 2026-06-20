/**
 * Card Actions System — single-card verbs (tap / flip / rotate / trash / send
 * to hand / top / bottom / life / clone / counter) plus context-menu dispatch.
 *
 * All actions are no-ops for opp cards. Every mutation pushes an UndoEntry so
 * Ctrl+Z can roll it back. Network deltas are sent via networkingSystem.
 */
import type { CardData } from '../types';
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { boardSystem } from './BoardSystem.svelte';
import { undoSystem } from './UndoSystem.svelte';
import { deckSystem } from './DeckSystem.svelte';
import { searchSystem } from './SearchSystem.svelte';

class CardActionsSystem {
  /** Spawn a brand-new card on the board (mine) and broadcast. */
  spawnCard(data: CardData, x: number, y: number, faceDown: boolean) {
    const cid = cardStateSystem.createCardState(data, faceDown, 'mine', null, networkingSystem.isHost);
    cardStateSystem.cards[cid].x = x;
    cardStateSystem.cards[cid].y = y;
    networkingSystem.send('card_spawn', { cid, cardId: data.id, x, y, faceDown });
    return cid;
  }

  doTap(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    undoSystem.push({ type: 'tap', cid, prev: c.tapped });
    c.tapped = !c.tapped;
    networkingSystem.send('card_tap', { cid, tapped: c.tapped });
    gameCycleSystem.addLog(`${c.tapped ? 'แตะ' : 'ตั้ง'}: ${c.data.name}`, 'you');
  }

  doFlip(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    undoSystem.push({ type: 'flip', cid, prev: c.faceDown });
    c.faceDown = !c.faceDown;
    networkingSystem.send('card_flip', { cid, faceDown: c.faceDown });
    gameCycleSystem.addLog(`พลิก: ${c.data.name}`, 'you');
  }

  doRotate(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    undoSystem.push({ type: 'rotate', cid, prev: c.rotation });
    c.rotation = (c.rotation + 90) % 360;
    networkingSystem.send('card_rotate', { cid, rotation: c.rotation });
  }

  doTrash(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    undoSystem.push({
      type: 'trash',
      cid,
      prev: { x: c.x, y: c.y, zoneId: c.zoneId },
      cardDataId: c.data.id,
    });
    const trashZone = boardSystem.zones.find(z => z.id === 'you-trash')!;
    const pos = boardSystem.getZoneCardPos(trashZone);
    c.x = pos.x;
    c.y = pos.y;
    c.zoneId = 'you-trash';
    c.inHand = false;
    if (!gameCycleSystem.myTrash.includes(c.data.id)) gameCycleSystem.myTrash.push(c.data.id);
    networkingSystem.send('card_move', { cid, x: pos.x, y: pos.y });
    networkingSystem.syncTrash();
    gameCycleSystem.addLog(`สุสาน: ${c.data.name}`, 'you');
  }

  doToHand(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    networkingSystem.send('card_remove', { cid });
    c.inHand = true;
    c.x = undefined;
    c.y = undefined;
    if (!gameCycleSystem.myHand.includes(cid)) gameCycleSystem.myHand.push(cid);
    deckSystem.updateHandCount();
    networkingSystem.syncHandState();
    gameCycleSystem.addLog(`ไปมือ: ${c.data.name}`, 'you');
  }

  doToTop(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    gameCycleSystem.myDeck.push(c.data.id);
    networkingSystem.send('card_remove', { cid });
    delete cardStateSystem.cards[cid];
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncDeckState();
    gameCycleSystem.addLog('ส่งบนสำรับ', 'you');
  }

  doToBottom(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    gameCycleSystem.myDeck.unshift(c.data.id);
    networkingSystem.send('card_remove', { cid });
    delete cardStateSystem.cards[cid];
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncDeckState();
    gameCycleSystem.addLog('ส่งล่างสำรับ', 'you');
  }

  doToLife(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    if (gameCycleSystem.myLife < gameCycleSystem.myMaxLife) {
      gameCycleSystem.myLife++;
      networkingSystem.send('life_change', { val: gameCycleSystem.myLife });
    }
    networkingSystem.send('card_remove', { cid });
    delete cardStateSystem.cards[cid];
    gameCycleSystem.addLog('ส่งไปชีวิต', 'you');
  }

  doClone(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    const nx = (c.x || 0) + 30;
    const ny = (c.y || 0) + 30;
    this.spawnCard(c.data, nx, ny, c.faceDown);
    gameCycleSystem.addLog(`ทำสำเนา: ${c.data.name}`, 'you');
  }

  doCounter(cid: string, val: number) {
    const c = cardStateSystem.cards[cid];
    if (!c || c.owner !== 'mine') return;
    undoSystem.push({ type: 'counter', cid, prev: c.counter || 0 });
    c.counter = (c.counter || 0) + val;
    networkingSystem.send('card_counter', { cid, val: c.counter });
    gameCycleSystem.addLog(`Counter ${val > 0 ? '+' : ''}${val}: ${c.data.name} (${c.counter})`, 'you');
  }

  /** Reset counter (no undo entry — rarely needed). */
  resetCounter(cid: string) {
    const c = cardStateSystem.cards[cid];
    if (!c) return;
    c.counter = 0;
    networkingSystem.send('card_counter', { cid, val: 0 });
    gameCycleSystem.addLog(`รีเซ็ต Counter: ${c.data.name}`, 'you');
  }

  /** Context-menu dispatch — `act` is the action key, `cid` is the target. */
  ctxAct(act: string, cid: string) {
    if(act === 'searchTrash') {
      searchSystem.openTrashSearch();
      return;
    }
    const map: Record<string, (c: string) => void> = {
      tap: this.doTap,
      flip: this.doFlip,
      rotate: this.doRotate,
      trash: this.doTrash,
      toHand: this.doToHand,
      toTop: this.doToTop,
      toBottom: this.doToBottom,
      toLife: this.doToLife,
      clone: this.doClone,
    };
    map[act]?.call(this, cid);
  }

  /** Right-click on deck pile → action dispatch. */
  deckCtxAct(act: string) {
    if (act === 'shuffle') deckSystem.shuffleDeck();
    else if (act === 'draw') deckSystem.drawCard();
    else if (act === 'drawBottom') deckSystem.drawFromBottom();
    else if (act === 'search3') searchSystem.startSearch(3);
    else if (act === 'search5') searchSystem.startSearch(5);
    else if (act === 'searchDeck1') searchSystem.startSearchDeck(1);
    else if (act === 'searchDeck') searchSystem.startSearchDeck(searchSystem.deckSearchPickCount || 1);
    else if (act === 'scry3') searchSystem.startScry(3);
    else if (act === 'scry5') searchSystem.startScry(5);
    else if (act === 'scry7') searchSystem.startScry(7);
  }
}

export const cardActionsSystem = new CardActionsSystem();
