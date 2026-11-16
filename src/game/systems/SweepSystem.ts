import { getWeekdayTier } from '../data/weekdayDungeons';
import type { ItemId } from '../data/items';
import { BigNumber } from './BigNumber';
import { recordMission } from './MissionProgress';
import { PlayerLevelSystem, type LevelUp } from './PlayerLevelSystem';
import { FINAL_STAGE_INDEX, ProgressionSystem } from './ProgressionSystem';
import type { QuestStage } from './QuestRoute';
import { SaveSystem, type SaveData } from './SaveSystem';
import { StaminaSystem, baseStageStaminaCost, stageStaminaCost } from './StaminaSystem';
import { CampaignSystem } from './CampaignSystem';
import { StageRewardSystem, type StageBonus } from './StageRewardSystem';
import { WeekdayDungeonSystem } from './WeekdayDungeonSystem';
import { EventSystem } from './EventSystem';
import type { EventToken } from '../data/limitedEvents';

/**
 * 掃討: a stage that has been cleared before can be "swept" - no fight, the stamina is paid and the rewards come at once,
 * as many times as asked (up to SWEEP_MAX). A sweep pays what a win pays (gold, EXP to the party, 技素, the drops, the
 * プレイヤーEXP and the mission counts) except what only a FIRST clear pays: no 初回 gems, no progress, no 同盟 point.
 */
export const SWEEP_MAX = 10;

export type SweepTarget = { kind: 'quest'; stage: QuestStage } | { kind: 'weekday'; day: number; tier: number } | { kind: 'event'; eventId: string; tier: number };

export interface SweepHeroGain {
  heroId: string;
  name: string;
  levelBefore: number;
  levelAfter: number;
}

export interface SweepResult {
  count: number;
  /** Stamina spent in all. */
  stamina: number;
  gold: BigNumber;
  /** EXP each hero of the party received. */
  exp: number;
  essence: number;
  playerExp: number;
  levelUp: LevelUp | null;
  phaseMaterials: number;
  items: { item: ItemId; amount: number }[];
  party: SweepHeroGain[];
  /** 期間限定イベント only: the event currency the sweeps paid. */
  eventTokens?: { token: EventToken; amount: number };
}

interface StageValues {
  gold: BigNumber;
  exp: number;
  essence: number;
}

function valuesOf(target: SweepTarget): StageValues {
  if (target.kind === 'event') {
    const def = ProgressionSystem.getEventStage(EventSystem.get(target.eventId)!, target.tier);
    return { gold: def.rewardGold, exp: def.rewardExp, essence: def.rewardSkillEssence };
  }
  if (target.kind === 'weekday') {
    const def = ProgressionSystem.getWeekdayStage(target.day, target.tier);
    return { gold: def.rewardGold, exp: def.rewardExp, essence: def.rewardSkillEssence };
  }
  const { stage } = target;
  if (stage.kind === 'final') {
    const def = ProgressionSystem.getFinalStage();
    return { gold: def.rewardGold, exp: def.rewardExp, essence: def.rewardSkillEssence };
  }
  const def = stage.kind === 'extra' ? ProgressionSystem.getExtraStage(stage.index) : ProgressionSystem.getStage(stage.index);
  return { gold: def.rewardGold, exp: def.rewardExp, essence: def.rewardSkillEssence };
}

