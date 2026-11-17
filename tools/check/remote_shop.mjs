// 本番の Firestore のショップ設定を、ゲームと同じ読み方で読んで確かめる（読むだけ。書かない）。
//   node tools/check/remote_shop.mjs                 .env の VITE_FIREBASE_PROJECT_ID のプロジェクトを読む
//   node tools/check/remote_shop.mjs --project <id>
// 中身は remote_shop_entry.ts。tools/tests/run.mjs と同じ方法でバンドルして、node で動かす。
import { rolldown } from 'rolldown';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const out = path.join(here, '.out');
mkdirSync(out, { recursive: true });

// .env から project id だけを取る（apiKey などは読まない・見せない）
let projectId = process.env.CHECK_PROJECT_ID ?? '';
const envFile = path.join(root, '.env');
if (!projectId && existsSync(envFile)) {
  const m = readFileSync(envFile, 'utf8').match(/^VITE_FIREBASE_PROJECT_ID=(.*)$/m);
  if (m) projectId = m[1].trim().replace(/\r$/, '');
}

const bundle = await rolldown({
  input: path.join(here, 'remote_shop_entry.ts'),
  platform: 'node',
  resolve: { alias: { phaser: path.join(root, 'tools', 'tests', 'phaser_stub.mjs') } },
  external: [/^firebase(\/|$)/],
  logLevel: 'silent',
  transform: { define: { 'import.meta.env': '({ MODE: "test", DEV: false, PROD: false, BASE_URL: "/" })' } },
});
const file = path.join(out, 'remote_shop.mjs');
await bundle.write({ file, format: 'esm' });
await bundle.close();

const args = process.argv.slice(2);
const run = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', env: { ...process.env, CHECK_PROJECT_ID: projectId } });
rmSync(file, { force: true });
process.exit(run.status ?? 1);
