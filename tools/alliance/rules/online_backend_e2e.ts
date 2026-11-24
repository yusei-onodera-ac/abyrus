// 同盟のサーバー版 (OnlineAllianceBackend: Firestore) を、Firebase エミュレーター (Auth + Firestore) につないで、実際の firestore.rules で、
// ミッション・研究の呼び出しを、最初から最後まで通す (作成 → 寄付 (資金) → 報告 → 受け取り → 研究)。1回の書き込みごとに、本物のルールが決める。
// 本番には、つながらない (デモのプロジェクト + エミュレーターだけ)。
//
// 動かし方 (docs/ALLIANCE_SERVER.md の「ルールの試験」): vitest と @firebase/rules-unit-testing が入っているフォルダ (abyrus-admin の clone など) の中で
//   node <このリポジトリ>/tools/alliance/rules/bundle_e2e.mjs <そのフォルダ>/e2e      (これを、1つの .mjs にまとめる)
//   firebase emulators:exec --only firestore,auth --project demo-abyrus-alliance-depth "node e2e/alliance_online.mjs"
// (firebase.json に、emulators の auth / firestore の設定と、rules に <このリポジトリ>/firestore.rules が要る)。「E2E DONE」と出れば、全部通った。
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';
import { OnlineAllianceBackend } from '../../../src/game/alliance/OnlineAllianceBackend';
import type { AllianceDetail, PlayerProfile } from '../../../src/game/alliance/AllianceBackend';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const must = <T>(r: { ok: boolean; value?: T; message?: string; reason?: string }, label: string): T => {
  if (!r.ok) throw new Error(`${label}: ${r.reason} ${r.message}`);
  return r.value as T;
};

const PROJECT = 'demo-abyrus-alliance-depth';
const app = initializeApp({ apiKey: 'fake-key', authDomain: 'localhost', projectId: PROJECT, storageBucket: 'x.appspot.com', messagingSenderId: '1', appId: '1:1:web:1' });
connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

/** Writes through the emulator's REST API as its owner (the rules do not apply): the test's way of "the server changed this". */
async function adminSet(path: string, fields: Record<string, number>): Promise<void> {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { integerValue: String(v) }])) };
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`admin write failed: ${res.status} ${await res.text()}`);
}

try {
  const u = await signInAnonymously(getAuth(app));
  console.log('      (auth emulator ok: ' + u.user.uid + ')');
  await getDoc(doc(db, 'users', u.user.uid));
  console.log('      (firestore emulator ok)');
} catch (e) {
  console.log('      (setup problem: ' + String((e as Error)?.message ?? e).slice(0, 300) + ')');
}
const backend = new OnlineAllianceBackend();
const me: PlayerProfile = { uid: 'ab12cd34', name: 'テスター', level: 30, power: 5000 };

const made = must(await backend.create(me, { name: '試験同盟', emblem: 2, description: '', joinPolicy: 'open', minPlayerLevel: 0 }), 'create');
ok(made.level === 1 && made.memberCount === 1, 'created through the real rules');
const first = must(await backend.load(me), 'load') as AllianceDetail;
ok(first.fund === 0 && first.research.canResearch && first.research.levels.battle === 0, 'a new alliance: no fund, no research, the leader can research');
ok(first.missions.daily.missions.length === 3 && first.missions.weekly.missions.length === 1 && first.missions.claimable === 0, 'no board yet: the goals are shown (3 daily, 1 weekly) with nothing done');
ok(first.missions.daily.missions.every((m) => m.progress === 0 && m.target >= 1), 'with targets from the table (members = 1)');

// ---- the fund fills with a donation (the existing donation rule + the new fund field)
const don = await backend.donate(me, 'gold');
ok(don.ok, `a donation is accepted by the rules (${don.ok ? 'ok' : `${don.reason}: ${don.message}`})`);
const afterDonation = must(await backend.load(me), 'load') as AllianceDetail;
ok(afterDonation.fund === 100 && afterDonation.exp === 100, 'the fund grew by the EXP of the donation (100)');
const gems = must(await backend.donate(me, 'gems'), 'donate gems');
ok(gems.allianceExp === 300, 'a gem donation (300 EXP) is accepted too');

