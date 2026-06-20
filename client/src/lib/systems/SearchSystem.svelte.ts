/**
 * Search System — overlays for "peek top N", "search whole deck", "search
 * trash", and "scry X + reorder".  All overlays are local-only — the opponent
 * only sees deck_count / hand_count deltas, never card identities.
 *
 * Holds overlay UI state ($state) + entry data + the operations themselves.
 */
import type { CardData } from '../types';
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { cardDatabaseSystem } from './CardDatabaseSystem.svelte';
import { boardSystem, CARD_W, CARD_H } from './BoardSystem.svelte';
import { deckSystem } from './DeckSystem.svelte';
import { cardActionsSystem } from './CardActionsSystem.svelte';

interface SearchEntry {
  uid: string;
  cardId: string;
  data: CardData;
}
interface DeckSearchEntry extends SearchEntry {
  idx: number;
}

class SearchSystem {
  // ── Search N (top-N peek) ──
  searchVisible = $state(false);
  searchCount = $state(0);
  searchCards = $state<SearchEntry[]>([]);

  // ── Search Deck (whole deck) ──
  deckSearchVisible = $state(false);
  deckSearchCards = $state<DeckSearchEntry[]>([]);
  deckSearchSelected = $state<Set<string>>(new Set());
  deckSearchQuery = $state('');
  deckSearchPickCount = $state(1);

  // ── Search Trash ──
  trashSearchVisible = $state(false);
  trashSearchQuery = $state('');

  // ── Scry X (peek + reorder) ──
  scryVisible = $state(false);
  scryCards = $state<SearchEntry[]>([]);
  scryCount = $state(3);
  scryDragIdx = $state<number | null>(null);
  scryDropIdx = $state<number | null>(null);

  // internal uid counter shared by all search variants
  private seq = 0;

  // ════════════════════════════════════════════════
  //   SEARCH N (top-N peek)
  // ════════════════════════════════════════════════
  startSearch(n: number) {
    if (!gameCycleSystem.myDeck.length) {
      gameCycleSystem.addLog('สำรับหมด!', 'system');
      return;
    }
    const take = Math.min(n, gameCycleSystem.myDeck.length);
    const picked: SearchEntry[] = [];
    for (let i = 0; i < take; i++) {
      const cardId = gameCycleSystem.myDeck.pop()!;
      const data = cardDatabaseSystem.cardMap[cardId];
      if (!data) continue;
      picked.push({ uid: 'srch' + this.seq++, cardId, data });
    }
    this.searchCards = picked; // picked[0] = topmost of the group
    this.searchCount = n;
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncDeckState();
    this.searchVisible = true;
    gameCycleSystem.addLog(
      `Search ${n}: เปิดดูการ์ดบนสุด ${picked.length} ใบ (เห็นแค่เราคนเดียว)`,
      'you'
    );
  }

  pickFromSearch(uid: string) {
    const idx = this.searchCards.findIndex(c => c.uid === uid);
    if (idx === -1) return;
    const item = this.searchCards[idx];
    const cid = cardStateSystem.createCardState(item.data, false, 'mine', null, networkingSystem.isHost);
    cardStateSystem.cards[cid].inHand = true;
    gameCycleSystem.myHand.push(cid);
    gameCycleSystem.myHandCount = gameCycleSystem.myHand.length;
    deckSystem.updateHandCount();
    networkingSystem.send('draw', {});
    networkingSystem.syncHandState();
    this.searchCards = this.searchCards.filter(c => c.uid !== uid);
    gameCycleSystem.addLog(`Search: เลือกเข้ามือ — ${item.data.name}`, 'you');
    if (!this.searchCards.length) this.searchVisible = false;
  }

  resolveSearch(mode: 'bottom' | 'trash') {
    const remaining = this.searchCards;
    if (!remaining.length) {
      this.closeSearch();
      return;
    }
    if (mode === 'bottom') {
      gameCycleSystem.myDeck = [
        ...remaining.slice().reverse().map(c => c.cardId),
        ...gameCycleSystem.myDeck,
      ];
      gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
      networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
      networkingSystem.syncDeckState();
      gameCycleSystem.addLog(`Search: เก็บที่เหลือ ${remaining.length} ใบไว้ใต้กอง`, 'you');
    } else {
      const trashZone = boardSystem.zones.find(z => z.id === 'you-trash')!;
      remaining.forEach(item => {
        const pos = boardSystem.getZoneCardPos(trashZone);
        const cid = cardStateSystem.createCardState(item.data, false, 'mine', null, networkingSystem.isHost);
        const c = cardStateSystem.cards[cid];
        c.x = pos.x;
        c.y = pos.y;
        c.zoneId = 'you-trash';
        c.inHand = false;
        if (!gameCycleSystem.myTrash.includes(item.data.id))
          gameCycleSystem.myTrash.push(item.data.id);
        networkingSystem.send('card_spawn', {
          cid,
          cardId: item.data.id,
          x: pos.x,
          y: pos.y,
          faceDown: false,
          zoneId: 'you-trash',
        });
      });
      networkingSystem.syncTrash();
      gameCycleSystem.addLog(`Search: ทิ้งที่เหลือ ${remaining.length} ใบลงสุสาน`, 'you');
    }
    this.closeSearch();
  }

