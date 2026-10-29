import type { Reward } from './rewards';

/**
 * プレミアムパス (月額). 値段・期間・特典はここだけで決まる。数字は仮のバランス。
 *
 *  - 加入するたび(1か月ごと)に、限定パックが届く
 *  - 加入中は毎日、魔晶石がもらえる
 *  - クエスト・無限モードを2倍速で進められる
 *  - 放置報酬のためられる上限が増える
 */
export const PREMIUM = {
  productId: 'premium-pass',
  name: 'プレミアムパス（30日間）',
  yen: 1500,
  durationDays: 30,
  /** Per day while active. 30 days of it is about ¥3,000 of 魔晶石 at the shop's price. */
  dailyGems: 35,
  /** The speed a fight can be run at while the pass is active. */
  battleSpeed: 2,
  /** How many hours of 放置報酬 can pile up while the pass is active (the base is in data/idle.ts). */
  idleCapHours: 24,
};

/** 加入特典の限定パック: worth about ¥300, handed over every time the pass is bought or renewed. */
export const PREMIUM_JOIN_PACK: Reward[] = [
  { type: 'gems', amount: 60 },
  { type: 'phaseMaterials', amount: 3 },
  { type: 'item', item: 'exp_m', amount: 5 },
  { type: 'item', item: 'equip_essence', amount: 200 },
];
