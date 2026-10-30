import { BigNumber } from './BigNumber';
import { ProgressionSystem } from './ProgressionSystem';
import { SaveSystem, expToNextLevel, type SaveData } from './SaveSystem';
import { recordMission } from './MissionProgress';
import { ITEMS, type ItemId } from '../data/items';
import { MAX_LEVEL, type CombatStats, type HeroData } from '../types';

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

/** How many more levels `hero` can still gain before MAX_LEVEL. */
export function levelsLeft(hero: HeroData): number {
  return Math.max(0, MAX_LEVEL - hero.level);
}

export const EnhanceSystem = {
  levelUpCost,
  statsAfterLevels,
  levelsLeft,

  /** Uses up to `count` of an 経験値素材 on a hero, one at a time, stopping at the level cap so none is wasted. Returns how many were used and the EXP they gave. */
  useExpItem(save: SaveData, heroId: string, item: ItemId, count: number): { used: number; gained: number } {
    const hero = SaveSystem.getHero(save, heroId);
    const exp = ITEMS[item].exp;
    if (!hero || !exp) return { used: 0, gained: 0 };
    let used = 0;
    while (used < count && hero.level < MAX_LEVEL && SaveSystem.spendItem(save, item, 1)) {
      SaveSystem.grantExp(save, heroId, exp);
      used += 1;
    }
    if (used > 0) recordMission(save, 'hero_enhance');
    return { used, gained: used * exp };
  },

  canAfford(save: SaveData, cost: number): boolean {
    return SaveSystem.getGold(save).gte(cost);
  },

  /** Pays ゴールド to raise a hero `levels` levels. Returns the cost paid, or
   *  null (and changes nothing) if the hero is missing or the player is short. */
  levelUp(save: SaveData, heroId: string, levels: number): number | null {
    const hero = SaveSystem.getHero(save, heroId);
    if (!hero) return null;
    // Never past the cap: asking for more than is left buys what is left.
    levels = Math.min(levels, levelsLeft(hero));
    if (levels < 1) return null;
    const cost = levelUpCost(hero, levels);
    if (!SaveSystem.spendGold(save, BigNumber.from(cost))) return null;
    hero.level += levels;
    recordMission(save, 'hero_enhance');
    // The partial EXP was counted into the price, so the new level starts clean.
    hero.exp = 0;
    return cost;
  },
};
