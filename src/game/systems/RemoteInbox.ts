import { GIFT_CAMPAIGNS, type GiftCampaign } from '../data/gifts';
import { MAIL_CAMPAIGNS, type MailCampaign } from '../data/mails';
import { isLeaderboardConfigured } from './firebaseConfig';
import { openFirestore, withTimeout } from './firestoreRead';

/**
 * プレゼント and メール that the operator sends to EVERYONE from the admin (Firestore `gifts` and `mail`, written by abyrus-admin).
 * They are added to the game's own campaign lists (data/gifts.ts, data/mails.ts), so InboxSystem.deliver hands each to a save once, the
 * next time the player reaches Home - exactly like an entry written in those files.
 *
 *   gifts/{id}  { title, message, rewardType: "gold" | "gem", rewardAmount, recipientType: "all", status: "sent", endsAt?, expireDays? }
 *   mail/{id}   { subject, body, recipientType: "all", status: "sent", hasReward?, rewardType?, rewardAmount? }
 *
 * - Only `status == "sent"` and `recipientType == "all"` documents are asked for (that is what the Firestore rules let a player read).
 *   A gift or mail to one named player (`specific`) is NOT delivered by this: it needs a per-player channel the game does not have yet.
 * - Gems and gold only (that is all a プレゼント can pay today): `item` is dropped. `gem` is the game's `gems`.
 * - A mail with a reward attached also puts a プレゼント (id `remote-mail-<id>`) in the プレゼントBOX.
 * - What was already handed to a save is not handed again when the document is edited (the document id is the key): to send again, make a new one.
 * - Same rules as RemoteShopConfig: read once at start-up, no sign-in, nothing configured / offline / any failure = nothing added; never throws.
 *   A document that is not valid is left out (the rest still go).
 */

export const REMOTE_TITLE_MAX = 60;
export const REMOTE_GIFT_MESSAGE_MAX = 300;
export const REMOTE_MAIL_BODY_MAX = 2000;
export const REMOTE_GOLD_MAX = 1_000_000_000;
export const REMOTE_GEMS_MAX = 100_000;
export const REMOTE_EXPIRE_DAYS_MAX = 365;
const REMOTE_PREFIX = 'remote-';

export interface RemoteInboxDoc {
  id: string;
  data: unknown;
}
export interface RemoteInboxData {
  gifts: RemoteInboxDoc[];
  mails: RemoteInboxDoc[];
}
export type RemoteInboxFetcher = () => Promise<RemoteInboxData>;

export interface RemoteInboxResult {
  status: 'ok' | 'not_configured' | 'unavailable';
  gifts: number;
  mails: number;
  dropped: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number, min = 1): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
};

