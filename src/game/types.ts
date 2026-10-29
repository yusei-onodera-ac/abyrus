import type { BigNumber } from './systems/BigNumber';

export type Rarity = 1 | 2 | 3 | 4 | 5;
export type HeroClass = 'warrior' | 'mage' | 'archer' | 'tank' | 'healer';
export type Row = 'front' | 'back';

export const CLASS_LABELS: Record<HeroClass, string> = {
  warrior: '戦士',
  mage: '魔術師',
  archer: '弓兵',
  tank: '守護者',
  healer: '術師',
};

export const RARITY_COLORS: Record<Rarity, number> = {
  1: 0x9aa0a6,
  2: 0x4caf50,
  3: 0x2196f3,
  4: 0xab47bc,
  5: 0xffb300,
};

export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** Phase caps at 10. Separate from rarity (fixed at the pull) and level
 *  (exp-driven): phase only rises by fusing a duplicate pull into this copy
 *  or spending phase materials, both player-initiated. */
export const MAX_PHASE = 10;

export interface HeroData {
  /** Unique id of this owned copy (distinct pulls of the same hero differ). */
  id: string;
  /** Which HERO_ROSTER entry this copy is; drives name/class/rarity/portrait. */
  heroId: string;
  seed: number;
  rarity: Rarity;
  heroClass: HeroClass;
  name: string;
  level: number;
  exp: number;
  /** 1..MAX_PHASE. */
  phase: number;
}

export interface CombatStats {
  maxHp: BigNumber;
  atk: BigNumber;
  spd: number;
  def: number;
  critRate: number;
  critMul: number;
}
