import { BigNumber } from './BigNumber';
import { mulberry32 } from '../characters/CharacterGenerator';
import type { CombatStats, HeroClass, HeroData, Rarity } from '../types';

interface ClassBase {
  hp: number;
  atk: number;
  spd: number;
  def: number;
}

const CLASS_BASE: Record<HeroClass, ClassBase> = {
  warrior: { hp: 1.3, atk: 1.0, spd: 95, def: 16 },
  tank: { hp: 1.8, atk: 0.7, spd: 80, def: 30 },
  mage: { hp: 0.8, atk: 1.45, spd: 100, def: 5 },
  archer: { hp: 0.9, atk: 1.2, spd: 120, def: 8 },
  healer: { hp: 1.0, atk: 0.8, spd: 90, def: 10 },
};

const RARITY_STAT_MUL: Record<Rarity, number> = { 1: 1, 2: 1.3, 3: 1.7, 4: 2.3, 5: 3.2 };

// Exported so InfiniteModeSystem can generate its own continuously-scaling
// enemy defs from the same name/class pools instead of duplicating them.
export const ENEMY_CLASSES: HeroClass[] = ['warrior', 'mage', 'archer', 'tank', 'healer'];
export const NAME_P1 = ['零', '虚', '影', '灰', '銀', '黒', '蝕', '綺', '幻', '棄'];
export const NAME_P2 = ['算兵', '演算体', '断片', '残響', '執行者', '番人', '傀儡', '古算'];

export interface EnemyUnitDef {
  seed: number;
  heroClass: HeroClass;
  rarity: Rarity;
  name: string;
}

export interface StageDef {
  index: number;
  name: string;
  enemies: EnemyUnitDef[];
  rewardGold: BigNumber;
  rewardExp: number;
  rewardSkillEssence: number;
}

export const ProgressionSystem = {
  STAGE_COUNT: 40,

  /** Stages are derived purely from their index, so they are stable across reloads. */
  getStage(index: number): StageDef {
    const rng = mulberry32(90210 + index * 131);
    const enemyCount = Math.min(5, 1 + Math.floor(index / 4));
    const tierRarity = Math.min(5, 1 + Math.floor(index / 8)) as Rarity;
    const enemies: EnemyUnitDef[] = [];
    for (let i = 0; i < enemyCount; i++) {
      enemies.push({
        seed: Math.floor(rng() * 2 ** 31),
        heroClass: ENEMY_CLASSES[Math.floor(rng() * ENEMY_CLASSES.length)],
        rarity: tierRarity,
        name: NAME_P1[Math.floor(rng() * NAME_P1.length)] + NAME_P2[Math.floor(rng() * NAME_P2.length)],
      });
    }
    return {
      index,
      name: `第${index + 1}層`,
      enemies,
      rewardGold: BigNumber.from(60).mul(BigNumber.pow(1.17, index)),
      rewardExp: Math.round(25 * Math.pow(1.11, index)),
      rewardSkillEssence: Math.round(10 * Math.pow(1.09, index)),
    };
  },

  computeHeroStats(hero: HeroData): CombatStats {
    const base = CLASS_BASE[hero.heroClass];
    const rarityMul = RARITY_STAT_MUL[hero.rarity];
    const growth = BigNumber.pow(1.07, hero.level - 1);
    return {
      maxHp: BigNumber.from(60 * base.hp * rarityMul).mul(growth),
      atk: BigNumber.from(12 * base.atk * rarityMul).mul(growth),
      spd: base.spd,
      def: base.def + hero.rarity * 2,
      critRate: 0.1 + hero.rarity * 0.02,
      critMul: 1.8,
    };
  },

  computeEnemyStats(def: EnemyUnitDef, stageIndex: number): CombatStats {
    const base = CLASS_BASE[def.heroClass];
    const rarityMul = RARITY_STAT_MUL[def.rarity];
    const growth = BigNumber.pow(1.13, stageIndex);
    return {
      maxHp: BigNumber.from(50 * base.hp * rarityMul).mul(growth),
      atk: BigNumber.from(9 * base.atk * rarityMul).mul(growth),
      spd: base.spd * 0.9,
      def: base.def + stageIndex,
      critRate: 0.08,
      critMul: 1.6,
    };
  },
};
