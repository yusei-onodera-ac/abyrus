import { BigNumber } from './BigNumber';
import { BattleSystem, ULT_GAIN, ULT_MAX, type UnitInstance } from './BattleSystem';
import { castSkill, effectiveAtk, effectiveDef, isStunned, pickFrontPreferred, type SkillTargetResult } from './SkillEngine';
import { ENEMY_CLASSES, NAME_P1, NAME_P2, type EnemyUnitDef } from './ProgressionSystem';
import type { HeroData, Rarity, Row } from '../types';

export interface EnemySlotPosition {
  row: Row;
  slot: number;
}

// Same 3-front/2-back footprint as a stage battle's enemy side, so Infinite
// Mode's arena reads as the same kind of fight rather than a different game.
const ENEMY_SLOTS: EnemySlotPosition[] = [
  { row: 'front', slot: 0 },
  { row: 'front', slot: 1 },
  { row: 'front', slot: 2 },
  { row: 'back', slot: 0 },
  { row: 'back', slot: 1 },
];
export const ENEMY_SLOT_COUNT = ENEMY_SLOTS.length;

/** How many of the 5 enemy slots are live at a given survival time: starts
 *  at 1, unlocks one more every UNLOCK_INTERVAL_MS, caps at all 5. This is
 *  the "enemy count" half of the escalating difficulty. */
const UNLOCK_INTERVAL_MS = 25_000;
export function getActiveSlotCount(elapsedMs: number): number {
  return Math.min(ENEMY_SLOT_COUNT, 1 + Math.floor(elapsedMs / UNLOCK_INTERVAL_MS));
}

/** Per-slot respawn delay: starts slow and asymptotically falls toward (but
 *  never quite reaches) a floor, so individual slots keep respawning faster
 *  for the entire run - not just until every slot unlocks. Concurrent enemy
 *  count caps out for sane rendering, but spawn rate never stops climbing,
 *  so the pressure never truly plateaus. This is the "spawn rate" half of
 *  the escalating difficulty. */
const RESPAWN_START_MS = 3400;
const RESPAWN_FLOOR_MS = 550;
const RESPAWN_HALF_LIFE_MS = 40_000;
export function getRespawnDelayMs(elapsedMs: number): number {
  return RESPAWN_FLOOR_MS + (RESPAWN_START_MS - RESPAWN_FLOOR_MS) / (1 + elapsedMs / RESPAWN_HALF_LIFE_MS);
}

/** Continuous "stage-equivalent" index driving enemy strength. Fed straight
 *  into ProgressionSystem.computeEnemyStats (whose stageIndex parameter is a
 *  plain number, fractional values included), so Infinite Mode escalates
 *  along the exact same growth curve as the stage campaign instead of a
 *  second, unrelated one - every ~15 survived seconds is worth one "stage"
 *  of growth. This is unbounded: there is no cap, ever. */
const SECONDS_PER_DIFFICULTY_STAGE = 15;
export function getDifficultyIndex(elapsedMs: number): number {
  return elapsedMs / 1000 / SECONDS_PER_DIFFICULTY_STAGE;
}

function pickEnemyDef(difficultyIndex: number): EnemyUnitDef {
  const rarity = Math.min(5, 1 + Math.floor(difficultyIndex / 6)) as Rarity;
  return {
    seed: Math.floor(Math.random() * 2 ** 31),
    heroClass: ENEMY_CLASSES[Math.floor(Math.random() * ENEMY_CLASSES.length)],
    rarity,
    name: NAME_P1[Math.floor(Math.random() * NAME_P1.length)] + NAME_P2[Math.floor(Math.random() * NAME_P2.length)],
  };
}

// --- Scoring --------------------------------------------------------------
// The score comes from the enemies defeated, and only from them - surviving
// longer pays off only through the kills it allows. Each kill is worth more
// the deeper the run has gone (enemies grow stronger with time), so pushing on
// against tougher enemies beats farming weak ones.
const KILL_BASE_POINTS = 40;
const KILL_DIFFICULTY_WEIGHT = 0.6;

