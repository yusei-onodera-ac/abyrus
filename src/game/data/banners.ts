export interface BannerEntry {
  id: string;
  /** Filename under public/assets/banners/. */
  image: string;
  /** Scene key to open on tap, if any. */
  target?: string;
}

/**
 * Home screen's top-left promo rotation - new gacha pushes, event
 * announcements, limited packs. This is the thing to edit for a content
 * update: drop the new banner image into public/assets/banners/, then
 * add/remove/reorder an entry here. No code elsewhere needs to change.
 * Expected to turn over roughly every two weeks.
 */
export const BANNERS: BannerEntry[] = [
  { id: 'new-gacha', image: 'new_gacha.jpg', target: 'Gacha' },
  { id: 'starter-pack', image: 'starter_pack.jpg', target: 'Shop' },
];
