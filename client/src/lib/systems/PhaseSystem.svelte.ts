/**
 * Phase System — turn/phase advancement + Active-Phase rest restoration.
 */
import { cardStateSystem } from './CardStateSystem.svelte';
import { gameCycleSystem } from './GameCycleSystem.svelte';
import { networkingSystem } from './NetworkingSystem.svelte';
import { PHASES } from './BoardSystem.svelte';
import { deckSystem } from './DeckSystem.svelte';

class PhaseSystem {
  nextPhase() {
    gameCycleSystem.phase = (gameCycleSystem.phase + 1) % PHASES.length;
    if (gameCycleSystem.phase === 0) {
      gameCycleSystem.turn++;
      Object.values(cardStateSystem.cards).forEach(c => {
        if (c.owner === 'mine' && c.tapped) {
          c.tapped = false;
          networkingSystem.send('card_tap', { cid: c.cid, tapped: false });
        }
      });
      gameCycleSystem.addLog(`เริ่มเทิร์น ${gameCycleSystem.turn}`, 'system');
    }
    if (gameCycleSystem.phase === 1) deckSystem.drawCard();
    networkingSystem.send('phase', { phase: gameCycleSystem.phase, turn: gameCycleSystem.turn });
    gameCycleSystem.addLog(`Phase: ${PHASES[gameCycleSystem.phase]}`, 'system');
  }

  /** Active Phase — flip all my rested DON!! back to active. */
  activePhase() {
    let count = 0;
    Object.values(cardStateSystem.cards).forEach(c => {
      if (c.owner === 'mine' && c.isDon && c.tapped) {
        c.tapped = false;
        networkingSystem.send('card_tap', { cid: c.cid, tapped: false });
        count++;
      }
    });
    gameCycleSystem.addLog(
      count > 0
        ? `Active Phase: คืนสภาพการ์ด DON!! ${count} ใบ`
        : 'Active Phase: ไม่มีการ์ด DON!! ที่ Rest อยู่',
      'you'
    );
  }
}

export const phaseSystem = new PhaseSystem();
