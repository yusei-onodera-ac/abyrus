// 村の拡張: the land grows by paying for it. Runs the table, the payment, the placing, the people's paths and the save against a real
// SaveData, without a browser. (The rest of the village is in village.ts.)
import { SaveSystem, type SaveData, type PlacedBuilding } from '../../src/game/systems/SaveSystem';
import { IdleSystem } from '../../src/game/systems/IdleSystem';
import { VillageSystem } from '../../src/game/systems/VillageSystem';
import { castleLevel, busyBuilders, expansionCount, villageSize } from '../../src/game/systems/VillageIncome';
import { BigNumber } from '../../src/game/systems/BigNumber';
import { VILLAGE_BASE_COLS, VILLAGE_BASE_ROWS, VILLAGE_EXPANSIONS, VILLAGE_MATERIALS, MAX_EXPANSIONS, clampExpansions, nextExpansion, villageMaxSize, villageSizeAt, getBuilding } from '../../src/game/data/village';
import { VILLAGE_WATER_TILES } from '../../src/game/data/villageWalk';
import { walkFree, walkMap, walkReach } from '../../src/game/ui/VillagePeople';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const HOUR = 3600 * 1000;
const t0 = 1_800_000_000_000;
const RICH = { wood: 1_000_000, stone: 1_000_000, iron: 1_000_000 };
const mats = (s: SaveData): string => VILLAGE_MATERIALS.map(({ id }) => SaveSystem.getMaterial(s, id)).join('/');

// (storage round trip needs localStorage: a small stub)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
function load(rawSave: unknown): SaveData {
  store.set('abyrus_save_v1', JSON.stringify(rawSave));
  return SaveSystem.load();
}

function fresh(at = t0): SaveData {
  const s = SaveSystem.createDefault();
  s.village.raid.nextAt = at + 1000 * HOUR;
  s.village.wanderers.lastSpawnAt = at;
  return s;
}
/** Rich, with the castle at `castle`. */
function rich(castle: number, expansions = 0): SaveData {
  const s = fresh();
  s.gold = new BigNumber(1, 12).toJSON();
  SaveSystem.addMaterials(s, RICH);
  s.village.buildings.find((b) => b.kind === 'castle')!.level = castle;
  s.village.expansions = expansions;
  return s;
}
function addBuilding(s: SaveData, kind: string, x: number, y: number, level: number): PlacedBuilding {
  const b = { id: `b${s.village.nextId}`, kind: kind as PlacedBuilding['kind'], x, y, level } as PlacedBuilding;
  s.village.nextId += 1;
  s.village.buildings.push(b);
  return b;
}
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

// ---- the table
ok(VILLAGE_BASE_COLS === 18 && VILLAGE_BASE_ROWS === 18, 'the map every village started with is 18 x 18');
ok(MAX_EXPANSIONS === 6 && VILLAGE_EXPANSIONS.length === 6, 'six steps of 拡張');
ok(VILLAGE_EXPANSIONS.map((e) => e.cols).join() === '20,22,24,26,28,30' && VILLAGE_EXPANSIONS.every((e) => e.cols === e.rows), 'the map goes 20, 22, 24, 26, 28, 30 (square)');
ok(VILLAGE_EXPANSIONS.every((e, i) => e.cols > (i === 0 ? VILLAGE_BASE_COLS : VILLAGE_EXPANSIONS[i - 1].cols) && e.rows > (i === 0 ? VILLAGE_BASE_ROWS : VILLAGE_EXPANSIONS[i - 1].rows)), 'every step is bigger than the one before (land is only ever added)');
ok(VILLAGE_EXPANSIONS.every((e, i, a) => i === 0 || (e.costHours > a[i - 1].costHours && e.needCastle >= a[i - 1].needCastle)), 'each step costs more gold than the last and never needs a lower 城');
const matTotal = (m: Record<string, number | undefined>): number => Object.values(m).reduce<number>((a, b) => a + (b ?? 0), 0);
ok(VILLAGE_EXPANSIONS.every((e, i, a) => matTotal(e.materials) > 0 && (i === 0 || matTotal(e.materials) > matTotal(a[i - 1].materials))), 'every step takes 素材, more each time');
ok(VILLAGE_EXPANSIONS.every((e) => e.needCastle >= 1 && e.needCastle <= 6 && e.costHours > 0), 'every step needs a 城 level that exists and costs gold');
ok(villageSizeAt(0).cols === 18 && villageSizeAt(0).rows === 18, 'no 拡張 = 18 x 18');
ok(villageSizeAt(1).cols === 20 && villageSizeAt(3).cols === 24 && villageSizeAt(6).cols === 30 && villageSizeAt(6).rows === 30, 'villageSizeAt follows the table');
ok(villageSizeAt(-4).cols === 18 && villageSizeAt(99).cols === 30 && villageSizeAt(2.9).cols === 22 && villageSizeAt(NaN).cols === 18, 'a count out of range is pulled back in (whole numbers)');
ok(clampExpansions(7) === 6 && clampExpansions(-1) === 0 && clampExpansions(Infinity) === 0, 'clampExpansions');
ok(nextExpansion(0)?.cols === 20 && nextExpansion(5)?.cols === 30 && nextExpansion(6) === null, 'the next step, and none after the last');
ok(villageMaxSize().cols === 30 && villageMaxSize().rows === 30, 'the biggest map is 30 x 30');

