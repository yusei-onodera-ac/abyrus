// Makes the raw pictures listed in manifest.mjs with Gemini image generation on Vertex AI (billed to the Google Cloud
// project, so a credit on its billing account is used first).
//
//   node tools/art/generate.mjs --dry                    show what would be asked, send nothing
//   node tools/art/generate.mjs --pilot                  one picture of every group (a first look, ~13 pictures)
//   node tools/art/generate.mjs --group village --yes    every picture of a group
//   node tools/art/generate.mjs --only item_wood,bg_shop
//   options: --variants N (N different tries of each picture, to pick the best; default 1)
//            --force (make again even when a raw picture exists)  --limit N  --concurrency N
//            --model ID (default gemini-3-pro-image, the best; gemini-nano-banana-2.1 is about a third of the price)
//            --size 2K  --project ID  --account EMAIL  --location global
//
// Needs the gcloud login (`gcloud auth login`) and the Vertex AI API enabled on the project:
//   gcloud services enable aiplatform.googleapis.com --project <project>
// Raw pictures land in tools/art/raw/ (git-ignored): <id>.png, and <id>.v2.png, <id>.v3.png... for further tries.
// Finish them with:  python tools/art/process.py   (see README.md for choosing between tries)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST } from './manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RAW = path.join(HERE, 'raw');
const ASSETS = path.join(ROOT, 'public', 'assets');

// ---- arguments
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const MODEL = opt('model', 'gemini-3-pro-image');
const PROJECT = opt('project', process.env.GCP_PROJECT || 'shiplabjapan');
// The Google account whose login pays (it need not be the active gcloud account, which the deploy uses).
const ACCOUNT = opt('account', process.env.GCP_ACCOUNT || '');
const LOCATION = opt('location', 'global');
const SIZE = opt('size', '2K');
const CONCURRENCY = Number(opt('concurrency', '2'));
const VARIANTS = Math.max(1, Number(opt('variants', '1')));
/** Approximate US$ per 2K picture, for the estimate. */
const PRICES = { 'gemini-nano-banana-2.1': 0.0504, 'gemini-3.1-flash-image': 0.101, 'gemini-3-pro-image': 0.134 };
const PRICE = PRICES[MODEL] ?? 0.134;

// ---- which pictures
const PILOT = ['item_wood', 'equip_armor-3-1', 'equip_accessory-4-0', 'banner_first', 'bg_shop', 'battle_wasteland', 'region_forest', 'story_forest_mist', 'village_castle_1', 'village_castle_2', 'village_house_1', 'village_mine_1', 'village_tree_1'];
let chosen = MANIFEST;
if (flag('pilot')) chosen = MANIFEST.filter((m) => PILOT.includes(m.id));
if (opt('group')) chosen = chosen.filter((m) => opt('group').split(',').includes(m.group));
if (opt('only')) chosen = chosen.filter((m) => opt('only').split(',').includes(m.id));
if (opt('limit')) chosen = chosen.slice(0, Number(opt('limit')));

/** tools/art/raw/<id>.png for the first try, <id>.v2.png ... for the others (.jpg when the model answered with a jpeg). */
const rawName = (id, v) => (v === 1 ? id : `${id}.v${v}`);
const rawPath = (id, v = 1) => ['png', 'jpg'].map((ext) => path.join(RAW, `${rawName(id, v)}.${ext}`)).find((p) => fs.existsSync(p));
/** The try that was picked for `id` (tools/art/pick.json: { "<id>": 2 }), the first by default. */
function pickedVariant(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(HERE, 'pick.json'), 'utf8'))[id] ?? 1;
  } catch {
    return 1;
  }
}

const tasks = chosen.flatMap((entry) => Array.from({ length: VARIANTS }, (_, i) => ({ entry, v: i + 1 }))).filter((t) => flag('force') || !rawPath(t.entry.id, t.v));

const estimate = tasks.length * PRICE;
console.log(`${tasks.length} pictures to make with ${MODEL} (${SIZE}), about US$${estimate.toFixed(2)} (about ¥${Math.round(estimate * 155).toLocaleString('ja-JP')}) in all (project ${PROJECT}, account ${ACCOUNT || 'the active gcloud account'}).`);
if (tasks.length === 0) process.exit(0);

if (flag('dry')) {
  for (const { entry: m, v } of tasks) {
    console.log(`\n# ${m.id}${VARIANTS > 1 ? ` (try ${v})` : ''}  [${m.aspect}]  refs: ${[...(m.refs ?? []), ...(m.refPrev ? [`(raw ${m.refPrev})`] : [])].join(', ') || '-'}\n${m.prompt}`);
  }
  process.exit(0);
}
if (tasks.length > 14 && !flag('yes')) {
  console.log('That is more than a pilot: run again with --yes to confirm the cost.');
  process.exit(1);
}

