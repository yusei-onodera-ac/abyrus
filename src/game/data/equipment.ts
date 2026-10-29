import { EQUIP_SLOTS, type CombatStats, type EquipSlot, type EquipmentItem, type HeroGear, type Rarity } from '../types';

/**
 * 装備の一覧と数値。装備を足す/調整するときはここだけ編集する。数字は仮のバランス。
 *
 * 装備は 武器 / 防具 / 装飾 の3部位で、キャラごとに1つずつ着けられる。1つの装備は
 * 1つの能力を上げる(武器=攻撃力、防具=HPか防御、装飾=会心率か素早さ)。効果は
 * レアリティで決まる基礎値に、レベルごとの伸びを足したもの。
 */
export type EquipStat = 'atkPct' | 'hpPct' | 'defFlat' | 'critRate' | 'spdFlat';

export const EQUIP_STAT_LABEL: Record<EquipStat, string> = {
  atkPct: '攻撃力',
  hpPct: 'HP',
  defFlat: '防御力',
  critRate: '会心率',
  spdFlat: '素早さ',
};

/** What a piece looks like (ui/ItemIcons.ts draws one shape for each). Looks only, no effect on stats. */
export type EquipGlyph = 'sword' | 'bow' | 'staff' | 'spear' | 'axe' | 'armor' | 'shield' | 'ring' | 'necklace' | 'boots' | 'crown';

/** The shape used where only the slot is known (a reward that is "some ★3 equipment"). */
export const DEFAULT_GLYPH: Record<EquipSlot, EquipGlyph> = { weapon: 'sword', armor: 'armor', accessory: 'ring' };

export interface EquipDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  stat: EquipStat;
  glyph: EquipGlyph;
}

/** Effect of a level-1 piece: percent for atk/hp/crit, points for def/spd. */
const STAT_BASE: Record<EquipStat, Record<Rarity, number>> = {
  atkPct: { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15 },
  hpPct: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 },
  defFlat: { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 },
  critRate: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  spdFlat: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
};

/** Each level adds this fraction of the base effect. */
const LEVEL_GROWTH = 0.1;

/** Highest level a piece of each rarity can be raised to. */
export const EQUIP_MAX_LEVEL: Record<Rarity, number> = { 1: 10, 2: 15, 3: 20, 4: 30, 5: 40 };

/** 装備強化素材 for raising a piece from level L to L+1 is `UP_BASE[rarity] * L`. */
const UP_BASE: Record<Rarity, number> = { 1: 3, 2: 6, 3: 15, 4: 40, 5: 100 };

/** 装備強化素材 a piece is worth when 分解d (before the levels put into it come back). */
const DISMANTLE_BASE: Record<Rarity, number> = { 1: 10, 2: 30, 3: 100, 4: 300, 5: 1000 };

/** Share of the 素材 spent on levels that 分解 gives back. */
const REFUND_RATE = 0.5;

// Three pieces for each slot and rarity. A piece's id is `<slot>-<rarity>-<n>`, n counting
// within that group in the order below - so new pieces go at the END of their group,
// never in front of existing ones (saves refer to these ids).
type Row = [name: string, stat: EquipStat, glyph: EquipGlyph];
const GROUPS: [EquipSlot, Rarity, Row[]][] = [
  ['weapon', 1, [['木の棍棒', 'atkPct', 'staff'], ['錆びた短剣', 'atkPct', 'sword'], ['手斧', 'atkPct', 'axe']]],
  ['weapon', 2, [['鉄の剣', 'atkPct', 'sword'], ['狩人の短弓', 'atkPct', 'bow'], ['鉄の槍', 'atkPct', 'spear']]],
  ['weapon', 3, [['銀の長剣', 'atkPct', 'sword'], ['賢者の杖', 'atkPct', 'staff'], ['戦斧', 'atkPct', 'axe']]],
  ['weapon', 4, [['魔剣グラム', 'atkPct', 'sword'], ['竜牙の槍', 'atkPct', 'spear'], ['紅蓮の大弓', 'atkPct', 'bow']]],
  ['weapon', 5, [['神剣アビス', 'atkPct', 'sword'], ['星砕きの大弓', 'atkPct', 'bow'], ['世界樹の杖', 'atkPct', 'staff']]],
  ['armor', 1, [['布の服', 'hpPct', 'armor'], ['木の盾', 'defFlat', 'shield'], ['旅人のマント', 'hpPct', 'armor']]],
  ['armor', 2, [['革の鎧', 'hpPct', 'armor'], ['鉄の盾', 'defFlat', 'shield'], ['鎖かたびら', 'hpPct', 'armor']]],
  ['armor', 3, [['鋼の鎧', 'hpPct', 'armor'], ['騎士の大盾', 'defFlat', 'shield'], ['守護の円盾', 'defFlat', 'shield']]],
  ['armor', 4, [['竜鱗の鎧', 'hpPct', 'armor'], ['聖騎士の盾', 'defFlat', 'shield'], ['黒鉄の重鎧', 'hpPct', 'armor']]],
  ['armor', 5, [['星屑の聖鎧', 'hpPct', 'armor'], ['世界樹の盾', 'defFlat', 'shield'], ['天空の守護盾', 'defFlat', 'shield']]],
  ['accessory', 1, [['銅の指輪', 'critRate', 'ring'], ['革の靴', 'spdFlat', 'boots'], ['幸運のお守り', 'critRate', 'necklace']]],
  ['accessory', 2, [['銀の指輪', 'critRate', 'ring'], ['疾風の腕輪', 'spdFlat', 'ring'], ['狩人のブーツ', 'spdFlat', 'boots']]],
  ['accessory', 3, [['会心のペンダント', 'critRate', 'necklace'], ['風切りのブーツ', 'spdFlat', 'boots'], ['紅玉の指輪', 'critRate', 'ring']]],
  ['accessory', 4, [['鷹の目の首飾り', 'critRate', 'necklace'], ['迅雷のアンクレット', 'spdFlat', 'boots'], ['瞬足の靴', 'spdFlat', 'boots']]],
  ['accessory', 5, [['王者の冠', 'critRate', 'crown'], ['天翔ける翼飾り', 'spdFlat', 'necklace'], ['神速のブーツ', 'spdFlat', 'boots']]],
];

