// Runs the 村 data, save handling and system against a real SaveData, without a browser.
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { IdleSystem } from '../../src/game/systems/IdleSystem';
import { VillageSystem, settleChanged } from '../../src/game/systems/VillageSystem';
import { VillageQuests } from '../../src/game/systems/VillageQuests';
import { ExpeditionSystem } from '../../src/game/systems/ExpeditionSystem';
import { EXPEDITIONS, getExpedition } from '../../src/game/data/expeditions';
import { VILLAGE_QUESTS, QUEST_REGION_MULTIPLIER } from '../../src/game/data/villageQuests';
import type { PlacedBuilding as PlacedBuildingT } from '../../src/game/systems/SaveSystem';
import { castleLevel, builderCount, busyBuilders, incomeMultiplier, effectiveLevel, isMoving, isMoveDone, movePhase, footprints, levelValue, defensePoints } from '../../src/game/systems/VillageIncome';
import { BUILDINGS, VILLAGE_BASE_COLS as VILLAGE_COLS, VILLAGE_BASE_ROWS as VILLAGE_ROWS, VILLAGE_START, VILLAGE_BUILDERS, VILLAGE_MATERIALS, VILLAGE_START_MATERIALS, VILLAGE_STAGE_DROPS, MOVE_MIN_SECONDS, RAID_POWER, RAID_WINDOW_HOURS, RAID_INTERVAL_HOURS, RAID_REWARD_MATERIALS, RAID_REWARD_GOLD_HOURS, RAID_STAGES_BELOW, EXTRA_BUILDER_GEMS, FINISH_GEMS_MAX, WANDERERS, WANDERER_MAX, WANDERER_LIFE_HOURS, getBuilding } from '../../src/game/data/village';
import { IDLE_VILLAGE_MATERIALS_PER_HOUR } from '../../src/game/data/idle';
import { WEEKDAY_DUNGEONS } from '../../src/game/data/weekdayDungeons';
import { StageRewardSystem } from '../../src/game/systems/StageRewardSystem';
import { WeekdayDungeonSystem } from '../../src/game/systems/WeekdayDungeonSystem';
import { ProgressionSystem } from '../../src/game/systems/ProgressionSystem';
import { BigNumber } from '../../src/game/systems/BigNumber';
import { isoPoint, isoGrid, ISO } from '../../src/game/ui/VillageArt';
import { MISSION_GROUPS } from '../../src/game/data/missions';
import { formatSpanExact } from '../../src/game/ui/format';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const HOUR = 3600 * 1000;
const RICH = { wood: 1_000_000, stone: 1_000_000, iron: 1_000_000 };
const mats = (s: SaveData): string => VILLAGE_MATERIALS.map(({ id }) => SaveSystem.getMaterial(s, id)).join('/');
const t0 = 1_800_000_000_000;
/** A new save whose clocks start at `at`: the first raid is far off and no 行商人 is due, so the older checks (which use
 *  made-up times in 2027) do not run into them. */
function fresh(at = t0): SaveData {
  const s = SaveSystem.createDefault();
  s.village.raid.nextAt = at + 1000 * HOUR;
  s.village.wanderers.lastSpawnAt = at;
  return s;
}

// ---- data
ok(BUILDINGS.filter((b) => !b.decor).every((b) => b.levels.length === 6 && b.maxCount.length === 6), 'every building (but 装飾) has 6 levels and 6 count limits');
ok(BUILDINGS.filter((b) => !b.decor).every((b) => b.levels.every((l, i, a) => i === 0 || (l.costHours >= a[i - 1].costHours && l.seconds >= a[i - 1].seconds && l.needCastle >= a[i - 1].needCastle && l.value > a[i - 1].value) || b.kind === 'castle')), 'levels rise in cost, time, castle need and value');
ok(getBuilding('shop').levels[0].value === 1, 'a level-1 shop is worth exactly 1');
ok(VILLAGE_BUILDERS.length === 6 && VILLAGE_BUILDERS.every((n, i, a) => i === 0 || n >= a[i - 1]), 'builders never fall as the castle rises');
ok(VILLAGE_START.some((s) => s.kind === 'castle'), 'the village starts with a castle');
ok(MISSION_GROUPS.some((g) => g.missions.some((m) => m.key === 'village_build')), 'a village mission exists');
const startFits = VILLAGE_START.every((s) => { const d = getBuilding(s.kind); return s.x >= 0 && s.y >= 0 && s.x + d.w <= VILLAGE_COLS && s.y + d.h <= VILLAGE_ROWS; });
ok(startFits, 'the starting layout is on the map');
// materials
const matSum = (l: { materials?: Record<string, number> }): number => Object.values(l.materials ?? {}).reduce((a, b) => a + b, 0);
ok(BUILDINGS.every((b) => b.levels.every((l, i, a) => i <= 1 || matSum(l) > matSum(a[i - 1]))), 'the materials a level takes rise with the level');
ok(BUILDINGS.filter((b) => b.buildable).every((b) => matSum(b.levels[0]) > 0), 'every building that can be built takes materials');
ok(getBuilding('castle').levels.slice(1).every((l) => (l.materials?.stone ?? 0) > 0 && (l.materials?.iron ?? 0) > 0 && (l.materials?.wood ?? 0) > 0), 'the castle takes wood, stone and iron every level');
ok(VILLAGE_MATERIALS.map((m) => m.id).join() === 'wood,iron,stone', 'the three materials are 木材, 鉄, 石');
ok(IDLE_VILLAGE_MATERIALS_PER_HOUR.length === 5 && IDLE_VILLAGE_MATERIALS_PER_HOUR.every((r, i, a) => VILLAGE_MATERIALS.every(({ id }) => r[id] > 0 && (i === 0 || r[id] > a[i - 1][id]))), 'idle pays all three, more with each region reached');
ok(VILLAGE_STAGE_DROPS.every((d) => d.amounts.length === 5 && d.chance > 0 && d.chance <= 1), 'stage drops have an amount for each of the five regions');
ok(WEEKDAY_DUNGEONS.every((d) => d.materials.length > 0 && d.materials.every((m) => m.amounts.length === 4 && m.amounts.every((a, i, arr) => i === 0 || a >= arr[i - 1]))), 'every day pays materials, rising with the tier');
ok(VILLAGE_MATERIALS.every(({ id }) => WEEKDAY_DUNGEONS.some((d) => d.materials.some((m) => m.material === id))), 'each material is paid by some day');

// ---- the angled view
let inverseOk = true;
for (let gx = 0; gx <= VILLAGE_COLS; gx += 3) {
  for (let gy = 0; gy <= VILLAGE_ROWS; gy += 3) {
    const p = isoPoint(gx, gy);
    const g = isoGrid(p.x, p.y);
    if (Math.abs(g.gx - gx) > 1e-9 || Math.abs(g.gy - gy) > 1e-9) inverseOk = false;
  }
}
ok(inverseOk, 'the point under a screen position is the exact inverse of where a tile is drawn');
ok(isoPoint(1, 0).x > 0 && isoPoint(0, 1).x < 0 && isoPoint(1, 1).y > isoPoint(1, 0).y && isoPoint(1, 1).x === 0, 'x runs right-down, y runs left-down, the far corner is straight below the top');
ok(isoPoint(2, 0).y * 2 === isoPoint(2, 0).x * ISO.tileH / ISO.tileW * 2, 'tiles are 2:1 diamonds');

// ---- a new save
let save = fresh();
ok(save.village.buildings.length === 2 && castleLevel(save) === 1, 'a new save has a castle (Lv1) and a shop');
ok(incomeMultiplier(save) === 1, 'a new village pays x1');
ok(VILLAGE_MATERIALS.every(({ id }) => SaveSystem.getMaterial(save, id) === VILLAGE_START_MATERIALS[id]), `a new village starts with ${mats(save)} (木材/鉄/石)`);
const base = IdleSystem.baseGoldPerHour(save);
const stage0 = ProgressionSystem.getStage(0).rewardGold.mul(3);
ok(base.toString() === stage0.toString() && !base.isZero(), `base gold per hour is the old rate (${base.toString()})`);
ok(IdleSystem.perHour(save).gold.toString() === base.toString(), 'with the starter village the idle gold is exactly what it was');
ok(builderCount(save) === 2 && busyBuilders(save) === 0, 'two builders, none busy');

// ---- the store of materials
save = fresh();
SaveSystem.addMaterials(save, { wood: 5.9, stone: -3, iron: 0 });
ok(SaveSystem.getMaterial(save, 'wood') === 105 && SaveSystem.getMaterial(save, 'stone') === 60 && SaveSystem.getMaterial(save, 'iron') === 0, 'addMaterials adds whole numbers and ignores negatives');
ok(SaveSystem.missingMaterials(save, { wood: 105, stone: 61, iron: 1 }).join() === 'iron,stone', 'missingMaterials names what is short (in the village order)');
ok(!SaveSystem.spendMaterials(save, { wood: 10, iron: 1 }) && SaveSystem.getMaterial(save, 'wood') === 105, 'a payment that is short takes nothing');
ok(SaveSystem.spendMaterials(save, { wood: 105, stone: 60 }) && mats(save) === '0/0/0', 'a payment that is covered takes exactly that');

// ---- placement
save = fresh();
const castle = save.village.buildings.find((b) => b.kind === 'castle')!;
const shop = save.village.buildings.find((b) => b.kind === 'shop')!;
ok(!VillageSystem.canPlace(save, 'house', castle.x, castle.y), 'cannot build on the castle');
ok(!VillageSystem.canPlace(save, 'house', -1, 0) && !VillageSystem.canPlace(save, 'house', VILLAGE_COLS - 1, 0) && !VillageSystem.canPlace(save, 'house', 0, VILLAGE_ROWS - 1), 'cannot stick out of the map');
ok(VillageSystem.canPlace(save, 'house', 0, 0) && VillageSystem.canPlace(save, 'house', VILLAGE_COLS - 2, VILLAGE_ROWS - 2), 'the corners are free');
ok(!VillageSystem.canPlace(save, 'house', shop.x + 1, shop.y + 1) && VillageSystem.canPlace(save, 'house', shop.x + 2, shop.y), 'touching is fine, overlapping is not');
ok(VillageSystem.canPlace(save, 'shop', shop.x, shop.y, shop.id), 'a building does not block itself');
const spot = VillageSystem.findSpot(save, 'house', castle.x, castle.y)!;
ok(spot && VillageSystem.canPlace(save, 'house', spot.x, spot.y), `findSpot gives a free place near (${spot.x},${spot.y})`);