// ---- an old save is the old size
const newSave = fresh();
ok(newSave.village.expansions === 0 && villageSize(newSave).cols === 18 && villageSize(newSave).rows === 18 && expansionCount(newSave) === 0, 'a new save has the 18 x 18 map (拡張 0)');
const base0 = JSON.parse(JSON.stringify(fresh())) as Record<string, unknown>;
const oldVillage = { buildings: [{ id: 'b1', kind: 'castle', x: 7, y: 6, level: 1 }, { id: 'b2', kind: 'shop', x: 8, y: 11, level: 1 }, { id: 'b3', kind: 'house', x: 16, y: 16, level: 1 }], nextId: 4, extraBuilders: 1 };
const oldLoaded = load({ ...base0, village: oldVillage });
ok(oldLoaded.village.expansions === 0 && villageSize(oldLoaded).cols === 18 && villageSize(oldLoaded).rows === 18, 'a save from before 拡張 (no field) loads as 18 x 18');
ok(oldLoaded.village.buildings.map((b) => `${b.kind}@${b.x},${b.y}`).join() === 'castle@7,6,shop@8,11,house@16,16', 'and every building is exactly where it was, the one in the far corner too');
const noVillage = { ...base0 };
delete (noVillage as Record<string, unknown>).village;
ok(load(noVillage).village.expansions === 0, 'a save with no village at all is given 拡張 0');
const strange = (raw: unknown): number => load({ ...base0, village: { ...oldVillage, expansions: raw } }).village.expansions;
ok(strange('x') === 0 && strange(null) === 0 && strange(-3) === 0 && strange(99) === 6 && strange(2.9) === 2 && strange(NaN) === 0 && strange(3) === 3, 'a strange 拡張 count is cleaned up (0 to 6, whole numbers)');

