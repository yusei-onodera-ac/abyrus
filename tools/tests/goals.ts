// Runs 村の目標 (data + system + save) against a real SaveData, without a browser.
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { VillageSystem } from '../../src/game/systems/VillageSystem';
import { VillageGoals } from '../../src/game/systems/VillageGoals';
import { castleLevel } from '../../src/game/systems/VillageIncome';
import { BigNumber } from '../../src/game/systems/BigNumber';
import { BUILDINGS, VILLAGE_BUILDERS } from '../../src/game/data/village';
import { GOAL_TIERS, VILLAGE_GOALS, getVillageGoal, goalsOfTier, unlocksAt } from '../../src/game/data/villageGoals';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 } as Storage;

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const DAY = 24 * 3600 * 1000;
const t0 = 1_800_000_000_000;
function fresh(): SaveData {
  const s = SaveSystem.createDefault();
  s.village.raid.nextAt = t0 + 100000 * DAY;
  s.village.wanderers.lastSpawnAt = t0;
  return s;
}

// ---- data
const ids = VILLAGE_GOALS.map((g) => g.id);
ok(new Set(ids).size === ids.length, 'every goal has its own id');
ok(VILLAGE_GOALS.every((g) => g.tier >= 1 && g.tier <= GOAL_TIERS && g.target > 0 && g.text.length > 0), 'every goal has a tier, a target and a text');
ok(Array.from({ length: GOAL_TIERS }, (_, i) => goalsOfTier(i + 1).length).every((n) => n >= 7), 'every tier has at least 7 goals');
ok([1, 2, 3, 4, 5].every((t) => goalsOfTier(t).some((g) => g.metric.kind === 'castle' && g.target === t + 1)), 'each tier but the last has the goal "castle to the next level"');
ok(VILLAGE_GOALS.every((g) => (g.reward.gems ?? 0) + (g.reward.goldHours ?? 0) + Object.keys(g.reward.materials ?? {}).length > 0), 'every goal pays something');
const gems = VILLAGE_GOALS.reduce((s, g) => s + (g.reward.gems ?? 0), 0);
ok(gems > 0 && gems < 2500, `all the goals together pay a modest ${gems} gems`);
ok(VILLAGE_GOALS.every((g) => (g.reward.gems ?? 0) <= 150), 'no single goal pays more than 150 gems');
const lastTier = (t: number): number => goalsOfTier(t).reduce((s, g) => s + (g.reward.gems ?? 0), 0);
ok(lastTier(6) > lastTier(1), 'later tiers pay more than the first');

// ---- unlock lines come from the real rules
ok(unlocksAt(1).length === 0, 'castle Lv1 unlocks nothing (it is where it starts)');
ok([2, 3, 4, 5, 6].every((l) => unlocksAt(l).length > 0), 'every castle level above 1 unlocks something');
ok(unlocksAt(2).some((l) => l.text.includes('鉱山')) && unlocksAt(2).some((l) => l.text.includes('門')), 'castle Lv2 unlocks the mine and the gate');
ok(unlocksAt(3).some((l) => l.text.includes('市場')) && unlocksAt(3).some((l) => l.text.includes('噴水')), 'castle Lv3 unlocks the market and the fountain');
ok(unlocksAt(4).some((l) => l.text.includes('建築員') && l.text.includes('3人')), 'castle Lv4 gives a third builder');
ok(unlocksAt(4).some((l) => l.text.includes('銅像')), 'castle Lv4 unlocks the statue');
ok(unlocksAt(6).some((l) => l.text.includes('Lv6')), 'castle Lv6 lets buildings reach Lv6');
ok(VILLAGE_BUILDERS[3] === 3 && VILLAGE_BUILDERS[5] === 4, 'the builder table is as these lines assume');

// ---- a new village
const s0 = fresh();
ok(s0.village.milestones.claimed.length === 0 && s0.village.milestones.gathered === 0, 'a new save has an empty milestones record');
ok(VillageGoals.claimable(s0, t0).length === 0, 'nothing can be collected in a new village');
ok(VillageGoals.currentTier(s0, t0) === 1, 'a new village is on tier 1');
const incomeGoal = getVillageGoal('t1_income')!;
ok(!VillageGoals.progress(s0, incomeGoal, t0).done && VillageGoals.progress(s0, incomeGoal, t0).value === 1, 'a new village sells x1');
ok(VillageGoals.format(incomeGoal, 1.4999) === '×1.49' && VillageGoals.formatTarget(incomeGoal) === '×1.4', 'the 売上 is shown with two decimals, rounded down');