// ---- building: limits, cost, builders, timers
save.gold = new BigNumber(1, 9).toJSON();
ok(VillageSystem.checkBuild(save, 'shop', 0, 0) !== null && VillageSystem.checkBuild(save, 'shop', 0, 0)!.includes('城をLv2'), 'a second shop needs castle Lv2');
ok(VillageSystem.checkBuild(save, 'market', 0, 0)!.includes('城をLv3'), 'a market needs castle Lv3');
ok(VillageSystem.checkBuild(save, 'castle', 0, 0) !== null, 'the castle cannot be built');
const goldBefore = SaveSystem.getGold(save);
const matsBefore = mats(save);
const h1 = VillageSystem.build(save, 'house', 0, 0, t0);
ok(!!h1 && h1.level === 0 && h1.upgrade?.seconds === 180, 'a house starts at level 0 with 180s of work');
const expectedCost = base.mul(2);
ok(goldBefore.sub(SaveSystem.getGold(save)).div(expectedCost).toNumber() > 0.999 && goldBefore.sub(SaveSystem.getGold(save)).div(expectedCost).toNumber() < 1.001, 'the house cost 2 hours of base gold');
ok(matsBefore === '100/0/60' && mats(save) === '80/0/60', `and 20 wood (${matsBefore} -> ${mats(save)})`);
ok(incomeMultiplier(save, t0) === 1, 'a house under construction adds nothing');
const h2 = VillageSystem.build(save, 'house', 2, 0, t0);
ok(!!h2 && busyBuilders(save, t0) === 2, 'two builders busy');
ok(mats(save) === '60/0/60', 'the second house took 20 more wood');
ok(VillageSystem.checkUpgrade(save, save.village.buildings.find((x) => x.kind === 'shop')!, t0)!.includes('建築員'), 'no third job while both builders are busy');
const goldRefused = SaveSystem.getGold(save).toString();
ok(VillageSystem.build(save, 'house', 4, 0, t0) === null && save.village.buildings.length === 4, 'a refused build changes nothing');
ok(goldRefused === SaveSystem.getGold(save).toString() && mats(save) === '60/0/60', 'and takes no gold or materials');
ok(VillageSystem.build(save, 'house', 0, 0, t0 + 1) === null, 'cannot build over a building under construction');
ok(save.missions.daily.counts['village_build'] === 2, 'each job counted for the mission');
// time passes
const t1 = t0 + 200 * 1000; // 200s: houses (180s) are done
ok(busyBuilders(save, t1) === 0 && effectiveLevel(h1!, t1) === 1, 'after 200s the houses count as level 1 (even unsettled)');
ok(Math.abs(incomeMultiplier(save, t1) - 1 * (1 + 0.04)) < 1e-9, `two level-1 houses: x${incomeMultiplier(save, t1)} = 1.04`);
ok(incomeMultiplier(save, t0 - 10 * 1000) === 1, 'a clock set back leaves things as they were');
const settled = VillageSystem.settle(save, t1);
ok(settled.finished.length === 2 && settled.relocated.length === 0 && settled.rebuilt.length === 0 && h1!.level === 1 && !h1!.upgrade, 'settle takes both in');
const again = VillageSystem.settle(save, t1);
ok(again.finished.length + again.relocated.length + again.rebuilt.length === 0, 'settling twice does nothing more');
ok(VillageSystem.secondsLeft(h1!, t1) === 0, 'no time left on a settled building');
// idle uses it
const p = IdleSystem.perHour(save, t1).gold;
ok(Math.abs(p.div(base).toNumber() - 1.04) < 1e-9, 'idle gold per hour follows the multiplier (x1.04)');
save.idle.lastClaimAt = t1 - 2 * HOUR;
const prev = IdleSystem.preview(save, t1);
ok(Math.abs(prev.gold.div(base).toNumber() - 2.08) < 1e-6, 'two hours piled pay 2.08 base hours');
ok(prev.materials.wood === 28 && prev.materials.iron === 12 && prev.materials.stone === 40, 'and two hours of materials (region 0: 14/6/20 an hour)');
const before = mats(save);
IdleSystem.claim(save, t1, () => 0.99);
ok(before === '60/0/60' && mats(save) === '88/12/100', `claiming adds them to the village (${before} -> ${mats(save)})`);

// ---- upgrading
const shopB = save.village.buildings.find((b) => b.kind === 'shop')!;
ok(VillageSystem.checkUpgrade(save, shopB, t1) === null, 'the starter shop can go to Lv2 (needs castle 1)');
ok(VillageSystem.upgrade(save, shopB, t1) && shopB.upgrade?.seconds === 600 && shopB.level === 1, 'upgrade starts 600s of work, level stays 1 meanwhile');
ok(mats(save) === '28/12/80', 'shop Lv2 took 60 wood and 20 stone');
ok(VillageSystem.checkUpgrade(save, shopB, t1 + 1000) === '作業中です', 'cannot start it twice');
ok(incomeMultiplier(save, t1 + 1000) === incomeMultiplier(save, t1), 'income unchanged while it is being worked on');
const t2 = t1 + 601 * 1000;
ok(Math.abs(incomeMultiplier(save, t2) - 1.4 * 1.04) < 1e-9, 'after the work: shop Lv2 x house bonus');
const after = VillageSystem.incomeAfter(save, shopB, t2);
ok(Math.abs(after.now - 1.4 * 1.04) < 1e-9 && Math.abs(after.after - 1.9 * 1.04) < 1e-9, 'incomeAfter shows Lv2 -> Lv3 gain');
ok(VillageSystem.checkUpgrade(save, shopB, t2)!.includes('城をLv2'), 'shop Lv3 needs castle Lv2');
const castleB = save.village.buildings.find((b) => b.kind === 'castle')!;
const noIron = VillageSystem.checkUpgrade(save, castleB, t2);
ok(noIron === '木材・鉄・石が足りません' || (noIron !== null && noIron.includes('足りません') && noIron.includes('鉄')), `the castle is held back by what is short: ${noIron}`);
ok(!VillageSystem.upgrade(save, castleB, t2) && mats(save) === '28/12/80' && !castleB.upgrade, 'and a short upgrade takes nothing');
SaveSystem.addMaterials(save, RICH);
ok(VillageSystem.upgrade(save, castleB, t2) && castleB.upgrade?.seconds === 3600, 'castle Lv2 starts (1h) once there is enough');
ok(VillageSystem.upgrade(save, shopB, t2) === false, 'the shop is still gated while the castle is mid-upgrade');
const t3 = t2 + 3601 * 1000;
ok(castleLevel(save, t3) === 2 && VillageSystem.maxCount(save, 'shop', t3) === 2, 'castle Lv2 allows two shops');
const free = VillageSystem.findSpot(save, 'shop', 0, 0)!;
ok(VillageSystem.checkBuild(save, 'shop', free.x, free.y, t3) === null, 'and a second shop can now be built');
ok(VillageSystem.upgrade(save, shopB, t3), 'shop Lv3 can start');
ok(effectiveLevel(castleB, t3) === 2 && castleB.level === 1 || castleB.level === 2, 'castle level reads right before and after settling');

// ---- not enough gold, not enough materials
const poor = fresh();
poor.gold = new BigNumber(0, 0).toJSON();
ok(VillageSystem.checkBuild(poor, 'house', 0, 0) === 'ゴールドが足りません', 'no gold: no building');
ok(VillageSystem.upgrade(poor, poor.village.buildings.find((b) => b.kind === 'shop')!) === false, 'no gold: no upgrade');
const bare = fresh();
bare.gold = new BigNumber(1, 9).toJSON();
bare.village.materials = { wood: 19, iron: 0, stone: 0 };
ok(VillageSystem.checkBuild(bare, 'house', 0, 0) === '木材が足りません', 'gold but 19 wood: "木材が足りません"');
const gBare = SaveSystem.getGold(bare).toString();
ok(VillageSystem.build(bare, 'house', 0, 0, t0) === null && SaveSystem.getGold(bare).toString() === gBare && mats(bare) === '19/0/0' && bare.village.buildings.length === 2, 'and nothing is paid or built');
bare.village.materials.wood = 20;
ok(VillageSystem.build(bare, 'house', 0, 0, t0) !== null && mats(bare) === '0/0/0', 'with exactly 20 wood it goes through');
ok(!VillageSystem.hasJob(poor, t0), 'hasJob is false when nothing can be afforded');

