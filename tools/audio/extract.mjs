// Reads the voice lines out of the game's own data (tutorial steps and the home lines of each class) into
// tools/audio/raw/lines.json. Bundles the TypeScript with rolldown (which Vite brings along).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RAW = path.join(HERE, 'raw');
fs.mkdirSync(RAW, { recursive: true });

const entry = path.join(RAW, 'lines-entry.ts');
fs.writeFileSync(
  entry,
  `import { TUTORIAL_STEPS } from '${ROOT.replace(/\\/g, '/')}/src/game/data/tutorial';
import { CLASS_LINES, HERO_LINES } from '${ROOT.replace(/\\/g, '/')}/src/game/data/homeLines';
const lines: { id: string; voice: string; text: string }[] = [];
for (const s of TUTORIAL_STEPS) lines.push({ id: s.id, voice: 'guide', text: s.lines.join('') });
for (const [cls, list] of Object.entries(CLASS_LINES)) list.forEach((text, i) => lines.push({ id: \`home_\${cls}_\${i + 1}\`, voice: cls, text }));
for (const [hero, list] of Object.entries(HERO_LINES)) list.forEach((text, i) => lines.push({ id: \`home_\${hero}_\${i + 1}\`, voice: 'hero', text }));
console.log(JSON.stringify(lines));
`,
);
const { rolldown } = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);
const out = path.join(RAW, 'lines-bundle.mjs');
const bundle = await rolldown({ input: entry, platform: 'node', logLevel: 'warn', transform: { define: { 'import.meta.env': '({ MODE: "tool", DEV: false, PROD: false, BASE_URL: "/" })' } } });
await bundle.write({ file: out, format: 'esm' });
await bundle.close();
const { execFileSync } = await import('node:child_process');
const json = execFileSync(process.execPath, [out], { encoding: 'utf8' }).trim().split('\n').pop();
fs.writeFileSync(path.join(RAW, 'lines.json'), json);
console.log(`${JSON.parse(json).length} voice lines -> tools/audio/raw/lines.json`);
