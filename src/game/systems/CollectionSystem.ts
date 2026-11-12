import { HERO_ROSTER } from '../data/heroes';
import { collectionMilestones, type CollectionMilestone } from '../data/collection';
import type { Rarity } from '../types';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import type { SaveData } from './SaveSystem';

/** 図鑑 (data/collection.ts): which characters have been obtained and the rewards for how many. Whether a character was
 *  obtained is read from the heroes held (a character never leaves the roster); only the milestones taken are stored. */
export const CollectionSystem = {
  total(): number {
    return HERO_ROSTER.length;
  },

  /** The characters (HeroDefinition ids) held, any copy. */
  ownedIds(save: SaveData): Set<string> {
    return new Set(save.heroes.map((h) => h.heroId));
  },

  /** How many of the roster's characters are held. */
  owned(save: SaveData): number {
    const held = this.ownedIds(save);
    return HERO_ROSTER.filter((d) => held.has(d.id)).length;
  },

  /** Held / total for each rarity, highest first. */
  byRarity(save: SaveData): { rarity: Rarity; owned: number; total: number }[] {
    const held = this.ownedIds(save);
    const rarities = [...new Set(HERO_ROSTER.map((d) => d.rarity))].sort((a, b) => b - a);
    return rarities.map((rarity) => {
      const defs = HERO_ROSTER.filter((d) => d.rarity === rarity);
      return { rarity, owned: defs.filter((d) => held.has(d.id)).length, total: defs.length };
    });
  },

  milestones(): CollectionMilestone[] {
    return collectionMilestones();
  },

  state(save: SaveData, milestone: CollectionMilestone): 'locked' | 'claimable' | 'claimed' {
    if (save.collection.claimed.includes(milestone.count)) return 'claimed';
    return this.owned(save) >= milestone.count ? 'claimable' : 'locked';
  },

  /** How many milestones are reached and not yet taken (the red dot). */
  claimable(save: SaveData): number {
    return this.milestones().filter((m) => this.state(save, m) === 'claimable').length;
  },

  /** Takes a reached milestone's reward. Null when it is not reached or already taken. */
  claim(save: SaveData, count: number): GrantedReward[] | null {
    const milestone = this.milestones().find((m) => m.count === count);
    if (!milestone || this.state(save, milestone) !== 'claimable') return null;
    save.collection.claimed.push(milestone.count);
    return RewardSystem.grantAll(save, milestone.rewards);
  },
};