// ---- moving: taken down where it stands, then put up again at the new place
const tm = 1_800_100_000_000;
const mv = fresh();
mv.gold = new BigNumber(1, 9).toJSON();
SaveSystem.addMaterials(mv, RICH);
const mCastle = mv.village.buildings.find((b) => b.kind === 'castle')!;
const mShop = mv.village.buildings.find((b) => b.kind === 'shop')!;
const mHouse = VillageSystem.build(mv, 'house', 0, 0, tm)!;
const tm1 = tm + 200 * 1000;
VillageSystem.settle(mv, tm1);
ok(VillageSystem.checkMoveStart(mv, mCastle, tm1)!.includes('動かせません') && !getBuilding('castle').movable, 'the castle cannot be moved');
ok(VillageSystem.checkMoveStart(mv, mHouse, tm1) === null && VillageSystem.checkMoveStart(mv, mShop, tm1) === null, 'a house and a shop can');
const times = VillageSystem.moveTimes(mHouse, tm1);
ok(times.demolish === 45 && times.rebuild === 90, `a Lv1 house (180s) takes 45s down and 90s up (${formatSpanExact(times.demolish)} / ${formatSpanExact(times.rebuild)})`);
ok(VillageSystem.moveTimes(mShop, tm1).demolish === 75 && VillageSystem.moveTimes(mShop, tm1).rebuild === 150, 'a Lv1 shop (300s): 75s and 150s');
ok(Math.min(times.demolish, times.rebuild) >= MOVE_MIN_SECONDS, 'never under the minimum');
ok(VillageSystem.checkMove(mv, mHouse, mHouse.x, mHouse.y, tm1) === '今と同じ場所です', 'moving to where it stands is refused');
ok(VillageSystem.checkMove(mv, mHouse, mCastle.x + 1, mCastle.y + 1, tm1) === 'ここには置けません', 'and onto the castle');
ok(VillageSystem.checkMove(mv, mHouse, -2, 0, tm1) === 'ここには置けません', 'and off the map');
ok(VillageSystem.checkMove(mv, mHouse, 1, 0, tm1) === null, 'but a step onto its own old tiles is fine');
const gMv = SaveSystem.getGold(mv).toString();
const mMats = mats(mv);
ok(VillageSystem.incomeAfter(mv, mHouse, tm1).now > 1.019, 'a house is paying (x1.02) before the move');
ok(!VillageSystem.startMove(mv, mHouse, mHouse.x, mHouse.y, tm1) && !mHouse.move, 'a refused move changes nothing');
ok(VillageSystem.startMove(mv, mHouse, 10, 0, tm1) && !!mHouse.move, 'the move starts');
ok(SaveSystem.getGold(mv).toString() === gMv && mats(mv) === mMats, 'and costs no gold and no materials');
ok(mHouse.level === 1 && mHouse.x === 0 && mHouse.y === 0, 'it keeps its level and, for now, stays where it is');
const tA = tm1 + 10 * 1000; // 10s in: still being taken down
ok(movePhase(mHouse, tA) === 'demolish' && isMoving(mHouse, tA) && busyBuilders(mv, tA) === 1, 'ten seconds in: being taken down, one builder busy');
ok(incomeMultiplier(mv, tA) === 1 && levelValue(mHouse, tA) === 0, 'and it adds nothing meanwhile');
const wA = VillageSystem.work(mHouse, tA)!;
ok(wA.kind === 'demolish' && wA.left === 35 && wA.totalLeft === 125 && wA.seconds === 45, `work: 解体, 35s left of this part, 125s in all`);
ok(footprints(mHouse, tA).length === 2, 'both its old place and its new place are taken');
ok(!VillageSystem.canPlace(mv, 'house', 0, 0, undefined, tA) && !VillageSystem.canPlace(mv, 'house', 10, 0, undefined, tA), 'nothing else can be put on either');
ok(VillageSystem.canPlace(mv, 'house', 10, 0, mHouse.id, tA), 'the house itself can still be asked about its new place');
ok(VillageSystem.checkUpgrade(mv, mHouse, tA) === '作業中です' && VillageSystem.checkMoveStart(mv, mHouse, tA) === '作業中です', 'it cannot be strengthened or moved again meanwhile');
ok(VillageSystem.summary(mv, tA).busy === 1, 'the summary counts it as work under way');
const tB = tm1 + 50 * 1000; // 50s in: taken down (45s), being put up
ok(movePhase(mHouse, tB) === 'rebuild' && VillageSystem.work(mHouse, tB)!.kind === 'rebuild' && VillageSystem.work(mHouse, tB)!.left === 85, 'after 45s it is being put up: 85s left of that');
ok(footprints(mHouse, tB).length === 1 && footprints(mHouse, tB)[0].x === 10, 'only the new place is taken now');
ok(VillageSystem.canPlace(mv, 'house', 0, 0, undefined, tB), 'the old place is free for something else');
const s1 = VillageSystem.settle(mv, tB);
ok(s1.relocated.length === 1 && s1.rebuilt.length === 0 && mHouse.x === 10 && mHouse.y === 0 && !!mHouse.move, 'settling now puts it at the new place, still being put up');
ok(VillageSystem.settle(mv, tB).relocated.length === 0, 'and only once');
ok(busyBuilders(mv, tB) === 1 && incomeMultiplier(mv, tB) === 1, 'the builder stays on it, and it still earns nothing');
const tC = tm1 + 140 * 1000; // past 45 + 90 = 135s
ok(!isMoving(mHouse, tC) && isMoveDone(mHouse, tC) && busyBuilders(mv, tC) === 0, 'after 135s the move is over (read from the clock, before anything settles it)');
ok(Math.abs(incomeMultiplier(mv, tC) - 1.02) < 1e-9, 'and the house is paying again (x1.02)');
const s2 = VillageSystem.settle(mv, tC);
ok(s2.rebuilt.length === 1 && !mHouse.move && mHouse.level === 1 && mHouse.x === 10, 'settle closes the move: same level, new place');
ok(movePhase(mHouse, tC) === null && VillageSystem.work(mHouse, tC) === null, 'nothing left to do on it');
// a move that was never settled while the player was away
const away = fresh();
away.gold = new BigNumber(1, 9).toJSON();
SaveSystem.addMaterials(away, RICH);
const aHouse = VillageSystem.build(away, 'house', 0, 0, tm)!;
VillageSystem.settle(away, tm1);
VillageSystem.startMove(away, aHouse, 10, 0, tm1);
ok(Math.abs(incomeMultiplier(away, tm1 + 3 * HOUR) - 1.02) < 1e-9 && footprints(aHouse, tm1 + 3 * HOUR)[0].x === 10, 'three hours later, unopened: it counts at the new place and pays');
const awayDone = VillageSystem.settle(away, tm1 + 3 * HOUR);
ok(awayDone.relocated.length === 1 && awayDone.rebuilt.length === 1 && aHouse.x === 10 && !aHouse.move, 'and one settle takes in both parts');
ok(movePhase(aHouse, tm1 - 5000) === null, 'a finished move stays finished');
const back = fresh();
back.gold = new BigNumber(1, 9).toJSON();
SaveSystem.addMaterials(back, RICH);
const bHouse = VillageSystem.build(back, 'house', 0, 0, tm)!;
VillageSystem.settle(back, tm1);
VillageSystem.startMove(back, bHouse, 10, 0, tm1);
ok(movePhase(bHouse, tm1 - 60_000) === 'demolish' && VillageSystem.work(bHouse, tm1 - 60_000)!.left === 45, 'a clock set back only delays it (it counts as just started)');
// builders
const bl = fresh();
bl.gold = new BigNumber(1, 9).toJSON();
SaveSystem.addMaterials(bl, RICH);
const l1 = VillageSystem.build(bl, 'house', 0, 0, tm)!;
const l2 = VillageSystem.build(bl, 'house', 2, 0, tm)!;
VillageSystem.settle(bl, tm1);
ok(VillageSystem.startMove(bl, l1, 10, 0, tm1), 'one house is moved');
ok(VillageSystem.upgrade(bl, bl.village.buildings.find((b) => b.kind === 'shop')!, tm1), 'the shop is strengthened');
ok(busyBuilders(bl, tm1) === 2 && VillageSystem.checkMoveStart(bl, l2, tm1)!.includes('建築員'), 'both builders are busy: the other house cannot be moved');
ok(!VillageSystem.hasJob(bl, tm1), 'and hasJob is false: nothing can be started while both are busy');
// a building that is not finished cannot be moved
const raw = fresh();
raw.gold = new BigNumber(1, 9).toJSON();
SaveSystem.addMaterials(raw, RICH);
const rawHouse = VillageSystem.build(raw, 'house', 0, 0, tm)!;
ok(VillageSystem.checkMoveStart(raw, rawHouse, tm + 1000) === '作業中です', 'a building under construction cannot be moved');

// ---- saved and loaded (storage round trip needs localStorage: a small stub)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
const rt = fresh();
VillageSystem.build(rt, 'house', 0, 0, t0);
rt.gold = new BigNumber(1, 30).toJSON();
VillageSystem.build(rt, 'house', 0, 0, t0);
SaveSystem.save(rt);
const loaded = SaveSystem.load();
ok(loaded.village.buildings.length === rt.village.buildings.length && loaded.village.nextId === rt.village.nextId, 'a saved village loads back');
const house = loaded.village.buildings.find((b) => b.kind === 'house');
ok(!!house && house.level === 0 && house.upgrade?.seconds === 180, 'including work under way');
ok(mats(loaded) === mats(rt), `and its materials (${mats(loaded)})`);
SaveSystem.save(mv);
const lm = SaveSystem.load();
ok(mats(lm) === mats(mv), 'a village with materials left over loads back with them');
// a move under way survives a save
const mid = fresh();
mid.gold = new BigNumber(1, 9).toJSON();
SaveSystem.addMaterials(mid, RICH);
const midHouse = VillageSystem.build(mid, 'house', 0, 0, tm)!;
VillageSystem.settle(mid, tm1);
VillageSystem.startMove(mid, midHouse, 10, 0, tm1);
SaveSystem.save(mid);
const lmid = SaveSystem.load();
const lh = lmid.village.buildings.find((b) => b.id === midHouse.id)!;
ok(!!lh.move && lh.move.toX === 10 && lh.move.toY === 0 && lh.move.demolish === 45 && lh.move.rebuild === 90 && lh.move.startedAt === tm1 && lh.level === 1, 'a move under way loads back as it was');

