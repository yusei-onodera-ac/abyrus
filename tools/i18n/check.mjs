// i18n checker (npm run i18n:check). See docs/I18N.md.
//
//   1. The translation tables agree: every language has exactly the Japanese table's keys (a language marked `partial` in
//      languages.ts may lack some: its gaps are COUNTED per language - UI keys and data-table rows - and not failed), the same
//      {placeholders} and numbers, no script left over from the source and no shortened big number (tools/i18n/lang-rules.mjs),
//      keys start with their file's namespace, and no key is defined twice; no t()/tr() call runs at load time (module level, class
//      field); the generated Traditional Chinese is up to date with the Simplified.  A failure here exits 1.
//        --strict-lang=ko,zh-Hans   a gap in those languages fails too (use it when that language's translation is meant to be finished)
//   2. The Japanese still hard-coded in src/ outside the tables (listed per file, so later phases can burn the list down).
//      Only a report: exit 0.   --list shows every line,  --strict makes a remaining one fail,  --survey prints the
//      table used in docs/I18N.md.
import { rolldown } from 'rolldown';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { posix, scanFile, scanStaleCalls, walk } from './scan.mjs';
import { dataCells, dataProblems, messageProblems } from './lang-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));
const strictLangs = new Set(process.argv.flatMap((a) => (a.startsWith('--strict-lang=') ? a.slice('--strict-lang='.length).split(',') : [])).filter(Boolean));
const tmp = path.join(root, 'tools', 'i18n', '.out');