  closeSearch() {
    this.searchVisible = false;
    this.searchCards = [];
  }

  // ════════════════════════════════════════════════
  //   SEARCH DECK (whole-deck search, pick N)
  // ════════════════════════════════════════════════
  startSearchDeck(pickCount: number) {
    if (!gameCycleSystem.myDeck.length) {
      gameCycleSystem.addLog('สำรับหมด!', 'system');
      return;
    }
    const all: DeckSearchEntry[] = [];
    for (let i = gameCycleSystem.myDeck.length - 1; i >= 0; i--) {
      const cardId = gameCycleSystem.myDeck[i];
      const data = cardDatabaseSystem.cardMap[cardId];
      if (!data) continue;
      all.push({ uid: `ds${this.seq++}`, cardId, idx: i, data });
    }
    this.deckSearchCards = all;
    this.deckSearchSelected = new Set();
    this.deckSearchQuery = '';
    this.deckSearchPickCount = pickCount;
    this.deckSearchVisible = true;
    gameCycleSystem.addLog(
      `Search Deck: เปิดดูกองทั้งหมด ${all.length} ใบ (เห็นแค่เราคนเดียว)`,
      'you'
    );
  }

  toggleDeckSearchCard(uid: string) {
    const next = new Set(this.deckSearchSelected);
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      if (next.size >= this.deckSearchPickCount) {
        // Replace oldest selection when quota is full
        const first = next.values().next().value as string;
        next.delete(first);
      }
      next.add(uid);
    }
    this.deckSearchSelected = next;
  }

  confirmDeckSearch() {
    if (!this.deckSearchSelected.size) {
      this.closeDeckSearch();
      return;
    }
    const selectedItems = this.deckSearchCards.filter(c => this.deckSearchSelected.has(c.uid));
    const indices = selectedItems.map(c => c.idx).sort((a, b) => b - a);
    indices.forEach(idx => {
      gameCycleSystem.myDeck.splice(idx, 1);
    });
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncDeckState();

    selectedItems.forEach(item => {
      const cid = cardStateSystem.createCardState(item.data, false, 'mine', null, networkingSystem.isHost);
      cardStateSystem.cards[cid].inHand = true;
      gameCycleSystem.myHand.push(cid);
      networkingSystem.send('draw', {});
    });
    gameCycleSystem.myHandCount = gameCycleSystem.myHand.length;
    deckSystem.updateHandCount();
    networkingSystem.syncHandState();
    deckSystem.shuffleDeck();
    gameCycleSystem.addLog(
      `Search Deck: เลือก ${selectedItems.length} ใบเข้ามือ — ${selectedItems
        .map(c => c.data.name)
        .join(', ')}`,
      'you'
    );
    this.closeDeckSearch();
  }

  closeDeckSearch() {
    this.deckSearchVisible = false;
    this.deckSearchCards = [];
    this.deckSearchSelected = new Set();
    this.deckSearchQuery = '';
  }

  getDeckSearchFiltered() {
    const q = this.deckSearchQuery.toLowerCase().trim();
    if (!q) return this.deckSearchCards;
    return this.deckSearchCards.filter(
      c =>
        c.data.name.toLowerCase().includes(q) ||
        c.data.type.toLowerCase().includes(q) ||
        c.data.color.toLowerCase().includes(q) ||
        c.data.effect.toLowerCase().includes(q) ||
        c.cardId.toLowerCase().includes(q)
    );
  }

  // ════════════════════════════════════════════════
  //   SEARCH TRASH
  // ════════════════════════════════════════════════
  openTrashSearch() {
    if (!gameCycleSystem.myTrash.length) {
      gameCycleSystem.addLog('สุสานยังไม่มีการ์ด!', 'system');
      return;
    }
    this.trashSearchQuery = '';
    this.trashSearchVisible = true;
    gameCycleSystem.addLog(
      `Search Trash: เปิดดูสุสาน ${gameCycleSystem.myTrash.length} ใบ (เห็นแค่เราคนเดียว)`,
      'you'
    );
  }

  getTrashSearchEntries() {
    return Object.values(cardStateSystem.cards)
      .filter(c => c.owner === 'mine' && c.zoneId === 'you-trash' && !c.inHand)
      .map(c => ({ cid: c.cid, cardId: c.data.id, data: c.data }));
  }

  getTrashSearchFiltered() {
    const all = this.getTrashSearchEntries();
    const q = this.trashSearchQuery.toLowerCase().trim();
    if (!q) return all;
    return all.filter(
      c =>
        c.data.name.toLowerCase().includes(q) ||
        c.data.type.toLowerCase().includes(q) ||
        c.data.color.toLowerCase().includes(q) ||
        c.data.effect.toLowerCase().includes(q) ||
        c.cardId.toLowerCase().includes(q)
    );
  }

  pickFromTrashSearch(cid: string, cardId: string) {
    const idx = gameCycleSystem.myTrash.indexOf(cardId);
    if (idx !== -1) gameCycleSystem.myTrash.splice(idx, 1);
    networkingSystem.syncTrash();
    cardActionsSystem.doToHand(cid);
    if (!gameCycleSystem.myTrash.length) this.trashSearchVisible = false;
  }

  closeTrashSearch() {
    this.trashSearchVisible = false;
    this.trashSearchQuery = '';
  }

  // ════════════════════════════════════════════════
  //   SCRY X (peek top N + reorder)
  // ════════════════════════════════════════════════
  startScry(n: number) {
    if (!gameCycleSystem.myDeck.length) {
      gameCycleSystem.addLog('สำรับหมด!', 'system');
      return;
    }
    const take = Math.min(n, gameCycleSystem.myDeck.length);
    const picked: SearchEntry[] = [];
    for (let i = 0; i < take; i++) {
      const cardId = gameCycleSystem.myDeck.pop()!;
      const data = cardDatabaseSystem.cardMap[cardId];
      if (!data) {
        gameCycleSystem.myDeck.push(cardId);
        continue;
      }
      picked.push({ uid: `scry${this.seq++}`, cardId, data });
    }
    this.scryCards = picked;
    this.scryCount = take;
    this.scryDragIdx = null;
    this.scryDropIdx = null;
    this.scryVisible = true;
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncDeckState();
    gameCycleSystem.addLog(
      `Scry ${take}: มองการ์ดบนสุด ${take} ใบ (เห็นแค่เราคนเดียว)`,
      'you'
    );
  }

  scryDragStart(idx: number) {
    this.scryDragIdx = idx;
  }
  scryDragEnter(idx: number) {
    this.scryDropIdx = idx;
  }
  scryDragEnd() {
    if (
      this.scryDragIdx !== null &&
      this.scryDropIdx !== null &&
      this.scryDragIdx !== this.scryDropIdx
    ) {
      const arr = [...this.scryCards];
      const [moved] = arr.splice(this.scryDragIdx, 1);
      arr.splice(this.scryDropIdx, 0, moved);
      this.scryCards = arr;
    }
    this.scryDragIdx = null;
    this.scryDropIdx = null;
  }

  scryMove(idx: number, dir: -1 | 1) {
    const arr = [...this.scryCards];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    this.scryCards = arr;
  }

  scryToBottom(idx: number) {
    const arr = [...this.scryCards];
    const [item] = arr.splice(idx, 1);
    arr.push(item);
    this.scryCards = arr;
  }

  confirmScry() {
    // Push back in chosen order: scryCards[0] = topmost
    for (let i = this.scryCards.length - 1; i >= 0; i--) {
      gameCycleSystem.myDeck.push(this.scryCards[i].cardId);
    }
    gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
    networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
    networkingSystem.syncDeckState();
    gameCycleSystem.addLog(
      `Scry: จัดลำดับแล้ว ${this.scryCards.length} ใบ (ใบบนสุด = ${this.scryCards[0]?.data.name})`,
      'you'
    );
    this.closeScry();
  }

  closeScry() {
    // Closing without confirm → restore cards in original order
    if (this.scryCards.length) {
      for (let i = this.scryCards.length - 1; i >= 0; i--) {
        gameCycleSystem.myDeck.push(this.scryCards[i].cardId);
      }
      gameCycleSystem.myDeckCount = gameCycleSystem.myDeck.length;
      networkingSystem.send('deck_count', { count: gameCycleSystem.myDeck.length });
      networkingSystem.syncDeckState();
    }
    this.scryVisible = false;
    this.scryCards = [];
    this.scryDragIdx = null;
    this.scryDropIdx = null;
  }
}

export const searchSystem = new SearchSystem();
