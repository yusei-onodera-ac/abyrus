import type { Reward } from './rewards';

/**
 * ログインボーナス: the reward for each day of the month (index 0 = the 1st), a
 * different one every day. Shown as a calendar; a day can be claimed on that day
 * only. Edit this list to change the rewards. 数字は仮のバランス。
 */
export const LOGIN_BONUS: Reward[] = [
  { type: 'gold', amount: 5000 }, // 1
  { type: 'item', item: 'exp_s', amount: 10 }, // 2
  { type: 'stamina', amount: 30 }, // 3
  { type: 'skillEssence', amount: 100 }, // 4
  { type: 'gems', amount: 20 }, // 5
  { type: 'item', item: 'exp_m', amount: 3 }, // 6
  { type: 'equipment', rarity: 2, amount: 1 }, // 7
  { type: 'gold', amount: 8000 }, // 8
  { type: 'item', item: 'equip_essence', amount: 50 }, // 9
  { type: 'phaseMaterials', amount: 1 }, // 10
  { type: 'stamina', amount: 40 }, // 11
  { type: 'item', item: 'exp_s', amount: 20 }, // 12
  { type: 'gems', amount: 30 }, // 13
  { type: 'equipment', rarity: 3, amount: 1 }, // 14
  { type: 'gold', amount: 12000 }, // 15
  { type: 'item', item: 'exp_m', amount: 5 }, // 16
  { type: 'skillEssence', amount: 200 }, // 17
  { type: 'item', item: 'exp_m', amount: 4 }, // 18
  { type: 'item', item: 'equip_essence', amount: 100 }, // 19
  { type: 'gems', amount: 40 }, // 20
  { type: 'equipment', rarity: 3, amount: 2 }, // 21
  { type: 'gold', amount: 15000 }, // 22
  { type: 'item', item: 'exp_l', amount: 1 }, // 23
  { type: 'stamina', amount: 50 }, // 24
  { type: 'skillEssence', amount: 300 }, // 25
  { type: 'item', item: 'exp_m', amount: 8 }, // 26
  { type: 'phaseMaterials', amount: 2 }, // 27
  { type: 'gems', amount: 100 }, // 28
  { type: 'equipment', rarity: 4, amount: 1 }, // 29
  { type: 'item', item: 'exp_l', amount: 2 }, // 30
  { type: 'gems', amount: 200 }, // 31
];
