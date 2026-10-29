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
 *  (exp-driven): phase only rises by 合成 (fusing another copy of the same
 *  character into this one) or spending phase materials, both player-initiated. */
export const MAX_PHASE = 10;

/** A hero's level stops here: no more EXP, and the 強化 screen stops selling levels. */
export const MAX_LEVEL = 100;

/** Where a piece of equipment goes: each hero wears one of each. */
export type EquipSlot = 'weapon' | 'armor' | 'accessory';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'accessory'];
export const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = { weapon: '武器', armor: '防具', accessory: '装飾' };

/** One owned piece of equipment: which EQUIP_DEFS entry it is (data/equipment.ts)
 *  and how far it has been levelled. */
export interface EquipmentItem {
  id: string;
  defId: string;
  level: number;
}

/** What a hero is wearing. The pieces live here, on the hero, while worn; the
 *  ones not worn are in SaveData.equipment. */
export type HeroGear = Record<EquipSlot, EquipmentItem | null>;

export function emptyGear(): HeroGear {
  return { weapon: null, armor: null, accessory: null };
}

export interface HeroData {
  /** Unique id of this owned copy (distinct pulls of the same hero differ,
   *  and each repeat pull is kept as its own copy until fused). */
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
  /** Worn equipment (see HeroGear). */
  gear: HeroGear;
  /** Per-skill level (1-10), indexed by skill slot (0-3). Always length 4
   *  regardless of how many slots this hero's rarity actually grants - see
   *  RARITY_SKILL_SLOTS in data/skills.ts for which indices are in play. */
  skillLevels: number[];
}

export interface CombatStats {
  maxHp: BigNumber;
  atk: BigNumber;
  spd: number;
  def: number;
  critRate: number;
  critMul: number;
}
