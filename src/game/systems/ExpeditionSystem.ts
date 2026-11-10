import { EXPEDITION_CLASS_BONUS, EXPEDITION_SLOTS, EXPEDITION_STAR_BONUS, getExpedition, type ExpeditionDef } from '../data/expeditions';
import type { Reward } from '../data/rewards';
import { VILLAGE_MATERIALS, type MaterialBundle } from '../data/village';
import type { HeroData } from '../types';
import { recordMission } from './MissionProgress';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import { SaveSystem, type ExpeditionRun, type SaveData } from './SaveSystem';

/** What sending a party would pay, over the base rewards. */
export interface ExpeditionBonus {
  /** Everything the expedition pays is multiplied by this (1 = no bonus). */
  multiplier: number;
  /** How many of the party are of the expedition's favored class. */
  favoredCount: number;
  /** ★ the party has above one star apiece. */
  extraStars: number;
}

export interface ExpeditionClaim {
  def: ExpeditionDef;
  granted: GrantedReward[];
  bonus: number;
}

/**
 * 遠征: sending heroes away, and taking what they bring back (the list and the numbers are in
 * data/expeditions.ts). Like the other systems this changes the save in memory only: the scene
 * that called it saves.
 */
export const ExpeditionSystem = {
  /** An expedition opens once enough of the main stages have been cleared. */
  isUnlocked(save: SaveData, def: ExpeditionDef): boolean {
    return save.stageProgress >= def.needStage;
  },

  /** Heroes that are away now: they cannot be sent on a second expedition. */
  busyHeroIds(save: SaveData): Set<string> {
    const busy = new Set<string>();
    for (const run of save.expeditions.slots) if (run) for (const id of run.heroIds) busy.add(id);
    return busy;
  },

  /** The first slot with nothing out, or -1 when every slot is taken. */
  emptySlot(save: SaveData): number {
    return save.expeditions.slots.findIndex((run) => run === null);
  },

  bonus(save: SaveData, def: ExpeditionDef, heroIds: string[]): ExpeditionBonus {
    const heroes = heroIds.map((id) => SaveSystem.getHero(save, id)).filter((h): h is HeroData => !!h);
    const favoredCount = heroes.filter((h) => h.heroClass === def.favored).length;
    const extraStars = heroes.reduce((sum, h) => sum + Math.max(0, h.rarity - 1), 0);
    const multiplier = 1 + favoredCount * EXPEDITION_CLASS_BONUS + extraStars * EXPEDITION_STAR_BONUS;
    return { multiplier: Math.round(multiplier * 100) / 100, favoredCount, extraStars };
  },

  /** The rewards with every amount multiplied (never below 1, never lost to rounding). */
  scaledRewards(def: ExpeditionDef, multiplier: number): Reward[] {
    return def.rewards.map((r) => ({ ...r, amount: Math.max(1, Math.round(r.amount * multiplier)) }));
  },

  /** The 村の素材 an expedition brings home, every amount multiplied (only the village shows them). */
  scaledMaterials(def: ExpeditionDef, multiplier: number): MaterialBundle {
    const out: MaterialBundle = {};
    for (const { id } of VILLAGE_MATERIALS) {
      const base = def.materials?.[id] ?? 0;
      if (base > 0) out[id] = Math.max(1, Math.round(base * multiplier));
    }
    return out;
  },

  /** Why `heroIds` cannot be sent on `def` from `slot` right now, or null when they can. */
  check(save: SaveData, slot: number, def: ExpeditionDef, heroIds: string[]): string | null {
    if (!Number.isInteger(slot) || slot < 0 || slot >= EXPEDITION_SLOTS) return '出発できる枠がありません';
    if (save.expeditions.slots[slot]) return 'この枠は遠征中です';
    if (!ExpeditionSystem.isUnlocked(save, def)) return `メインステージを${def.needStage}まで進めると行けます`;
    if (heroIds.length !== def.partySize) return `${def.partySize}人で出発します`;
    if (new Set(heroIds).size !== heroIds.length) return '同じキャラは選べません';
    const busy = ExpeditionSystem.busyHeroIds(save);
    for (const id of heroIds) {
      if (!SaveSystem.getHero(save, id)) return 'キャラが見つかりません';
      if (busy.has(id)) return '遠征中のキャラは選べません';
    }
    return null;
  },

  /** Sends `heroIds` out from `slot`. False (nothing changed) when `check` says no. */
  start(save: SaveData, slot: number, def: ExpeditionDef, heroIds: string[], now = Date.now()): boolean {
    if (ExpeditionSystem.check(save, slot, def, heroIds) !== null) return false;
    const run: ExpeditionRun = { id: def.id, heroIds: [...heroIds], startedAt: now, bonus: ExpeditionSystem.bonus(save, def, heroIds).multiplier };
    save.expeditions.slots[slot] = run;
    return true;
  },

  /** Seconds until they are back (0 once they are). A clock set back only makes them later, never earlier. */
  secondsLeft(run: ExpeditionRun, now = Date.now()): number {
    const def = getExpedition(run.id);
    if (!def) return 0;
    const elapsed = Math.max(0, now - run.startedAt);
    return Math.max(0, Math.ceil((def.hours * 3600 * 1000 - elapsed) / 1000));
  },

  isDone(run: ExpeditionRun, now = Date.now()): boolean {
    return ExpeditionSystem.secondsLeft(run, now) === 0;
  },

  /** How far along it is, 0..1. */
  progress(run: ExpeditionRun, now = Date.now()): number {
    const def = getExpedition(run.id);
    if (!def) return 1;
    return Math.min(1, Math.max(0, (now - run.startedAt) / (def.hours * 3600 * 1000)));
  },

  /** Takes what a returned expedition brought: the slot is empty again and the 遠征 mission is counted. Null if
   *  the slot is empty or they are not back yet. */
  claim(save: SaveData, slot: number, now = Date.now(), rng: () => number = Math.random): ExpeditionClaim | null {
    const run = save.expeditions.slots[slot];
    if (!run) return null;
    const def = getExpedition(run.id);
    if (!def || !ExpeditionSystem.isDone(run, now)) return null;
    const granted = RewardSystem.grantAll(save, ExpeditionSystem.scaledRewards(def, run.bonus), rng);
    SaveSystem.addMaterials(save, ExpeditionSystem.scaledMaterials(def, run.bonus));
    save.expeditions.slots[slot] = null;
    recordMission(save, 'expedition', 1, now);
    return { def, granted, bonus: run.bonus };
  },

  /** How many expeditions are back and waiting to be taken (for the red dot). */
  readyCount(save: SaveData, now = Date.now()): number {
    return save.expeditions.slots.filter((run) => run !== null && ExpeditionSystem.isDone(run, now)).length;
  },

  /** How many are out and not back yet. */
  runningCount(save: SaveData, now = Date.now()): number {
    return save.expeditions.slots.filter((run) => run !== null && !ExpeditionSystem.isDone(run, now)).length;
  },
};
