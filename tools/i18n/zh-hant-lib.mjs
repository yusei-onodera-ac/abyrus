// The text side of tools/i18n/zh-hant.mjs (Traditional Chinese made from the Simplified tables), kept free of OpenCC and of the file
// system so a test can run it with a stand-in converter (tools/tests/i18n_zhhant.ts).
//
// The rule that keeps the structure safe: only the runs of non-ASCII characters are ever converted. Everything ASCII - the {placeholders},
// the digits, the "\n", "%", "x2", ICU syntax - passes through byte for byte, so a conversion cannot damage them (`asciiOf` of the input
// and of the output are equal: `checkStructure` verifies it for every text).

/** Quotation marks: Traditional Chinese (Taiwan) writes 「…」 and 『…』 where Simplified writes “…” and ‘…’. */
export const QUOTES = { '“': '「', '”': '」', '‘': '『', '’': '』' };

/** The ASCII characters of `s`, in order: the part of a text a conversion must leave exactly as it was. */
export const asciiOf = (s) => s.replace(/[^\x00-\x7f]/g, '');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `text` in Traditional characters. `convert` is OpenCC's s2twp (any string -> string for a run of Chinese); `words` is the overrides'
 *  table of Simplified word -> Traditional word, which wins over `convert` wherever the word occurs (longest word first). */
export function convertText(text, { convert, words = {} }) {
  const list = Object.keys(words).sort((a, b) => b.length - a.length);
  const wordRe = list.length ? new RegExp(list.map(escapeRegExp).join('|'), 'g') : null;
  const convertRun = (run) => {
    if (!wordRe) return convert(run);
    let out = '';
    let last = 0;
    for (const m of run.matchAll(wordRe)) {
      out += convert(run.slice(last, m.index)) + words[m[0]];
      last = m.index + m[0].length;
    }
    return out + convert(run.slice(last));
  };
  const converted = text.replace(/[^\x00-\x7f]+/g, (run) => convertRun(run));
  return converted.replace(/[“”‘’]/g, (q) => QUOTES[q]);
}

/** The {placeholders} of a text (names only, plural bodies not counted), sorted: what a translation must keep. */
export function placeholdersOf(text) {
  const names = [];
  for (const m of text.matchAll(/\{\s*([A-Za-z_]\w*)\s*(?:,|\})/g)) names.push(m[1]);
  return names.sort().join(',');
}

/** Why `out` is not a safe conversion of `src` (null when it is): the ASCII (placeholders, digits, line breaks) must be identical. */
export function checkStructure(src, out) {
  if (asciiOf(src) !== asciiOf(out)) return `ASCII differs: "${asciiOf(src)}" -> "${asciiOf(out)}"`;
  return null;
}

/** Why an override text (written by hand for one key) cannot replace the converted `src`: it must keep the placeholders, the digits and
 *  the number of line breaks (null when it does). */
export function checkOverride(src, override) {
  if (placeholdersOf(src) !== placeholdersOf(override)) return `placeholders {${placeholdersOf(override)}} differ from {${placeholdersOf(src)}}`;
  const digits = (s) => (s.normalize('NFKC').match(/\d+/g) ?? []).sort().join(',');
  if (digits(src) !== digits(override)) return `numbers differ: ${digits(src)} -> ${digits(override)}`;
  if (src.split('\n').length !== override.split('\n').length) return 'line breaks differ';
  return null;
}

// ---------------------------------------------------------------- writing the TypeScript files

/** A TypeScript string literal in the repo's style: single quotes, double quotes when the text has an apostrophe. */
export function quote(s) {
  const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  if (!body.includes("'")) return `'${body}'`;
  if (!body.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}

const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k));

export const GENERATED = '// 生成: 直接編集しない。直すときは tools/i18n/zh-hant-overrides.json に書く (tools/i18n/zh-hant.mjs が、簡体字の表 (zhHans) から作る)。\n';

/** zhHant/<ns>.ts: the keys of one namespace (`entries` = [key, text] in the order to write). */
export function uiFile(ns, entries) {
  const body = entries.map(([k, v]) => `  ${quote(k)}: ${quote(v)},\n`).join('');
  return `${GENERATED}import type { Part } from '../types';\n\nexport const ${ns}: Partial<Part<'${ns}'>> = {${entries.length ? `\n${body}` : ''}};\n`;
}

/** zhHant.ts: the namespace files bundled. */
export function uiBundle(namespaces) {
  const imports = namespaces.map((ns) => `import { ${ns} } from './zhHant/${ns}';`).join('\n');
  const spreads = namespaces.map((ns) => `  ...${ns},`).join('\n');
  return `${GENERATED}import type { Messages } from './types';\n${imports}\n\nexport const zhHant: Partial<Messages> = {\n${spreads}\n};\n`;
}

/** data/<name>ZhHant.ts: `data` = { table: { id: { field: text } } }. */
export function dataFile(name, data) {
  let body = '';
  for (const [table, rows] of Object.entries(data)) {
    const ids = Object.keys(rows);
    if (!ids.length) {
      body += `  ${key(table)}: {},\n`;
      continue;
    }
    body += `  ${key(table)}: {\n`;
    for (const id of ids) {
      const cells = Object.entries(rows[id]).map(([f, v]) => `${key(f)}: ${quote(v)}`);
      body += `    ${key(id)}: { ${cells.join(', ')} },\n`;
    }
    body += '  },\n';
  }
  return `${GENERATED}import type { DataTexts } from '../dataTexts';\n\nexport const ${name}ZhHant: DataTexts = {\n${body}};\n`;
}

/** data/zhHant.ts: the data files bundled. */
export function dataBundle(names) {
  const imports = names.map((n) => `import { ${n}ZhHant } from './${n}ZhHant';`).join('\n');
  const spreads = names.map((n) => `  ...${n}ZhHant,`).join('\n');
  return `${GENERATED}import type { DataTexts } from '../dataTexts';\n${imports}\n\nexport const zhHantData: DataTexts = {\n${spreads}\n};\n`;
}