// ---- progress and collecting
const s1 = fresh();
s1.gold = [1, 30];
SaveSystem.addMaterials(s1, { wood: 1000, stone: 1000, iron: 1000 });
const gatheredAfterGift = s1.village.milestones.gathered;
ok(gatheredAfterGift === 3000, 'materials that come in are counted ("gathered")');
SaveSystem.spendMaterials(s1, { wood: 500 });
ok(s1.village.milestones.gathered === 3000, 'spending them does not take it back');
for (let i = 0; i < 2; i++) {
  const spot = VillageSystem.findSpot(s1, 'house', 3 + i * 3, 3);
  VillageSystem.build(s1, 'house', spot!.x, spot!.y, t0);
}
ok(VillageGoals.progress(s1, getVillageGoal('t1_house2')!, t0).value === 0, 'a house still being built does not count');
VillageSystem.settle(s1, t0 + DAY);
const houseGoal = getVillageGoal('t1_house2')!;
ok(VillageGoals.progress(s1, houseGoal, t0 + DAY).done, 'two finished houses meet "民家を2軒"');
ok(VillageGoals.claimable(s1, t0 + DAY).some((g) => g.id === 't1_house2'), 'it is waiting to be collected');
const gemsBefore = s1.gems;
const woodBefore = SaveSystem.getMaterial(s1, 'wood');
const paid = VillageGoals.claim(s1, 't1_house2', t0 + DAY);
ok(!!paid && paid.gems === 10 && paid.materials.wood === 40, 'collecting pays its gems and materials');
ok(s1.gems === gemsBefore + 10 && SaveSystem.getMaterial(s1, 'wood') === woodBefore + 40, 'they reach the save');
ok(VillageGoals.claim(s1, 't1_house2', t0 + DAY) === null, 'a goal pays only once');
ok(VillageGoals.claim(s1, 't1_castle', t0 + DAY) === null && VillageGoals.claim(s1, 'nope') === null, 'an unmet goal, or one that does not exist, pays nothing');
ok(VillageGoals.tierSummary(s1, 1, t0 + DAY).claimed === 1, 'the tier counts it as collected');
// gold hours
const castleGoal = getVillageGoal('t1_castle')!;
const goldBefore = SaveSystem.getGold(s1);
const castleB = s1.village.buildings.find((b) => b.kind === 'castle')!;
ok(VillageSystem.upgrade(s1, castleB, t0 + DAY), 'the castle can be raised (rich village)');
VillageSystem.settle(s1, t0 + 3 * DAY);
ok(castleLevel(s1, t0 + 3 * DAY) === 2 && VillageGoals.progress(s1, castleGoal, t0 + 3 * DAY).done, 'castle Lv2 meets its goal');
const paidCastle = VillageGoals.claim(s1, 't1_castle', t0 + 3 * DAY)!;
ok(paidCastle.gems === 30 && !paidCastle.gold.isZero(), 'the castle goal also pays hours of gold');
void goldBefore;
ok(VillageGoals.currentTier(s1, t0 + 3 * DAY) === 2, 'the list moves to tier 2');

// raids
const s2 = fresh();
s2.village.raid.won = 3;
ok(VillageGoals.progress(s2, getVillageGoal('t3_raids')!, t0).done, 'three 襲撃 beaten meet that goal');

