import {
  BUILDINGS,
  EXTRA_BUILDER_GEMS,
  FINISH_GEMS_MAX,
  FINISH_GEMS_PER_10_MIN,
  MOVE_DEMOLISH_SHARE,
  MOVE_MIN_SECONDS,
  MOVE_REBUILD_SHARE,
  RAID_DAMAGE_MAX,
  RAID_INTERVAL_HOURS,
  RAID_POWER,
  RAID_REWARD_GOLD_HOURS,
  RAID_REWARD_MATERIALS,
  RAID_STAGES_BELOW,
  RAID_WINDOW_HOURS,
  REMOVE_REFUND_SHARE,
  REPAIR_SHARE,
  VILLAGE_COLS,
  VILLAGE_MATERIALS,
  VILLAGE_ROWS,
  WANDERERS,
  WANDERER_LIFE_HOURS,
  WANDERER_MAX,
  WANDERER_SPAWN_HOURS,
  getBuilding,
  materialName,
  type BuildingKind,
  type BuildingLevel,
  type MaterialBundle,
  type WandererKind,
} from '../data/village';
import { BigNumber } from './BigNumber';
import { IdleSystem } from './IdleSystem';
import { recordMission } from './MissionProgress';
import { SaveSystem, type PlacedBuilding, type RaidReport, type SaveData, type Wanderer } from './SaveSystem';
import {
  builderCount,
  busyBuilders,
  castleLevel,
  defensePoints,
  effectiveLevel,
  footprints,
  houseBonus,
  incomeMultiplier,
  isMoveDone,
  isWorkDone,
  isWorking,
  levelValue,
  movePhase,
  regionReached,
  shopPoints,
} from './VillageIncome';
import { MAIN_STAGE_COUNT } from './ProgressionSystem';
import { VillageQuests } from './VillageQuests';

const HOUR_MS = 3600 * 1000;

/**
 * 村: building, strengthening and moving buildings (the list and the numbers are in data/village.ts). Like
 * the other systems this changes the save in memory only: the scene that called it saves. What the village
 * is worth (売上倍率, 城 level, builders) is read by VillageIncome, so 放置報酬 needs no village screen open.
 */

export interface VillageSummary {
  castleLevel: number;
  builders: number;
  busy: number;
  /** Seconds until the soonest work under way is finished (0 when none is). */
  nextSeconds: number;
  multiplier: number;
}

/** What is being done to a building right now. 'demolish' and 'rebuild' are the two parts of moving it. */
export type WorkKind = 'build' | 'upgrade' | 'demolish' | 'rebuild';

export interface WorkInfo {
  kind: WorkKind;
  /** Seconds until this part of the work is over. */
  left: number;
  /** How long this part takes in all. */
  seconds: number;
  /** How far along this part is, 0..1. */
  progress: number;
  /** Seconds until all of it is over (a move is two parts; the rest is the same as `left`). */
  totalLeft: number;
}

/** What taking a building down and putting it up elsewhere takes, in seconds. */
export interface MoveTimes {
  demolish: number;
  rebuild: number;
}

/** What a call to `settle` took in. */
export interface SettleResult {
  /** Buildings that were built or strengthened (they are a level higher now). */
  finished: PlacedBuilding[];
  /** Buildings whose 解体 is over: they now stand at their new place, being put up again. */
  relocated: PlacedBuilding[];
  /** Buildings whose move is over: they work again. */
  rebuilt: PlacedBuilding[];
  /** 行商人 / 宝箱 that turned up on the map. */
  spawned: Wanderer[];
  /** ...and the ones that left without being opened. */
  expired: Wanderer[];
  /** A 襲撃 came while settling (it is waiting in `save.village.raid.pending`, unless it was dealt with at once). */
  raidArrived: boolean;
  /** A 襲撃 gave up waiting and was settled by the walls (its report is in `save.village.raid.report`). */
  raidSettled: boolean;
}

/** True when settling changed anything the map shows. */
export function settleChanged(result: SettleResult): boolean {
  return (
    result.finished.length + result.relocated.length + result.rebuilt.length + result.spawned.length + result.expired.length > 0 ||
    result.raidArrived ||
    result.raidSettled
  );
}

