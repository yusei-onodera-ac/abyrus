// Traditional Chinese (zh-Hant) is not translated by hand: it is made from the Simplified (zh-Hans) tables with OpenCC's s2twp
// (Simplified -> Traditional, Taiwan's standard characters and word choices: 软件 -> 軟體, 信息 -> 資訊).
//
//   node tools/i18n/zh-hant.mjs           reads src/game/i18n/zhHans/* and data/*ZhHans.ts, writes zhHant/* and data/*ZhHant.ts
//   node tools/i18n/zh-hant.mjs --check   changes nothing; exit 1 when a written file is not what the generator would write now
//                                          (the Simplified tables changed and nobody ran it) - `npm run i18n:check` runs this too
//
// Structure is never touched (see zh-hant-lib.mjs): only runs of non-ASCII characters are converted, so {placeholders}, digits and line
// breaks come through exactly; each text is verified. Corrections for Taiwan's wording go in tools/i18n/zh-hant-overrides.json
// ({ words, ui, data }) - never in the generated files, which the next run overwrites.
//
// Needs the devDependency opencc-js (npm install). Without it `--check` is skipped (exit 0, says so) and a run stops with a message.
import { rolldown } from 'rolldown';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkOverride, checkStructure, convertText, dataBundle, dataFile, uiBundle, uiFile } from './zh-hant-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const i18n = path.join(root, 'src/game/i18n');
const tmp = path.join(root, 'tools', 'i18n', '.out', 'zh-hant');
const check = process.argv.includes('--check');

function loadOpenCC() {
  try {
    return createRequire(import.meta.url)('opencc-js');
  } catch {
    return null;
  }
}
const OpenCC = loadOpenCC();
if (!OpenCC) {
  if (check) {
    console.log('zh-hant: opencc-js is not installed (npm install): the freshness check is skipped');
    process.exit(0);
  }
  console.error('zh-hant: opencc-js is not installed. Run `npm install` first (it is a devDependency).');
  process.exit(1);
}
const convert = OpenCC.Converter({ from: 'cn', to: 'twp' });
const overrides = JSON.parse(readFileSync(path.join(root, 'tools/i18n/zh-hant-overrides.json'), 'utf8'));
const words = overrides.words ?? {};
const usedWords = new Set();
const usedKeys = { ui: new Set(), data: new Set() };

/** Bundles one TypeScript module with rolldown and returns its exports. */
async function load(entry, name) {
  mkdirSync(tmp, { recursive: true });
  const bundle = await rolldown({ input: entry, platform: 'node', logLevel: 'silent' });
  const file = path.join(tmp, `${name}.mjs`);
  await bundle.write({ file, format: 'esm' });
  await bundle.close();
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`);
}

const problems = [];
const wordsIn = (text) => Object.keys(words).filter((w) => text.includes(w));

function convertOne(src, overrideText, where) {
  if (overrideText !== undefined) {
    const why = checkOverride(src, overrideText);
    if (why) problems.push(`${where}: the override ${why}`);
    return overrideText;
  }
  for (const w of wordsIn(src)) usedWords.add(w);
  const out = convertText(src, { convert, words });
  const why = checkStructure(src, out);
  if (why) problems.push(`${where}: ${why}`);
  return out;
}

// ---- UI messages
const ja = (await load(path.join(i18n, 'ja.ts'), 'ja')).ja;
const zhHans = (await load(path.join(i18n, 'zhHans.ts'), 'zhHans')).zhHans;
const namespaces = readdirSync(path.join(i18n, 'ja')).map((f) => f.replace(/\.ts$/, ''));
const files = new Map(); // path -> text
const jaOrder = Object.keys(ja);
const keys = [...jaOrder.filter((k) => k in zhHans), ...Object.keys(zhHans).filter((k) => !(k in ja))];
for (const ns of namespaces) {
  const entries = keys
    .filter((k) => k.startsWith(`${ns}.`))
    .map((k) => {
      if (overrides.ui?.[k] !== undefined) usedKeys.ui.add(k);
      return [k, convertOne(zhHans[k], overrides.ui?.[k], `ui ${k}`)];
    });
  files.set(path.join(i18n, 'zhHant', `${ns}.ts`), uiFile(ns, entries));
}
files.set(path.join(i18n, 'zhHant.ts'), uiBundle(namespaces));

// ---- data tables
const dataDir = path.join(i18n, 'data');
const names = readdirSync(dataDir).filter((f) => f.endsWith('ZhHans.ts')).map((f) => f.replace(/ZhHans\.ts$/, ''));
for (const name of names) {
  const mod = await load(path.join(dataDir, `${name}ZhHans.ts`), `data_${name}`);
  const source = mod[`${name}ZhHans`];
  const out = {};
  for (const [table, rows] of Object.entries(source)) {
    out[table] = {};
    for (const [id, cells] of Object.entries(rows)) {
      out[table][id] = {};
      for (const [field, text] of Object.entries(cells)) {
        const k = `${table}.${id}.${field}`;
        if (overrides.data?.[k] !== undefined) usedKeys.data.add(k);
        out[table][id][field] = convertOne(text, overrides.data?.[k], `data ${k}`);
      }
    }
  }
  files.set(path.join(dataDir, `${name}ZhHant.ts`), dataFile(name, out));
}
files.set(path.join(dataDir, 'zhHant.ts'), dataBundle(names));
rmSync(path.join(root, 'tools', 'i18n', '.out'), { recursive: true, force: true });

// ---- overrides that nothing used (a word that is not in any text, a key that no longer exists) are reported, not failed
const notes = [];
for (const w of Object.keys(words)) if (!usedWords.has(w)) notes.push(`override word "${w}" is not in any text (yet)`);
for (const section of ['ui', 'data']) for (const k of Object.keys(overrides[section] ?? {})) if (!usedKeys[section].has(k)) notes.push(`override ${section} "${k}" matches no ${section === 'ui' ? 'key' : 'row'} (yet)`);

if (problems.length) {
  console.error(`zh-hant: ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
  process.exit(1);
}

let changed = 0;
for (const [file, text] of files) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === text) continue;
  changed++;
  if (check) {
    if (changed <= 5) console.log(`zh-hant: ${path.relative(root, file).replace(/\\/g, '/')} is out of date`);
    continue;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}
if (check) {
  if (changed) {
    console.log(`zh-hant: ${changed} file(s) differ from what the generator writes: run \`node tools/i18n/zh-hant.mjs\``);
    process.exit(1);
  }
  console.log(`zh-hant: ${files.size} generated files are up to date`);
} else {
  console.log(`zh-hant: wrote ${changed} of ${files.size} files (${keys.length} UI keys, ${names.length} data files from zh-Hans)`);
}
for (const n of notes.slice(0, 10)) console.log(`  note: ${n}`);