function killPoints(difficultyIndex: number): number {
  return KILL_BASE_POINTS * (1 + difficultyIndex * KILL_DIFFICULTY_WEIGHT);
}

export interface InfiniteRunSnapshot {
  elapsedMs: number;
  survivalSeconds: number;
  score: number;
  enemiesDefeated: number;
  difficultyIndex: number;
}

export type InfiniteBattleEvent =
  | { kind: 'attack'; attackerId: string; targetId: string; damage: BigNumber; crit: boolean }
  | { kind: 'skillCast'; casterId: string; skillName: string; effectKind: string; results: SkillTargetResult[] }
  | { kind: 'ultCharged'; unitId: string }
  | { kind: 'defeated'; unitId: string; isPlayer: boolean }
  | { kind: 'enemySpawned'; unit: UnitInstance; position: EnemySlotPosition }
  | { kind: 'runOver' };

/**
 * Drives one Infinite Mode run: a fixed player party against an endless,
 * ever-escalating stream of enemies. Modeled closely on BattleSystem's
 * BattleEngine (same UnitInstance shape, same attack-resolution formula -
 * variance, crit, def mitigation, ult gauge -> skill cast), but written as
 * its own class rather than reusing BattleEngine directly: BattleEngine ends
 * the instant the enemy side is wiped, which is exactly what must *not*
 * happen here - enemies are expected to run out between spawns, every
 * single slot cooldown, for the entire run. The only way this run ends is
 * the player's party being wiped, or the player retreating. Skill-casting
 * itself (castSkill/effectiveAtk/effectiveDef/isStunned/pickFrontPreferred)
 * is factored into SkillEngine precisely so that shared part doesn't drift
 * between the two engines.
 */
export class InfiniteRunEngine {
  readonly playerUnits: UnitInstance[];
  private enemySlotUnits: (UnitInstance | null)[];
  private nextSpawnAt: number[];
  private elapsedMs = 0;
  private enemiesDefeated = 0;
  private killPoints = 0;
  private over = false;

  constructor(party: { front: HeroData[]; back: HeroData[] }) {
    this.playerUnits = [
      ...party.front.map((hero, i) => BattleSystem.createPlayerUnit(hero, 'front', i)),
      ...party.back.map((hero, i) => BattleSystem.createPlayerUnit(hero, 'back', i)),
    ];
    this.enemySlotUnits = ENEMY_SLOTS.map(() => null);
    this.nextSpawnAt = ENEMY_SLOTS.map(() => 0);
  }

  isOver(): boolean {
    return this.over;
  }

  getSnapshot(): InfiniteRunSnapshot {
    const difficultyIndex = getDifficultyIndex(this.elapsedMs);
    const survivalSeconds = this.elapsedMs / 1000;
    const score = Math.round(this.killPoints);
    return { elapsedMs: this.elapsedMs, survivalSeconds, score, enemiesDefeated: this.enemiesDefeated, difficultyIndex };
  }

  getEnemySlots(): { position: EnemySlotPosition; unit: UnitInstance | null }[] {
    return ENEMY_SLOTS.map((position, i) => ({ position, unit: this.enemySlotUnits[i] }));
  }

  /** Player-initiated early end (the "リタイア" button) - still produces a
   *  final snapshot/score, just like surviving until the party wipes. */
  retreat(): void {
    this.over = true;
  }

  triggerUlt(unitId: string): InfiniteBattleEvent[] {
    if (this.over) return [];
    const unit = this.playerUnits.find((u) => u.id === unitId);
    if (!unit || !unit.alive || !unit.isPlayer || unit.ultGauge < ULT_MAX || unit.skills.length === 0) return [];

    const skill = unit.skills[unit.nextSkillIndex % unit.skills.length];
    unit.nextSkillIndex += 1;
    unit.ultGauge = 0;

    const outcome = castSkill(unit, skill.def, skill.level, this.playerUnits, this.activeEnemies(), this.elapsedMs);
    const events: InfiniteBattleEvent[] = [
      { kind: 'skillCast', casterId: unit.id, skillName: outcome.skillName, effectKind: outcome.effectKind, results: outcome.results },
    ];
    for (const id of outcome.defeatedIds) {
      events.push({ kind: 'defeated', unitId: id, isPlayer: false });
      this.enemiesDefeated += 1;
      this.killPoints += killPoints(getDifficultyIndex(this.elapsedMs));
    }
    return events;
  }

