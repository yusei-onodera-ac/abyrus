// i18n: the message lookup (fallback, {placeholders}, plurals), the device-language choice, the language kept in a save, and
// that every key the code asks for exists in the Japanese table.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { formatMessage, formatNumber, getLanguage, onLanguageChange, setLanguage, t, tDynamic, translate } from '../../src/game/i18n/core';
import { detectLanguage, fallbackChain, isLanguage, LANGUAGES } from '../../src/game/i18n/languages';
import { fontFamily } from '../../src/game/i18n/fonts';
import { abbreviatedNumber, dataCells, dataProblems, digitsOf, leftover, messageProblems, placeholdersOf } from '../i18n/lang-rules.mjs';
import { TABLES } from '../../src/game/i18n/tables';
import { DATA_TEXTS, tr } from '../../src/game/i18n/dataTexts';
import { enData } from '../../src/game/i18n/data/en';
import { SettingsSystem } from '../../src/game/systems/SettingsSystem';
import { SaveSystem } from '../../src/game/systems/SaveSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// the tables are plain objects: this test adds a few keys of its own (and takes them out again)
const ja = TABLES.ja as Record<string, string>;
const en = TABLES.en as Record<string, string>;
const mem = (table: Record<string, string>, key: string, value: string): void => void (table[key] = value);
mem(ja, 'test.both', 'JA both');
mem(en, 'test.both', 'EN both');
mem(ja, 'test.onlyJa', 'JA only');
mem(ja, 'test.hello', 'こんにちは、{name}さん');
mem(en, 'test.hello', 'Hello, {name}!');
mem(ja, 'test.items', '{count}個');
mem(en, 'test.items', '{count, plural, one {# item} other {# items}}');
mem(ja, 'test.mixed', '{who}が{count}個');
mem(en, 'test.mixed', '{who} has {count, plural, =0 {nothing} one {# item} other {# items}} ({count} total)');

// ---- language state
setLanguage('ja', { persist: false });
ok(getLanguage() === 'ja', 'the language can be set');
let heard: string[] = [];
const stop = onLanguageChange((l) => heard.push(l));
setLanguage('en', { persist: false });
setLanguage('en', { persist: false });
ok(heard.length === 1 && heard[0] === 'en', 'a listener hears a change once (not a repeat of the same language)');
stop();
setLanguage('ja', { persist: false });
ok(heard.length === 1, 'a stopped listener hears nothing more');
// @ts-expect-error an unknown language is ignored, not stored
setLanguage('xx', { persist: false });
ok(getLanguage() === 'ja', 'an unknown language is ignored');
heard = [];

// ---- lookup and fallback
ok(translate('ja', 'test.both') === 'JA both' && translate('en', 'test.both') === 'EN both', 'each language gets its own text');
ok(translate('en', 'test.onlyJa') === 'JA only', 'a key missing in English falls back to Japanese');
ok(fallbackChain('en')[0] === 'en' && fallbackChain('en').at(-1) === 'ja', 'the fallback chain ends in Japanese');
ok(fallbackChain('ja').join() === 'ja', 'Japanese falls back to nothing else');
const warn = console.warn;
let warned = 0;
console.warn = () => void warned++;
ok(translate('en', 'test.nowhere') === 'test.nowhere', 'a key nobody has is returned as it is (visible, not blank)');
translate('en', 'test.nowhere');
console.warn = warn;
ok(warned === 1, 'and is reported once');
setLanguage('en', { persist: false });
ok(tDynamic('test.both') === 'EN both', 'tDynamic looks up in the current language');
setLanguage('ja', { persist: false });
ok(tDynamic('test.both') === 'JA both', 'and follows a language change');

