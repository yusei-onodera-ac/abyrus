// 先に作った30人の登場予定 (data/heroRelease.ts): 月に2人、全員がちょうど1回、その日までは、ゲームに「いない」。
import { ALL_HEROES, HERO_ROSTER, applyHeroReleases, getHeroDefinition } from '../../src/game/data/heroes';
import { HERO_RELEASES, heroReleaseAt, isHeroReleased, nextHeroReleases } from '../../src/game/data/heroRelease';
import { NEW_CHARACTERS_2 } from '../art/newCharacters2.mjs';
import { heroPoolOf } from '../../src/game/systems/GachaSystem';
import { CollectionSystem } from '../../src/game/systems/CollectionSystem';
import { collectionMilestones } from '../../src/game/data/collection';
import { GACHA_BANNERS } from '../../src/game/data/gachaBanners';
import { SaveSystem } from '../../src/game/systems/SaveSystem';
import { createHeroInstance } from '../../src/game/data/heroes';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const JST = (date: string, time = '00:00:00') => Date.parse(`${date}T${time}+09:00`);

// ---- the table
const heldBack = (NEW_CHARACTERS_2 as unknown[][]).map((c) => c[0] as string);
ok(HERO_RELEASES.length === 30, 'the table has 30 entries');
ok(new Set(HERO_RELEASES.map((r) => r.id)).size === 30, 'nobody is in it twice');
ok(heldBack.every((id) => HERO_RELEASES.some((r) => r.id === id)) && HERO_RELEASES.every((r) => heldBack.includes(r.id)), 'it holds exactly the 30 made ahead of time (tools/art/newCharacters2.mjs)');
ok(HERO_RELEASES.every((r) => ALL_HEROES.some((h) => h.id === r.id)), 'every one of them is a defined hero');
ok(HERO_RELEASES.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(JST(r.date))), 'every date is a real YYYY-MM-DD');
const sorted = [...HERO_RELEASES].sort((a, b) => JST(a.date) - JST(b.date));
ok(sorted.map((r) => r.id).join() === HERO_RELEASES.map((r) => r.id).join(), 'the table is in date order');
ok(HERO_RELEASES[0].date === '2026-12-01' && HERO_RELEASES[29].date === '2028-02-16', 'from 2026-12-01 to 2028-02-16 (15 months)');
ok(HERO_RELEASES.every((r) => r.date.endsWith('-01') || r.date.endsWith('-16')), 'always on the 1st or the 16th');

const perMonth = new Map<string, string[]>();
for (const r of HERO_RELEASES) perMonth.set(r.date.slice(0, 7), [...(perMonth.get(r.date.slice(0, 7)) ?? []), r.id]);
ok(perMonth.size === 15 && [...perMonth.values()].every((ids) => ids.length === 2), 'two a month, for 15 months');
const rarityOf = (id: string): number => ALL_HEROES.find((h) => h.id === id)!.rarity;
const classOf = (id: string): string => ALL_HEROES.find((h) => h.id === id)!.heroClass;
const first = HERO_RELEASES.filter((r) => r.date.endsWith('-01'));
const second = HERO_RELEASES.filter((r) => r.date.endsWith('-16'));
ok(first.every((r) => rarityOf(r.id) === 5), 'the one on the 1st is always a ★5');
ok([...perMonth.values()].filter((ids) => ids.some((id) => rarityOf(id) === 6)).length === 10 && second.filter((r) => rarityOf(r.id) === 6).length === 10, 'a ★6 comes on the 16th of ten of the months (2 of every 3 months)');
let sixRun = 0;
for (const [, ids] of perMonth) {
  sixRun = ids.some((id) => rarityOf(id) === 6) ? sixRun + 1 : 0;
  if (sixRun > 2) break;
}
ok(sixRun <= 2, 'never three ★6 months in a row');
const classCount = (r: number) => {
  const c: Record<string, number> = {};
  for (const x of HERO_RELEASES.filter((h) => rarityOf(h.id) === r)) c[classOf(x.id)] = (c[classOf(x.id)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => (a < b ? -1 : 1)));
};
const show = (o: Record<string, number>) => JSON.stringify(Object.entries(o));
ok(show(classCount(6)) === show({ archer: 2, healer: 2, mage: 2, tank: 2, warrior: 2 }), '★6: two of every class');
ok(show(classCount(5)) === show({ archer: 4, healer: 5, mage: 2, tank: 4, warrior: 5 }), '★5: warrior 5, healer 5, tank 4, archer 4, mage 2');
ok(classOf(HERO_RELEASES[0].id) !== classOf(HERO_RELEASES[1].id) && HERO_RELEASES.slice(1).every((r, i) => classOf(r.id) !== classOf(HERO_RELEASES[i].id)), 'two neighbours in the table are never the same class');

