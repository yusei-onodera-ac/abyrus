import { LOGIN_BONUS } from '../data/loginBonus';
import type { Reward } from '../data/rewards';
import { isLeaderboardConfigured } from './firebaseConfig';
import { openFirestore, withTimeout } from './firestoreRead';
import { rewardOf } from './RemoteShopConfig';

/**
 * ログインボーナス from the operator's admin (Firestore `loginBonusDays`, written by abyrus-admin): the reward of each day of the month.
 *
 *   loginBonusDays/{id}  { day: 1..31, reward: { type, amount, item?, rarity? }, note? }
 *
 * A day that has a valid document gets that reward in place of the one in data/loginBonus.ts; the other days keep the written one.
 * (reward = the game's Reward: gems / gold / stamina / phaseMaterials / skillEssence, or `item` with an item id, or `equipment` with a rarity.)
 * Same rules as RemoteShopConfig: read once at start-up, no sign-in, nothing configured / offline / any failure = the written calendar; never
 * throws. A document that is not valid is left out (the rest still apply). Two documents for the same day: the one with the smaller id.
 */

export const REMOTE_LOGIN_GEMS_MAX = 100_000;
const DAYS = 31;

export interface RemoteLoginDoc {
  id: string;
  data: unknown;
}
export type RemoteLoginBonusFetcher = () => Promise<RemoteLoginDoc[]>;

export interface RemoteLoginBonusResult {
  status: 'ok' | 'not_configured' | 'unavailable';
  /** Days whose reward was replaced. */
  days: number;
  dropped: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One document → the day and its reward, or null. Never throws. */
export function parseLoginBonusDay(raw: unknown): { day: number; reward: Reward } | null {
  if (!isObject(raw)) return null;
  const day = raw.day;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > DAYS) return null;
  const reward = rewardOf(raw.reward);
  if (!reward) return null;
  // (a day's bonus of a hundred thousand gems or more is a slip of the finger, not a plan)
  if (reward.type === 'gems' && reward.amount > REMOTE_LOGIN_GEMS_MAX) return null;
  return { day, reward };
}

/** The calendar as it was written in data/loginBonus.ts: every apply starts from it, and `reset` goes back to it. */
const STATIC: Reward[] = [...LOGIN_BONUS];

export function resetRemoteLoginBonus(): void {
  LOGIN_BONUS.splice(0, LOGIN_BONUS.length, ...STATIC);
}

/** Puts what was read into the calendar. Returns how many days were replaced / how many documents were dropped. */
export function applyRemoteLoginBonus(docs: unknown): RemoteLoginBonusResult {
  resetRemoteLoginBonus();
  if (!Array.isArray(docs)) return { status: 'unavailable', days: 0, dropped: 0 };
  let dropped = 0;
  const byDay = new Map<number, { id: string; reward: Reward }>();
  const list = docs.filter((d): d is RemoteLoginDoc => isObject(d) && typeof d.id === 'string');
  dropped += docs.length - list.length;
  for (const d of [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const parsed = parseLoginBonusDay(d.data);
    if (!parsed || byDay.has(parsed.day)) {
      dropped++;
      continue;
    }
    byDay.set(parsed.day, { id: d.id, reward: parsed.reward });
  }
  for (const [day, { reward }] of byDay) LOGIN_BONUS[day - 1] = reward;
  return { status: 'ok', days: byDay.size, dropped };
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchFromFirestore(): Promise<RemoteLoginDoc[]> {
  const { fs, db } = await openFirestore();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'loginBonusDays'), fs.limit(100)));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

let inflight: Promise<RemoteLoginBonusResult> | undefined;

export const RemoteLoginBonus = {
  /**
   * Reads the operator's login-bonus days once (the same promise comes back on later calls) and puts them in the calendar.
   * Without Firebase settings it returns `not_configured` at once; a failure returns `unavailable`. It never throws. `fetcher` is for tests.
   */
  refresh(fetcher?: RemoteLoginBonusFetcher): Promise<RemoteLoginBonusResult> {
    if (!inflight) {
      inflight = (async (): Promise<RemoteLoginBonusResult> => {
        if (!fetcher && !isLeaderboardConfigured()) return { status: 'not_configured', days: 0, dropped: 0 };
        try {
          return applyRemoteLoginBonus(await withTimeout((fetcher ?? fetchFromFirestore)(), FETCH_TIMEOUT_MS));
        } catch {
          resetRemoteLoginBonus();
          return { status: 'unavailable', days: 0, dropped: 0 };
        }
      })();
    }
    return inflight;
  },

  /** For tests: forget that it was read (and go back to the written calendar). */
  forget(): void {
    inflight = undefined;
    resetRemoteLoginBonus();
  },
};
