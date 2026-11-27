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
import { SCHEDULED_CAMPAIGNS, SCHEDULED_EVENTS, SCHEDULED_GACHAS, SCHEDULE_NEXT } from '../../src/game/data/schedule';
import { EVENTS } from '../../src/game/data/events';
import { scheduleNotices } from '../../src/game/data/notices';
import { scheduleItems } from '../../src/game/systems/ScheduleView';
import { DONATIONS, DONATION_KINDS, RAID_BOSSES, SHOP_ITEMS, WAR_REWARDS, simAllianceName, simWords, type SimWordKind } from '../../src/game/data/alliance';
import { SocialSystem } from '../../src/game/systems/SocialSystem';
import { ChatSystem } from '../../src/game/systems/ChatSystem';
import { CLASS_LINES, HERO_LINES, homeLinesFor } from '../../src/game/data/homeLines';
import { OPENING_SCRIPTS, getEndingScript, getExtraIntroScript, getFinalIntroScript, getRegionIntroScript, getRegionOutroScript, speakerName, type StoryScript } from '../../src/game/data/storyScript';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const JA = /[　-ヿ㐀-鿿＀-￯]/;

/** Every story script, in the order the game plays them. */
const STORY_SCRIPTS = (): StoryScript[] => [
  ...OPENING_SCRIPTS,
  ...[0, 1, 2, 3, 4].flatMap((i) => [getRegionIntroScript(i), getRegionOutroScript(i), getExtraIntroScript(i)]),
  getFinalIntroScript(),
  getEndingScript(),
];

/** One day after each event and summon of the year starts (the day its notice is on the board). */
const SCHEDULE_NOTICE_TIMES: number[] = [...SCHEDULED_EVENTS, ...SCHEDULED_GACHAS].map((x) => new Date(x.startsAt!).getTime() + 24 * 3600 * 1000);

/** The numbers in a text, as plain digits (a comma or a full-width digit does not change a number), sorted. */
const numbersOf = (s: string): string => (s.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10)).replace(/(\d),(\d)/g, '$1$2').match(/\d+/g) ?? []).sort().join(',');

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
    homeLinesFor(r.id, r.heroClass).forEach((line, i) => out.push(['heroLine', r.id, String(i + 1), line.text]));
  }
  for (const cls of Object.keys(CLASS_LINES) as (keyof typeof CLASS_LINES)[]) homeLinesFor('nobody', cls).forEach((line, i) => out.push(['classLine', cls, String(i + 1), line.text]));
  for (const e of SCHEDULED_EVENTS) {
    add('event', e.id, e, ['title', 'description', 'story', 'emblem']);
    add('eventToken', e.id, e.token, ['name', 'glyph']);
    for (const m of e.missions) add('eventMission', m.id, m, ['title']);
    for (const s of e.shop) add('eventShop', s.id, s, ['name']);
  }
  for (const e of EVENTS.filter((x) => x.kind !== 'limited')) add('event', e.id, e, ['title', 'description', 'actionLabel']);
  for (const g of SCHEDULED_GACHAS) add('gachaBanner', g.id, g, ['title', 'description', 'emblem']);
  for (const c of SCHEDULED_CAMPAIGNS) add('campaign', c.id, c, ['title']);
  out.push(['scheduleNext', 'next', 'title', SCHEDULE_NEXT.title]);
  // the notices the calendar makes (one for each event and summon, on the day after it starts) and the lines of the yearly schedule
  for (const at of SCHEDULE_NOTICE_TIMES) {
    for (const n of scheduleNotices(at)) {
      if (!out.some(([tb, id]) => tb === 'scheduleNotice' && id === n.id)) {
        add('scheduleNotice', n.id, n, ['title', 'body']);
      }
    }
  }
  for (const item of scheduleItems()) add('scheduleItem', `${item.kind}-${item.id}`, item, ['title', 'detail']);
  for (const b of RAID_BOSSES) add('allianceBoss', b.id, b, ['name', 'description']);
  for (const k of DONATION_KINDS) add('allianceDonation', k, DONATIONS[k], ['label']);
  for (const w of WAR_REWARDS) add('allianceWar', `${w.fromRank}-${w.toRank}`, w, ['label']);
  for (const s of SHOP_ITEMS) add('allianceShop', s.id, s, ['name']);
  for (const kind of ['prefix', 'suffix', 'name', 'description', 'chat', 'help'] as SimWordKind[]) simWords(kind).forEach((text, i) => out.push(['allianceSim', `${kind}.${i}`, 'text', text]));
  {
    const social = SocialSystem.createDefaultState(0);
    [...social.friends, ...social.incoming].forEach((p) => out.push(['seedFriend', p.id, 'name', p.name]));
    ChatSystem.createDefaultState(0).messages.forEach((m, i) => {
      out.push(['seedChat', String(i), 'senderName', m.senderName]);
      out.push(['seedChat', String(i), 'text', m.text]);
    });
  }
  for (const script of STORY_SCRIPTS()) {
    script.lines.forEach((line, i) => {
      out.push(['story', `${script.id}.${i + 1}`, 'text', line.text]);
      if (line.speaker) out.push(['storySpeaker', line.speaker, 'name', speakerName(line.speaker)]);
    });
  }
  return out;
}

