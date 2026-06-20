/**
 * SFX System — tiny sound-effect player.
 *
 * Files live in `lib/assets/sfx/` and are bundled by Vite via `?url` imports.
 * Each sound is preloaded once and cloned on play so rapid repeats
 * (e.g. drawing 5 cards during mulligan) don't cut each other off.
 */
import drawUrl from '../assets/sfx/draw.mp3?url';
import placeUrl from '../assets/sfx/place.mp3?url';
import shuffleUrl from '../assets/sfx/shuffle.mp3?url';

const SOUND_URLS = {
  draw: drawUrl,
  place: placeUrl,
  shuffle: shuffleUrl,
} as const;

export type SfxName = keyof typeof SOUND_URLS;

class SfxSystem {
  private cache = new Map<SfxName, HTMLAudioElement>();
  /** Master on/off, exposed for a future settings toggle. */
  enabled = true;
  volume = 0.6;

  private getBase(name: SfxName): HTMLAudioElement {
    let el = this.cache.get(name);
    if (!el) {
      el = new Audio(SOUND_URLS[name]);
      el.preload = 'auto';
      this.cache.set(name, el);
    }
    return el;
  }

  /** Play a sound. Safe to call rapidly / overlapping. */
  play(name: SfxName) {
    if (!this.enabled) return;
    try {
      const base = this.getBase(name);
      const node = base.cloneNode(true) as HTMLAudioElement;
      node.volume = this.volume;
      void node.play().catch(() => {
        // Autoplay can be blocked before the first user gesture — ignore.
      });
    } catch {
      // Non-fatal: missing/broken audio file shouldn't break gameplay.
    }
  }
}

export const sfxSystem = new SfxSystem();
