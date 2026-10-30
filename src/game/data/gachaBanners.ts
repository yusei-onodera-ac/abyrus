import type { Rarity } from '../types';

export interface GachaBannerEntry {
  id: string;
  /** Header line above the banner art, e.g. "新ガチャ開催！". */
  title: string;
  /** Filename under public/assets/gacha/. Roughly 16:9 (e.g. 1024x572); the
   *  card is as tall as the image's own aspect ratio makes it. */
  image: string;
  /** One line beside the 詳細 button. */
  description: string;
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
  /** 天井: the `at`-th pull counted since the last ★minRarity-or-better is certain to be one,
   *  and the count starts over whenever one comes out. Leave out for no 天井. */
  pity?: { at: number; minRarity: Rarity };
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
export const GACHA_BANNERS: GachaBannerEntry[] = [
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
    id: 'new-gacha',
    title: '新ガチャ開催！',
    image: 'new_gacha.jpg',
    description: '新キャラクター登場！',
    endsAt: '2026-11-11T23:59:00',
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
    description: '全キャラクターが排出対象',
  },
];

/** Promo strip beside the フレンドガチャ button, under public/assets/gacha/.
 *  About 4.6:1 (e.g. 1290x280). */
export const FRIEND_GACHA_IMAGE = 'friend_gacha.jpg';

export function getActiveGachaBanners(now = Date.now()): GachaBannerEntry[] {
  return GACHA_BANNERS.filter((b) => !b.endsAt || new Date(b.endsAt).getTime() > now);
}

/** "11/7 11:59まで" - month/day unpadded, minutes padded. */
export function formatGachaEnd(endsAt: string): string {
  const d = new Date(endsAt);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}まで`;
}
