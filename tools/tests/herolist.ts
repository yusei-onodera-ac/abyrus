// The sort / filter of the hero lists (編成 roster, 強化 tab).
import { HERO_ROSTER, createHeroInstance } from '../../src/game/data/heroes';
import { DEFAULT_HERO_LIST_VIEW, applyHeroListView, readHeroListView, writeHeroListView, type HeroListView } from '../../src/game/systems/HeroListView';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// One of every character at a spread of levels, plus two extra copies of the first one.
const heroes = HERO_ROSTER.map((d, i) => createHeroInstance(d.id, `h${i}`, 1 + ((i * 7) % 100)));
heroes.push(createHeroInstance(HERO_ROSTER[0].id, 'copy-a', 90), createHeroInstance(HERO_ROSTER[0].id, 'copy-b', 5));
const view = (v: Partial<HeroListView>): HeroListView => ({ ...DEFAULT_HERO_LIST_VIEW, ...v });

const all = applyHeroListView(heroes, view({}));
ok(all.length === heroes.length, 'no filter: every hero is listed');
ok(all.every((h, i) => i === 0 || all[i - 1].rarity >= h.rarity), '★順: rarity never goes up down the list');
const first = HERO_ROSTER[0].id;
const idx = all.map((h, i) => (h.heroId === first ? i : -1)).filter((i) => i >= 0);
ok(idx.length === 3 && idx[2] - idx[0] === 2, '★順: the copies of one character sit together');
ok(all[idx[0]].level >= all[idx[1]].level && all[idx[1]].level >= all[idx[2]].level, '★順: the highest level of a character comes first');

ok(applyHeroListView(heroes, view({ rarity: 6 })).every((h) => h.rarity === 6) && applyHeroListView(heroes, view({ rarity: 6 })).length >= 1, 'filter ★6: only ★6');
const mages = applyHeroListView(heroes, view({ heroClass: 'mage' }));
ok(mages.length > 0 && mages.every((h) => h.heroClass === 'mage'), 'filter 魔術師: only mages');
const both = applyHeroListView(heroes, view({ rarity: 4, heroClass: 'tank' }));
ok(both.every((h) => h.rarity === 4 && h.heroClass === 'tank'), 'the two filters combine');
ok(applyHeroListView(heroes, view({ rarity: 6, heroClass: 'tank' })).length === 0, 'a combination with nobody gives an empty list (the screen says so)');

const byLevel = applyHeroListView(heroes, view({ sort: 'level' }));
ok(byLevel.every((h, i) => i === 0 || byLevel[i - 1].level >= h.level), 'Lv順: levels go down');
const byNew = applyHeroListView(heroes, view({ sort: 'new' }));
ok(byNew[0].id === 'copy-b' && byNew[1].id === 'copy-a', '新しい順: the last one obtained first');
const byPower = applyHeroListView(heroes, view({ sort: 'power' }));
ok(byPower.length === heroes.length, '総合力: every hero listed');
const byClass = applyHeroListView(heroes, view({ sort: 'class' }));
const classChanges = byClass.filter((h, i) => i > 0 && h.heroClass !== byClass[i - 1].heroClass).length;
ok(classChanges === 4, '職業順: each class forms one block (4 changes between 5 classes)');
ok(heroes[0].id === 'h0', 'sorting does not reorder the save\'s own list');

// the choice lives in the game registry for the session
const store = new Map<string, unknown>();
const registry = { get: (k: string) => store.get(k), set: (k: string, v: unknown) => void store.set(k, v) };
ok(JSON.stringify(readHeroListView(registry)) === JSON.stringify(DEFAULT_HERO_LIST_VIEW), 'nothing chosen yet: the default view');
writeHeroListView(registry, view({ sort: 'power', rarity: 5, heroClass: 'archer' }));
ok(readHeroListView(registry).sort === 'power' && readHeroListView(registry).rarity === 5 && readHeroListView(registry).heroClass === 'archer', 'a chosen view is read back');
store.set('heroListView', { sort: 'nonsense', rarity: 99, heroClass: 'dragon' });
ok(JSON.stringify(readHeroListView(registry)) === JSON.stringify(DEFAULT_HERO_LIST_VIEW), 'junk in the registry falls back to the default');

// every character has words of their own for the Home screen, and none is left over for a character that does not exist
import { PERSONAL_LINES } from '../../src/game/data/heroLines';
import { homeLinesFor } from '../../src/game/data/homeLines';
const ids = new Set(HERO_ROSTER.map((d) => d.id));
ok(HERO_ROSTER.every((d) => (PERSONAL_LINES[d.id]?.length ?? 0) >= 2), 'every character has at least two lines of their own');
ok(Object.keys(PERSONAL_LINES).every((id) => ids.has(id)), 'no lines for a character that is not in the roster');
ok(Object.values(PERSONAL_LINES).every((l) => l.every((t) => t.length > 4 && t.length <= 60)), 'every line is a sentence of a sensible length');
ok(homeLinesFor('gauss', 'tank')[0].voice === 'home_gauss_1', "a character's own lines use their own voice ids");
ok(homeLinesFor('nobody', 'mage')[0].voice === 'home_mage_1', 'an unknown character falls back to the class lines');

if (failures) process.exit(1);
