import { SCHEDULED_EVENTS } from './schedule';
import { getActiveGachaBanners } from './gachaBanners';
import { isEventRunning } from '../systems/EventProgress';

export interface BannerEntry {
  id: string;
  /** Filename under public/assets/banners/ (leave out when `textureKey` names a picture that is loaded already). */
  image?: string;
  /** The key of a picture loaded elsewhere (an event's or a gacha's banner), used instead of loading `image`. */
  textureKey?: string;
  /** Scene key to open on tap, if any. */
  target?: string;
  /** Data the scene is started with. */
  targetData?: object;
}

/**
 * Home screen's top-left promo rotation - new gacha pushes, event
 * announcements, limited packs. This is the thing to edit for a content
 * update: drop the new banner image into public/assets/banners/, then
 * add/remove/reorder an entry here. No code elsewhere needs to change.
 * Expected to turn over roughly every two weeks.
 */
export const BANNERS: BannerEntry[] = [
  { id: 'special', image: 'special.jpg', target: 'Gacha' },
  { id: 'starter-pack', image: 'starter_pack.jpg', target: 'Shop' },
];

/** How many of the running gachas the Home carousel shows (the newest first). */
const HOME_GACHAS = 2;

/** The Home carousel as of `now`: the 期間限定イベント that is on, the limited gachas that are on (their pictures are the ones of the Event and Gacha
 *  tabs), then the fixed banners above. */
export function getHomeBanners(now = Date.now()): BannerEntry[] {
  const events: BannerEntry[] = SCHEDULED_EVENTS.filter((e) => isEventRunning(e, now)).map((e) => ({ id: `event-${e.id}`, textureKey: `event_banner_${e.id}`, target: 'EventQuest', targetData: { eventId: e.id } }));
  const gachas: BannerEntry[] = getActiveGachaBanners(now)
    .filter((g) => g.startsAt)
    .slice(0, HOME_GACHAS)
    .map((g) => ({ id: `gacha-${g.id}`, textureKey: `gacha_banner_${g.id}`, target: 'Gacha' }));
  return [...events, ...gachas, ...BANNERS];
}
