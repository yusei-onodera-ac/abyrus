import {
  IDLE_AD_BOOSTS_PER_DAY,
  IDLE_AD_BOOST_HOURS,
  IDLE_BASE_CAP_HOURS,
  IDLE_EQUIP_PER_HOUR,
  IDLE_EQUIP_RARITY_WEIGHTS,
  IDLE_ESSENCE_CLEARS_PER_HOUR,
  IDLE_GOLD_CLEARS_PER_HOUR,
  IDLE_EQUIP_ESSENCE_PER_HOUR,
  IDLE_EXP_LEVELS_PER_HOUR,
  IDLE_EXP_MIN_LEVEL,
  IDLE_EXP_SPLIT,
  IDLE_PHASE_PER_HOUR,
  IDLE_VILLAGE_MATERIALS_PER_HOUR,
} from '../data/idle';
import { ITEMS, type ItemId } from '../data/items';
import { PREMIUM } from '../data/premium';
import { VILLAGE_MATERIALS, type VillageMaterial } from '../data/village';
import type { EquipmentItem, Rarity } from '../types';
import type { BigNumber } from './BigNumber';
import { EquipmentSystem } from './EquipmentSystem';
import { PremiumSystem } from './PremiumSystem';
import { MAIN_STAGE_COUNT, STAGES_PER_REGION, ProgressionSystem, levelAskedByStage } from './ProgressionSystem';
import { expToNextLevel } from './LevelCurve';
import { SaveSystem, type SaveData } from './SaveSystem';
import { recordMission } from './MissionProgress';
import { periodKey } from './ShopSystem';
import { incomeMultiplier, materialRates } from './VillageIncome';
import { VillageQuests } from './VillageQuests';

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
  /** 木材・鉄・石 for the village (it alone shows them). */
  materials: Record<VillageMaterial, number>;
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

  /** ゴールド per hour at the stage reached, before the 村's 売上倍率 - what the village's prices are counted in. */
  baseGoldPerHour(save: SaveData): BigNumber {
    return ProgressionSystem.getStage(progressReference(save).stageIndex).rewardGold.mul(IDLE_GOLD_CLEARS_PER_HOUR);
  },

  /** 村の素材 an hour: the rate for the region reached plus what the village's 採集施設 add (木材・鉄・石). */
  materialsPerHour(save: SaveData, now = Date.now()): Record<VillageMaterial, number> {
    const { region } = progressReference(save);
    const base = IDLE_VILLAGE_MATERIALS_PER_HOUR[region] ?? IDLE_VILLAGE_MATERIALS_PER_HOUR[0];
    const gathered = materialRates(save, now);
    return Object.fromEntries(VILLAGE_MATERIALS.map(({ id }) => [id, base[id] + gathered[id]])) as Record<VillageMaterial, number>;
  },

  /** Per-hour rates for the player's progress (equipment excluded: see IDLE_EQUIP_PER_HOUR). The gold is
   *  the stage rate times the 村's 売上倍率 (1 for a village of one level-1 店). */
  perHour(save: SaveData, now = Date.now()): { gold: BigNumber; skillEssence: number; phaseMaterials: number; items: Record<ItemId, number>; materials: Record<VillageMaterial, number> } {
    const { stageIndex, region } = progressReference(save);
    const stage = ProgressionSystem.getStage(stageIndex);
    const items = {} as Record<ItemId, number>;
    for (const id of Object.keys(ITEMS) as ItemId[]) items[id] = 0;
    items.equip_essence = IDLE_EQUIP_ESSENCE_PER_HOUR[region] ?? 0;
    // An hour of EXP, in the potion sizes of the region reached.
    const level = Math.max(IDLE_EXP_MIN_LEVEL, Math.round(levelAskedByStage(stageIndex)));
    const expPerHour = IDLE_EXP_LEVELS_PER_HOUR * expToNextLevel(level);
    for (const { item, share } of IDLE_EXP_SPLIT[region] ?? []) items[item] += (expPerHour * share) / (ITEMS[item].exp ?? 1);
    return {
      gold: this.baseGoldPerHour(save).mul(incomeMultiplier(save, now)),
      skillEssence: stage.rewardSkillEssence * IDLE_ESSENCE_CLEARS_PER_HOUR,
      phaseMaterials: IDLE_PHASE_PER_HOUR,
      items,
      materials: this.materialsPerHour(save, now),
    };
  },

  preview(save: SaveData, now = Date.now()): IdlePreview {
    const hours = this.hoursPiled(save, now);
    const capHours = this.capHours(save, now);
    const rate = this.perHour(save, now);
    return {
      hours,
      capHours,
      full: hours >= capHours,
      gold: rate.gold.mul(hours),
      skillEssence: Math.floor(rate.skillEssence * hours),
      phaseMaterials: Math.floor(rate.phaseMaterials * hours),
      items: (Object.keys(rate.items) as ItemId[]).map((item) => ({ item, amount: Math.floor(rate.items[item] * hours) })).filter((i) => i.amount > 0),
      materials: Object.fromEntries(VILLAGE_MATERIALS.map(({ id }) => [id, Math.floor(rate.materials[id] * hours)])) as Record<VillageMaterial, number>,
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
    SaveSystem.addMaterials(save, preview.materials);

    // Equipment drops whole: the fraction of a piece is a chance of one more.
    const exact = IDLE_EQUIP_PER_HOUR * preview.hours;
    const count = Math.floor(exact) + (rng() < exact - Math.floor(exact) ? 1 : 0);
    const weights = IDLE_EQUIP_RARITY_WEIGHTS[progressReference(save).region];
    const equipment = Array.from({ length: count }, () => EquipmentSystem.grantRandom(save, rollRarity(weights, rng), rng));

    save.idle.lastClaimAt = now;
    recordMission(save, 'idle_claim', 1, now);
    VillageQuests.record(save, 'claim', 1, now);
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
