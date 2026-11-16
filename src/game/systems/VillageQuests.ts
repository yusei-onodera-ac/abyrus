import { VILLAGE_MATERIALS, type MaterialBundle } from '../data/village';
import { QUEST_REGION_MULTIPLIER, VILLAGE_QUESTS, getVillageQuest, type VillageQuestDef, type VillageQuestKey } from '../data/villageQuests';
import { SaveSystem, type SaveData } from './SaveSystem';
import { periodKey } from './ShopSystem';
import { regionReached } from './VillageIncome';

/**
 * 村の依頼 (data/villageQuests.ts): the day's chores, how far each has got, and taking what they pay (素材). Like the
 * other systems this changes the save in memory only: the scene that called it saves. The list starts over at
 * local midnight.
 */
export const VillageQuests = {
  /** Starts the day's list over when the day has changed. */
  refresh(save: SaveData, now = Date.now()): void {
    const day = periodKey('day', now);
    if (save.village.quests.day !== day) save.village.quests = { day, counts: {}, claimed: [] };
  },

  /** Counts `amount` more of `key` toward every chore of that kind (never above its target). */
  record(save: SaveData, key: VillageQuestKey, amount = 1, now = Date.now()): void {
    VillageQuests.refresh(save, now);
    for (const quest of VILLAGE_QUESTS) {
      if (quest.key !== key) continue;
      save.village.quests.counts[quest.id] = Math.min(quest.target, (save.village.quests.counts[quest.id] ?? 0) + amount);
    }
  },

  /** How many times `quest` has been done today. */
  count(save: SaveData, quest: VillageQuestDef, now = Date.now()): number {
    if (save.village.quests.day !== periodKey('day', now)) return 0;
    return Math.min(quest.target, save.village.quests.counts[quest.id] ?? 0);
  },

  isDone(save: SaveData, quest: VillageQuestDef, now = Date.now()): boolean {
    return VillageQuests.count(save, quest, now) >= quest.target;
  },

  isClaimed(save: SaveData, quest: VillageQuestDef, now = Date.now()): boolean {
    return save.village.quests.day === periodKey('day', now) && save.village.quests.claimed.includes(quest.id);
  },

  /** Chores that are done and not yet collected (for the red dot). */
  claimable(save: SaveData, now = Date.now()): VillageQuestDef[] {
    return VILLAGE_QUESTS.filter((q) => VillageQuests.isDone(save, q, now) && !VillageQuests.isClaimed(save, q, now));
  },

  /** What `quest` pays at the region reached: the first region's amounts times the region's multiple. */
  reward(save: SaveData, quest: VillageQuestDef): MaterialBundle {
    const multiple = QUEST_REGION_MULTIPLIER[Math.min(QUEST_REGION_MULTIPLIER.length - 1, regionReached(save))] ?? 1;
    const out: MaterialBundle = {};
    for (const { id } of VILLAGE_MATERIALS) {
      const base = quest.reward[id] ?? 0;
      if (base > 0) out[id] = Math.max(1, Math.round(base * multiple));
    }
    return out;
  },

  /** Collects what a done chore pays: the 素材 go to the village's store. Null (nothing changed) when it is not done,
   *  was collected already, or is no chore. */
  claim(save: SaveData, id: string, now = Date.now()): MaterialBundle | null {
    const quest = getVillageQuest(id);
    if (!quest || !VillageQuests.isDone(save, quest, now) || VillageQuests.isClaimed(save, quest, now)) return null;
    VillageQuests.refresh(save, now);
    const reward = VillageQuests.reward(save, quest);
    SaveSystem.addMaterials(save, reward);
    save.village.quests.claimed.push(quest.id);
    return reward;
  },
};