// damaged / old saves
function load(rawSave: unknown): SaveData { store.set('abyrus_save_v1', JSON.stringify(rawSave)); return SaveSystem.load(); }
const base0 = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
const noVillage = { ...base0 }; delete (noVillage as Record<string, unknown>).village;
const lv1 = load(noVillage);
ok(lv1.village.buildings.length === 2 && lv1.village.buildings.some((b) => b.kind === 'castle') && lv1.village.buildings.some((b) => b.kind === 'shop'), 'an old save (no village) is given the starter village');
ok(mats(lv1) === '100/0/60', 'with the starting materials');
const oldVillage = load({ ...base0, village: { buildings: [{ id: 'b1', kind: 'castle', x: 7, y: 6, level: 1 }], nextId: 2 } });
ok(mats(oldVillage) === '100/0/60' && oldVillage.village.buildings.length === 1, 'a village saved before materials existed keeps its buildings and is given the starting materials');
const oddMats = load({ ...base0, village: { buildings: [{ id: 'b1', kind: 'castle', x: 7, y: 6, level: 1 }], nextId: 2, materials: { wood: -5, iron: 'x', stone: 12.7 } } });
ok(mats(oddMats) === '0/0/12', `odd material counts are cleaned up (${mats(oddMats)})`);
const lv2 = load({ ...base0, village: { buildings: [{ id: 'b1', kind: 'castle', x: 99, y: -4, level: 99 }, { id: 'b1', kind: 'shop', x: 1, y: 1, level: 1 }, { id: 'b3', kind: 'tower', x: 1, y: 1, level: 1 }, { id: 'b4', kind: 'house', x: 2, y: 2, level: 0 }, { id: 'b5', kind: 'house', x: 2, y: 2, level: 0, upgrade: { startedAt: 5, seconds: 60 } }, 'junk', null], nextId: 'x' } });
const castleL = lv2.village.buildings.find((b) => b.kind === 'castle')!;
ok(castleL.x === VILLAGE_COLS - 4 && castleL.y === 0 && castleL.level === 6, 'out-of-range position and level are pulled back in');
ok(lv2.village.buildings.length === 2, 'duplicate ids, unknown kinds, empty plots and junk are dropped');
ok(lv2.village.nextId >= 6, 'nextId stays above every id in use');
const lv3 = load({ ...base0, village: { buildings: [{ id: 'b1', kind: 'shop', x: 1, y: 1, level: 1 }], nextId: 2 } });
ok(lv3.village.buildings.length === 2 && lv3.village.buildings.some((b) => b.kind === 'castle'), 'a village without a castle is replaced by a new one');
const move = (m: unknown) => ({ id: 'b2', kind: 'house', x: 0, y: 0, level: 1, move: m });
const castleRaw = { id: 'b1', kind: 'castle', x: 7, y: 6, level: 1 };
const lv4 = load({ ...base0, village: { buildings: [castleRaw, move({ startedAt: 'x', demolish: 1, rebuild: 1, toX: 1, toY: 1 })], nextId: 3 } });
ok(!lv4.village.buildings.find((b) => b.id === 'b2')!.move, 'a move with junk in it is dropped (the building stays)');
const lv5 = load({ ...base0, village: { buildings: [castleRaw, move({ startedAt: tm1, demolish: 45, rebuild: 90, toX: 99, toY: -9 })], nextId: 3 } });
const m5 = lv5.village.buildings.find((b) => b.id === 'b2')!.move!;
ok(m5.toX === VILLAGE_COLS - 2 && m5.toY === 0, 'a move to somewhere off the map is pulled back onto it');
const lv6 = load({ ...base0, village: { buildings: [{ ...castleRaw, move: { startedAt: tm1, demolish: 1, rebuild: 1, toX: 1, toY: 1 } }], nextId: 2 } });
ok(!lv6.village.buildings.find((b) => b.kind === 'castle')!.move, 'the castle has no move');
const lv7 = load({ ...base0, village: { buildings: [castleRaw, { ...move({ startedAt: tm1, demolish: 1, rebuild: 1, toX: 1, toY: 1 }), upgrade: { startedAt: tm1, seconds: 60 } }], nextId: 3 } });
const b7 = lv7.village.buildings.find((b) => b.id === 'b2')!;
ok(!b7.move && !!b7.upgrade, 'a building cannot be strengthened and moved at once: the move is dropped');

// ---- where the materials come from
// stage drops
const stageRegion0 = { kind: 'main' as const, index: 0 };
const bossRegion0 = { kind: 'main' as const, index: 29 };
const everything = StageRewardSystem.roll(stageRegion0, false, 100, () => 0);
ok(everything.materials.wood === 5 && everything.materials.stone === 6 && everything.materials.iron === 2, `a stage of region 0 can drop 5 wood, 6 stone, 2 iron (${JSON.stringify(everything.materials)})`);
const nothing = StageRewardSystem.roll(stageRegion0, false, 100, () => 0.999);
ok(Object.keys(nothing.materials).length === 0, 'and drops none on a bad roll');
const boss = StageRewardSystem.roll(bossRegion0, false, 100, () => 0);
ok(boss.materials.wood! > everything.materials.wood! && boss.materials.wood! % 5 === 0, `a region's last stage pays the boss multiple (${boss.materials.wood} wood)`);
const region3 = StageRewardSystem.roll({ kind: 'main', index: 95 }, false, 100, () => 0);
ok(region3.materials.wood === 20 && region3.materials.iron === 10, 'a later region pays more');
const gs = fresh();
StageRewardSystem.grant(gs, everything);
ok(mats(gs) === '105/2/66', `grant puts them in the village's store (${mats(gs)})`);
// weekday dungeons
const forge = WeekdayDungeonSystem.bonus(2, 0);
ok(forge.materials.iron === 40 && forge.materials.wood === undefined, '火曜 鍛冶の坑道 (初級) pays 40 iron');
const sunday = WeekdayDungeonSystem.bonus(0, 3);
ok(sunday.materials.wood === 1000 && sunday.materials.stone === 640 && sunday.materials.iron === 400, '日曜 安息の祭壇 (超級) pays all three (doubled with the harder 超級)');
const wd = fresh();
StageRewardSystem.grant(wd, sunday);
ok(mats(wd) === '1100/400/700', `and grant adds them (${mats(wd)})`);
ok(WeekdayDungeonSystem.preview(0, 3).every((r) => r.type !== ('wood' as string)), 'the dungeon preview does not list them (only the village shows materials)');
// idle at a later stage
const late = fresh();
late.stageProgress = 130;
const lateRate = IdleSystem.perHour(late).materials;
ok(lateRate.wood === 74 && lateRate.iron === 42 && lateRate.stone === 112, 'idle at region 4 pays 74/42/112 an hour');
late.idle.lastClaimAt = t0 - 100 * HOUR;
const lateClaim = IdleSystem.claim(late, t0, () => 0.99);
ok(lateClaim.preview.materials.wood === 74 * 12 && SaveSystem.getMaterial(late, 'wood') === 100 + 74 * 12, 'a claim pays at most the cap (12 hours) of materials');


