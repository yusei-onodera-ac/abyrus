import type { Rarity } from '../types';
import { SCHEDULED_GACHAS } from './schedule';
import { localized, t } from '../i18n';
import { formatDateTime } from '../ui/format';

export interface GachaBannerEntry {
  id: string;
  /** Header line above the banner art, e.g. "新ガチャ開催！". */
  title: string;
  /** Filename under public/assets/gacha/. Roughly 16:9 (e.g. 1024x572); the
   *  card is as tall as the image's own aspect ratio makes it. */
  image: string;
  /** One line beside the 詳細 button. */
  description: string;
  /** Local start time, e.g. "2026-12-17T00:00:00". Before it the gacha is not in the list. Omit for one that is already on
   *  (the year's limited ones are all given a start: data/schedule.ts). */
  startsAt?: string;
  /** Local end time, e.g. "2026-11-11T23:59:00". Shown after the title as
   *  "11/11 23:59まで", and the gacha drops off the list once it passes.
   *  Omit for a permanent gacha. */
  endsAt?: string;
  /** 'equipment' pulls equipment (EQUIP_GACHA_RATES, its own prices); the default pulls heroes. */
  kind?: 'hero' | 'equipment';
  /** With no banner art, the card draws a banner in this colour (with `emblem` on it) instead of 準備中. */
  accent?: number;
  emblem?: string;
  /** 排出率 for this gacha (★ and its share, adding up to 1). Leave out for the standard rates (GACHA_RATES). */
  rates?: { rarity: Rarity; rate: number }[];
  /** Which characters (hero ids, data/heroes.ts) can come out. Leave out for everyone. The
   *  ガチャ詳細 screen lists exactly these, each with its own rate. */
  pool?: string[];
  /** ピックアップ: these characters (hero ids; ★3 or better) come out more often. Of each rarity that has some, `share` (0..1) of
   *  its rate goes to them, shared evenly; the rest goes to the others of that rarity. Leave out for no ピックアップ. */
  pickup?: { heroes: string[]; share: number };
  /** 天井: the `at`-th pull counted since the last ★minRarity-or-better is certain to be one,
   *  and the count starts over whenever one comes out. With `pickup`, that certain one is one of the ピックアップ
   *  (those of ★minRarity or better) instead of anyone. Leave out for no 天井. */
  pity?: { at: number; minRarity: Rarity; pickup?: boolean };
  /** 10連の保証: a ten-pull always contains at least one hero of this ★ or better (if none came, the last pull of
   *  the batch is raised to one). A single pull is not affected. Leave out for no such promise. */
  tenMin?: Rarity;
  /** 魔晶石 for one pull / a ten-pull. Leave out for the standard prices of its kind. */
  singleCost?: number;
  tenCost?: number;
}

/**
 * The Gacha screen's scrolling list, top to bottom. This is the thing to
 * edit for a content update: drop the banner image into
 * public/assets/gacha/, then add/remove/reorder an entry here. No code
 * elsewhere needs to change. A missing image just shows a "準備中" card.
 *
 * Every gacha currently rolls the same pool at the same rates and cost (see
 * GachaSystem) - an entry changes what's shown, not what's rolled.
 */
const GACHA_BANNER_ROWS: GachaBannerEntry[] = [
  {
    id: 'special',
    title: '特設ガチャ',
    image: 'special.jpg',
    description: '新★6「無限帝アイオーン」登場！',
    accent: 0xd9367f,
    emblem: '∞',
    // 仮の数字: ★6 is rare (0.4%); the 天井 and the 10連 promise below keep a bad run from going on for ever.
    rates: [
      { rarity: 6, rate: 0.004 },
      { rarity: 5, rate: 0.03 },
      { rarity: 4, rate: 0.1 },
      { rarity: 3, rate: 0.25 },
      { rarity: 2, rate: 0.3 },
      { rarity: 1, rate: 0.316 },
    ],
    pity: { at: 40, minRarity: 5 },
    tenMin: 3,
  },
  {
    id: 'first',
    title: 'はじめてのガチャ',
    image: 'first.jpg',
    description: '30回目までに★4以上が必ず出る！',
    accent: 0xc7701c,
    emblem: '初',
    // 仮の数字: ★5 / ★4 をほんの少し高く。
    rates: [
      { rarity: 5, rate: 0.01 },
      { rarity: 4, rate: 0.04 },
      { rarity: 3, rate: 0.12 },
      { rarity: 2, rate: 0.28 },
      { rarity: 1, rate: 0.55 },
    ],
    pity: { at: 30, minRarity: 4 },
  },
  {
    id: 'equip-standard',
    kind: 'equipment',
    title: '装備ガチャ',
    image: 'equip_standard.jpg',
    description: '武器・防具・装飾が手に入る',
    accent: 0x2f7a8a,
    emblem: '装',
  },
  {
    id: 'standard',
    title: '通常ガチャ',
    image: 'standard.jpg',
    description: '★5以下の全キャラクターが排出対象',
  },
  // The year's limited gachas (ピックアップ and 装備の感謝祭): data/schedule.ts. getActiveGachaBanners puts the ones that are on first.
  ...SCHEDULED_GACHAS,
];

/** Title and description are read through tr() each time (English: i18n/data/shopEn.ts for the permanent four; the limited ones are
 *  data/schedule.ts's, with the events). */
export const GACHA_BANNERS: GachaBannerEntry[] = GACHA_BANNER_ROWS.map((row) => localized('gachaBanner', row.id, row, ['title', 'description']));

/** Promo strip beside the フレンドガチャ button, under public/assets/gacha/.
 *  About 4.6:1 (e.g. 1290x280). */
export const FRIEND_GACHA_IMAGE = 'friend_gacha.jpg';

/** Whether the gacha is on at `now`: started (if it has a start) and not yet ended (if it has an end). */
export function isGachaActive(b: Pick<GachaBannerEntry, 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return false;
  return !b.endsAt || new Date(b.endsAt).getTime() > now;
}

/** The gachas that are on: the limited ones (the newest started first), then the permanent ones in their listed order. */
export function getActiveGachaBanners(now = Date.now()): GachaBannerEntry[] {
  const on = GACHA_BANNERS.filter((b) => isGachaActive(b, now));
  const limited = on.filter((b) => b.startsAt).sort((a, b) => new Date(b.startsAt!).getTime() - new Date(a.startsAt!).getTime());
  return [...limited, ...on.filter((b) => !b.startsAt)];
}

/** "11/7 11:59まで" - month/day unpadded, minutes padded. */
export function formatGachaEnd(endsAt: string): string {
  return t('mission.event.until', { formatDateTime: formatDateTime(new Date(endsAt).getTime()) });
}
