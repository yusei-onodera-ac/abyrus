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
  /** Enemy strength (the same continuous scale as a stage's `difficulty`, see ProgressionSystem: 0.3 for the first stage,
   *  47.5 for the last main stage), when it is not just that of `likeStage`. It also scales the gold and 技素. */
  difficulty?: number;
  /** The hero level whose EXP the clear pays, when it is not that of `likeStage`. */
  expLevel?: number;
  /** Shown on the tier's card instead of "クエストN層ほどの強さ" (a warning about how hard it is). */
  note?: string;
}

export const WEEKDAY_TIERS: WeekdayTier[] = [
  { id: 'easy', name: '初級', needStage: 0, stamina: 10, likeStage: 8 },
  { id: 'normal', name: '中級', needStage: 30, stamina: 14, likeStage: 40 },
  { id: 'hard', name: '上級', needStage: 60, stamina: 18, likeStage: 75 },
  // 超級: the enemies of the last region (five ★5-tier beasts) at difficulty 58 - well beyond the campaign's last stage (47.5).
  // The squad is the same every day (3 mages, an archer, a healer). Measured with the battle engine (auto skills, no gear):
  // five ★5 heroes at Lv100 win about 60% (about 80% with every skill at level 10, about 30% with none); at Lv95, or with
  // five ★4 heroes at Lv100, they never win. So it takes ★5 or better at about the top level,
  // Its rewards are the best of the four: the last amount of each list below is double the old scale, and the gold, 技素
  // and EXP grow with the difficulty.
  { id: 'expert', name: '超級', needStage: 100, stamina: 30, likeStage: 145, difficulty: 58, expLevel: 99, note: '★5・Lv100の編成で、やっと倒せる強さ' },
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
      { material: 'wood', amounts: [30, 80, 200, 1000] },
      { material: 'stone', amounts: [20, 50, 130, 640] },
      { material: 'iron', amounts: [10, 30, 80, 400] },
    ],
    goldMul: 3,
    skillEssence: [100, 300, 700, 4000],
    phaseMaterials: [0, 1, 1, 4],
    items: [
      { item: 'exp_m', amounts: [5, 4, 2, 0] },
      { item: 'exp_l', amounts: [0, 0, 1, 4] },
      { item: 'exp_xl', amounts: [0, 0, 0, 2] },
      { item: 'equip_essence', amounts: [30, 80, 200, 1000] },
    ],
  },
  {
    day: 1,
    name: '経験の洞窟',
    theme: '月曜日は、経験値素材がたくさん手に入る',
    materials: [
      { material: 'stone', amounts: [60, 160, 400, 2000] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 1],
    items: [
      { item: 'exp_s', amounts: [20, 0, 0, 0] },
      { item: 'exp_m', amounts: [0, 10, 5, 0] },
      { item: 'exp_l', amounts: [0, 0, 3, 10] },
      { item: 'exp_xl', amounts: [0, 0, 0, 2] },
    ],
  },
  {
    day: 2,
    name: '鍛冶の坑道',
    theme: '火曜日は、装備強化素材がたくさん手に入る',
    materials: [
      { material: 'iron', amounts: [40, 110, 280, 1400] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 1],
    items: [{ item: 'equip_essence', amounts: [60, 160, 400, 2000] }],
  },
  {
    day: 3,
    name: '技の書庫',
    theme: '水曜日は、技素がたくさん手に入る',
    materials: [
      { material: 'wood', amounts: [60, 160, 400, 2000] },
    ],
    goldMul: 1,
    skillEssence: [200, 600, 1500, 8000],
    phaseMaterials: [0, 0, 0, 1],
    items: [],
  },
  {
    day: 4,
    name: '位階の聖域',
    theme: '木曜日は、フェーズ素材が手に入る',
    materials: [
      { material: 'wood', amounts: [30, 80, 200, 1000] },
      { material: 'stone', amounts: [30, 80, 200, 1000] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [1, 1, 2, 6],
    items: [],
  },
  {
    day: 5,
    name: '黄金の宝物庫',
    theme: '金曜日は、ゴールドが8倍になる',
    materials: [
      { material: 'iron', amounts: [20, 55, 140, 700] },
      { material: 'stone', amounts: [30, 80, 200, 1000] },
    ],
    goldMul: 8,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 1],
    items: [],
  },
  {
    day: 6,
    name: '修練の闘技場',
    theme: '土曜日は、経験値素材と装備強化素材が手に入る',
    materials: [
      { material: 'wood', amounts: [30, 80, 200, 1000] },
      { material: 'iron', amounts: [20, 55, 140, 700] },
    ],
    goldMul: 1,
    skillEssence: [0, 0, 0, 0],
    phaseMaterials: [0, 0, 0, 1],
    items: [
      { item: 'exp_s', amounts: [10, 0, 0, 0] },
      { item: 'exp_m', amounts: [0, 5, 3, 0] },
      { item: 'exp_l', amounts: [0, 0, 1, 6] },
      { item: 'equip_essence', amounts: [30, 80, 200, 1000] },
    ],
  },
];

export function getWeekdayDungeon(day: number): WeekdayDungeon {
  return WEEKDAY_DUNGEONS[((Math.floor(day) % 7) + 7) % 7];
}

export function getWeekdayTier(tier: number): WeekdayTier {
  return WEEKDAY_TIERS[Math.max(0, Math.min(WEEKDAY_TIERS.length - 1, Math.floor(tier)))];
}
