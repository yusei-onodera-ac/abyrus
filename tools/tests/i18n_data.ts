// i18n, data tables: with the language set to English, none of the text fields that are read through tr() / localized() may still be
// Japanese (a row without an English entry falls back to its Japanese, which this test then reports), and in Japanese they must still be
// the text the data holds. Add a table here when its English is added (docs/I18N.md, "データ表の文字").
// Korean and the two Chinese are checked the same way (the rules of each language: tools/i18n/lang-rules.mjs). They are being
// translated: a row not written yet shows the English, which passes, and is only counted (INFO).
import { getLanguage, setLanguage, t } from '../../src/game/i18n';
import { collect, STORY_SCRIPTS } from '../i18n/rows';
import { abbreviatedNumber, digitsOf, leftover } from '../i18n/lang-rules.mjs';
import { enData } from '../../src/game/i18n/data/en';
import { FERAL_PREFIXES, REGIONS, pickFeral } from '../../src/game/data/regions';
import { HERO_SKILLS } from '../../src/game/data/skills';
import { ALL_HEROES, defShort } from '../../src/game/data/heroes';
import { SCHEDULED_CAMPAIGNS, SCHEDULED_EVENTS, SCHEDULED_GACHAS } from '../../src/game/data/schedule';
import { EVENTS } from '../../src/game/data/events';
import { simAllianceName, simWords } from '../../src/game/data/alliance';
import { CLASS_LINES, HERO_LINES, homeLinesFor } from '../../src/game/data/homeLines';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const JA = /[　-ヿ㐀-鿿＀-￯]/;
/** The numbers in a text, as plain digits (a comma or a full-width digit does not change a number), sorted. */
const numbersOf = (s: string): string => (s.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10)).replace(/(\d),(\d)/g, '$1$2').match(/\d+/g) ?? []).sort().join(',');


setLanguage('ja', { persist: false });
const jaRows = collect();
ok(jaRows.length > 400, `${jaRows.length} text fields are checked`);
const notJa = jaRows.filter(([, , , v]) => !(JA.test(v) || /^[\x20-\x7e★♥♛∞π]*$/.test(v))); // (a symbol alone, such as the emblem ♥, is fine)
ok(notJa.length === 0, `in Japanese the rows are the Japanese the data holds${notJa.length ? ` (e.g. ${notJa.slice(0, 4).map(([tb, id, f, v]) => `${tb}.${id}.${f}=${v}`).join(', ')})` : ''}`);
ok(t('quest.feral.name', { prefix: FERAL_PREFIXES[0], animal: 'X' }) === `${FERAL_PREFIXES[0]}X`, 'an enemy name is written together in Japanese');

type Rows = typeof jaRows;
type Lang = 'en' | 'ko' | 'zh-Hans' | 'zh-Hant';
const cellsOf = (rows: Rows): string => rows.slice(0, 5).map(([tb, id, f]) => `${tb}.${id}.${f}`).join(', ');

/** What every language's rows must satisfy (tools/i18n/lang-rules.mjs): the same fields as the Japanese, none empty, none with the
 *  source's script left in it, the numbers of the Japanese text (full-width too, thousands commas ignored; a lone "1" is free: 1回 /
 *  1段階 / 1時間 become "once" / "one step" / "per hour"; the order may change: 30回目までに★4以上 = "★4 or better by the 30th pull"),
 *  and no shortened big number. */
