/**
 * Deck System — build / shuffle / draw / mulligan + sync helpers.
 *
 * Owns no $state of its own; mutates gameCycleSystem.myDeck/myHand/myTrash
 * + myDeckCount/myHandCount and broadcasts deltas via networkingSystem.
 */
import type { CardData } from '../types';
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { cardDatabaseSystem } from './CardDatabaseSystem.svelte';

class DeckSystem {
  /** Build myDeck from saved dbCards (or random fallback) + shuffle. */
  buildDeck(dbCards: Record<string, number>, dbDonCount: number) {
    gameCycleSystem.myDeck = [];
    const saved = Object.entries(dbCards);
    if (saved.length) {
      saved.forEach(([id, cnt]) => {
        for (let i = 0; i < cnt; i++) gameCycleSystem.myDeck.push(id);
      });
    } else {
      const pool = cardDatabaseSystem.cardDb.filter(
        c => c.type.toLowerCase() !== 'leader'
      );
      const src = pool.length >= 50 ? pool : cardDatabaseSystem.cardDb;
      src.forEach(c => {
        const n = c.rarity === 'L' ? 1 : c.rarity === 'SR' ? 1 : c.rarity === 'R' ? 2 : 4;
        for (let i = 0; i < n && gameCycleSystem.myDeck.length < 50; i++)
          gameCycleSystem.myDeck.push(c.id);
      });
    }
    gameCycleSystem.shuffle(gameCycleSystem.myDeck);
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    // Note: dbDonCount is consumed by startGame caller; kept in signature for parity.
    void dbDonCount;
  }

  drawCard() {
    if (!gameCycleSystem.myDeck.length) {
      gameCycleSystem.addLog('สำรับหมด!', 'system');
      return;
    }
    const cardId = gameCycleSystem.myDeck.pop()!;
    const data = cardDatabaseSystem.cardMap[cardId];
    if (!data) return;
    const cid = cardStateSystem.createCardState(data, false, 'mine', null, networkingSystem.isHost);
    cardStateSystem.cards[cid].inHand = true;
    gameCycleSystem.myHand.push(cid);
    gameCycleSystem.myHandCount = gameCycleSystem.myHand.length;
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    this.updateHandCount();
    networkingSystem.send('draw', {});
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncHandState();
    networkingSystem.syncDeckState();
    gameCycleSystem.addLog(`จั่ว: ${data.name}`, 'you');
  }

  drawFromBottom() {
    if (!gameCycleSystem.myDeck.length) {
      gameCycleSystem.addLog('สำรับหมด!', 'system');
      return;
    }
    const cardId = gameCycleSystem.myDeck.shift()!;
    const data = cardDatabaseSystem.cardMap[cardId];
    if (!data) return;
    const cid = cardStateSystem.createCardState(data, false, 'mine', null, networkingSystem.isHost);
    cardStateSystem.cards[cid].inHand = true;
    gameCycleSystem.myHand.push(cid);
    gameCycleSystem.myHandCount = gameCycleSystem.myHand.length;
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    this.updateHandCount();
    networkingSystem.send('draw', {});
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncHandState();
    networkingSystem.syncDeckState();
    gameCycleSystem.addLog(`จั่วจากใต้กอง: ${data.name}`, 'you');
  }

  shuffleDeck() {
    gameCycleSystem.shuffle(gameCycleSystem.myDeck);
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('shuffle', {});
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncDeckState();
    gameCycleSystem.addLog('สับสำรับ', 'you');
    this.playShuffleAnim('you');
  }

  /** Mulligan — return hand to deck, reshuffle, draw 5. */
  doMulligan() {
    if (!gameCycleSystem.mulliganAvailable) return;
    gameCycleSystem.mulliganAvailable = false;

    const handCids = gameCycleSystem.myHand.slice();
    handCids.forEach(cid => {
      const c = cardStateSystem.cards[cid];
      if (c) {
        gameCycleSystem.myDeck.push(c.data.id);
        networkingSystem.send('card_remove', { cid });
        delete cardStateSystem.cards[cid];
      }
    });
    gameCycleSystem.myHand = [];
    gameCycleSystem.myHandCount = 0;
    networkingSystem.send('hand_count', { count: 0 });

    gameCycleSystem.shuffle(gameCycleSystem.myDeck);
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('shuffle', {});
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncHandState();
    networkingSystem.syncDeckState();
    this.playShuffleAnim('you');

    setTimeout(() => {
      for (let i = 0; i < 5; i++) setTimeout(() => this.drawCard(), i * 90);
    }, 250);

    gameCycleSystem.addLog('Mulligan: สับมือกลับกองแล้วจั่วใหม่ 5 ใบ', 'you');
    networkingSystem.send('log', { msg: 'ทำ Mulligan (เปลี่ยนมือเริ่มต้น)' });
  }

  /** Animate the deck-pile shuffle visual (you / opp). */
  playShuffleAnim(who: 'you' | 'opp') {
    const ANIM_MS = 1650;
    if (who === 'you') {
      clearTimeout((this as any)._myShuffleTimer);
      gameCycleSystem.myDeckShuffling = false;
      requestAnimationFrame(() => {
        gameCycleSystem.myDeckShuffling = true;
      });
      (this as any)._myShuffleTimer = setTimeout(() => {
        gameCycleSystem.myDeckShuffling = false;
      }, ANIM_MS);
    } else {
      clearTimeout((this as any)._oppShuffleTimer);
      gameCycleSystem.oppDeckShuffling = false;
      requestAnimationFrame(() => {
        gameCycleSystem.oppDeckShuffling = true;
      });
      (this as any)._oppShuffleTimer = setTimeout(() => {
        gameCycleSystem.oppDeckShuffling = false;
      }, ANIM_MS);
    }
  }

  updateHandCount() {
    gameCycleSystem.myHandCount = gameCycleSystem.myHand.length;
    networkingSystem.send('hand_count', { count: gameCycleSystem.myHand.length });
  }
}

export const deckSystem = new DeckSystem();