/** What taking a 行商人 / 宝箱 gave. */
export interface Collected {
  wanderer: Wanderer;
  gold: BigNumber;
}

/** What beating a 襲撃 paid. */
export interface RaidWin {
  materials: MaterialBundle;
  gold: BigNumber;
}

/** True when `w` x `h` tiles at (x, y) are on the map and clear of every building but `ignoreId` (the ones
 *  being moved count at their old place until it is taken down, and at the new one all along). */
function fits(save: SaveData, def: { w: number; h: number }, x: number, y: number, ignoreId: string | undefined, now: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x + def.w > VILLAGE_COLS || y + def.h > VILLAGE_ROWS) return false;
  for (const other of save.village.buildings) {
    if (other.id === ignoreId) continue;
    const o = getBuilding(other.kind);
    for (const at of footprints(other, now)) {
      if (x < at.x + o.w && at.x < x + def.w && y < at.y + o.h && at.y < y + def.h) return false;
    }
  }
  return true;
}

/** Pays the ゴールド and 素材 of `level` if all of it is in hand; false, with nothing taken, when it is not. */
function pay(save: SaveData, level: BuildingLevel): boolean {
  const gold = VillageSystem.cost(save, level);
  const materials = VillageSystem.materialCost(level);
  if (!SaveSystem.getGold(save).gte(gold) || SaveSystem.missingMaterials(save, materials).length > 0) return false;
  return SaveSystem.spendGold(save, gold) && SaveSystem.spendMaterials(save, materials);
}

/** Why `level` cannot be paid for now, or null when it can: ゴールド first, then the 素材 that are short. */
function shortOf(save: SaveData, level: BuildingLevel): string | null {
  if (!SaveSystem.getGold(save).gte(VillageSystem.cost(save, level))) return 'ゴールドが足りません';
  const missing = SaveSystem.missingMaterials(save, VillageSystem.materialCost(level));
  return missing.length > 0 ? `${missing.map(materialName).join('・')}が足りません` : null;
}

/** A free single tile for a 行商人 / 宝箱, or null (after a number of tries) when the map is too crowded. */
function randomFreeTile(save: SaveData, rng: () => number, now: number): { x: number; y: number } | null {
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rng() * VILLAGE_COLS);
    const y = Math.floor(rng() * VILLAGE_ROWS);
    if (!fits(save, { w: 1, h: 1 }, x, y, undefined, now)) continue;
    if (save.village.wanderers.items.some((w) => w.x === x && w.y === y)) continue;
    return { x, y };
  }
  return null;
}

/** Brings the 行商人 / 宝箱 up to date: the ones past their time leave, and one turns up each WANDERER_SPAWN_HOURS (only
 *  as many as fit on the map at once; the clock is not banked, so a long absence finds at most WANDERER_MAX). */
function advanceWanderers(save: SaveData, now: number, rng: () => number, result: SettleResult): void {
  const w = save.village.wanderers;
  result.expired.push(...w.items.filter((item) => now >= item.expiresAt));
  w.items = w.items.filter((item) => now < item.expiresAt);
  const interval = WANDERER_SPAWN_HOURS * HOUR_MS;
  // Only the ones that would still be standing matter: after a long absence, skip ahead to the last few.
  const earliest = now - WANDERER_LIFE_HOURS * HOUR_MS - interval;
  if (w.lastSpawnAt < earliest) w.lastSpawnAt = earliest;
  const region = regionReached(save);
  const total = WANDERERS.chest.chance + WANDERERS.merchant.chance;
  for (let guard = 0; guard < WANDERER_MAX + 2 && now - w.lastSpawnAt >= interval; guard++) {
    w.lastSpawnAt += interval;
    if (w.items.length >= WANDERER_MAX) continue;
    const expiresAt = w.lastSpawnAt + WANDERER_LIFE_HOURS * HOUR_MS;
    if (expiresAt <= now) continue;
    const spot = randomFreeTile(save, rng, now);
    if (!spot) break;
    const kind: WandererKind = rng() * total < WANDERERS.chest.chance ? 'chest' : 'merchant';
    const table = WANDERERS[kind].materials[Math.min(WANDERERS[kind].materials.length - 1, region)];
    const factor = 0.8 + rng() * 0.4;
    const materials: MaterialBundle = {};
    for (const { id } of VILLAGE_MATERIALS) materials[id] = Math.max(1, Math.floor(table[id] * factor));
    const item: Wanderer = { id: `w${save.village.nextId}`, kind, x: spot.x, y: spot.y, expiresAt, materials, goldHours: WANDERERS[kind].goldHours };
    save.village.nextId += 1;
    w.items.push(item);
    result.spawned.push(item);
  }
  if (now - w.lastSpawnAt >= interval) w.lastSpawnAt = now;
}

