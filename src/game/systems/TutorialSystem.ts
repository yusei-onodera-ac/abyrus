import { TUTORIAL_STEPS, VILLAGE_TUTORIAL_STEPS, type TutorialStep } from '../data/tutorial';
import { TUTORIAL_REV, type SaveData } from './SaveSystem';
import { cleanPlayerName } from './SettingsSystem';

/** Where the player is in the チュートリアル (data/tutorial.ts). `step` is the index of
 *  the next step to show; `done` is set when it is finished or skipped. */
export const TutorialSystem = {
  /** The step waiting to be shown, or null when the tutorial is over. */
  current(save: SaveData): TutorialStep | null {
    if (save.tutorial.done) return null;
    return TUTORIAL_STEPS[save.tutorial.step] ?? null;
  },

  /** The 村 step waiting to be shown (the village has its own short tutorial, taught on the first visit once the main one is over), or null. */
  currentVillage(save: SaveData): TutorialStep | null {
    if (!save.tutorial.done || save.tutorial.village.done) return null;
    return VILLAGE_TUTORIAL_STEPS[save.tutorial.village.step] ?? null;
  },

  /** Whichever step is due: the main tutorial's, else the village's. */
  active(save: SaveData): TutorialStep | null {
    return this.current(save) ?? this.currentVillage(save);
  },

  /** True while the step due is the one that asks for the player's name: only a brand-new save gets there (a save that
   *  is already past it, or from before it existed, is never asked - see SaveSystem.restoreFrom). */
  isAskingName(save: SaveData): boolean {
    return this.current(save)?.advance === 'name';
  },

  /** The 名前 step is answered: stores the name (as the 設定 screen would: no emoji, trimmed, cut to PLAYER_NAME_MAX) and goes
   *  on to the next step. An empty name is not accepted - nothing changes and the step stays. Returns the name kept, or null. */
  confirmName(save: SaveData, raw: string): string | null {
    if (!this.isAskingName(save)) return null;
    const name = cleanPlayerName(raw);
    if (!name) return null;
    save.playerName = name;
    this.advance(save);
    return name;
  },

  /** Moves the active track on to its next step. 'main' / 'village' when that was the last step of that track (it is now done), else null. */
  advance(save: SaveData): 'main' | 'village' | null {
    if (!save.tutorial.done) {
      save.tutorial.step += 1;
      if (save.tutorial.step >= TUTORIAL_STEPS.length) {
        save.tutorial.done = true;
        return 'main';
      }
      return null;
    }
    const village = save.tutorial.village;
    if (village.done) return null;
    village.step += 1;
    if (village.step >= VILLAGE_TUTORIAL_STEPS.length) {
      village.done = true;
      return 'village';
    }
    return null;
  },

  /** Skips the track that is active. (The overlay offers no スキップ while the 名前 step is up: a new player has to give a name, or carry their data over.) */
  skip(save: SaveData): void {
    if (!save.tutorial.done) save.tutorial.done = true;
    else save.tutorial.village.done = true;
  },

  /** Starts it over (development: ?mock=tutorial). */
  restart(save: SaveData): void {
    save.tutorial = { opening: false, step: 0, done: false, village: { step: 0, done: false }, rev: TUTORIAL_REV };
  },
};
