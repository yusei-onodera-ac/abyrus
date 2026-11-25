// node tools/alliance/rules/bundle_e2e.mjs <出力先のフォルダ>
// online_backend_e2e.ts を、ゲームのコードごと、1つの alliance_online.mjs にまとめる (Phaser は、試験用の代わりに差し替え。firebase は、まとめずに、出力先から読む)。
// tools/tests/run.mjs と同じやり方。
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { rolldown } = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);
const outDir = path.resolve(process.argv[2] ?? 'e2e');
mkdirSync(outDir, { recursive: true });
const bundle = await rolldown({
  input: path.join(ROOT, 'tools/alliance/rules/online_backend_e2e.ts'),
  platform: 'node',
  resolve: { alias: { phaser: path.join(ROOT, 'tools/tests/phaser_stub.mjs') } },
  external: [/^firebase(\/|$)/, /^@firebase(\/|$)/],
  logLevel: 'silent',
  transform: { define: { 'import.meta.env': '({ MODE: "test", DEV: false, PROD: false, BASE_URL: "/" })' } },
});
await bundle.write({ file: path.join(outDir, 'alliance_online.mjs'), format: 'esm' });
await bundle.close();
console.log(`bundled -> ${path.join(outDir, 'alliance_online.mjs')}`);
