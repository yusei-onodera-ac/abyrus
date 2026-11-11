import { getBuilding, type MaterialBundle } from '../data/village';
import { GOAL_TIERS, VILLAGE_GOALS, getVillageGoal, unlocksAt, type GoalMetric, type VillageGoal, type UnlockLine } from '../data/villageGoals';
import { BigNumber } from './BigNumber';
import { IdleSystem } from './IdleSystem';
import { SaveSystem, type PlacedBuilding, type SaveData } from './SaveSystem';
import { VillageSystem } from './VillageSystem';
import { builderCount, castleLevel, defensePoints, effectiveLevel, incomeMultiplier } from './VillageIncome';

/**
 * 村の目標 (data/villageGoals.ts): how far each goal has got, and taking what it pays. Like the other systems this changes
 * the save in memory only: the scene that called it saves. Progress is read from the village itself (nothing is recorded as
 * it happens, except the 素材 count and the 襲撃 count the village already keeps), so a goal that is met as soon as it is
 * added can be collected at once.
 */

/** What collecting a goal paid. */
export interface GoalPaid {
  gems: number;
  gold: BigNumber;
  materials: MaterialBundle;
}

export interface GoalProgress {
  value: number;
  target: number;
  /** 0..1 */
  ratio: number;
  done: boolean;
}

export interface TierSummary {
  tier: number;
  total: number;
  /** Goals collected. */
  claimed: number;
  /** Goals met and waiting to be collected. */
  waiting: number;
}

/** What the next 城 level asks and gives (for the 村の発展 panel). */
export interface NextCastle {
  /** The level it would reach. */
  level: number;
  gold: BigNumber;
  materials: MaterialBundle;
  seconds: number;
  /** Why it cannot be started right now, or null when it can. */
  blocker: string | null;
  unlocks: UnlockLine[];
}

/** The standing (finished) buildings of the village. */
function standing(save: SaveData, now: number): PlacedBuilding[] {
  return save.village.buildings.filter((b) => effectiveLevel(b, now) > 0);
}

