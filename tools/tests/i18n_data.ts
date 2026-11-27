// i18n, data tables: with the language set to English, none of the text fields that are read through tr() / localized() may still be
// Japanese (a row without an English entry falls back to its Japanese, which this test then reports), and in Japanese they must still be
// the text the data holds. Add a table here when its English is added (docs/I18N.md, "データ表の文字").
import { getLanguage, setLanguage, t, tr, trList } from '../../src/game/i18n';
import { BUILD_TABS, BUILDINGS, VILLAGE_MATERIALS, WANDERERS } from '../../src/game/data/village';
import { VILLAGE_GOALS, unlocksAt } from '../../src/game/data/villageGoals';
import { VILLAGE_QUESTS } from '../../src/game/data/villageQuests';
import { MISSION_GROUPS } from '../../src/game/data/missions';
import { GIFT_CAMPAIGNS } from '../../src/game/data/gifts';
import { MAIL_CAMPAIGNS } from '../../src/game/data/mails';
import { NOTICES } from '../../src/game/data/notices';
import { SUPPLY_SLOTS } from '../../src/game/data/supply';
import { EQUIP_DEFS, EQUIP_STAT_LABEL } from '../../src/game/data/equipment';
import { GEM_PRODUCTS, GOLD_PRODUCTS, ITEM_PRODUCTS, PACKS } from '../../src/game/data/shop';
import { premiumName } from '../../src/game/data/premium';
import { GACHA_BANNERS } from '../../src/game/data/gachaBanners';
import { FERAL_PREFIXES, REGIONS, pickFeral } from '../../src/game/data/regions';
import { WEEKDAY_DUNGEONS, WEEKDAY_TIERS } from '../../src/game/data/weekdayDungeons';
import { EXPEDITIONS } from '../../src/game/data/expeditions';
import { ITEMS } from '../../src/game/data/items';
import { TUTORIAL_STEPS, VILLAGE_TUTORIAL_STEPS } from '../../src/game/data/tutorial';
import { PEOPLE } from '../../src/game/ui/VillagePeople';
import { ALL_HEROES, defShort } from '../../src/game/data/heroes';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const JA = /[　-ヿ㐀-鿿＀-￯]/;

/** [table, id, field, value] for each text field of each row. */
function collect(): [string, string, string, string][] {
  const out: [string, string, string, string][] = [];
  const add = (table: string, id: string, row: object, fields: string[]): void => {
    for (const f of fields) {
      const v = (row as Record<string, unknown>)[f];
      if (typeof v === 'string') out.push([table, id, f, v]);
    }
  };
  for (const r of BUILD_TABS) add('buildTab', r.id, r, ['name']);
  for (const r of VILLAGE_MATERIALS) add('villageMaterial', r.id, r, ['name']);
  for (const r of BUILDINGS) add('building', r.kind, r, ['name', 'description']);
  for (const [k, r] of Object.entries(WANDERERS)) add('wanderer', k, r, ['name']);
  for (const r of VILLAGE_GOALS) add('villageGoal', r.id, r, ['text']);
  for (const r of VILLAGE_QUESTS) add('villageQuest', r.id, r, ['text']);
  for (let level = 2; level <= 6; level++) unlocksAt(level).forEach((line, i) => add('unlock', `${level}.${i}`, line, ['text']));
  for (const g of MISSION_GROUPS) for (const m of g.missions) add('mission', m.id, m, ['title']);
  for (const r of GIFT_CAMPAIGNS) add('gift', r.id, r, ['title', 'message']);
  for (const r of MAIL_CAMPAIGNS) add('mail', r.id, r, ['title', 'body']);
  for (const r of NOTICES) add('notice', r.id, r, ['title', 'body']);
  for (const r of SUPPLY_SLOTS) add('supply', r.id, r, ['name']);
  for (const r of EQUIP_DEFS) add('equip', r.id, r, ['name']);
  for (const [k, v] of Object.entries(EQUIP_STAT_LABEL)) out.push(['equipStat', k, 'label', v]);
  for (const r of [...PACKS, ...GEM_PRODUCTS, ...GOLD_PRODUCTS, ...ITEM_PRODUCTS]) add('shop', r.id, r, ['name', 'description', 'badge']);
  out.push(['premium', 'pass', 'name', premiumName()]);
  for (const r of GACHA_BANNERS.filter((b) => ['special', 'first', 'equip-standard', 'standard'].includes(b.id))) add('gachaBanner', r.id, r, ['title', 'description']);
  for (const r of REGIONS) {
    add('region', r.id, r, ['name', 'mapDescription', 'bossName']);
    out.push(['region', r.id, 'tab', tr('region', r.id, 'tab', r.name)]);
    r.feralAnimals.forEach((a, i) => add('feralAnimal', `${r.id}_${i}`, a, ['name']));
  }
  for (const r of WEEKDAY_TIERS) add('weekdayTier', r.id, r, ['name', 'note']);
  for (const r of WEEKDAY_DUNGEONS) add('weekdayDungeon', String(r.day), r, ['name', 'theme']);
  for (const r of EXPEDITIONS) add('expedition', r.id, r, ['name', 'description']);
  for (const r of Object.values(ITEMS)) add('item', r.id, r, ['name', 'short', 'description']);
  for (const step of [...TUTORIAL_STEPS, ...VILLAGE_TUTORIAL_STEPS]) if (step.lines) out.push(['tutorial', step.id, 'lines', step.lines.join('\n')]);
  for (const p of PEOPLE) out.push(['villager', p.id, 'lines', trList('villager', p.id, 'lines', p.lines).join('\n')]);
  for (const r of ALL_HEROES) {
    add('hero', r.id, r, ['name']);
    out.push(['hero', r.id, 'short', defShort(r)]);
  }
  return out;
}

