import { formatDateTime } from '../ui/format';

/** What tapping a running event opens. Only the 無限モード screen exists so far;
 *  add a kind here (and a case in EventScene.open) when another mode is built. */
export type EventKind = 'infinite';

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
  /** Local start time, e.g. "2026-12-01T00:00:00". Before it, the event shows
   *  as 開催予定 and cannot be opened. Omit for an event already running. */
  startsAt?: string;
  /** Local end time, e.g. "2026-12-14T23:59:00". Once it passes, the event
   *  drops off the list. Omit for a permanent event. */
  endsAt?: string;
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
    description: '編成したパーティで、どこまで耐えられるか。ランキングに挑め！',
    accent: 0xc7701c,
    emblem: '∞',
  },
  // Sample of an announced event (delete or replace it): it shows as 開催予定
  // until startsAt, then as 準備中 until it is given a `kind`.
  {
    id: 'sample-upcoming',
    title: '期間限定イベント（サンプル）',
    description: '開催予定のイベントは、期間つきでこのように表示されます。',
    accent: 0x3f7a3a,
    emblem: '祭',
    startsAt: '2026-12-01T00:00:00',
    endsAt: '2026-12-14T23:59:00',
  },
];

export type EventPhase = 'live' | 'upcoming' | 'ended';

export function eventPhase(entry: EventEntry, now = Date.now()): EventPhase {
  if (entry.endsAt && new Date(entry.endsAt).getTime() <= now) return 'ended';
  if (entry.startsAt && new Date(entry.startsAt).getTime() > now) return 'upcoming';
  return 'live';
}

/** Events to list: the running ones in listed order, then the upcoming ones
 *  (soonest first). Ended events are left out. */
export function getVisibleEvents(now = Date.now()): { entry: EventEntry; phase: EventPhase }[] {
  const all = EVENTS.map((entry) => ({ entry, phase: eventPhase(entry, now) })).filter((e) => e.phase !== 'ended');
  const live = all.filter((e) => e.phase === 'live');
  const upcoming = all.filter((e) => e.phase === 'upcoming').sort((a, b) => new Date(a.entry.startsAt!).getTime() - new Date(b.entry.startsAt!).getTime());
  return [...live, ...upcoming];
}

const formatMoment = (iso: string): string => formatDateTime(new Date(iso).getTime());

/** The period line on a card: "常時開催", "12/14 23:59まで", "12/1 0:00 〜 12/14 23:59". */
export function formatEventPeriod(entry: EventEntry): string {
  if (entry.startsAt && entry.endsAt) return `${formatMoment(entry.startsAt)} 〜 ${formatMoment(entry.endsAt)}`;
  if (entry.startsAt) return `${formatMoment(entry.startsAt)} 〜`;
  if (entry.endsAt) return `${formatMoment(entry.endsAt)}まで`;
  return '常時開催';
}
