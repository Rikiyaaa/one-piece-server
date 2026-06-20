/**
 * Undo System — track recent card mutations for Ctrl+Z rollback.
 *
 * Scope: only "mine" card actions are tracked (move / tap / flip / rotate /
 * counter / trash).  Remote (opp) actions are not undoable.
 */
import { cardStateSystem } from './CardStateSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';

export type UndoEntry =
  | { type: 'move'; cid: string; prev: { x?: number; y?: number; zoneId?: string; inHand?: boolean } }
  | { type: 'tap'; cid: string; prev: boolean }
  | { type: 'flip'; cid: string; prev: boolean }
  | { type: 'rotate'; cid: string; prev: number }
  | { type: 'counter'; cid: string; prev: number }
  | { type: 'trash'; cid: string; prev: { x?: number; y?: number; zoneId?: string }; cardDataId: string };

const UNDO_LIMIT = 50;

class UndoSystem {
  private stack: UndoEntry[] = [];

  push(entry: UndoEntry) {
    this.stack.push(entry);
    if (this.stack.length > UNDO_LIMIT) this.stack.shift();
  }

  clear() {
    this.stack = [];
  }

  get size() {
    return this.stack.length;
  }

  perform() {
    const entry = this.stack.pop();
    if (!entry) {
      gameCycleSystem.addLog('ไม่มีอะไรให้ย้อนกลับแล้ว', 'system');
      return;
    }
    const c = cardStateSystem.cards[entry.cid as string];
    switch (entry.type) {
      case 'move': {
        if (!c) break;
        c.x = entry.prev.x;
        c.y = entry.prev.y;
        c.zoneId = entry.prev.zoneId;
        c.inHand = entry.prev.inHand ?? false;
        networkingSystem.send('card_move', { cid: entry.cid, x: c.x, y: c.y });
        break;
      }
      case 'tap': {
        if (!c) break;
        c.tapped = entry.prev;
        networkingSystem.send('card_tap', { cid: entry.cid, tapped: c.tapped });
        break;
      }
      case 'flip': {
        if (!c) break;
        c.faceDown = entry.prev;
        networkingSystem.send('card_flip', { cid: entry.cid, faceDown: c.faceDown });
        break;
      }
      case 'rotate': {
        if (!c) break;
        c.rotation = entry.prev;
        networkingSystem.send('card_rotate', { cid: entry.cid, rotation: c.rotation });
        break;
      }
      case 'counter': {
        if (!c) break;
        c.counter = entry.prev;
        networkingSystem.send('card_counter', { cid: entry.cid, val: c.counter });
        break;
      }
      case 'trash': {
        // Restore from trash — card entity still exists in cards map
        if (!c) break;
        c.x = entry.prev.x;
        c.y = entry.prev.y;
        c.zoneId = entry.prev.zoneId;
        networkingSystem.send('card_move', { cid: entry.cid, x: c.x, y: c.y });
        const idx = gameCycleSystem.myTrash.indexOf(entry.cardDataId);
        if (idx !== -1) gameCycleSystem.myTrash.splice(idx, 1);
        break;
      }
    }
    gameCycleSystem.addLog('ย้อนกลับการกระทำล่าสุด (Ctrl+Z)', 'system');
  }
}

export const undoSystem = new UndoSystem();
