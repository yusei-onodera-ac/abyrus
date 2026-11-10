import type { Reward } from '../data/rewards';
import type { MaterialBundle } from '../data/village';
import { WEEKDAY_TIERS, getWeekdayDungeon, getWeekdayTier } from '../data/weekdayDungeons';
import type { SaveData } from './SaveSystem';
import type { StageBonus } from './StageRewardSystem';

/**
 * 曜日ダンジョン (data/weekdayDungeons.ts): which day it is, which tiers are open, and what a clear
 * pays besides the stage's own gold, EXP and 技素. The fight itself is BattleScene's 'weekday' mode.
 */
export const WeekdayDungeonSystem = {
  /** 0 = 日曜 ... 6 = 土曜, by the local clock: the day's dungeon changes at midnight. */
  today(now = Date.now()): number {
    return new Date(now).getDay();
  },

  /** A tier opens once enough of the main stages have been cleared. */
  isUnlocked(save: SaveData, tier: number): boolean {
    return save.stageProgress >= getWeekdayTier(tier).needStage;
  },

  /** What a clear pays, as the result panel and StageRewardSystem.grant expect it: fixed amounts, no luck. */
  bonus(day: number, tier: number): StageBonus {
    const dungeon = getWeekdayDungeon(day);
    const index = WEEKDAY_TIERS.indexOf(getWeekdayTier(tier));
    const items = dungeon.items.flatMap(({ item, amounts }) => ((amounts[index] ?? 0) > 0 ? [{ item, amount: amounts[index] }] : []));
    const materials: MaterialBundle = {};
    for (const { material, amounts } of dungeon.materials) if ((amounts[index] ?? 0) > 0) materials[material] = (materials[material] ?? 0) + amounts[index];
    return { firstClear: false, gems: 0, phaseMaterials: dungeon.phaseMaterials[index] ?? 0, items, materials };
  },

  /** The 素材 a clear pays beyond the ordinary, for showing before the fight (the gold multiple is in `goldMul`). */
  preview(day: number, tier: number): Reward[] {
    const dungeon = getWeekdayDungeon(day);
    const index = WEEKDAY_TIERS.indexOf(getWeekdayTier(tier));
    const rewards: Reward[] = [];
    if ((dungeon.skillEssence[index] ?? 0) > 0) rewards.push({ type: 'skillEssence', amount: dungeon.skillEssence[index] });
    for (const { item, amount } of WeekdayDungeonSystem.bonus(day, tier).items) rewards.push({ type: 'item', item, amount });
    if ((dungeon.phaseMaterials[index] ?? 0) > 0) rewards.push({ type: 'phaseMaterials', amount: dungeon.phaseMaterials[index] });
    return rewards;
  },
};
