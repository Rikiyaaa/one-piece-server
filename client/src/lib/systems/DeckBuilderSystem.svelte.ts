/**
 * Deck Builder System — lobby deck-builder state + saved-deck CRUD.
 *
 * Holds:
 *   - dbOpen / dbSearch / dbSearchTerm / dbFilterType / dbFilterColor (UI state)
 *   - dbLeader / dbCards / dbDonCount (current builder content)
 *   - dbPage (pagination)
 *   - savedDecks / activeDeckId / selectedDeckId / deckPickerOpen
 *   - deckSaving / deckSaveMsg / deckSaveMsgType
 *   - lobbyDeckSummary (display string)
 *   - All API helpers (apiDecks / loadSavedDecks / saveDeckToServer / etc.)
 *   - Derived views: filteredPool / totalPages / pagedPool / sortedList
 */
import type { CardData } from '../types';
import { cardDatabaseSystem } from './CardDatabaseSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';

export interface SavedDeck {
  _id: string;
  name: string;
  leader: string;
  cards: string[];
  donCount: number;
  updatedAt: string;
}

const DB_PAGE_SIZE = 20;

class DeckBuilderSystem {
  dbOpen = $state(false);
  dbSearch = $state('');
  dbSearchTerm = $state('');
  dbFilterType = $state('');
  dbFilterColor = $state('');
  dbLeader = $state<CardData | null>(null);
  dbCards = $state<Record<string, number>>({});
  dbDonCount = $state(10);
  dbPage = $state(1);

  savedDecks = $state<SavedDeck[]>([]);
  activeDeckId = $state<string | null>(null);
  selectedDeckId = $state<string | null>(null);
  deckPickerOpen = $state(false);
  deckSaving = $state(false);
  deckSaveMsg = $state('');
  deckSaveMsgType = $state<'ok' | 'err'>('ok');

  lobbyDeckSummary = $state('ยังไม่ได้เลือก deck');

  showDeckMsg(msg: string, type: 'ok' | 'err' = 'ok') {
    this.deckSaveMsg = msg;
    this.deckSaveMsgType = type;
    setTimeout(() => {
      this.deckSaveMsg = '';
    }, 3000);
  }

