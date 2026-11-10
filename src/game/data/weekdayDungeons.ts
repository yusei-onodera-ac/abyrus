import type { ItemId } from './items';
import type { VillageMaterial } from './village';

/**
 * 曜日ダンジョン: a dungeon that is open every day, and that pays a different 素材 on each day of
 * the week (EXP on Monday, 装備強化素材 on Tuesday, ...), in four tiers. It spends stamina like
 * any stage, and counts as no stage of the campaign. Edit this file to change what a day pays
 * (数字は仮のバランス). The day changes at local midnight.
 */

/** 日 first, the order `Date.getDay()` counts in. */
export const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export interface WeekdayTier {
  id: string;
  name: string;
  /** Main stages that must have been cleared before it opens (a region has 30). */
  needStage: number;
  /** Stamina it costs (and the プレイヤーEXP a clear gives). */
  stamina: number;
  /** The main stage whose enemies, region and gold / EXP it is set like (0-based). */
  likeStage: number;
}

export const WEEKDAY_TIERS: WeekdayTier[] = [
  { id: 'easy', name: '初級', needStage: 0, stamina: 10, likeStage: 8 },
  { id: 'normal', name: '中級', needStage: 30, stamina: 14, likeStage: 40 },
  { id: 'hard', name: '上級', needStage: 60, stamina: 18, likeStage: 75 },
  { id: 'expert', name: '超級', needStage: 100, stamina: 22, likeStage: 115 },
];

export interface WeekdayDungeon {
  /** 0 = 日曜 ... 6 = 土曜 (the index in WEEKDAY_DUNGEONS). */
  day: number;
  name: string;
  /** One line: what it pays today. */
  theme: string;
  /** The clear's gold, multiplied. */
  goldMul: number;
  /** Extra 技素 a clear pays, by tier (初級, 中級, 上級, 超級); 0 pays none. */
  skillEssence: number[];
  /** フェーズ素材 a clear pays, by tier. */
  phaseMaterials: number[];
  /** 素材 a clear pays, by tier. */
  items: { item: ItemId; amounts: number[] }[];
  /** 村の素材 (木材・鉄・石) a clear pays, by tier. Only the village shows them. */
  materials: { material: VillageMaterial; amounts: number[] }[];
}

export const WEEKDAY_DUNGEONS: WeekdayDungeon[] = [
  {
    day: 0,
    name: '安息の祭壇',
    theme: '日曜日は、すべての素材が少しずつ手に入る',
    materials: [
      { material: 'wood', amounts: [30, 80, 200, 500] },
      { material: 'stone', amounts: [20, 50, 130, 320] },
      { material: 'iron', amounts: [10, 30, 80, 200] },
    ],
    goldMul: 3,
    skillEssence: [100, 300, 700, 2000],
    phaseMaterials: [0, 1, 1, 2],
    items: [
      { item: 'exp_m', amounts: [5, 4, 2, 0] },
      { item: 'exp_l', amounts: [0, 0, 1, 2] },
      { item: 'exp_xl', amounts: [0, 0, 0, 1] },
      { item: 'equip_essence', amounts: [30, 80, 200, 500] },
    ],
  },
  {
    day: 1,
    name: '経験の洞窟',
    theme: '月曜日は、経験値素材がたくさん手に入る',
    materials: [
      { material: 'stone', amounts: [60, 160, 400, 1000] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 0],
    items: [
      { item: 'exp_s', amounts: [20, 0, 0, 0] },
      { item: 'exp_m', amounts: [0, 10, 5, 0] },
      { item: 'exp_l', amounts: [0, 0, 3, 5] },
      { item: 'exp_xl', amounts: [0, 0, 0, 1] },
    ],
  },
  {
    day: 2,
    name: '鍛冶の坑道',
    theme: '火曜日は、装備強化素材がたくさん手に入る',
    materials: [
      { material: 'iron', amounts: [40, 110, 280, 700] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 0],
    items: [{ item: 'equip_essence', amounts: [60, 160, 400, 1000] }],
  },
  {
    day: 3,
    name: '技の書庫',
    theme: '水曜日は、技素がたくさん手に入る',
    materials: [
      { material: 'wood', amounts: [60, 160, 400, 1000] },
    ],
    goldMul: 1,
    skillEssence: [200, 600, 1500, 4000],
    phaseMaterials: [0, 0, 0, 0],
    items: [],
  },
  {
    day: 4,
    name: '位階の聖域',
    theme: '木曜日は、フェーズ素材が手に入る',
    materials: [
      { material: 'wood', amounts: [30, 80, 200, 500] },
      { material: 'stone', amounts: [30, 80, 200, 500] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [1, 1, 2, 3],
    items: [],
  },
  {
    day: 5,
    name: '黄金の宝物庫',
    theme: '金曜日は、ゴールドが8倍になる',
    materials: [
      { material: 'iron', amounts: [20, 55, 140, 350] },
      { material: 'stone', amounts: [30, 80, 200, 500] },
    ],
    goldMul: 8,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 0],
    items: [],
  },
  {
    day: 6,
    name: '修練の闘技場',
    theme: '土曜日は、経験値素材と装備強化素材が手に入る',
    materials: [
      { material: 'wood', amounts: [30, 80, 200, 500] },
      { material: 'iron', amounts: [20, 55, 140, 350] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 0],
    items: [
      { item: 'exp_s', amounts: [10, 0, 0, 0] },
      { item: 'exp_m', amounts: [0, 5, 3, 0] },
      { item: 'exp_l', amounts: [0, 0, 1, 3] },
      { item: 'equip_essence', amounts: [30, 80, 200, 500] },
    ],
  },
];

export function getWeekdayDungeon(day: number): WeekdayDungeon {
  return WEEKDAY_DUNGEONS[((Math.floor(day) % 7) + 7) % 7];
}

export function getWeekdayTier(tier: number): WeekdayTier {
  return WEEKDAY_TIERS[Math.max(0, Math.min(WEEKDAY_TIERS.length - 1, Math.floor(tier)))];
}
