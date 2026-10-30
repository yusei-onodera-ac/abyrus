import { MAX_PLAYER_LEVEL, levelUpGems, playerExpToNext, staminaMaxFor } from '../data/playerLevel';
import { SaveSystem, type SaveData } from './SaveSystem';
import { StaminaSystem } from './StaminaSystem';

export interface LevelUp {
  from: number;
  to: number;
  /** 魔晶石 paid for the levels gained. */
  gems: number;
}

export const PlayerLevelSystem = {
  /** Share of the way to the next level, 0..1 (1 at the cap). */
  progress(save: SaveData): number {
    if (save.playerLevel >= MAX_PLAYER_LEVEL) return 1;
    return Math.max(0, Math.min(1, save.playerExp / playerExpToNext(save.playerLevel)));
  },

  /** Adds player EXP. Each level gained refills stamina to its new maximum and
   *  pays 魔晶石. Returns what happened, or null if no level was gained. */
  gain(save: SaveData, exp: number): LevelUp | null {
    if (exp <= 0 || save.playerLevel >= MAX_PLAYER_LEVEL) return null;
    const from = save.playerLevel;
    let gems = 0;
    save.playerExp += exp;
    while (save.playerLevel < MAX_PLAYER_LEVEL && save.playerExp >= playerExpToNext(save.playerLevel)) {
      save.playerExp -= playerExpToNext(save.playerLevel);
      save.playerLevel += 1;
      gems += levelUpGems(save.playerLevel);
    }
    if (save.playerLevel >= MAX_PLAYER_LEVEL) save.playerExp = 0;
    if (save.playerLevel === from) return null;

    SaveSystem.addGems(save, gems);
    // A new level fills stamina right up to its (larger) maximum.
    StaminaSystem.refresh(save);
    save.stamina = [staminaMaxFor(save.playerLevel), staminaMaxFor(save.playerLevel)];
    save.staminaAt = Date.now();
    return { from, to: save.playerLevel, gems };
  },
};
