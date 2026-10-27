import { BigNumber } from './BigNumber';
import { ProgressionSystem, type EnemyUnitDef } from './ProgressionSystem';
import type { HeroClass, HeroData, Rarity, Row } from '../types';

export interface UnitInstance {
  id: string;
  name: string;
  isPlayer: boolean;
  row: Row;
  slot: number;
  heroClass: HeroClass;
  rarity: Rarity;
  seed: number;
  /** Roster hero id (player units only); lets the view use its illustration. */
  heroId?: string;
  maxHp: BigNumber;
  hp: BigNumber;
  atk: BigNumber;
  def: number;
  spd: number;
  critRate: number;
  critMul: number;
  ultGauge: number;
  cooldown: number;
  baseCooldown: number;
  alive: boolean;
}

export type BattleEvent =
  | { kind: 'attack'; attackerId: string; targetId: string; damage: BigNumber; crit: boolean; isUlt: boolean }
  | { kind: 'ultCharged'; unitId: string }
  | { kind: 'defeated'; unitId: string }
  | { kind: 'victory' }
  | { kind: 'defeat' };

const ULT_GAIN = 25;
const ULT_MAX = 100;
const ULT_MULTIPLIER = 3.2;
const BASE_COOLDOWN = 1200;

export const BattleSystem = {
  createPlayerUnit(hero: HeroData, row: Row, slot: number): UnitInstance {
    const stats = ProgressionSystem.computeHeroStats(hero);
    return {
      id: hero.id,
      name: hero.name,
      isPlayer: true,
      row,
      slot,
      heroClass: hero.heroClass,
      rarity: hero.rarity,
      seed: hero.seed,
      heroId: hero.heroId,
      maxHp: stats.maxHp,
      hp: stats.maxHp,
      atk: stats.atk,
      def: stats.def,
      spd: stats.spd,
      critRate: stats.critRate,
      critMul: stats.critMul,
      ultGauge: 0,
      cooldown: BASE_COOLDOWN,
      baseCooldown: BASE_COOLDOWN,
      alive: true,
    };
  },

  createEnemyUnit(def: EnemyUnitDef, stageIndex: number, row: Row, slot: number): UnitInstance {
    const stats = ProgressionSystem.computeEnemyStats(def, stageIndex);
    return {
      id: `enemy-${row}-${slot}-${def.seed}`,
      name: def.name,
      isPlayer: false,
      row,
      slot,
      heroClass: def.heroClass,
      rarity: def.rarity,
      seed: def.seed,
      maxHp: stats.maxHp,
      hp: stats.maxHp,
      atk: stats.atk,
      def: stats.def,
      spd: stats.spd,
      critRate: stats.critRate,
      critMul: stats.critMul,
      ultGauge: 0,
      cooldown: BASE_COOLDOWN,
      baseCooldown: BASE_COOLDOWN,
      alive: true,
    };
  },
};

/**
 * Real-time turn engine: every unit ticks down an SPD-scaled cooldown and
 * auto-attacks when it expires. Player units also build an ult gauge on
 * every normal attack, which can only be spent via an explicit triggerUlt
 * call (i.e. a tap on the hero), never automatically.
 */
export class BattleEngine {
  units: UnitInstance[];
  private finished = false;

  constructor(playerUnits: UnitInstance[], enemyUnits: UnitInstance[]) {
    this.units = [...playerUnits, ...enemyUnits];
  }

  get playerUnits(): UnitInstance[] {
    return this.units.filter((u) => u.isPlayer);
  }

  get enemyUnits(): UnitInstance[] {
    return this.units.filter((u) => !u.isPlayer);
  }

  isOver(): boolean {
    return this.finished;
  }

  update(deltaMs: number): BattleEvent[] {
    if (this.finished) return [];
    const events: BattleEvent[] = [];
    for (const unit of this.units) {
      if (!unit.alive) continue;
      unit.cooldown -= deltaMs * (unit.spd / 100);
      if (unit.cooldown <= 0) {
        unit.cooldown += unit.baseCooldown;
        const result = this.performAttack(unit, false);
        if (result) events.push(...result);
      }
      if (this.finished) break;
    }
    if (!this.finished) {
      const outcome = this.checkOutcome();
      if (outcome) {
        this.finished = true;
        events.push({ kind: outcome });
      }
    }
    return events;
  }

  triggerUlt(unitId: string): BattleEvent[] {
    if (this.finished) return [];
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || !unit.alive || !unit.isPlayer || unit.ultGauge < ULT_MAX) return [];
    const events = this.performAttack(unit, true) ?? [];
    if (!this.finished) {
      const outcome = this.checkOutcome();
      if (outcome) {
        this.finished = true;
        events.push({ kind: outcome });
      }
    }
    return events;
  }

  private pickTarget(attacker: UnitInstance): UnitInstance | null {
    const opponents = this.units.filter((u) => u.isPlayer !== attacker.isPlayer && u.alive);
    if (opponents.length === 0) return null;
    const front = opponents.filter((u) => u.row === 'front');
    const pool = front.length > 0 ? front : opponents;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private performAttack(attacker: UnitInstance, isUlt: boolean): BattleEvent[] | null {
    const target = this.pickTarget(attacker);
    if (!target) return null;
    const events: BattleEvent[] = [];

    const variance = 0.9 + Math.random() * 0.2;
    const crit = Math.random() < attacker.critRate + (isUlt ? 0.1 : 0);
    let damage = attacker.atk.mul(variance);
    if (isUlt) damage = damage.mul(ULT_MULTIPLIER);
    if (crit) damage = damage.mul(attacker.critMul);
    damage = damage.mul(100 / (100 + target.def));

    target.hp = target.hp.sub(damage);
    let defeated = false;
    if (target.hp.lte(BigNumber.ZERO)) {
      target.hp = BigNumber.ZERO;
      target.alive = false;
      defeated = true;
    }

    events.push({ kind: 'attack', attackerId: attacker.id, targetId: target.id, damage, crit, isUlt });
    if (defeated) events.push({ kind: 'defeated', unitId: target.id });

    if (isUlt) {
      attacker.ultGauge = 0;
    } else if (attacker.isPlayer) {
      attacker.ultGauge = Math.min(ULT_MAX, attacker.ultGauge + ULT_GAIN);
      if (attacker.ultGauge >= ULT_MAX) events.push({ kind: 'ultCharged', unitId: attacker.id });
    }
    return events;
  }

  private checkOutcome(): 'victory' | 'defeat' | null {
    if (!this.enemyUnits.some((u) => u.alive)) return 'victory';
    if (!this.playerUnits.some((u) => u.alive)) return 'defeat';
    return null;
  }
}