setLanguage('ja', { persist: false });
const jaRows = collect();
ok(jaRows.length > 400, `${jaRows.length} text fields are checked`);
const notJa = jaRows.filter(([, , , v]) => !(JA.test(v) || /^[\x20-\x7e★♥♛∞π]*$/.test(v))); // (a symbol alone, such as the emblem ♥, is fine)
ok(notJa.length === 0, `in Japanese the rows are the Japanese the data holds${notJa.length ? ` (e.g. ${notJa.slice(0, 4).map(([tb, id, f, v]) => `${tb}.${id}.${f}=${v}`).join(', ')})` : ''}`);
ok(t('quest.feral.name', { prefix: FERAL_PREFIXES[0], animal: 'X' }) === `${FERAL_PREFIXES[0]}X`, 'an enemy name is written together in Japanese');

setLanguage('en', { persist: false });
ok(getLanguage() === 'en', 'English is set');
const enRows = collect();
ok(enRows.length === jaRows.length, 'the same fields in English');
const stillJa = enRows.filter(([, , , v]) => JA.test(v));
ok(stillJa.length === 0, `no text field is still Japanese in English${stillJa.length ? ` (${stillJa.length}, e.g. ${stillJa.slice(0, 5).map(([tb, id, f]) => `${tb}.${id}.${f}`).join(', ')})` : ''}`);
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

// the lines a character says: the same count as the Japanese, each in one piece (no stray line break), the voice stays the Japanese one
{
  const ja = (id: string, cls: 'warrior'): { text: string; voice: string }[] => (setLanguage('ja', { persist: false }), homeLinesFor(id, cls));
  const sameCount = ALL_HEROES.every((r) => {
    const jaLines = ja(r.id, 'warrior');
    setLanguage('en', { persist: false });
    const enLines = homeLinesFor(r.id, r.heroClass);
    return jaLines.length === enLines.length && enLines.every((l, i) => l.voice === jaLines[i].voice);
  });
  setLanguage('en', { persist: false });
  ok(sameCount, 'each character has as many lines in English as in Japanese, with the same voice ids');
  const all = ALL_HEROES.flatMap((r) => homeLinesFor(r.id, r.heroClass).map((l) => l.text));
  ok(all.every((l) => l.length >= 8 && l.length <= 75 && !l.includes('\n')), `every line is 8 to 75 letters, one piece (longest ${Math.max(...all.map((l) => l.length))})`);
  ok(Object.keys(HERO_LINES).every((id) => ALL_HEROES.some((r) => r.id === id)), 'no English lines for a character that does not exist');
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

setLanguage('ja', { persist: false });
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
