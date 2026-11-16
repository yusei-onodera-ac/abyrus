import { SCHEDULED_EVENTS } from '../data/schedule';
import type { EventMissionKey, LimitedEventDef } from '../data/limitedEvents';
import type { SaveData } from './SaveSystem';

/**
 * What a player has done in each 期間限定イベント (data/limitedEvents.ts): the currency in hand and ever collected, the 累計報酬 and 交換所
 * items taken, how far the missions have counted and which dungeon tiers were cleared. A leaf module (it reads only the
 * schedule's data), so the mission counter (MissionProgress.recordMission) can feed it without making an import cycle.
 * The game rules (paying, buying, claiming) are in EventSystem.
 */
export interface EventProgress {
  /** The event currency in hand (what the 交換所 spends). */
  tokens: number;
  /** The currency ever collected (what the 累計報酬 is measured by; spending it does not lower this). */
  points: number;
  /** Indexes of the 累計報酬 steps already taken. */
  claimed: number[];
  /** 交換所 item id -> how many bought. */
  bought: Record<string, number>;
  /** The mission counters: what was done while the event ran, by key (`login` is the number of days came in). */
  counts: Record<string, number>;
  /** Ids of the missions already taken. */
  missionClaimed: string[];
  /** The local day last counted as a login. */
  loginDay: string;
  /** The dungeon tiers (0-3) cleared at least once - only those can be 掃討'd. */
  cleared: number[];
}

export const emptyEventProgress = (): EventProgress => ({ tokens: 0, points: 0, claimed: [], bought: {}, counts: {}, missionClaimed: [], loginDay: '', cleared: [] });

const DAY_MS = 24 * 60 * 60 * 1000;
const pad2 = (n: number): string => String(n).padStart(2, '0');
const dayId = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export function getLimitedEvent(id: string): LimitedEventDef | undefined {
  return SCHEDULED_EVENTS.find((e) => e.id === id);
}

/** The dungeon and the missions run (and count) between `startsAt` and `endsAt`. */
export function isEventRunning(def: LimitedEventDef, now = Date.now()): boolean {
  return new Date(def.startsAt).getTime() <= now && now < new Date(def.endsAt).getTime();
}

/** The 交換所 and the 累計報酬 are open from the start until `exchangeDays` after the end. */
export function isExchangeOpen(def: LimitedEventDef, now = Date.now()): boolean {
  return new Date(def.startsAt).getTime() <= now && now < new Date(def.endsAt).getTime() + def.exchangeDays * DAY_MS;
}

export function runningEvents(now = Date.now()): LimitedEventDef[] {
  return SCHEDULED_EVENTS.filter((e) => isEventRunning(e, now));
}

/** The events whose 交換所 is open (running ones and those in their 交換期間). */
export function openEvents(now = Date.now()): LimitedEventDef[] {
  return SCHEDULED_EVENTS.filter((e) => isExchangeOpen(e, now));
}

/** The record of an event, started empty when there is none yet. */
export function eventProgress(save: SaveData, id: string): EventProgress {
  let progress = save.events[id];
  if (!progress) {
    progress = emptyEventProgress();
    save.events[id] = progress;
  }
  return progress;
}

/** Counts that the player did something (a stage won, a gacha pulled ...) towards every running event's missions. Coming in on a day
 *  counts that day as a login too, whatever the thing was. */
export function recordEvent(save: SaveData, key: EventMissionKey, amount: number, now = Date.now()): void {
  if (amount <= 0) return;
  const running = runningEvents(now);
  if (running.length === 0) return;
  touchEventLogin(save, now);
  for (const def of running) {
    const progress = eventProgress(save, def.id);
    progress.counts[key] = (progress.counts[key] ?? 0) + amount;
  }
}

/** Counts today as a day the player came in, once, for every running event (Home calls this when it opens). */
export function touchEventLogin(save: SaveData, now = Date.now()): void {
  const today = dayId(now);
  for (const def of runningEvents(now)) {
    const progress = eventProgress(save, def.id);
    if (progress.loginDay === today) continue;
    progress.loginDay = today;
    progress.counts.login = (progress.counts.login ?? 0) + 1;
  }
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const wholeList = (raw: unknown, max = Infinity): number[] => (Array.isArray(raw) ? [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < max))] : []);

/** Reads the saved records, tolerating damage: a record of an event that is not in the schedule, or whose 交換期間 ended more than a week
 *  ago, is dropped; what is kept has its numbers made sane and its ids checked against the event. */
export function loadEvents(raw: unknown, now = Date.now()): Record<string, EventProgress> {
  const out: Record<string, EventProgress> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, Partial<EventProgress>>)) {
    const def = getLimitedEvent(id);
    if (!def || !value || typeof value !== 'object') continue;
    if (now >= new Date(def.endsAt).getTime() + (def.exchangeDays + 7) * DAY_MS) continue;
    const counts: Record<string, number> = {};
    for (const [key, n] of Object.entries(value.counts ?? {})) if (finite(n) && n >= 0) counts[key] = Math.floor(n);
    const bought: Record<string, number> = {};
    for (const item of def.shop) {
      const n = (value.bought as Record<string, unknown> | undefined)?.[item.id];
      if (finite(n) && n > 0) bought[item.id] = Math.min(item.limit, Math.floor(n));
    }
    out[id] = {
      tokens: finite(value.tokens) ? Math.max(0, Math.floor(value.tokens)) : 0,
      points: finite(value.points) ? Math.max(0, Math.floor(value.points)) : 0,
      claimed: wholeList(value.claimed, def.milestones.length),
      bought,
      counts,
      missionClaimed: Array.isArray(value.missionClaimed) ? [...new Set(value.missionClaimed.filter((m): m is string => typeof m === 'string' && def.missions.some((d) => d.id === m)))] : [],
      loginDay: typeof value.loginDay === 'string' ? value.loginDay : '',
      cleared: wholeList(value.cleared, 4),
    };
  }
  return out;
}