// ---- the save
const s3 = fresh();
s3.village.milestones.claimed.push('t1_house2');
s3.village.milestones.gathered = 12345;
SaveSystem.save(s3);
const s3b = SaveSystem.load();
ok(s3b.village.milestones.claimed.includes('t1_house2') && s3b.village.milestones.gathered === 12345, 'the record survives a save and a load');
const store = (globalThis as unknown as { localStorage: Storage }).localStorage;
const raw = JSON.parse(store.getItem('abyrus_save_v1')!);
raw.village.milestones = { claimed: ['a', 'a', 5, null, 'b'], gathered: 'x' };
store.setItem('abyrus_save_v1', JSON.stringify(raw));
const s3c = SaveSystem.load();
ok(s3c.village.milestones.claimed.join() === 'a,b' && s3c.village.milestones.gathered === 0, 'a damaged record is cleaned on load');
delete raw.village.milestones;
store.setItem('abyrus_save_v1', JSON.stringify(raw));
const s3d = SaveSystem.load();
ok(s3d.village.milestones.claimed.length === 0 && s3d.village.milestones.gathered === 0, 'an older save without the record gets an empty one');

// ---- every goal can be reached by the rules: grow a village as far as each castle level allows
function grow(save: SaveData, target: number): number {
  let now = t0;
  for (let round = 0; round < 600; round++) {
    VillageSystem.settle(save, now);
    let changed = false;
    const castle = save.village.buildings.find((b) => b.kind === 'castle')!;
    if (castleLevel(save, now) < target && VillageSystem.checkUpgrade(save, castle, now) === null && VillageSystem.upgrade(save, castle, now)) changed = true;
    for (const def of BUILDINGS) {
      if (!def.buildable) continue;
      while (VillageSystem.checkStart(save, def.kind, now) === null) {
        const spot = VillageSystem.findSpot(save, def.kind, 4, 4, undefined, now);
        if (!spot || !VillageSystem.build(save, def.kind, spot.x, spot.y, now)) break;
        changed = true;
      }
    }
    for (const b of save.village.buildings) {
      if (b.kind === 'castle') continue;
      if (VillageSystem.checkUpgrade(save, b, now) === null && VillageSystem.upgrade(save, b, now)) changed = true;
    }
    now += 3 * DAY;
    if (!changed && castleLevel(save, now) >= target) {
      VillageSystem.settle(save, now);
      break;
    }
  }
  return now;
}
for (let level = 1; level <= 6; level++) {
  const save = fresh();
  save.gold = [1, 40];
  SaveSystem.addMaterials(save, { wood: 1e10, stone: 1e10, iron: 1e10 });
  save.stageProgress = 150;
  const now = grow(save, level);
  const cl = castleLevel(save, now);
  const missed = VILLAGE_GOALS.filter((g) => g.tier <= level && g.metric.kind !== 'raids' && g.metric.kind !== 'gathered' && !(g.metric.kind === 'castle' && g.target > level) && !VillageGoals.progress(save, g, now).done);
  ok(cl === level && missed.length === 0, `a full village at castle Lv${level} meets every goal of tiers 1-${level}${missed.length ? ` (missed: ${missed.map((g) => `${g.id} ${VillageGoals.format(g, VillageGoals.progress(save, g, now).value)}/${g.target}`).join(', ')})` : ''}`);
  const above = VILLAGE_GOALS.filter((g) => g.tier > level + 0 && g.metric.kind !== 'raids' && g.metric.kind !== 'gathered' && g.metric.kind !== 'castle' && VillageGoals.progress(save, g, now).done);
  ok(above.length === 0 || level === 6, `...and does not already meet the goals of the tiers above it${above.length ? ` (met: ${above.map((g) => g.id).join(', ')})` : ''}`);
}

// ---- the 発展 panel's numbers
const s4 = fresh();
const next = VillageGoals.nextCastle(s4, t0)!;
ok(next.level === 2 && !next.gold.isZero() && next.seconds > 0 && next.unlocks.length > 0, 'the next castle level is 2 with a price, a time and what it unlocks');
const s5 = fresh();
s5.village.buildings.find((b) => b.kind === 'castle')!.level = 6;
ok(VillageGoals.nextCastle(s5, t0) === null, 'there is no next level at the top');
const shop = s4.village.buildings.find((b) => b.kind === 'shop')!;
ok(VillageGoals.upgradeGain(s4, shop, t0).some((l) => l.startsWith('売上')), 'strengthening a shop tells what it gains in 売上');
ok(VillageGoals.upgradeGain(s4, s4.village.buildings.find((b) => b.kind === 'castle')!, t0).length > 0, 'strengthening the castle lists what it unlocks');
void BigNumber;

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
