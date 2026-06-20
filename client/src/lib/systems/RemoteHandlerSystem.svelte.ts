/**
 * Remote Handler System — processes incoming network events from the opponent.
 *
 * - Card spawn / move / remove / tap / flip / rotate
 * - Card drag ghost (start / move / end)
 * - Remote cursor + flash highlight
 * - Attack line mirroring
 *
 * Mirror math (remoteM): opp sees the board flipped 180° — we mirror their
 * (x,y) back into our coordinate space.
 */
import type { CardData } from '../types';
import { cardStateSystem, type RemoteDragGhost } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { cardDatabaseSystem } from './CardDatabaseSystem.svelte';
import { boardSystem, BOARD_SIZE, CARD_W, CARD_H } from './BoardSystem.svelte';

class RemoteHandlerSystem {
  /** Mirror opp-space (x,y) → our-space (x,y). */
  remoteM(x: number, y: number) {
    const w = boardSystem.playfieldEl?.offsetWidth || BOARD_SIZE;
    const h = boardSystem.playfieldEl?.offsetHeight || BOARD_SIZE;
    return { x: w - x - CARD_W, y: h - y - CARD_H };
  }

  handleRemoteCardSpawn(d: any) {
    const data = cardDatabaseSystem.cardMap[d.cardId];
    if (!data) return;
    if (cardStateSystem.cards[d.cid]) {
      // Already have this card and it's ours → ignore
      if (cardStateSystem.cards[d.cid].owner === 'mine') return;
    }
    const cid = cardStateSystem.createCardState(data, d.faceDown, 'opp', d.cid);
    const { x, y } = this.remoteM(d.x, d.y);
    cardStateSystem.cards[cid].x = x;
    cardStateSystem.cards[cid].y = y;
    if (d.rotation != null) cardStateSystem.cards[cid].rotation = d.rotation;
    if (d.zoneId)
      cardStateSystem.cards[cid].zoneId = d.zoneId === 'you-life' ? 'opp-life' : d.zoneId;
    gameCycleSystem.addLog(`${networkingSystem.oppName}: วาง${d.faceDown ? '(คว่ำ)' : data.name}`, 'opp');
  }

  handleRemoteCardMove(d: any) {
    const c = cardStateSystem.cards[d.cid];
    if (!c || c.owner === 'mine') return;
    const { x, y } = this.remoteM(d.x, d.y);
    c.x = x;
    c.y = y;
  }

  handleRemoteCardRemove(d: any) {
    const c = cardStateSystem.cards[d.cid];
    if (c && c.owner === 'opp') delete cardStateSystem.cards[d.cid];
  }

  handleRemoteCardTap(d: any) {
    const c = cardStateSystem.cards[d.cid];
    if (!c || c.owner === 'mine') return;
    c.tapped = d.tapped;
    this.flashRemote(d.cid);
    gameCycleSystem.addLog(`${networkingSystem.oppName}: ${d.tapped ? 'แตะ' : 'ตั้ง'}การ์ด`, 'opp');
  }

  handleRemoteCardFlip(d: any) {
    const c = cardStateSystem.cards[d.cid];
    if (!c || c.owner === 'mine') return;
    c.faceDown = d.faceDown;
    this.flashRemote(d.cid);
  }

  handleRemoteCardRotate(d: any) {
    const c = cardStateSystem.cards[d.cid];
    if (!c || c.owner === 'mine') return;
    c.rotation = d.rotation;
  }

  handleRemoteAttackLine(d: any) {
    cardStateSystem.spawnAttackLine(d.fromX, d.fromY, d.toX, d.toY, 'opp');
  }

  // ── Drag ghosts ──
  handleRemoteCardDragStart(d: any) {
    if (!d?.cid) return;
    const data = d.cardId ? cardDatabaseSystem.cardMap[d.cardId] : undefined;
    const ghost: RemoteDragGhost = {
      cid: String(d.cid),
      cardId: String(d.cardId ?? ''),
      imageUrl: d.imageUrl || data?.imageUrl,
      art: d.art || data?.art,
      x: Number(d.x ?? 0),
      y: Number(d.y ?? 0),
      faceDown: !!d.faceDown,
    };
    // [OPT-1] mutate in-place, no spread
    cardStateSystem.remoteDragGhosts[ghost.cid] = ghost;
  }

  handleRemoteCardDragMove(d: any) {
    const cid = String(d?.cid ?? '');
    const ghost = cardStateSystem.remoteDragGhosts[cid];
    if (!ghost) return;
    // [OPT-1] mutate x/y directly — no object spread per frame
    ghost.x = Number(d.x ?? ghost.x);
    ghost.y = Number(d.y ?? ghost.y);
  }

  handleRemoteCardDragEnd(d: any) {
    const cid = String(d?.cid ?? '');
    if (!cid || !cardStateSystem.remoteDragGhosts[cid]) return;
    // [OPT-1] delete in-place
    delete cardStateSystem.remoteDragGhosts[cid];
  }

  /** Inline style for the ghost card box (mirrored position). */
  remoteGhostBoxStyle(ghost: RemoteDragGhost) {
    if (!boardSystem.playfieldEl) return 'display:none';
    const pfr = boardSystem.playfieldEl.getBoundingClientRect();
    const mirroredX =
      (boardSystem.playfieldEl.offsetWidth || BOARD_SIZE) - ghost.x - CARD_W;
    const mirroredY =
      (boardSystem.playfieldEl.offsetHeight || BOARD_SIZE) - ghost.y - CARD_H;
    const left = pfr.left + mirroredX * boardSystem.boardScale;
    const top = pfr.top + mirroredY * boardSystem.boardScale;
    return `left:${left}px;top:${top}px;width:${CARD_W * boardSystem.boardScale}px;height:${
      CARD_H * boardSystem.boardScale
    }px`;
  }

  remoteGhostFaceStyle(ghost: RemoteDragGhost) {
    const art = ghost.art || '#34495e';
    if (ghost.imageUrl) {
      return `background-color:${art};background-image:url("${String(ghost.imageUrl).replace(
        /"/g,
        '%22'
      )}")`;
    }
    return `background:${art}`;
  }

  // ── Cursor ──
  remoteCursorEl = $state<HTMLElement | undefined>(undefined);

  handleRemoteCursor(d: any) {
    if (!this.remoteCursorEl || !boardSystem.playfieldEl) return;
    const pfr = boardSystem.playfieldEl.getBoundingClientRect();
    const mirroredX = (boardSystem.playfieldEl.offsetWidth || 0) - d.x;
    const mirroredY = (boardSystem.playfieldEl.offsetHeight || 0) - d.y;
    this.remoteCursorEl.style.display = 'block';
    this.remoteCursorEl.style.left = pfr.left + mirroredX * boardSystem.boardScale - 6 + 'px';
    this.remoteCursorEl.style.top = pfr.top + mirroredY * boardSystem.boardScale - 6 + 'px';
  }

  // [OPT-2] querySelector by data-cid — crash-safe even if el is gone
  flashRemote(cid: string) {
    const el = document.querySelector<HTMLElement>(`[data-cid="${cid}"]`);
    if (!el) return;
    el.classList.add('remote-highlight');
    setTimeout(() => el.classList.remove('remote-highlight'), 800);
  }
}

export const remoteHandlerSystem = new RemoteHandlerSystem();
