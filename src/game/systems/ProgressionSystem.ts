import { BigNumber } from './BigNumber';
import { applyGear } from '../data/equipment';
import { mulberry32 } from '../characters/CharacterGenerator';
import { REGION_COUNT, getRegion, pickFeralName, type RegionDef } from '../data/regions';
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
// Also still used as the generic class pool for every quest-mode enemy
// (region flavor only changes the displayed *name*, not the class spread).
export const ENEMY_CLASSES: HeroClass[] = ['warrior', 'mage', 'archer', 'tank', 'healer'];
export const NAME_P1 = ['零', '虚', '影', '灰', '銀', '黒', '蝕', '綺', '幻', '棄'];
export const NAME_P2 = ['算兵', '演算体', '断片', '残響', '執行者', '番人', '傀儡', '古算'];

export interface EnemyUnitDef {
  seed: number;
  heroClass: HeroClass;
  rarity: Rarity;
  name: string;
  /** Single powerful unit (region Extra dungeon's 6th-stage guardian, the
   *  final battle's wave climax) rather than rank-and-file - gets a flat
   *  stat multiplier in computeEnemyStats instead of just a rarity bump. */
  isBoss?: boolean;
}

export interface StageDef {
  index: number;
  regionIndex: number;
  stageInRegion: number;
  name: string;
  enemies: EnemyUnitDef[];
  /** Continuous growth-curve input fed into computeEnemyStats/reward
   *  scaling - see mainDifficulty()'s doc comment for why this is not
   *  simply `index`. */
  difficulty: number;
  rewardGold: BigNumber;
  rewardExp: number;
  /** 技素, spent on raising skill levels (see data/skills.ts). */
  rewardSkillEssence: number;
  /** Set on Extra-mode stages only, true on the 6th (region boss) stage. */
  isBossStage?: boolean;
}

export interface WaveDef {
  name: string;
  difficulty: number;
  enemies: EnemyUnitDef[];
}

export interface FinalStageDef {
  index: number;
  name: string;
  waves: WaveDef[];
  rewardGold: BigNumber;
  rewardExp: number;
  rewardSkillEssence: number;
}

/** Sum of every hero in a deck, for the formation screen's 詳細 popup. */
export interface DeckTotals {
  power: BigNumber;
  maxHp: BigNumber;
  atk: BigNumber;
  def: number;
  spd: number;
}

export const STAGES_PER_REGION = 30;
export const MAIN_STAGE_COUNT = REGION_COUNT * STAGES_PER_REGION; // 150
/** The single finite-wave final battle, one past the last main stage. */
export const FINAL_STAGE_INDEX = MAIN_STAGE_COUNT; // 150
export const EXTRA_STAGES_PER_REGION = 6;
export const EXTRA_STAGE_COUNT = REGION_COUNT * EXTRA_STAGES_PER_REGION; // 30

// --- Difficulty curve -------------------------------------------------------
// computeEnemyStats()/reward scaling both read as `BigNumber.pow(rate,
// difficulty)` - exactly the old flat-40-stage campaign's own convention,
// still shared verbatim with Infinite Mode's own continuous
// difficultyIndex (see InfiniteModeSystem.ts), so neither that formula nor
// its exponents change here. What *does* change is what number the quest
// campaign now feeds into it: the old campaign reached its hardest
// rank-and-file enemies at stageIndex 39. Feeding the new campaign's raw
// 0-149 main-stage index into the same curve would blow far past that
// (150 stages of 13%-per-stage compounding is a different game), so stage
// index is first mapped onto a "difficulty" value that reaches a ceiling
// just above the old one by the last main stage - giving 5 regions worth
// of finer-grained pacing without re-tuning (or discontinuing) the shared
// formula itself. This mapping is a single continuous function of the
// global stage index, so there is never a jump or dip at a region
// boundary - only the enemy name pool and rarity tier (tied to region
// index, see getStage()) change there, by design, same as the original
// curve's own per-tier rarity steps.
//
// Raised a little (2026-10-29): the first stage now starts at difficulty 0.3
// instead of 0, and the last main stage ends at 47.5 instead of 46 - about +4%
// enemy HP/attack at the start, growing to about +20% at the end. (Enemy HP and
// attack both compound, so even this much is felt: a party that beat a stage
// nine times in ten before now wins roughly three in four to nine in ten.)
const MAIN_DIFFICULTY_START = 0.3;
const MAIN_DIFFICULTY_END = 47.5;

function mainDifficulty(index: number): number {
  return MAIN_DIFFICULTY_START + (index / (MAIN_STAGE_COUNT - 1)) * (MAIN_DIFFICULTY_END - MAIN_DIFFICULTY_START);
}

