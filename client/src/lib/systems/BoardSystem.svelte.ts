/**
 * Board System — DOM refs, board geometry, snapping & resize handling.
 *
 * Holds the singleton state that was previously scattered across +page.svelte:
 *   - playfieldEl (DOM ref via bind:this)
 *   - boardScale (zoom level)
 *   - BOARD_ZONES / BOARD_SIZE / CARD_W / CARD_H / PHASES constants
 *   - getBoardRect / screenToPlayfield / toBoardPt / getZoneCardPos / findZoneAt
 *   - snapCard / setZoneHL / getDefaultZone / getDefaultCardPos / toggleSnap
 *   - rescaleAllCardsToNewBoardRect / onPlayfieldResize (ResizeObserver bridge)
 *   - getZoneStyle (for SVG zone overlay)
 *
 * [OPT-3] boardRect cache lives here — invalidated on resize, recomputed lazily.
 */
import type { Zone } from '$lib/types';
import { cardStateSystem } from './CardStateSystem.svelte';

export const BOARD_SIZE = 800;
export const CARD_W = 74;
export const CARD_H = 103;
export const PHASES = ['Refresh', 'Draw', 'DON!!', 'Main', 'Battle', 'End'];

/** Default board-zone layout — used as the initial seed for boardSystem.zones
 *  and as the "reset to defaults" baseline for the Board Settings panel. */
export const DEFAULT_BOARD_ZONES: Zone[] = [
  { id: 'opp-trash', side: 'opp', label: 'TRASH', x: 52, y: 49, w: 87, h: 114, snap: 'center' },
  { id: 'opp-deck', side: 'opp', label: 'DECK', x: 52, y: 167, w: 87, h: 114, snap: 'center', count: true },
  { id: 'opp-stage', side: 'opp', label: 'STAGE', x: 162, y: 167, w: 85, h: 114, snap: 'center' },
  { id: 'opp-leader', side: 'opp', label: 'LEADER', x: 272, y: 167, w: 86, h: 114, snap: 'center' },
  { id: 'opp-cost', side: 'opp', label: 'COST', x: 203, y: 49, w: 403, h: 111, snap: 'grid', cols: 5, rows: 1 },
  { id: 'opp-character', side: 'opp', label: 'CHARACTER', x: 52, y: 287, w: 539, h: 110, snap: 'grid', cols: 5, rows: 1 },
  { id: 'opp-life', side: 'opp', label: 'LIFE', x: 629, y: 183, w: 120, h: 214, snap: 'center' },
  { id: 'opp-don-deck', side: 'opp', label: 'DON!!', x: 662, y: 49, w: 87, h: 124, snap: 'center' },
  { id: 'you-life', side: 'you', label: 'LIFE', x: 52, y: 406, w: 120, h: 213, snap: 'center' },
  { id: 'you-character', side: 'you', label: 'CHARACTER', x: 202, y: 406, w: 547, h: 111, snap: 'grid', cols: 5, rows: 1 },
  { id: 'you-leader', side: 'you', label: 'LEADER', x: 443, y: 522, w: 86, h: 115, snap: 'center' },
  { id: 'you-stage', side: 'you', label: 'STAGE', x: 553, y: 522, w: 86, h: 115, snap: 'center' },
  { id: 'you-deck', side: 'you', label: 'DECK', x: 663, y: 522, w: 86, h: 115, snap: 'center', count: true },
  { id: 'you-trash', side: 'you', label: 'TRASH', x: 663, y: 642, w: 86, h: 113, snap: 'center' },
  { id: 'you-cost', side: 'you', label: 'COST', x: 195, y: 641, w: 405, h: 116, snap: 'grid', cols: 5, rows: 1 },
  { id: 'you-don-deck', side: 'you', label: 'DON!!', x: 52, y: 629, w: 91, h: 124, snap: 'center' },
];

/** @deprecated Use `boardSystem.zones` (reactive) or `DEFAULT_BOARD_ZONES` (defaults).
 *  Kept as a snapshot for backwards compatibility with code that hasn't migrated yet. */
export const BOARD_ZONES: Zone[] = DEFAULT_BOARD_ZONES;

