// What a translation of the game's text must satisfy, per language - shared by `npm run i18n:check` (tools/i18n/check.mjs) and the
// tests (tools/tests/i18n.ts, i18n_data.ts). Pure functions: no file access, no game code.
//
// Every language, whatever it is:
//   - the same {placeholders} as the Japanese source (a message), and the same numbers (digits; a lone "1" and the order are free:
//     "1回" becomes "once", "★4以上 by the 30th pull")
//   - a big number is never shortened (no 万 億 亿 萬 만 억 兆 조, no 10K / 3M / 2B): the game always shows every digit
//   - none of the source's script is left over, where the script can tell a left-over from a translation:
//       en       no Japanese at all (kana, kanji, full-width forms)
//       ko       no kana and no kanji (Korean is written in Hangul)
//       zh-*     no kana. Chinese uses kanji, so a left-over cannot be told by the characters; but a text that is exactly the
//                Japanese source and has kana in it was not translated
// A gap (nothing written yet) is not a problem here: it falls back to English, which satisfies all of the above. `--strict-lang=<code>` in
// check.mjs is what turns a gap into a failure.

export const KANA = /[぀-ゟ゠-ヿｦ-ﾟ]/;
export const KANJI = /[㐀-䶿一-鿿豈-﫿]/;
/** kana, kanji, full-width forms and CJK punctuation: what an English text must not contain (the old test's definition) */
export const ANY_JAPANESE = /[　-ヿ㐀-鿿＀-￯]/;

/** Why `text` still looks untranslated for `lang` (null when it does not). `source` is the Japanese text it translates, if known. */
export function leftover(lang, text, source) {
  if (lang === 'en') return ANY_JAPANESE.test(text) ? 'Japanese is left in it' : null;
  if (lang === 'ko') return KANA.test(text) || KANJI.test(text) ? 'kana or kanji is left in it' : null;
  if (lang === 'zh-Hans' || lang === 'zh-Hant') {
    if (KANA.test(text)) return 'kana is left in it';
    if (source !== undefined && text === source && KANA.test(source)) return 'it is the Japanese source, unchanged';
  }
  return null;
}

/** A shortened big number in `text` ("10万", "3億", "10K", "2.5M"), or null. */
export function abbreviatedNumber(text) {
  const m = /\d[\d,.]*\s?(?:万|億|亿|萬|兆|만|억|조)|\d[\d,.]*\s?[KMB]\b/.exec(text);
  return m ? m[0] : null;
}

/** The numbers of a text as plain digits, thousands commas dropped, full width read as ASCII, a lone "1" left out, sorted. */
export function digitsOf(text) {
  return (text.normalize('NFKC').replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => n !== '1').sort().join(' ');
}

/** The {placeholder} names of a message, sorted ("{n, plural, one {# a} other {# b}}" counts n, not the words inside). */
export function placeholdersOf(message) {
  const body = message.replace(/\{\s*[A-Za-z_]\w*\s*,\s*plural\s*,((?:[^{}]|\{[^{}]*\})*)\}/g, (m) => m.replace(/(\w|=\d+)\s*\{[^{}]*\}/g, ''));
  return [...new Set([...body.matchAll(/\{\s*([A-Za-z_]\w*)\s*(?:,|\})/g)].map((m) => m[1]))].sort().join(',');
}

/** Messages whose number is written as a word or another way in a language, on purpose: the numbers are not compared for them.
 *  (en: "2倍" = twice, "0時" = midnight / 00:00, and the month names of a calendar heading are an ICU select over 1..12.) */
export const DIGITS_EXEMPT = {
  en: new Set(['shop.premium.benefit.speedDetail', 'mission.schedule.month', 'mission.group.dailyReset', 'mission.group.weeklyReset', 'village.quest.note']),
};

/** Problems of one language's messages (`table`: key -> text) against the Japanese ones (`ja`): [[key, why]]. Only the keys written. */
export function messageProblems(lang, table, ja) {
  const out = [];
  for (const [key, text] of Object.entries(table)) {
    const source = ja[key];
    if (source === undefined) continue; // (a key ja does not have is reported by the caller)
    if (placeholdersOf(source) !== placeholdersOf(text)) out.push([key, `placeholders {${placeholdersOf(text)}} differ from ja's {${placeholdersOf(source)}}`]);
    if (!DIGITS_EXEMPT[lang]?.has(key) && digitsOf(source) !== digitsOf(text)) out.push([key, `numbers differ from ja (${digitsOf(source) || '-'} -> ${digitsOf(text) || '-'})`]);
    const left = leftover(lang, text, source);
    if (left) out.push([key, left]);
    const big = abbreviatedNumber(text);
    if (big) out.push([key, `"${big}" shortens a number (always write every digit)`]);
  }
  return out;
}

/** Every cell of a data text ({ table: { id: { field: text } } }) as `table.id.field` -> text. */
export function dataCells(data) {
  const cells = new Map();
  for (const [table, rows] of Object.entries(data ?? {})) for (const [id, fields] of Object.entries(rows)) for (const [field, text] of Object.entries(fields)) cells.set(`${table}.${id}.${field}`, text);
  return cells;
}

/** Problems of one language's data text that need no source: a left-over script, a shortened big number, an empty text: [[cell, why]]. */
export function dataProblems(lang, data) {
  const out = [];
  for (const [cell, text] of dataCells(data)) {
    if (text.trim() === '') out.push([cell, 'empty']);
    const left = leftover(lang, text);
    if (left) out.push([cell, left]);
    const big = abbreviatedNumber(text);
    if (big) out.push([cell, `"${big}" shortens a number (always write every digit)`]);
  }
  return out;
}
