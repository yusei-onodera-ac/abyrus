import { formatDateTime } from '../ui/format';
import type { LimitedEventDef } from './limitedEvents';
import { SCHEDULED_EVENTS } from './schedule';

/** What tapping a running event opens: the 無限モード screen, the プレミアムパス, or the 期間限定イベント's own screen
 *  (data/limitedEvents.ts; the year's are in data/schedule.ts). Add a kind here (and a case in EventScene.open) when another mode is built. */
export type EventKind = 'infinite' | 'premium' | 'limited';

export interface EventEntry {
  id: string;
  /** Which screen the event opens. Leave out for an event announced before its
   *  mode is built: its card shows 準備中 and does nothing when tapped. */
  kind?: EventKind;
  title: string;
  /** One or two lines under the banner. */
  description: string;
  /** Filename under public/assets/events/ (about 2:1, e.g. 1200x600). Optional:
   *  without it the card draws a banner in `accent` with `emblem` on it. */
  image?: string;
  /** Banner color when there is no image, and the status chip's. */
  accent: number;
  /** A big faint glyph behind the title on a drawn banner; defaults to the title's first character. */
  emblem?: string;
  /** The card's button when it can be opened (default イベントへ). */
  actionLabel?: string;
  /** Local start time, e.g. "2026-12-01T00:00:00". Before it, the event shows
   *  as 開催予定 and cannot be opened. Omit for an event already running. */
  startsAt?: string;
  /** Local end time, e.g. "2026-12-14T23:59:00". Once it passes, the event
   *  drops off the list. Omit for a permanent event. */
  endsAt?: string;
  /** Epoch ms until which the card stays (as 交換期間) after `endsAt`: a 期間限定イベント's 交換所 is open a few days more. */
  exchangeUntil?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The card of a 期間限定イベント on the Event tab. */
export function limitedEventEntry(def: LimitedEventDef): EventEntry {
  return {
    id: def.id,
    kind: 'limited',
    title: def.title,
    description: def.description,
    image: def.image,
    accent: def.accent,
    emblem: def.emblem,
    startsAt: def.startsAt,
    endsAt: def.endsAt,
    exchangeUntil: new Date(def.endsAt).getTime() + def.exchangeDays * DAY_MS,
  };
}

/**
 * The イベント tab's list - any number of events can run (or be announced) at
 * once. This is the thing to edit for a content update: add / remove / reorder
 * an entry (drop its banner into public/assets/events/ if it has one). Running
 * events are listed first, in this order, then the upcoming ones. No code
 * elsewhere needs to change.
 */
export const EVENTS: EventEntry[] = [
  {
    id: 'infinite',
    kind: 'infinite',
    title: '無限モード',
    image: 'infinite.jpg',
    description: '編成したパーティで、どこまで耐えられるか。ランキングに挑め！',
    accent: 0xc7701c,
    emblem: '∞',
  },
  {
    id: 'premium',
    kind: 'premium',
    actionLabel: '詳細・購入',
    title: 'プレミアムパス',
    image: 'premium.jpg',
    description: '毎日魔晶石がもらえて、戦闘2倍速・連戦モード・放置報酬の上限アップも。',
    accent: 0xc79a2a,
    emblem: '♛',
  },
  // The 期間限定イベント of the year are added below (data/schedule.ts).
  ...SCHEDULED_EVENTS.map(limitedEventEntry),
];

/** 'exchange' = the event is over but its 交換所 is still open (a 期間限定イベント only). */
export type EventPhase = 'live' | 'exchange' | 'upcoming' | 'ended';

export function eventPhase(entry: EventEntry, now = Date.now()): EventPhase {
  if (entry.endsAt && new Date(entry.endsAt).getTime() <= now) return entry.exchangeUntil !== undefined && entry.exchangeUntil > now ? 'exchange' : 'ended';
  if (entry.startsAt && new Date(entry.startsAt).getTime() > now) return 'upcoming';
  return 'live';
}

/** How many days ahead an announced event shows on the Event tab (the later ones are in the 年間予定). */
export const UPCOMING_DAYS = 14;

/** Events to list: the 期間限定イベント that is running, then those in their 交換期間 (their currency is about to be lost), then the permanent events
 *  that are running (each in listed order), then the upcoming ones that start within UPCOMING_DAYS (soonest first). Ended events are left out. */
export function getVisibleEvents(now = Date.now()): { entry: EventEntry; phase: EventPhase }[] {
  const all = EVENTS.map((entry) => ({ entry, phase: eventPhase(entry, now) })).filter((e) => e.phase !== 'ended');
  const live = all.filter((e) => e.phase === 'live');
  const limitedFirst = [...live.filter((e) => e.entry.kind === 'limited'), ...live.filter((e) => e.entry.kind !== 'limited')];
  const exchange = all.filter((e) => e.phase === 'exchange');
  const upcoming = all
    .filter((e) => e.phase === 'upcoming' && new Date(e.entry.startsAt!).getTime() - now <= UPCOMING_DAYS * DAY_MS)
    .sort((a, b) => new Date(a.entry.startsAt!).getTime() - new Date(b.entry.startsAt!).getTime());
  const limitedLive = limitedFirst.filter((e) => e.entry.kind === 'limited');
  const permanent = limitedFirst.filter((e) => e.entry.kind !== 'limited');
  return [...limitedLive, ...exchange, ...permanent, ...upcoming];
}

const formatMoment = (iso: string): string => formatDateTime(new Date(iso).getTime());

/** The period line on a card: "常時開催", "12/14 23:59まで", "12/1 0:00 〜 12/14 23:59". */
export function formatEventPeriod(entry: EventEntry): string {
  if (entry.startsAt && entry.endsAt) return `${formatMoment(entry.startsAt)} 〜 ${formatMoment(entry.endsAt)}`;
  if (entry.startsAt) return `${formatMoment(entry.startsAt)} 〜`;
  if (entry.endsAt) return `${formatMoment(entry.endsAt)}まで`;
  return '常時開催';
}