export interface BoardRect {
  scale: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

class BoardSystem {
  // DOM ref — assigned by +page.svelte via boardSystem.playfieldEl = el (or bind:this)
  playfieldEl = $state<HTMLElement | undefined>(undefined);
  boardScale = $state(1);
  snapOn = $state(true);

  // ── Live zone layout (mutable, reactive) ──
  // Initialized from DEFAULT_BOARD_ZONES; may be overwritten at runtime by
  // BoardSettingsSystem.load() (from localStorage) or by the Board Settings panel.
  zones = $state<Zone[]>(DEFAULT_BOARD_ZONES.map(z => ({ ...z })));

  // ── Default zone mapping per card type ──
  // Controls which zone a freshly spawned card lands in (see getDefaultZone).
  defaultZoneMap = $state<Record<string, string>>({
    Leader: 'you-leader',
    Stage: 'you-stage',
    Event: 'you-cost',
    Character: 'you-character',
  });

  // [OPT-3] cached board rect — invalidated on resize
  private _cachedBoardRect: BoardRect | null = null;
  private _computeBoardRect(): BoardRect {
    if (!this.playfieldEl)
      return { scale: 1, left: 0, top: 0, width: BOARD_SIZE, height: BOARD_SIZE };
    // NOTE: boardScale (zoom) is handled via CSS transform on #playfield.
    // Card/zone coordinates are always in "pre-scale" board space — do NOT multiply by boardScale here.
    const scale = Math.min(
      (this.playfieldEl.clientWidth || BOARD_SIZE) / BOARD_SIZE,
      (this.playfieldEl.clientHeight || BOARD_SIZE) / BOARD_SIZE
    );
    const width = BOARD_SIZE * scale;
    const height = BOARD_SIZE * scale;
    return {
      scale,
      width,
      height,
      left: ((this.playfieldEl.clientWidth || BOARD_SIZE) - width) / 2,
      top: ((this.playfieldEl.clientHeight || BOARD_SIZE) - height) / 2,
    };
  }

  getBoardRect(): BoardRect {
    if (this._cachedBoardRect) return this._cachedBoardRect;
    this._cachedBoardRect = this._computeBoardRect();
    return this._cachedBoardRect;
  }

  /** Convert viewport (screen) coords → unscaled #playfield coords (accounts for boardScale). */
  screenToPlayfield(clientX: number, clientY: number) {
    if (!this.playfieldEl) return { x: clientX, y: clientY };
    const pfr = this.playfieldEl.getBoundingClientRect();
    return {
      x: (clientX - pfr.left) / this.boardScale,
      y: (clientY - pfr.top) / this.boardScale,
    };
  }

  toBoardPt(px: number, py: number) {
    const b = this.getBoardRect();
    return { x: (px - b.left) / b.scale, y: (py - b.top) / b.scale };
  }