// ---- who is in the game on a given day
const base = ALL_HEROES.length - 30;
ok(base === 161, 'the game started with 161 characters');
ok(applyHeroReleases(JST('2026-11-30', '23:59:59')) === 161 && HERO_ROSTER.length === 161, 'before 2026-12-01: 161 (nobody new)');
ok(HERO_ROSTER.every((h) => !heldBack.includes(h.id)), '… and none of the 30 is in the roster');
ok(applyHeroReleases(JST('2026-12-01')) === 162 && HERO_ROSTER.some((h) => h.id === HERO_RELEASES[0].id), 'on 2026-12-01 at 0:00 (Japan): the first one is in (162)');
ok(applyHeroReleases(JST('2026-12-15', '23:59:59')) === 162, 'the 15th: still 162');
ok(applyHeroReleases(JST('2026-12-16')) === 163, 'the 16th: 163');
ok(applyHeroReleases(JST('2027-06-16')) === 161 + 14, 'by 2027-06-16: 14 are out');
ok(applyHeroReleases(JST('2028-02-16')) === 191 && HERO_ROSTER.length === ALL_HEROES.length, 'by 2028-02-16 everybody is out: 191');
ok(applyHeroReleases(JST('2030-01-01')) === 191, 'and it stays 191 after that');
ok(applyHeroReleases(JST('2026-12-20')) === 163 && HERO_ROSTER.length === 163, 'going back to an earlier day takes them out again (the same array, rebuilt in place)');
const sameArray = HERO_ROSTER;
applyHeroReleases(JST('2027-03-01'));
ok(HERO_ROSTER === sameArray, 'HERO_ROSTER stays the same array object (everything that imported it sees the change)');

// ---- helpers
ok(heroReleaseAt('lambda') === JST('2026-12-01') && heroReleaseAt('gauss') === undefined, 'heroReleaseAt: the date of a held-back hero; undefined for one that was always there');
ok(isHeroReleased('gauss', 0) && !isHeroReleased('lambda', JST('2026-11-30')) && isHeroReleased('lambda', JST('2026-12-01')), 'isHeroReleased');
ok(nextHeroReleases(JST('2026-11-20')).map((r) => r.id).join() === HERO_RELEASES[0].id, 'nextHeroReleases: the first one, before anything is out');
ok(nextHeroReleases(JST('2026-12-01')).map((r) => r.id).join() === HERO_RELEASES[1].id, '… the second, once the first is out');
ok(nextHeroReleases(JST('2028-02-16')).length === 0, '… nothing when all are out');

// ---- the game's lists follow the roster
applyHeroReleases(JST('2026-11-20'));
const standard = GACHA_BANNERS.find((b) => !b.pool && !b.rates && b.kind !== 'equipment') ?? GACHA_BANNERS[0];
const special = GACHA_BANNERS.find((b) => b.rates?.some((r) => r.rarity === 6));
ok(heroPoolOf(standard).length > 0 && heroPoolOf(standard).every((h) => !heldBack.includes(h.id)), 'before their day, none of the 30 can come out of the gacha');
if (special) ok(heroPoolOf(special).filter((h) => h.rarity === 6).length === 1, 'the 特設ガチャ has exactly one ★6 before the first ★6 is out');
ok(CollectionSystem.total() === 161 && collectionMilestones().at(-1)?.count === 161, 'the 図鑑 counts only the heroes that are out (161)');
applyHeroReleases(JST('2026-12-16')); // omega? (the second is the first ★5 of month 1 - see the table)
const newOnes = HERO_RELEASES.filter((r) => JST(r.date) <= JST('2026-12-16')).map((r) => r.id);
ok(heroPoolOf(standard).filter((h) => newOnes.includes(h.id) && h.rarity <= 5).length === newOnes.filter((id) => rarityOf(id) <= 5).length, 'on their day they are in the gacha pool (★5s)');
const sixOut = newOnes.filter((id) => rarityOf(id) === 6);
ok(heroPoolOf(standard).every((h) => h.rarity < 6), 'a ★6 never comes out of an ordinary gacha');
if (special) ok(heroPoolOf(special).filter((h) => h.rarity === 6).length === 1 + sixOut.length, 'the 特設ガチャ gets each new ★6 on its day');
ok(CollectionSystem.total() === 163, 'the 図鑑 total grows with them (163)');

// a hero a save holds always resolves, out or not (an early clock must not crash a save)
applyHeroReleases(JST('2026-11-20'));
const early = createHeroInstance('omega', 'x-1');
ok(getHeroDefinition('omega')?.name === '終焉の覇王オメガ' && early.rarity === 6, 'getHeroDefinition / createHeroInstance work for a hero that is not out yet');
const save = SaveSystem.createDefault();
const ownedBefore = CollectionSystem.owned(save);
save.heroes.push(early);
ok(CollectionSystem.owned(save) === ownedBefore, 'a hero that is not out yet is not counted in the 図鑑 (until its day)');
applyHeroReleases(JST('2026-12-20'));
ok(CollectionSystem.owned(save) === ownedBefore, '… and omega is still a later day (2027-01-16 or so): not counted on 2026-12-20 either');
applyHeroReleases(JST('2028-03-01'));
ok(CollectionSystem.owned(save) === ownedBefore + 1, '… but is counted once its day has come');
applyHeroReleases(JST('2026-11-20'));

if (failures) process.exit(1);
