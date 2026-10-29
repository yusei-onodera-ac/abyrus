import { BigNumber } from './BigNumber';
import { ProgressionSystem } from './ProgressionSystem';
import { SaveSystem, expToNextLevel, type SaveData } from './SaveSystem';
import type { CombatStats, HeroData } from '../types';

/** Levels the 強化 screen offers to buy in one go. */
export const LEVEL_STEPS = [1, 5];

/** ゴールド it costs to raise `hero` by `levels` levels: 1 ゴールド for every
 *  EXP still missing (what it has already earned toward the next level counts). */
export function levelUpCost(hero: HeroData, levels: number): number {
  let exp = -hero.exp;
  for (let i = 0; i < levels; i++) exp += expToNextLevel(hero.level + i);
  return Math.max(1, Math.round(exp));
}

/** The hero's stats as they'd be `levels` levels higher. */
export function statsAfterLevels(hero: HeroData, levels: number): CombatStats {
  return ProgressionSystem.computeHeroStats({ ...hero, level: hero.level + levels });
}

export const EnhanceSystem = {
  levelUpCost,
  statsAfterLevels,

  canAfford(save: SaveData, cost: number): boolean {
    return SaveSystem.getGold(save).gte(cost);
  },

  /** Pays ゴールド to raise a hero `levels` levels. Returns the cost paid, or
   *  null (and changes nothing) if the hero is missing or the player is short. */
  levelUp(save: SaveData, heroId: string, levels: number): number | null {
    const hero = SaveSystem.getHero(save, heroId);
    if (!hero || levels < 1) return null;
    const cost = levelUpCost(hero, levels);
    if (!SaveSystem.spendGold(save, BigNumber.from(cost))) return null;
    hero.level += levels;
    // The partial EXP was counted into the price, so the new level starts clean.
    hero.exp = 0;
    return cost;
  },
};
