import {
  IDLE_AD_BOOSTS_PER_DAY,
  IDLE_AD_BOOST_HOURS,
  IDLE_BASE_CAP_HOURS,
  IDLE_EQUIP_PER_HOUR,
  IDLE_EQUIP_RARITY_WEIGHTS,
  IDLE_ESSENCE_CLEARS_PER_HOUR,
  IDLE_GOLD_CLEARS_PER_HOUR,
  IDLE_ITEM_PER_HOUR,
  IDLE_PHASE_PER_HOUR,
} from '../data/idle';
import { ITEMS, type ItemId } from '../data/items';
import { PREMIUM } from '../data/premium';
import type { EquipmentItem, Rarity } from '../types';
import type { BigNumber } from './BigNumber';
import { EquipmentSystem } from './EquipmentSystem';
import { PremiumSystem } from './PremiumSystem';
import { MAIN_STAGE_COUNT, STAGES_PER_REGION, ProgressionSystem } from './ProgressionSystem';
import { SaveSystem, type SaveData } from './SaveSystem';
import { periodKey } from './ShopSystem';

const HOUR_MS = 60 * 60 * 1000;

/** What has piled up, as it would be handed over right now. */
export interface IdlePreview {
  /** Hours piled up, never above `capHours`. */
  hours: number;
  capHours: number;
  full: boolean;
  gold: BigNumber;
  skillEssence: number;
  phaseMaterials: number;
  items: { item: ItemId; amount: number }[];
  /** Pieces of equipment so far (the claim adds a chance of one more). */
  equipment: number;
}

export interface IdleClaim {
  preview: IdlePreview;
  equipment: EquipmentItem[];
}

/** Where in the campaign the rates are read from: the last stage cleared, and its region. */
function progressReference(save: SaveData): { stageIndex: number; region: number } {
  const stageIndex = Math.max(0, Math.min(MAIN_STAGE_COUNT - 1, save.stageProgress - 1));
  return { stageIndex, region: Math.min(IDLE_EQUIP_RARITY_WEIGHTS.length - 1, Math.floor(stageIndex / STAGES_PER_REGION)) };
}

function rollRarity(weights: number[], rng: () => number): Rarity {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return (i + 1) as Rarity;
  }
  return 1;
}

export const IdleSystem = {
  /** Hours of 放置報酬 that can pile up: more with the プレミアムパス. */
  capHours(save: SaveData, now = Date.now()): number {
    return PremiumSystem.isActive(save, now) ? PREMIUM.idleCapHours : IDLE_BASE_CAP_HOURS;
  },

  /** Hours piled up since the last claim, capped. A clock set back counts as none. */
  hoursPiled(save: SaveData, now = Date.now()): number {
    const elapsed = Math.max(0, now - save.idle.lastClaimAt) / HOUR_MS;
    return Math.min(elapsed, this.capHours(save, now));
  },

  /** Per-hour rates for the player's progress (equipment excluded: see IDLE_EQUIP_PER_HOUR). */
  perHour(save: SaveData): { gold: BigNumber; skillEssence: number; phaseMaterials: number; items: Record<ItemId, number> } {
    const { stageIndex, region } = progressReference(save);
    const stage = ProgressionSystem.getStage(stageIndex);
    const items = {} as Record<ItemId, number>;
    for (const id of Object.keys(ITEMS) as ItemId[]) items[id] = IDLE_ITEM_PER_HOUR[id][region] ?? 0;
    return {
      gold: stage.rewardGold.mul(IDLE_GOLD_CLEARS_PER_HOUR),
      skillEssence: stage.rewardSkillEssence * IDLE_ESSENCE_CLEARS_PER_HOUR,
      phaseMaterials: IDLE_PHASE_PER_HOUR,
      items,
    };
  },

  preview(save: SaveData, now = Date.now()): IdlePreview {
    const hours = this.hoursPiled(save, now);
    const capHours = this.capHours(save, now);
    const rate = this.perHour(save);
    return {
      hours,
      capHours,
      full: hours >= capHours,
      gold: rate.gold.mul(hours),
      skillEssence: Math.floor(rate.skillEssence * hours),
      phaseMaterials: Math.floor(rate.phaseMaterials * hours),
      items: (Object.keys(rate.items) as ItemId[]).map((item) => ({ item, amount: Math.floor(rate.items[item] * hours) })).filter((i) => i.amount > 0),
      equipment: Math.floor(IDLE_EQUIP_PER_HOUR * hours),
    };
  },

  /** True when there is something worth opening the screen for (an hour or more piled up). */
  hasReward(save: SaveData, now = Date.now()): boolean {
    return this.hoursPiled(save, now) >= 1;
  },

  /** Hands over what has piled up and starts it piling again from `now`. */
  claim(save: SaveData, now = Date.now(), rng: () => number = Math.random): IdleClaim {
    const preview = this.preview(save, now);
    SaveSystem.addGold(save, preview.gold);
    SaveSystem.addSkillEssence(save, preview.skillEssence);
    SaveSystem.addPhaseMaterials(save, preview.phaseMaterials);
    for (const { item, amount } of preview.items) SaveSystem.addItem(save, item, amount);

    // Equipment drops whole: the fraction of a piece is a chance of one more.
    const exact = IDLE_EQUIP_PER_HOUR * preview.hours;
    const count = Math.floor(exact) + (rng() < exact - Math.floor(exact) ? 1 : 0);
    const weights = IDLE_EQUIP_RARITY_WEIGHTS[progressReference(save).region];
    const equipment = Array.from({ length: count }, () => EquipmentSystem.grantRandom(save, rollRarity(weights, rng), rng));

    save.idle.lastClaimAt = now;
    return { preview: { ...preview, equipment: count }, equipment };
  },

  /** Ads still available today. */
  adBoostsLeft(save: SaveData, now = Date.now()): number {
    const used = save.idle.adDay === periodKey('day', now) ? save.idle.adCount : 0;
    return Math.max(0, IDLE_AD_BOOSTS_PER_DAY - used);
  },

  /** Moves the clock an hour ahead for a watched ad: 'ok', 'full' (nothing more can pile up) or 'limit' (today's ads are used). */
  boostByAd(save: SaveData, now = Date.now()): 'ok' | 'full' | 'limit' {
    if (this.adBoostsLeft(save, now) === 0) return 'limit';
    if (this.hoursPiled(save, now) >= this.capHours(save, now)) return 'full';
    const day = periodKey('day', now);
    save.idle.adCount = (save.idle.adDay === day ? save.idle.adCount : 0) + 1;
    save.idle.adDay = day;
    save.idle.lastClaimAt -= IDLE_AD_BOOST_HOURS * HOUR_MS;
    return 'ok';
  },
};
