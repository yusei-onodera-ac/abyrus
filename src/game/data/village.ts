/**
 * 村: the player's own village, built on a grid and grown over time. Edit this file to change what can
 * be built, what it costs and how much it pays (数字は仮のバランス).
 *
 * The village pays out through 放置報酬: the ゴールド that piles up while the game is closed is the stage
 * rate (data/idle.ts) times the village's 売上倍率 - the sum of every 店 and 市場's value, raised by
 * every 民家. A new village starts with one level-1 店, worth exactly 1, so nobody earns less than before.
 *
 * Beyond that: 採集施設 (伐採所・採石場・鉱山) add 木材・鉄・石 to the 放置報酬; 柵 and 門 keep out the 襲撃 that come now and
 * then (answer one in battle, or let the walls turn it away - or lose some buildings until they are repaired);
 * 装飾 (木・花壇・噴水・銅像) is looks only: put up at once with no builder, moved for free, and never broken by a 襲撃;
 * any building but the 城 can be removed (撤去) for some of its 素材 back;
 * 行商人 and 宝箱 turn up on the map to be tapped; 村の依頼 (data/villageQuests.ts) pay materials for each day's chores.
 */

/** The map: tiles across and down (drawn as a diamond of 2:1 tiles, see ui/VillageArt.ts). A building covers `w` x `h` of them. */
export const VILLAGE_COLS = 18;
export const VILLAGE_ROWS = 18;

export type BuildingKind = 'castle' | 'shop' | 'market' | 'house' | 'lumber' | 'quarry' | 'mine' | 'fence' | 'gate' | 'tree' | 'flowers' | 'fountain' | 'statue' | 'road';

/** The tabs of the 建築 menu: 商い (what pays gold), 採集 (what gathers 素材), 防衛 (what keeps the 襲撃 out), 装飾 (looks only). */
export type BuildTab = 'trade' | 'gather' | 'defend' | 'decor';
export const BUILD_TABS: { id: BuildTab; name: string }[] = [
  { id: 'trade', name: '商い' },
  { id: 'gather', name: '採集' },
  { id: 'defend', name: '防衛' },
  { id: 'decor', name: '装飾' },
];

/**
 * 村の素材: only the village uses them, so only the village shows them (the resource bar and the bag do not).
 * They come from the 曜日ダンジョン (data/weekdayDungeons.ts), the stages (VILLAGE_STAGE_DROPS below) and
 * 放置報酬 (data/idle.ts), and are spent on building and strengthening.
 */
export type VillageMaterial = 'wood' | 'iron' | 'stone';

/** 木材 / 鉄 / 石 in the order the village lists them, with how each is named and coloured. */
export const VILLAGE_MATERIALS: { id: VillageMaterial; name: string; color: string }[] = [
  { id: 'wood', name: '木材', color: '#e0b070' },
  { id: 'iron', name: '鉄', color: '#b8c4d4' },
  { id: 'stone', name: '石', color: '#cfc8bc' },
];

/** An amount of some of the materials (the ones left out are 0). */
export type MaterialBundle = Partial<Record<VillageMaterial, number>>;

export function isVillageMaterial(value: unknown): value is VillageMaterial {
  return VILLAGE_MATERIALS.some((m) => m.id === value);
}

export function materialName(id: VillageMaterial): string {
  return VILLAGE_MATERIALS.find((m) => m.id === id)?.name ?? id;
}

/** What a new village (or a save from before 村 had materials) starts with: enough for the first few buildings. */
export const VILLAGE_START_MATERIALS: Record<VillageMaterial, number> = { wood: 100, iron: 0, stone: 60 };

/**
 * Moving a building takes it down and puts it up again: the 解体 takes this share of the time the building's
 * level took to build, the 再建築 that share. It keeps its level and costs nothing but a builder; it earns
 * nothing until it stands again.
 */
export const MOVE_DEMOLISH_SHARE = 0.25;
export const MOVE_REBUILD_SHARE = 0.5;
/** ...but never less than this many seconds for either part. */
export const MOVE_MIN_SECONDS = 30;

