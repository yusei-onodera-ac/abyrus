import type { Reward } from '../data/rewards';
import type { EquipmentItem } from '../types';
import { BigNumber } from './BigNumber';
import { EquipmentSystem } from './EquipmentSystem';
import { SaveSystem, type SaveData } from './SaveSystem';

/** What handing a reward over produced (the pieces of equipment, for a reward that is one). */
export interface GrantedReward {
  reward: Reward;
  equipment?: EquipmentItem[];
}

export const RewardSystem = {
  grant(save: SaveData, reward: Reward, rng: () => number = Math.random): GrantedReward {
    switch (reward.type) {
      case 'gems':
        SaveSystem.addGems(save, reward.amount);
        break;
      case 'gold':
        SaveSystem.addGold(save, BigNumber.from(reward.amount));
        break;
      case 'stamina':
        SaveSystem.recoverStamina(save, reward.amount);
        break;
      case 'phaseMaterials':
        SaveSystem.addPhaseMaterials(save, reward.amount);
        break;
      case 'skillEssence':
        SaveSystem.addSkillEssence(save, reward.amount);
        break;
      case 'item':
        SaveSystem.addItem(save, reward.item, reward.amount);
        break;
      case 'equipment':
        return { reward, equipment: Array.from({ length: reward.amount }, () => EquipmentSystem.grantRandom(save, reward.rarity, rng)) };
    }
    return { reward };
  },

  grantAll(save: SaveData, rewards: Reward[], rng: () => number = Math.random): GrantedReward[] {
    return rewards.map((r) => this.grant(save, r, rng));
  },
};