export const EQUIP_DEFS: EquipDef[] = GROUPS.flatMap(([slot, rarity, rows]) =>
  rows.map(([name, stat, glyph], n): EquipDef => ({ id: `${slot}-${rarity}-${n}`, name, slot, rarity, stat, glyph })),
);

const BY_ID = new Map(EQUIP_DEFS.map((d) => [d.id, d]));

export function getEquipDef(defId: string): EquipDef | undefined {
  return BY_ID.get(defId);
}

export function equipDefsOfRarity(rarity: Rarity): EquipDef[] {
  return EQUIP_DEFS.filter((d) => d.rarity === rarity);
}

/** The effect of `def` at `level`, in the stat's own unit (percent, or points). */
export function equipValue(def: EquipDef, level: number): number {
  return STAT_BASE[def.stat][def.rarity] * (1 + (Math.max(1, level) - 1) * LEVEL_GROWTH);
}

/** "攻撃力 +12.0%" / "防御力 +8" for a piece as it is now. */
export function describeEquip(item: EquipmentItem): string {
  const def = getEquipDef(item.defId);
  if (!def) return '';
  const value = equipValue(def, item.level);
  const percent = def.stat === 'atkPct' || def.stat === 'hpPct' || def.stat === 'critRate';
  return `${EQUIP_STAT_LABEL[def.stat]} +${percent ? value.toFixed(1) : Math.round(value)}${percent ? '%' : ''}`;
}

export function equipMaxLevel(item: EquipmentItem): number {
  const def = getEquipDef(item.defId);
  return def ? EQUIP_MAX_LEVEL[def.rarity] : 1;
}

/** 装備強化素材 to raise the piece one level, or null at its top level. */
export function equipLevelUpCost(item: EquipmentItem): number | null {
  const def = getEquipDef(item.defId);
  if (!def || item.level >= EQUIP_MAX_LEVEL[def.rarity]) return null;
  return Math.round(UP_BASE[def.rarity] * item.level);
}

/** 装備強化素材 that 分解ing the piece gives: its base worth plus half of what was spent levelling it. */
export function dismantleValue(item: EquipmentItem): number {
  const def = getEquipDef(item.defId);
  if (!def) return 0;
  let spent = 0;
  for (let level = 1; level < item.level; level++) spent += Math.round(UP_BASE[def.rarity] * level);
  return DISMANTLE_BASE[def.rarity] + Math.round(spent * REFUND_RATE);
}

export interface GearBonus {
  atkPct: number;
  hpPct: number;
  defFlat: number;
  critRate: number;
  spdFlat: number;
}

export function gearBonus(gear: HeroGear | undefined): GearBonus {
  const total: GearBonus = { atkPct: 0, hpPct: 0, defFlat: 0, critRate: 0, spdFlat: 0 };
  if (!gear) return total;
  for (const slot of EQUIP_SLOTS) {
    const item = gear[slot];
    const def = item ? getEquipDef(item.defId) : undefined;
    if (item && def) total[def.stat] += equipValue(def, item.level);
  }
  return total;
}

/** A hero's stats with the equipment on them folded in. */
export function applyGear(stats: CombatStats, gear: HeroGear | undefined): CombatStats {
  const bonus = gearBonus(gear);
  return {
    ...stats,
    maxHp: stats.maxHp.mul(1 + bonus.hpPct / 100),
    atk: stats.atk.mul(1 + bonus.atkPct / 100),
    def: stats.def + Math.round(bonus.defFlat),
    spd: stats.spd + Math.round(bonus.spdFlat),
    critRate: Math.min(1, stats.critRate + bonus.critRate / 100),
  };
}