function generic(lang: Lang, rows: Rows): void {
  ok(rows.length === jaRows.length, `${lang}: the same fields as in Japanese`);
  const left = rows.filter((row, i) => leftover(lang, row[3], jaRows[i][3]));
  ok(left.length === 0, `${lang}: no text field has the source's script left in it${left.length ? ` (${left.length}, e.g. ${cellsOf(left)})` : ''}`);
  const empty = rows.filter(([, , , v]) => v.trim() === '');
  ok(empty.length === 0, `${lang}: none is empty`);
  const digitsDiffer = jaRows.filter((row, i) => digitsOf(row[3]) !== digitsOf(rows[i][3]));
  for (const row of digitsDiffer) console.log(`      ${row[0]}.${row[1]}.${row[2]}: ${row[3].replace(/\n/g, ' / ')}  =>  ${rows[jaRows.indexOf(row)][3].replace(/\n/g, ' / ')}`);
  ok(digitsDiffer.length === 0, `${lang}: the numbers of every text field are those of the Japanese${digitsDiffer.length ? ` (${digitsDiffer.length}, e.g. ${cellsOf(digitsDiffer)})` : ''}`);
  const big = rows.filter(([, , , v]) => abbreviatedNumber(v));
  ok(big.length === 0, `${lang}: no big number is shortened (万 億 亿 萬 만 억 K M B)${big.length ? ` (${big.length}, e.g. ${cellsOf(big)})` : ''}`);
}

setLanguage('en', { persist: false });
ok(getLanguage() === 'en', 'English is set');
const enRows = collect();
generic('en', enRows);
// a number in the text is the same number in English (the amount, the days, the count): compared row by row, in the tables whose text
// carries them (the story and the lines have none)
{
  const NUMBERED = new Set(['event', 'eventToken', 'eventMission', 'eventShop', 'gachaBanner', 'campaign', 'allianceBoss', 'allianceShop', 'allianceDonation', 'allianceWar', 'allianceSim', 'seedChat']);
  const differ = enRows.filter((row, i) => NUMBERED.has(row[0]) && numbersOf(row[3]) !== numbersOf(jaRows[i][3]));
  ok(differ.length === 0, `the numbers in a text are the same in English${differ.length ? ` (${differ.length}, e.g. ${differ.slice(0, 4).map(([tb, id, f]) => `${tb}.${id}.${f}`).join(', ')})` : ''}`);
}
{
  const storyLines = (): number[] => STORY_SCRIPTS().map((s) => s.lines.length);
  setLanguage('ja', { persist: false });
  const jaCounts = storyLines();
  setLanguage('en', { persist: false });
  ok(jaCounts.length === 5 * 3 + 3 + 2 && jaCounts.every((n, i) => n === storyLines()[i]), `${jaCounts.length} story scripts, each with its lines`);
  const narration = STORY_SCRIPTS().flatMap((s) => s.lines).filter((l) => !l.speaker);
  ok(narration.length > 40, 'the narration lines have no nameplate');
}

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
const longSkill = [...enSkills].filter(([k, v]) => v.length > (k.endsWith('.name') ? 20 : 80)).map(([k]) => k);
ok(longSkill.length === 0, `skill names are 20 characters or fewer and descriptions 80 or fewer in English${longSkill.length ? ` (${longSkill.slice(0, 5).join(', ')})` : ''}`);

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

