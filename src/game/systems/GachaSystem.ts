import { equipDefsOfRarity, EQUIP_DEFS, type EquipDef } from '../data/equipment';
import { HERO_ROSTER, createHeroInstance, type HeroDefinition } from '../data/heroes';
import type { GachaBannerEntry } from '../data/gachaBanners';
import type { EquipmentItem, HeroData, Rarity } from '../types';
import { EquipmentSystem } from './EquipmentSystem';
import type { SaveData } from './SaveSystem';
import { recordMission } from './MissionProgress';

export interface RateRow {
  rarity: Rarity;
  rate: number;
}

/** Rarity rates, kept as an exported table so the UI can display them
 *  verbatim (Japan's Act against Unjustifiable Premiums and Misleading
 *  Representations requires gacha odds to be disclosed to players). A banner
 *  can bring its own (GachaBannerEntry.rates). */
export const GACHA_RATES: RateRow[] = [
  { rarity: 5, rate: 0.005 },
  { rarity: 4, rate: 0.025 },
  { rarity: 3, rate: 0.1 },
  { rarity: 2, rate: 0.27 },
  { rarity: 1, rate: 0.6 },
];

/** 装備ガチャ: its own rates and prices (a ten-pull is ten pieces of equipment). */
export const EQUIP_GACHA_RATES: RateRow[] = [
  { rarity: 5, rate: 0.02 },
  { rarity: 4, rate: 0.08 },
  { rarity: 3, rate: 0.2 },
  { rarity: 2, rate: 0.3 },
  { rarity: 1, rate: 0.4 },
];
export const EQUIP_SINGLE_COST = 50;
export const EQUIP_TEN_COST = 450;

export const SINGLE_PULL_COST = 100;
export const TEN_PULL_COST = 900;

/** Gold awarded instead of a new copy when a pull lands on a hero whose owned
 *  copies already cover every phase left to MAX_PHASE (see SaveSystem.addHero),
 *  scaled so it still feels worth something at any rarity. */
export const DUPLICATE_GOLD_REWARD: Record<Rarity, number> = {
  1: 20,
  2: 60,
  3: 200,
  4: 700,
  5: 2500,
};

const isEquipment = (banner: GachaBannerEntry): boolean => banner.kind === 'equipment';

/** Who (or what) can come out of a banner: the heroes of its pool, or the pieces of equipment. */
export function heroPoolOf(banner: GachaBannerEntry): HeroDefinition[] {
  return banner.pool ? HERO_ROSTER.filter((h) => banner.pool!.includes(h.id)) : HERO_ROSTER;
}

export function equipPoolOf(): EquipDef[] {
  return EQUIP_DEFS;
}

function availableRarities(banner: GachaBannerEntry): Set<Rarity> {
  return new Set<Rarity>((isEquipment(banner) ? equipPoolOf() : heroPoolOf(banner)).map((d) => d.rarity));
}

/** The rates the banner really rolls with: its own table, with the share of a rarity that has
 *  nobody in the pool handed to the next rarity down that does (so the shown rates always add up). */
export function ratesOf(banner: GachaBannerEntry): RateRow[] {
  const base = banner.rates ?? (isEquipment(banner) ? EQUIP_GACHA_RATES : GACHA_RATES);
  const sorted = [...base].sort((a, b) => b.rarity - a.rarity);
  const have = availableRarities(banner);
  const out: RateRow[] = [];
  let carry = 0;
  for (const row of sorted) {
    if (!have.has(row.rarity)) {
      carry += row.rate;
      continue;
    }
    out.push({ rarity: row.rarity, rate: row.rate + carry });
    carry = 0;
  }
  // Whatever is left over (nobody low enough) goes to the lowest rarity that exists.
  if (carry > 0 && out.length > 0) out[out.length - 1].rate += carry;
  return out;
}

export function costOf(banner: GachaBannerEntry, count: 1 | 10): number {
  if (count === 1) return banner.singleCost ?? (isEquipment(banner) ? EQUIP_SINGLE_COST : SINGLE_PULL_COST);
  return banner.tenCost ?? (isEquipment(banner) ? EQUIP_TEN_COST : TEN_PULL_COST);
}

/** Pulls still to go before the banner's 天井 certainty, or null for a banner without one. */
export function pityLeft(save: SaveData, banner: GachaBannerEntry): number | null {
  if (!banner.pity) return null;
  return Math.max(1, banner.pity.at - (save.gachaPity[banner.id] ?? 0));
}

function rollFrom(rows: RateRow[], rng: () => number): Rarity {
  const total = rows.reduce((sum, r) => sum + r.rate, 0);
  let r = rng() * total;
  for (const row of rows) {
    r -= row.rate;
    if (r < 0) return row.rarity;
  }
  return rows[rows.length - 1].rarity;
}

/** The rarity of each of `count` pulls, in order, keeping the banner's 天井 count in the save. */
function rollRarities(save: SaveData, banner: GachaBannerEntry, count: number, rng: () => number): Rarity[] {
  const rows = ratesOf(banner);
  const pity = banner.pity;
  let counter = save.gachaPity[banner.id] ?? 0;
  const out: Rarity[] = [];
  for (let i = 0; i < count; i++) {
    counter += 1;
    let rarity = rollFrom(rows, rng);
    if (pity && counter >= pity.at && rarity < pity.minRarity) {
      // The certain one: drawn only from the rarities that satisfy it, by their own shares.
      const good = rows.filter((r) => r.rarity >= pity.minRarity);
      rarity = good.length > 0 ? rollFrom(good, rng) : rows[0].rarity;
    }
    if (pity && rarity >= pity.minRarity) counter = 0;
    out.push(rarity);
  }
  if (pity) save.gachaPity[banner.id] = counter;
  recordMission(save, 'gacha_pull', count);
  return out;
}

export const GachaSystem = {
  /** `count` heroes from a hero banner (new copies, not yet in the roster). */
  pullHeroes(save: SaveData, banner: GachaBannerEntry, count: number, rng: () => number = Math.random): HeroData[] {
    const pool = heroPoolOf(banner);
    return rollRarities(save, banner, count, rng).map((rarity) => {
      const same = pool.filter((h) => h.rarity === rarity);
      const def = same[Math.floor(rng() * same.length)];
      return createHeroInstance(def.id, `hero-${Date.now()}-${Math.floor(rng() * 1e6)}`);
    });
  },

  /** `count` pieces of equipment from an equipment banner (not yet in anyone's bag). */
  pullEquipment(save: SaveData, banner: GachaBannerEntry, count: number, rng: () => number = Math.random): EquipmentItem[] {
    return rollRarities(save, banner, count, rng).map((rarity) => {
      const same = equipDefsOfRarity(rarity);
      return EquipmentSystem.create(same[Math.floor(rng() * same.length)].id);
    });
  },
};