  getZoneCardPos(zone: Zone, boardX: number | null = null, boardY: number | null = null) {
    const b = this.getBoardRect();
    let cx = zone.x + zone.w / 2;
    let cy = zone.y + zone.h / 2;
    if (zone.snap === 'grid') {
      const cols = zone.cols || 1;
      const rows = zone.rows || 1;
      const relX = Math.max(0, Math.min(zone.w - 1, (boardX ?? cx) - zone.x));
      const relY = Math.max(0, Math.min(zone.h - 1, (boardY ?? cy) - zone.y));
      const col = Math.min(cols - 1, Math.max(0, Math.floor(relX / (zone.w / cols))));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(relY / (zone.h / rows))));
      cx = zone.x + (col + 0.5) * (zone.w / cols);
      cy = zone.y + (row + 0.5) * (zone.h / rows);
    }
    return {
      x: Math.round(b.left + cx * b.scale - CARD_W / 2),
      y: Math.round(b.top + cy * b.scale - CARD_H / 2),
    };
  }

  findZoneAt(px: number, py: number, side = 'you') {
    const p = this.toBoardPt(px, py);
    return (
      this.zones.find(
        z => z.side === side && p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h
      ) || null
    );
  }

  snapCard(cid: string, x: number, y: number) {
    if (!this.snapOn) return { x, y, zone: null };
    const zone = this.findZoneAt(x + CARD_W / 2, y + CARD_H / 2, 'you');
    if (!zone) {
      const c = cardStateSystem.cards[cid];
      if (c) c.zoneId = undefined;
      return { x, y, zone: null };
    }
    // life zones have no magnetic snap — leave position, just tag zoneId
    if (zone.id === 'you-life' || zone.id === 'opp-life') {
      const c = cardStateSystem.cards[cid];
      if (c) c.zoneId = zone.id;
      return { x, y, zone };
    }
    const bp = this.toBoardPt(x + CARD_W / 2, y + CARD_H / 2);
    const pos = this.getZoneCardPos(zone, bp.x, bp.y);
    const c = cardStateSystem.cards[cid];
    if (c) c.zoneId = zone.id;
    return { ...pos, zone };
  }

  setZoneHL(zone: Zone | null) {
    document.querySelectorAll<HTMLElement>('.zone').forEach(el => {
      el.classList.toggle('drag-over', !!zone && el.dataset.zoneId === zone.id);
    });
  }

  getDefaultZone(data: { type: string }) {
    return this.defaultZoneMap[data.type] || 'you-character';
  }

  getDefaultCardPos(data: { type: string }) {
    const zoneId = this.getDefaultZone(data);
    const zone = this.zones.find(z => z.id === zoneId);
    if (zone) return this.getZoneCardPos(zone);
    return {
      x: (this.playfieldEl?.offsetWidth || 800) / 2 - CARD_W / 2,
      y: (this.playfieldEl?.offsetHeight || 800) * 0.68,
    };
  }

  toggleSnap() {
    this.snapOn = !this.snapOn;
  }

  // ── Resize handling ──
  // Cards store x/y as pixel offsets in the *current* #playfield size.
  // When the playfield is resized (window zoom / layout change), those pixels no
  // longer match the board layout. We translate them back to board space using the
  // *previous* rect, then re-project to pixels using the new rect.
  lastBoardRect: { scale: number; left: number; top: number } | null = null;
  resizeObserver: ResizeObserver | null = null;
  resizeRafId: number | null = null;

  rescaleAllCardsToNewBoardRect() {
    const newRect = this.getBoardRect();
    if (!this.lastBoardRect) {
      this.lastBoardRect = newRect;
      return;
    }
    const old = this.lastBoardRect;
    const changed =
      Math.abs(old.scale - newRect.scale) > 0.0001 ||
      Math.abs(old.left - newRect.left) > 0.0001 ||
      Math.abs(old.top - newRect.top) > 0.0001;
    if (!changed) {
      this.lastBoardRect = newRect;
      return;
    }

    for (const card of Object.values(cardStateSystem.cards)) {
      if (card.x == null || card.y == null) continue;
      const cxPx = card.x + CARD_W / 2;
      const cyPx = card.y + CARD_H / 2;
      const boardX = (cxPx - old.left) / old.scale;
      const boardY = (cyPx - old.top) / old.scale;
      card.x = Math.round(newRect.left + boardX * newRect.scale - CARD_W / 2);
      card.y = Math.round(newRect.top + boardY * newRect.scale - CARD_H / 2);
    }
    this.lastBoardRect = newRect;
  }

  onPlayfieldResize() {
    if (this.resizeRafId != null) cancelAnimationFrame(this.resizeRafId);
    this._cachedBoardRect = null; // [OPT-3] invalidate
    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = null;
      this.rescaleAllCardsToNewBoardRect();
    });
  }

  /** Public helper to invalidate the cached board rect.
   *  Used by BoardSettingsSystem.load() to force fresh geometry after
   *  the locked-down layout is applied on mount. */
  invalidateBoardRect() {
    this._cachedBoardRect = null;
  }

  /** SVG / HTML zone overlay style string. */
  getZoneStyle(zone: Zone) {
    const b = this.getBoardRect();
    return `left:${Math.round(b.left + zone.x * b.scale)}px;top:${Math.round(
      b.top + zone.y * b.scale
    )}px;width:${Math.round(zone.w * b.scale)}px;height:${Math.round(zone.h * b.scale)}px`;
  }
}

export const boardSystem = new BoardSystem();
