// Writes docs/EVENT_SCHEDULE.md from the game's calendar data (src/game/data/schedule.ts). Run: npm run schedule:doc
// (--check: only report whether the file is up to date - exit code 1 when it is not).
import { rolldown } from 'rolldown';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, '.out');
fs.mkdirSync(out, { recursive: true });

const bundle = await rolldown({
  input: path.join(here, 'doc.ts'),
  platform: 'node',
  resolve: { alias: { phaser: path.join(root, 'tools/tests/phaser_stub.mjs') } },
  logLevel: 'silent',
  transform: { define: { 'import.meta.env': '({ MODE: "test", DEV: false, PROD: false, BASE_URL: "/" })' } },
});
const file = path.join(out, 'doc.mjs');
await bundle.write({ file, format: 'esm' });
await bundle.close();
const text = execFileSync(process.execPath, [file], { encoding: 'utf8' });

const target = path.join(root, 'docs', 'EVENT_SCHEDULE.md');
const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
if (process.argv.includes('--check')) {
  if (current.replace(/\r\n/g, '\n') === text.replace(/\r\n/g, '\n')) console.log('docs/EVENT_SCHEDULE.md is up to date');
  else {
    console.log('docs/EVENT_SCHEDULE.md is out of date: run npm run schedule:doc');
    process.exit(1);
  }
} else {
  fs.writeFileSync(target, text.replace(/\r\n/g, '\n'), 'utf8');
  console.log(`wrote docs/EVENT_SCHEDULE.md (${text.split('\n').length} lines)`);
}
