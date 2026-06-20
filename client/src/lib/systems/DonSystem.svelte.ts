/**
 * DON!! System — spawn DON cards, attach/detach to Leader/Character,
 * return-all-to-cost, and remote (opp) DON handlers.
 *
 * Don attach state lives in cardStateSystem (donAttachMap / donAttachPicking);
 * this system owns the operations.
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
      spawning: true,
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
    networkingSystem.send('don_card_spawn', { cid, cardId: 'don', x: px, y: py });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = cardStateSystem.cards[cid];
        if (c) c.spawning = false;
      });
    });
  }

  /** Compute staircase position for a DON attached to a target card. */
  calcAttachedDonPos(targetCid: string, donCid: string): { x: number; y: number } | null {
    const target = cardStateSystem.cards[targetCid];
    if (!target || target.x == null || target.y == null) return null;
    const siblings = cardStateSystem.getDonsAttachedTo(targetCid);
    const idx = siblings.indexOf(donCid);
    if (idx === -1) return null;
    return {
      x: (target.x || 0) + cardStateSystem.DON_ATTACH_OFFSET_X * (idx + 1),
      y: (target.y || 0) + CARD_H - cardStateSystem.DON_ATTACH_OFFSET_Y * (idx + 1),
    };
  }

  syncDonPositionsForTarget(targetCid: string) {
    const donCids = cardStateSystem.getDonsAttachedTo(targetCid);
    donCids.forEach(donCid => {
      const pos = this.calcAttachedDonPos(targetCid, donCid);
      if (!pos) return;
      const don = cardStateSystem.cards[donCid];
      if (!don) return;
      don.x = pos.x;
      don.y = pos.y;
      if (don.owner === 'mine')
        networkingSystem.send('don_card_move', { cid: donCid, x: pos.x, y: pos.y });
    });
  }

  startDonAttach(donCid: string) {
    cardStateSystem.donAttachPicking = donCid;
    gameCycleSystem.addLog('คลิกที่การ์ด Leader หรือ Character เพื่อแปะ DON!!', 'system');
  }

  finishDonAttach(targetCid: string) {
    const donCid = cardStateSystem.donAttachPicking;
    if (!donCid) return;
    cardStateSystem.donAttachPicking = null;

    const don = cardStateSystem.cards[donCid];
    const target = cardStateSystem.cards[targetCid];
    if (!don || !target) return;

    // Detach from previous target if any
    if (cardStateSystem.donAttachMap[donCid]) {
      delete cardStateSystem.donAttachMap[donCid];
      cardStateSystem.donAttachMap = { ...cardStateSystem.donAttachMap };
    }

    cardStateSystem.donAttachMap = { ...cardStateSystem.donAttachMap, [donCid]: targetCid };

    const pos = this.calcAttachedDonPos(targetCid, donCid);
    if (pos) {
      don.x = pos.x;
      don.y = pos.y;
      if (don.owner === 'mine') {
        networkingSystem.send('don_card_move', { cid: donCid, x: pos.x, y: pos.y });
        networkingSystem.send('don_attach', { donCid, targetCid });
      }
    }

    const targetName = target.data?.name || targetCid;
    gameCycleSystem.addLog(`แปะ DON!! กับ: ${targetName}`, 'you');
  }

  detachDon(donCid: string) {
    const oldTarget = cardStateSystem.detachDon(donCid);
    if (oldTarget === null) return;
    this.syncDonPositionsForTarget(oldTarget);
    if (cardStateSystem.cards[donCid]?.owner === 'mine')
      networkingSystem.send('don_detach', { donCid });
    gameCycleSystem.addLog('ถอด DON!! ออกจากการ์ด', 'you');
  }

  cancelDonAttach() {
    cardStateSystem.donAttachPicking = null;
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

    // Detach all
    const newMap = { ...cardStateSystem.donAttachMap };
    myDons.forEach(don => {
      delete newMap[don.cid];
    });
    cardStateSystem.donAttachMap = newMap;

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
      spawning: true,
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = cardStateSystem.cards[d.cid];
        if (c) c.spawning = false;
      });
    });
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

  handleRemoteDonAttach(d: any) {
    const { donCid, targetCid } = d;
    if (cardStateSystem.donAttachMap[donCid]) {
      const newMap = { ...cardStateSystem.donAttachMap };
      delete newMap[donCid];
      cardStateSystem.donAttachMap = newMap;
    }
    cardStateSystem.donAttachMap = { ...cardStateSystem.donAttachMap, [donCid]: targetCid };
  }

  handleRemoteDonDetach(d: any) {
    const { donCid } = d;
    if (!cardStateSystem.donAttachMap[donCid]) return;
    const newMap = { ...cardStateSystem.donAttachMap };
    delete newMap[donCid];
    cardStateSystem.donAttachMap = newMap;
  }
}

export const donSystem = new DonSystem();