// a character's name: "Name, the Title" with the given name alone as the short form; each given name is its own (the short forms are what a
// roster card shows, so two characters must not share one)
{
  const shorts = ALL_HEROES.map((r) => defShort(r));
  ok(ALL_HEROES.every((r) => /^[A-Z][A-Za-z]+, the [A-Z][A-Za-z' -]+$/.test(r.name)), 'a name is "Given, the Title" in English');
  ok(ALL_HEROES.every((r, i) => r.name.startsWith(`${shorts[i]}, the `)), 'the short form is the given name the full name starts with');
  ok(new Set(shorts).size === shorts.length, `no two characters share a short name (${shorts.length - new Set(shorts).size} shared)`);
  ok(ALL_HEROES.every((r) => r.name.length <= 40), `no name is longer than 40 letters (longest ${Math.max(...ALL_HEROES.map((r) => r.name.length))})`);
}

// the lines a character says: the same count as the Japanese, each in one piece (no stray line break), the voice stays the Japanese one
{
  // (the Japanese lines are the data's own: HERO_LINES / CLASS_LINES; the voice ids come from them and do not change with the language)
  const sameCount = ALL_HEROES.every((r) => {
    const jaLines = HERO_LINES[r.id] ?? CLASS_LINES[r.heroClass];
    const enLines = homeLinesFor(r.id, r.heroClass);
    return jaLines.length === enLines.length && enLines.every((l, i) => l.voice === `home_${HERO_LINES[r.id] ? r.id : r.heroClass}_${i + 1}`);
  });
  ok(sameCount, 'each character has as many lines in English as in Japanese, with the voice ids of the Japanese');
  const all = ALL_HEROES.flatMap((r) => homeLinesFor(r.id, r.heroClass).map((l) => l.text));
  const tooLong = all.filter((l) => l.length > 66);
  ok(all.every((l) => l.length >= 8 && l.length <= 66 && !l.includes('\n')), `every line is 8 to 66 letters, one piece (the bubble is 208 px wide and grows up)${tooLong.length ? `: ${tooLong.join(' / ')}` : ''}`);
  // nothing in the English tables that no row asks for (a typo in an id would silently leave the Japanese on screen, and a left-over would hide)
  const known = (table: string, ids: string[]): boolean => Object.keys(enData[table] ?? {}).every((id) => ids.includes(id));
  ok(known('hero', ALL_HEROES.map((r) => r.id)) && known('heroLine', Object.keys(HERO_LINES)) && known('classLine', Object.keys(CLASS_LINES)), 'no English name or line for a character or class that does not exist');
  ok(known('story', STORY_SCRIPTS().flatMap((sc) => sc.lines.map((_, i) => `${sc.id}.${i + 1}`))), 'no English story line for a script line that does not exist');
  ok(known('event', [...SCHEDULED_EVENTS.map((e) => e.id), ...EVENTS.map((e) => e.id)]) && known('scheduledGacha', SCHEDULED_GACHAS.map((g) => g.id)) && known('campaign', SCHEDULED_CAMPAIGNS.map((c) => c.id)), 'no English event, summon or campaign for an id that does not exist');
}

// the made-up alliances' words: the names are told apart (a roster picks them by name), and an alliance's name reads as two words in English
{
  const names = simWords('name');
  ok(new Set(names).size === names.length && names.every((n) => /^[A-Z][a-z]+$/.test(n)), 'the made-up members have different names, one capitalized word each');
  const all = simWords('prefix').flatMap((p) => simWords('suffix').map((s) => simAllianceName(p, s)));
  ok(new Set(all).size === all.length && all.every((n) => /^[A-Z][A-Za-z -]+ [A-Z][a-z]+$/.test(n)), `${all.length} made-up alliance names, none repeated ("${all[0]}")`);
  ok(simAllianceName(simWords('prefix')[0], 7) === `${simWords('prefix')[0]} 7`, 'a numbered alliance reads "Name 7"');
  ok(simWords('chat').every((l) => l.length <= 60) && simWords('description').every((l) => l.length <= 80), 'the made-up chat lines and descriptions are of a sensible length');
}

// Korean and Chinese: the rules every language shares. (The English-only ones above - how names are written, the length of a skill's name -
// are of the English and stay there; each language's own conventions are in docs/I18N.md.) A row that is not written yet shows the English
// and passes: how many are still to do is the INFO line, and `npm run i18n:check --strict-lang=ko` is what fails on them.
for (const lang of ['ko', 'zh-Hans', 'zh-Hant'] as const) {
  setLanguage(lang, { persist: false });
  const rows = collect();
  generic(lang, rows);
  // a roster card shows the short name: two characters must not share one (a name that is not written yet shows the English, which is unique)
  const shorts = rows.filter(([tb, , f]) => tb === 'hero' && f === 'short').map((r) => r[3]);
  ok(shorts.length === ALL_HEROES.length && new Set(shorts).size === shorts.length, `${lang}: no two characters share a short name (${shorts.length - new Set(shorts).size} shared)`);
  const pending = rows.filter((row, i) => row[3] === enRows[i][3] && /[A-Za-z]{2}/.test(row[3]));
  console.log(`INFO  ${lang}: ${pending.length} of ${rows.length} text fields still show the English (not translated yet)`);
}

setLanguage('ja', { persist: false });
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
