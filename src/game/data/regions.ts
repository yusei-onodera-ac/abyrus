import type { HeroClass } from '../types';

/**
 * The 5 regions of the Quest campaign (クエストモード), each 30 main
 * stages deep. Pure content: enemy flavor-name pools, theme colors, and
 * the named "region boss" fought at the end of that region's Extra
 * dungeon all live here so they can be tuned/expanded without touching
 * ProgressionSystem, StageSelectScene, or BattleScene.
 *
 * Every animal names its picture: `art: 'wolf'` is `public/assets/enemies/wolf.png`
 * (BootScene loads each one in use). An animal or boss without a picture - or whose file
 * is missing - is drawn as CharacterGenerator's procedural silhouette instead, so a new
 * animal needs only a line here, and its picture can follow later.
 */
/** A kind of rank-and-file enemy: its name (after a FERAL_PREFIXES adjective) and its picture. */
export interface FeralAnimal {
  name: string;
  art?: string;
}

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
  /** The animals met here, each combined with a FERAL_PREFIXES adjective
   *  (prefix + animal) to name a rank-and-file enemy. */
  feralAnimals: FeralAnimal[];
  /** The strongest feral animal native to this region - fought alone as
   *  the 6th (final) stage of this region's 6-stage Extra dungeon. */
  bossName: string;
  bossClass: HeroClass;
  /** The boss's picture (see the note at the top); drawn as a silhouette if left out. */
  bossArt?: string;
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
    feralAnimals: [
      { name: 'リス', art: 'squirrel' },
      { name: '熊', art: 'bear' },
      { name: '烏', art: 'crow' },
      { name: 'インコ', art: 'parrot' },
    ],
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
    feralAnimals: [
      { name: '獅子', art: 'lion' },
      { name: 'キリン', art: 'giraffe' },
      { name: '象', art: 'elephant' },
      { name: 'カンガルー', art: 'kangaroo' },
      { name: '砂蜥蜴', art: 'lizard' },
    ],
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
    feralAnimals: [
      { name: 'パンダ', art: 'panda' },
      { name: '穴熊', art: 'bear' },
      { name: '雪猿', art: 'gorilla' },
      { name: '巨象', art: 'elephant' },
    ],
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
    feralAnimals: [
      { name: '呪蛇', art: 'snake' },
      { name: '腐肉犀', art: 'rhino' },
      { name: '瘴猿', art: 'gorilla' },
      { name: '墓場烏', art: 'crow' },
      { name: '瘴蜥蜴', art: 'lizard' },
    ],
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
    feralAnimals: [
      { name: 'プードル', art: 'poodle' },
      { name: '野良猫', art: 'cat' },
      { name: '下水鼠', art: 'rat' },
      { name: '暴走馬', art: 'horse' },
      { name: 'インコ', art: 'parrot' },
    ],
    bossName: '闇走りの大狼・クロガネ',
    bossClass: 'warrior',
    bossArt: 'wolf',
    look: { skyTop: 0x2a1020, skyBottom: 0x80345a, motif: 'tower', motifDark: 0x2a1220, motifLight: 0xe0608a, battleTint: 0xe890a8 },
  },
];

export const REGION_COUNT = REGIONS.length;

export function getRegion(index: number): RegionDef {
  return REGIONS[Math.max(0, Math.min(REGION_COUNT - 1, index))];
}

/** Deterministically builds a feral enemy from a region + PRNG draws: an
 *  adjective plus one of the region's animals ("牙剥く熊"), with that animal's picture. */
export function pickFeral(region: RegionDef, rng: () => number): { name: string; art?: string } {
  const prefix = FERAL_PREFIXES[Math.floor(rng() * FERAL_PREFIXES.length)];
  const animal = region.feralAnimals[Math.floor(rng() * region.feralAnimals.length)];
  return { name: prefix + animal.name, art: animal.art };
}

/** Every picture a region's animals or boss ask for: what BootScene loads. */
export const ENEMY_ART_IDS: string[] = [
  ...new Set(REGIONS.flatMap((r) => [...r.feralAnimals.map((a) => a.art), r.bossArt]).filter((id): id is string => !!id)),
];
