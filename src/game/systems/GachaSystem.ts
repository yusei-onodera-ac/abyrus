import { equipDefsOfRarity, EQUIP_DEFS, type EquipDef } from '../data/equipment';
import { HERO_ROSTER, createHeroInstance, type HeroDefinition } from '../data/heroes';
import type { GachaBannerEntry } from '../data/gachaBanners';
import type { EquipmentItem, HeroData, Rarity } from '../types';
import { EquipmentSystem } from './EquipmentSystem';
import type { SaveData } from './SaveSystem';
import { recordMission } from './MissionProgress';
import { t } from '../i18n';

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

const isEquipment = (banner: GachaBannerEntry): boolean => banner.kind === 'equipment';

/** Who (or what) can come out of a banner: the heroes of its pool, or the pieces of equipment. */
export function heroPoolOf(banner: GachaBannerEntry): HeroDefinition[] {
  if (banner.pool) return HERO_ROSTER.filter((h) => banner.pool!.includes(h.id));
  // Everyone - except that a ★6 (the 特設ガチャ's star) is only in a banner whose own rates have a ★6 in them.
  const offered = new Set((banner.rates ?? GACHA_RATES).filter((r) => r.rate > 0).map((r) => r.rarity));
  return HERO_ROSTER.filter((h) => h.rarity < 6 || offered.has(h.rarity));
}

/** The ピックアップ of a banner that are really in its pool. */
export function pickupHeroesOf(banner: GachaBannerEntry): HeroDefinition[] {
  if (!banner.pickup) return [];
  const pool = heroPoolOf(banner);
  return banner.pickup.heroes.flatMap((id) => pool.filter((h) => h.id === id));
}

export interface HeroRate {
  def: HeroDefinition;
  /** The chance one pull is this character (0..1): the rarity's rate times its share of it. */
  rate: number;
  pickup: boolean;
}

/** Each character of the pool with the chance one pull is that character. In a rarity with ピックアップ, `share` of the rarity's
 *  rate is shared by the ピックアップ and the rest by the others; elsewhere the rate is shared evenly. These add up to 1. */
export function heroRatesOf(banner: GachaBannerEntry): HeroRate[] {
  const pool = heroPoolOf(banner);
  const picks = new Set(pickupHeroesOf(banner).map((h) => h.id));
  const share = banner.pickup?.share ?? 0;
  const out: HeroRate[] = [];
  for (const row of ratesOf(banner)) {
    const same = pool.filter((h) => h.rarity === row.rarity);
    const hot = same.filter((h) => picks.has(h.id));
    const rest = same.filter((h) => !picks.has(h.id));
    const hotShare = hot.length === 0 ? 0 : rest.length === 0 ? 1 : share;
    for (const def of hot) out.push({ def, rate: (row.rate * hotShare) / hot.length, pickup: true });
    for (const def of rest) out.push({ def, rate: (row.rate * (1 - hotShare)) / rest.length, pickup: false });
  }
  return out;
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

/** The ten-pull promise of a banner as a sentence for the player, or null for a banner without one. */
export function tenPullNote(banner: GachaBannerEntry): string | null {
  return banner.tenMin ? t('gacha.tenPullNote', { tenMin: banner.tenMin }) : null;
}

/** The ピックアップ line of a banner for a player ("★5 星導のアストラ ／ ★4 閃光のノヴァ…"), or null for a banner without one. */
export function pickupNote(banner: GachaBannerEntry): string | null {
  const picks = pickupHeroesOf(banner);
  if (picks.length === 0) return null;
  return [...picks].sort((a, b) => b.rarity - a.rarity).map((h) => `★${h.rarity} ${h.name}`).join(t('gacha.detail.pickupSeparator'));
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

interface Pull {
  rarity: Rarity;
  /** The pull the 天井 made certain (the natural roll was lower): with a pickup-天井 it is one of the ピックアップ. */
  certain: boolean;
}

/** The rarity of each of `count` pulls, in order, keeping the banner's 天井 count in the save. */
function rollPulls(save: SaveData, banner: GachaBannerEntry, count: number, rng: () => number): Pull[] {
  const rows = ratesOf(banner);
  const pity = banner.pity;
  // 10連 only: the batch holds at least one pull of this ★ or better (the last pull is raised if none came).
  const tenMin = count === 10 ? banner.tenMin : undefined;
  let counter = save.gachaPity[banner.id] ?? 0;
  const out: Pull[] = [];
  for (let i = 0; i < count; i++) {
    counter += 1;
    let rarity = rollFrom(rows, rng);
    let certain = false;
    if (pity && counter >= pity.at && rarity < pity.minRarity) {
      // The certain one: drawn only from the rarities that satisfy it, by their own shares.
      const good = rows.filter((r) => r.rarity >= pity.minRarity);
      rarity = good.length > 0 ? rollFrom(good, rng) : rows[0].rarity;
      certain = true;
    }
    if (tenMin && i === count - 1 && rarity < tenMin && !out.some((r) => r.rarity >= tenMin)) {
      const good = rows.filter((r) => r.rarity >= tenMin);
      if (good.length > 0) rarity = rollFrom(good, rng);
    }
    // (A pull raised above counts for the 天井 like any other: it is checked after.)
    if (pity && rarity >= pity.minRarity) counter = 0;
    out.push({ rarity, certain });
  }
  if (pity) save.gachaPity[banner.id] = counter;
  recordMission(save, 'gacha_pull', count);
  return out;
}

export const GachaSystem = {
  /** `count` heroes from a hero banner (new copies, not yet in the roster). */
  pullHeroes(save: SaveData, banner: GachaBannerEntry, count: number, rng: () => number = Math.random): HeroData[] {
    const rates = heroRatesOf(banner);
    const min = banner.pity?.minRarity ?? 0;
    // A pickup-天井 hands over one of the ピックアップ of ★minRarity or better.
    const certain = banner.pity?.pickup ? pickupHeroesOf(banner).filter((h) => h.rarity >= min) : [];
    return rollPulls(save, banner, count, rng).map(({ rarity, certain: forced }) => {
      let def: HeroDefinition;
      if (forced && certain.length > 0) {
        def = certain[Math.floor(rng() * certain.length)];
      } else {
        // By each character's own weight within the rolled rarity.
        const same = rates.filter((r) => r.def.rarity === rarity);
        const total = same.reduce((sum, r) => sum + r.rate, 0);
        let x = rng() * total;
        def = same[same.length - 1].def;
        for (const r of same) {
          x -= r.rate;
          if (x < 0) {
            def = r.def;
            break;
          }
        }
      }
      return createHeroInstance(def.id, `hero-${Date.now()}-${Math.floor(rng() * 1e6)}`);
    });
  },

  /** `count` pieces of equipment from an equipment banner (not yet in anyone's bag). */
  pullEquipment(save: SaveData, banner: GachaBannerEntry, count: number, rng: () => number = Math.random): EquipmentItem[] {
    return rollPulls(save, banner, count, rng).map(({ rarity }) => {
      const same = equipDefsOfRarity(rarity);
      return EquipmentSystem.create(same[Math.floor(rng() * same.length)].id);
    });
  },
};