/** Final battle's waves continue just past the main campaign's ceiling,
 *  stepping up slightly wave-to-wave so the fight itself has a visible
 *  escalation leading into its climax. */
function finalDifficulty(waveOffset: number): number {
  return MAIN_DIFFICULTY_END + 2 + waveOffset;
}

/** Extra is explicitly post-game: it starts beyond the final battle and
 *  keeps climbing across its own 30 stages, so "strongest feral of each
 *  region" is a genuine capstone challenge rather than a victory lap. */
function extraDifficulty(extraIndex: number): number {
  return MAIN_DIFFICULTY_END + 4 + extraIndex * 1.4;
}

/** Enemy squad size: grows with the global stage index (never reset per
 *  region) so it is monotonic with no boundary discontinuity, same
 *  reasoning as the difficulty curve above. Caps at 5 - the front-3/back-2
 *  layout BattleScene already lays every stage's enemies out on. */
function enemyCountForIndex(index: number): number {
  return Math.min(5, 1 + Math.floor(index / 10));
}

function rollEnemy(region: RegionDef, rarity: Rarity, rng: () => number): EnemyUnitDef {
  return {
    seed: Math.floor(rng() * 2 ** 31),
    heroClass: ENEMY_CLASSES[Math.floor(rng() * ENEMY_CLASSES.length)],
    rarity,
    name: pickFeralName(region, rng),
  };
}

