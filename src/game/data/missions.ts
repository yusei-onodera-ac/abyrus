import type { Reward } from './rewards';

/**
 * デイリーミッション: the day's list of things to do, each with a reward; doing them all
 * pays a bonus on top. The list resets at the player's local midnight. Edit this file
 * to change the missions or what they pay (数字は仮のバランス).
 *
 * `key` is what is counted; the game adds to it where it happens (a won stage, a
 * gacha pull, ...: see recordMission in systems/MissionProgress.ts).
 */
export type MissionKey = 'quest_clear' | 'stamina' | 'gacha_pull' | 'hero_enhance' | 'equip_enhance' | 'idle_claim' | 'infinite_run';

export interface MissionDef {
  id: string;
  title: string;
  key: MissionKey;
  target: number;
  reward: Reward;
}

export const DAILY_MISSIONS: MissionDef[] = [
  { id: 'quest3', title: 'クエストを3回クリアする', key: 'quest_clear', target: 3, reward: { type: 'gems', amount: 20 } },
  { id: 'quest10', title: 'クエストを10回クリアする', key: 'quest_clear', target: 10, reward: { type: 'item', item: 'exp_m', amount: 3 } },
  { id: 'stamina50', title: 'スタミナを50使う', key: 'stamina', target: 50, reward: { type: 'gold', amount: 5000 } },
  { id: 'gacha1', title: 'ガチャを1回引く', key: 'gacha_pull', target: 1, reward: { type: 'gold', amount: 3000 } },
  { id: 'hero1', title: 'キャラを強化する', key: 'hero_enhance', target: 1, reward: { type: 'item', item: 'exp_s', amount: 20 } },
  { id: 'equip1', title: '装備を強化する', key: 'equip_enhance', target: 1, reward: { type: 'item', item: 'equip_essence', amount: 30 } },
  { id: 'idle1', title: '放置報酬を受け取る', key: 'idle_claim', target: 1, reward: { type: 'skillEssence', amount: 100 } },
  { id: 'infinite1', title: '無限モードに挑戦する', key: 'infinite_run', target: 1, reward: { type: 'phaseMaterials', amount: 1 } },
];

/** Paid once for finishing (and taking) every mission of the day. */
export const MISSION_BONUS: Reward[] = [
  { type: 'gems', amount: 50 },
  { type: 'item', item: 'exp_l', amount: 1 },
];
