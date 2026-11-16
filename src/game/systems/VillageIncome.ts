import { RAID_POWER, VILLAGE_BUILDERS, VILLAGE_MATERIALS, getBuilding, type VillageMaterial } from '../data/village';
import { MAIN_STAGE_COUNT, STAGES_PER_REGION } from './ProgressionSystem';
import type { PlacedBuilding, SaveData } from './SaveSystem';

/**
 * What the village is worth right now, read from the save and the clock alone - nothing is changed, so
 * IdleSystem can use it without a village screen ever having been opened. Kept apart from VillageSystem
 * (which acts on the village and needs IdleSystem's gold rate) so the two do not import each other.
 */

/** True once the work on a building has run its time. A clock set back only makes it later, never earlier. */
export function isWorkDone(building: PlacedBuilding, now = Date.now()): boolean {
  return !!building.upgrade && now - building.upgrade.startedAt >= building.upgrade.seconds * 1000;
}

/** The level a building counts at: work that has run its time counts even if nobody has opened the village since. */
export function effectiveLevel(building: PlacedBuilding, now = Date.now()): number {
  return building.level + (isWorkDone(building, now) ? 1 : 0);
}

/** Seconds a move has run (0 when the clock was set back). */
function moveElapsed(move: NonNullable<PlacedBuilding['move']>, now: number): number {
  return Math.max(0, now - move.startedAt) / 1000;
}

/** True once a move has run its whole time (the 解体 and the 再建築). */
export function isMoveDone(building: PlacedBuilding, now = Date.now()): boolean {
  return !!building.move && moveElapsed(building.move, now) >= building.move.demolish + building.move.rebuild;
}

/** True while a building is being taken down or put up again, and so earns nothing. */
export function isMoving(building: PlacedBuilding, now = Date.now()): boolean {
  return !!building.move && !isMoveDone(building, now);
}

/** Which part of a move is under way: '解体' (still at its old place) or '再建築' (at the new one), or null when none is. */
export function movePhase(building: PlacedBuilding, now = Date.now()): 'demolish' | 'rebuild' | null {
  if (!building.move || isMoveDone(building, now)) return null;
  return moveElapsed(building.move, now) < building.move.demolish ? 'demolish' : 'rebuild';
}

/** The top-left tiles a building takes up now: where it stands, and - while a move is under way - the place it is
 *  going to, which is kept for it from the moment the move starts. Once the 解体 is over only the new place counts. */
export function footprints(building: PlacedBuilding, now = Date.now()): { x: number; y: number }[] {
  const move = building.move;
  const here = { x: building.x, y: building.y };
  if (!move) return [here];
  const target = { x: move.toX, y: move.toY };
  return movePhase(building, now) === 'demolish' ? [here, target] : [target];
}

/** The 城's level (at least 1). */
export function castleLevel(save: SaveData, now = Date.now()): number {
  let level = 1;
  for (const b of save.village.buildings) if (b.kind === 'castle') level = Math.max(level, effectiveLevel(b, now));
  return level;
}

/** How many builders there are: what this 城 level gives, and the ones bought with 魔晶石. */
export function builderCount(save: SaveData, now = Date.now()): number {
  return VILLAGE_BUILDERS[Math.min(VILLAGE_BUILDERS.length, castleLevel(save, now)) - 1] + save.village.extraBuilders;
}

/** True while a builder is on this building: it is being built, strengthened or moved, and the time has not run yet. */
export function isWorking(building: PlacedBuilding, now = Date.now()): boolean {
  return (!!building.upgrade && !isWorkDone(building, now)) || isMoving(building, now);
}

/** How many builders are busy: buildings with work under way that has not run its time yet. */
export function busyBuilders(save: SaveData, now = Date.now()): number {
  return save.village.buildings.filter((b) => isWorking(b, now)).length;
}

/** `value` of the building at the level it counts at (0 while it is still being built, while it is being moved, and
 *  while it is broken). */
export function levelValue(building: PlacedBuilding, now = Date.now()): number {
  if (isMoving(building, now) || building.damaged) return 0;
  const level = effectiveLevel(building, now);
  return level <= 0 ? 0 : (getBuilding(building.kind).levels[level - 1]?.value ?? 0);
}

/** Every 店 and 市場 added up, in units of a level-1 店. */
export function shopPoints(save: SaveData, now = Date.now()): number {
  let sum = 0;
  for (const b of save.village.buildings) if (b.kind === 'shop' || b.kind === 'market') sum += levelValue(b, now);
  return sum;
}

/** What every 民家 adds to the shops, as a fraction (0.12 = +12%). */
export function houseBonus(save: SaveData, now = Date.now()): number {
  let sum = 0;
  for (const b of save.village.buildings) if (b.kind === 'house') sum += levelValue(b, now);
  return sum;
}

/** 売上倍率: what the 放置報酬 gold is multiplied by. 1 = a village of one level-1 店. Never below 1, so a
 *  damaged village can only ever pay what 放置報酬 paid before there was one. */
export function incomeMultiplier(save: SaveData, now = Date.now()): number {
  return Math.max(1, shopPoints(save, now) * (1 + houseBonus(save, now)));
}

/** 素材 an hour that the 採集施設 add to the 放置報酬 (木材・鉄・石). */
export function materialRates(save: SaveData, now = Date.now()): Record<VillageMaterial, number> {
  const rates = Object.fromEntries(VILLAGE_MATERIALS.map(({ id }) => [id, 0])) as Record<VillageMaterial, number>;
  for (const b of save.village.buildings) {
    const produces = getBuilding(b.kind).produces;
    if (produces) rates[produces] += levelValue(b, now);
  }
  return rates;
}

/** 防衛: what every 柵 and 門 that stands (and is not broken) adds up to. A 襲撃 is turned away when this reaches its power. */
export function defensePoints(save: SaveData, now = Date.now()): number {
  let sum = 0;
  for (const b of save.village.buildings) if (getBuilding(b.kind).defense) sum += levelValue(b, now);
  return sum;
}

/** The region the player has got to in the campaign (0 = 迷いの森 ... 4 = 黄昏の都): it sets how strong a 襲撃 is and how much
 *  the village's side pay-outs (行商人, 宝箱, 依頼) come to. */
export function regionReached(save: SaveData): number {
  const stageIndex = Math.max(0, Math.min(MAIN_STAGE_COUNT - 1, save.stageProgress - 1));
  return Math.min(RAID_POWER.length - 1, Math.floor(stageIndex / STAGES_PER_REGION));
}
