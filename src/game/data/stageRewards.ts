import type { ItemId } from './items';

/** What a stage clear pays besides gold, EXP and 技素 (those scale with the stage:
 *  see ProgressionSystem). Plain numbers, so a content update is an edit here.
 *  Placeholder balance. */
export interface StageBonusRule {
  /** 魔晶石 paid the first time the stage is cleared (not on a replay). */
  firstClearGems: number;
  /** Chance (0..1) that a clear - first or replay - also drops フェーズ素材. */
  phaseMaterialChance: number;
  /** How many drop when it does. */
  phaseMaterialAmount: number;
}

export type StageTier = 'normal' | 'regionEnd' | 'final' | 'extra' | 'extraBoss';

export const STAGE_BONUS: Record<StageTier, StageBonusRule> = {
  /** An ordinary main stage. */
  normal: { firstClearGems: 5, phaseMaterialChance: 0.1, phaseMaterialAmount: 1 },
  /** The 30th stage of a region. */
  regionEnd: { firstClearGems: 50, phaseMaterialChance: 1, phaseMaterialAmount: 1 },
  /** The final battle. */
  final: { firstClearGems: 200, phaseMaterialChance: 1, phaseMaterialAmount: 3 },
  /** An ordinary Extra stage. */
  extra: { firstClearGems: 10, phaseMaterialChance: 0.15, phaseMaterialAmount: 1 },
  /** The 6th Extra stage of a region, the boss. */
  extraBoss: { firstClearGems: 50, phaseMaterialChance: 1, phaseMaterialAmount: 2 },
};

/** 素材 a clear can drop, by region (index 0 = 迷いの森 ... 4 = 黄昏の都). Each is rolled on its own. */
export interface ItemDrop {
  item: ItemId;
  chance: number;
  amount: number;
}

export const STAGE_ITEM_DROPS: ItemDrop[][] = [
  [{ item: 'exp_s', chance: 0.7, amount: 3 }, { item: 'equip_essence', chance: 0.25, amount: 5 }],
  [{ item: 'exp_s', chance: 0.5, amount: 4 }, { item: 'exp_m', chance: 0.4, amount: 1 }, { item: 'equip_essence', chance: 0.3, amount: 8 }],
  [{ item: 'exp_m', chance: 0.6, amount: 2 }, { item: 'exp_l', chance: 0.1, amount: 1 }, { item: 'equip_essence', chance: 0.35, amount: 12 }],
  [{ item: 'exp_m', chance: 0.6, amount: 3 }, { item: 'exp_l', chance: 0.25, amount: 1 }, { item: 'equip_essence', chance: 0.4, amount: 18 }],
  [{ item: 'exp_l', chance: 0.5, amount: 1 }, { item: 'exp_xl', chance: 0.05, amount: 1 }, { item: 'equip_essence', chance: 0.45, amount: 25 }],
];

/** The final battle always drops these. */
export const FINAL_ITEM_DROPS: ItemDrop[] = [{ item: 'exp_xl', chance: 1, amount: 2 }, { item: 'equip_essence', chance: 1, amount: 100 }];

/** Bosses (a region's last stage, an Extra boss) drop their region's 素材 this many times over. */
export const BOSS_DROP_MULTIPLIER = 3;
