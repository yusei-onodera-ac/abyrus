import type { HeroData, Rarity } from '../types';
import { createHeroInstance, getHeroesByRarity } from '../data/heroes';

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

/** Gold awarded instead of a new copy when a pull lands on a hero already
 *  owned, scaled so a duplicate still feels worth something at any rarity. */
export const DUPLICATE_GOLD_REWARD: Record<Rarity, number> = {
  1: 20,
  2: 60,
  3: 200,
  4: 700,
  5: 2500,
};

function rollRarity(): Rarity {
  const r = Math.random();
  let acc = 0;
  for (const entry of GACHA_RATES) {
    acc += entry.rate;
    if (r < acc) return entry.rarity;
  }
  return 1;
}

export const GachaSystem = {
  pullOne(): HeroData {
    const rarity = rollRarity();
    const pool = getHeroesByRarity(rarity);
    const def = pool[Math.floor(Math.random() * pool.length)];
    const instanceId = `hero-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    return createHeroInstance(def.id, instanceId);
  },

  pullMany(count: number): HeroData[] {
    return Array.from({ length: count }, () => this.pullOne());
  },
};