/**
 * Taking a building away (撤去) is instant and frees its place, and gives back this share of the 素材 that every
 * level it has reached took (rounded down). The ゴールド is not given back, so building and removing is never a gain.
 */
export const REMOVE_REFUND_SHARE = 0.4;

/**
 * 素材 a clear of a stage of the campaign may drop (by region reached: 迷いの森 ... 黄昏の都), on top of its
 * ordinary drops; a region's last stage pays the boss multiple (data/stageRewards.ts).
 */
export const VILLAGE_STAGE_DROPS: { material: VillageMaterial; chance: number; amounts: number[] }[] = [
  { material: 'wood', chance: 0.35, amounts: [5, 8, 13, 20, 32] },
  { material: 'stone', chance: 0.45, amounts: [6, 10, 16, 25, 40] },
  { material: 'iron', chance: 0.25, amounts: [2, 4, 6, 10, 16] },
];

// ---- 襲撃: beasts come to the village now and then.
/** A 襲撃 arrives this many hours after the last one was dealt with... */
export const RAID_INTERVAL_HOURS = 8;
/** ...and waits this many hours to be answered. Left alone, it is turned away by the walls (防衛 at least RAID_POWER) or breaks things. */
export const RAID_WINDOW_HOURS = 6;
/** How strong a 襲撃 is, by region reached (迷いの森 ... 黄昏の都): the 防衛 of every 柵 and 門 added up has to reach this. */
export const RAID_POWER = [6, 18, 45, 100, 200];
/** A 襲撃 that gets through breaks 1 to this many buildings (the more it beats the walls by, the more). */
export const RAID_DAMAGE_MAX = 3;
/** Mending a broken building costs this share of the 素材 its level took (no gold, no builder, no waiting). */
export const REPAIR_SHARE = 0.3;
/** What beating a 襲撃 in battle pays, by region reached: 素材, and this many hours of the 放置報酬 gold. */
export const RAID_REWARD_MATERIALS: Record<VillageMaterial, number>[] = [
  { wood: 50, iron: 15, stone: 70 },
  { wood: 90, iron: 30, stone: 120 },
  { wood: 150, iron: 55, stone: 200 },
  { wood: 240, iron: 90, stone: 320 },
  { wood: 380, iron: 140, stone: 500 },
];
export const RAID_REWARD_GOLD_HOURS = 1.5;
/** A 襲撃's beasts are as strong as the main stage this many stages behind the furthest one cleared (never below the first). */
export const RAID_STAGES_BELOW = 5;
/** プレイヤーEXP a won 襲撃 gives. */
export const RAID_PLAYER_EXP = 10;

// ---- 行商人 and 宝箱: turn up on the map, tap to take what they hold.
export type WandererKind = 'chest' | 'merchant';
/** One may turn up this many hours after the last (while there are fewer than WANDERER_MAX on the map)... */
export const WANDERER_SPAWN_HOURS = 3;
export const WANDERER_MAX = 3;
/** ...and stays this long before it leaves. */
export const WANDERER_LIFE_HOURS = 12;
export const WANDERERS: Record<WandererKind, { name: string; chance: number; goldHours: number; materials: Record<VillageMaterial, number>[] }> = {
  chest: {
    name: '宝箱',
    chance: 0.6,
    goldHours: 0,
    materials: [
      { wood: 30, iron: 10, stone: 40 },
      { wood: 55, iron: 18, stone: 70 },
      { wood: 90, iron: 32, stone: 115 },
      { wood: 145, iron: 52, stone: 185 },
      { wood: 230, iron: 85, stone: 290 },
    ],
  },
  merchant: {
    name: '行商人',
    chance: 0.4,
    goldHours: 2,
    materials: [
      { wood: 15, iron: 4, stone: 15 },
      { wood: 25, iron: 8, stone: 28 },
      { wood: 40, iron: 14, stone: 45 },
      { wood: 65, iron: 22, stone: 72 },
      { wood: 100, iron: 36, stone: 115 },
    ],
  },
};

