// Every text of the game, in every language, in one CSV for the proofreaders (a native speaker reads a language's column in Excel).
//
//   node tools/i18n/export.mjs                 -> tools/i18n/out/translations.csv   (UTF-8 with a BOM, so Excel opens it as UTF-8; not committed)
//   node tools/i18n/export.mjs --out=<file>    somewhere else
//
// Columns:  表 | キー | ja | en | ko | zh-Hans | zh-Hant | 長さの目安
//   - 表 is `ui` for the screens' messages (キー = the message key, e.g. home.idle.title), or the data table's name (skill, hero, story ...;
//     キー = `<id>.<field>`: the field is what follows the LAST dot, the id may contain dots, e.g. story `opening_story.1.text`).
//   - A gap (not translated yet) is an empty cell. ja is the source text; en is complete.
//   - 長さの目安 is the room the text has on screen where docs/I18N.md says so (English letters; Korean and Chinese characters are about
//     twice as wide, so half as many).
// Reading the proofreaders' corrections back into the tables is not built yet (docs/I18N.md, "校正の取り込み"): the CSV is read-only for now.
import { rolldown } from 'rolldown';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dataCells } from './lang-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = path.join(root, 'tools', 'i18n', '.out');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outFile = outArg ? path.resolve(outArg.slice('--out='.length)) : path.join(root, 'tools', 'i18n', 'out', 'translations.csv');

// A day far enough ahead that every character and event of the year is in the game (what is in the game depends on the date).
const RealDate = Date;
const offset = RealDate.parse('2030-01-01T12:00:00+09:00') - RealDate.now();
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length === 0 ? [RealDate.now() + offset] : args));
  }
  static now() {
    return RealDate.now() + offset;
  }
};
Object.defineProperty(globalThis, 'navigator', { value: { language: 'ja', languages: ['ja'] }, configurable: true });

async function load(entry, name) {
  mkdirSync(tmp, { recursive: true });
  const bundle = await rolldown({
    input: path.join(root, entry),
    platform: 'node',
    resolve: { alias: { phaser: path.join(root, 'tools/tests/phaser_stub.mjs') } },
    external: [/^firebase(\/|$)/],
    logLevel: 'silent',
    transform: { define: { 'import.meta.env': '({ MODE: "test", DEV: false, PROD: false, BASE_URL: "/" })' } },
  });
  const file = path.join(tmp, `${name}.mjs`);
  await bundle.write({ file, format: 'esm' });
  await bundle.close();
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`);
}

const { TABLES, LANGUAGES } = await load('src/game/i18n/tables.ts', 'tables');
const { DATA_TEXTS } = await load('src/game/i18n/dataTexts.ts', 'dataTexts');
const i18n = await load('src/game/i18n/index.ts', 'index');
const rows = await load('tools/i18n/rows.ts', 'rows');
rmSync(tmp, { recursive: true, force: true });

const CODES = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];
for (const code of CODES) if (!LANGUAGES.some((l) => l.code === code)) throw new Error(`the export has a column for ${code}, which languages.ts does not have`);

// ---- how much room a text has (docs/I18N.md, "書き方"): [table or 'ui', field or key prefix, English letters]
const GUIDE = [
  ['skill', 'name', 16, 'a 148 px tag at 19 px bold (a longer one is squeezed to fit) and the big banner when it is cast'],
  ['skill', 'description', 80, 'one line of the skill list is 584 px; a longer one wraps to two lines'],
  ['heroLine', '*', 66, "the home screen's speech bubble is 208 px wide and grows upward"],
  ['classLine', '*', 66, "the home screen's speech bubble is 208 px wide and grows upward"],
  ['hero', 'name', 40, 'name and title ("Gauss, the Abacus King"); where it is too wide the screen shrinks it'],
  ['hero', 'short', 12, 'the given name alone: roster cards, grid cells, toasts, battle party bar'],
  ['mission', 'title', 30, 'one line of the mission list'],
  ['region', 'tab', 9, 'the tab of a region'],
  ['weekdayDungeon', 'theme', 30, 'one line of the dungeon list'],
];
function guideOf(table, field) {
  const g = GUIDE.find(([t, f]) => t === table && (f === field || f === '*'));
  return g ? `en ${g[2]} / ko・zh ${Math.ceil(g[2] / 2)}: ${g[3]}` : '';
}

// ---- the Japanese of the data rows: the game's own data, read in Japanese
i18n.setLanguage('ja', { persist: false });
const jaOf = rows.japaneseSources();

const enCells = dataCells(DATA_TEXTS.en);
const cells = Object.fromEntries(CODES.filter((c) => c !== 'ja').map((c) => [c, dataCells(DATA_TEXTS[c])]));
const allCells = new Set([...enCells.keys(), ...Object.values(cells).flatMap((m) => [...m.keys()])]);

const records = [];
for (const key of Object.keys(TABLES.ja)) {
  records.push(['ui', key, ...CODES.map((c) => TABLES[c][key] ?? ''), '']);
}
let noSource = 0;
for (const cell of allCells) {
  // cell = table.id.field  (the field is after the last dot, the table before the first)
  const first = cell.indexOf('.');
  const last = cell.lastIndexOf('.');
  const table = cell.slice(0, first);
  const id = cell.slice(first + 1, last);
  const field = cell.slice(last + 1);
  const ja = jaOf.get(cell) ?? '';
  if (!ja) noSource++;
  records.push([table, `${id}.${field}`, ja, ...CODES.filter((c) => c !== 'ja').map((c) => cells[c].get(cell) ?? ''), guideOf(table, field)]);
}

const csv = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const header = ['表', 'キー', ...CODES, '長さの目安'];
const text = `﻿${[header, ...records].map((r) => r.map(csv).join(',')).join('\r\n')}\r\n`;
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, text);

const ui = records.filter((r) => r[0] === 'ui').length;
const gaps = (i) => records.filter((r) => r[i] === '').length;
console.log(`wrote ${path.relative(root, outFile).replace(/\\/g, '/')}: ${records.length} rows (${ui} UI messages, ${records.length - ui} data rows), ${(text.length / 1024).toFixed(0)} KB`);
console.log(`  gaps: ko ${gaps(4)}, zh-Hans ${gaps(5)}, zh-Hant ${gaps(6)}${noSource ? `   (${noSource} data rows have no Japanese source in the export)` : ''}`);