/** A date the admin wrote: an ISO-ish string, or a Firestore Timestamp (or its plain {seconds}). → "YYYY-MM-DDTHH:MM:SS.sssZ", or null. */
function isoOf(v: unknown): string | null {
  let ms = NaN;
  if (typeof v === 'string' && v.trim() !== '') ms = Date.parse(v);
  else if (isObject(v) && typeof v.toDate === 'function') ms = (v.toDate as () => Date)().getTime();
  else if (isObject(v) && typeof v.seconds === 'number') ms = v.seconds * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The reward of a gift: gold or gems (the admin's `gem`) with a whole amount in range; otherwise null. */
function rewardOf(type: unknown, amount: unknown): GiftCampaign['reward'] | null {
  if (type !== 'gold' && type !== 'gem' && type !== 'gems') return null;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) return null;
  const kind = type === 'gold' ? 'gold' : 'gems';
  return amount <= (kind === 'gold' ? REMOTE_GOLD_MAX : REMOTE_GEMS_MAX) ? { type: kind, amount } : null;
}

/** One `gifts` document → a gift for everyone, or null when it is not valid / not sent / not for everyone. Never throws. */
export function parseGift(id: string, raw: unknown): GiftCampaign | null {
  if (!isObject(raw) || raw.status !== 'sent' || raw.recipientType !== 'all') return null;
  if (id.length < 1 || id.includes('/')) return null;
  const title = text(raw.title, REMOTE_TITLE_MAX);
  const message = text(raw.message, REMOTE_GIFT_MESSAGE_MAX);
  const reward = rewardOf(raw.rewardType, raw.rewardAmount);
  if (!title || !message || !reward) return null;
  const gift: GiftCampaign = { id: `${REMOTE_PREFIX}${id}`, title, message, reward };
  if (raw.endsAt !== undefined && raw.endsAt !== null && raw.endsAt !== '') {
    const ends = isoOf(raw.endsAt);
    if (!ends) return null;
    gift.endsAt = ends;
  }
  if (raw.expireDays !== undefined && raw.expireDays !== null) {
    if (typeof raw.expireDays !== 'number' || !Number.isInteger(raw.expireDays) || raw.expireDays < 1 || raw.expireDays > REMOTE_EXPIRE_DAYS_MAX) return null;
    gift.expireDays = raw.expireDays;
  }
  return gift;
}

/** One `mail` document → a mail for everyone (and the プレゼント it carries, if it has a reward), or null. Never throws. */
export function parseMail(id: string, raw: unknown, now = Date.now()): { mail: MailCampaign; gift?: GiftCampaign } | null {
  if (!isObject(raw) || raw.status !== 'sent' || raw.recipientType !== 'all') return null;
  if (id.length < 1 || id.includes('/')) return null;
  const title = text(raw.subject, REMOTE_TITLE_MAX);
  const body = text(raw.body, REMOTE_MAIL_BODY_MAX);
  if (!title || !body) return null;
  // (the admin form has no send time: when it was last saved, else the moment the game first sees it)
  const sentAt = isoOf(raw.sentAt) ?? isoOf(raw.updatedAt) ?? isoOf(raw.createdAt) ?? new Date(now).toISOString();
  const mail: MailCampaign = { id: `${REMOTE_PREFIX}${id}`, title, body, sentAt };
  if (raw.hasReward === true) {
    const reward = rewardOf(raw.rewardType, raw.rewardAmount);
    // (a reward that is not valid — an `item`, a typo'd amount — means the mail is not sent either: better none than one that promises something it cannot give)
    if (!reward) return null;
    return { mail, gift: { id: `${REMOTE_PREFIX}mail-${id}`, title, message: 'メールに添えたプレゼントです。', reward } };
  }
  return { mail };
}

const isRemote = (c: { id: string }): boolean => c.id.startsWith(REMOTE_PREFIX);

/** Takes the operator's earlier entries out of the game's lists (the ones in the data files stay). */
export function resetRemoteInbox(): void {
  for (let i = GIFT_CAMPAIGNS.length - 1; i >= 0; i--) if (isRemote(GIFT_CAMPAIGNS[i])) GIFT_CAMPAIGNS.splice(i, 1);
  for (let i = MAIL_CAMPAIGNS.length - 1; i >= 0; i--) if (isRemote(MAIL_CAMPAIGNS[i])) MAIL_CAMPAIGNS.splice(i, 1);
}

/** Puts what was read into the game's lists. Returns how many were added / dropped. */
export function applyRemoteInbox(data: unknown, now = Date.now()): RemoteInboxResult {
  resetRemoteInbox();
  const result: RemoteInboxResult = { status: 'ok', gifts: 0, mails: 0, dropped: 0 };
  if (!isObject(data) || !Array.isArray(data.gifts) || !Array.isArray(data.mails)) return { ...result, status: 'unavailable' };
  const seen = new Set<string>();
  const add = <T extends { id: string }>(list: T[], item: T, counter: 'gifts' | 'mails'): void => {
    // (a gift and a mail may have the same document id: they are different lists, and delivered under different keys)
    const key = `${counter}:${item.id}`;
    if (seen.has(key)) {
      result.dropped++;
      return;
    }
    seen.add(key);
    list.push(item);
    result[counter]++;
  };
  const byId = (a: RemoteInboxDoc, b: RemoteInboxDoc): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ok = (d: unknown): d is RemoteInboxDoc => isObject(d) && typeof d.id === 'string';
  for (const d of [...data.gifts].filter(ok).sort(byId)) {
    const g = parseGift(d.id, d.data);
    if (g) add(GIFT_CAMPAIGNS, g, 'gifts');
    else result.dropped++;
  }
  for (const d of [...data.mails].filter(ok).sort(byId)) {
    const m = parseMail(d.id, d.data, now);
    if (!m) {
      result.dropped++;
      continue;
    }
    add(MAIL_CAMPAIGNS, m.mail, 'mails');
    if (m.gift) add(GIFT_CAMPAIGNS, m.gift, 'gifts');
  }
  result.dropped += data.gifts.filter((d) => !ok(d)).length + data.mails.filter((d) => !ok(d)).length;
  return result;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchFromFirestore(): Promise<RemoteInboxData> {
  const { fs, db } = await openFirestore();
  const ask = (name: string) => fs.getDocs(fs.query(fs.collection(db, name), fs.where('status', '==', 'sent'), fs.where('recipientType', '==', 'all'), fs.limit(100)));
  const [gifts, mails] = await Promise.all([ask('gifts'), ask('mail')]);
  return { gifts: gifts.docs.map((d) => ({ id: d.id, data: d.data() })), mails: mails.docs.map((d) => ({ id: d.id, data: d.data() })) };
}

let inflight: Promise<RemoteInboxResult> | undefined;

export const RemoteInbox = {
  /**
   * Reads the operator's gifts and mails once (the same promise comes back on later calls) and adds them to the campaign lists.
   * Without Firebase settings it returns `not_configured` at once; a failure returns `unavailable`. It never throws. `fetcher` is for tests.
   */
  refresh(fetcher?: RemoteInboxFetcher): Promise<RemoteInboxResult> {
    if (!inflight) {
      inflight = (async (): Promise<RemoteInboxResult> => {
        if (!fetcher && !isLeaderboardConfigured()) return { status: 'not_configured', gifts: 0, mails: 0, dropped: 0 };
        try {
          return applyRemoteInbox(await withTimeout((fetcher ?? fetchFromFirestore)(), FETCH_TIMEOUT_MS));
        } catch {
          resetRemoteInbox();
          return { status: 'unavailable', gifts: 0, mails: 0, dropped: 0 };
        }
      })();
    }
    return inflight;
  },

  /** For tests: forget that it was read (and take the operator's entries out). */
  forget(): void {
    inflight = undefined;
    resetRemoteInbox();
  },
};
