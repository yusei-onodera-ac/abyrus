// Makes the raw audio listed in manifest.mjs on Vertex AI (billed to the Google Cloud project, so a credit on its billing
// account is used first): music and jingles with Lyria, the voice lines with Gemini text-to-speech.
//
//   node tools/audio/extract.mjs                       once (and whenever the lines change): read the voice lines from the game data
//   node tools/audio/generate.mjs --dry                show what would be made, send nothing
//   node tools/audio/generate.mjs --group music        music | jingle | voice | sfx   (comma separated; default music,jingle,voice)
//   node tools/audio/generate.mjs --only bgm_home,home_welcome
//   options: --force  --yes (needed for more than 14)  --concurrency N  --project ID  --account EMAIL
//            --music-model lyria-002  --tts-model gemini-2.5-flash-tts  --music-location us-central1
// Raw files land in tools/audio/raw/ (git-ignored) as .wav. Finish them with:  python tools/audio/process.py
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JINGLES, MUSIC, SFX, VOICES } from './manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const PROJECT = opt('project', process.env.GCP_PROJECT || 'shiplabjapan');
const ACCOUNT = opt('account', process.env.GCP_ACCOUNT || '');
const MUSIC_MODEL = opt('music-model', 'lyria-002');
const MUSIC_LOCATION = opt('music-location', 'us-central1');
const TTS_MODELS = opt('tts-model') ? [opt('tts-model')] : ['gemini-2.5-flash-tts', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-tts'];
const CONCURRENCY = Number(opt('concurrency', '2'));
const GROUPS = opt('group', 'music,jingle,voice').split(',');

// ---- what to make
const jobs = [];
if (GROUPS.includes('music')) jobs.push(...MUSIC);
if (GROUPS.includes('jingle')) jobs.push(...JINGLES);
if (GROUPS.includes('sfx')) jobs.push(...SFX);
if (GROUPS.includes('voice')) {
  const file = path.join(RAW, 'lines.json');
  if (!fs.existsSync(file)) {
    console.log('Run  node tools/audio/extract.mjs  first (it reads the voice lines from the game data).');
    process.exit(1);
  }
  for (const line of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    const voice = VOICES[line.voice] ?? VOICES.guide;
    jobs.push({ id: line.id, kind: 'voice', out: `voice/${line.id}.mp3`, text: line.text, voice });
  }
}
let chosen = jobs;
if (opt('only')) chosen = chosen.filter((j) => opt('only').split(',').includes(j.id));
const rawFile = (id) => path.join(RAW, `${id}.wav`);
if (!flag('force')) chosen = chosen.filter((j) => !fs.existsSync(rawFile(j.id)));
const PRICE = { music: 0.06, jingle: 0.06, sfx: 0.06, voice: 0.01 };
const estimate = chosen.reduce((sum, j) => sum + PRICE[j.kind], 0);
console.log(`${chosen.length} audio files to make, about US$${estimate.toFixed(2)} (about ¥${Math.round(estimate * 155).toLocaleString('ja-JP')}) in all (project ${PROJECT}, account ${ACCOUNT || 'the active gcloud account'}).`);
if (chosen.length === 0) process.exit(0);
if (flag('dry')) {
  for (const j of chosen) console.log(`\n# ${j.id} [${j.kind}]\n${j.prompt ?? `${j.voice.voice}: ${j.text}`}`);
  process.exit(0);
}
if (chosen.length > 14 && !flag('yes')) {
  console.log('That is more than a first try: run again with --yes to confirm the cost.');
  process.exit(1);
}

// ---- Vertex AI
const GCLOUD_DEFAULTS = ['C:/Users/yusei.onodera/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'];
let token = { value: '', at: 0 };
function accessToken() {
  if (token.value && Date.now() - token.at < 20 * 60 * 1000) return token.value;
  const cmd = process.env.GCLOUD || GCLOUD_DEFAULTS.find((p) => fs.existsSync(p)) || 'gcloud';
  const out = execFileSync(`"${cmd}"`, ['auth', 'print-access-token', ...(ACCOUNT ? ['--account', ACCOUNT] : [])], { shell: true, encoding: 'utf8' });
  token = { value: out.trim(), at: Date.now() };
  return token.value;
}

async function post(url, body) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    if (res.status === 401) {
      token = { value: '', at: 0 };
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, Math.min(60000, 15000 * attempt)));
      continue;
    }
    const error = new Error(`${res.status} ${json?.error?.message ?? res.statusText}`);
    error.status = res.status;
    throw error;
  }
  throw new Error('gave up after 12 tries');
}

