/**
 * DON!! System — spawn DON cards, return-all-to-cost,
 * and remote (opp) DON handlers.
 *
 * Attach/detach logic has been removed.
 */
import type { CardData } from '../types';
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { boardSystem, CARD_W, CARD_H } from './BoardSystem.svelte';

class DonSystem {
  /** Pick a fresh DON!! from the pile (decrement available count). */
  addMyDon() {
    if (gameCycleSystem.myDonSpent >= gameCycleSystem.myDon) return;
    gameCycleSystem.myDonSpent++;
    networkingSystem.send('don_change', {
      total: gameCycleSystem.myDon,
      spent: gameCycleSystem.myDonSpent,
    });
    this.spawnDonCard();
    gameCycleSystem.addLog(
      `หยิบ DON!! (เหลือ ${gameCycleSystem.myDon - gameCycleSystem.myDonSpent}/${gameCycleSystem.myDon})`,
      'you'
    );
  }

  spawnDonCard() {
    const donZone = boardSystem.zones.find(z => z.id === 'you-don-deck');
    if (!donZone) return;
    const existing = Object.values(cardStateSystem.cards).filter(
      c => c.isDon && c.owner === 'mine' && !c.inHand
    );
    const b = boardSystem.getBoardRect();
    const s = b.scale;
    const offset = (existing.length % 6) * 6;
    const cx = donZone.x + donZone.w / 2 + offset;
    const cy = donZone.y - donZone.h / 2 - 10 + offset * 0.5;
    const px = Math.round(b.left + cx * s - CARD_W / 2);
    const py = Math.round(b.top + cy * s - CARD_H / 2);
    const prefix = networkingSystem.isHost ? 'h' : 'g';
    const cid = prefix + 'don' + cardStateSystem.nextCid++;

    cardStateSystem.cards[cid] = {
      cid,
      owner: 'mine',
      isDon: true,
      faceDown: false,
      tapped: false,
      rotation: 0,
      inHand: false,
      x: px,
      y: py,
      data: {
        name: 'DON!!',
        id: 'don',
        art: '#3a2a00',
        type: '',
        cost: 0,
        power: 0,
        rarity: '',
        color: '',
        effect: '',
      },
    };
    networkingSystem.send('don_card_spawn', { cid, x: px, y: py });
  }

  /** Sweep all my DONs back to COST area in Rest (tapped) state. */
  returnAllDon() {
    const costZone = boardSystem.zones.find(z => z.id === 'you-cost');
    if (!costZone) return;

    const myDons = Object.values(cardStateSystem.cards).filter(
      c => c.isDon && c.owner === 'mine' && !c.inHand
    );
    if (!myDons.length) {
      gameCycleSystem.addLog('ไม่มี DON!! บนบอร์ด', 'system');
      return;
    }

    const b = boardSystem.getBoardRect();
    const totalDons = myDons.length;
    const cols = Math.min(5, totalDons);
    const rows = Math.ceil(totalDons / 5);
    const slotW = costZone.w / cols;
    const slotH = costZone.h / rows;

    myDons.forEach((don, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const boardCX = costZone.x + (col + 0.5) * slotW;
      const boardCY = costZone.y + (row + 0.5) * slotH;
      const px = Math.round(b.left + boardCX * b.scale - CARD_W / 2);
      const py = Math.round(b.top + boardCY * b.scale - CARD_H / 2);
      don.x = px;
      don.y = py;
      don.tapped = true;
      don.zoneId = 'you-cost';
      networkingSystem.send('don_card_move', { cid: don.cid, x: px, y: py });
      networkingSystem.send('don_card_tap', { cid: don.cid, tapped: true });
    });

    networkingSystem.send('log', { msg: `คืน DON!! ${myDons.length} ใบกลับ COST Area (Rest)` });
    gameCycleSystem.addLog(`คืน DON!! ${myDons.length} ใบกลับ COST Area ✓`, 'you');
  }

  // ── Remote (opp) DON handlers ──
  handleRemoteDonSpawn(d: any) {
    if (cardStateSystem.cards[d.cid]) return;
    const w = boardSystem.playfieldEl?.offsetWidth || 800;
    const h = boardSystem.playfieldEl?.offsetHeight || 800;
    const x = w - d.x - CARD_W;
    const y = h - d.y - CARD_H;
    cardStateSystem.cards[d.cid] = {
      cid: d.cid,
      owner: 'opp',
      isDon: true,
      faceDown: false,
      tapped: false,
      rotation: 0,
      inHand: false,
      x,
      y,
      data: {
        name: 'DON!!',
        id: 'don',
        art: '#3a2a00',
        type: '',
        cost: 0,
        power: 0,
        rarity: '',
        color: '',
        effect: '',
      },
    };
  }

  handleRemoteDonMove(d: any) {
    const c = cardStateSystem.cards[d.cid];
    if (!c) return;
    const w = boardSystem.playfieldEl?.offsetWidth || 800;
    const h = boardSystem.playfieldEl?.offsetHeight || 800;
    c.x = w - d.x - CARD_W;
    c.y = h - d.y - CARD_H;
  }

  handleRemoteDonTap(d: any) {
    const c = cardStateSystem.cards[d.cid];
    if (!c) return;
    c.tapped = d.tapped;
  }

  handleRemoteDonRemove(d: any) {
    if (cardStateSystem.cards[d.cid]) delete cardStateSystem.cards[d.cid];
  }
}

export const donSystem = new DonSystem();
