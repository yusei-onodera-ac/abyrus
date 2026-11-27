import { SCHEDULED_EVENTS, SCHEDULED_GACHAS } from './schedule';
import { formatDate, formatDateTime } from '../ui/format';
import { remoteNotices } from '../systems/RemoteNotices';
import { localized, t } from '../i18n';

export interface NoticeEntry {
  id: string;
  /** Short tag shown on the card, e.g. "お知らせ", "イベント", "メンテナンス". */
  category: string;
  title: string;
  /** Full text, opened by tapping the card. Plain text; "\n" breaks a line. */
  body: string;
  /** Shown on the card, e.g. "2026/10/28". */
  date: string;
  /** Filename under public/assets/notices/. Optional - a text-only notice is fine. */
  image?: string;
  /** The key of a picture that is loaded already (an event's or a gacha's banner), instead of one of its own. */
  textureKey?: string;
}

/**
 * The お知らせ board, newest first. This is the thing to edit for an
 * announcement: drop the image (if any) into public/assets/notices/, then add
 * an entry at the top. No code elsewhere needs to change. A notice shows a
 * red NEW tag until the player has opened it.
 */
const NOTICE_ROWS: NoticeEntry[] = [
  {
    id: 'new-gacha',
    category: 'イベント',
    title: '新ガチャ開催のお知らせ',
    date: '2026/10/28',
    image: 'new_gacha.jpg',
    body:
      '新ガチャを開催中です。\nガチャ画面から、開催中のガチャと排出率をご確認いただけます。\n\n' +
      '※期間は各ガチャの見出しに表示されています。',
  },
  {
    id: 'welcome',
    category: 'お知らせ',
    title: 'ABYRUSへようこそ',
    date: '2026/10/28',
    image: 'welcome.jpg',
    body:
      'ABYRUSをご利用いただきありがとうございます。\n\n' +
      'クエストで経験値とゴールドを集め、ガチャで仲間を増やして、あなただけの編成を作りましょう。\n\n' +
      'お知らせ・プレゼント・メールは、ホーム画面右上のボタンからいつでも確認できます。',
  },
];

/** Title and text are read through tr() each time (English: i18n/data/missionsEn.ts). `category` stays the Japanese key the notice board maps to its label. */
export const NOTICES: NoticeEntry[] = NOTICE_ROWS.map((row) => localized('notice', row.id, row, ['title', 'body']));

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the notice of an event or a gacha stays on the board after it starts. */
const SCHEDULE_NOTICE_DAYS = 30;

/** The お知らせ the year's calendar (data/schedule.ts) makes by itself: one when each 期間限定イベント and each ピックアップガチャ starts, which stays on
 *  the board for SCHEDULE_NOTICE_DAYS. Newest first. */
export function scheduleNotices(now = Date.now()): NoticeEntry[] {
  const out: (NoticeEntry & { at: number })[] = [];
  const keep = (startsAt: string): boolean => {
    const at = new Date(startsAt).getTime();
    return at <= now && now - at <= SCHEDULE_NOTICE_DAYS * DAY_MS;
  };
  for (const e of SCHEDULED_EVENTS) {
    if (!keep(e.startsAt)) continue;
    const period = t('sys.event.range', { from: formatDateTime(new Date(e.startsAt).getTime()), to: formatDateTime(new Date(e.endsAt).getTime()) });
    const how = e.kind === 'dungeon' ? t('social.notice.eventHowDungeon', { token: e.token.name }) : t('social.notice.eventHowMission', { token: e.token.name });
    out.push({
      id: `event-${e.id}`,
      category: 'イベント', // i18n-ignore (the key the notice board maps to its label)
      title: t('social.notice.eventTitle', { title: e.title }),
      date: formatDate(new Date(e.startsAt).getTime()),
      textureKey: `event_banner_${e.id}`,
      image: e.image,
      body: t('social.notice.eventBody', { title: e.title, story: e.story, how, token: e.token.name, period, exchangeDays: e.exchangeDays }),
      at: new Date(e.startsAt).getTime(),
    });
  }
  for (const g of SCHEDULED_GACHAS) {
    if (!keep(g.startsAt!)) continue;
    const period = t('sys.event.range', { from: formatDateTime(new Date(g.startsAt!).getTime()), to: formatDateTime(new Date(g.endsAt!).getTime()) });
    out.push({
      id: `gacha-${g.id}`,
      category: 'ガチャ', // i18n-ignore (the key the notice board maps to its label)
      title: t('social.notice.gachaTitle', { title: g.title }),
      date: formatDate(new Date(g.startsAt!).getTime()),
      textureKey: `gacha_banner_${g.id}`,
      image: g.image,
      body: t('social.notice.gachaBody', { title: g.title, description: g.description, period }),
      at: new Date(g.startsAt!).getTime(),
    });
  }
  return out.sort((a, b) => b.at - a.at).map(({ at: _at, ...notice }) => notice);
}

/** The whole board: the operator's notices from the admin (systems/RemoteNotices.ts, newest first, none without a connection), then the
 *  ones the calendar made, then the ones written above. */
export function getNotices(now = Date.now()): NoticeEntry[] {
  return [...remoteNotices(now), ...scheduleNotices(now), ...NOTICES];
}