// ---- what can be placed
{
  const s = rich(6);
  const house = getBuilding('house');
  ok(!VillageSystem.canPlace(s, 'house', -1, 0) && !VillageSystem.canPlace(s, 'house', 17, 0) && !VillageSystem.canPlace(s, 'house', 0, 17), 'at 18 x 18 a house cannot stick out of the map');
  ok(VillageSystem.canPlace(s, 'house', 16, 16) && !VillageSystem.canPlace(s, 'house', 18, 0) && !VillageSystem.canPlace(s, 'house', 0, 18) && !VillageSystem.canPlace(s, 'house', 17, 17), 'the last place for a house is (16, 16); (18, 0) is off the map');
  ok(!VillageSystem.canPlace(s, 'tree', 18, 0) && !VillageSystem.canPlace(s, 'road', 0, 18) && VillageSystem.canPlace(s, 'tree', 17, 17), 'a tile, too: 17 is the last row and column');
  ok(VillageSystem.checkBuild(s, 'house', 18, 0, t0) === 'ここには置けません', 'building beyond the edge is refused with the usual words');
  // Expand once.
  const gold0 = SaveSystem.getGold(s);
  const got = VillageSystem.expand(s, t0);
  ok(!!got && s.village.expansions === 1 && villageSize(s).cols === 20, 'expanding once makes the map 20 x 20');
  ok(VillageSystem.canPlace(s, 'house', 18, 0, undefined, t0) && VillageSystem.canPlace(s, 'house', 0, 18, undefined, t0) && VillageSystem.canPlace(s, 'house', 18, 18, undefined, t0), 'the new land takes a house: (18, 0), (0, 18) and the new corner');
  ok(!VillageSystem.canPlace(s, 'house', 19, 0, undefined, t0) && !VillageSystem.canPlace(s, 'house', 0, 19, undefined, t0) && !VillageSystem.canPlace(s, 'house', 20, 0, undefined, t0) && VillageSystem.canPlace(s, 'house', 18, 18, undefined, t0), 'a 2x2 still has to fit: nothing past 20');
  ok(!VillageSystem.canPlace(s, 'tree', 20, 0, undefined, t0) && !VillageSystem.canPlace(s, 'tree', 0, 20, undefined, t0) && VillageSystem.canPlace(s, 'tree', 19, 19, undefined, t0), 'and nothing beyond the new edge either');
  ok(!VillageSystem.canPlace(s, 'market', 18, 18, undefined, t0) && VillageSystem.canPlace(s, 'market', 17, 17, undefined, t0), 'a 3x3 market fits from (17, 17) and not from (18, 18)');
  ok(VillageSystem.checkBuild(s, 'house', 18, 18, t0) === null, 'checkBuild agrees');
  const b = VillageSystem.build(s, 'house', 18, 18, t0);
  ok(!!b && b.x === 18 && b.y === 18, 'a house is built in the new land');
  ok(!VillageSystem.canPlace(s, 'house', 19, 19, undefined, t0) && VillageSystem.canPlace(s, 'house', 18, 16, undefined, t0), 'and it takes its tiles: touching is fine, overlapping is not');
  const spotNear = VillageSystem.findSpot(s, 'house', 19, 5, undefined, t0)!;
  ok(!!spotNear && spotNear.x + house.w <= 20 && spotNear.y + house.h <= 20, 'findSpot stays inside the new map');
  ok(SaveSystem.getGold(s).lt(gold0), 'it was paid for with the gold the expansion left over');
}
{
  // Fill the old map's free room so the only place left is in the new land.
  const s = rich(6);
  const free = (): { x: number; y: number } | null => VillageSystem.findSpot(s, 'house', 0, 0, undefined, t0);
  for (let guard = 0; free() && guard < 400; guard++) {
    const p = free()!;
    addBuilding(s, 'house', p.x, p.y, 1);
  }
  ok(free() === null, 'a full 18 x 18 map has no spot left for a house');
  VillageSystem.expand(s, t0);
  const p = free();
  ok(!!p && (p.x >= 18 || p.y >= 18), `after 拡張 the spot is in the new land (${p?.x}, ${p?.y})`);
}

