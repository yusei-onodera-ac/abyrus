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
