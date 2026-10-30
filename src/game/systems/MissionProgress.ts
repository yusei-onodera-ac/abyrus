import type { MissionKey } from '../data/missions';
import type { SaveData } from './SaveSystem';

/** One span of time's worth of mission progress (a day, or a week). */
export interface MissionPeriod {
  /** Which day / week this belongs to: when it is no longer the current one, it starts over. */
  id: string;
  counts: Record<string, number>;
  /** Ids of the missions already taken. */
  claimed: string[];
  bonusClaimed: boolean;
}

export interface MissionState {
  daily: MissionPeriod;
  weekly: MissionPeriod;
  /** Counted since the beginning, never reset (for 実績). */
  totals: Record<string, number>;
  totalClaimed: string[];
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const dateId = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** The local day, "2026-10-30": the day the daily list belongs to. */
export function missionDay(now = Date.now()): string {
  return dateId(new Date(now));
}

/** The local Monday of `now`'s week, "2026-10-26": the week the weekly list belongs to. */
export function missionWeek(now = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateId(d);
}

const emptyPeriod = (id = ''): MissionPeriod => ({ id, counts: {}, claimed: [], bonusClaimed: false });

export function emptyMissions(): MissionState {
  return { daily: emptyPeriod(), weekly: emptyPeriod(), totals: {}, totalClaimed: [] };
}

function loadCounts(raw: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, n] of Object.entries(raw)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) counts[key] = n;
  }
  return counts;
}

const loadIds = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);

interface RawPeriod {
  id?: unknown;
  counts?: unknown;
  claimed?: unknown;
  bonusClaimed?: unknown;
}

function loadPeriod(raw: RawPeriod | undefined, id: unknown = raw?.id): MissionPeriod {
  if (typeof id !== 'string' || !raw) return emptyPeriod();
  return { id, counts: loadCounts(raw.counts), claimed: loadIds(raw.claimed), bonusClaimed: raw.bonusClaimed === true };
}

/** Reads the saved mission state, tolerating older saves (which only had today's list as
 *  `{ day, counts, claimed, bonusClaimed }`) and anything damaged. */
export function loadMissions(raw: unknown): MissionState {
  if (!raw || typeof raw !== 'object') return emptyMissions();
  const r = raw as RawPeriod & { day?: unknown; daily?: RawPeriod; weekly?: RawPeriod; totals?: unknown; totalClaimed?: unknown };
  return {
    daily: typeof r.day === 'string' ? loadPeriod(r, r.day) : loadPeriod(r.daily),
    weekly: loadPeriod(r.weekly),
    totals: loadCounts(r.totals),
    totalClaimed: loadIds(r.totalClaimed),
  };
}

/** Starts a fresh daily / weekly list when the day / week has changed. */
export function rollMissions(save: SaveData, now = Date.now()): void {
  const day = missionDay(now);
  if (save.missions.daily.id !== day) save.missions.daily = emptyPeriod(day);
  const week = missionWeek(now);
  if (save.missions.weekly.id !== week) save.missions.weekly = emptyPeriod(week);
}

/** Counts something done towards the missions - today's, this week's and the totals. A leaf
 *  module (no game systems) so any system can call it without making an import cycle. */
export function recordMission(save: SaveData, key: MissionKey, amount = 1, now = Date.now()): void {
  if (amount <= 0) return;
  rollMissions(save, now);
  const m = save.missions;
  m.daily.counts[key] = (m.daily.counts[key] ?? 0) + amount;
  m.weekly.counts[key] = (m.weekly.counts[key] ?? 0) + amount;
  m.totals[key] = (m.totals[key] ?? 0) + amount;
}