// ---- paying
{
  const s = rich(2);
  const step = VILLAGE_EXPANSIONS[0];
  const goldBefore = SaveSystem.getGold(s);
  const matsBefore = mats(s);
  const base = IdleSystem.baseGoldPerHour(s);
  const reason = VillageSystem.checkExpand(s, t0);
  ok(reason === null, 'castle Lv2 and plenty of everything: nothing in the way');
  const r = VillageSystem.expand(s, t0)!;
  ok(!!r && r.from.cols === 18 && r.to.cols === 20 && r.step === step, 'expand reports the step, the map before and after');
  ok(r.tiles === 20 * 20 - 18 * 18 && VillageSystem.expansionTiles(rich(2), step) === 76, 'and the 76 tiles of land it added');
  const spent = goldBefore.sub(SaveSystem.getGold(s));
  const want = base.mul(step.costHours);
  ok(spent.div(want).toNumber() > 0.999 && spent.div(want).toNumber() < 1.001, `it cost ${step.costHours} hours of base gold (${want.toString()})`);
  ok(VillageSystem.cost(s, VillageSystem.expansionLevel(step)).toString() === base.mul(step.costHours).toString(), 'the price is the same sum the buildings use');
  ok(mats(s) === [RICH.wood + 100 - 80, RICH.iron, RICH.stone + 60 - 60].join('/'), `and 80 wood and 60 stone (${matsBefore} -> ${mats(s)})`);
  ok(busyBuilders(s, t0) === 0 && s.village.buildings.every((b) => !b.upgrade), 'it used no builder and left no work behind: it is done at once');
  ok(!VillageSystem.work(s.village.buildings[0], t0), 'nothing is being worked on');
  const text = VillageSystem.cost(s, VillageSystem.expansionLevel(VILLAGE_EXPANSIONS[5])).toString();
  ok(/^[\d,]+$/.test(text), `a price is every digit (${text})`);
}
{
  // Short of gold.
  const s = rich(2);
  s.gold = new BigNumber(0, 0).toJSON();
  const snap = JSON.stringify(s);
  ok(VillageSystem.checkExpand(s, t0) === 'ゴールドが足りません', 'no gold: ゴールドが足りません');
  ok(VillageSystem.expand(s, t0) === null && JSON.stringify(s) === snap, 'and nothing is paid or changed');
  // Short of materials.
  const m = rich(2);
  m.village.materials = { wood: 0, iron: 0, stone: 59 };
  const snapM = JSON.stringify(m);
  ok(VillageSystem.checkExpand(m, t0) === '木材・石が足りません', 'short of 木材 and 石: it says which');
  ok(VillageSystem.expand(m, t0) === null && JSON.stringify(m) === snapM, 'and nothing is taken, not even the gold');
  m.village.materials = { wood: 80, iron: 0, stone: 60 };
  ok(VillageSystem.checkExpand(m, t0) === null && !!VillageSystem.expand(m, t0) && mats(m) === '0/0/0', 'exactly enough is enough (and takes it all)');
  ok(m.village.expansions === 1, '...once');
}
{
  // Locked by the 城.
  const s = rich(1);
  const snap = JSON.stringify(s);
  ok(castleLevel(s, t0) === 1 && VillageSystem.checkExpand(s, t0) === '城をLv2にすると、村を広げられます', 'castle Lv1: 城をLv2にすると、村を広げられます');
  ok(VillageSystem.expand(s, t0) === null && JSON.stringify(s) === snap, 'and nothing happens, however rich');
  s.village.buildings.find((b) => b.kind === 'castle')!.level = 2;
  ok(!!VillageSystem.expand(s, t0), 'castle Lv2 opens the first step');
  ok(VillageSystem.checkExpand(s, t0) === '城をLv3にすると、村を広げられます', 'and the second wants Lv3');
  ok(VillageSystem.expand(s, t0) === null && s.village.expansions === 1, 'so a second try changes nothing');
  // A castle that is being strengthened counts at its level so far, and one whose work has run counts at the new one.
  s.village.buildings.find((b) => b.kind === 'castle')!.upgrade = { startedAt: t0, seconds: 100 };
  ok(VillageSystem.checkExpand(s, t0 + 50 * 1000) === '城をLv3にすると、村を広げられます', 'a castle still being strengthened does not count yet');
  ok(VillageSystem.checkExpand(s, t0 + 200 * 1000) === null && !!VillageSystem.expand(s, t0 + 200 * 1000) && s.village.expansions === 2, 'one whose work has run does (it is settled first)');
}
{
  // The whole way up, and the end of it.
  const s = rich(6);
  const goldBefore = SaveSystem.getGold(s);
  const sizes: number[] = [];
  let tilesTotal = 0;
  for (let i = 0; i < MAX_EXPANSIONS; i++) {
    const r = VillageSystem.expand(s, t0);
    ok(!!r, `step ${i + 1} goes through`);
    if (r) {
      sizes.push(r.to.cols);
      tilesTotal += r.tiles;
    }
  }
  ok(sizes.join() === '20,22,24,26,28,30' && villageSize(s).cols === 30 && villageSize(s).rows === 30, 'six steps: 20, 22, 24, 26, 28, 30');
  ok(tilesTotal === 30 * 30 - 18 * 18, `together they added ${tilesTotal} tiles (900 - 324)`);
  const wood = VILLAGE_EXPANSIONS.reduce((a, e) => a + (e.materials.wood ?? 0), 0);
  const stone = VILLAGE_EXPANSIONS.reduce((a, e) => a + (e.materials.stone ?? 0), 0);
  const iron = VILLAGE_EXPANSIONS.reduce((a, e) => a + (e.materials.iron ?? 0), 0);
  ok(mats(s) === [RICH.wood + 100 - wood, RICH.iron - iron, RICH.stone + 60 - stone].join('/'), `all the 素材 the table says were taken (${wood} wood, ${iron} iron, ${stone} stone)`);
  ok(goldBefore.gt(SaveSystem.getGold(s)), 'and the gold');
  const snap = JSON.stringify(s);
  ok(VillageSystem.nextExpansion(s) === null && VillageSystem.checkExpand(s, t0) === '村はこれ以上、広げられません', 'at 30 x 30 there is no next step: これ以上、広げられません');
  ok(VillageSystem.expand(s, t0) === null && JSON.stringify(s) === snap, 'and expanding changes nothing');
}

