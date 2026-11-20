import { describeCampaign } from '../data/campaigns';
import { GACHA_BANNERS } from '../data/gachaBanners';
import { SCHEDULED_CAMPAIGNS, SCHEDULED_EVENTS, SCHEDULE_NEXT, SCHEDULED_GACHAS } from '../data/schedule';
import { pickupHeroesOf } from './GachaSystem';
import { t } from '../i18n';

/**
 * The year's calendar (data/schedule.ts) as one list of lines for the 年間予定 screen and for docs/EVENT_SCHEDULE.md: every 期間限定イベント, ピックアップガチャ
 * and ブーストキャンペーン with its dates and a line about it, grouped by the month it starts in.
 */
export type ScheduleKind = 'event' | 'gacha' | 'campaign';

export interface ScheduleItem {
  kind: ScheduleKind;
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /** A line about it: the currency of an event, the ピックアップ of a gacha, what a campaign changes. */
  detail: string;
  accent: number;
}

export type ScheduleStatus = 'live' | 'upcoming' | 'ended';

/** The kind's name for the chips and the filter. Getters, so the text is made when it is read (in the language of the moment); the
 *  schedule document (tools/schedule/doc.ts) and the tests read them as plain strings. */
export const KIND_NAME: Record<ScheduleKind, string> = {
  get event() {
    return t('mission.schedule.kindEvent');
  },
  get gacha() {
    return t('mission.schedule.kindGacha');
  },
  get campaign() {
    return t('mission.schedule.kindCampaign');
  },
};
const KIND_ORDER: Record<ScheduleKind, number> = { event: 0, gacha: 1, campaign: 2 };

/** One short line about a gacha: its top-★ ピックアップ by name, and how many more ("★5 虚数姫アリア　ほか4体"). */
function pickupSummary(banner: Parameters<typeof pickupHeroesOf>[0]): string | null {
  const picks = pickupHeroesOf(banner);
  if (picks.length === 0) return null;
  const top = Math.max(...picks.map((h) => h.rarity));
  const best = picks.filter((h) => h.rarity === top);
  const rest = picks.length - best.length;
  return `★${top} ${best.map((h) => h.name).join(t('mission.schedule.nameSeparator'))}${rest > 0 ? t('mission.schedule.andMore', { rest }) : ''}`;
}

export function scheduleItems(): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (const e of SCHEDULED_EVENTS) {
    items.push({ kind: 'event', id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, detail: e.kind === 'dungeon' ? t('mission.schedule.dungeonDetail', { token: e.token.name }) : t('mission.schedule.missionDetail', { token: e.token.name }), accent: e.accent });
  }
  for (const g of SCHEDULED_GACHAS) {
    const banner = GACHA_BANNERS.find((b) => b.id === g.id) ?? g;
    items.push({ kind: 'gacha', id: g.id, title: g.title, startsAt: g.startsAt!, endsAt: g.endsAt!, detail: pickupSummary(banner) ?? g.description, accent: g.accent ?? 0x6a3aa8 });
  }
  for (const c of SCHEDULED_CAMPAIGNS) {
    items.push({ kind: 'campaign', id: c.id, title: c.title, startsAt: c.startsAt, endsAt: c.endsAt, detail: describeCampaign(c), accent: 0x2f7a3a });
  }
  return items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export function itemStatus(item: Pick<ScheduleItem, 'startsAt' | 'endsAt'>, now = Date.now()): ScheduleStatus {
  if (new Date(item.endsAt).getTime() <= now) return 'ended';
  if (new Date(item.startsAt).getTime() > now) return 'upcoming';
  return 'live';
}

/** "11/16 〜 12/6": month and day only (an event ends at 23:59 of its last day, which is what the day says). */
export function formatSpan(item: Pick<ScheduleItem, 'startsAt' | 'endsAt'>): string {
  const md = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  return t('mission.schedule.span', { md: md(item.startsAt), md2: md(item.endsAt) });
}

export interface ScheduleMonth {
  /** "2026-11". */
  key: string;
  /** "2026年11月". */
  label: string;
  items: ScheduleItem[];
}

/** The items grouped by the month they start in, the months in order. */
export function groupByMonth(items: ScheduleItem[]): ScheduleMonth[] {
  const months: ScheduleMonth[] = [];
  for (const item of items) {
    const d = new Date(item.startsAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let month = months[months.length - 1];
    if (!month || month.key !== key) {
      month = { key, label: t('mission.schedule.month', { year: d.getFullYear(), month: d.getMonth() + 1 }), items: [] };
      months.push(month);
    }
    month.items.push(item);
  }
  return months;
}

/** The key of the month `now` is in ("2026-11"), for scrolling the screen to it. */
export function monthKeyOf(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export { SCHEDULE_NEXT };
