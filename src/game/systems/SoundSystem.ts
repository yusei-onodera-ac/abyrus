import type Phaser from 'phaser';
import { SettingsSystem } from './SettingsSystem';
import type { SaveData } from './SaveSystem';

/** The game's sound effects, made on the spot with the Web Audio API (a few
 *  short tones each) - there are no audio files yet. Placeholders: when real
 *  files exist, play them from `play` and keep the names. Volume is the SE
 *  setting (設定), 0 being off. No BGM yet. */
export type Sfx = 'tap' | 'confirm' | 'hit' | 'crit' | 'skill' | 'heal' | 'reveal' | 'victory' | 'defeat';

interface Tone {
  /** Hz. */
  freq: number;
  /** Seconds after the sound starts. */
  at: number;
  /** Seconds long. */
  dur: number;
  type: OscillatorType;
  /** 0..1 relative loudness. */
  gain: number;
  /** Hz it glides to by the end, if it moves. */
  to?: number;
}

const SFX: Record<Sfx, Tone[]> = {
  tap: [{ freq: 880, to: 620, at: 0, dur: 0.07, type: 'triangle', gain: 0.5 }],
  confirm: [
    { freq: 660, at: 0, dur: 0.08, type: 'triangle', gain: 0.5 },
    { freq: 990, at: 0.07, dur: 0.12, type: 'triangle', gain: 0.5 },
  ],
  hit: [{ freq: 190, to: 90, at: 0, dur: 0.09, type: 'square', gain: 0.35 }],
  crit: [
    { freq: 520, to: 240, at: 0, dur: 0.14, type: 'sawtooth', gain: 0.45 },
    { freq: 1040, to: 780, at: 0, dur: 0.07, type: 'square', gain: 0.25 },
  ],
  skill: [
    { freq: 400, to: 1300, at: 0, dur: 0.24, type: 'sine', gain: 0.5 },
    { freq: 800, to: 1900, at: 0.05, dur: 0.22, type: 'triangle', gain: 0.25 },
  ],
  heal: [
    { freq: 880, at: 0, dur: 0.12, type: 'sine', gain: 0.45 },
    { freq: 1320, at: 0.1, dur: 0.2, type: 'sine', gain: 0.45 },
  ],
  reveal: [
    { freq: 1318, at: 0, dur: 0.1, type: 'sine', gain: 0.45 },
    { freq: 1568, at: 0.08, dur: 0.1, type: 'sine', gain: 0.45 },
    { freq: 2093, at: 0.16, dur: 0.28, type: 'sine', gain: 0.45 },
  ],
  victory: [
    { freq: 523, at: 0, dur: 0.14, type: 'triangle', gain: 0.5 },
    { freq: 659, at: 0.13, dur: 0.14, type: 'triangle', gain: 0.5 },
    { freq: 784, at: 0.26, dur: 0.14, type: 'triangle', gain: 0.5 },
    { freq: 1047, at: 0.39, dur: 0.4, type: 'triangle', gain: 0.55 },
  ],
  defeat: [
    { freq: 392, at: 0, dur: 0.2, type: 'sawtooth', gain: 0.3 },
    { freq: 330, at: 0.19, dur: 0.2, type: 'sawtooth', gain: 0.3 },
    { freq: 262, at: 0.38, dur: 0.4, type: 'sawtooth', gain: 0.3 },
  ],
};

/** A sound that fires again within this many ms is skipped (a fight can ask for a hit sound every few frames). */
const MIN_GAP_MS: Partial<Record<Sfx, number>> = { hit: 70, crit: 90, skill: 120, heal: 120, tap: 40 };
/** Loudest the effects go at full volume (0..1 of the output). */
const MASTER = 0.22;

let context: AudioContext | null | undefined;
const lastPlayed = new Map<Sfx, number>();

function audioContext(): AudioContext | null {
  if (context !== undefined) return context;
  const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  context = Ctor ? new Ctor() : null;
  return context;
}

export const SoundSystem = {
  /** Plays `sfx` at the SE volume of the game's save (nothing when it is 0 or audio is unavailable). */
  play(scene: Phaser.Scene, sfx: Sfx): void {
    const save: SaveData | undefined = scene.game.registry.get('save');
    if (!save) return;
    const volume = SettingsSystem.getVolume(save, 'se');
    if (volume <= 0) return;

    const now = performance.now();
    const gap = MIN_GAP_MS[sfx] ?? 0;
    if (now - (lastPlayed.get(sfx) ?? -Infinity) < gap) return;
    lastPlayed.set(sfx, now);

    const ac = audioContext();
    if (!ac) return;
    // Browsers keep audio suspended until the player has touched the page; a tap does that.
    if (ac.state === 'suspended') void ac.resume();
    const level = MASTER * Math.pow(volume, 1.5);
    const t0 = ac.currentTime;
    for (const tone of SFX[sfx]) {
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, t0 + tone.at);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.at + tone.dur);
      // A quick attack and a fade out, so a tone never clicks.
      amp.gain.setValueAtTime(0.0001, t0 + tone.at);
      amp.gain.exponentialRampToValueAtTime(level * tone.gain, t0 + tone.at + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.dur);
      osc.connect(amp).connect(ac.destination);
      osc.start(t0 + tone.at);
      osc.stop(t0 + tone.at + tone.dur + 0.02);
    }
  },
};
