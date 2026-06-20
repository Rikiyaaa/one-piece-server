/**
 * Board Settings System — runtime-editable board zone layout + default spawn
 * mapping.
 *
 * ⚠️  LOCKED-DOWN MODE (per user request 2026-06-19):
 *     The board layout is now fixed to DEFAULT_BOARD_ZONES (defined in
 *     BoardSystem.svelte.ts) for every session. localStorage persistence is
 *     DISABLED — load() and persist() are no-ops, and any previously-stored
 *     layout under STORAGE_KEY is wiped on init to prevent regression.
 *
 *     The Board Settings panel UI is still available for live tweaking inside
 *     a session (and Reset still restores DEFAULT_BOARD_ZONES), but those
 *     tweaks will NOT survive a page refresh.
 *
 * What this owns:
 *   - isOpen  (whether the Board Settings overlay is shown)
 *   - dirty   (whether the working copy has unsaved changes — session-only)
 *   - workingZones       (editable copy of boardSystem.zones — committed on Save)
 *   - workingDefaultZoneMap (editable copy of boardSystem.defaultZoneMap)
 *   - snapshotZones / snapshotDefaultZoneMap (saved on open — restored on Cancel)
 *   - load() / persist()  (DISABLED — no-ops that also clear stale localStorage)
 *   - open() / close() / save() / cancel() / resetDefaults()
 *   - updateZone(id, field, value) / addZone() / deleteZone(id)
 *
 * Design:
 *   - On open(): take a deep clone of boardSystem.zones into workingZones and
 *     push it straight back into boardSystem.zones so the user sees live
 *     preview as they edit. Snapshot the original for Cancel.
 *   - On save(): closes the panel (no persistence — locked down).
 *   - On cancel(): restore boardSystem.zones from snapshot and close.
 *   - On resetDefaults(): overwrite workingZones with DEFAULT_BOARD_ZONES
 *     (live preview updates immediately; Save just closes the panel).
 *
 * The "spawn ต่างๆ" (various spawns) requirement is fulfilled two ways:
 *   1. Adjusting zone x/y/w/h directly moves where new cards land
 *      (because spawn helpers like getDefaultCardPos / spawnDonCard /
 *      spawnLifeCards all derive positions from zones).
 *   2. The defaultZoneMap lets the user pick *which* zone each card type
 *      (Leader / Stage / Event / Character) lands in by default.
 */
import type { Zone } from '../types';
import { boardSystem, DEFAULT_BOARD_ZONES } from './BoardSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';

const STORAGE_KEY = 'cardgame_board_settings_v1';

interface PersistedSettings {
  zones: Zone[];
  defaultZoneMap: Record<string, string>;
}

class BoardSettingsSystem {
  isOpen = $state(false);
  dirty = $state(false);

  // Working copies — what the user is editing (live-preview pushed to boardSystem)
  workingZones = $state<Zone[]>([]);
  workingDefaultZoneMap = $state<Record<string, string>>({});

  // Snapshots of the committed state — used to restore on Cancel
  private snapshotZones: Zone[] = [];
  private snapshotDefaultZoneMap: Record<string, string> = {};