// ---- report: the first one lays the boards out (create), the next ones add (update)
const r1 = await backend.reportMissions(me, { stage: 999, gacha: 999, donate: 2, raid: 999, stamina: 999, idle: 999, enhance: 999, helper: 999 });
ok(r1.ok, `the first report creates today's and this week's boards (${r1.ok ? 'ok' : `${r1.reason}: ${r1.message}`})`);
const d1 = must(await backend.load(me), 'load') as AllianceDetail;
const all = [...d1.missions.daily.missions, ...d1.missions.weekly.missions];
ok(all.every((m) => m.done && m.mine > 0), 'every goal is met, with my own share counted');
ok(all.every((m) => m.myRank === 1 && m.top[0]?.name === 'テスター'), 'I am first in every table');
const stage = all.find((m) => m.metric === 'stage');
ok(!stage || stage.mine === (stage.id.startsWith('w_') ? 2100 : 300), 'my share is capped per period (300 stages a day, 2100 a week)');
ok(d1.missions.claimable === all.filter((m) => m.claimable).length && d1.missions.claimable >= 1, 'the claimable ones are marked');
const r2 = await backend.reportMissions(me, { idle: 3 });
ok(r2.ok, `a later report adds to the boards (update; ${r2.ok ? 'ok' : `${r2.reason}: ${r2.message}`})`);
const bad = await backend.reportMissions(me, { stage: -4, gacha: Number.NaN });
ok(bad.ok, 'a nonsense report is ignored, not an error');

// ---- claim: coins reach the member, once
const target = d1.missions.daily.missions.find((m) => m.claimable) ?? d1.missions.weekly.missions.find((m) => m.claimable)!;
const coins0 = d1.coins;
const claimed = await backend.claimMission(me, target.id);
ok(claimed.ok && claimed.value.coins === target.reward.coins, `a claim is accepted by the rules (${claimed.ok ? 'ok' : `${claimed.reason}: ${claimed.message}`})`);
const d2 = must(await backend.load(me), 'load') as AllianceDetail;
ok(d2.coins === coins0 + (target.reward.coins ?? 0), 'the coins of the reward were added to the member');
const claimedView = [...d2.missions.daily.missions, ...d2.missions.weekly.missions].find((m) => m.id === target.id)!;
ok(claimedView.claimed && !claimedView.claimable, 'the mission shows as claimed');
const again = await backend.claimMission(me, target.id);
ok(!again.ok && again.reason === 'limit_reached', 'a second claim is refused');
const weekly = d2.missions.weekly.missions[0];
if (weekly.claimable) {
  const w = await backend.claimMission(me, weekly.id);
  ok(w.ok && w.value.coins === 100, 'the weekly reward (100 coins: the most one write may add) is accepted');
}
const unknown = await backend.claimMission(me, 'nope');
ok(!unknown.ok && unknown.reason === 'not_found', 'an unknown mission is refused');

// ---- research
const early = await backend.researchUp(me, 'battle');
ok(!early.ok && early.reason === 'level_too_low', 'step 1 needs alliance Lv2');
await adminSet(`alliances/${made.id}`, { level: 2, fund: 20000 });
const withFund = must(await backend.load(me), 'load') as AllianceDetail;
ok(withFund.fund === 20000 && withFund.summary.level === 2, '(the server gave the alliance Lv2 and a fund of 20000)');
const up = await backend.researchUp(me, 'battle');
ok(up.ok && up.value.level === 1 && up.value.spent === 15000 && up.value.fundLeft === 5000, `researching combat step 1 is accepted by the rules (${up.ok ? 'ok' : `${up.reason}: ${up.message}`})`);
const d3 = must(await backend.load(me), 'load') as AllianceDetail;
ok(d3.fund === 5000 && d3.research.levels.battle === 1 && d3.research.levels.income === 0, 'the fund is spent and the level is stored');
const broke = await backend.researchUp(me, 'income');
ok(!broke.ok && broke.reason === 'not_enough', 'a second research without the fund is refused');
await adminSet(`alliances/${made.id}`, { level: 3, fund: 100000 });
await backend.load(me);
const step2 = await backend.researchUp(me, 'battle');
ok(step2.ok && step2.value.level === 2 && step2.value.spent === 30000, 'step 2 of combat (30000, Lv3) is accepted');
const inc = await backend.researchUp(me, 'income');
ok(inc.ok && inc.value.level === 1, 'a second line is accepted (research.income starts from nothing)');
const d4 = must(await backend.load(me), 'load') as AllianceDetail;
ok(d4.research.levels.battle === 2 && d4.research.levels.income === 1 && d4.fund === 100000 - 30000 - 15000, 'both lines and the fund are as expected');

const raw = await getDoc(doc(db, 'alliances', made.id));
console.log(`      alliance doc: fund=${raw.data()?.fund} research=${JSON.stringify(raw.data()?.research)}`);

if (failures) process.exit(1);
console.log('E2E DONE');
process.exit(0);
