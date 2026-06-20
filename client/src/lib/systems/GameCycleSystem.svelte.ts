import type { CardData } from '../types';

interface LogEntry {
  msg: string;
  side: string;
  time: string;
}

/**
 * Game Cycle System — global game-phase state (life, don, deck/hand counts, log).
 *
 * Holds:
 *   - phase / turn / mulliganAvailable
 *   - myLife / oppLife / myMaxLife
 *   - myDon / myDonSpent / oppDon / oppDonSpent
 *   - myHandCount / oppHandCount / myDeckCount / oppDeckCount
 *   - myDeck / myHand / myTrash / myLifeCards (actual card-id arrays)
 *   - myDeckShuffling / oppDeckShuffling (animation flags)
 *   - logEntries + addLog()
 *   - shuffle() helper
 */
class GameCycleSystem {
  phase = $state(0);
  turn = $state(1);
  myLife = $state(5);
  oppLife = $state(5);
  myMaxLife = $state(5);
  myDon = $state(10);
  myDonSpent = $state(0);
  oppDon = $state(10);
  oppDonSpent = $state(0);
  myHandCount = $state(0);
  oppHandCount = $state(0);
  myDeckCount = $state(50);
  oppDeckCount = $state(50);
  mulliganAvailable = $state(false);
  logEntries = $state<LogEntry[]>([]);

  myDeck = $state<string[]>([]);
  myHand = $state<string[]>([]);
  myTrash = $state<string[]>([]);
  myLifeCards = $state<string[]>([]);

  myDeckShuffling = $state(false);
  oppDeckShuffling = $state(false);

  addLog(msg: string, side: string = 'system') {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
    this.logEntries = [{ msg, side, time }, ...this.logEntries.slice(0, 59)];
  }

  shuffle(arr: any[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

export const gameCycleSystem = new GameCycleSystem();