{
// =====================================================================================================
// Everything added after the first version: 採集施設, 防衛, 襲撃, 行商人・宝箱, 村の依頼, 魔晶石, 修理, 遠征の素材
// =====================================================================================================
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rich(at = t0): SaveData {
  const s = fresh(at);
  s.gold = new BigNumber(1, 12).toJSON();
  SaveSystem.addMaterials(s, RICH);
  s.gems = 5000;
  return s;
}
function addBuilding(s: SaveData, kind: string, x: number, y: number, level: number): PlacedBuildingT {
  const b = { id: `b${s.village.nextId}`, kind: kind as PlacedBuildingT['kind'], x, y, level } as PlacedBuildingT;
  s.village.nextId += 1;
  s.village.buildings.push(b);
  return b;
}

// ---- data
ok(BUILDINGS.length === 14 && BUILDINGS.map((b) => b.kind).join() === 'castle,shop,market,house,lumber,quarry,mine,fence,gate,tree,flowers,fountain,statue,road', 'fourteen kinds: 城, 店, 市場, 民家, 伐採所, 採石場, 鉱山, 柵, 門, 装飾 4 and 道');
ok(['lumber', 'quarry', 'mine'].every((k) => !!getBuilding(k as never).produces && getBuilding(k as never).tab === 'gather'), 'the three gathering buildings produce a material each, on the 採集 tab');
ok(['lumber', 'quarry', 'mine'].map((k) => getBuilding(k as never).produces).join() === 'wood,stone,iron', '伐採所 = 木材, 採石場 = 石, 鉱山 = 鉄');
ok(['fence', 'gate'].every((k) => getBuilding(k as never).defense === true && getBuilding(k as never).tab === 'defend'), '柵 and 門 are defense, on the 防衛 tab');
ok(BUILDINGS.filter((b) => b.buildable).every((b) => b.tab === undefined || ['trade', 'gather', 'defend', 'decor'].includes(b.tab)), 'every tab is a known one');
ok(BUILDINGS.every((b) => b.maxCount.length === 6 && b.maxCount.every((n, i, a) => i === 0 || n >= a[i - 1])), 'counts never fall as the castle rises (new kinds too)');
ok(getBuilding('mine').maxCount[0] === 0 && getBuilding('gate').maxCount[0] === 0 && getBuilding('lumber').maxCount[0] >= 1 && getBuilding('fence').maxCount[0] >= 4, 'mine and gate wait for castle Lv2; lumber, quarry and fences are there from the start');
ok(RAID_POWER.length === 5 && RAID_POWER.every((p, i, a) => i === 0 || p > a[i - 1]), 'raids get stronger with every region');
const maxFenceGate = (castle: number): number => getBuilding('fence').maxCount[castle - 1] * getBuilding('fence').levels[castle - 1].value + getBuilding('gate').maxCount[castle - 1] * getBuilding('gate').levels[castle - 1].value;
ok(maxFenceGate(6) > RAID_POWER[4], `a fully built village (城Lv6: ${maxFenceGate(6)}) can turn away the strongest raid (${RAID_POWER[4]})`);
ok(getBuilding('fence').maxCount[0] * getBuilding('fence').levels[0].value < RAID_POWER[0], 'but the starter fences alone cannot: there is something to do');
ok(EXTRA_BUILDER_GEMS.length === 2 && EXTRA_BUILDER_GEMS[1] > EXTRA_BUILDER_GEMS[0], 'two extra builders can be bought, the second dearer');
ok(RAID_REWARD_MATERIALS.length === 5 && Object.keys(WANDERERS).length === 2 && WANDERERS.chest.materials.length === 5, 'raid and wanderer pay-outs are set for each region');
ok(VILLAGE_QUESTS.length >= 5 && VILLAGE_QUESTS.every((q) => q.target >= 1 && Object.values(q.reward).some((n) => (n ?? 0) > 0)) && QUEST_REGION_MULTIPLIER.length === 5, 'the chores pay materials, scaled by region');
ok(EXPEDITIONS.every((e) => !!e.materials && Object.values(e.materials).some((n) => (n ?? 0) > 0)), 'every expedition brings some materials home');
ok(STAGE_ITEM_DROPS_OK(), 'stone drops more often than wood now');
function STAGE_ITEM_DROPS_OK(): boolean {
  const by = (m: string) => VILLAGE_STAGE_DROPS.find((d) => d.material === m)!;
  return by('stone').chance > by('wood').chance && by('stone').amounts[0] >= by('wood').amounts[0];
}
ok(IDLE_VILLAGE_MATERIALS_PER_HOUR[0].stone > IDLE_VILLAGE_MATERIALS_PER_HOUR[0].wood, 'idle pays more stone than wood');

// ---- 採集施設
const gs = rich();
ok(VillageSystem.checkBuild(gs, 'mine', 0, 0)!.includes('城をLv2'), 'a mine needs castle Lv2');
const lumber = VillageSystem.build(gs, 'lumber', 0, 0, t0)!;
ok(!!lumber && lumber.level === 0 && lumber.upgrade?.seconds === 240, 'a 伐採所 starts at level 0 with 240s of work');
ok(IdleSystem.materialsPerHour(gs, t0).wood === 14, 'being built, it adds nothing (wood 14 an hour: the base)');
const tg = t0 + 300 * 1000;
VillageSystem.settle(gs, tg, seeded(1));
const rate1 = IdleSystem.materialsPerHour(gs, tg);
ok(rate1.wood === 14 + 6 && rate1.iron === 6 && rate1.stone === 20, `built, it adds 6 wood an hour (${rate1.wood}/${rate1.iron}/${rate1.stone})`);
ok(VillageSystem.checkBuild(gs, 'lumber', 0, 2, tg)!.includes('城をLv2'), 'castle Lv1 allows only one 伐採所');
addBuilding(gs, 'lumber', 0, 2, 1);
ok(IdleSystem.materialsPerHour(gs, tg).wood === 14 + 12, 'two level-1 ones add 12');
gs.idle.lastClaimAt = tg - 3 * HOUR;
const pv = IdleSystem.preview(gs, tg);
ok(pv.materials.wood === (14 + 12) * 3 && pv.materials.stone === 60 && pv.materials.iron === 18, `three hours piled: ${JSON.stringify(pv.materials)}`);
VillageSystem.startMove(gs, lumber, 12, 0, tg);
ok(IdleSystem.materialsPerHour(gs, tg).wood === 14 + 6, 'a gathering building that is being moved adds nothing');
const lumber2 = gs.village.buildings.find((b) => b.kind === 'lumber' && b.id !== lumber.id)!;
lumber2.damaged = true;
ok(IdleSystem.materialsPerHour(gs, tg).wood === 14, 'and neither does a broken one');
const quarry = addBuilding(gs, 'quarry', 0, 5, 3);
ok(IdleSystem.materialsPerHour(gs, tg).stone === 20 + 13, 'a level-3 採石場 adds 13 stone an hour');

// ---- 防衛
const df = rich();
ok(defensePoints(df, t0) === 0, 'a new village has no defense');
const f1 = addBuilding(df, 'fence', 0, 0, 1);
const f2 = addBuilding(df, 'fence', 1, 0, 2);
const gt = addBuilding(df, 'gate', 3, 0, 1);
ok(defensePoints(df, t0) === 1 + 2 + 6, 'fence Lv1 + fence Lv2 + gate Lv1 = 9');
f2.damaged = true;
ok(defensePoints(df, t0) === 1 + 6 && VillageSystem.defense(df, t0) === 7, 'a broken fence adds nothing');
ok(VillageSystem.raidPower(df) === 6, 'a raid at region 0 has power 6');

// ---- 襲撃
const rd = rich();
rd.village.raid.nextAt = t0 + 1 * HOUR;
let r1 = VillageSystem.settle(rd, t0, seeded(2));
ok(!r1.raidArrived && !rd.village.raid.pending && !VillageSystem.attention(rd, t0).raid, 'no raid before its time');
const tr = t0 + HOUR + 1000;
r1 = VillageSystem.settle(rd, tr, seeded(2));
const pend = rd.village.raid.pending!;
ok(r1.raidArrived && !r1.raidSettled && !!pend && pend.power === 6 && pend.region === 0 && pend.expiresAt === t0 + HOUR + RAID_WINDOW_HOURS * HOUR, 'it arrives on time and waits 6 hours');
ok(VillageSystem.attention(rd, tr).raid && settleChanged(r1), 'the village says so');
ok(Math.abs(VillageSystem.raidSecondsLeft(rd, tr) - (RAID_WINDOW_HOURS * 3600 - 1)) <= 1, 'with the time it has left');
const rb = VillageSystem.raidBattle(rd)!;
ok(rb.mode === 'raid' && rb.stageIndex === 0 && typeof rb.seed === 'number', 'the battle is set like a main stage');
rd.stageProgress = 60;
ok(VillageSystem.raidBattle(rd)!.stageIndex === 60 - 1 - RAID_STAGES_BELOW, 'a few stages behind the furthest one cleared');
const rstage = ProgressionSystem.getRaidStage(rb.stageIndex, rb.seed);
ok(rstage.enemies.length >= 3 && rstage.rewardSkillEssence === 0 && rstage.name.includes('襲撃'), `the pack: ${rstage.enemies.length} beasts, "${rstage.name}"`);
ok(ProgressionSystem.getRaidStage(59, 1).regionIndex === 1 && ProgressionSystem.getRaidStage(0, 1).regionIndex === 0, 'beasts of the region the stage lies in');
rd.stageProgress = 0;
const prevGold = SaveSystem.getGold(rd);
const prevMats = mats(rd);
const wonRaid = VillageSystem.winRaid(rd, tr + 5000)!;
ok(!!wonRaid && !rd.village.raid.pending && rd.village.raid.won === 1 && rd.village.raid.nextAt === tr + 5000 + RAID_INTERVAL_HOURS * HOUR, 'beating it clears it and starts the next one\'s clock');
ok(wonRaid.materials.stone === RAID_REWARD_MATERIALS[0].stone && mats(rd) !== prevMats && SaveSystem.getGold(rd).gt(prevGold), 'and pays materials and gold');
ok(Math.abs(wonRaid.gold.div(IdleSystem.baseGoldPerHour(rd)).toNumber() - RAID_REWARD_GOLD_HOURS) < 1e-6, `gold = ${RAID_REWARD_GOLD_HOURS} hours of the idle rate`);
ok(VillageSystem.winRaid(rd, tr + 6000) === null, 'it cannot be won twice');
ok(rd.village.quests.counts['q_raid'] === 1, 'the chore for it is counted');

// a raid nobody answers - walls hold
const wall = rich();
wall.village.raid.nextAt = t0;
addBuilding(wall, 'fence', 0, 0, 2); addBuilding(wall, 'fence', 1, 0, 2); addBuilding(wall, 'fence', 2, 0, 2);
addBuilding(wall, 'house', 4, 0, 1);
VillageSystem.settle(wall, t0 + 1000, seeded(3));
ok(!!wall.village.raid.pending, '(it has come)');
const sWall = VillageSystem.settle(wall, t0 + RAID_WINDOW_HOURS * HOUR + 2000, seeded(3));
ok(sWall.raidSettled && wall.village.raid.report?.outcome === 'repelled' && wall.village.buildings.every((b) => !b.damaged), 'defense 6 against power 6: the walls hold and nothing breaks');
ok(!wall.village.raid.pending && wall.village.raid.nextAt === t0 + RAID_WINDOW_HOURS * HOUR + 2000 + RAID_INTERVAL_HOURS * HOUR, 'the next one is scheduled');
const rep0 = VillageSystem.takeRaidReport(wall);
ok(rep0?.outcome === 'repelled' && VillageSystem.takeRaidReport(wall) === null, 'the report is handed over once');

// a raid nobody answers - no walls
const open = rich();
open.village.raid.nextAt = t0;
addBuilding(open, 'house', 0, 0, 1);
addBuilding(open, 'house', 2, 0, 1);
addBuilding(open, 'house', 4, 0, 1);
const incBefore = incomeMultiplier(open, t0);
VillageSystem.settle(open, t0 + 1000, seeded(4));
const sOpen = VillageSystem.settle(open, t0 + RAID_WINDOW_HOURS * HOUR + 2000, seeded(4));
const broken = open.village.buildings.filter((b) => b.damaged);
ok(sOpen.raidSettled && open.village.raid.report?.outcome === 'damaged' && broken.length === 3 && broken.every((b) => b.kind !== 'castle'), `no walls: three buildings broke (${broken.map((b) => getBuilding(b.kind).name).join('・')})`);
ok(open.village.raid.report!.damaged.length === 3, 'and the report names them');
ok(incomeMultiplier(open, t0 + RAID_WINDOW_HOURS * HOUR + 3000) < incBefore, 'broken buildings no longer pay');
ok(VillageSystem.checkUpgrade(open, broken[0], t0 + RAID_WINDOW_HOURS * HOUR + 3000)!.includes('壊れて') && VillageSystem.checkMoveStart(open, broken[0], t0 + RAID_WINDOW_HOURS * HOUR + 3000)!.includes('壊れて'), 'a broken building can be neither strengthened nor moved');
ok(VillageSystem.attention(open, t0 + RAID_WINDOW_HOURS * HOUR + 3000).broken === 3, 'the village counts them');
// partial defense breaks fewer
const half = rich();
half.village.raid.nextAt = t0;
addBuilding(half, 'fence', 0, 0, 2); addBuilding(half, 'fence', 1, 0, 1);
for (let i = 0; i < 5; i++) addBuilding(half, 'house', i * 2, 3, 1);
VillageSystem.settle(half, t0 + 1000, seeded(5));
VillageSystem.settle(half, t0 + RAID_WINDOW_HOURS * HOUR + 2000, seeded(5));
const brokenHalf = half.village.buildings.filter((b) => b.damaged).length;
ok(brokenHalf === 2, `defense 3 of 6 breaks 2 (${brokenHalf})`);
// long away: it comes and is settled at once
const away2 = rich();
away2.village.raid.nextAt = t0;
const sAway = VillageSystem.settle(away2, t0 + 50 * HOUR, seeded(6));
ok(sAway.raidArrived && sAway.raidSettled && !away2.village.raid.pending && !!away2.village.raid.report && away2.village.raid.nextAt === t0 + 50 * HOUR + RAID_INTERVAL_HOURS * HOUR, 'away for two days: one raid came and was settled; not a pile of them');
// clock set back: it only delays, like all the village's clocks
const back2 = rich();
back2.village.raid.nextAt = t0 + 500 * HOUR;
VillageSystem.settle(back2, t0, seeded(7));
ok(!back2.village.raid.pending && back2.village.raid.nextAt === t0 + 500 * HOUR, 'a clock set back only delays the next raid');
// repair
const rp = rich();
const rpHouse = addBuilding(rp, 'house', 0, 0, 1);
const rpShop = addBuilding(rp, 'shop', 4, 0, 3);
rpHouse.damaged = true;
rpShop.damaged = true;
ok(VillageSystem.repairCost(rpHouse, t0).wood === 6 && VillageSystem.repairCost(rpShop, t0).stone === Math.ceil(80 * 0.3) && VillageSystem.repairCost(rpShop, t0).wood === 45, `repairs cost a third of the level's materials (house: ${JSON.stringify(VillageSystem.repairCost(rpHouse, t0))})`);
const rpMats = mats(rp);
ok(VillageSystem.repair(rp, rpHouse, t0) && !rpHouse.damaged && mats(rp) !== rpMats, 'repairing pays and fixes it at once');
ok(rp.village.quests.counts['q_repair'] === 1 && busyBuilders(rp, t0) === 0, 'the chore counts, and no builder was needed');
ok(VillageSystem.checkRepair(rp, rpHouse, t0) === '壊れていません', 'nothing to repair on a sound building');
rp.village.materials = { wood: 0, iron: 0, stone: 0 };
ok(VillageSystem.checkRepair(rp, rpShop, t0)!.includes('足りません') && !VillageSystem.repair(rp, rpShop, t0) && rpShop.damaged === true, 'short of materials: no repair, nothing taken');

// ---- 行商人 and 宝箱
const wn = rich();
wn.village.wanderers.lastSpawnAt = t0;
const sNone = VillageSystem.settle(wn, t0 + 2 * HOUR, seeded(8));
ok(sNone.spawned.length === 0 && wn.village.wanderers.items.length === 0, 'none before 3 hours are up');
const sOne = VillageSystem.settle(wn, t0 + 3 * HOUR + 1000, seeded(8));
const w1 = wn.village.wanderers.items[0];
ok(sOne.spawned.length === 1 && !!w1 && (w1.kind === 'chest' || w1.kind === 'merchant') && w1.expiresAt === t0 + 3 * HOUR + WANDERER_LIFE_HOURS * HOUR, `one turns up (${w1?.kind}) and stays 12 hours`);
ok(!!w1 && fitsFree(wn, w1.x, w1.y), 'on a tile no building stands on');
function fitsFree(s: SaveData, x: number, y: number): boolean {
  return VillageSystem.canPlace(s, 'fence', x, y, undefined, t0 + 3 * HOUR + 1000);
}
ok(!!w1 && w1.materials.wood! >= 1 && w1.materials.stone! >= 1 && w1.materials.iron! >= 1 && settleChanged(sOne) && VillageSystem.attention(wn, t0 + 3 * HOUR + 2000).wanderers === 1, 'it holds some of each material, and the village says so');
const sMany = VillageSystem.settle(wn, t0 + 100 * HOUR, seeded(9));
ok(wn.village.wanderers.items.length <= WANDERER_MAX && wn.village.wanderers.items.every((w) => w.expiresAt > t0 + 100 * HOUR), `a long absence finds at most ${WANDERER_MAX}, none out of date (${wn.village.wanderers.items.length})`);
ok(wn.village.wanderers.items.length === WANDERER_MAX && sMany.expired.length >= 1 && wn.village.wanderers.lastSpawnAt === t0 + 100 * HOUR, 'back after a long absence the full set is there, the old one left, and the clock was not banked');
const ids = new Set(wn.village.wanderers.items.map((w) => w.id));
ok(ids.size === wn.village.wanderers.items.length, 'each has its own id');
const target = wn.village.wanderers.items[0];
const gWn = SaveSystem.getGold(wn);
const mWn = mats(wn);
const got = VillageSystem.collect(wn, target.id, t0 + 100 * HOUR + 1000)!;
ok(!!got && mats(wn) !== mWn && wn.village.wanderers.items.every((w) => w.id !== target.id), 'opening one gives its materials and removes it');
ok(target.kind === 'merchant' ? SaveSystem.getGold(wn).gt(gWn) : SaveSystem.getGold(wn).toString() === gWn.toString(), target.kind === 'merchant' ? 'a 行商人 pays gold too' : 'a 宝箱 pays no gold');
ok(wn.village.quests.counts['q_collect'] === 1, 'the chore counts');
ok(VillageSystem.collect(wn, target.id, t0 + 100 * HOUR + 2000) === null && VillageSystem.collect(wn, 'nope', t0) === null, 'it cannot be opened twice, or when it is not there');
const tail = wn.village.wanderers.items[0];
ok(!tail || VillageSystem.collect(wn, tail.id, tail.expiresAt + 1) === null, 'one that has left cannot be opened');
const wnBack = rich();
wnBack.village.wanderers.lastSpawnAt = t0 + 500 * HOUR;
VillageSystem.settle(wnBack, t0, seeded(10));
ok(wnBack.village.wanderers.items.length === 0, 'a clock set back only delays the next 行商人');

// ---- 村の依頼
const qs = fresh();
VillageQuests.record(qs, 'build', 1, t0);
ok(VillageQuests.count(qs, VILLAGE_QUESTS.find((q) => q.id === 'q_build1')!, t0) === 1 && VillageQuests.count(qs, VILLAGE_QUESTS.find((q) => q.id === 'q_build3')!, t0) === 1, 'a build counts toward both build chores');
ok(VillageQuests.claimable(qs, t0).map((q) => q.id).join() === 'q_build1', 'only the one-off is ready');
const qMats = mats(qs);
const qr = VillageQuests.claim(qs, 'q_build1', t0)!;
ok(!!qr && qr.wood === 30 && qr.stone === 40 && mats(qs) !== qMats, 'collecting pays 30 wood and 40 stone at the first region');
ok(VillageQuests.claim(qs, 'q_build1', t0) === null && VillageQuests.claim(qs, 'q_build3', t0) === null && VillageQuests.claim(qs, 'zzz', t0) === null, 'not twice, not before it is done, not a chore that does not exist');
VillageQuests.record(qs, 'build', 5, t0);
ok(VillageQuests.count(qs, VILLAGE_QUESTS.find((q) => q.id === 'q_build3')!, t0) === 3, 'counts stop at the target');
const tomorrow = t0 + 25 * HOUR;
ok(VillageQuests.count(qs, VILLAGE_QUESTS.find((q) => q.id === 'q_build3')!, tomorrow) === 0 && !VillageQuests.isClaimed(qs, VILLAGE_QUESTS[0], tomorrow) && VillageQuests.claimable(qs, tomorrow).length === 0, 'the next day starts over (reading it changes nothing)');
VillageQuests.record(qs, 'claim', 1, tomorrow);
ok(qs.village.quests.day !== '' && qs.village.quests.claimed.length === 0 && VillageQuests.claimable(qs, tomorrow).map((q) => q.id).join() === 'q_claim', 'recording it resets the list');
const farQs = fresh();
farQs.stageProgress = 130;
ok(VillageQuests.reward(farQs, VILLAGE_QUESTS[0]).wood === 180, 'a later region pays six times as much (wood 30 -> 180)');
const qb = rich();
VillageSystem.build(qb, 'house', 0, 0, t0);
ok(qb.village.quests.counts['q_build1'] === 1, 'building through the system counts');
const qb2 = rich();
VillageSystem.settle(qb2, t0 + 1000, seeded(11));
qb2.idle.lastClaimAt = t0 - 2 * HOUR;
IdleSystem.claim(qb2, t0 + 1000, () => 0.99);
ok(qb2.village.quests.counts['q_claim'] === 1, 'claiming 放置報酬 counts, wherever it is claimed from');

// ---- 魔晶石: hurrying, and builders
const gm = rich();
const gmHouse = VillageSystem.build(gm, 'house', 0, 0, t0)!;
ok(VillageSystem.finishCost(gmHouse, t0) === 2, '3 minutes left: one lot of 10 minutes = 2 魔晶石');
const gmCastle = gm.village.buildings.find((b) => b.kind === 'castle')!;
VillageSystem.upgrade(gm, gmCastle, t0);
ok(VillageSystem.finishCost(gmCastle, t0) === 6 * 2, 'an hour left: 6 lots = 12');
ok(VillageSystem.finishCost(gmCastle, t0 + 1800 * 1000) === 3 * 2, 'less as it runs down');
const gemsBefore = gm.gems;
ok(VillageSystem.finishNow(gm, gmHouse, t0 + 1000) && gm.gems === gemsBefore - 2 && gmHouse.level === 1 && !gmHouse.upgrade, 'finishing pays 魔晶石 and completes it at once');
ok(busyBuilders(gm, t0 + 1000) === 1, 'the builder is free again');
ok(VillageSystem.checkFinish(gm, gmHouse, t0 + 1000) === '作業中ではありません', 'nothing to finish on a finished building');
gm.gems = 1;
ok(VillageSystem.checkFinish(gm, gmCastle, t0 + 1000) === '魔晶石が足りません' && !VillageSystem.finishNow(gm, gmCastle, t0 + 1000) && gm.gems === 1 && !!gmCastle.upgrade, 'short of 魔晶石: nothing happens');
gm.gems = 100;
ok(VillageSystem.finishNow(gm, gmCastle, t0 + 2000) && castleLevel(gm, t0 + 2000) === 2, 'the castle can be hurried too');
const gmMove = rich();
const gmH = VillageSystem.build(gmMove, 'house', 0, 0, t0)!;
VillageSystem.settle(gmMove, t0 + 200 * 1000, seeded(12));
VillageSystem.startMove(gmMove, gmH, 10, 0, t0 + 200 * 1000);
ok(VillageSystem.finishCost(gmH, t0 + 200 * 1000) === 2 * Math.ceil(135 / 600) && VillageSystem.finishNow(gmMove, gmH, t0 + 201 * 1000) && gmH.x === 10 && !gmH.move, 'hurrying a move finishes both parts: it stands at the new place');
ok(VillageSystem.finishCost({ ...gmH, upgrade: { startedAt: t0, seconds: 10 * 24 * 3600 } }, t0) === FINISH_GEMS_MAX, 'the price is capped');
const bd = rich();
ok(builderCount(bd, t0) === 2 && VillageSystem.nextBuilderGems(bd) === 300, 'two builders, the first extra costs 300');
bd.gems = 299;
ok(VillageSystem.checkBuyBuilder(bd) === '魔晶石が足りません' && !VillageSystem.buyBuilder(bd) && builderCount(bd, t0) === 2, 'short: nothing bought');
bd.gems = 2000;
ok(VillageSystem.buyBuilder(bd) && bd.gems === 1700 && builderCount(bd, t0) === 3 && VillageSystem.nextBuilderGems(bd) === 800, 'one more builder; the next costs 800');
ok(VillageSystem.buyBuilder(bd) && builderCount(bd, t0) === 4 && VillageSystem.nextBuilderGems(bd) === null, 'and a second');
ok(VillageSystem.checkBuyBuilder(bd) === 'これ以上は増やせません' && !VillageSystem.buyBuilder(bd) && bd.gems === 900, 'no third');
ok(builderCount(bd, t0) === VILLAGE_BUILDERS[0] + 2, 'they add to what the castle gives');

// ---- 遠征の素材
const ex = rich();
const forest = getExpedition('forest-patrol')!;
ok(ExpeditionSystem.scaledMaterials(forest, 1).wood === 40 && ExpeditionSystem.scaledMaterials(forest, 1.5).wood === 60 && ExpeditionSystem.scaledMaterials(forest, 1).iron === undefined, 'a trip brings its materials, raised by the bonus, none of the ones it does not');
ex.expeditions.slots[0] = { id: 'forest-patrol', heroIds: [], startedAt: t0 - 5 * HOUR, bonus: 1.5 };
const exBefore = mats(ex);
const exWood = SaveSystem.getMaterial(ex, 'wood');
const exStone = SaveSystem.getMaterial(ex, 'stone');
const exClaim = ExpeditionSystem.claim(ex, 0, t0, () => 0.5);
ok(!!exClaim && SaveSystem.getMaterial(ex, 'wood') === exWood + 60 && SaveSystem.getMaterial(ex, 'stone') === exStone + 30 && mats(ex) !== exBefore, 'coming home puts them in the village store');
ok(exClaim!.granted.every((g) => (g.reward.type as string) !== 'wood'), 'and the trip\'s own list of rewards does not show them');

// ---- saved and loaded
const sv = rich();
sv.village.raid.pending = { arrivedAt: t0, expiresAt: t0 + 6 * HOUR, power: 18, region: 1 };
sv.village.raid.report = { at: t0, outcome: 'damaged', damaged: ['商店'] };
sv.village.raid.won = 4;
sv.village.extraBuilders = 1;
sv.village.wanderers = { lastSpawnAt: t0, items: [{ id: 'w9', kind: 'chest', x: 3, y: 4, expiresAt: t0 + HOUR, materials: { wood: 5, stone: 6, iron: 7 }, goldHours: 0 }] };
sv.village.quests = { day: '2027-01-15', counts: { q_build1: 1 }, claimed: ['q_build1'] };
const svHouse = addBuilding(sv, 'house', 0, 0, 2);
svHouse.damaged = true;
SaveSystem.save(sv);
const lsv = SaveSystem.load();
ok(lsv.village.raid.pending?.power === 18 && lsv.village.raid.report?.damaged[0] === '商店' && lsv.village.raid.won === 4 && lsv.village.raid.nextAt === sv.village.raid.nextAt, 'a waiting raid, its report and the count load back');
ok(lsv.village.extraBuilders === 1 && lsv.village.wanderers.items[0].materials.iron === 7 && lsv.village.wanderers.lastSpawnAt === t0, 'extra builders and 行商人 / 宝箱 load back');
ok(lsv.village.quests.day === '2027-01-15' && lsv.village.quests.counts['q_build1'] === 1 && lsv.village.quests.claimed[0] === 'q_build1', 'the day\'s chores load back');
ok(lsv.village.buildings.find((b) => b.id === svHouse.id)?.damaged === true, 'a broken building stays broken');
const oldV = load({ ...base0, village: { buildings: [{ id: 'b1', kind: 'castle', x: 7, y: 6, level: 1 }], nextId: 2 } });
ok(oldV.village.extraBuilders === 0 && oldV.village.wanderers.items.length === 0 && !oldV.village.raid.pending && oldV.village.raid.nextAt > Date.now() && oldV.village.quests.day === '', 'a village from before all this is given empty ones, with the first raid a full interval away');
const junkV = load({
  ...base0,
  village: {
    buildings: [{ id: 'b1', kind: 'castle', x: 7, y: 6, level: 1, damaged: true }, { id: 'b2', kind: 'house', x: 0, y: 0, level: 0, upgrade: { startedAt: 1, seconds: 60 }, damaged: true }, { id: 'b3', kind: 'fence', x: 5, y: 5, level: 1, damaged: true }],
    nextId: 4,
    extraBuilders: 99,
    wanderers: { lastSpawnAt: 'x', items: [{ id: 'w1', kind: 'dragon', x: 1, y: 1, expiresAt: 5 }, { id: 'w2', kind: 'chest', x: 99, y: -3, expiresAt: 10, materials: { wood: 'a', stone: 5.7 }, goldHours: -4 }, { id: 'w2', kind: 'chest', x: 1, y: 1, expiresAt: 10 }, null, 'junk'] },
    raid: { nextAt: 'soon', pending: { arrivedAt: 'x' }, report: { at: 1, outcome: 'exploded' }, won: -5 },
    quests: { day: 5, counts: { a: -1, b: 'x', c: 2.9 }, claimed: [1, 'q_build1'] },
  },
});
ok(!junkV.village.buildings.find((b) => b.kind === 'castle')!.damaged, 'a castle is never broken');
ok(!junkV.village.buildings.find((b) => b.id === 'b2')!.damaged && junkV.village.buildings.find((b) => b.id === 'b3')!.damaged === true, 'an unfinished plot is not broken, a finished fence can be');
ok(junkV.village.extraBuilders === EXTRA_BUILDER_GEMS.length, 'extra builders are capped at what can be bought');
const jw = junkV.village.wanderers.items;
ok(jw.length === 1 && jw[0].id === 'w2' && jw[0].x === VILLAGE_COLS - 1 && jw[0].y === 0 && jw[0].materials.stone === 5 && jw[0].materials.wood === undefined && jw[0].goldHours === 0, 'bad wanderers are dropped, the rest cleaned up and put on the map');
ok(junkV.village.raid.pending === null && junkV.village.raid.report === null && junkV.village.raid.won === 0 && junkV.village.raid.nextAt > Date.now(), 'a damaged raid record starts over');
ok(junkV.village.quests.day === '' && junkV.village.quests.counts['c'] === 2 && junkV.village.quests.counts['a'] === undefined && junkV.village.quests.claimed.join() === 'q_build1', 'chores are cleaned up too');


// ---- 装飾 and 撤去
{
  const decor = BUILDINGS.filter((b) => b.decor && !b.road);
  ok(decor.length === 4 && decor.map((d) => d.kind).join() === 'tree,flowers,fountain,statue', '装飾: tree, flowers, fountain, statue');
  ok(decor.every((d) => d.levels.length === 1 && d.levels[0].seconds === 0 && d.levels[0].value === 0 && d.tab === 'decor' && d.buildable && d.movable && d.maxCount.length === 6), '装飾: one level, no waiting, worth nothing, own tab, movable');
  ok(decor.every((d) => !d.produces && !d.defense), '装飾 does not produce or defend');
  ok(decor.every((d) => matSum(d.levels[0]) > 0), '装飾 costs materials');
  ok(getBuilding('castle').removable === false && BUILDINGS.filter((b) => b.kind !== 'castle').every((b) => b.removable !== false), 'only the castle cannot be removed');

  const d = rich();
  const before = incomeMultiplier(d, t0);
  const tree = VillageSystem.build(d, 'tree', 0, 0, t0)!;
  ok(!!tree && tree.level === 1 && !tree.upgrade, 'a tree stands at once, at level 1, with no work under way');
  ok(busyBuilders(d, t0) === 0, 'it used no builder');
  ok(incomeMultiplier(d, t0) === before, 'it changes no income');
  ok(!VillageSystem.work(tree, t0), 'nothing is being done to it');
  // Builders all busy: decor is still fine.
  const busy = rich();
  VillageSystem.build(busy, 'house', 0, 4, t0);
  VillageSystem.build(busy, 'house', 3, 4, t0);
  ok(busyBuilders(busy, t0) === 2 && builderCount(busy, t0) === 2, 'both builders are busy');
  ok(VillageSystem.checkStart(busy, 'house', t0) !== null, 'a house must wait for a builder (or has hit its limit)');
  ok(VillageSystem.checkStart(busy, 'tree', t0) === null && !!VillageSystem.build(busy, 'tree', 0, 8, t0), 'a tree does not');
  ok(busyBuilders(busy, t0) === 2, '...and takes none');
  ok(!VillageSystem.hasJob(busy, t0), 'decor is not a reason for the Home nudge');
  // Counts.
  const cap = rich();
  const max = VillageSystem.maxCount(cap, 'tree', t0);
  for (let i = 0; i < max; i++) VillageSystem.build(cap, 'tree', i, 0, t0);
  ok(VillageSystem.count(cap, 'tree') === max && VillageSystem.checkStart(cap, 'tree', t0) !== null, `${max} trees at castle Lv1, then the limit`);
  ok(VillageSystem.checkStart(cap, 'fountain', t0) === '城をLv3にすると、もう1つ建てられます', 'a fountain needs castle Lv3');
  // Costs are paid.
  const pay = fresh();
  pay.gold = new BigNumber(0, 0).toJSON();
  ok(VillageSystem.checkStart(pay, 'tree', t0) !== null && !VillageSystem.build(pay, 'tree', 0, 0, t0), 'a tree is not free: short of gold, nothing is built');
  const paid = rich();
  const woodBefore = SaveSystem.getMaterial(paid, 'wood');
  VillageSystem.build(paid, 'tree', 2, 2, t0);
  ok(SaveSystem.getMaterial(paid, 'wood') === woodBefore - 10, 'a tree takes 10 wood');
  // No mission or chore progress for decor.
  const mq = rich();
  const doneBefore = JSON.stringify(mq.missions) + JSON.stringify(mq.village.quests);
  VillageSystem.build(mq, 'flowers', 1, 1, t0);
  ok(JSON.stringify(mq.missions) + JSON.stringify(mq.village.quests) === doneBefore, 'decor counts for no mission or 依頼');
  // Moving decor is instant and free.
  const mv2 = rich();
  const tr = VillageSystem.build(mv2, 'tree', 0, 0, t0)!;
  const goldMv = JSON.stringify(mv2.gold);
  const matsMv = mats(mv2);
  ok(VillageSystem.moveTimes(tr, t0).demolish === 0 && VillageSystem.checkMove(mv2, tr, 5, 5, t0) === null, 'moving decor: allowed, no times');
  ok(VillageSystem.startMove(mv2, tr, 5, 5, t0) && tr.x === 5 && tr.y === 5 && !tr.move, 'it is just put down at the new place');
  ok(JSON.stringify(mv2.gold) === goldMv && mats(mv2) === matsMv, '...for nothing');
  ok(VillageSystem.checkMove(mv2, tr, 5, 5, t0) === '今と同じ場所です', 'not to where it already is');
  ok(!VillageSystem.canPlace(mv2, 'tree', 5, 5, undefined, t0) && VillageSystem.canPlace(mv2, 'tree', 6, 5, undefined, t0), 'a tree takes its tile; the next one is free');
  // A raid never breaks decor.
  const rd2 = rich();
  addBuilding(rd2, 'tree', 0, 0, 1);
  addBuilding(rd2, 'fountain', 4, 0, 1);
  rd2.village.raid.nextAt = t0;
  VillageSystem.settle(rd2, t0 + 7 * HOUR, seeded(3));
  const rdShop = rd2.village.buildings.find((b) => b.kind === 'shop')!;
  ok(rdShop.damaged === true, 'a raid that nothing stops breaks the shop...');
  ok(rd2.village.buildings.filter((b) => getBuilding(b.kind).decor).every((b) => !b.damaged), '...but never the decor');
  // Save round trip keeps decor, and refuses a damaged flag on it.
  d.village.buildings.find((b) => b.kind === 'tree')!.damaged = true;
  SaveSystem.save(d);
  const back2 = SaveSystem.load();
  const treeBack = back2.village.buildings.find((b) => b.kind === 'tree');
  ok(!!treeBack && treeBack.level === 1 && !treeBack.damaged, 'decor survives a save/load, and is never loaded broken');

  // ---- 撤去
  const rm = rich();
  const house = addBuilding(rm, 'house', 0, 0, 3);
  const refund = VillageSystem.removeRefund(house, t0);
  const wood = [20, 40, 100].reduce((a, b) => a + b, 0);
  const stone = [0, 10, 50].reduce((a, b) => a + b, 0);
  ok(refund.wood === Math.floor(wood * 0.4) && refund.stone === Math.floor(stone * 0.4) && refund.iron === undefined, `a Lv3 house gives back 40% of what its three levels took (wood ${refund.wood}, stone ${refund.stone})`);
  const castle = rm.village.buildings.find((b) => b.kind === 'castle')!;
  ok(VillageSystem.checkRemove(rm, castle, t0) === '城は撤去できません' && VillageSystem.remove(rm, castle, t0) === null && rm.village.buildings.includes(castle), 'the castle cannot be removed');
  const goldRm = JSON.stringify(rm.gold);
  const matsRm = SaveSystem.getMaterial(rm, 'wood');
  const got = VillageSystem.remove(rm, house, t0)!;
  ok(!!got && !rm.village.buildings.includes(house), 'removing takes it off the map');
  ok(SaveSystem.getMaterial(rm, 'wood') === matsRm + (got.wood ?? 0) && JSON.stringify(rm.gold) === goldRm, 'the materials come back, the gold does not');
  ok(VillageSystem.canPlace(rm, 'house', 0, 0, undefined, t0), 'and its place is free');
  ok(VillageSystem.remove(rm, house, t0) === null, 'it cannot be removed twice');
  // Not while it is being worked on.
  const wk = rich();
  const nb = VillageSystem.build(wk, 'house', 0, 0, t0)!;
  ok(VillageSystem.checkRemove(wk, nb, t0) === '作業が終わってから撤去できます' && VillageSystem.remove(wk, nb, t0) === null, 'not while it is being built');
  VillageSystem.settle(wk, t0 + 1000 * 1000, seeded(5));
  const sh = addBuilding(wk, 'shop', 4, 4, 1);
  ok(VillageSystem.upgrade(wk, sh, t0 + 1000 * 1000), 'the shop is being strengthened');
  ok(VillageSystem.remove(wk, sh, t0 + 1000 * 1000) === null, 'not while it is being strengthened');
  const mvb = addBuilding(wk, 'market', 8, 8, 1);
  const started = VillageSystem.startMove(wk, mvb, 12, 12, t0 + 1000 * 1000);
  ok(started && VillageSystem.remove(wk, mvb, t0 + 1000 * 1000) === null, 'not while it is being moved');
  // A broken one can be cleared; a finished upgrade counts at its new level.
  const br = rich();
  const bb = addBuilding(br, 'shop', 4, 4, 1);
  bb.damaged = true;
  ok(VillageSystem.checkRemove(br, bb, t0) === null && !!VillageSystem.remove(br, bb, t0) && !br.village.buildings.includes(bb), 'a broken building can be cleared away');
  const fin = rich();
  const fb = addBuilding(fin, 'house', 0, 0, 1);
  fb.upgrade = { startedAt: t0, seconds: 100 };
  const refundDone = VillageSystem.removeRefund(fb, t0 + 200 * 1000);
  ok(refundDone.wood === Math.floor(60 * 0.4), 'an upgrade that has run its time counts at its new level');
  // Decor refund.
  const dr = rich();
  const tre = VillageSystem.build(dr, 'tree', 0, 0, t0)!;
  const woodDr = SaveSystem.getMaterial(dr, 'wood');
  const rf = VillageSystem.remove(dr, tre, t0)!;
  ok(rf.wood === 4 && SaveSystem.getMaterial(dr, 'wood') === woodDr + 4 && VillageSystem.count(dr, 'tree') === 0, 'a tree gives back 40% of 10 wood = 4 and frees a slot');
  // Build then remove is never a gain.
  const loop = rich();
  loop.village.buildings.find((b) => b.kind === 'castle')!.level = 3;
  const standing = loop.village.buildings.length;
  const start = Object.fromEntries(VILLAGE_MATERIALS.map(({ id }) => [id, SaveSystem.getMaterial(loop, id)]));
  for (let i = 0; i < 5; i++) {
    const f = VillageSystem.build(loop, 'fountain', 0, 0, t0);
    ok(!!f, `fountain ${i + 1} built (castle Lv3 allows one)`);
    if (f) VillageSystem.remove(loop, f, t0);
  }
  ok(VILLAGE_MATERIALS.every(({ id }) => SaveSystem.getMaterial(loop, id) <= start[id]) && VILLAGE_MATERIALS.some(({ id }) => SaveSystem.getMaterial(loop, id) < start[id]) && loop.village.buildings.length === standing, 'building and removing over and over never gains materials (stone and iron fall)');
}
}