/** Brings the 襲撃 up to date: one comes when its time is due, and one that nobody answered in time is settled by the walls. */
function advanceRaid(save: SaveData, now: number, rng: () => number, result: SettleResult): void {
  const raid = save.village.raid;
  const interval = RAID_INTERVAL_HOURS * HOUR_MS;
  if (!raid.pending && now >= raid.nextAt) {
    const region = regionReached(save);
    raid.pending = { arrivedAt: raid.nextAt, expiresAt: raid.nextAt + RAID_WINDOW_HOURS * HOUR_MS, power: RAID_POWER[region], region };
    result.raidArrived = true;
  }
  const pending = raid.pending;
  if (!pending || now < pending.expiresAt) return;

  // Nobody answered: the walls hold, or something breaks.
  const defense = defensePoints(save, now);
  let report: RaidReport = { at: now, outcome: 'repelled', damaged: [] };
  if (defense < pending.power) {
    const count = Math.min(RAID_DAMAGE_MAX, 1 + Math.floor((1 - defense / pending.power) * RAID_DAMAGE_MAX));
    const targets = save.village.buildings.filter((b) => b.kind !== 'castle' && !getBuilding(b.kind).decor && !b.damaged && effectiveLevel(b, now) > 0);
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    const broken = targets.slice(0, count);
    for (const b of broken) b.damaged = true;
    if (broken.length > 0) report = { at: now, outcome: 'damaged', damaged: broken.map((b) => getBuilding(b.kind).name) };
  }
  raid.report = report;
  raid.pending = null;
  raid.nextAt = now + interval;
  result.raidSettled = true;
}