// ---- moving and removing in the new land
{
  const s = rich(6, 2); // 22 x 22
  const decor = addBuilding(s, 'tree', 3, 3, 1);
  ok(VillageSystem.checkMove(s, decor, 21, 21, t0) === null && VillageSystem.startMove(s, decor, 21, 21, t0) && decor.x === 21 && decor.y === 21, 'a 装飾 can be moved to the last tile of the new land (21, 21)');
  ok(VillageSystem.checkMove(s, decor, 22, 21, t0) === 'ここには置けません' && VillageSystem.checkMove(s, decor, 21, 22, t0) === 'ここには置けません', 'but not one tile further');
  const shop = addBuilding(s, 'shop', 4, 4, 2);
  ok(VillageSystem.checkMove(s, shop, 19, 19, t0) === null && VillageSystem.startMove(s, shop, 19, 19, t0) && shop.move?.toX === 19 && shop.move?.toY === 19, 'a shop is moved (demolish, rebuild) into the new land');
  ok(VillageSystem.checkMove(s, addBuilding(s, 'house', 0, 0, 1), 21, 21, t0) === 'ここには置けません', 'a house cannot go where only one tile of it would be on the map');
  // While the move is under way the target is kept.
  ok(!VillageSystem.canPlace(s, 'tree', 19, 19, undefined, t0) && !VillageSystem.canPlace(s, 'house', 18, 18, undefined, t0 + 1000), 'a place being moved to is kept for it');
  // Once it has run, it stands there.
  VillageSystem.settle(s, t0 + 24 * HOUR);
  ok(shop.x === 19 && shop.y === 19 && !shop.move, 'and after the move it stands there');
  // Removing a building out in the new land gives back materials and frees the place.
  const farm = addBuilding(s, 'house', 20, 8, 2);
  const stoneBefore = SaveSystem.getMaterial(s, 'stone');
  const refund = VillageSystem.remove(s, farm, t0 + 24 * HOUR);
  ok(!!refund && SaveSystem.getMaterial(s, 'stone') > stoneBefore - 1 && !s.village.buildings.includes(farm), 'a building in the new land is removed and pays its 素材 back');
  ok(VillageSystem.canPlace(s, 'house', 20, 8, undefined, t0 + 24 * HOUR), 'and its place is free again');
  // The old land is as it was: the castle and the first shop have not moved.
  const castle = s.village.buildings.find((b) => b.kind === 'castle')!;
  ok(castle.x === 7 && castle.y === 6, 'the castle has not moved');
}

// ---- 行商人 and 宝箱 and 襲撃 follow the size
{
  // At 18 x 18 every one stands on the map.
  const small = rich(1);
  const rng = seeded(7);
  let ok18 = true;
  for (let i = 0; i < 60; i++) {
    small.village.wanderers = { lastSpawnAt: t0 + i * 20 * HOUR, items: [] };
    VillageSystem.settle(small, t0 + i * 20 * HOUR + 4 * HOUR, rng);
    for (const w of small.village.wanderers.items) if (w.x < 0 || w.y < 0 || w.x >= 18 || w.y >= 18) ok18 = false;
    small.village.raid.nextAt = t0 + 1000 * HOUR;
  }
  ok(ok18, 'at 18 x 18 every 行商人 / 宝箱 turns up inside the map');
  // At 30 x 30 they can turn up in the new land, and never off the map.
  const big = rich(6, 6);
  let inNew = 0;
  let inside = true;
  for (let i = 0; i < 80; i++) {
    big.village.wanderers = { lastSpawnAt: t0 + i * 20 * HOUR, items: [] };
    VillageSystem.settle(big, t0 + i * 20 * HOUR + 4 * HOUR, rng);
    for (const w of big.village.wanderers.items) {
      if (w.x < 0 || w.y < 0 || w.x >= 30 || w.y >= 30) inside = false;
      if (w.x >= 18 || w.y >= 18) inNew++;
    }
    big.village.raid.nextAt = t0 + 1000 * HOUR;
  }
  ok(inside, 'at 30 x 30 they all stand on the map');
  ok(inNew > 20, `and most of them are in the new land (${inNew} of the ones that came)`);
  // One standing in the new land can be taken.
  const w = { id: 'w1', kind: 'chest' as const, x: 28, y: 27, expiresAt: t0 + HOUR, materials: { wood: 5, stone: 5, iron: 5 }, goldHours: 0 };
  big.village.wanderers = { lastSpawnAt: t0, items: [w] };
  ok(!!VillageSystem.collect(big, 'w1', t0), 'a chest out in the new land is opened like any other');
  // 襲撃: a building in the new land is as much a target as any other.
  let hitNew = false;
  for (let seed = 1; seed <= 40 && !hitNew; seed++) {
    const r = rich(6, 6);
    addBuilding(r, 'house', 26, 26, 1);
    r.village.raid.nextAt = t0;
    VillageSystem.settle(r, t0 + 7 * HOUR, seeded(seed));
    hitNew = r.village.buildings.some((b) => b.x === 26 && b.damaged === true);
  }
  ok(hitNew, 'a 襲撃 that gets through can break a building standing in the new land');
}

