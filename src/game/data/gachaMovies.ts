/**
 * ガチャ演出ムービー: `public/assets/movies/gacha_1.mp4` ... `gacha_5.mp4` (720x1280, 縦). Each
 * pull plays one of them before the results, picked by the best ★ in the pull - so the movie
 * is a promise that cannot be broken: the bigger it gets, the better what comes out, and the
 * last one (5) only ever plays when a ★5 really came out (the top of every gacha).
 *
 *   1 = ノーマル  ...  5 = 最高(★5確定)
 *
 * To change which movie a ★ plays, edit the table; to replace a movie, drop a new file in
 * under the same name. A missing file just skips to the results.
 */
export const GACHA_MOVIE_BY_RARITY: Record<number, string> = {
  1: 'gacha_1',
  2: 'gacha_2',
  3: 'gacha_3',
  4: 'gacha_4',
  5: 'gacha_5',
};

/** The movie id (see MovieSystem) for a pull whose best result is `bestRarity` stars. */
export function gachaMovieId(bestRarity: number): string {
  const ids = Object.keys(GACHA_MOVIE_BY_RARITY).map(Number);
  const rarity = Math.min(Math.max(Math.round(bestRarity), Math.min(...ids)), Math.max(...ids));
  return GACHA_MOVIE_BY_RARITY[rarity];
}
