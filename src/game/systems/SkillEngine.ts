import { BigNumber } from './BigNumber';
import type { UnitInstance } from './BattleSystem';
import { getSkillEffect, type SkillDefinition, type SkillEffectKind } from '../data/skills';

/** Same front-row-preferred random target selection used by both
 *  BattleEngine and InfiniteRunEngine's own attack resolution, pulled out
 *  here so a skill cast targets the same way a normal attack does. */
export function pickFrontPreferred(units: UnitInstance[]): UnitInstance | null {
  if (units.length === 0) return null;
  const front = units.filter((u) => u.row === 'front');
  const pool = front.length > 0 ? front : units;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function effectiveAtk(unit: UnitInstance, nowMs: number): BigNumber {
  if (nowMs >= unit.atkStatusUntil || unit.atkStatusMul === 1) return unit.atk;
  return unit.atk.mul(unit.atkStatusMul);
}

export function effectiveDef(unit: UnitInstance, nowMs: number): number {
  if (nowMs >= unit.defStatusUntil || unit.defStatusMul === 1) return unit.def;
  return unit.def * unit.defStatusMul;
}

export function isStunned(unit: UnitInstance, nowMs: number): boolean {
  return nowMs < unit.stunnedUntil;
}

/** True while a 無敵 skill protects the unit: every hit on it deals nothing. */
export function isInvincible(unit: UnitInstance, nowMs: number): boolean {
  return nowMs < unit.invincibleUntil;
}

function rollDamage(attacker: UnitInstance, target: UnitInstance, nowMs: number, potencyMul: number, bonusCritChance: number): { damage: BigNumber; crit: boolean } {
  const variance = 0.9 + Math.random() * 0.2;
  const crit = Math.random() < attacker.critRate + bonusCritChance;
  let damage = effectiveAtk(attacker, nowMs).mul(variance).mul(potencyMul);
  if (crit) damage = damage.mul(attacker.critMul);
  damage = damage.mul(100 / (100 + effectiveDef(target, nowMs)));
  return { damage, crit };
}

/** Returns true if the hit defeated the target. */
function applyDamage(target: UnitInstance, damage: BigNumber): boolean {
  target.hp = target.hp.sub(damage);
  if (target.hp.lte(BigNumber.ZERO)) {
    target.hp = BigNumber.ZERO;
    target.alive = false;
    return true;
  }
  return false;
}

function applyHeal(target: UnitInstance, heal: BigNumber): void {
  target.hp = target.hp.add(heal);
  if (target.hp.gt(target.maxHp)) target.hp = target.maxHp;
}

function lowestHpRatio(units: UnitInstance[]): UnitInstance | null {
  return units.reduce<UnitInstance | null>((acc, u) => {
    if (!acc) return u;
    return u.hp.div(u.maxHp).lt(acc.hp.div(acc.maxHp)) ? u : acc;
  }, null);
}

export interface SkillTargetResult {
  targetId: string;
  damage?: BigNumber;
  crit?: boolean;
  heal?: BigNumber;
  revived?: boolean;
  buffAtk?: boolean;
  buffDef?: boolean;
  debuffAtk?: boolean;
  debuffDef?: boolean;
  stunned?: boolean;
  invincible?: boolean;
}

export interface SkillCastOutcome {
  effectKind: SkillEffectKind;
  skillName: string;
  results: SkillTargetResult[];
  defeatedIds: string[];
}

/** Applies one hero skill's real combat effect, mutating unit state in
 *  place (hp, status multipliers, alive flags). Shared by BattleEngine and
 *  InfiniteRunEngine so a given skill behaves identically in a stage
 *  battle and an Infinite Mode run instead of drifting into two separate
 *  implementations. */
export function castSkill(
  caster: UnitInstance,
  def: SkillDefinition,
  level: number,
  allies: UnitInstance[],
  enemies: UnitInstance[],
  nowMs: number,
): SkillCastOutcome {
  const effect = getSkillEffect(def, level);
  const results: SkillTargetResult[] = [];
  const defeatedIds: string[] = [];

  const aliveAllies = allies.filter((u) => u.alive);
  const aliveEnemies = enemies.filter((u) => u.alive);
  const fallenAllies = allies.filter((u) => !u.alive);

  switch (def.kind) {
    case 'nuke_single': {
      const target = pickFrontPreferred(aliveEnemies);
      if (target) {
        const { damage, crit } = rollDamage(caster, target, nowMs, effect.potency / 100, 0.08);
        if (applyDamage(target, damage)) defeatedIds.push(target.id);
        results.push({ targetId: target.id, damage, crit });
      }
      break;
    }
    case 'nuke_aoe': {
      for (const target of aliveEnemies) {
        const { damage, crit } = rollDamage(caster, target, nowMs, effect.potency / 100, 0.04);
        if (applyDamage(target, damage)) defeatedIds.push(target.id);
        results.push({ targetId: target.id, damage, crit });
      }
      break;
    }
    case 'drain_single': {
      const target = pickFrontPreferred(aliveEnemies);
      if (target) {
        const { damage, crit } = rollDamage(caster, target, nowMs, effect.potency / 100, 0.08);
        if (applyDamage(target, damage)) defeatedIds.push(target.id);
        applyHeal(caster, damage.mul(effect.secondaryPotency / 100));
        results.push({ targetId: target.id, damage, crit });
      }
      break;
    }
    case 'buff_atk': {
      const until = nowMs + effect.durationMs;
      for (const ally of aliveAllies) {
        ally.atkStatusMul = 1 + effect.potency / 100;
        ally.atkStatusUntil = until;
        results.push({ targetId: ally.id, buffAtk: true });
      }
      break;
    }
    case 'buff_def': {
      const until = nowMs + effect.durationMs;
      for (const ally of aliveAllies) {
        ally.defStatusMul = 1 + effect.potency / 100;
        ally.defStatusUntil = until;
        results.push({ targetId: ally.id, buffDef: true });
      }
      break;
    }
    case 'debuff_atk': {
      const target = pickFrontPreferred(aliveEnemies);
      if (target) {
        target.atkStatusMul = Math.max(0.1, 1 - effect.potency / 100);
        target.atkStatusUntil = nowMs + effect.durationMs;
        results.push({ targetId: target.id, debuffAtk: true });
      }
      break;
    }
    case 'debuff_def': {
      const target = pickFrontPreferred(aliveEnemies);
      if (target) {
        target.defStatusMul = Math.max(0.1, 1 - effect.potency / 100);
        target.defStatusUntil = nowMs + effect.durationMs;
        results.push({ targetId: target.id, debuffDef: true });
      }
      break;
    }
    case 'stun': {
      const target = pickFrontPreferred(aliveEnemies);
      if (target) {
        target.stunnedUntil = nowMs + effect.durationMs;
        results.push({ targetId: target.id, stunned: true });
      }
      break;
    }
    case 'invincible': {
      caster.invincibleUntil = nowMs + effect.durationMs;
      results.push({ targetId: caster.id, invincible: true });
      break;
    }
    case 'heal_single': {
      const target = lowestHpRatio(aliveAllies);
      if (target) {
        const heal = target.maxHp.mul(effect.potency / 100);
        applyHeal(target, heal);
        results.push({ targetId: target.id, heal });
      }
      break;
    }
    case 'heal_aoe': {
      for (const ally of aliveAllies) {
        const heal = ally.maxHp.mul(effect.potency / 100);
        applyHeal(ally, heal);
        results.push({ targetId: ally.id, heal });
      }
      break;
    }
    case 'revive': {
      const target = fallenAllies[0];
      if (target) {
        target.hp = target.maxHp.mul(effect.potency / 100);
        target.alive = true;
        results.push({ targetId: target.id, revived: true, heal: target.hp });
      } else {
        // No one to revive right now - top up the neediest ally instead of
        // letting the cast do nothing.
        const fallback = lowestHpRatio(aliveAllies);
        if (fallback) {
          const heal = fallback.maxHp.mul(effect.potency / 100);
          applyHeal(fallback, heal);
          results.push({ targetId: fallback.id, heal });
        }
      }
      break;
    }
  }

  return { effectKind: def.kind, skillName: def.name, results, defeatedIds };
}