export const VillageSystem = {
  /** Where something of this size can be put: false for a tile off the map or under another building. */
  canPlace(save: SaveData, kind: BuildingKind, x: number, y: number, ignoreId?: string, now = Date.now()): boolean {
    return fits(save, getBuilding(kind), x, y, ignoreId, now);
  },

  /** The free spot nearest to (x, y) for something of this kind, or null when the map is full. */
  findSpot(save: SaveData, kind: BuildingKind, x: number, y: number, ignoreId?: string, now = Date.now()): { x: number; y: number } | null {
    const def = getBuilding(kind);
    let best: { x: number; y: number; d: number } | null = null;
    for (let ty = 0; ty + def.h <= VILLAGE_ROWS; ty++) {
      for (let tx = 0; tx + def.w <= VILLAGE_COLS; tx++) {
        if (!fits(save, def, tx, ty, ignoreId, now)) continue;
        const d = (tx - x) ** 2 + (ty - y) ** 2;
        if (!best || d < best.d) best = { x: tx, y: ty, d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  },

  get(save: SaveData, id: string): PlacedBuilding | undefined {
    return save.village.buildings.find((b) => b.id === id);
  },

  /** What is being done to `b` now (and how long it has left), or null when nothing is. */
  work(b: PlacedBuilding, now = Date.now()): WorkInfo | null {
    if (b.upgrade && !isWorkDone(b, now)) {
      const seconds = b.upgrade.seconds;
      const elapsed = Math.max(0, now - b.upgrade.startedAt) / 1000;
      const left = Math.max(0, Math.ceil(seconds - elapsed));
      return { kind: b.level === 0 ? 'build' : 'upgrade', left, seconds, progress: Math.min(1, elapsed / seconds), totalLeft: left };
    }
    const phase = movePhase(b, now);
    if (phase && b.move) {
      const elapsed = Math.max(0, now - b.move.startedAt) / 1000;
      const seconds = phase === 'demolish' ? b.move.demolish : b.move.rebuild;
      const into = elapsed - (phase === 'demolish' ? 0 : b.move.demolish);
      return {
        kind: phase,
        left: Math.max(0, Math.ceil(seconds - into)),
        seconds,
        progress: seconds > 0 ? Math.min(1, Math.max(0, into / seconds)) : 1,
        totalLeft: Math.max(0, Math.ceil(b.move.demolish + b.move.rebuild - elapsed)),
      };
    }
    return null;
  },

  /** What is worth showing about the village at a glance (the Home box, the village's own header). */
  summary(save: SaveData, now = Date.now()): VillageSummary {
    const running = save.village.buildings.filter((b) => isWorking(b, now));
    const left = running.map((b) => VillageSystem.work(b, now)?.left ?? 0);
    return {
      castleLevel: castleLevel(save, now),
      builders: builderCount(save, now),
      busy: running.length,
      nextSeconds: left.length > 0 ? Math.min(...left) : 0,
      multiplier: incomeMultiplier(save, now),
    };
  },

  /** True when there is something to start right now: a builder is free and some building can be strengthened or
   *  another built (the Home box's nudge to come and spend). */
  hasJob(save: SaveData, now = Date.now()): boolean {
    if (busyBuilders(save, now) >= builderCount(save, now)) return false;
    if (save.village.buildings.some((b) => VillageSystem.checkUpgrade(save, b, now) === null)) return true;
    return BUILDINGS.some((def) => !def.decor && VillageSystem.checkStart(save, def.kind, now) === null);
  },

  /** Seconds until the work on `b` is done (0 when there is none, or it is). For a move, the part under way. */
  secondsLeft(b: PlacedBuilding, now = Date.now()): number {
    return VillageSystem.work(b, now)?.left ?? 0;
  },

  /** How far along the work on `b` is, 0..1. */
  progress(b: PlacedBuilding, now = Date.now()): number {
    return VillageSystem.work(b, now)?.progress ?? 1;
  },

  /** Takes in the work that has run its time: buildings that were built or strengthened are one level higher, a
   *  building whose 解体 is over stands at its new place, and a move that has run its time is over. Nothing here
   *  counts as being worked on any more. Returns what changed (for the "完成しました" notes and a redraw). */
  settle(save: SaveData, now = Date.now(), rng: () => number = Math.random): SettleResult {
    const result: SettleResult = { finished: [], relocated: [], rebuilt: [], spawned: [], expired: [], raidArrived: false, raidSettled: false };
    for (const b of save.village.buildings) {
      if (isWorkDone(b, now)) {
        b.level += 1;
        delete b.upgrade;
        result.finished.push(b);
      }
      const move = b.move;
      if (!move) continue;
      if (movePhase(b, now) !== 'demolish' && (b.x !== move.toX || b.y !== move.toY)) {
        b.x = move.toX;
        b.y = move.toY;
        result.relocated.push(b);
      }
      if (isMoveDone(b, now)) {
        delete b.move;
        result.rebuilt.push(b);
      }
    }
    advanceWanderers(save, now, rng, result);
    advanceRaid(save, now, rng, result);
    return result;
  },

  /** The 売上倍率 as it would be with one more level on `b`, and now (to show what strengthening it gives). */
  incomeAfter(save: SaveData, b: PlacedBuilding, now = Date.now()): { now: number; after: number } {
    const current = incomeMultiplier(save, now);
    const next = getBuilding(b.kind).levels[effectiveLevel(b, now)];
    if (!next) return { now: current, after: current };
    const change = next.value - levelValue(b, now);
    const shops = shopPoints(save, now) + (b.kind === 'shop' || b.kind === 'market' ? change : 0);
    const houses = houseBonus(save, now) + (b.kind === 'house' ? change : 0);
    return { now: current, after: Math.max(1, shops * (1 + houses)) };
  },

  /** What reaching a level costs in ゴールド, at the stage reached. */
  cost(save: SaveData, level: BuildingLevel): BigNumber {
    return IdleSystem.baseGoldPerHour(save).mul(level.costHours);
  },

  /** What reaching a level costs in 素材 (木材・鉄・石). */
  materialCost(level: BuildingLevel): MaterialBundle {
    return { ...(level.materials ?? {}) };
  },

  /** How many of `kind` stand (or are being built). */
  count(save: SaveData, kind: BuildingKind): number {
    return save.village.buildings.filter((b) => b.kind === kind).length;
  },

  /** How many of `kind` the 城 allows now. */
  maxCount(save: SaveData, kind: BuildingKind, now = Date.now()): number {
    const def = getBuilding(kind);
    return def.maxCount[Math.min(def.maxCount.length, castleLevel(save, now)) - 1] ?? 0;
  },

  /** The 城 level at which one more of `kind` is allowed, or null when it never is. */
  castleNeededForNext(save: SaveData, kind: BuildingKind): number | null {
    const def = getBuilding(kind);
    const have = VillageSystem.count(save, kind);
    const index = def.maxCount.findIndex((max) => max > have);
    return index < 0 ? null : index + 1;
  },

  /** Why another `kind` cannot be started now, wherever it would go (the 建築 menu asks this), or null when it can. */
  checkStart(save: SaveData, kind: BuildingKind, now = Date.now()): string | null {
    const def = getBuilding(kind);
    if (!def.buildable) return 'これは建てられません';
    if (VillageSystem.count(save, kind) >= VillageSystem.maxCount(save, kind, now)) {
      const need = VillageSystem.castleNeededForNext(save, kind);
      return need ? `城をLv${need}にすると、もう1つ建てられます` : 'これ以上は建てられません';
    }
    if (!def.decor && busyBuilders(save, now) >= builderCount(save, now)) return '建築員が全員、作業中です';
    return shortOf(save, def.levels[0]);
  },

  /** Why `kind` cannot be built at (x, y) now, or null when it can. */
  checkBuild(save: SaveData, kind: BuildingKind, x: number, y: number, now = Date.now()): string | null {
    const reason = VillageSystem.checkStart(save, kind, now);
    if (reason) return reason;
    return fits(save, getBuilding(kind), x, y, undefined, now) ? null : 'ここには置けません';
  },

  /** Starts building `kind` at (x, y): the ゴールド and 素材 are paid and the work begins. Returns the building, or
   *  null (nothing changed) when `checkBuild` says no. */
  build(save: SaveData, kind: BuildingKind, x: number, y: number, now = Date.now()): PlacedBuilding | null {
    if (VillageSystem.checkBuild(save, kind, x, y, now) !== null) return null;
    const def = getBuilding(kind);
    if (!pay(save, def.levels[0])) return null;
    // 装飾 stands as soon as it is paid for: no builder, no waiting, and nothing for the missions to count.
    const building: PlacedBuilding = def.decor
      ? { id: `b${save.village.nextId}`, kind, x, y, level: 1 }
      : { id: `b${save.village.nextId}`, kind, x, y, level: 0, upgrade: { startedAt: now, seconds: def.levels[0].seconds } };
    save.village.nextId += 1;
    save.village.buildings.push(building);
    if (!def.decor) {
      recordMission(save, 'village_build', 1, now);
      VillageQuests.record(save, 'build', 1, now);
    }
    return building;
  },

  /** Why `b` cannot be strengthened now, or null when it can. */
  checkUpgrade(save: SaveData, b: PlacedBuilding, now = Date.now()): string | null {
    const def = getBuilding(b.kind);
    if (b.damaged) return '壊れています。先に修理しましょう';
    if (isWorking(b, now)) return '作業中です';
    const level = effectiveLevel(b, now);
    const next = def.levels[level];
    if (!next) return 'これ以上は強くできません';
    if (b.kind !== 'castle' && castleLevel(save, now) < next.needCastle) return `城をLv${next.needCastle}にすると、強くできます`;
    if (busyBuilders(save, now) >= builderCount(save, now)) return '建築員が全員、作業中です';
    return shortOf(save, next);
  },

  /** Starts raising `b` one level: the ゴールド and 素材 are paid and the work begins. False (nothing changed) when
   *  `checkUpgrade` says no. */
  upgrade(save: SaveData, b: PlacedBuilding, now = Date.now()): boolean {
    // Work that has run its time is taken in first, so this starts from the level it really is.
    VillageSystem.settle(save, now);
    if (VillageSystem.checkUpgrade(save, b, now) !== null) return false;
    const next = getBuilding(b.kind).levels[b.level];
    if (!pay(save, next)) return false;
    b.upgrade = { startedAt: now, seconds: next.seconds };
    recordMission(save, 'village_build', 1, now);
    VillageQuests.record(save, 'build', 1, now);
    return true;
  },

  /** How long moving `b` takes: its 解体 and its 再建築, each a share of what its level took to build. */
  moveTimes(b: PlacedBuilding, now = Date.now()): MoveTimes {
    if (getBuilding(b.kind).decor) return { demolish: 0, rebuild: 0 };
    const built = getBuilding(b.kind).levels[effectiveLevel(b, now) - 1]?.seconds ?? 0;
    return {
      demolish: Math.max(MOVE_MIN_SECONDS, Math.round(built * MOVE_DEMOLISH_SHARE)),
      rebuild: Math.max(MOVE_MIN_SECONDS, Math.round(built * MOVE_REBUILD_SHARE)),
    };
  },

  /** Why `b` cannot be moved at all now (wherever to), or null when it can. */
  checkMoveStart(save: SaveData, b: PlacedBuilding, now = Date.now()): string | null {
    const def = getBuilding(b.kind);
    if (!def.movable) return `${def.name}は動かせません`;
    if (b.damaged) return '壊れています。先に修理しましょう';
    if (isWorking(b, now) || effectiveLevel(b, now) <= 0) return '作業中です';
    if (!def.decor && busyBuilders(save, now) >= builderCount(save, now)) return '建築員が全員、作業中です';
    return null;
  },

  /** Why `b` cannot be moved to (x, y) now, or null when it can. */
  checkMove(save: SaveData, b: PlacedBuilding, x: number, y: number, now = Date.now()): string | null {
    const reason = VillageSystem.checkMoveStart(save, b, now);
    if (reason) return reason;
    if (x === b.x && y === b.y) return '今と同じ場所です';
    return fits(save, getBuilding(b.kind), x, y, b.id, now) ? null : 'ここには置けません';
  },

  /** Starts moving `b` so its top-left tile ends up at (x, y): it is taken down where it stands, then put up
   *  again there. It keeps its level and costs nothing but a builder, and earns nothing meanwhile. False (nothing
   *  changed) when `checkMove` says no. */
  startMove(save: SaveData, b: PlacedBuilding, x: number, y: number, now = Date.now()): boolean {
    VillageSystem.settle(save, now);
    if (VillageSystem.checkMove(save, b, x, y, now) !== null) return false;
    // 装飾 is just picked up and put down.
    if (getBuilding(b.kind).decor) {
      b.x = x;
      b.y = y;
      return true;
    }
    const times = VillageSystem.moveTimes(b, now);
    b.move = { startedAt: now, demolish: times.demolish, rebuild: times.rebuild, toX: x, toY: y };
    return true;
  },

  // --------------------------------------------------------- 撤去

  /** What taking `b` away gives back: a share of the 素材 that every level it has reached took. */
  removeRefund(b: PlacedBuilding, now = Date.now()): MaterialBundle {
    const levels = getBuilding(b.kind).levels.slice(0, effectiveLevel(b, now));
    const out: MaterialBundle = {};
    for (const { id } of VILLAGE_MATERIALS) {
      const total = levels.reduce((sum, level) => sum + (level.materials?.[id] ?? 0), 0);
      const back = Math.floor(total * REMOVE_REFUND_SHARE + 1e-9);
      if (back > 0) out[id] = back;
    }
    return out;
  },

  /** Why `b` cannot be removed now, or null when it can. */
  checkRemove(save: SaveData, b: PlacedBuilding, now = Date.now()): string | null {
    const def = getBuilding(b.kind);
    if (def.removable === false) return `${def.name}は撤去できません`;
    if (isWorking(b, now) || effectiveLevel(b, now) <= 0) return '作業が終わってから撤去できます';
    return save.village.buildings.includes(b) ? null : 'もう村にありません';
  },

  /** Takes `b` away at once: its place is free and the 素材 it gives back go to the village. Returns what was given
   *  back, or null (nothing changed) when `checkRemove` says no. */
  remove(save: SaveData, b: PlacedBuilding, now = Date.now()): MaterialBundle | null {
    VillageSystem.settle(save, now);
    if (VillageSystem.checkRemove(save, b, now) !== null) return null;
    const refund = VillageSystem.removeRefund(b, now);
    SaveSystem.addMaterials(save, refund);
    save.village.buildings = save.village.buildings.filter((other) => other !== b);
    return refund;
  },

  // ---------------------------------------------------------- 防衛

  /** 防衛 now: every 柵 and 門 that stands and is not broken, added up. */
  defense(save: SaveData, now = Date.now()): number {
    return defensePoints(save, now);
  },

  // ------------------------------------------------------------- 襲撃

  /** How strong a 襲撃 is at the region reached. */
  raidPower(save: SaveData): number {
    return RAID_POWER[regionReached(save)];
  },

  /** Seconds a waiting 襲撃 will still wait (0 when none is). */
  raidSecondsLeft(save: SaveData, now = Date.now()): number {
    const pending = save.village.raid.pending;
    return pending ? Math.max(0, Math.ceil((pending.expiresAt - now) / 1000)) : 0;
  },

  /** What to start the battle with for the waiting 襲撃 (BattleScene's 'raid' mode), or null when none is waiting. */
  raidBattle(save: SaveData): { stageIndex: number; mode: 'raid'; seed: number } | null {
    const pending = save.village.raid.pending;
    if (!pending) return null;
    const like = Math.max(0, Math.min(MAIN_STAGE_COUNT - 1, save.stageProgress - 1 - RAID_STAGES_BELOW));
    return { stageIndex: like, mode: 'raid', seed: Math.floor(pending.arrivedAt / 1000) };
  },

  /** What beating a waiting 襲撃 would pay (for showing before the fight). Null when none is waiting. */
  raidReward(save: SaveData): RaidWin | null {
    const pending = save.village.raid.pending;
    if (!pending) return null;
    const table = RAID_REWARD_MATERIALS[Math.min(RAID_REWARD_MATERIALS.length - 1, pending.region)];
    return { materials: { ...table }, gold: IdleSystem.baseGoldPerHour(save).mul(RAID_REWARD_GOLD_HOURS) };
  },

  /** A 襲撃 was beaten in battle: it is over, its pay goes to the village and the next one's clock starts. Null
   *  (nothing changed) when none is waiting (it was settled while the fight went on). */
  winRaid(save: SaveData, now = Date.now()): RaidWin | null {
    const reward = VillageSystem.raidReward(save);
    if (!reward) return null;
    SaveSystem.addMaterials(save, reward.materials);
    SaveSystem.addGold(save, reward.gold);
    save.village.raid.pending = null;
    save.village.raid.nextAt = now + RAID_INTERVAL_HOURS * HOUR_MS;
    save.village.raid.won += 1;
    VillageQuests.record(save, 'raid', 1, now);
    return reward;
  },

  /** What happened to a 襲撃 nobody answered, once: taking it clears it. */
  takeRaidReport(save: SaveData): RaidReport | null {
    const report = save.village.raid.report;
    save.village.raid.report = null;
    return report;
  },

  // ------------------------------------------------------------- repairs

  /** What mending a broken building costs: a share of the 素材 its level took. */
  repairCost(b: PlacedBuilding, now = Date.now()): MaterialBundle {
    const bundle = getBuilding(b.kind).levels[effectiveLevel(b, now) - 1]?.materials ?? {};
    const out: MaterialBundle = {};
    for (const { id } of VILLAGE_MATERIALS) if ((bundle[id] ?? 0) > 0) out[id] = Math.max(1, Math.ceil((bundle[id] ?? 0) * REPAIR_SHARE - 1e-9));
    return out;
  },

  /** Why `b` cannot be repaired now, or null when it can. */
  checkRepair(save: SaveData, b: PlacedBuilding, now = Date.now()): string | null {
    if (!b.damaged) return '壊れていません';
    const missing = SaveSystem.missingMaterials(save, VillageSystem.repairCost(b, now));
    return missing.length > 0 ? `${missing.map(materialName).join('・')}が足りません` : null;
  },

  /** Mends `b`: the 素材 are paid and it works again at once. False (nothing changed) when `checkRepair` says no. */
  repair(save: SaveData, b: PlacedBuilding, now = Date.now()): boolean {
    if (VillageSystem.checkRepair(save, b, now) !== null) return false;
    if (!SaveSystem.spendMaterials(save, VillageSystem.repairCost(b, now))) return false;
    delete b.damaged;
    VillageQuests.record(save, 'repair', 1, now);
    return true;
  },

  // -------------------------------------------------- hurrying, and builders

  /** What finishing the work on `b` at once costs in 魔晶石 (0 when there is none to finish). */
  finishCost(b: PlacedBuilding, now = Date.now()): number {
    const work = VillageSystem.work(b, now);
    if (!work) return 0;
    return Math.min(FINISH_GEMS_MAX, Math.max(1, Math.ceil(work.totalLeft / 600)) * FINISH_GEMS_PER_10_MIN);
  },

  /** Why the work on `b` cannot be finished at once, or null when it can. */
  checkFinish(save: SaveData, b: PlacedBuilding, now = Date.now()): string | null {
    if (!VillageSystem.work(b, now)) return '作業中ではありません';
    return save.gems >= VillageSystem.finishCost(b, now) ? null : '魔晶石が足りません';
  },

  /** Pays 魔晶石 and finishes the work on `b` now (building, strengthening, or the rest of a move). False (nothing
   *  changed) when `checkFinish` says no. */
  finishNow(save: SaveData, b: PlacedBuilding, now = Date.now()): boolean {
    if (VillageSystem.checkFinish(save, b, now) !== null) return false;
    if (!SaveSystem.spendGems(save, VillageSystem.finishCost(b, now))) return false;
    if (b.upgrade) b.upgrade.startedAt = now - b.upgrade.seconds * 1000;
    if (b.move) b.move.startedAt = now - (b.move.demolish + b.move.rebuild) * 1000;
    VillageSystem.settle(save, now);
    return true;
  },

  /** What the next extra builder costs in 魔晶石, or null when there are no more to buy. */
  nextBuilderGems(save: SaveData): number | null {
    return EXTRA_BUILDER_GEMS[save.village.extraBuilders] ?? null;
  },

  /** Why another builder cannot be bought now, or null when it can. */
  checkBuyBuilder(save: SaveData): string | null {
    const cost = VillageSystem.nextBuilderGems(save);
    if (cost === null) return 'これ以上は増やせません';
    return save.gems >= cost ? null : '魔晶石が足りません';
  },

  /** Buys one more builder with 魔晶石. False (nothing changed) when `checkBuyBuilder` says no. */
  buyBuilder(save: SaveData): boolean {
    const cost = VillageSystem.nextBuilderGems(save);
    if (VillageSystem.checkBuyBuilder(save) !== null || cost === null) return false;
    if (!SaveSystem.spendGems(save, cost)) return false;
    save.village.extraBuilders += 1;
    return true;
  },

  // ------------------------------------------------- 行商人 and 宝箱

  /** Opens a 行商人 / 宝箱: its 素材 (and gold) go to the village and it is gone. Null (nothing changed) when it is not
   *  there any more. */
  collect(save: SaveData, id: string, now = Date.now()): Collected | null {
    const w = save.village.wanderers.items.find((item) => item.id === id);
    if (!w || now >= w.expiresAt) return null;
    SaveSystem.addMaterials(save, w.materials);
    const gold = w.goldHours > 0 ? IdleSystem.baseGoldPerHour(save).mul(w.goldHours) : BigNumber.ZERO;
    if (w.goldHours > 0) SaveSystem.addGold(save, gold);
    save.village.wanderers.items = save.village.wanderers.items.filter((item) => item.id !== id);
    VillageQuests.record(save, 'collect', 1, now);
    return { wanderer: w, gold };
  },

  // ----------------------------------------------------- what needs a look

  /** What is waiting for the player in the village (for the Home box's nudge): a 襲撃, chores to collect, broken
   *  buildings, 行商人 / 宝箱 on the map. */
  attention(save: SaveData, now = Date.now()): { raid: boolean; quests: number; broken: number; wanderers: number } {
    return {
      raid: !!save.village.raid.pending && now < save.village.raid.pending.expiresAt,
      quests: VillageQuests.claimable(save, now).length,
      broken: save.village.buildings.filter((b) => b.damaged).length,
      wanderers: save.village.wanderers.items.filter((w) => now < w.expiresAt).length,
    };
  },
};
