import Phaser from 'phaser';
import { SettingsSystem } from './SettingsSystem';
import type { SaveData } from './SaveSystem';

/**
 * 背景音楽: one looping piece at a time, picked by the screen being shown (MusicDirector, installed by BootScene) and
 * played at the BGM volume of the settings. The pieces are files, `public/assets/audio/bgm/<name>.mp3`; a piece whose file
 * is missing is simply silent. Which screen plays which piece is `TRACK_BY_SCENE` below.
 */
export type Track = 'home' | 'map' | 'battle' | 'boss' | 'final' | 'story' | 'gacha' | 'village' | 'infinite' | 'shop';

/** Loudest the music goes (0..1 of the output) at full BGM volume: it sits under the voice and the sound effects. */
const MASTER = 0.55;
const FADE_MS = 900;

const TRACK_BY_SCENE: Record<string, Track> = {
  Home: 'home',
  Idle: 'home',
  Mission: 'home',
  Notice: 'home',
  Gift: 'home',
  Mail: 'home',
  Message: 'home',
  Friend: 'home',
  Settings: 'home',
  Premium: 'home',
  EnhanceHub: 'home',
  Enhance: 'home',
  Equipment: 'home',
  GearPick: 'home',
  Roster: 'home',
  HeroDetail: 'home',
  HomeHero: 'home',
  Gacha: 'gacha',
  GachaDetail: 'gacha',
  Shop: 'shop',
  StageSelect: 'map',
  WeekdayDungeon: 'map',
  Expedition: 'map',
  Event: 'map',
  Village: 'village',
  Story: 'story',
  InfiniteMode: 'infinite',
  InfiniteRun: 'infinite',
};

const exists = new Map<string, boolean>();
const probing = new Map<string, Promise<boolean>>();

/** True when `url` is really an audio file (the dev server answers a missing file with the page itself, so the type is checked). */
export function audioFileExists(url: string): Promise<boolean> {
  const known = exists.get(url);
  if (known !== undefined) return Promise.resolve(known);
  let pending = probing.get(url);
  if (!pending) {
    pending = fetch(url, { method: 'HEAD' })
      .then((res) => res.ok && (res.headers.get('content-type') ?? '').startsWith('audio'))
      .catch(() => false)
      .then((ok) => {
        exists.set(url, ok);
        probing.delete(url);
        return ok;
      });
    probing.set(url, pending);
  }
  return pending;
}

/** What is known about `url` right now (undefined until the check has come back, which this starts). */
export function knownAudio(url: string): boolean | undefined {
  const known = exists.get(url);
  if (known === undefined) void audioFileExists(url);
  return known;
}

interface Playing {
  track: Track;
  audio: HTMLAudioElement;
  /** 0..1 of the way faded in (or out, when `leaving`). */
  fade: number;
  leaving: boolean;
}

let game: Phaser.Game | undefined;
let playing: Playing | undefined;
let leaving: Playing[] = [];
let wanted: Track | undefined;
let blocked = false;
let timer: number | undefined;

function save(): SaveData | undefined {
  return game?.registry.get('save');
}

function targetVolume(): number {
  const s = save();
  return s ? Math.min(1, SettingsSystem.getVolume(s, 'bgm')) * MASTER : 0;
}

/** Once a second-ish: follows the volume setting, fades pieces in and out, and starts again after the browser let go. */
function tick(): void {
  const v = targetVolume();
  const step = 250 / FADE_MS;
  if (playing) {
    playing.fade = Math.min(1, playing.fade + step);
    playing.audio.volume = Math.max(0, Math.min(1, v * playing.fade));
    if (v <= 0 && !playing.audio.paused) playing.audio.pause();
    else if (v > 0 && playing.audio.paused && !blocked) void playing.audio.play().catch(() => undefined);
  }
  for (const old of leaving) {
    old.fade = Math.max(0, old.fade - step);
    old.audio.volume = Math.max(0, Math.min(1, v * old.fade));
    if (old.fade <= 0) {
      old.audio.pause();
      old.audio.src = '';
    }
  }
  leaving = leaving.filter((p) => p.fade > 0);
}

function startPlaying(track: Track): void {
  const url = `/assets/audio/bgm/${track}.mp3`;
  void audioFileExists(url).then((ok) => {
    // Only if this is still the piece that is wanted by the time the check came back.
    if (!ok || wanted !== track || playing?.track === track) return;
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0;
    audio.addEventListener('error', () => undefined);
    if (playing) {
      playing.leaving = true;
      leaving.push(playing);
    }
    playing = { track, audio, fade: 0, leaving: false };
    if (targetVolume() > 0) {
      void audio.play().then(
        () => (blocked = false),
        () => {
          // The browser does not let sound start before the player has touched the page: try again at the first touch.
          blocked = true;
          const retry = (): void => {
            blocked = false;
            if (playing?.audio === audio && targetVolume() > 0) void audio.play().catch(() => undefined);
          };
          window.addEventListener('pointerdown', retry, { once: true });
        },
      );
    }
  });
}

export const MusicSystem = {
  /** Wants `track` to be playing: it fades in (and the one before fades out); asking for the one already playing does nothing. */
  play(track: Track | undefined): void {
    wanted = track;
    if (!track) {
      if (playing) {
        playing.leaving = true;
        leaving.push(playing);
        playing = undefined;
      }
      return;
    }
    if (playing?.track === track) return;
    startPlaying(track);
  },

  /** Which piece a scene plays (the battle one depends on what is being fought). */
  trackFor(scene: Phaser.Scene): Track | undefined {
    const key = scene.scene.key;
    if (key === 'Battle') {
      const data = (scene.scene.settings.data ?? {}) as { stageIndex?: number; mode?: string };
      if (data.mode === 'final') return 'final';
      // A region's last main stage is its boss (30 stages to a region).
      if (data.mode === undefined && typeof data.stageIndex === 'number' && data.stageIndex % 30 === 29) return 'boss';
      return 'battle';
    }
    return TRACK_BY_SCENE[key];
  },
};

/** Installed once by BootScene: every scene that is created asks for its own piece, so music carries on across screens that share one. */
export const MusicDirector = {
  install(g: Phaser.Game): void {
    game = g;
    for (const scene of g.scene.scenes) {
      if (scene.scene.key === 'Boot') continue;
      // Created, or resumed (a fight carried on after the premium pass was looked at over it): its own piece again.
      const play = (): void => {
        const track = MusicSystem.trackFor(scene);
        if (track) MusicSystem.play(track);
      };
      scene.events.on(Phaser.Scenes.Events.CREATE, play);
      scene.events.on(Phaser.Scenes.Events.RESUME, play);
    }
    if (timer === undefined) timer = window.setInterval(tick, 250);
  },
};
