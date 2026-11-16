import { getWeekdayTier } from '../data/weekdayDungeons';
import type { EventMilestone, EventMissionDef, EventShopItem, LimitedEventDef } from '../data/limitedEvents';
import { eventProgress, getLimitedEvent, isEventRunning, isExchangeOpen, openEvents, recordEvent, type EventProgress } from './EventProgress';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import { SaveSystem, type SaveData } from './SaveSystem';

export interface EventMissionState {
  def: EventMissionDef;
  /** Counted so far, never more than the target. */
  count: number;
  done: boolean;
  claimed: boolean;
}

export interface MilestoneState {
  index: number;
  milestone: EventMilestone;
  reached: boolean;
  claimed: boolean;
}

/** Why an item of the 交換所 cannot be bought now ('ok' = it can). */
export type BuyBlock = 'ok' | 'closed' | 'tokens' | 'limit';

export interface EventClear {
  /** The event currency paid. */
  tokens: number;
  /** 魔晶石 for the first clear of the tier (0 on a repeat). */
  gems: number;
  firstClear: boolean;
}

/**
 * The rules of a 期間限定イベント (data/limitedEvents.ts): what a dungeon clear pays, the missions, the 累計報酬 and the 交換所. The record of each
 * event is `save.events[id]` (systems/EventProgress.ts). The dungeon and the missions only run while the event does; the 累計報酬, the missions'
 * rewards and the 交換所 stay open for `exchangeDays` more.
 */
export const EventSystem = {
  get: getLimitedEvent,

  isRunning: isEventRunning,
  isExchangeOpen,

  // ---- the dungeon

  /** Currency one clear of the tier pays. */
  tokensPerClear(def: LimitedEventDef, tier: number): number {
    return getWeekdayTier(tier).stamina * def.tokenPerStamina;
  },

  /** A tier opens once enough of the main stages have been cleared (the same rule as the 曜日ダンジョン). */
  isTierOpen(save: SaveData, tier: number): boolean {
    return save.stageProgress >= getWeekdayTier(tier).needStage;
  },

  isCleared(save: SaveData, id: string, tier: number): boolean {
    return (save.events[id]?.cleared ?? []).includes(tier);
  },

  /** What a win (or `count` swept wins) of the tier pays now: currency for each, and the first-clear 魔晶石 once. Marks the tier cleared and
   *  counts the clears for the missions. Null when the event is not running. */
  clear(save: SaveData, def: LimitedEventDef, tier: number, count = 1, now = Date.now()): EventClear | null {
    if (!isEventRunning(def, now)) return null;
    const progress = eventProgress(save, def.id);
    const first = !progress.cleared.includes(tier);
    const tokens = EventSystem.tokensPerClear(def, tier) * count;
    const gems = first ? (def.firstClearGems[tier] ?? 0) : 0;
    if (first) progress.cleared.push(tier);
    progress.tokens += tokens;
    progress.points += tokens;
    SaveSystem.addGems(save, gems);
    recordEvent(save, 'event_clear', count, now);
    return { tokens, gems, firstClear: first };
  },

  // ---- the missions

  missions(save: SaveData, def: LimitedEventDef): EventMissionState[] {
    const progress = save.events[def.id];
    return def.missions.map((mission) => {
      const count = Math.min(mission.target, progress?.counts[mission.key] ?? 0);
      return { def: mission, count, done: count >= mission.target, claimed: progress?.missionClaimed.includes(mission.id) ?? false };
    });
  },

  /** Takes a finished mission's currency. Null when it cannot be taken (not finished, taken already, the 交換期間 is over). */
  claimMission(save: SaveData, def: LimitedEventDef, missionId: string, now = Date.now()): number | null {
    if (!isExchangeOpen(def, now)) return null;
    const state = EventSystem.missions(save, def).find((m) => m.def.id === missionId);
    if (!state || !state.done || state.claimed) return null;
    const progress = eventProgress(save, def.id);
    progress.missionClaimed.push(missionId);
    progress.tokens += state.def.tokens;
    progress.points += state.def.tokens;
    return state.def.tokens;
  },

  /** Takes every finished mission at once; returns the currency paid in all. */
  claimAllMissions(save: SaveData, def: LimitedEventDef, now = Date.now()): number {
    let total = 0;
    for (const state of EventSystem.missions(save, def)) total += EventSystem.claimMission(save, def, state.def.id, now) ?? 0;
    return total;
  },

  // ---- the 累計報酬

  milestones(save: SaveData, def: LimitedEventDef): MilestoneState[] {
    const progress = save.events[def.id];
    return def.milestones.map((milestone, index) => ({ index, milestone, reached: (progress?.points ?? 0) >= milestone.points, claimed: progress?.claimed.includes(index) ?? false }));
  },

  /** Takes one step's rewards. Null when it cannot be taken. */
  claimMilestone(save: SaveData, def: LimitedEventDef, index: number, now = Date.now(), rng: () => number = Math.random): GrantedReward[] | null {
    if (!isExchangeOpen(def, now)) return null;
    const state = EventSystem.milestones(save, def)[index];
    if (!state || !state.reached || state.claimed) return null;
    eventProgress(save, def.id).claimed.push(index);
    return RewardSystem.grantAll(save, state.milestone.rewards, rng);
  },

  /** Takes every step that is reached; returns what was handed over. */
  claimAllMilestones(save: SaveData, def: LimitedEventDef, now = Date.now(), rng: () => number = Math.random): GrantedReward[] {
    const granted: GrantedReward[] = [];
    for (const state of EventSystem.milestones(save, def)) granted.push(...(EventSystem.claimMilestone(save, def, state.index, now, rng) ?? []));
    return granted;
  },

  // ---- the 交換所

  bought(save: SaveData, def: LimitedEventDef, itemId: string): number {
    return save.events[def.id]?.bought[itemId] ?? 0;
  },

  buyBlock(save: SaveData, def: LimitedEventDef, item: EventShopItem, now = Date.now()): BuyBlock {
    if (!isExchangeOpen(def, now)) return 'closed';
    if (EventSystem.bought(save, def, item.id) >= item.limit) return 'limit';
    if ((save.events[def.id]?.tokens ?? 0) < item.cost) return 'tokens';
    return 'ok';
  },

  /** Buys one of an item. Null when it cannot be bought (see buyBlock). */
  buy(save: SaveData, def: LimitedEventDef, itemId: string, now = Date.now(), rng: () => number = Math.random): GrantedReward[] | null {
    const item = def.shop.find((i) => i.id === itemId);
    if (!item || EventSystem.buyBlock(save, def, item, now) !== 'ok') return null;
    const progress: EventProgress = eventProgress(save, def.id);
    progress.tokens -= item.cost;
    progress.bought[item.id] = (progress.bought[item.id] ?? 0) + 1;
    return RewardSystem.grantAll(save, item.rewards, rng);
  },

  // ---- for the red dots

  /** True when something of this event can be taken now: a finished mission or a reached step. */
  hasClaimable(save: SaveData, def: LimitedEventDef, now = Date.now()): boolean {
    if (!isExchangeOpen(def, now)) return false;
    return EventSystem.missions(save, def).some((m) => m.done && !m.claimed) || EventSystem.milestones(save, def).some((m) => m.reached && !m.claimed);
  },

  /** True when any event that is open has something to take (for the Event tab's red dot). */
  anyClaimable(save: SaveData, now = Date.now()): boolean {
    return openEvents(now).some((def) => EventSystem.hasClaimable(save, def, now));
  },
};
