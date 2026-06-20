/**
 * Life System — damage / life-card spawn / peek-life overlay.
 *
 * Life counts live in gameCycleSystem (myLife / oppLife / myMaxLife).
 * The actual card-ids in life zone live in gameCycleSystem.myLifeCards.
 * The card entities on the board live in cardStateSystem.cards (zoneId='you-life').
 */
import type { CardData } from '../types';
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { cardDatabaseSystem } from './CardDatabaseSystem.svelte';
import { boardSystem, CARD_W, CARD_H } from './BoardSystem.svelte';
import { deckSystem } from './DeckSystem.svelte';

class LifeSystem {
  peekLifeVisible = $state(false);

  /** Spawn life cards face-down in you-life zone (called by startGame / resetBoard). */
  spawnLifeCards(lifeCount: number) {
    gameCycleSystem.myLifeCards = [];
    if (!gameCycleSystem.myDeck.length) return;

    const lifeZone = boardSystem.zones.find(z => z.id === 'you-life');
    if (!lifeZone) return;

    const b = boardSystem.getBoardRect();
    const slotH = lifeZone.h / lifeCount;

    for (let i = 0; i < lifeCount && gameCycleSystem.myDeck.length > 0; i++) {
      const cardId = gameCycleSystem.myDeck.pop()!;
      const data = cardDatabaseSystem.cardMap[cardId];
      if (!data) continue;

      gameCycleSystem.myLifeCards.push(cardId);

      const boardCX = lifeZone.x + lifeZone.w / 2;
      const boardCY = lifeZone.y + slotH * i + slotH / 2;
      const px = Math.round(b.left + boardCX * b.scale - CARD_W / 2);
      const py = Math.round(b.top + boardCY * b.scale - CARD_H / 2);

      const cid = cardStateSystem.createCardState(data, true, 'mine', null, networkingSystem.isHost);
      const c = cardStateSystem.cards[cid];
      c.x = px;
      c.y = py;
      c.zoneId = 'you-life';
      c.rotation = 90;
      networkingSystem.send('card_spawn', {
        cid,
        cardId: data.id,
        x: px,
        y: py,
        faceDown: true,
        rotation: 90,
        zoneId: 'you-life',
      });
    }

    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    gameCycleSystem.addLog(`วางไพ่ life ${gameCycleSystem.myLifeCards.length} ใบ (คว่ำ)`, 'system');
    networkingSystem.syncLifeCards();
    networkingSystem.syncDeckState();
  }

  /** Take 1 damage — flips top life card face-up and adds to hand. */
  takeDamage() {
    if (gameCycleSystem.myLife <= 0) return;

    const lifeCids = Object.values(cardStateSystem.cards).filter(
      c => c.owner === 'mine' && c.zoneId === 'you-life' && !c.inHand
    );

    if (lifeCids.length > 0) {
      const topCard = lifeCids[lifeCids.length - 1];
      topCard.faceDown = false;
      topCard.inHand = true;
      topCard.zoneId = undefined;
      topCard.rotation = 0;
      gameCycleSystem.myHand.push(topCard.cid);
      gameCycleSystem.myHandCount = gameCycleSystem.myHand.length;
      deckSystem.updateHandCount();
      networkingSystem.send('card_move', {
        cid: topCard.cid,
        x: topCard.x,
        y: topCard.y,
        faceDown: false,
        inHand: true,
      });
      gameCycleSystem.addLog(`เปิด life: ${topCard.data.name}`, 'you');
    }

    gameCycleSystem.myLife--;
    networkingSystem.send('life_change', { val: gameCycleSystem.myLife });
    gameCycleSystem.addLog(`ชีวิตเหลือ ${gameCycleSystem.myLife}`, 'you');
  }

  togglePeekLife() {
    this.peekLifeVisible = !this.peekLifeVisible;
    if (this.peekLifeVisible) {
      gameCycleSystem.addLog('แอบดูการ์ด Life', 'you');
    }
  }
}

export const lifeSystem = new LifeSystem();