export const SweepSystem = {
  /** True when the stage has been cleared at least once. */
  canSweep(save: SaveData, target: SweepTarget, now = Date.now()): boolean {
    if (target.kind === 'event') {
      const def = EventSystem.get(target.eventId);
      return !!def && EventSystem.isRunning(def, now) && EventSystem.isCleared(save, target.eventId, target.tier);
    }
    if (target.kind === 'weekday') return WeekdayDungeonSystem.isCleared(save, target.tier);
    const { stage } = target;
    if (stage.kind === 'extra') return stage.index < save.extraProgress;
    if (stage.kind === 'final') return save.stageProgress > FINAL_STAGE_INDEX;
    return stage.index < save.stageProgress;
  },

  /** Stamina one sweep of the stage costs (what a fight would cost - less in a スタミナ半額 campaign). */
  costPer(target: SweepTarget): number {
    if (target.kind === 'weekday' || target.kind === 'event') return CampaignSystem.staminaCost(getWeekdayTier(target.tier).stamina);
    return stageStaminaCost(target.stage.kind, target.stage.index);
  },

  /** The same without any campaign: what the プレイヤーEXP of a sweep is counted by. */
  baseCostPer(target: SweepTarget): number {
    if (target.kind === 'weekday' || target.kind === 'event') return getWeekdayTier(target.tier).stamina;
    return baseStageStaminaCost(target.stage.kind, target.stage.index);
  },

  /** How many sweeps can be done now: the stamina allows, up to SWEEP_MAX; 0 when there is no party or the stage was not cleared. */
  maxCount(save: SaveData, target: SweepTarget, now = Date.now()): number {
    if (!this.canSweep(save, target, now)) return 0;
    const party = SaveSystem.getPartyHeroes(save);
    if (party.front.length + party.back.length === 0) return 0;
    StaminaSystem.refresh(save, now);
    return Math.max(0, Math.min(SWEEP_MAX, Math.floor(save.stamina[0] / this.costPer(target))));
  },

  /** Sweeps `count` times. Null when it cannot be done (not cleared, no party, not enough stamina, a bad count). */
  run(save: SaveData, target: SweepTarget, count: number, rng: () => number = Math.random, now = Date.now()): SweepResult | null {
    if (!Number.isInteger(count) || count < 1 || count > this.maxCount(save, target, now)) return null;
    const cost = this.costPer(target) * count;
    if (!StaminaSystem.spend(save, cost, now)) return null;

    const values = valuesOf(target);
    const { front, back } = SaveSystem.getPartyHeroes(save);
    const heroes = [...front, ...back];
    const before = heroes.map((h) => h.level);
    // ゴールド2倍 / 経験値2倍 campaigns: as in a fight.
    const exp = CampaignSystem.scale('exp', values.exp) * count;
    for (const hero of heroes) SaveSystem.grantExp(save, hero.id, exp);

    const gold = values.gold.mul(CampaignSystem.mul('gold') * count);
    SaveSystem.addGold(save, gold);
    const essence = values.essence * count;
    SaveSystem.addSkillEssence(save, essence);

    // The drops: rolled once for each sweep, as a fight would (a 曜日ダンジョン pays its fixed amounts every time).
    let phaseMaterials = 0;
    const items = new Map<ItemId, number>();
    for (let i = 0; i < count; i++) {
      const bonus: StageBonus =
        target.kind === 'weekday'
          ? WeekdayDungeonSystem.bonus(target.day, target.tier)
          : target.kind === 'event'
            ? StageRewardSystem.roll({ kind: 'main', index: getWeekdayTier(target.tier).likeStage }, false, values.exp, rng)
            : StageRewardSystem.roll(target.stage, false, values.exp, rng);
      StageRewardSystem.grant(save, bonus);
      phaseMaterials += bonus.phaseMaterials;
      for (const { item, amount } of bonus.items) items.set(item, (items.get(item) ?? 0) + amount);
    }

    recordMission(save, 'quest_clear', count, now);
    // 期間限定イベント: the currency of every sweep (and the clears for its missions).
    let eventTokens: SweepResult['eventTokens'];
    if (target.kind === 'event') {
      const def = EventSystem.get(target.eventId)!;
      const paid = EventSystem.clear(save, def, target.tier, count, now);
      if (paid) eventTokens = { token: def.token, amount: paid.tokens };
    }
    // プレイヤーEXP = the stamina a fight costs, as for a fight (the same in a スタミナ半額 campaign).
    const playerExp = this.baseCostPer(target) * count;
    const levelUp = PlayerLevelSystem.gain(save, playerExp);

    return {
      count,
      stamina: cost,
      gold,
      exp,
      essence,
      playerExp,
      levelUp,
      phaseMaterials,
      items: [...items].map(([item, amount]) => ({ item, amount })),
      party: heroes.map((h, i) => ({ heroId: h.id, name: h.name, levelBefore: before[i], levelAfter: h.level })),
      eventTokens,
    };
  },
};