// ---- where people walk
{
  const water = VILLAGE_WATER_TILES[1];
  const s = rich(1);
  const m = walkMap(s, t0);
  ok(m.cols === 18 && m.rows === 18 && m.free.length === 324, 'at 18 x 18 the walking map is 18 x 18');
  ok(!walkFree(m, 0, 5) && !walkFree(m, 17, 5) && !walkFree(m, 5, 0) && !walkFree(m, 5, 17) && walkFree(m, 3, 3), 'the hedge ring is not walked on, the lawn is');
  ok(!walkFree(m, 18, 3) && !walkFree(m, 3, 18) && !walkFree(m, -1, 3), 'and nothing off the map is');
  ok(water.every((at) => !walkFree(m, at % 18, Math.floor(at / 18))), 'the pond is not walked on');
  const castle = s.village.buildings.find((b) => b.kind === 'castle')!;
  ok(!walkFree(m, castle.x, castle.y) && !walkFree(m, castle.x + 3, castle.y + 3), 'nor is a building');
  const old = m.free.filter(Boolean).length;
  // Expand to 22 x 22.
  const e = rich(4, 2);
  const m2 = walkMap(e, t0);
  ok(m2.cols === 22 && m2.rows === 22 && m2.free.length === 484, 'at 22 x 22 the walking map is 22 x 22');
  ok(walkFree(m2, 19, 5) && walkFree(m2, 5, 19) && walkFree(m2, 19, 19) && walkFree(m2, 20, 20), 'the new land can be walked on');
  ok(!walkFree(m2, 0, 5) && !walkFree(m2, 5, 0) && !walkFree(m2, 21, 5) && !walkFree(m2, 5, 21) && !walkFree(m2, 21, 21) && !walkFree(m2, 22, 5) && !walkFree(m2, 5, 22), 'the new rim is kept clear and nothing past it is walkable');
  ok(!walkFree(m2, 17, 5) && !walkFree(m2, 5, 17), 'the old plot keeps its fence: the ring of the 18 x 18 plot is still not walked on');
  // (castle Lv4 = the town plot, whose water is its own set of tiles)
  ok(VILLAGE_WATER_TILES[2].every((at) => !walkFree(m2, at % 18, Math.floor(at / 18))), 'the water is where it was (the tiles are numbered for the plot, not the map)');
  ok(m2.free.filter(Boolean).length > old, 'there is more room to walk');
  // A building in the new land blocks its tiles; a road does not.
  addBuilding(e, 'house', 19, 6, 1);
  addBuilding(e, 'road', 19, 10, 1);
  const m3 = walkMap(e, t0);
  ok(!walkFree(m3, 19, 6) && !walkFree(m3, 20, 7) && walkFree(m3, 19, 10), 'a house in the new land blocks its 2x2; a road is walked on');
  // A person in the new land can walk all over it (it is joined up), and stays on the map.
  const reach = walkReach(m3, 19, 12);
  let reachedAll = true;
  let offMap = false;
  for (let y = 1; y < 21; y++) for (let x = 18; x < 21; x++) if (walkFree(m3, x, y) && reach.dist[y * 22 + x] < 0) reachedAll = false;
  for (let i = 0; i < reach.dist.length; i++) if (reach.dist[i] >= 0 && (i % 22 >= 22 || Math.floor(i / 22) >= 22)) offMap = true;
  ok(reachedAll && !offMap, 'the new land is one piece to walk (every free tile of it can be reached from one) and the walk never leaves the map');
  const reachedOld = reach.dist.some((d, i) => d >= 0 && i % 22 < 17 && Math.floor(i / 22) < 17 && walkFree(m3, i % 22, Math.floor(i / 22)));
  ok(!reachedOld, 'the old fence keeps people of the new land out of the old plot (and the other way)');
  // The biggest map.
  const f = rich(6, 6);
  const m4 = walkMap(f, t0);
  ok(m4.cols === 30 && m4.rows === 30 && walkFree(m4, 28, 28) && !walkFree(m4, 29, 29) && !walkFree(m4, 30, 5), 'at 30 x 30 the walking map is 30 x 30, rim clear');
  // A person standing in the old land when it is expanded is still on free ground (nothing about the old land moved).
  const e1 = rich(2, 0);
  const before = walkMap(e1, t0);
  e1.village.expansions = 1;
  const after = walkMap(e1, t0);
  let same = true;
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) if (walkFree(before, x, y) !== walkFree(after, x, y)) same = false;
  ok(same, 'expanding changes nothing about where people can walk in the old land');
}

