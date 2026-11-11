// 同盟のオンライン側の「同じ値」を確かめる (docs/ALLIANCE_SERVER.md の「値の同期」)。
//   node tools/alliance/check-sync.mjs
// 1. ゲーム側 (src/game/alliance/onlineLogic.ts) と、サーバー側 (functions/src/constants.ts) が、同じ答えを返すか。
// 2. Firestore ルール (firestore.rules) に書き写した数字 (EXP表・1日の上限・ポイントの上限) が、onlineLogic.ts と合っているか。
// 3. 日付・週・ポイントなどの、基本の計算が、正しいか。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);

async function load(file) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'abyrus-sync-')), 'bundle.mjs');
  const bundle = await rolldown({ input: path.join(ROOT, file), platform: 'node', logLevel: 'silent' });
  await bundle.write({ file: out, format: 'esm' });
  await bundle.close();
  return import(pathToFileURL(out).href);
}

const game = await load('src/game/alliance/onlineLogic.ts');
const server = await load('functions/src/constants.ts');
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

let failed = 0;
const check = (cond, label) => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const JST = (y, m, d, h = 0, mi = 0, s = 0) => Date.UTC(y, m - 1, d, h - 9, mi, s);

// ---- 1. ゲーム側とサーバー側
const sampleTimes = [];
for (let i = 0; i < 400; i++) sampleTimes.push(JST(2026, 1, 1) + i * 17 * 3_600_000 + (i % 7) * 600_000);
for (const name of ['dayKey', 'weekStartMs', 'weekEndMs', 'weekId', 'weekIndex']) {
  check(sampleTimes.every((t) => game[name](t) === server[name](t)), `server and game agree: ${name} (${sampleTimes.length} times)`);
}
check(same(sampleTimes.map((t) => game.raidBossFor(t)), sampleTimes.map((t) => server.raidBossFor(t))), 'server and game agree: raidBossFor');
for (let level = 1; level <= 12; level++) {
  check(same(game.perksForLevel(level), server.perksForLevel(level)) && game.expToNext(level) === server.expToNext(level), `server and game agree: perks / expToNext at level ${level}`);
}
const powers = [0, 1, 5e4, 1.2e9, 7e17, 3e40];
check(
  powers.every((p) => game.raidMaxDamage(p, 1e12) === server.raidMaxDamage(p, 1e12) && game.raidBossHp(p, 3, 4) === server.raidBossHp(p, 3, 4) && game.raidPoints(p * 100) === server.raidPoints(p * 100)),
  'server and game agree: raidMaxDamage / raidBossHp / raidPoints',
);
check(same(game.RAID, server.RAID) && same(game.WAR, server.WAR) && same(game.DONATION, server.DONATION) && same(game.SUPPORT, server.SUPPORT), 'server and game agree: RAID / WAR / DONATION / SUPPORT tables');
check(same(game.RAID_BOSSES, server.RAID_BOSSES), 'server and game agree: the boss list');
const leagues = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
check(leagues.every((l) => [1, 2, 3, 8, 9, 10, 18, 19, 20].every((r) => same(game.nextLeague(l, r, 20), server.nextLeague(l, r, 20)))), 'server and game agree: nextLeague');

// ---- 2. ルールに写した数字
const need = /let need = \[([\d,\s]+)\];/.exec(rules);
check(need && same(need[1].split(',').map((x) => Number(x.trim())), Array.from({ length: 9 }, (_, i) => game.expToNext(i + 1))), 'firestore.rules: the EXP table equals expToNext(1..9)');
check(
  /level >= 10 \? 30 : \(level >= 5 \? 25 : 20\)/.test(rules) && [1, 4, 5, 9, 10].every((l) => game.perksForLevel(l).memberMax === (l >= 10 ? 30 : l >= 5 ? 25 : 20)),
  'firestore.rules: memberMaxFor equals perksForLevel().memberMax',
);
const limit = (field) => Number(new RegExp(`get\\('${field}', 0\\) <= (\\d+)`).exec(rules)?.[1]);
check(limit('donGold') === game.DONATION.gold.perDay && limit('donMaterials') === game.DONATION.materials.perDay && limit('donGems') === game.DONATION.gems.perDay, 'firestore.rules: daily donation limits equal DONATION.*.perDay');
check(
  limit('stages') === game.WAR.stagePointsPerDay && limit('answers') === game.SUPPORT.answersPerDay && limit('staminaSent') === game.SUPPORT.sendPerDay && limit('staminaReceived') === game.SUPPORT.receivePerDay,
  'firestore.rules: stages / answers / stamina limits equal onlineLogic',
);
check(limit('lendCoinsClaimed') === game.SUPPORT.lendCoins * game.SUPPORT.lendRewardPerDay, 'firestore.rules: lendCoinsClaimed limit = lendCoins x lendRewardPerDay');
check(
  game.DONATION_PER_DAY_TOTAL === 13 && /n\.exp - o\.exp <= 300/.test(rules) && /n\.exp < 300/.test(rules) && game.DONATION_MAX_EXP === 300 && Math.max(...Object.values(game.DONATION).map((d) => d.allianceExp)) <= 300,
  'firestore.rules: the per-write EXP bound (300) covers the largest donation',
);
check(
  /n\.weekPoints - o\.weekPoints <= 30/.test(rules) && /contribution - resource\.data\.contribution <= 30/.test(rules) && Math.max(...Object.values(game.DONATION).map((d) => d.contribution)) <= game.WRITE_MAX_POINTS,
  'firestore.rules: the per-write points bound (30) covers the largest donation',
);
check(
  /donation - resource\.data\.donation <= 30/.test(rules) && /stages - resource\.data\.stages <= 20/.test(rules) && /helpers - resource\.data\.helpers <= 5/.test(rules) && game.WAR.stagePoints === 20 && game.WAR.helperPoints === 5,
  'firestore.rules: war entry bounds (30 / 20 / 5) equal onlineLogic',
);
check(
  /kind == 'stamina' && request\.resource\.data\.amount == 10/.test(rules) && game.SUPPORT.staminaAmount === 10 && /kind == 'lend' && request\.resource\.data\.amount == 5/.test(rules) && game.SUPPORT.lendCoins === 5,
  'firestore.rules: inbox amounts equal SUPPORT',
);
check(/request\.time \+ duration\.value\(5, 'h'\)/.test(rules) && /duration\.value\(24, 'h'\)/.test(rules) && game.REJOIN_COOLDOWN_MS === 24 * 3_600_000, 'firestore.rules: dayKey shift (5 h) and the 24 h rejoin wait equal onlineLogic');
check(/lendId\.split\('_'\)\[1\] == dayKey\(\)/.test(rules) && /n <= 3/.test(rules) && game.SUPPORT.lendRewardPerDay === 3, 'firestore.rules: lend counter limit (3) equals SUPPORT.lendRewardPerDay');