// ---- Hurrying with 魔晶石.
/** Finishing work at once costs this many 魔晶石 for every 10 minutes it still has to run (at least one lot, at most FINISH_GEMS_MAX). */
export const FINISH_GEMS_PER_10_MIN = 2;
export const FINISH_GEMS_MAX = 600;
/** An extra builder, bought with 魔晶石: the price of the first, the second... (this many can be bought). */
export const EXTRA_BUILDER_GEMS = [300, 800];

/** What it takes to reach one level of a building, and what it is worth there. */
export interface BuildingLevel {
  /** ゴールド, in hours of the 放置報酬 gold at the stage reached - so the price keeps up with the player. */
  costHours: number;
  /** 素材 it takes besides (fixed amounts; none when left out). */
  materials?: MaterialBundle;
  /** Seconds the work takes (the building cannot be used meanwhile; a new one starts at level 0). */
  seconds: number;
  /** The 城 level needed before this level can be reached (the 城's own levels are not held back by it). */
  needCastle: number;
  /** 店 / 市場: 売上 in units of "a level-1 店". 民家: how much of that it adds to every shop (0.05 = +5%). 採集施設: 素材 an
   *  hour. 柵 / 門: 防衛. 城: unused. */
  value: number;
}

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  description: string;
  /** Footprint, in tiles. */
  w: number;
  h: number;
  /** Whether the 建築 menu offers it (the 城 is only the one the village starts with). */
  buildable: boolean;
  /** Which tab of the 建築 menu lists it (商い unless said). */
  tab?: BuildTab;
  /** 採集施設: the 素材 its `value` an hour goes into (it piles up with 放置報酬 and is handed over with it). */
  produces?: VillageMaterial;
  /** 柵 / 門: its `value` counts as 防衛 against a 襲撃. */
  defense?: boolean;
  /** Whether it can be taken down and put up elsewhere (see MOVE_DEMOLISH_SHARE). The 城 is the village's centre and stays. */
  movable: boolean;
  /** Whether it can be removed (see REMOVE_REFUND_SHARE); true unless said. The 城 stays. */
  removable?: boolean;
  /** 装飾: looks only. It has one level, is put up at once with no builder, can be moved at once at no cost, and a 襲撃 never breaks it. */
  decor?: boolean;
  /** 道: a 1x1 paving piece laid in lines (see the scene's road mode). It is a 装飾 that does not count as one for the goals, never
   *  blocks a building (a building simply stands over it) and joins the pieces next to it. */
  road?: boolean;
  /** How many may stand, by 城 level (index 0 = 城 Lv1). 0 = not yet. */
  maxCount: number[];
  /** Index 0 = reaching level 1 (building it), index 1 = level 2, ... */
  levels: BuildingLevel[];
  /** Tuning for the supplied pictures (public/assets/village/<kind>_<level>.png), which are scaled so the diamond
   *  they stand on fills the footprint's width: `scale` makes them bigger or smaller than that (default 1), `dy`
   *  moves them down (px at 100%, default 0). */
  art?: { scale?: number; dy?: number };
}

