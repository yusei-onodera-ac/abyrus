import type { HeroClass } from '../types';

/**
 * The 5 regions of the Quest campaign (クエストモード), each 30 main
 * stages deep. Pure content: enemy flavor-name pools, theme colors, and
 * the named "region boss" fought at the end of that region's Extra
 * dungeon all live here so they can be tuned/expanded without touching
 * ProgressionSystem, StageSelectScene, or BattleScene. No monster
 * illustrations exist yet - CharacterGenerator's seed/class/rarity-driven
 * procedural silhouette is the placeholder appearance for every enemy
 * generated from this data, exactly like it already is for the old
 * flat-stage enemies. Swapping in real art later is purely a matter of
 * adding `assets/characters/<id>.png` files keyed off names derived from
 * this file - no scene code needs to change.
 */
/** What the scenery scattered along a region's quest-map road is made of. */
export type RegionMotif = 'pine' | 'dune' | 'peak' | 'pillar' | 'tower';

/** How a region looks, on the quest map and in battle. Pure design data: change
 *  a color or motif here and both screens follow. Real artwork needs no code
 *  either - drop `public/assets/backgrounds/region_<id>.jpg` (the map page) and
 *  `battle_<id>.jpg` (the fights) in and it replaces what is drawn from this. */
export interface RegionLook {
  /** The map page's sky/ground gradient, top and bottom. */
  skyTop: number;
  skyBottom: number;
  motif: RegionMotif;
  /** Scenery colors: far (dark) and near (light). */
  motifDark: number;
  motifLight: number;
  /** Multiplied over the shared battle backdrop, so each region's fights read
   *  differently until it has artwork of its own. 0xffffff leaves it as is. */
  battleTint: number;
}

export interface RegionDef {
  id: string;
  /** 0-4, matches its position in REGIONS and its slice of the 150 main stages. */
  index: number;
  name: string;
  /** One-line theme shown under the region name on the map screen. */
  mapDescription: string;
  /** Accent color for this region's map tab/nodes/story backgrounds. */
  themeColor: number;
  /** Adjectives describing the ferality itself, shared across all regions
   *  and combined with `feralAnimals` below (prefix + animal), the same
   *  prefix+suffix combinatorial approach ProgressionSystem's own
   *  NAME_P1/NAME_P2 already uses for the old SF-flavored enemy names. */
  feralAnimals: string[];
  /** The strongest feral animal native to this region - fought alone as
   *  the 6th (final) stage of this region's 6-stage Extra dungeon. */
  bossName: string;
  bossClass: HeroClass;
  look: RegionLook;
}

/** The final battle's own battle-backdrop tint (blood red over the shared backdrop). */
export const FINAL_BATTLE_TINT = 0xc05a5a;

/** Shared "what's wrong with it" adjectives, combined with each region's
 *  own `feralAnimals` list to generate that region's rank-and-file enemies
 *  (e.g. "狂乱の鹿", "牙剥く狼"). Kept separate from the animal list so
 *  adding one new adjective instantly multiplies variety across every
 *  region at once. */
export const FERAL_PREFIXES: string[] = [
  '狂乱の', '紅瘴の', '牙剥く', '血に染まる', '猛る',
  '呪われし', '瘴気纏う', '暴れ', '目の爛れた', '牙まみれの',
];

export const REGIONS: RegionDef[] = [
  {
    id: 'forest',
    index: 0,
    name: '迷いの森',
    mapDescription: '赤い瘴気が漂い始めた、プレイヤーの故郷の森。',
    themeColor: 0x4c8a4c,
    feralAnimals: ['鹿', '狼', '熊', '兎', '狐', '猿', '烏', '猪'],
    bossName: '紅角の大鹿・ガルムード',
    bossClass: 'tank',
    look: { skyTop: 0x0f2418, skyBottom: 0x2f5230, motif: 'pine', motifDark: 0x16361f, motifLight: 0x3f8043, battleTint: 0xffffff },
  },
  {
    id: 'wasteland',
    index: 1,
    name: '灰塵の荒野',
    mapDescription: '狂暴化が森の外にも広がっていた、隊商と猟師ギルドの大地。',
    themeColor: 0xc9933f,
    feralAnimals: ['隼', '蠍', '禿鷲', '砂蜥蜴', '野犬', '毒蛇', '駱駝', '山猫'],
    bossName: '砂塵の女王蠍・アラクネア',
    bossClass: 'archer',
    look: { skyTop: 0x3a2410, skyBottom: 0x8f5d28, motif: 'dune', motifDark: 0x5c3a18, motifLight: 0xd09a45, battleTint: 0xf0b878 },
  },
  {
    id: 'frostpeak',
    index: 2,
    name: '蒼氷の山嶺',
    mapDescription: '共生研究院の廃研究所が眠る、氷に閉ざされた山岳地帯。',
    themeColor: 0x6fc8e0,
    feralAnimals: ['白虎', '雪豹', '巨角羊', '氷狼', '白鷲', '穴熊', '雪猿', '樹氷鹿'],
    bossName: '白銀の山王虎・コンゴウ',
    bossClass: 'warrior',
    look: { skyTop: 0x10283a, skyBottom: 0x4f819c, motif: 'peak', motifDark: 0x2a4a62, motifLight: 0xd4ecf8, battleTint: 0x9fd4f0 },
  },
  {
    id: 'ruins',
    index: 3,
    name: '瘴気の遺跡',
    mapDescription: '教授が因子を培養し続ける、濃い瘴気漂う古代遺跡。',
    themeColor: 0x8a4fcf,
    feralAnimals: ['骸蝙蝠', '瘴狼', '古骨竜', '穢獣', '腐肉犀', '瘴猿', '墓場烏', '呪蛇'],
    bossName: '古骨の竜・ネクロドラコ',
    bossClass: 'mage',
    look: { skyTop: 0x1c1030, skyBottom: 0x4c3375, motif: 'pillar', motifDark: 0x2a1a44, motifLight: 0x9a5fe0, battleTint: 0xb090e0 },
  },
  {
    id: 'twilight',
    index: 4,
    name: '黄昏の都',
    mapDescription: '因子をばら撒かれ、動物の暴走で混乱に陥った都。',
    themeColor: 0xd6527a,
    feralAnimals: ['野良犬', '軍鳩', '下水鼠', '野良猫', '暴走馬', '闇猫', '逃亡鷹', '見世物熊'],
    bossName: '闇走りの大狼・クロガネ',
    bossClass: 'warrior',
    look: { skyTop: 0x2a1020, skyBottom: 0x80345a, motif: 'tower', motifDark: 0x2a1220, motifLight: 0xe0608a, battleTint: 0xe890a8 },
  },
];

export const REGION_COUNT = REGIONS.length;

export function getRegion(index: number): RegionDef {
  return REGIONS[Math.max(0, Math.min(REGION_COUNT - 1, index))];
}

/** Deterministically builds a feral-flavor enemy name from a region +
 *  PRNG draw - mirrors ProgressionSystem's own NAME_P1/NAME_P2 combination
 *  so quest enemies read with the same "generated from two small pools"
 *  texture as the original SF-flavored ones. */
export function pickFeralName(region: RegionDef, rng: () => number): string {
  const prefix = FERAL_PREFIXES[Math.floor(rng() * FERAL_PREFIXES.length)];
  const animal = region.feralAnimals[Math.floor(rng() * region.feralAnimals.length)];
  return prefix + animal;
}