// ---- saved and loaded
{
  const s = rich(6, 3); // 24 x 24
  const farHouse = addBuilding(s, 'house', 22, 22, 2);
  addBuilding(s, 'tree', 23, 5, 1);
  const road = addBuilding(s, 'road', 5, 23, 1);
  const mv = addBuilding(s, 'shop', 10, 10, 2);
  mv.move = { startedAt: t0, demolish: 60, rebuild: 120, toX: 21, toY: 21 };
  s.village.wanderers = { lastSpawnAt: t0, items: [{ id: 'w9', kind: 'merchant', x: 23, y: 20, expiresAt: t0 + HOUR, materials: { wood: 1, stone: 2, iron: 3 }, goldHours: 2 }] };
  SaveSystem.save(s);
  const back = SaveSystem.load();
  ok(back.village.expansions === 3 && villageSize(back).cols === 24 && villageSize(back).rows === 24, 'the number of 拡張 loads back (24 x 24)');
  const at = (id: string): PlacedBuilding => back.village.buildings.find((b) => b.id === id)!;
  ok(at(farHouse.id).x === 22 && at(farHouse.id).y === 22 && at(farHouse.id).level === 2, 'a house in the new land loads back where it was');
  ok(back.village.buildings.some((b) => b.kind === 'tree' && b.x === 23 && b.y === 5) && at(road.id).x === 5 && at(road.id).y === 23, 'so do a tree and a road piece');
  ok(at(mv.id).move?.toX === 21 && at(mv.id).move?.toY === 21, 'a move whose target is in the new land loads back');
  ok(back.village.wanderers.items[0]?.x === 23 && back.village.wanderers.items[0]?.y === 20, 'a 行商人 in the new land loads back where it stood');
  ok(JSON.stringify(back.village.buildings) === JSON.stringify(s.village.buildings), 'and the whole village comes back as it went');
  // A second round trip is stable.
  SaveSystem.save(back);
  ok(JSON.stringify(SaveSystem.load().village) === JSON.stringify(back.village), 'saving and loading again changes nothing');
  // The same layout with the 拡張 lost (an edited or damaged save) is pulled back onto the 18 x 18 map, not left off it.
  const raw = JSON.parse(JSON.stringify(s)) as SaveData;
  (raw.village as unknown as Record<string, unknown>).expansions = 0;
  const pulled = load(raw);
  ok(pulled.village.buildings.every((b) => b.x + getBuilding(b.kind).w <= 18 && b.y + getBuilding(b.kind).h <= 18), 'with no 拡張 recorded, everything is pulled back onto the 18 x 18 map');
  ok(pulled.village.wanderers.items.every((w) => w.x < 18 && w.y < 18), '...the 行商人 too');
  // The map's size comes first even when the field is last in the file.
  const reordered = JSON.parse(JSON.stringify(s)) as { village: Record<string, unknown> };
  const v = reordered.village;
  delete v.expansions;
  v.expansions = 3;
  ok(villageSize(load(reordered)).cols === 24 && load(reordered).village.buildings.some((b) => b.x === 22), 'the order of the fields in a save makes no difference');
  // A level-1 village loads the same as it always did.
  const plain = rich(1);
  SaveSystem.save(plain);
  const plainBack = SaveSystem.load();
  ok(plainBack.village.expansions === 0 && JSON.stringify(plainBack.village.buildings) === JSON.stringify(plain.village.buildings), 'a village that was never 拡張 round-trips as before');
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