// ---- a rough run of how the economy plays out (greedy, one visit every 12 hours)
function simulate(stageProgress: number, visits: number): { day: number; mult: number; castle: number; wood: number; iron: number; stone: number; gathering: number }[] {
  const s = fresh();
  s.stageProgress = stageProgress;
  s.gold = new BigNumber(0, 0).toJSON();
  let now = t0;
  s.idle.lastClaimAt = now;
  const out: { day: number; mult: number; castle: number; wood: number; iron: number; stone: number; gathering: number }[] = [];
  for (let v = 1; v <= visits; v++) {
    now += 12 * HOUR;
    VillageSystem.settle(s, now);
    IdleSystem.claim(s, now, () => 0.99);
    // greedy: keep taking the job with the best value gain per cost while gold, materials and builders allow
    for (let guard = 0; guard < 40; guard++) {
      const options: { score: number; run: () => boolean }[] = [];
      for (const b of s.village.buildings) {
        if (getBuilding(b.kind).defense) continue;
        if (VillageSystem.checkUpgrade(s, b, now) !== null) continue;
        const next = getBuilding(b.kind).levels[effectiveLevel(b, now)];
        const g = VillageSystem.incomeAfter(s, b, now);
        const gain = g.after - g.now;
        options.push({ score: b.kind === 'castle' ? 1e9 : gain / next.costHours, run: () => VillageSystem.upgrade(s, b, now) });
      }
      for (const def of BUILDINGS.filter((d) => d.buildable && !d.defense && !d.decor)) {
        if (VillageSystem.count(s, def.kind) >= VillageSystem.maxCount(s, def.kind, now)) continue;
        const spotFor = VillageSystem.findSpot(s, def.kind, 5, 11);
        if (!spotFor || VillageSystem.checkBuild(s, def.kind, spotFor.x, spotFor.y, now) !== null) continue;
        const score = (def.produces ? 0.06 : def.kind === 'house' ? 0.05 : def.levels[0].value) / def.levels[0].costHours;
        options.push({ score, run: () => !!VillageSystem.build(s, def.kind, spotFor.x, spotFor.y, now) });
      }
      options.sort((a, b) => b.score - a.score);
      const pick = options[0];
      if (!pick || !pick.run()) break;
    }
    out.push({ day: v / 2, mult: incomeMultiplier(s, now), castle: castleLevel(s, now), wood: SaveSystem.getMaterial(s, 'wood'), iron: SaveSystem.getMaterial(s, 'iron'), stone: SaveSystem.getMaterial(s, 'stone'), gathering: Object.values(IdleSystem.materialsPerHour(s, now)).reduce((a, b) => a + b, 0) });
  }
  return out;
}
const sim = simulate(60, 60);
for (const d of [1, 2, 3, 5, 7, 10, 15, 20, 30]) {
  const r = sim[d * 2 - 1];
  console.log(`   day ${String(d).padStart(2)}: castle Lv${r.castle}, 売上 x${r.mult.toFixed(2)}, 素材/時 ${r.gathering}, in hand 木${r.wood} 鉄${r.iron} 石${r.stone}`);
}
ok(sim[3].mult > 1, 'after two days the village already pays more than at the start');
ok(sim[sim.length - 1].castle >= 3, `a month of twice-a-day visits gets the castle to at least Lv3 (Lv${sim[sim.length - 1].castle})`);
ok(sim[sim.length - 1].mult < 100, `a month in, 売上 stays under x100 (x${sim[sim.length - 1].mult.toFixed(1)})`);