setLanguage('ja', { persist: false });
const jaRows = collect();
ok(jaRows.length > 400, `${jaRows.length} text fields are checked`);
ok(jaRows.every(([, , , v]) => JA.test(v) || /^[\x20-\x7e]*$/.test(v)), 'in Japanese the rows are the Japanese the data holds');
ok(t('quest.feral.name', { prefix: FERAL_PREFIXES[0], animal: 'X' }) === `${FERAL_PREFIXES[0]}X`, 'an enemy name is written together in Japanese');

setLanguage('en', { persist: false });
ok(getLanguage() === 'en', 'English is set');
const enRows = collect();
ok(enRows.length === jaRows.length, 'the same fields in English');
const stillJa = enRows.filter(([, , , v]) => JA.test(v));
ok(stillJa.length === 0, `no text field is still Japanese in English${stillJa.length ? ` (${stillJa.length}, e.g. ${stillJa.slice(0, 5).map(([tb, id, f]) => `${tb}.${id}.${f}`).join(', ')})` : ''}`);
const empty = enRows.filter(([, , , v]) => v.trim() === '');
ok(empty.length === 0, 'and none is empty');

// an enemy's name: an adjective and an animal, joined by a space in English, with no Japanese left
let seed = 1;
const rng = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const names = REGIONS.flatMap((r) => Array.from({ length: 40 }, () => pickFeral(r, rng).name));
ok(names.every((n) => !JA.test(n) && /^[A-Z][A-Za-z-]+ [A-Z][A-Za-z -]+$/.test(n)), `enemy names read as English (${names.slice(0, 3).join(', ')})`);

// a character's name: "Name, the Title" with the given name alone as the short form; each given name is its own (the short forms are what a
// roster card shows, so two characters must not share one)
{
  const shorts = ALL_HEROES.map((r) => defShort(r));
  ok(ALL_HEROES.every((r) => /^[A-Z][A-Za-z]+, the [A-Z][A-Za-z' -]+$/.test(r.name)), 'a name is "Given, the Title" in English');
  ok(ALL_HEROES.every((r, i) => r.name.startsWith(`${shorts[i]}, the `)), 'the short form is the given name the full name starts with');
  ok(new Set(shorts).size === shorts.length, `no two characters share a short name (${shorts.length - new Set(shorts).size} shared)`);
  ok(ALL_HEROES.every((r) => r.name.length <= 40), `no name is longer than 40 letters (longest ${Math.max(...ALL_HEROES.map((r) => r.name.length))})`);
}

setLanguage('ja', { persist: false });
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