// ---- Vertex AI
const GCLOUD_DEFAULTS = ['C:/Users/yusei.onodera/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'];
function gcloudCommand() {
  if (process.env.GCLOUD) return process.env.GCLOUD;
  const found = GCLOUD_DEFAULTS.find((p) => fs.existsSync(p));
  return found ?? 'gcloud';
}
let token = { value: '', at: 0 };
function accessToken() {
  // A token lives an hour; ask again every 30 minutes.
  if (token.value && Date.now() - token.at < 20 * 60 * 1000) return token.value;
  const cmd = gcloudCommand();
  const out = execFileSync(`"${cmd}"`, ['auth', 'print-access-token', ...(ACCOUNT ? ['--account', ACCOUNT] : [])], { shell: true, encoding: 'utf8' });
  token = { value: out.trim(), at: Date.now() };
  return token.value;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
function refPart(file) {
  return { inlineData: { mimeType: MIME[path.extname(file).toLowerCase()] ?? 'image/png', data: fs.readFileSync(file).toString('base64') } };
}

const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
let useSize = true;

async function request(entry) {
  const parts = [];
  // A level is built on the picked (else first) try of the level before it.
  const prev = entry.refPrev ? rawPath(entry.refPrev, pickedVariant(entry.refPrev)) ?? rawPath(entry.refPrev) : undefined;
  if (prev) parts.push(refPart(prev));
  // `refRaw`: raw pictures of other entries (a banner showing a character just made). They come first: "the first
  // reference" in a prompt is the picture that matters most.
  for (const id of entry.refRaw ?? []) {
    const file = rawPath(id, pickedVariant(id)) ?? rawPath(id);
    if (file) parts.push(refPart(file));
  }
  // 'ref:<name>' is a small copy made by make_refs.py (tools/art/refs); anything else is a finished picture under public/assets.
  for (const ref of entry.refs ?? []) {
    const file = ref.startsWith('ref:') ? path.join(HERE, 'refs', ref.slice(4)) : path.join(ASSETS, ref);
    if (fs.existsSync(file)) parts.push(refPart(file));
  }
  const note = entry.refNote ?? `The reference picture(s) above show the target art style${prev ? ' and the previous level' : ''}; copy their painting style, not their subject.`;
  const text = parts.length > 0 ? `${entry.prompt}\n\n${note}` : entry.prompt;
  parts.push({ text });
  for (let attempt = 1; attempt <= 12; attempt++) {
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: entry.aspect, ...(useSize ? { imageSize: SIZE } : {}) } },
    };
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    const message = json?.error?.message ?? res.statusText;
    if (res.status === 401) {
      // The token ran out (they live an hour): fetch a new one and ask again.
      token = { value: '', at: 0 };
      continue;
    }
    if (res.status === 400 && useSize && /imageSize|image_size/i.test(message)) {
      console.log('  (imageSize is not accepted here: asking without it)');
      useSize = false;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min(60000, (res.status === 429 ? 15000 : 4000) * attempt);
      console.log(`  ${entry.id}: ${res.status}, trying again in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`${res.status} ${message}`);
  }
  throw new Error('gave up after 12 tries');
}

fs.mkdirSync(RAW, { recursive: true });
const log = (line) => fs.appendFileSync(path.join(RAW, 'generate.log'), `${new Date().toISOString()} ${line}\n`);

const finished = new Map();
let made = 0;
let failed = 0;

async function make({ entry, v }) {
  // A level waits for the one before it, which it takes as a reference.
  if (entry.refPrev && finished.has(`${entry.refPrev}#1`)) await finished.get(`${entry.refPrev}#1`);
  const label = VARIANTS > 1 ? `${entry.id} (try ${v})` : entry.id;
  try {
    const json = await request(entry);
    const cand = json.candidates?.[0];
    const image = cand?.content?.parts?.find((p) => p.inlineData?.data);
    if (!image) {
      const why = cand?.finishReason ?? 'no candidate';
      const said = cand?.content?.parts?.map((p) => p.text).filter(Boolean).join(' ') ?? json.promptFeedback?.blockReason ?? '';
      throw new Error(`no picture came back (${why}) ${said}`.trim());
    }
    const ext = image.inlineData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const file = path.join(RAW, `${rawName(entry.id, v)}.${ext}`);
    fs.writeFileSync(file, Buffer.from(image.inlineData.data, 'base64'));
    made++;
    console.log(`ok   ${label}  (${Math.round(fs.statSync(file).size / 1024)} KB)  ${made + failed}/${tasks.length}`);
    log(`ok ${label} ${MODEL} ${fs.statSync(file).size}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${label}: ${e.message}`);
    log(`fail ${label} ${e.message}`);
  }
}

// A small pool: at most CONCURRENCY at a time, in manifest order (so a level's earlier one is always under way first).
const queue = [...tasks];
for (const t of tasks) {
  let resolve;
  finished.set(`${t.entry.id}#${t.v}`, new Promise((r) => (resolve = r)));
  t.done = resolve;
}
async function worker() {
  while (queue.length > 0) {
    const task = queue.shift();
    await make(task);
    task.done();
  }
}
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
console.log(`\ndone: ${made} made, ${failed} failed. Raw pictures are in tools/art/raw/. Next: python tools/art/process.py`);