  update(deltaMs: number): InfiniteBattleEvent[] {
    if (this.over) return [];
    this.elapsedMs += deltaMs;
    const events: InfiniteBattleEvent[] = [...this.trySpawns()];

    const allUnits: UnitInstance[] = [...this.playerUnits, ...this.activeEnemies()];
    for (const unit of allUnits) {
      if (!unit.alive || isStunned(unit, this.elapsedMs)) continue;
      unit.cooldown -= deltaMs * (unit.spd / 100);
      if (unit.cooldown <= 0) {
        unit.cooldown += unit.baseCooldown;
        events.push(...this.performAttack(unit));
      }
    }

    if (!this.playerUnits.some((u) => u.alive)) {
      this.over = true;
      events.push({ kind: 'runOver' });
    }
    return events;
  }

  private activeEnemies(): UnitInstance[] {
    return this.enemySlotUnits.filter((u): u is UnitInstance => !!u && u.alive);
  }

  private trySpawns(): InfiniteBattleEvent[] {
    const events: InfiniteBattleEvent[] = [];
    const activeSlotCount = getActiveSlotCount(this.elapsedMs);
    for (let i = 0; i < ENEMY_SLOTS.length; i++) {
      if (i >= activeSlotCount) continue;
      const occupant = this.enemySlotUnits[i];
      if (occupant && occupant.alive) continue;
      if (this.elapsedMs < this.nextSpawnAt[i]) continue;

      const difficultyIndex = getDifficultyIndex(this.elapsedMs);
      const def = pickEnemyDef(difficultyIndex);
      const position = ENEMY_SLOTS[i];
      const unit = BattleSystem.createEnemyUnit(def, difficultyIndex, position.row, position.slot);
      this.enemySlotUnits[i] = unit;
      this.nextSpawnAt[i] = this.elapsedMs + getRespawnDelayMs(this.elapsedMs);
      events.push({ kind: 'enemySpawned', unit, position });
    }
    return events;
  }

  private pickTarget(attacker: UnitInstance): UnitInstance | null {
    const opponents = attacker.isPlayer ? this.activeEnemies() : this.playerUnits.filter((u) => u.alive);
    return pickFrontPreferred(opponents);
  }

  // Mirrors BattleEngine's private performAttack formula exactly (variance,
  // crit, def mitigation, ult-gauge gain) - see the class doc comment for
  // why this is a parallel implementation rather than a shared call.
  private performAttack(attacker: UnitInstance): InfiniteBattleEvent[] {
    const target = this.pickTarget(attacker);
    if (!target) return [];
    const events: InfiniteBattleEvent[] = [];

    const variance = 0.9 + Math.random() * 0.2;
    const crit = Math.random() < attacker.critRate;
    let damage = effectiveAtk(attacker, this.elapsedMs).mul(variance);
    if (crit) damage = damage.mul(attacker.critMul);
    damage = damage.mul(100 / (100 + effectiveDef(target, this.elapsedMs)));

    target.hp = target.hp.sub(damage);
    let defeated = false;
    if (target.hp.lte(BigNumber.ZERO)) {
      target.hp = BigNumber.ZERO;
      target.alive = false;
      defeated = true;
    }

    events.push({ kind: 'attack', attackerId: attacker.id, targetId: target.id, damage, crit });
    if (defeated) {
      events.push({ kind: 'defeated', unitId: target.id, isPlayer: target.isPlayer });
      if (!target.isPlayer) {
        this.enemiesDefeated += 1;
        this.killPoints += killPoints(getDifficultyIndex(this.elapsedMs));
      }
    }

    if (attacker.isPlayer) {
      attacker.ultGauge = Math.min(ULT_MAX, attacker.ultGauge + ULT_GAIN);
      if (attacker.ultGauge >= ULT_MAX) events.push({ kind: 'ultCharged', unitId: attacker.id });
    }
    return events;
  }
}