  async apiDecks(method: string, path: string, body?: any) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${networkingSystem.getApiBase()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      window.location.href = '/login';
    }
    return res;
  }

  async loadSavedDecks() {
    try {
      const res = await this.apiDecks('GET', '/api/decks');
      if (res.ok) this.savedDecks = await res.json();
    } catch {}
  }

  async saveDeckToServer(deckName: string): Promise<boolean> {
    if (this.dbTotal() !== 50) {
      this.showDeckMsg(`กองหลักต้องครบ 50 ใบ (ปัจจุบัน ${this.dbTotal()})`, 'err');
      return false;
    }
    if (!this.dbLeader) {
      this.showDeckMsg('ยังไม่ได้เลือก Leader', 'err');
      return false;
    }
    const payload = {
      name: deckName,
      leader: this.dbLeader.id,
      cards: Object.entries(this.dbCards).flatMap(([id, cnt]) => Array(cnt).fill(id)),
      donCount: this.dbDonCount,
    };
    this.deckSaving = true;
    try {
      let res: Response;
      if (this.activeDeckId) {
        res = await this.apiDecks('PUT', `/api/decks/${this.activeDeckId}`, payload);
      } else {
        res = await this.apiDecks('POST', '/api/decks', payload);
      }
      if (res.ok) {
        const deck = await res.json();
        this.activeDeckId = deck._id;
        await this.loadSavedDecks();
        this.showDeckMsg('บันทึกเด็คสำเร็จ ✓', 'ok');
        this.applyDeckToLobby();
        this.dbOpen = false;
        return true;
      } else {
        const err = await res.json();
        this.showDeckMsg(err.message || 'บันทึกไม่สำเร็จ', 'err');
        return false;
      }
    } catch {
      this.showDeckMsg('เชื่อมต่อ server ไม่ได้', 'err');
      return false;
    } finally {
      this.deckSaving = false;
    }
  }

  async deleteSavedDeck(id: string) {
    if (!confirm('ลบเด็คนี้?')) return;
    try {
      const res = await this.apiDecks('DELETE', `/api/decks/${id}`);
      if (res.ok) {
        await this.loadSavedDecks();
        if (this.selectedDeckId === id) {
          this.selectedDeckId = null;
          this.dbLeader = null;
          this.dbCards = {};
          this.lobbyDeckSummary = 'ยังไม่ได้เลือก deck';
        }
        if (this.activeDeckId === id) this.activeDeckId = null;
      }
    } catch {}
  }

  loadDeckIntoBuilder(deck: SavedDeck) {
    const leader = cardDatabaseSystem.cardDb.find((c: CardData) => c.id === deck.leader) || null;
    this.dbLeader = leader;
    const counts: Record<string, number> = {};
    deck.cards.forEach((id: string) => {
      counts[id] = (counts[id] || 0) + 1;
    });
    this.dbCards = counts;
    this.dbDonCount = deck.donCount ?? 10;
    this.activeDeckId = deck._id;
    this.dbOpen = true;
    this.deckPickerOpen = false;
  }

  selectDeckToPlay(deck: SavedDeck) {
    const leader = cardDatabaseSystem.cardDb.find((c: CardData) => c.id === deck.leader) || null;
    this.dbLeader = leader;
    const counts: Record<string, number> = {};
    deck.cards.forEach((id: string) => {
      counts[id] = (counts[id] || 0) + 1;
    });
    this.dbCards = counts;
    this.dbDonCount = deck.donCount ?? 10;
    this.activeDeckId = deck._id;
    this.selectedDeckId = deck._id;
    this.applyDeckToLobby();
    this.deckPickerOpen = false;
  }

  getLeaderLife(leader: any): number {
    if (!leader) return 5;
    const lifeField = parseInt(String(leader.life ?? ''));
    if (lifeField >= 1 && lifeField <= 8) return lifeField;
    const costField = parseInt(String(leader.cost ?? ''));
    if (costField >= 1 && costField <= 8) return costField;
    return 5;
  }

  applyDeckToLobby() {
    if (!this.dbLeader) return;
    const tc: Record<string, number> = {};
    Object.entries(this.dbCards).forEach(([id, cnt]) => {
      const d = cardDatabaseSystem.cardMap[id];
      if (d) tc[d.type] = (tc[d.type] || 0) + cnt;
    });
    const parts = Object.entries(tc)
      .map(([t, n]) => `${t}×${n}`)
      .join(' · ');
    const lifeCount = this.getLeaderLife(this.dbLeader);
    this.lobbyDeckSummary = `Leader:${this.dbLeader?.name || 'ไม่มี'} · Life:${lifeCount} · DON!!:${this.dbDonCount} · ${parts}`;
  }

  dbTotal() {
    return Object.values(this.dbCards).reduce((s, n) => s + n, 0);
  }

  async openDB() {
    await cardDatabaseSystem.loadCardDB((msg, side) => gameCycleSystem_addLog(msg, side));
    this.dbOpen = true;
  }

  async openNewDeck() {
    await cardDatabaseSystem.loadCardDB((msg, side) => gameCycleSystem_addLog(msg, side));
    this.activeDeckId = null;
    this.dbCards = {};
    this.dbLeader = null;
    this.dbDonCount = 10;
    this.dbOpen = true;
  }

  clearDB() {
    if (!confirm('ล้างเด็ค?')) return;
    this.dbCards = {};
    this.dbLeader = null;
    this.dbDonCount = 10;
  }

  clearDBLeader() {
    this.dbLeader = null;
  }

  cardIdQuotaUsed(cardId: string, excludeUid?: string): number {
    return Object.entries(this.dbCards).reduce((sum, [uid, cnt]) => {
      if (uid === excludeUid) return sum;
      const d = cardDatabaseSystem.cardMap[uid];
      return d?.cardId === cardId ? sum + cnt : sum;
    }, 0);
  }

  dbAddCard(d: CardData) {
    if (d.rarity === 'L') return;
    const quota = this.cardIdQuotaUsed(d.cardId || d.id);
    if (quota >= 4 || this.dbTotal() >= 50) return;
    this.dbCards = { ...this.dbCards, [d.id]: (this.dbCards[d.id] || 0) + 1 };
  }

  dbRemCard(d: CardData) {
    if (!(this.dbCards[d.id] > 0)) return;
    const n = this.dbCards[d.id] - 1;
    const nc = { ...this.dbCards };
    if (n <= 0) delete nc[d.id];
    else nc[d.id] = n;
    this.dbCards = nc;
  }

  /** Validate + save current builder state to server. */
  async saveDB() {
    if (this.dbTotal() !== 50) {
      this.showDeckMsg(`กองหลักต้องครบ 50 ใบ (ปัจจุบัน ${this.dbTotal()} ใบ)`, 'err');
      return;
    }
    if (!this.dbLeader) {
      this.showDeckMsg('ยังไม่ได้เลือก Leader', 'err');
      return;
    }
    if (this.dbDonCount < 1 || this.dbDonCount > 20) {
      this.showDeckMsg('DON!! ต้องใส่ระหว่าง 1–20 ใบ', 'err');
      return;
    }
    // Color check
    const leaderCols = new Set(
      String(this.dbLeader.color || '')
        .split('/')
        .map((s: string) => s.trim())
        .filter(Boolean)
    );
    const colorErrs: string[] = [];
    Object.entries(this.dbCards).forEach(([id]) => {
      const d = cardDatabaseSystem.cardMap[id];
      if (!d) return;
      const cols = String(d.color || '')
        .split('/')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (cols.length === 0) return;
      const ok = cols.some(
        (c: string) => leaderCols.has(c) || c === 'Multicolor' || c === ''
      );
      if (!ok) colorErrs.push(`"${d.name}" (${d.color})`);
    });
    if (colorErrs.length) {
      this.showDeckMsg(`สีการ์ดไม่ตรง Leader`, 'err');
      return;
    }
    // Duplicate check (by card_id, including parallel arts)
    const quotaMap: Record<string, { count: number; name: string }> = {};
    Object.entries(this.dbCards).forEach(([uid, cnt]) => {
      const d = cardDatabaseSystem.cardMap[uid];
      if (!d) return;
      const key = d.cardId || d.id;
      if (!quotaMap[key]) quotaMap[key] = { count: 0, name: d.name };
      quotaMap[key].count += cnt;
    });
    const duplErrs: string[] = [];
    Object.entries(quotaMap).forEach(([cardId, { count, name }]) => {
      if (count > 4) duplErrs.push(`${name} (${cardId}) ${count} ใบ (สูงสุด 4)`);
    });
    if (duplErrs.length) {
      this.showDeckMsg(`การ์ดซ้ำเกินกฎ`, 'err');
      return;
    }

    // Use existing name if updating, prompt if new
    let deckName = '';
    if (this.activeDeckId) {
      const existing = this.savedDecks.find(d => d._id === this.activeDeckId);
      deckName = existing?.name || 'เด็คของฉัน';
    } else {
      const input = prompt('ตั้งชื่อเด็ค (สูงสุด 5 เด็ค):', `เด็ค ${this.savedDecks.length + 1}`);
      if (!input) return;
      deckName = input.trim() || `เด็ค ${this.savedDecks.length + 1}`;
    }
    await this.saveDeckToServer(deckName);
  }

  // ── Derived views ──
  get filteredPool() {
    return cardDatabaseSystem.cardDb.filter(c => {
      const sq = this.dbSearchTerm;
      if (
        sq &&
        !c.name.toLowerCase().includes(sq) &&
        !(c.id || '').toLowerCase().includes(sq)
      )
        return false;
      if (this.dbFilterType && c.type !== this.dbFilterType) return false;
      if (this.dbFilterColor && !String(c.color || '').includes(this.dbFilterColor)) return false;
      return true;
    });
  }

  get totalPages() {
    return Math.ceil(this.filteredPool.length / DB_PAGE_SIZE);
  }

  get pagedPool() {
    return this.filteredPool.slice((this.dbPage - 1) * DB_PAGE_SIZE, this.dbPage * DB_PAGE_SIZE);
  }

  get sortedList() {
    return Object.entries(this.dbCards)
      .map(([id, cnt]) => ({ d: cardDatabaseSystem.cardMap[id], cnt }))
      .filter(e => e.d)
      .sort((a, b) => {
        const to: { [k: string]: number } = { Leader: 0, Character: 1, Event: 2, Stage: 3 };
        return (to[a.d.type] ?? 9) - (to[b.d.type] ?? 9) || (a.d.cost || 0) - (b.d.cost || 0);
      });
  }
}

// tiny inline shim to avoid circular import with GameCycleSystem
import { gameCycleSystem } from './GameCycleSystem.svelte';
function gameCycleSystem_addLog(msg: string, side: string) {
  gameCycleSystem.addLog(msg, side);
}

export const deckBuilderSystem = new DeckBuilderSystem();