/** Raw 16-bit PCM wrapped as a WAV file. */
function pcmToWav(pcm, rate, channels = 1) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** The base64 audio somewhere inside a prediction. */
function findAudio(node) {
  if (!node || typeof node !== 'object') return null;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' && value.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 200))) return { data: value, mime: node.mimeType ?? node.mime_type ?? 'audio/wav' };
    const inner = findAudio(value);
    if (inner) return inner;
  }
  return null;
}

async function music(job) {
  const url = `https://${MUSIC_LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${MUSIC_LOCATION}/publishers/google/models/${MUSIC_MODEL}:predict`;
  // A piece that is too like an existing one is refused ("recitation"): ask again for something more original, up to three times.
  const extras = ['', ' An entirely original, unfamiliar melody and chord progression.', ' A completely new composition with its own unusual melody, different instruments from the obvious ones, nothing resembling any known piece.'];
  let json;
  for (const extra of extras) {
    try {
      json = await post(url, { instances: [{ prompt: job.prompt + extra, negative_prompt: job.negative }], parameters: { sample_count: 1 } });
      break;
    } catch (e) {
      if (!/recitation/i.test(e.message) || extra === extras[extras.length - 1]) throw e;
    }
  }
  const audio = findAudio(json.predictions?.[0] ?? json);
  if (!audio) throw new Error(`no audio in the answer: ${JSON.stringify(json).slice(0, 200)}`);
  return Buffer.from(audio.data, 'base64');
}

let ttsModel = TTS_MODELS[0];
async function voice(job) {
  const spoken = `${job.voice.style}\n\n${job.text}`;
  for (const model of [ttsModel, ...TTS_MODELS.filter((m) => m !== ttsModel)]) {
    const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${model}:generateContent`;
    try {
      const json = await post(url, {
        contents: [{ role: 'user', parts: [{ text: spoken }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: job.voice.voice } } } },
      });
      const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part) throw new Error(`no audio in the answer: ${JSON.stringify(json).slice(0, 200)}`);
      ttsModel = model;
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? 24000);
      return pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate);
    } catch (e) {
      if (e.status === 404 || e.status === 400) continue; // another model name may be the one this project has
      throw e;
    }
  }
  throw new Error('none of the text-to-speech models answered (404/400): check the model name with --tts-model');
}

fs.mkdirSync(RAW, { recursive: true });
const log = (line) => fs.appendFileSync(path.join(RAW, 'generate.log'), `${new Date().toISOString()} ${line}\n`);
let made = 0;
let failed = 0;
async function make(job) {
  try {
    const wav = job.kind === 'voice' ? await voice(job) : await music(job);
    fs.writeFileSync(rawFile(job.id), wav);
    made++;
    console.log(`ok   ${job.id}  (${Math.round(wav.length / 1024)} KB)  ${made + failed}/${chosen.length}`);
    log(`ok ${job.id}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${job.id}: ${e.message}`);
    log(`fail ${job.id} ${e.message}`);
  }
}
const queue = [...chosen];
await Promise.all(
  Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
    while (queue.length > 0) await make(queue.shift());
  }),
);
console.log(`\ndone: ${made} made, ${failed} failed. Next: python tools/audio/process.py`);
