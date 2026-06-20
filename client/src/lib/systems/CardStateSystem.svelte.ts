import type { CardState, CardData, AttackLine } from '../types';

export interface RemoteDragGhost {
  cid: string;
  cardId: string;
  imageUrl?: string;
  art?: string;
  x: number;
  y: number;
  faceDown: boolean;
}

/**
 * Card State System — single source of truth for all card-related reactive state.
 *
 * Holds:
 *   - cards (Record<cid, CardState>) — every card on the board (mine + opp)
 *   - remoteDragGhosts — ghost cards shown when opp drags a card
 *   - attackLines / drawingLine — temp attack-line overlays
 *   - nextCid counter + createCardState factory
 */
class CardStateSystem {
  cards = $state<Record<string, CardState>>({});
  remoteDragGhosts = $state<Record<string, RemoteDragGhost>>({});

  attackLines = $state<AttackLine[]>([]);
  drawingLine = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // non-reactive
  nextCid = 1;
  readonly ATTACK_LINE_TTL = 5000;

  // ── DON!! attach state ──
  donAttachMap = $state<Record<string, string>>({});   // donCid → targetCid
  donAttachPicking = $state<string | null>(null);
  static DON_ATTACH_OFFSET_X = 15;
  static DON_ATTACH_OFFSET_Y = 20;

  /** Return all donCids currently attached to a given target card. */
  getDonsAttachedTo(targetCid: string): string[] {
    return Object.entries(this.donAttachMap)
      .filter(([, target]) => target === targetCid)
      .map(([donCid]) => donCid);
  }

  /**
   * Detach a DON!! from whatever card it's attached to.
   * Returns the previous targetCid, or null if it wasn't attached.
   */
  detachDon(donCid: string): string | null {
    const targetCid = this.donAttachMap[donCid];
    if (!targetCid) return null;
    const newMap = { ...this.donAttachMap };
    delete newMap[donCid];
    this.donAttachMap = newMap;
    return targetCid;
  }

  createCardState(
    data: CardData,
    faceDown: boolean,
    owner: 'mine' | 'opp',
    forceCid: string | null = null,
    isHost = false
  ): string {
    const prefix = isHost ? 'h' : 'g';
    const cid = forceCid || prefix + this.nextCid++;
    this.cards[cid] = {
      data,
      cid,
      owner,
      faceDown,
      tapped: false,
      rotation: 0,
      inHand: false,
    };
    return cid;
  }

  /** Remove all cards — used by resetBoard / new game. */
  clear() {
    this.cards = {};
    this.nextCid = 1;
    this.attackLines = [];
    this.drawingLine = null;
    this.donAttachMap = {};
    this.donAttachPicking = null;
  }

  /** Spawn a temporary attack line (auto-removed after ATTACK_LINE_TTL). */
  spawnAttackLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    owner: 'mine' | 'opp'
  ) {
    const id = 'al' + Date.now() + Math.random().toString(36).slice(2, 7);
    const line: AttackLine = { id, fromX, fromY, toX, toY, owner, createdAt: Date.now() };
    this.attackLines = [...this.attackLines, line];
    setTimeout(() => {
      this.attackLines = this.attackLines.filter(l => l.id !== id);
    }, this.ATTACK_LINE_TTL);
  }
}

export const cardStateSystem = new CardStateSystem();
