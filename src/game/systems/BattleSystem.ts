import { BigNumber } from './BigNumber';
import { ProgressionSystem, type EnemyUnitDef } from './ProgressionSystem';
import { castSkill, effectiveAtk, effectiveDef, isInvincible, isStunned, pickFrontPreferred, type SkillTargetResult } from './SkillEngine';
import { getUnlockedSkillsForHero, type UnlockedSkill } from '../data/skills';
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
  /** Enemy picture id (enemy units only), see EnemyUnitDef.art. */
  art?: string;
  /** A boss is drawn larger. */
  isBoss?: boolean;
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
  /** This hero's currently-unlocked skills (player units only; empty for
   *  enemies), cast in round-robin order on each ult trigger. */
  skills: UnlockedSkill[];
  nextSkillIndex: number;
  /** Status multipliers applied to atk/def while `now < ...StatusUntil`,
   *  set by buff_atk/buff_def/debuff_atk/debuff_def skills. 1 = no effect. */
  atkStatusMul: number;
  atkStatusUntil: number;
  defStatusMul: number;
  defStatusUntil: number;
  /** Set by a stun skill; the unit skips its turn while `now < this`. */
  stunnedUntil: number;
  /** Set by a 無敵 skill; hits on the unit deal nothing while `now < this`. */
  invincibleUntil: number;
}

export type BattleEvent =
  | { kind: 'attack'; attackerId: string; targetId: string; damage: BigNumber; crit: boolean; blocked?: boolean }
  | { kind: 'skillCast'; casterId: string; skillName: string; effectKind: string; results: SkillTargetResult[] }
  | { kind: 'ultCharged'; unitId: string }
  | { kind: 'defeated'; unitId: string }
  | { kind: 'victory' }
  | { kind: 'defeat' };

// Exported so InfiniteModeSystem's own attack-resolution loop (which can't
// reuse BattleEngine directly - its win-the-moment-enemies-are-wiped
// lifecycle doesn't fit an endless mode) can stay tuned identically to
// stage battles instead of drifting with a second copy of these numbers.
export const ULT_GAIN = 25;
export const ULT_MAX = 100;
export const BASE_COOLDOWN = 1200;

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
      skills: getUnlockedSkillsForHero(hero),
      nextSkillIndex: 0,
      atkStatusMul: 1,
      atkStatusUntil: 0,
      defStatusMul: 1,
      defStatusUntil: 0,
      stunnedUntil: 0,
      invincibleUntil: 0,
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
      art: def.art,
      isBoss: def.isBoss,
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
      skills: [],
      nextSkillIndex: 0,
      atkStatusMul: 1,
      atkStatusUntil: 0,
      defStatusMul: 1,
      defStatusUntil: 0,
      stunnedUntil: 0,
      invincibleUntil: 0,
    };
  },
};

/**
 * Real-time turn engine: every unit ticks down an SPD-scaled cooldown and
 * auto-attacks when it expires. Player units also build an ult gauge on
 * every normal attack; spending it via an explicit triggerUlt call (i.e. a
 * tap on the hero) casts that hero's next unlocked skill in round-robin
 * order rather than a generic ultimate, so a ★5 hero with all 4 slots
 * unlocked cycles through all 4 real effects over a long fight.
 */
export class BattleEngine {
  units: UnitInstance[];
  private finished = false;
  private clockMs = 0;

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
    this.clockMs += deltaMs;
    const events: BattleEvent[] = [];
    for (const unit of this.units) {
      if (!unit.alive || isStunned(unit, this.clockMs)) continue;
      unit.cooldown -= deltaMs * (unit.spd / 100);
      if (unit.cooldown <= 0) {
        unit.cooldown += unit.baseCooldown;
        const result = this.performAttack(unit);
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
    if (!unit || !unit.alive || !unit.isPlayer || unit.ultGauge < ULT_MAX || unit.skills.length === 0) return [];

    const skill = unit.skills[unit.nextSkillIndex % unit.skills.length];
    unit.nextSkillIndex += 1;
    unit.ultGauge = 0;

    const allies = unit.isPlayer ? this.playerUnits : this.enemyUnits;
    const enemies = unit.isPlayer ? this.enemyUnits : this.playerUnits;
    const outcome = castSkill(unit, skill.def, skill.level, allies, enemies, this.clockMs);

    const events: BattleEvent[] = [
      { kind: 'skillCast', casterId: unit.id, skillName: outcome.skillName, effectKind: outcome.effectKind, results: outcome.results },
    ];
    for (const id of outcome.defeatedIds) events.push({ kind: 'defeated', unitId: id });

    if (!this.finished) {
      const finalOutcome = this.checkOutcome();
      if (finalOutcome) {
        this.finished = true;
        events.push({ kind: finalOutcome });
      }
    }
    return events;
  }

  private pickTarget(attacker: UnitInstance): UnitInstance | null {
    const opponents = this.units.filter((u) => u.isPlayer !== attacker.isPlayer && u.alive);
    return pickFrontPreferred(opponents);
  }

  private performAttack(attacker: UnitInstance): BattleEvent[] | null {
    const target = this.pickTarget(attacker);
    if (!target) return null;
    const events: BattleEvent[] = [];

    const variance = 0.9 + Math.random() * 0.2;
    const crit = Math.random() < attacker.critRate;
    let damage = effectiveAtk(attacker, this.clockMs).mul(variance);
    if (crit) damage = damage.mul(attacker.critMul);
    damage = damage.mul(100 / (100 + effectiveDef(target, this.clockMs)));
    const blocked = isInvincible(target, this.clockMs);
    if (blocked) damage = BigNumber.ZERO;

    target.hp = target.hp.sub(damage);
    let defeated = false;
    if (target.hp.lte(BigNumber.ZERO)) {
      target.hp = BigNumber.ZERO;
      target.alive = false;
      defeated = true;
    }

    events.push({ kind: 'attack', attackerId: attacker.id, targetId: target.id, damage, crit, blocked });
    if (defeated) events.push({ kind: 'defeated', unitId: target.id });

    if (attacker.isPlayer) {
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