// ---- interpolation
ok(translate('ja', 'test.hello', { name: 'ルリ' }) === 'こんにちは、ルリさん', 'a {placeholder} is filled');
ok(translate('en', 'test.hello', { name: 'Luri' }) === 'Hello, Luri!', 'in each language');
ok(formatMessage('{a}-{a}-{b}', { a: 1, b: 'x' }, 'en-US') === '1-1-x', 'a placeholder may repeat; numbers are written as they are');
ok(formatMessage('{a} {missing}', { a: 'x' }, 'en-US') === 'x {missing}', 'a placeholder with no value stays visible');
ok(formatMessage('no braces', undefined, 'en-US') === 'no braces', 'text without placeholders is untouched');
ok(formatMessage('100%の{x}', { x: 5 }, 'ja-JP') === '100%の5', 'other symbols pass through');
ok(formatMessage('{a}', { a: 12345678901234 }, 'en-US') === '12345678901234', 'a big number keeps every digit (no abbreviation)');

// ---- plurals
ok(translate('en', 'test.items', { count: 1 }) === '1 item', 'English: one -> singular');
ok(translate('en', 'test.items', { count: 2 }) === '2 items', 'English: other -> plural');
ok(translate('en', 'test.items', { count: 0 }) === '0 items', 'English: zero -> plural');
ok(translate('ja', 'test.items', { count: 3 }) === '3個', 'Japanese has no plural');
ok(translate('en', 'test.mixed', { who: 'Ann', count: 0 }) === 'Ann has nothing (0 total)', '=0 matches exactly, and the placeholder after a plural still works');
ok(translate('en', 'test.mixed', { who: 'Ann', count: 1 }) === 'Ann has 1 item (1 total)', 'the plural inside a sentence');
ok(translate('ja', 'test.mixed', { who: 'アン', count: 4 }) === 'アンが4個', 'the same key in Japanese');
ok(formatNumber(1234567, 'en') === '1,234,567' && formatNumber(1234567, 'ja') === '1,234,567', 'numbers are grouped, with every digit');
ok(formatNumber(123456789012345678901234567890n, 'en') === '123,456,789,012,345,678,901,234,567,890', 'even a bigint is written in full');

// ---- device language (first run)
ok(detectLanguage('ja') === 'ja' && detectLanguage('ja-JP') === 'ja' && detectLanguage('JA-jp') === 'ja', 'ja* -> Japanese');
ok(detectLanguage('en-US') === 'en' && detectLanguage('en') === 'en' && detectLanguage('en_GB') === 'en', 'en* -> English');
ok(detectLanguage('fr-FR') === 'en' && detectLanguage('de') === 'en' && detectLanguage('es-419') === 'en' && detectLanguage('th') === 'en', 'another language we do not have -> English');
ok(detectLanguage('ko') === 'ko' && detectLanguage('ko-KR') === 'ko' && detectLanguage('ko_KR') === 'ko' && detectLanguage('KO-kr') === 'ko', 'ko* -> Korean');
// iOS tags: language-script-region. The script decides first (zh-Hant-CN is Traditional, zh-Hans-TW is Simplified), then the region.
{
  const hans = ['zh-Hans', 'zh-Hans-CN', 'zh-Hans-JP', 'zh-Hans-US', 'zh-CN', 'zh-SG', 'zh', 'zh_CN', 'ZH-hans-hk', 'zh-Hans-TW', 'zh-Hans-MO'];
  const hant = ['zh-Hant', 'zh-Hant-TW', 'zh-Hant-HK', 'zh-Hant-MO', 'zh-Hant-JP', 'zh-Hant-CN', 'zh-TW', 'zh-HK', 'zh-MO', 'zh_TW', 'ZH-hant'];
  ok(hans.every((tag) => detectLanguage(tag) === 'zh-Hans'), `Simplified Chinese: ${hans.filter((tag) => detectLanguage(tag) !== 'zh-Hans').join(' ') || 'all of ' + hans.join(' ')}`);
  ok(hant.every((tag) => detectLanguage(tag) === 'zh-Hant'), `Traditional Chinese: ${hant.filter((tag) => detectLanguage(tag) !== 'zh-Hant').join(' ') || 'all of ' + hant.join(' ')}`);
  ok(detectLanguage(['zh-Hant-TW', 'ja']) === 'zh-Hant' && detectLanguage(['ko-KR', 'en']) === 'ko', 'a list of preferences: the first one counts (Chinese and Korean too)');
  ok(detectLanguage('zho') === 'en' && detectLanguage('zhx-CN') === 'en', '"zho" / "zhx" are not "zh"');
}
ok(detectLanguage(undefined) === 'ja' && detectLanguage('') === 'ja' && detectLanguage(null) === 'ja' && detectLanguage([]) === 'ja', 'no language at all -> Japanese');
ok(detectLanguage('???') === 'ja' && detectLanguage('x') === 'ja', 'garbage -> Japanese');
ok(detectLanguage(['en-GB', 'ja']) === 'en' && detectLanguage(['ja-JP', 'en']) === 'ja', 'a list of preferences: the first one counts');
ok(detectLanguage('jav') === 'en', '"jav" (Javanese) is not "ja"');