export const ProgressionSystem = {
  /** Kept for any external reference to "how many main stages exist" -
   *  equal to MAIN_STAGE_COUNT (the final battle and Extra are addressed
   *  through getFinalStage()/getExtraStage() instead, not this count). */
  STAGE_COUNT: MAIN_STAGE_COUNT,

  /** Main-campaign stage 0..MAIN_STAGE_COUNT-1. Derived purely from its
   *  index, so stages are stable across reloads. Each region's 30 stages
   *  share that region's rarity tier (tier = regionIndex + 1) and feral
   *  name pool; only enemy count and the continuous difficulty curve vary
   *  within a region. */
  getStage(index: number): StageDef {
    const region = getRegion(Math.floor(index / STAGES_PER_REGION));
    const stageInRegion = index % STAGES_PER_REGION;
    const rng = mulberry32(90210 + index * 131);
    const enemyCount = enemyCountForIndex(index);
    const tierRarity = (region.index + 1) as Rarity;
    const difficulty = mainDifficulty(index);

    const enemies: EnemyUnitDef[] = [];
    for (let i = 0; i < enemyCount; i++) {
      enemies.push(rollEnemy(region, tierRarity, rng));
    }

    return {
      index,
      regionIndex: region.index,
      stageInRegion,
      name: `${region.name} 第${stageInRegion + 1}層`,
      enemies,
      difficulty,
      rewardGold: BigNumber.from(60).mul(BigNumber.pow(1.17, difficulty)),
      rewardExp: Math.round(25 * Math.pow(1.11, difficulty)),
      rewardSkillEssence: Math.round(10 * Math.pow(1.09, difficulty)),
    };
  },

  /** The single finite-wave final battle at the top of the 狂化の塔: a
   *  fixed, ordered list of waves (never endless, unlike InfiniteRunEngine)
   *  rotating through every region's feral flavor before climaxing in one
   *  boss-tier specimen - the Professor releasing his strongest captive
   *  rather than fighting himself, per the story brief. */
  getFinalStage(): FinalStageDef {
    const rng = mulberry32(424242);
    const waveCount = 6;
    const waves: WaveDef[] = [];

    for (let w = 0; w < waveCount; w++) {
      const isClimax = w === waveCount - 1;
      const region = getRegion(w % REGION_COUNT);
      const difficulty = finalDifficulty(w * 0.6);
      const enemies: EnemyUnitDef[] = [];

      if (isClimax) {
        enemies.push({
          seed: Math.floor(rng() * 2 ** 31),
          heroClass: 'mage',
          rarity: 5,
          name: '教授の最終実験体・大狂獣ウロボロス',
          isBoss: true,
        });
      } else {
        const enemyCount = Math.min(5, 3 + w);
        for (let i = 0; i < enemyCount; i++) {
          enemies.push(rollEnemy(region, 5, rng));
        }
      }

      waves.push({
        name: isClimax ? '最終波 ― 大狂獣ウロボロス' : `第${w + 1}波 ― ${region.name}の狂獣`,
        difficulty,
        enemies,
      });
    }

    const rewardDifficulty = finalDifficulty(waveCount);
    return {
      index: FINAL_STAGE_INDEX,
      name: '狂化の塔 最奥決戦',
      waves,
      rewardGold: BigNumber.from(60).mul(BigNumber.pow(1.17, rewardDifficulty)),
      rewardExp: Math.round(25 * Math.pow(1.11, rewardDifficulty)),
      rewardSkillEssence: Math.round(10 * Math.pow(1.09, rewardDifficulty)),
    };
  },

  /** Extra (野に放たれた狂獣), unlocked only after the ending is seen: 5
   *  regions x 6 stages (index 0..EXTRA_STAGE_COUNT-1), the 6th of each
   *  group a solo fight against that region's named boss. A separate
   *  index space from the main campaign (see SaveSystem.extraProgress),
   *  harder than anything in the main campaign or final battle. */
  getExtraStage(index: number): StageDef {
    const region = getRegion(Math.floor(index / EXTRA_STAGES_PER_REGION));
    const stageInRegion = index % EXTRA_STAGES_PER_REGION;
    const isBossStage = stageInRegion === EXTRA_STAGES_PER_REGION - 1;
    const rng = mulberry32(777000 + index * 97);
    const difficulty = extraDifficulty(index);

    const enemies: EnemyUnitDef[] = isBossStage
      ? [
          {
            seed: Math.floor(rng() * 2 ** 31),
            heroClass: region.bossClass,
            rarity: 5,
            name: region.bossName,
            isBoss: true,
          },
        ]
      : Array.from({ length: 5 }, () => rollEnemy(region, 5, rng));

    return {
      index,
      regionIndex: region.index,
      stageInRegion,
      name: isBossStage ? `${region.name}(特別) ${region.bossName}` : `${region.name}(特別) 第${stageInRegion + 1}層`,
      enemies,
      difficulty,
      rewardGold: BigNumber.from(60).mul(BigNumber.pow(1.17, difficulty)),
      rewardExp: Math.round(25 * Math.pow(1.11, difficulty)),
      rewardSkillEssence: Math.round(10 * Math.pow(1.09, difficulty)),
      isBossStage,
    };
  },

  computeHeroStats(hero: HeroData): CombatStats {
    const base = CLASS_BASE[hero.heroClass];
    const rarityMul = RARITY_STAT_MUL[hero.rarity];
    const growth = BigNumber.pow(1.07, hero.level - 1);
    return applyGear(
      {
        maxHp: BigNumber.from(60 * base.hp * rarityMul).mul(growth),
        atk: BigNumber.from(12 * base.atk * rarityMul).mul(growth),
        spd: base.spd,
        def: base.def + hero.rarity * 2,
        critRate: 0.1 + hero.rarity * 0.02,
        critMul: 1.8,
      },
      hero.gear,
    );
  },

  /** 総合力: one number for comparing heroes and decks at a glance. Display
   *  only - nothing in combat reads it. */
  computeHeroPower(hero: HeroData): BigNumber {
    const stats = ProgressionSystem.computeHeroStats(hero);
    return stats.maxHp.add(stats.atk.mul(5));
  },

  computeDeckTotals(heroes: HeroData[]): DeckTotals {
    const totals: DeckTotals = { power: BigNumber.ZERO, maxHp: BigNumber.ZERO, atk: BigNumber.ZERO, def: 0, spd: 0 };
    for (const hero of heroes) {
      const stats = ProgressionSystem.computeHeroStats(hero);
      totals.power = totals.power.add(ProgressionSystem.computeHeroPower(hero));
      totals.maxHp = totals.maxHp.add(stats.maxHp);
      totals.atk = totals.atk.add(stats.atk);
      totals.def += stats.def;
      totals.spd += stats.spd;
    }
    return totals;
  },

  /** `stageIndex` here is really "difficulty": a continuous growth-curve
   *  input, not necessarily a literal stage index - Infinite Mode feeds it
   *  its own difficultyIndex, quest stages feed it StageDef.difficulty /
   *  WaveDef.difficulty. isBoss applies a flat multiplier on top of the
   *  normal rarity tier, for the handful of solo boss-tier fights (region
   *  Extra guardians, the final battle's climax). */
  computeEnemyStats(def: EnemyUnitDef, stageIndex: number): CombatStats {
    const base = CLASS_BASE[def.heroClass];
    const rarityMul = RARITY_STAT_MUL[def.rarity];
    const bossMul = def.isBoss ? 2.2 : 1;
    const growth = BigNumber.pow(1.13, stageIndex);
    return {
      maxHp: BigNumber.from(50 * base.hp * rarityMul * bossMul).mul(growth),
      atk: BigNumber.from(9 * base.atk * rarityMul * bossMul).mul(growth),
      spd: base.spd * 0.9,
      def: base.def + stageIndex + (def.isBoss ? 6 : 0),
      critRate: 0.08 + (def.isBoss ? 0.04 : 0),
      critMul: 1.6,
    };
  },
};