export const BUILDINGS: BuildingDef[] = [
  {
    kind: 'castle',
    name: '城',
    description: '村の中心。強くするほど、建てられる数と、建物の最大レベルが増える。',
    w: 4,
    h: 4,
    buildable: false,
    movable: false,
    removable: false,
    maxCount: [1, 1, 1, 1, 1, 1],
    levels: [
      { costHours: 0, seconds: 0, needCastle: 1, value: 0 },
      { costHours: 8, materials: { wood: 100, stone: 150, iron: 30 }, seconds: 3600, needCastle: 1, value: 0 },
      { costHours: 30, materials: { wood: 300, stone: 500, iron: 150 }, seconds: 4 * 3600, needCastle: 1, value: 0 },
      { costHours: 100, materials: { wood: 900, stone: 1500, iron: 500 }, seconds: 8 * 3600, needCastle: 1, value: 0 },
      { costHours: 300, materials: { wood: 2500, stone: 4000, iron: 1500 }, seconds: 16 * 3600, needCastle: 1, value: 0 },
      { costHours: 900, materials: { wood: 6000, stone: 9000, iron: 4000 }, seconds: 24 * 3600, needCastle: 1, value: 0 },
    ],
  },
  {
    kind: 'shop',
    name: '商店',
    description: '品物を売って、放置報酬のゴールドを増やす。',
    w: 2,
    h: 2,
    buildable: true,
    movable: true,
    maxCount: [1, 2, 2, 3, 4, 4],
    levels: [
      { costHours: 3, materials: { wood: 30 }, seconds: 300, needCastle: 1, value: 1 },
      { costHours: 5, materials: { wood: 60, stone: 20 }, seconds: 600, needCastle: 1, value: 1.4 },
      { costHours: 12, materials: { wood: 150, stone: 80 }, seconds: 1800, needCastle: 2, value: 1.9 },
      { costHours: 30, materials: { wood: 400, stone: 200, iron: 60 }, seconds: 2 * 3600, needCastle: 3, value: 2.6 },
      { costHours: 70, materials: { wood: 900, stone: 500, iron: 200 }, seconds: 5 * 3600, needCastle: 4, value: 3.5 },
      { costHours: 160, materials: { wood: 2000, stone: 1200, iron: 500 }, seconds: 10 * 3600, needCastle: 5, value: 4.5 },
    ],
  },
  {
    kind: 'market',
    name: '市場',
    description: '商店よりずっと大きな売上。城をLv3にすると建てられる。',
    w: 3,
    h: 3,
    buildable: true,
    movable: true,
    maxCount: [0, 0, 1, 1, 2, 2],
    levels: [
      { costHours: 20, materials: { wood: 300, stone: 200, iron: 40 }, seconds: 1800, needCastle: 3, value: 3 },
      { costHours: 40, materials: { wood: 600, stone: 400, iron: 100 }, seconds: 3600, needCastle: 3, value: 4.2 },
      { costHours: 90, materials: { wood: 1200, stone: 800, iron: 250 }, seconds: 2 * 3600, needCastle: 4, value: 5.7 },
      { costHours: 200, materials: { wood: 2500, stone: 1600, iron: 600 }, seconds: 4 * 3600, needCastle: 4, value: 7.8 },
      { costHours: 450, materials: { wood: 5000, stone: 3200, iron: 1400 }, seconds: 8 * 3600, needCastle: 5, value: 10.5 },
      { costHours: 1000, materials: { wood: 9000, stone: 6000, iron: 3000 }, seconds: 12 * 3600, needCastle: 6, value: 13.5 },
    ],
  },
  {
    kind: 'house',
    name: '民家',
    description: '人が増えて、村じゅうの店の売上が上がる。',
    w: 2,
    h: 2,
    buildable: true,
    movable: true,
    maxCount: [2, 3, 4, 5, 6, 6],
    levels: [
      { costHours: 2, materials: { wood: 20 }, seconds: 180, needCastle: 1, value: 0.02 },
      { costHours: 4, materials: { wood: 40, stone: 10 }, seconds: 480, needCastle: 1, value: 0.03 },
      { costHours: 9, materials: { wood: 100, stone: 50 }, seconds: 1200, needCastle: 2, value: 0.045 },
      { costHours: 20, materials: { wood: 250, stone: 120 }, seconds: 3600, needCastle: 3, value: 0.065 },
      { costHours: 45, materials: { wood: 600, stone: 300, iron: 60 }, seconds: 3 * 3600, needCastle: 4, value: 0.09 },
      { costHours: 100, materials: { wood: 1400, stone: 800, iron: 200 }, seconds: 6 * 3600, needCastle: 5, value: 0.12 },
    ],
  },
  {
    kind: 'lumber',
    name: '伐採所',
    description: '木を切り出して、放置報酬に木材を足す。',
    w: 2,
    h: 2,
    buildable: true,
    tab: 'gather',
    produces: 'wood',
    movable: true,
    maxCount: [1, 2, 2, 3, 3, 4],
    levels: [
      { costHours: 2, materials: { wood: 20, stone: 10 }, seconds: 240, needCastle: 1, value: 6 },
      { costHours: 4, materials: { wood: 45, stone: 30 }, seconds: 600, needCastle: 1, value: 10 },
      { costHours: 9, materials: { wood: 110, stone: 90 }, seconds: 1500, needCastle: 2, value: 16 },
      { costHours: 20, materials: { wood: 260, stone: 220, iron: 30 }, seconds: 3600, needCastle: 3, value: 25 },
      { costHours: 45, materials: { wood: 600, stone: 500, iron: 90 }, seconds: 3 * 3600, needCastle: 4, value: 39 },
      { costHours: 100, materials: { wood: 1300, stone: 1100, iron: 220 }, seconds: 6 * 3600, needCastle: 5, value: 60 },
    ],
  },
  {
    kind: 'quarry',
    name: '採石場',
    description: '岩を切り出して、放置報酬に石を足す。',
    w: 2,
    h: 2,
    buildable: true,
    tab: 'gather',
    produces: 'stone',
    movable: true,
    maxCount: [1, 1, 2, 2, 3, 4],
    levels: [
      { costHours: 2, materials: { wood: 30 }, seconds: 240, needCastle: 1, value: 5 },
      { costHours: 4, materials: { wood: 70, stone: 20 }, seconds: 600, needCastle: 1, value: 8 },
      { costHours: 9, materials: { wood: 160, stone: 60 }, seconds: 1500, needCastle: 2, value: 13 },
      { costHours: 20, materials: { wood: 380, stone: 140, iron: 30 }, seconds: 3600, needCastle: 3, value: 20 },
      { costHours: 45, materials: { wood: 850, stone: 320, iron: 90 }, seconds: 3 * 3600, needCastle: 4, value: 32 },
      { costHours: 100, materials: { wood: 1800, stone: 700, iron: 220 }, seconds: 6 * 3600, needCastle: 5, value: 50 },
    ],
  },
  {
    kind: 'mine',
    name: '鉱山',
    description: '坑道を掘って、放置報酬に鉄を足す。',
    w: 3,
    h: 3,
    buildable: true,
    tab: 'gather',
    produces: 'iron',
    movable: true,
    maxCount: [0, 1, 1, 2, 2, 3],
    levels: [
      { costHours: 6, materials: { wood: 60, stone: 50 }, seconds: 900, needCastle: 2, value: 3 },
      { costHours: 12, materials: { wood: 140, stone: 120 }, seconds: 2400, needCastle: 2, value: 5 },
      { costHours: 28, materials: { wood: 320, stone: 280, iron: 20 }, seconds: 5400, needCastle: 3, value: 8 },
      { costHours: 60, materials: { wood: 700, stone: 600, iron: 70 }, seconds: 4 * 3600, needCastle: 4, value: 12 },
      { costHours: 130, materials: { wood: 1500, stone: 1300, iron: 180 }, seconds: 8 * 3600, needCastle: 5, value: 19 },
      { costHours: 280, materials: { wood: 3200, stone: 2800, iron: 400 }, seconds: 12 * 3600, needCastle: 6, value: 30 },
    ],
  },
  {
    kind: 'fence',
    name: '柵',
    description: '獣を食い止める。たくさん並べて、村を守る。',
    w: 1,
    h: 1,
    buildable: true,
    tab: 'defend',
    defense: true,
    movable: true,
    maxCount: [4, 6, 8, 10, 12, 16],
    levels: [
      { costHours: 1, materials: { wood: 8, stone: 4 }, seconds: 60, needCastle: 1, value: 1 },
      { costHours: 2, materials: { wood: 20, stone: 12 }, seconds: 180, needCastle: 1, value: 2 },
      { costHours: 4, materials: { wood: 45, stone: 40 }, seconds: 600, needCastle: 2, value: 3 },
      { costHours: 9, materials: { wood: 100, stone: 110, iron: 10 }, seconds: 1800, needCastle: 3, value: 5 },
      { costHours: 20, materials: { wood: 220, stone: 260, iron: 40 }, seconds: 3600, needCastle: 4, value: 8 },
      { costHours: 45, materials: { wood: 480, stone: 600, iron: 110 }, seconds: 2 * 3600, needCastle: 5, value: 12 },
    ],
  },
  {
    kind: 'gate',
    name: '門',
    description: '村の入り口を固める。柵よりずっと強い。',
    w: 2,
    h: 2,
    buildable: true,
    tab: 'defend',
    defense: true,
    movable: true,
    maxCount: [0, 1, 1, 2, 2, 3],
    levels: [
      { costHours: 6, materials: { wood: 40, stone: 60, iron: 10 }, seconds: 600, needCastle: 2, value: 6 },
      { costHours: 12, materials: { wood: 90, stone: 140, iron: 30 }, seconds: 1800, needCastle: 2, value: 10 },
      { costHours: 25, materials: { wood: 200, stone: 320, iron: 80 }, seconds: 3600, needCastle: 3, value: 16 },
      { costHours: 55, materials: { wood: 450, stone: 700, iron: 190 }, seconds: 2 * 3600, needCastle: 4, value: 26 },
      { costHours: 120, materials: { wood: 1000, stone: 1500, iron: 420 }, seconds: 5 * 3600, needCastle: 5, value: 40 },
      { costHours: 260, materials: { wood: 2200, stone: 3300, iron: 950 }, seconds: 10 * 3600, needCastle: 6, value: 60 },
    ],
  },
  // ---- 装飾: looks only (one level, no waiting, no builder).
  {
    kind: 'tree',
    name: '木',
    description: '村に緑を足す。見た目だけの飾り。',
    w: 1,
    h: 1,
    buildable: true,
    tab: 'decor',
    decor: true,
    movable: true,
    maxCount: [4, 6, 8, 10, 12, 16],
    levels: [{ costHours: 0.3, materials: { wood: 10 }, seconds: 0, needCastle: 1, value: 0 }],
  },
  {
    kind: 'flowers',
    name: '花壇',
    description: '色とりどりの花。見た目だけの飾り。',
    w: 1,
    h: 1,
    buildable: true,
    tab: 'decor',
    decor: true,
    movable: true,
    maxCount: [2, 4, 6, 8, 10, 12],
    levels: [{ costHours: 0.5, materials: { wood: 8, stone: 4 }, seconds: 0, needCastle: 1, value: 0 }],
  },
  {
    kind: 'fountain',
    name: '噴水',
    description: '村の広場を飾る噴水。見た目だけの飾り。',
    w: 2,
    h: 2,
    buildable: true,
    tab: 'decor',
    decor: true,
    movable: true,
    maxCount: [0, 0, 1, 1, 2, 2],
    levels: [{ costHours: 15, materials: { stone: 200, iron: 20 }, seconds: 0, needCastle: 3, value: 0 }],
  },
  {
    kind: 'statue',
    name: '銅像',
    description: '村の誇りを形にした像。見た目だけの飾り。',
    w: 2,
    h: 2,
    buildable: true,
    tab: 'decor',
    decor: true,
    movable: true,
    maxCount: [0, 0, 0, 1, 1, 2],
    levels: [{ costHours: 40, materials: { stone: 500, iron: 120 }, seconds: 0, needCastle: 4, value: 0 }],
  },
  {
    kind: 'road',
    name: '道',
    description: '建物をつなぐ道。指でなぞって敷ける。城が育つと、土の道から石畳、大理石へと変わる。',
    w: 1,
    h: 1,
    buildable: true,
    tab: 'decor',
    decor: true,
    road: true,
    movable: false,
    maxCount: [30, 50, 80, 120, 170, 240],
    levels: [{ costHours: 0.02, materials: { stone: 1 }, seconds: 0, needCastle: 1, value: 0 }],
  },
];

/** How many buildings can be under construction or being strengthened at once, by 城 level (index 0 = 城 Lv1). */
export const VILLAGE_BUILDERS = [2, 2, 2, 3, 3, 4];

/** What a village starts with (also what a save from before 村 existed is given): top-left tile of each. */
export const VILLAGE_START: { kind: BuildingKind; x: number; y: number; level: number }[] = [
  { kind: 'castle', x: 7, y: 6, level: 1 },
  { kind: 'shop', x: 8, y: 11, level: 1 },
];

export function getBuilding(kind: BuildingKind): BuildingDef {
  return BUILDINGS.find((b) => b.kind === kind) ?? BUILDINGS[0];
}

export function isBuildingKind(value: unknown): value is BuildingKind {
  return BUILDINGS.some((b) => b.kind === value);
}
