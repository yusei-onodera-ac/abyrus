import type { NoticeEntry } from '../data/notices';
import { isLeaderboardConfigured } from './firebaseConfig';
import { openFirestore, withTimeout } from './firestoreRead';

/**
 * お知らせ from the operator's admin (Firestore `announcements`, written by abyrus-admin), shown on the お知らせ board
 * above the notices the game makes itself (data/notices.ts).
 *
 *   announcements/{id}  { title, body, publishedDate: "YYYY-MM-DD", active: boolean }
 *
 * Same rules as RemoteShopConfig: read once at start-up, public read (no sign-in), nothing configured / offline / any failure
 * = the board stays as it is, and nothing here ever throws. A document that is not valid is left out (the rest still show).
 * Only `active == true` is asked for, because that is what the Firestore rules let a player read.
 * A notice shows from the start of its 公開日 (Japan time), so one can be written ahead of time.
 */

export const REMOTE_NOTICE_TITLE_MAX = 60;
export const REMOTE_NOTICE_BODY_MAX = 2000;
/** How many of the newest ones the board shows. */
export const REMOTE_NOTICE_LIMIT = 20;

export interface RemoteNoticeDoc {
  id: string;
  data: unknown;
}
export type RemoteNoticeFetcher = () => Promise<RemoteNoticeDoc[]>;

export interface RemoteNotice {
  entry: NoticeEntry;
  /** When it starts to show (ms since the epoch). */
  at: number;
}

export interface RemoteNoticeResult {
  status: 'ok' | 'not_configured' | 'unavailable';
  read: number;
  dropped: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One document → a notice, or null when it is not a valid, published (`active`) one. Never throws. */
export function parseAnnouncement(id: string, raw: unknown): RemoteNotice | null {
  if (!isObject(raw) || raw.active !== true) return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (title.length < 1 || title.length > REMOTE_NOTICE_TITLE_MAX) return null;
  if (body.length < 1 || body.length > REMOTE_NOTICE_BODY_MAX) return null;
  const date = typeof raw.publishedDate === 'string' ? raw.publishedDate.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const at = Date.parse(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(at) || new Date(at + 9 * 3600_000).getUTCDate() !== Number(m[3])) return null; // (2026-02-31 and the like)
  if (id.length < 1 || id.includes('/')) return null;
  // (the tag is a data key: NoticeScene shows it in the player's language)
  return { entry: { id: `remote-${id}`, category: 'お知らせ', title, body, date: `${m[1]}/${m[2]}/${m[3]}` }, at }; // i18n-ignore
}

let loaded: RemoteNotice[] = [];

/** Puts what was read in place of what was there. Returns how many were kept / dropped. */
export function applyRemoteNotices(docs: unknown): RemoteNoticeResult {
  loaded = [];
  if (!Array.isArray(docs)) return { status: 'unavailable', read: 0, dropped: 0 };
  let dropped = 0;
  for (const d of docs) {
    const parsed = isObject(d) && typeof d.id === 'string' ? parseAnnouncement(d.id, d.data) : null;
    if (parsed) loaded.push(parsed);
    else dropped++;
  }
  loaded.sort((a, b) => b.at - a.at || (a.entry.id < b.entry.id ? -1 : 1));
  return { status: 'ok', read: loaded.length, dropped };
}

/** The operator's notices that are showing at `now`, newest first (at most REMOTE_NOTICE_LIMIT). */
export function remoteNotices(now = Date.now()): NoticeEntry[] {
  return loaded.filter((n) => n.at <= now).slice(0, REMOTE_NOTICE_LIMIT).map((n) => n.entry);
}

export function resetRemoteNotices(): void {
  loaded = [];
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchFromFirestore(): Promise<RemoteNoticeDoc[]> {
  const { fs, db } = await openFirestore();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'announcements'), fs.where('active', '==', true), fs.limit(100)));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

let inflight: Promise<RemoteNoticeResult> | undefined;

export const RemoteNotices = {
  /**
   * Reads the operator's notices once (the same promise comes back on later calls). Without Firebase settings it returns
   * `not_configured` at once; a failure returns `unavailable`. It never throws. `fetcher` is for tests.
   */
  refresh(fetcher?: RemoteNoticeFetcher): Promise<RemoteNoticeResult> {
    if (!inflight) {
      inflight = (async (): Promise<RemoteNoticeResult> => {
        if (!fetcher && !isLeaderboardConfigured()) return { status: 'not_configured', read: 0, dropped: 0 };
        try {
          return applyRemoteNotices(await withTimeout((fetcher ?? fetchFromFirestore)(), FETCH_TIMEOUT_MS));
        } catch {
          resetRemoteNotices();
          return { status: 'unavailable', read: 0, dropped: 0 };
        }
      })();
    }
    return inflight;
  },

  /** For tests: forget that it was read. */
  forget(): void {
    inflight = undefined;
    resetRemoteNotices();
  },
};
