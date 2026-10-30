import { TUTORIAL_STEPS, type TutorialStep } from '../data/tutorial';
import type { SaveData } from './SaveSystem';

/** Where the player is in the チュートリアル (data/tutorial.ts). `step` is the index of
 *  the next step to show; `done` is set when it is finished or skipped. */
export const TutorialSystem = {
  /** The step waiting to be shown, or null when the tutorial is over. */
  current(save: SaveData): TutorialStep | null {
    if (save.tutorial.done) return null;
    return TUTORIAL_STEPS[save.tutorial.step] ?? null;
  },

  /** Moves on to the next step. True if that was the last one (the tutorial is now done). */
  advance(save: SaveData): boolean {
    save.tutorial.step += 1;
    if (save.tutorial.step >= TUTORIAL_STEPS.length) {
      save.tutorial.done = true;
      return true;
    }
    return false;
  },

  skip(save: SaveData): void {
    save.tutorial.done = true;
  },

  /** Starts it over (development: ?mock=tutorial). */
  restart(save: SaveData): void {
    save.tutorial = { opening: false, step: 0, done: false };
  },
};
