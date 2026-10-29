/**
 * 素材アイテム。数値はここだけで決まる(画面側は触らない)。数字は仮のバランス。
 *
 * フェーズ素材 (phaseMaterials) と 技素 (skillEssence) は以前からセーブの専用
 * 項目として持っている。ここにあるのは、それ以外の素材。
 */
export type ItemId = 'exp_s' | 'exp_m' | 'exp_l' | 'exp_xl' | 'equip_essence';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** A short name that fits a reward tile. */
  short: string;
  description: string;
  /** Text colour for its name. */
  color: string;
  /** 経験値素材だけ: hero EXP one of it gives. */
  exp?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  exp_s: { id: 'exp_s', name: '経験値素材（小）', short: '経験値(小)', description: 'キャラに使うと経験値+100。', color: '#9fd8ff', exp: 100 },
  exp_m: { id: 'exp_m', name: '経験値素材（中）', short: '経験値(中)', description: 'キャラに使うと経験値+1,000。', color: '#9fe39f', exp: 1000 },
  exp_l: { id: 'exp_l', name: '経験値素材（大）', short: '経験値(大)', description: 'キャラに使うと経験値+10,000。', color: '#ffd9a0', exp: 10000 },
  exp_xl: { id: 'exp_xl', name: '経験値素材（特大）', short: '経験値(特大)', description: 'キャラに使うと経験値+100,000。', color: '#ff9fd0', exp: 100000 },
  equip_essence: { id: 'equip_essence', name: '装備強化素材', short: '強化素材', description: '装備のレベルアップに使う。装備を分解すると手に入る。', color: '#ffb36b' },
};

/** The four EXP materials, smallest first. */
export const EXP_ITEMS: ItemId[] = ['exp_s', 'exp_m', 'exp_l', 'exp_xl'];

export function isItemId(value: string): value is ItemId {
  return value in ITEMS;
}