// ---------------------------------------------------------------- 1. the tables
async function bundleOf(entry, name) {
  mkdirSync(tmp, { recursive: true });
  const bundle = await rolldown({ input: path.join(root, entry), platform: 'node', logLevel: 'silent' });
  const file = path.join(tmp, `${name}.mjs`);
  await bundle.write({ file, format: 'esm' });
  await bundle.close();
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`);
}

async function loadTables() {
  const mod = await bundleOf('src/game/i18n/tables.ts', 'tables');
  const data = await bundleOf('src/game/i18n/dataTexts.ts', 'dataTexts');
  rmSync(tmp, { recursive: true, force: true });
  return { ...mod, DATA_TEXTS: data.DATA_TEXTS };
}

/** The folder of a language's namespace files: zh-Hans -> zhHans (the code of a language is not an identifier). */
const dirOf = (code) => code.replace(/-([A-Za-z])/g, (_, c) => c.toUpperCase());

function partFiles(lang) {
  const dir = path.join(root, 'src/game/i18n', dirOf(lang));
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => ({ ns: f.replace(/\.ts$/, ''), file: path.join(dir, f) }));
  } catch {
    return [];
  }
}

/** keys written in a part file ("'ns.key': ..." at the start of a line) */
function keysOfPart(file) {
  return [...readFileSync(file, 'utf8').matchAll(/^\s*'([^'\n]+)'\s*:/gm)].map((m) => m[1]);
}

const problems = [];
const notes = [];
const { TABLES, LANGUAGES, DATA_TEXTS } = await loadTables();
const ja = TABLES.ja;
const jaKeys = Object.keys(ja);
// The data tables have no Japanese copy to count against (the Japanese is the game's data itself): the English table is the reference
// of which rows exist, and another language is complete when it has every row English has.
const enCells = dataCells(DATA_TEXTS.en);
notes.push(`ja: ${jaKeys.length} UI keys`);
for (const code of strictLangs) if (!LANGUAGES.some((l) => l.code === code)) problems.push(`--strict-lang=${code}: no such language`);

for (const lang of LANGUAGES) {
  if (lang.code === 'ja') continue;
  const table = TABLES[lang.code] ?? {};
  const keys = new Set(Object.keys(table));
  const missing = jaKeys.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !(k in ja));
  const cells = dataCells(DATA_TEXTS[lang.code]);
  const dataMissing = lang.code === 'en' ? [] : [...enCells.keys()].filter((c) => !cells.has(c));
  const dataExtra = lang.code === 'en' ? [] : [...cells.keys()].filter((c) => !enCells.has(c));
  const pct = (n, total) => (total ? `${Math.floor((n / total) * 100)}%` : '-');
  const ui = jaKeys.length - missing.length;
  notes.push(
    `${lang.code.padEnd(8)} UI ${String(ui).padStart(4)}/${jaKeys.length} keys (${missing.length} gaps, ${pct(ui, jaKeys.length)})` +
      `   data ${String(cells.size).padStart(4)}/${enCells.size} rows (${dataMissing.length} gaps, ${pct(cells.size, enCells.size)})${lang.partial ? '   [partial: a gap shows in the fallback language]' : ''}`,
  );
  if (missing.length && !lang.partial) problems.push(`${lang.code}: ${missing.length} key(s) missing, e.g. ${missing.slice(0, 5).join(', ')}`);
  if (strictLangs.has(lang.code)) {
    if (missing.length) problems.push(`${lang.code} (--strict-lang): ${missing.length} UI key(s) not translated, e.g. ${missing.slice(0, 5).join(', ')}`);
    if (dataMissing.length) problems.push(`${lang.code} (--strict-lang): ${dataMissing.length} data row(s) not translated, e.g. ${dataMissing.slice(0, 5).join(', ')}`);
  }
  if (extra.length) problems.push(`${lang.code}: ${extra.length} key(s) that ja does not have, e.g. ${extra.slice(0, 5).join(', ')}`);
  if (dataExtra.length) problems.push(`${lang.code}: ${dataExtra.length} data row(s) that English does not have (a misspelled id?), e.g. ${dataExtra.slice(0, 5).join(', ')}`);
  for (const [k, why] of messageProblems(lang.code, table, ja)) problems.push(`${lang.code}: ${k}: ${why}`);
  for (const [cell, why] of dataProblems(lang.code, DATA_TEXTS[lang.code])) problems.push(`${lang.code}: data ${cell}: ${why}`);
}

// Traditional Chinese is generated from Simplified (tools/i18n/zh-hant.mjs): it must be what the generator would write now
{
  const run = spawnSync(process.execPath, [path.join(root, 'tools/i18n/zh-hant.mjs'), '--check'], { encoding: 'utf8', cwd: root });
  const said = (run.stdout ?? '').split('\n').filter((l) => l.trim() && !l.includes('note:'));
  const last = (said[said.length - 1] ?? '').trim();
  if (run.status !== 0) problems.push(`zh-Hant is out of date or broken: ${last || (run.stderr ?? '').trim() || 'run `node tools/i18n/zh-hant.mjs`'}`);
  else notes.push(last || 'zh-hant: ok');
}

// namespaces and duplicates, from the part files' text
const seen = new Map();
for (const lang of LANGUAGES) {
  for (const { ns, file } of partFiles(lang.code)) {
    for (const key of keysOfPart(file)) {
      if (!key.startsWith(`${ns}.`)) problems.push(`${dirOf(lang.code)}/${ns}.ts: key "${key}" must start with "${ns}."`);
      const id = `${lang.code}:${key}`;
      if (seen.has(id)) problems.push(`${lang.code}: key "${key}" is defined twice (${seen.get(id)} and ${ns}.ts)`);
      else seen.set(id, `${ns}.ts`);
    }
  }
}

// t() / tr() that runs when a module loads or a class is built would keep the language of that moment for good
for (const file of walk(path.join(root, 'src'))) {
  const rel = posix(path.relative(root, file));
  if (rel.startsWith('src/game/i18n/')) continue;
  for (const hit of scanStaleCalls(file)) problems.push(`${rel}:${hit.line}: ${hit.text} runs at load time (module level / class field): it must run where the text is drawn`);
}

// ---------------------------------------------------------------- 2. hard-coded Japanese
const DATA_GROUPS = {
  heroes: ['heroes', 'heroRelease'],
  skills: ['skills'],
  'hero lines (heroLines, homeLines)': ['heroLines', 'homeLines'],
  story: ['storyScript'],
  'tutorial (guide text: phase 1)': ['tutorial'],
  'stages, enemies, dungeons, expeditions': ['regions', 'weekdayDungeons', 'expeditions', 'stageRewards'],
  'missions / login bonus / gifts / mails / notices': ['missions', 'loginBonus', 'gifts', 'mails', 'notices', 'campaigns', 'rewards'],
  'items / equipment / collection': ['items', 'equipment', 'collection', 'supply'],
  'shop / premium / gacha banners / banners': ['shop', 'premium', 'gachaBanners', 'gachaMovies', 'banners'],
  'events / yearly schedule': ['events', 'limitedEvents', 'schedule'],
  'alliance data / social seed': ['alliance', 'socialSeed'],
  'village data': ['village', 'villageGoals', 'villageQuests', 'villageWalk'],
  'legal text (terms, privacy)': ['legal'],
};
const dataGroupOf = (base) => Object.entries(DATA_GROUPS).find(([, names]) => names.includes(base))?.[0] ?? 'other data (idle, emoji ...)';

const VILLAGE_FILE = /(^|\/)Village[A-Za-z]*\.ts$/;
function areaOf(rel) {
  if (rel.startsWith('src/game/data/')) return { kind: 'data', area: dataGroupOf(path.basename(rel, '.ts')) };
  // the villagers' chatter lives next to their walking code, but it is data (read through tr('villager', ...))
  if (rel === 'src/game/ui/VillagePeople.ts') return { kind: 'data', area: 'village data' };
  if (VILLAGE_FILE.test(rel)) return { kind: 'chrome', area: 'village (VillageScene etc.)' };
  if (rel.startsWith('src/game/scenes/')) return { kind: 'chrome', area: 'scenes (screens)' };
  if (rel.startsWith('src/game/ui/')) return { kind: 'chrome', area: 'ui (shared widgets)' };
  if (rel.startsWith('src/game/alliance/')) return { kind: 'chrome', area: 'alliance backends (seed names, messages)' };
  if (rel.startsWith('src/game/systems/')) return { kind: 'chrome', area: 'systems (user-visible messages)' };
  return { kind: 'chrome', area: 'other (types, catalog, dev notice)' };
}

const perFile = [];
for (const file of walk(path.join(root, 'src'))) {
  const rel = posix(path.relative(root, file));
  if (rel.startsWith('src/game/i18n/')) continue;
  const hits = scanFile(file).filter((h) => !h.ignored);
  if (hits.length) perFile.push({ rel, hits, ...areaOf(rel) });
}

function report() {
  const sum = (items) => items.reduce((n, f) => n + f.hits.length, 0);
  const byArea = new Map();
  for (const f of perFile) {
    const key = `${f.kind}\t${f.area}`;
    const e = byArea.get(key) ?? { files: 0, literals: 0 };
    e.files++;
    e.literals += f.hits.length;
    byArea.set(key, e);
  }
  console.log('Hard-coded Japanese string literals still in src/ (outside the translation tables):');
  for (const kind of ['chrome', 'data']) {
    const rows = [...byArea].filter(([k]) => k.startsWith(`${kind}\t`)).sort((a, b) => b[1].literals - a[1].literals);
    console.log(`\n  ${kind === 'chrome' ? '(a) UI chrome: labels, buttons, dialogs, toasts, system messages (phase 1)' : '(b) game data text: names, descriptions, skills, lines, story ... (Japanese source rows, read through tr(); which tables already have English: docs/I18N.md section 8)'}`);
    for (const [k, v] of rows) console.log(`    ${String(v.literals).padStart(5)}  ${k.split('\t')[1]}  (${v.files} files)`);
    console.log(`    ${String(sum(perFile.filter((f) => f.kind === kind))).padStart(5)}  total`);
  }
  if (args.has('--survey')) return;
  console.log('\nPer file (largest first):');
  for (const f of [...perFile].sort((a, b) => b.hits.length - a.hits.length)) {
    console.log(`  ${String(f.hits.length).padStart(4)}  ${f.rel}`);
    if (args.has('--list')) for (const h of f.hits) console.log(`        ${h.line}: ${h.text.length > 70 ? `${h.text.slice(0, 70)}...` : h.text}`);
  }
}

console.log(notes.join('\n'));
if (problems.length) {
  console.log(`\nFAIL: ${problems.length} problem(s) in the translation tables`);
  for (const p of problems.slice(0, 60)) console.log(`  - ${p}`);
  if (problems.length > 60) console.log(`  ... and ${problems.length - 60} more`);
} else {
  console.log('\nok: the translation tables agree');
}
console.log('');
report();
const chromeLeft = perFile.filter((f) => f.kind === 'chrome').reduce((n, f) => n + f.hits.length, 0);
if (args.has('--strict') && chromeLeft > 0) {
  console.log(`\nFAIL (--strict): ${chromeLeft} hard-coded UI string(s) left`);
  process.exit(1);
}
process.exit(problems.length ? 1 : 0);
