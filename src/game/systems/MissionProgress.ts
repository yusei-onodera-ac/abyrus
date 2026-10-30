import type { MissionKey } from '../data/missions';
import type { SaveData } from './SaveSystem';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The local day, "2026-10-30": the day the mission list belongs to. */
export function missionDay(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Starts a fresh list when the day has changed. */
export function rollMissionDay(save: SaveData, now = Date.now()): void {
  const day = missionDay(now);
  if (save.missions.day !== day) save.missions = { day, counts: {}, claimed: [], bonusClaimed: false };
}

/** Counts something done towards today's missions. A leaf module (no game systems) so any
 *  system can call it without making an import cycle. */
export function recordMission(save: SaveData, key: MissionKey, amount = 1, now = Date.now()): void {
  if (amount <= 0) return;
  rollMissionDay(save, now);
  save.missions.counts[key] = (save.missions.counts[key] ?? 0) + amount;
}