// ---- 道 (road)
{
  const roadDef = BUILDINGS.find((b) => b.kind === 'road')!;
  ok(roadDef.road === true && roadDef.decor === true && roadDef.w === 1 && roadDef.h === 1 && roadDef.tab === 'decor' && roadDef.levels[0].seconds === 0, '道: a 1x1 decor piece, put up at once');
  const save = SaveSystem.createDefault();
  SaveSystem.addGold(save, BigNumber.from(1e12));
  save.village.materials = { wood: 1000, iron: 1000, stone: 1000 };
  const spot = VillageSystem.findSpot(save, 'house', 1, 1)!;
  const first = VillageSystem.build(save, 'road', spot.x, spot.y);
  ok(first !== null && first.level === 1 && !first.upgrade, '道 is laid at once (level 1, no work)');
  ok(!VillageSystem.canPlace(save, 'road', spot.x, spot.y), 'a second road cannot lie on the same tile');
  ok(VillageSystem.canPlace(save, 'house', spot.x, spot.y) === true, 'a building may stand over a road');
  const house = VillageSystem.build(save, 'house', spot.x, spot.y);
  ok(house !== null, 'the building is put up over the road');
  ok(!VillageSystem.canPlace(save, 'road', spot.x, spot.y), '...and a road cannot be laid under a building');
  ok(VillageSystem.count(save, 'road') === 1, 'roads are counted by their own kind');
  const removed = VillageSystem.remove(save, first!);
  ok(removed !== null && VillageSystem.count(save, 'road') === 0, 'a road is taken up with 撤去');
  for (let i = 0; i < 40; i++) VillageSystem.build(save, 'road', i % 18, 10 + Math.floor(i / 18));
  ok(VillageSystem.count(save, 'road') <= VillageSystem.maxCount(save, 'road'), 'roads stop at the limit of the 城 level');
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
