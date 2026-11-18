/**
 * 新キャラの登場予定: 30人 (★6 x10, ★5 x20) は、絵・声・スキル・セリフまで先に作ってあり、ここに書いた日から、ゲームに出る
 * (ガチャの当たり、図鑑、ホームのキャラ選びなど)。それまでは、ゲームの中に「いない」ことになる (絵のファイルはアプリに入っている)。
 * 月に2人、毎月1日と16日の0時 (日本時間) に、1人ずつ。2026年12月から2028年2月まで (15か月)。
 *
 * 3か月で 6人: 1か月め ★5 + ★5 / 2か月め ★5 + ★6 / 3か月め ★5 + ★6 (これを5回 = ★5 x20, ★6 x10)。職業は、順に散らしてある。
 * ここに書いていないキャラは、はじめから出ている (いまの161人)。日付を変える・順を入れ替えるときは、この表だけを直す
 * (tools/tests/heroRelease.ts が、月に2人・全員がちょうど1回・日付の形を確かめる)。
 *
 * 登場した日の「ピックアップガチャ」は、年間予定 (data/schedule.ts) に足して作る (まだ足していない: 絵の準備が要る)。
 */
export interface HeroRelease {
  id: string;
  /** "YYYY-MM-DD": 0:00 Japan time of that day. */
  date: string;
}

/** ★5 in the order they come out (a class at a time, spread out): warrior, healer, tank, archer, mage, ... */
const FIVE = ['lambda', 'epsilon', 'omicron', 'nu', 'psi', 'kappa', 'oasis', 'upsilon', 'mu', 'eta', 'theta', 'aurum', 'beta', 'chi', 'xi', 'lumen', 'gamma', 'iota', 'rho', 'pax'];
/** ★6 in the order they come out (chosen so that no two neighbours in the whole table are of the same class: tools/tests/heroRelease.ts). */
const SIX = ['omega', 'pi', 'cantor', 'noether', 'godel', 'euler', 'fermat', 'alpha', 'zero', 'riemann'];

/** The first month is 2026-12; month index 0..14. */
function monthOf(index: number): { y: number; m: number } {
  const total = 2026 * 12 + 11 + index; // (2026-12 is month number 11 of year 2026, zero-based)
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}
const two = (n: number): string => String(n).padStart(2, '0');

function build(): HeroRelease[] {
  const out: HeroRelease[] = [];
  for (let cycle = 0; cycle < 5; cycle++) {
    // [first of the month, sixteenth of the month] for each of the three months of the cycle
    const slots: [string, string][] = [
      [FIVE[cycle * 4], FIVE[cycle * 4 + 1]],
      [FIVE[cycle * 4 + 2], SIX[cycle * 2]],
      [FIVE[cycle * 4 + 3], SIX[cycle * 2 + 1]],
    ];
    slots.forEach(([first, second], i) => {
      const { y, m } = monthOf(cycle * 3 + i);
      out.push({ id: first, date: `${y}-${two(m)}-01` }, { id: second, date: `${y}-${two(m)}-16` });
    });
  }
  return out;
}

/** Every character that is held back, with the day it comes out, in that order. */
export const HERO_RELEASES: readonly HeroRelease[] = build();

const AT = new Map<string, number>(HERO_RELEASES.map((r) => [r.id, Date.parse(`${r.date}T00:00:00+09:00`)]));

/** When a character comes out (ms since the epoch), or undefined when it has been there from the start. */
export function heroReleaseAt(heroId: string): number | undefined {
  return AT.get(heroId);
}

/** Whether a character is in the game at `now`. */
export function isHeroReleased(heroId: string, now = Date.now()): boolean {
  const at = AT.get(heroId);
  return at === undefined || at <= now;
}

/** The next characters to come out after `now` (the next day's, both when two share a day), or an empty list when everyone is out. */
export function nextHeroReleases(now = Date.now()): HeroRelease[] {
  const upcoming = HERO_RELEASES.filter((r) => (AT.get(r.id) ?? 0) > now);
  if (upcoming.length === 0) return [];
  const first = AT.get(upcoming[0].id);
  return upcoming.filter((r) => AT.get(r.id) === first);
}
