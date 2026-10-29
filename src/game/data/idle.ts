import type { ItemId } from './items';

/**
 * 放置報酬の数字。ゲームを閉じている間も、プレイヤーの進行度(クリア済みの
 * ステージ)に合わせた量がたまり、いつでも受け取れる。数字は仮のバランス。
 */

/** Hours that can pile up before it stops (the プレミアムパス raises this: data/premium.ts). */
export const IDLE_BASE_CAP_HOURS = 12;

/** One ad shown moves the clock this many hours ahead... */
export const IDLE_AD_BOOST_HOURS = 1;
/** ...at most this many times a day. */
export const IDLE_AD_BOOSTS_PER_DAY = 5;

/** ゴールド per hour = this many clears' worth of the stage the player has reached. */
export const IDLE_GOLD_CLEARS_PER_HOUR = 3;
/** 技素 per hour = this many clears' worth of that stage's 技素. */
export const IDLE_ESSENCE_CLEARS_PER_HOUR = 2;
/** フェーズ素材 per hour. */
export const IDLE_PHASE_PER_HOUR = 0.2;

/** An idle hour is worth this many levels of EXP to the level the player is at (measured
 *  from the last stage cleared, never below IDLE_EXP_MIN_LEVEL), paid as 経験値素材. */
export const IDLE_EXP_LEVELS_PER_HOUR = 0.4;
export const IDLE_EXP_MIN_LEVEL = 12;

/** Which 経験値素材 that EXP is paid in, by region reached (index 0 = 迷いの森 ... 4 = 黄昏の都): shares add up to 1. */
export const IDLE_EXP_SPLIT: { item: ItemId; share: number }[][] = [
  [{ item: 'exp_s', share: 1 }],
  [{ item: 'exp_s', share: 0.4 }, { item: 'exp_m', share: 0.6 }],
  [{ item: 'exp_m', share: 0.7 }, { item: 'exp_l', share: 0.3 }],
  [{ item: 'exp_m', share: 0.3 }, { item: 'exp_l', share: 0.7 }],
  [{ item: 'exp_l', share: 0.6 }, { item: 'exp_xl', share: 0.4 }],
];

/** 装備強化素材 per hour, by region reached. */
export const IDLE_EQUIP_ESSENCE_PER_HOUR: number[] = [2, 4, 6, 8, 10];

/** Pieces of equipment per hour, and which rarities they are: weights for ★1, ★2, ★3 by region. Low-level gear only. */
export const IDLE_EQUIP_PER_HOUR = 0.6;
export const IDLE_EQUIP_RARITY_WEIGHTS: number[][] = [
  [90, 10, 0],
  [60, 40, 0],
  [30, 55, 15],
  [10, 50, 40],
  [0, 40, 60],
];
