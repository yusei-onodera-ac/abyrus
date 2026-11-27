// i18n, data tables: with the language set to English, none of the text fields that are read through tr() / localized() may still be
// Japanese (a row without an English entry falls back to its Japanese, which this test then reports), and in Japanese they must still be
// the text the data holds. Add a table here when its English is added (docs/I18N.md, "データ表の文字").
import { getLanguage, setLanguage, t, tr, trList } from '../../src/game/i18n';
import { enData } from '../../src/game/i18n/data/en';
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
import { HERO_SKILLS, formatSkillEffectSummary, skillKindLabel, type SkillEffectKind } from '../../src/game/data/skills';
import { PEOPLE } from '../../src/game/ui/VillagePeople';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const JA = /[　-ヿ㐀-鿿＀-￯]/;

const SKILL_KINDS: SkillEffectKind[] = ['nuke_single', 'nuke_aoe', 'drain_single', 'buff_atk', 'buff_def', 'debuff_atk', 'debuff_def', 'stun', 'invincible', 'heal_single', 'heal_aoe', 'revive'];
const SKILL_OF_KIND = new Map(Object.values(HERO_SKILLS).flat().map((def) => [def.kind, def] as const));

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
  // the heroes' skills: name and description of each, the tag of each kind, and the numbers readout under a skill (level 1 and 10)
  for (const [heroId, kit] of Object.entries(HERO_SKILLS)) kit.forEach((def, slot) => add('skill', `${heroId}_${slot}`, def, ['name', 'description']));
  for (const kind of SKILL_KINDS) {
    out.push(['skillKind', kind, 'label', skillKindLabel(kind)]);
    const def = SKILL_OF_KIND.get(kind);
    if (def) for (const level of [1, 10]) out.push(['skillSummary', `${kind}.${level}`, 'text', formatSkillEffectSummary(def, level)]);
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

// numbers must survive translation: the digits of a Japanese text (full-width too, thousands commas ignored) are the digits of its English (the order may
// change: 30回目までに★4以上 = "★4 or better by the 30th pull")
// (a lone "1" is left out: 1回 / 1段階 / 1時間 become "once" / "one step" / "per hour")
const digitsOf = (s: string): string => (s.normalize('NFKC').replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => n !== '1').sort().join(' ');
const digitsDiffer = jaRows.filter((row, i) => digitsOf(row[3]) !== digitsOf(enRows[i][3]));
for (const row of digitsDiffer) console.log(`      ${row[0]}.${row[1]}.${row[2]}: ${row[3].replace(/\n/g, ' / ')}  =>  ${enRows[jaRows.indexOf(row)][3].replace(/\n/g, ' / ')}`);
ok(digitsDiffer.length === 0, `the numbers of every text field are the same in English${digitsDiffer.length ? ` (${digitsDiffer.length}, e.g. ${digitsDiffer.slice(0, 5).map(([tb, id, f]) => `${tb}.${id}.${f}`).join(', ')})` : ''}`);

// skills: a number written as a kanji in Japanese (二刀 = two swords, 百矢 = a hundred arrows, 千里 = a thousand miles) comes out as a number in English;
// no English entry names a skill that does not exist; the name stays short (a 148 px tag at 19 px bold, and the big banner when it is cast)
const KANJI_NUMBER: Record<string, RegExp> = { 二: /\b(2|two|twin|dual|double|pair)\b/i, 三: /\b(3|three|trident|triple)\b/i, 五: /\b(5|five)\b/i, 六: /\b(6|six)\b/i, 百: /\b(100|hundred)\b/i, 千: /\b(1,?000|thousand)\b/i };
const skillRows = (rows: typeof jaRows): Map<string, string> => {
  const byId = new Map<string, string>();
  for (const [table, id, field, value] of rows) if (table === 'skill') byId.set(`${id}.${field}`, value);
  return byId;
};
const jaSkills = skillRows(jaRows);
const enSkills = skillRows(enRows);
const lostNumbers: string[] = [];
for (const id of new Set([...jaSkills.keys()].map((k) => k.split('.')[0]))) {
  const ja = `${jaSkills.get(`${id}.name`)}${jaSkills.get(`${id}.description`)}`.replace(/千鳥/g, ''); // (千鳥足 = a zigzag walk, not a number)
  const en = `${enSkills.get(`${id}.name`)} ${enSkills.get(`${id}.description`)}`;
  for (const [kanji, word] of Object.entries(KANJI_NUMBER)) if (ja.includes(kanji) && !word.test(en)) lostNumbers.push(`${id} (${kanji})`);
}
ok(lostNumbers.length === 0, `a skill's number in kanji is a number in English${lostNumbers.length ? ` (${lostNumbers.join(', ')})` : ''}`);
const skillIds = new Set(Object.entries(HERO_SKILLS).flatMap(([heroId, kit]) => kit.map((_, slot) => `${heroId}_${slot}`)));
const strayIds = Object.keys(enData.skill ?? {}).filter((id) => !skillIds.has(id));
ok(strayIds.length === 0 && Object.keys(enData.skill ?? {}).length === skillIds.size, `the English skills are exactly the ${skillIds.size} skills of the kits${strayIds.length ? ` (not skills: ${strayIds.slice(0, 5).join(', ')})` : ''}`);
const longSkill = [...enSkills].filter(([k, v]) => v.length > (k.endsWith('.name') ? 20 : 110)).map(([k]) => k);
ok(longSkill.length === 0, `skill names are 20 characters or fewer and descriptions 110 or fewer in English${longSkill.length ? ` (${longSkill.slice(0, 5).join(', ')})` : ''}`);

// a skill held across a language change follows it (the text is read when it is shown), and its id does not change
const held = HERO_SKILLS.aion[0];
const heldId = held.id;
ok(held.name === 'Infinite Judgment' && held.id === heldId, 'a skill read in English says so');
setLanguage('ja', { persist: false });
ok(held.name === '無限の裁き' && held.description.endsWith('。') && held.id === heldId && heldId === 'nuke_aoe-無限の裁き', 'the same skill, held across a language change, is Japanese again (and keeps its id)');
setLanguage('en', { persist: false });
ok(held.name === 'Infinite Judgment', 'and English again');

// an enemy's name: an adjective and an animal, joined by a space in English, with no Japanese left
let seed = 1;
const rng = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const names = REGIONS.flatMap((r) => Array.from({ length: 40 }, () => pickFeral(r, rng).name));
ok(names.every((n) => !JA.test(n) && /^[A-Z][A-Za-z-]+ [A-Z][A-Za-z -]+$/.test(n)), `enemy names read as English (${names.slice(0, 3).join(', ')})`);

setLanguage('ja', { persist: false });
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