export const VillageGoals = {
  /** The number a goal is counting right now. */
  value(save: SaveData, metric: GoalMetric, now = Date.now()): number {
    switch (metric.kind) {
      case 'castle':
        return castleLevel(save, now);
      case 'count':
        return standing(save, now).filter((b) => (metric.of === 'decor' ? getBuilding(b.kind).decor === true : b.kind === metric.of)).length;
      case 'topLevel':
        return standing(save, now).reduce((best, b) => (metric.of === 'any' || b.kind === metric.of ? Math.max(best, effectiveLevel(b, now)) : best), 0);
      case 'income':
        return incomeMultiplier(save, now);
      case 'defense':
        return defensePoints(save, now);
      case 'raids':
        return save.village.raid.won;
      case 'gathered':
        return save.village.milestones.gathered;
      case 'builders':
        return builderCount(save, now);
      case 'variety':
        return new Set(standing(save, now).map((b) => b.kind)).size;
    }
  },

  progress(save: SaveData, goal: VillageGoal, now = Date.now()): GoalProgress {
    const value = VillageGoals.value(save, goal.metric, now);
    return { value, target: goal.target, ratio: Math.max(0, Math.min(1, value / goal.target)), done: value + 1e-9 >= goal.target };
  },

  isClaimed(save: SaveData, goal: VillageGoal): boolean {
    return save.village.milestones.claimed.includes(goal.id);
  },

  /** Goals that are met and not yet collected (for the red dot). */
  claimable(save: SaveData, now = Date.now()): VillageGoal[] {
    return VILLAGE_GOALS.filter((g) => !VillageGoals.isClaimed(save, g) && VillageGoals.progress(save, g, now).done);
  },

  /** The 城 level the list is on: the tier being worked on (never above the last). */
  currentTier(save: SaveData, now = Date.now()): number {
    return Math.min(GOAL_TIERS, castleLevel(save, now));
  },

  tierSummary(save: SaveData, tier: number, now = Date.now()): TierSummary {
    const goals = VILLAGE_GOALS.filter((g) => g.tier === tier);
    const claimed = goals.filter((g) => VillageGoals.isClaimed(save, g)).length;
    const waiting = goals.filter((g) => !VillageGoals.isClaimed(save, g) && VillageGoals.progress(save, g, now).done).length;
    return { tier, total: goals.length, claimed, waiting };
  },

  /** What collecting `goal` would pay at the stage reached (the gold is hours of the 放置報酬 gold). */
  reward(save: SaveData, goal: VillageGoal): GoalPaid {
    const r = goal.reward;
    return {
      gems: r.gems ?? 0,
      gold: r.goldHours && r.goldHours > 0 ? IdleSystem.baseGoldPerHour(save).mul(r.goldHours) : BigNumber.ZERO,
      materials: { ...(r.materials ?? {}) },
    };
  },

  /** Collects a met goal: its reward goes to the save and it is marked. Null (nothing changed) when it is not met, was
   *  collected already, or is no goal. */
  claim(save: SaveData, id: string, now = Date.now()): GoalPaid | null {
    const goal = getVillageGoal(id);
    if (!goal || VillageGoals.isClaimed(save, goal) || !VillageGoals.progress(save, goal, now).done) return null;
    const paid = VillageGoals.reward(save, goal);
    if (paid.gems > 0) SaveSystem.addGems(save, paid.gems);
    if (!paid.gold.isZero()) SaveSystem.addGold(save, paid.gold);
    SaveSystem.addMaterials(save, paid.materials);
    save.village.milestones.claimed.push(goal.id);
    return paid;
  },

  /** "3 / 5", or "×1.20 / ×1.4" for the 売上. */
  format(goal: VillageGoal, value: number): string {
    if (goal.metric.kind === 'income') return `×${(Math.floor(value * 100) / 100).toFixed(2)}`;
    return Math.floor(value + 1e-9).toLocaleString('ja-JP');
  },

  formatTarget(goal: VillageGoal): string {
    if (goal.metric.kind === 'income') return `×${goal.target}`;
    return goal.target.toLocaleString('ja-JP');
  },

  /** What the 城's next level asks and gives, or null at the top. */
  nextCastle(save: SaveData, now = Date.now()): NextCastle | null {
    const castle = save.village.buildings.find((b) => b.kind === 'castle');
    const def = getBuilding('castle');
    if (!castle) return null;
    const level = effectiveLevel(castle, now);
    const next = def.levels[level];
    if (!next) return null;
    return {
      level: level + 1,
      gold: VillageSystem.cost(save, next),
      materials: VillageSystem.materialCost(next),
      seconds: next.seconds,
      blocker: VillageSystem.checkUpgrade(save, castle, now),
      unlocks: unlocksAt(level + 1),
    };
  },

  /** What strengthening `b` one more level would change, as short lines ("売上 +120 → +190/時"). Empty when there is no next level. */
  upgradeGain(save: SaveData, b: PlacedBuilding, now = Date.now()): string[] {
    const def = getBuilding(b.kind);
    const level = effectiveLevel(b, now);
    const next = def.levels[level];
    if (!next) return [];
    const was = def.levels[level - 1]?.value ?? 0;
    const lines: string[] = [];
    if (b.kind === 'castle') {
      for (const line of unlocksAt(level + 1).slice(0, 4)) lines.push(line.text);
      return lines;
    }
    if (b.kind === 'shop' || b.kind === 'market') {
      const gain = VillageSystem.incomeAfter(save, b, now);
      const base = IdleSystem.baseGoldPerHour(save);
      lines.push(`売上　+${base.mul(gain.now).toString()} → +${base.mul(gain.after).toString()}/時`);
    } else if (b.kind === 'house') {
      lines.push(`店の売上　+${Math.round(was * 1000) / 10}% → +${Math.round(next.value * 1000) / 10}%`);
    } else if (def.produces) {
      lines.push(`${def.produces === 'wood' ? '木材' : def.produces === 'iron' ? '鉄' : '石'}　+${was} → +${next.value}/時`);
    } else if (def.defense) {
      lines.push(`防衛　+${was} → +${next.value}`);
    }
    return lines;
  },
};
