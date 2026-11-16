import type { MaterialBundle } from './village';

/**
 * 村の依頼: chores the village sets each day (they start over at local midnight). Doing one pays 素材 (木材・鉄・石),
 * and since only the village shows those, the chores are listed in the village too - not with the other missions.
 * Edit this file to change the list or what a chore pays (数字は仮のバランス).
 */

/** What a chore counts. */
export type VillageQuestKey = 'build' | 'claim' | 'collect' | 'raid' | 'repair';

export interface VillageQuestDef {
  id: string;
  key: VillageQuestKey;
  /** What to do, as it is shown. */
  text: string;
  /** How many times. */
  target: number;
  /** What it pays at the first region (迷いの森); the later regions pay QUEST_REGION_MULTIPLIER times as much. */
  reward: MaterialBundle;
}

export const VILLAGE_QUESTS: VillageQuestDef[] = [
  { id: 'q_build1', key: 'build', text: '建築か強化を1回する', target: 1, reward: { wood: 30, stone: 40 } },
  { id: 'q_build3', key: 'build', text: '建築か強化を3回する', target: 3, reward: { wood: 60, stone: 90, iron: 12 } },
  { id: 'q_claim', key: 'claim', text: '放置報酬を受け取る', target: 1, reward: { stone: 50, iron: 10 } },
  { id: 'q_collect', key: 'collect', text: '行商人や宝箱を2回開ける', target: 2, reward: { wood: 40, stone: 60, iron: 15 } },
  { id: 'q_raid', key: 'raid', text: '襲撃を1回、迎え撃つ', target: 1, reward: { wood: 60, stone: 100, iron: 35 } },
  { id: 'q_repair', key: 'repair', text: '壊れた建物を1つ直す', target: 1, reward: { wood: 30, stone: 30, iron: 8 } },
];

/** By region reached (迷いの森 ... 黄昏の都): what a chore pays is multiplied by this. */
export const QUEST_REGION_MULTIPLIER = [1, 1.6, 2.6, 4, 6];

export function getVillageQuest(id: string): VillageQuestDef | undefined {
  return VILLAGE_QUESTS.find((q) => q.id === id);
}
