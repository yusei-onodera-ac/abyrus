import type { HeroClass, HeroData, Rarity } from '../types';

/** Rarity rates, kept as an exported table so the UI can display them
 *  verbatim (Japan's Act against Unjustifiable Premiums and Misleading
 *  Representations requires gacha odds to be disclosed to players). */
export const GACHA_RATES: { rarity: Rarity; rate: number }[] = [
  { rarity: 5, rate: 0.005 },
  { rarity: 4, rate: 0.025 },
  { rarity: 3, rate: 0.1 },
  { rarity: 2, rate: 0.27 },
  { rarity: 1, rate: 0.6 },
];

export const SINGLE_PULL_COST = 100;
export const TEN_PULL_COST = 900;

const CLASSES: HeroClass[] = ['warrior', 'mage', 'archer', 'tank', 'healer'];
const NAME_PREFIX = ['断', '煌', '蒼', '焔', '氷', '雷', '闇', '光', '零', '刹'];
const NAME_MID = ['の', 'なる', 'きの'];
const NAME_CORE = ['レイ', 'ミナ', 'ユノ', 'カイ', 'ソラ', 'アリス', 'ノア', 'シズ', 'エル', 'リン'];

function rollRarity(): Rarity {
  const r = Math.random();
  let acc = 0;
  for (const entry of GACHA_RATES) {
    acc += entry.rate;
    if (r < acc) return entry.rarity;
  }
  return 1;
}

function randomName(): string {
  const p = NAME_PREFIX[Math.floor(Math.random() * NAME_PREFIX.length)];
  const m = NAME_MID[Math.floor(Math.random() * NAME_MID.length)];
  const c = NAME_CORE[Math.floor(Math.random() * NAME_CORE.length)];
  return `${p}${m}${c}`;
}

export const GachaSystem = {
  pullOne(): HeroData {
    return {
      id: `hero-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      seed: Math.floor(Math.random() * 2 ** 31),
      rarity: rollRarity(),
      heroClass: CLASSES[Math.floor(Math.random() * CLASSES.length)],
      name: randomName(),
      level: 1,
      exp: 0,
    };
  },

  pullMany(count: number): HeroData[] {
    return Array.from({ length: count }, () => this.pullOne());
  },
};
