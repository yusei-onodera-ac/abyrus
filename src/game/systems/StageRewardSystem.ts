import { BOSS_DROP_MULTIPLIER, FINAL_ITEM_DROPS, STAGE_BONUS, STAGE_ITEM_DROPS, type ItemDrop, type StageTier } from '../data/stageRewards';
import { ITEMS, type ItemId } from '../data/items';
import type { QuestStage } from './QuestRoute';
import { EXTRA_STAGES_PER_REGION, FINAL_STAGE_INDEX, STAGES_PER_REGION } from './ProgressionSystem';
import { SaveSystem, type SaveData } from './SaveSystem';

/** What a clear paid on top of gold / EXP / 技素. */
export interface StageBonus {
  firstClear: boolean;
  gems: number;
  phaseMaterials: number;
  /** 経験値素材 / 装備強化素材 that dropped. */
  items: { item: ItemId; amount: number }[];
}

export function stageTier(stage: QuestStage): StageTier {
  if (stage.kind === 'final') return 'final';
  if (stage.kind === 'extra') return stage.index % EXTRA_STAGES_PER_REGION === EXTRA_STAGES_PER_REGION - 1 ? 'extraBoss' : 'extra';
  return stage.index % STAGES_PER_REGION === STAGES_PER_REGION - 1 ? 'regionEnd' : 'normal';
}

export const StageRewardSystem = {
  /** True when clearing `stage` now would be its first clear - ask before the
   *  progress counters are advanced. */
  isFirstClear(save: SaveData, stage: QuestStage): boolean {
    if (stage.kind === 'extra') return stage.index >= save.extraProgress;
    if (stage.kind === 'final') return save.stageProgress <= FINAL_STAGE_INDEX;
    return stage.index >= save.stageProgress;
  },

  /** Rolls the bonus for a clear (the drops are chances; the first-clear gems are certain).
   *  `expReward` is the EXP the clear itself pays each hero: 経験値素材 drops are sized from it. */
  roll(stage: QuestStage, firstClear: boolean, expReward: number, rng: () => number = Math.random): StageBonus {
    const tier = stageTier(stage);
    const rule = STAGE_BONUS[tier];
    const perRegion = stage.kind === 'extra' ? EXTRA_STAGES_PER_REGION : STAGES_PER_REGION;
    const region = Math.min(STAGE_ITEM_DROPS.length - 1, Math.floor(stage.index / perRegion));
    const boss = tier === 'regionEnd' || tier === 'extraBoss';
    const table: ItemDrop[] = stage.kind === 'final' ? FINAL_ITEM_DROPS : STAGE_ITEM_DROPS[region];
    const items: { item: ItemId; amount: number }[] = [];
    for (const drop of table) {
      if (rng() >= drop.chance) continue;
      const base = drop.expShare !== undefined ? Math.max(1, Math.round((drop.expShare * expReward) / (ITEMS[drop.item].exp ?? 1))) : (drop.amount ?? 1);
      items.push({ item: drop.item, amount: base * (boss ? BOSS_DROP_MULTIPLIER : 1) });
    }
    return {
      firstClear,
      gems: firstClear ? rule.firstClearGems : 0,
      phaseMaterials: rng() < rule.phaseMaterialChance ? rule.phaseMaterialAmount : 0,
      items,
    };
  },

  grant(save: SaveData, bonus: StageBonus): void {
    SaveSystem.addGems(save, bonus.gems);
    SaveSystem.addPhaseMaterials(save, bonus.phaseMaterials);
    for (const { item, amount } of bonus.items) SaveSystem.addItem(save, item, amount);
  },
};