  // ── Lifecycle ──
  open() {
    // Snapshot current committed state for cancel-restore
    this.snapshotZones = boardSystem.zones.map(z => ({ ...z }));
    this.snapshotDefaultZoneMap = { ...boardSystem.defaultZoneMap };
    // Working copy starts as a deep clone of the committed state
    this.workingZones = boardSystem.zones.map(z => ({ ...z }));
    this.workingDefaultZoneMap = { ...boardSystem.defaultZoneMap };
    this.dirty = false;
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  // ── Mutators (operate on workingZones / workingDefaultZoneMap, then push to boardSystem for live preview) ──
  private syncToBoard() {
    // Push the working copy to boardSystem so the board re-renders.
    // Reassigning the array triggers Svelte 5 $state reactivity.
    boardSystem.zones = this.workingZones.map(z => ({ ...z }));
    boardSystem.defaultZoneMap = { ...this.workingDefaultZoneMap };
    this.dirty = true;
  }

  updateZone(id: string, field: keyof Zone, value: any) {
    const zone = this.workingZones.find(z => z.id === id);
    if (!zone) return;
    if (field === 'x' || field === 'y' || field === 'w' || field === 'h' || field === 'cols' || field === 'rows') {
      const n = Number(value);
      (zone as any)[field] = Number.isFinite(n) ? n : 0;
    } else {
      (zone as any)[field] = value;
    }
    this.workingZones = [...this.workingZones];
    this.syncToBoard();
  }

  updateDefaultZone(cardType: string, zoneId: string) {
    this.workingDefaultZoneMap = { ...this.workingDefaultZoneMap, [cardType]: zoneId };
    this.syncToBoard();
  }

  addZone(side: 'you' | 'opp' = 'you') {
    const id = 'custom-' + Date.now().toString(36);
    const newZone: Zone = {
      id,
      side,
      label: 'NEW',
      x: 300,
      y: 300,
      w: 87,
      h: 114,
      snap: 'center',
    };
    this.workingZones = [...this.workingZones, newZone];
    this.syncToBoard();
    gameCycleSystem.addLog(`เพิ่ม zone: ${id}`, 'system');
  }

  deleteZone(id: string) {
    // Refuse to delete built-in zones that game logic depends on
    const builtinIds = new Set(DEFAULT_BOARD_ZONES.map(z => z.id));
    if (builtinIds.has(id)) {
      gameCycleSystem.addLog(`ไม่สามารถลบ zone เริ่มต้นได้: ${id}`, 'system');
      return;
    }
    this.workingZones = this.workingZones.filter(z => z.id !== id);
    // Clean up defaultZoneMap entries pointing to the deleted zone
    const nextMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.workingDefaultZoneMap)) {
      if (v !== id) nextMap[k] = v;
    }
    this.workingDefaultZoneMap = nextMap;
    this.syncToBoard();
    gameCycleSystem.addLog(`ลบ zone: ${id}`, 'system');
  }

  // ── Save / Cancel / Reset ──
  save() {
    // Persist current boardSystem state (already pushed by syncToBoard)
    this.persist();
    this.dirty = false;
    this.isOpen = false;
    gameCycleSystem.addLog('บันทึกตำแหน่งบอร์ดเรียบร้อย', 'system');
  }

  cancel() {
    // Restore from snapshot
    boardSystem.zones = this.snapshotZones.map(z => ({ ...z }));
    boardSystem.defaultZoneMap = { ...this.snapshotDefaultZoneMap };
    this.workingZones = [];
    this.workingDefaultZoneMap = {};
    this.dirty = false;
    this.isOpen = false;
  }

  resetDefaults() {
    if (!confirm('รีเซ็ตตำแหน่ง zone ทั้งหมดกลับเป็นค่าเริ่มต้น? (ยังไม่ถูกบันทึก จนกว่าจะกด Save)')) return;
    this.workingZones = DEFAULT_BOARD_ZONES.map(z => ({ ...z }));
    this.workingDefaultZoneMap = {
      Leader: 'you-leader',
      Stage: 'you-stage',
      Event: 'you-cost',
      Character: 'you-character',
    };
    this.syncToBoard();
    gameCycleSystem.addLog('รีเซ็ต zone กลับเป็นค่าเริ่มต้น', 'system');
  }

  /** Same effect as resetDefaults(), but no confirm() dialog and no
   *  working-copy/dirty bookkeeping (panel isn't necessarily open).
   *  Writes straight to boardSystem.zones / defaultZoneMap and invalidates
   *  the cached board rect. Call this on lobby entry / game start so the
   *  board always opens at the default layout without the user needing to
   *  manually press "Reset เป็นค่าเริ่มต้น". */
  autoResetToDefaults() {
    boardSystem.zones = DEFAULT_BOARD_ZONES.map(z => ({ ...z }));
    boardSystem.defaultZoneMap = {
      Leader: 'you-leader',
      Stage: 'you-stage',
      Event: 'you-cost',
      Character: 'you-character',
    };
    boardSystem.invalidateBoardRect();
    // Keep any open Board Settings panel's working copy in sync too.
    if (this.isOpen) {
      this.workingZones = boardSystem.zones.map(z => ({ ...z }));
      this.workingDefaultZoneMap = { ...boardSystem.defaultZoneMap };
    }
  }

  // ── Persistence (LOCKED DOWN — see header comment) ──
  // persist() is a no-op. Layout is fixed to DEFAULT_BOARD_ZONES for every
  // session. Any previously-persisted layout under STORAGE_KEY is wiped by
  // load() on init so old data can't leak back in.
  persist() {
    // Intentionally empty — locked-down mode.
    return;
  }

  /** LOCKED-DOWN load(): wipes any stale localStorage entry AND force-resets
   *  boardSystem.zones / defaultZoneMap to DEFAULT_BOARD_ZONES.
   *
   *  This is the belt-and-suspenders fix for the symptom where the board
   *  layout was wrong on game entry (user had to press Reset to fix it):
   *  even if some other code path mutated boardSystem.zones before this
   *  runs (or stale localStorage leaked back in via an old cached build),
   *  calling load() on mount will hard-reset everything to the locked-down
   *  defaults.
   *
   *  Called once on app init from +page.svelte onMount(). */
  load() {
    // 1. Wipe any stale localStorage entry so old data can't leak back in.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('BoardSettings: failed to clear stale storage', e);
    }

    // 2. Force-reset boardSystem to DEFAULT_BOARD_ZONES (deep clone).
    //    Reassigning the array (and the map) triggers Svelte 5 $state
    //    reactivity so the board re-renders with the locked layout.
    boardSystem.zones = DEFAULT_BOARD_ZONES.map(z => ({ ...z }));
    boardSystem.defaultZoneMap = {
      Leader: 'you-leader',
      Stage: 'you-stage',
      Event: 'you-cost',
      Character: 'you-character',
    };

    // 3. Invalidate the cached board rect so getBoardRect() recomputes
    //    against the current playfield size on next read.
    //    (Defensive — the cache is already invalidated on resize, but
    //    forcing it here guarantees fresh geometry for the spawn math
    //    that runs immediately after mount.)
    boardSystem.invalidateBoardRect();
  }

  /** Export current settings as a JSON string (for backup / share). */
  exportJSON(): string {
    return JSON.stringify({
      zones: boardSystem.zones,
      defaultZoneMap: boardSystem.defaultZoneMap,
    }, null, 2);
  }

  /** Import settings from a JSON string (live only — not persisted).
   *  Returns true on success. Locked-down mode: does NOT persist. */
  importJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed.zones)) return false;
      boardSystem.zones = parsed.zones.map((z: Zone) => ({ ...z }));
      if (parsed.defaultZoneMap) {
        boardSystem.defaultZoneMap = { ...parsed.defaultZoneMap };
      }
      // No persist() call — locked-down mode.
      return true;
    } catch {
      return false;
    }
  }
}

export const boardSettingsSystem = new BoardSettingsSystem();
