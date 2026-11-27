// Logic tests without a browser: each tools/tests/<name>.ts is bundled with rolldown (Phaser replaced by a stub, so the
// game's rules - save, village, alliance, gacha ... - run in plain node) and executed. A test prints PASS/FAIL lines and
// exits non-zero when something fails.
//
//   node tools/tests/run.mjs            every test
//   node tools/tests/run.mjs village    only the ones whose name contains "village"
//
// The calib_* / *_calib files are simulations that print numbers (battle win rates ...), not checks: run them by name.
import { rolldown } from 'rolldown';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '.out');
const stub = path.join(here, 'phaser_stub.mjs');
// the game's clock starts on a fixed day in every test (see fixed_clock.mjs)
const clock = pathToFileURL(path.join(here, 'fixed_clock.mjs')).href;
// the device language is Japanese in every test (fixed_locale.mjs)
const locale = pathToFileURL(path.join(here, 'fixed_locale.mjs')).href;
const only = process.argv[2];

mkdirSync(out, { recursive: true });
const names = readdirSync(here)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.replace(/\.ts$/, ''))
  .filter((n) => (only ? n.includes(only) : !/calib/.test(n)));

let failed = 0;
for (const name of names) {
  const bundle = await rolldown({
    input: path.join(here, `${name}.ts`),
    platform: 'node',
    resolve: { alias: { phaser: stub } },
    // (the Firebase SDK and Capacitor are loaded on demand by the game and never reached in a test: leave them out of the bundle)
    external: [/^firebase(\/|$)/, /^@capacitor\//],
    logLevel: 'silent',
    transform: { define: { 'import.meta.env': '({ MODE: "test", DEV: false, PROD: false, BASE_URL: "/" })' } },
  });
  const file = path.join(out, `${name}.mjs`);
  await bundle.write({ file, format: 'esm' });
  await bundle.close();
  const run = spawnSync(process.execPath, ['--import', clock, '--import', locale, file], { encoding: 'utf8', timeout: 600_000 });
  const lines = (run.stdout ?? '').split('\n');
  const fails = lines.filter((l) => l.startsWith('FAIL')).length;
  const passes = lines.filter((l) => l.startsWith('PASS')).length;
  if (only) console.log(run.stdout, run.stderr);
  const bad = run.status !== 0 || fails > 0;
  if (bad) {
    failed++;
    console.log(lines.filter((l) => l.startsWith('FAIL')).join('\n'));
    if (run.stderr) console.log(run.stderr.split('\n').slice(0, 8).join('\n'));
  }
  console.log(`${bad ? 'FAILED' : 'ok    '} ${name}  (${passes} passed${fails ? `, ${fails} failed` : ''})`);
}
rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} test file(s) failed` : '\nall logic tests passed');
process.exit(failed ? 1 : 0);