// ---- fonts: one function picks the stack from the language; Han characters must meet the right country's font first
{
  ok(fontFamily('sans', 'ja') === 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', 'Japanese keeps the stack the game always had (body)');
  ok(fontFamily('serif', 'ja') === 'Georgia, "Hiragino Mincho ProN", "Noto Serif JP", serif' && fontFamily('black', 'ja') === 'Arial Black, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', 'and for headings and the heavy face');
  ok(fontFamily('sans', 'en') === fontFamily('sans', 'ja'), 'English uses the same stack as Japanese');
  const at = (lang: 'ko' | 'zh-Hans' | 'zh-Hant', name: string): number => fontFamily('sans', lang).indexOf(name);
  ok(at('ko', 'Apple SD Gothic Neo') > 0 && at('ko', 'Malgun Gothic') > at('ko', 'Apple SD Gothic Neo') && at('ko', 'Noto Sans KR') > at('ko', 'Malgun Gothic'), 'Korean: Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, in that order');
  ok(at('zh-Hans', 'PingFang SC') > 0 && at('zh-Hans', 'Microsoft YaHei') > at('zh-Hans', 'PingFang SC') && at('zh-Hans', 'Noto Sans SC') > at('zh-Hans', 'Microsoft YaHei'), 'Simplified: PingFang SC, Microsoft YaHei, Noto Sans SC');
  ok(at('zh-Hant', 'PingFang TC') > 0 && at('zh-Hant', 'Microsoft JhengHei') > at('zh-Hant', 'PingFang TC') && at('zh-Hant', 'Noto Sans TC') > at('zh-Hant', 'Microsoft JhengHei'), 'Traditional: PingFang TC, Microsoft JhengHei, Noto Sans TC');
  ok(LANGUAGES.filter((l) => l.code !== 'ja' && l.code !== 'en').every((l) => (['sans', 'serif', 'black'] as const).every((kind) => !/Hiragino|Noto (Sans|Serif) JP/.test(fontFamily(kind, l.code)))), 'no Japanese font in the Korean or Chinese stacks (a Han character would take its Japanese shape)');
  ok(LANGUAGES.every((l) => fontFamily('sans', l.code).startsWith('Arial, ') && fontFamily('black', l.code).startsWith('Arial Black, ') && fontFamily('serif', l.code).startsWith('Georgia, ')), 'every stack starts with the Latin face (digits and Latin letters look the same in every language)');
  setLanguage('zh-Hant', { persist: false });
  ok(fontFamily() === fontFamily('sans', 'zh-Hant') && fontFamily('black') === fontFamily('black', 'zh-Hant'), 'with no language given it follows the language being shown');
  setLanguage('ja', { persist: false });
  ok(fontFamily() === fontFamily('sans', 'ja'), 'and a language change');
}

// ---- the page's lang attribute follows the language (it decides which country's shapes a Han character gets)
{
  const doc = { documentElement: { lang: '' } };
  (globalThis as { document?: unknown }).document = doc;
  const seen: string[] = [];
  for (const code of ['ko', 'zh-Hans', 'zh-Hant', 'en', 'ja'] as const) {
    setLanguage(code, { persist: false });
    seen.push(doc.documentElement.lang);
  }
  ok(seen.join() === 'ko,zh-Hans,zh-Hant,en,ja', `document.documentElement.lang follows the language: ${seen.join(' ')}`);
  delete (globalThis as { document?: unknown }).document;
}

// ---- the language in a save
{
  ok(isLanguage('ja') && isLanguage('en') && !isLanguage('fr') && !isLanguage(undefined), 'isLanguage');
  ok(LANGUAGES.every((l) => isLanguage(l.code) && l.name.length > 0 && l.locale.length >= 2), 'every language has a name and a locale');
  const old = SettingsSystem.restore({ email: '', twitter: '' } as never);
  ok(old.language === 'ja', 'a save from before languages existed (settings without one) is Japanese');
  ok(SettingsSystem.restore(undefined).language === 'ja', 'a save with no settings at all is Japanese');
  ok(SettingsSystem.restore({ language: 'fr' } as never).language === 'ja', 'an unknown language in a save becomes Japanese');
  ok(SettingsSystem.restore({ language: 'en' } as never).language === 'en', 'a saved English stays English');
  const fresh = SaveSystem.createDefault();
  ok(isLanguage(fresh.settings.language), 'a new save starts with a language of the device');
  const roundTrip = SettingsSystem.restore(JSON.parse(JSON.stringify({ ...fresh.settings, language: 'en' })));
  ok(roundTrip.language === 'en', 'the language survives being saved and loaded');
}

// ---- data lookup seam
{
  setLanguage('en', { persist: false });
  ok(tr('hero', 'nobody', 'name', 'ルリ') === 'ルリ', 'tr: a text with no translation is the Japanese of the data');
  const heroTable = enData.hero; // (the real table: put back below, other checks read it)
  enData.hero = { ...heroTable, nobody: { name: 'Luri' } };
  ok(tr('hero', 'nobody', 'name', 'ルリ') === 'Luri', 'tr: a translated text comes from the data table');
  ok(tr('hero', 'nobody', 'title', '先生') === '先生', 'tr: a field with no translation falls back too');
  setLanguage('ja', { persist: false });
  ok(tr('hero', 'nobody', 'name', 'ルリ') === 'ルリ', 'tr: Japanese is the data as it is');
  enData.hero = heroTable;
}

// ---- every key the code asks for exists
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
{
  const src = path.join(process.cwd(), 'src');
  const known = new Set(Object.keys(TABLES.ja));
  for (const k of ['test.both', 'test.onlyJa', 'test.hello', 'test.items', 'test.mixed']) known.delete(k);
  const used = new Set<string>();
  const missing: string[] = [];
  let calls = 0;
  for (const file of files(src)) {
    if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*(['"`])([A-Za-z][\w.]*)\1/g)) {
      calls++;
      used.add(m[2]);
      if (!known.has(m[2])) missing.push(`${path.relative(process.cwd(), file)}: ${m[2]}`);
    }
    // keys kept in maps / arrays (typed MessageKey) are plain string literals
    for (const m of text.matchAll(/'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)'/g)) if (known.has(m[1])) used.add(m[1]);
  }
  ok(missing.length === 0, `every t('key') in src/ exists in ja.ts (${calls} calls, ${known.size} keys)${missing.length ? `: ${missing.slice(0, 5).join('; ')}` : ''}`);
  const unused = [...known].filter((k) => !used.has(k));
  console.log(`INFO  ${unused.length} key(s) are not referenced as a literal (they may be built from a map or be waiting for a screen)`);
  const enKeys = Object.keys(TABLES.en).filter((k) => !k.startsWith('test.'));
  ok(enKeys.length === known.size && enKeys.every((k) => known.has(k)), 'English has exactly the Japanese keys');
}

for (const k of ['test.both', 'test.onlyJa', 'test.hello', 'test.items', 'test.mixed']) {
  delete ja[k];
  delete en[k];
}

// ---- the rules every language's text follows (tools/i18n/lang-rules.mjs: what `npm run i18n:check` also runs)
{
  ok(leftover('en', 'Gems are not enough.') === null && leftover('en', 'Gems が足りません') !== null && leftover('en', '（Gems）') !== null, 'en: Japanese in a text is found (kana, kanji, full-width forms)');
  ok(leftover('ko', '마정석이 부족합니다') === null && leftover('ko', '마정석が足りない') !== null && leftover('ko', '魔晶石이 부족') !== null && leftover('ko', '카타카나ー') !== null, 'ko: kana and kanji in a text are found');
  ok(leftover('zh-Hans', '魔晶石不足，请先获得') === null && leftover('zh-Hans', '魔晶石が足りない') !== null && leftover('zh-Hans', 'ステージ', 'ステージ') !== null, 'zh: kana is found, and a kana source that is passed through unchanged');
  ok(leftover('zh-Hant', '魔晶石', '魔晶石') === null && leftover('zh-Hant', '魔晶石不足', '魔晶石が足りない') === null, 'zh: a text made of kanji only is a fine translation even when it equals the source (kanji cannot tell)');
  const big = ['10万', '3億', '1000万', '10亿', '5萬', '5만', '3억', '10K', '2.5M', '1,000B', '3 兆', '7조'];
  const fine = ['10,000', '1,234,567', 'Lv.5', '2h 05m', '30分', '3 minutes', '100 골드', '金币100', 'x3', '+25%', '2.4s', '2026/11/20', 'Max HP', 'NEW', 'VIP'];
  ok(big.every((s) => abbreviatedNumber(s)), `a shortened big number is found: ${big.filter((s) => !abbreviatedNumber(s)).join(' ') || big.join(' ')}`);
  ok(fine.every((s) => abbreviatedNumber(s) === null), `and a full one is not: ${fine.filter((s) => abbreviatedNumber(s)).join(' ') || 'all fine'}`);
  ok(digitsOf('★4以上を30回目までに') === digitsOf('By the 30th pull, ★4 or better') && digitsOf('1回') === digitsOf('once') && digitsOf('1,500個') === digitsOf('1500 pcs') && digitsOf('１２３') === '123', 'numbers are compared as digits (order, commas, full-width and a lone 1 are free)');
  ok(digitsOf('100') !== digitsOf('10') && digitsOf('3回') !== digitsOf('4 times'), 'and a different number is a difference');
  ok(placeholdersOf('{name}が{count}個') === 'count,name' && placeholdersOf('{n, plural, one {# item} other {# items}}') === 'n' && placeholdersOf('{count}개의 {name}') === 'count,name', 'placeholders are compared by name');

  // every language's tables, as written
  const jaTable = TABLES.ja as Record<string, string>;
  const enData = DATA_TEXTS.en!;
  const enCells = dataCells(enData);
  for (const lang of LANGUAGES) {
    if (lang.code === 'ja') continue;
    const table = TABLES[lang.code] as Record<string, string>;
    const extra = Object.keys(table).filter((k) => !(k in jaTable));
    ok(extra.length === 0, `${lang.code}: no UI key that Japanese does not have${extra.length ? ` (${extra.slice(0, 5).join(', ')})` : ''}`);
    const problems = messageProblems(lang.code, table, jaTable);
    ok(problems.length === 0, `${lang.code}: ${Object.keys(table).length} UI messages keep their placeholders and numbers, leave no source script, shorten no number${problems.length ? ` (${problems.length}, e.g. ${problems.slice(0, 3).map(([k, why]) => `${k}: ${why}`).join('; ')})` : ''}`);
    const cells = dataCells(DATA_TEXTS[lang.code]);
    const dataExtra = lang.code === 'en' ? [] : [...cells.keys()].filter((c) => !enCells.has(c));
    ok(dataExtra.length === 0, `${lang.code}: no data row that English does not have (a misspelled id)${dataExtra.length ? ` (${dataExtra.slice(0, 5).join(', ')})` : ''}`);
    const dataBad = dataProblems(lang.code, DATA_TEXTS[lang.code]);
    ok(dataBad.length === 0, `${lang.code}: ${cells.size} data rows leave no source script and shorten no number${dataBad.length ? ` (${dataBad.length}, e.g. ${dataBad.slice(0, 3).map(([k, why]) => `${k}: ${why}`).join('; ')})` : ''}`);
    if (lang.partial) console.log(`INFO  ${lang.code}: ${Object.keys(table).length}/${Object.keys(jaTable).length} UI keys and ${cells.size}/${enCells.size} data rows written`);
  }
}
void t;
void enData;
process.exit(failures ? 1 : 0);