// ---- 3. 基本の計算
check(game.dayKey(JST(2026, 11, 11, 3, 59, 59)) === '2026-11-10' && game.dayKey(JST(2026, 11, 11, 4, 0, 0)) === '2026-11-11', 'dayKey flips at 4:00 JST');
check(game.dayKey(JST(2026, 1, 5, 12)) === '2026-1-5', 'dayKey does not pad months and days (as the rules do)');
check(game.weekStartMs(JST(2026, 11, 11, 12)) === JST(2026, 11, 9) && game.weekEndMs(JST(2026, 11, 11, 12)) === JST(2026, 11, 16) - 1, 'the week runs Monday 0:00 to Sunday 23:59:59 JST');
check(game.weekStartMs(JST(2026, 11, 9, 0, 0, 0)) === JST(2026, 11, 9) && game.weekStartMs(JST(2026, 11, 8, 23, 59, 59)) === JST(2026, 11, 2), 'the week turns over exactly at Monday 0:00 JST');
check(
  game.weekId(JST(2026, 11, 11)) === '2026-W46' && game.weekId(JST(2026, 1, 1)) === '2026-W01' && game.weekId(JST(2025, 12, 29)) === '2026-W01' && game.weekId(JST(2027, 1, 3)) === '2026-W53' && game.weekId(JST(2027, 1, 4)) === '2027-W01',
  'weekId is the ISO week of the JST date',
);
check(game.weekIndex(JST(2026, 1, 5)) === 0 && game.weekIndex(JST(2026, 1, 12)) === 1 && game.weekIndex(JST(2026, 1, 4)) === -1, 'weekIndex counts weeks from 2026-01-05');
check(
  new Set(Array.from({ length: 5 }, (_, i) => game.raidBossFor(JST(2026, 1, 5) + i * 7 * 86_400_000).id)).size === 5 && game.raidBossFor(JST(2026, 1, 5)).id === game.raidBossFor(JST(2026, 2, 9)).id,
  'the five bosses take turns and then repeat',
);
check(game.expToNext(1) === 1000 && game.expToNext(2) === 1600 && game.expToNext(9) === 42950 && game.expToNext(10) === null, 'expToNext: 1000, 1600, ... 42950, none at the top');
let grown = game.addAllianceExp(1, 900, 300);
check(grown.level === 2 && grown.exp === 200 && grown.levelUp === 2, 'addAllianceExp carries the rest over a level up');
grown = game.addAllianceExp(10, 0, 300);
check(grown.level === 10 && grown.exp === 0 && grown.levelUp === null, 'addAllianceExp stays at the top level with no EXP');
grown = game.addAllianceExp(1, 0, 1_000_000);
check(grown.level === 10 && grown.exp === 0, 'a huge amount of EXP stops at the top level');
check(
  game.perksForLevel(1).raidAttemptsPerDay === 3 && game.perksForLevel(5).raidAttemptsPerDay === 4 && game.perksForLevel(8).raidAttemptsPerDay === 5 && game.perksForLevel(10).memberMax === 30 && game.perksForLevel(10).idleGoldBonus === 0.2,
  'perksForLevel matches the design table',
);
check(game.raidMaxDamage(1e10, 1e12) === 5e10 && game.raidMaxDamage(1e8, 1e12) === 8e9 && game.raidMaxDamage(0, 1e12) === 0, 'raidMaxDamage is the smaller of power x 80 and 5% of the boss HP');
check(game.raidPoints(0) === 0 && game.raidPoints(10_000) === 3 && game.raidPoints(1e8) > game.raidPoints(1e6) && game.raidPoints(1e30) < 400, 'raidPoints grows slowly with the damage');
check(
  game.nextLeague('bronze', 1, 20).league === 'silver' && game.nextLeague('silver', 20, 20).league === 'bronze' && game.nextLeague('bronze', 20, 20).league === 'bronze' && game.nextLeague('diamond', 1, 20).league === 'diamond' && game.nextLeague('gold', 1, 4).league === 'gold',
  'nextLeague: top 3 up, bottom 3 down, nothing below bronze or above diamond, small groups stay',
);
const tiers = game.WAR_REWARD_TIERS;
check(tiers.every((t, i) => i === 0 || t.fromRank === tiers[i - 1].toRank + 1) && game.warRewardForRank(1).reward.gems === 300 && game.warRewardForRank(20).reward.gems === 50, 'war reward tiers are contiguous');
check(game.raidReward(false, 5).reward.gems === 10 && game.raidReward(true, 1).reward.gems === 80 && game.raidReward(true, 9).reward.gems === 30, 'raid rewards: participation, top damage, the rest');

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
