import { HERO_ROSTER } from './heroes';
import type { Reward } from './rewards';

/**
 * 図鑑: every character in the game, lit when it has been obtained. Collecting characters pays a reward at each of a few
 * counts (placeholder numbers); the last one is the whole roster, so it follows the roster as characters are added.
 */
export interface CollectionMilestone {
  /** How many different characters must be held. */
  count: number;
  rewards: Reward[];
}

const STEPS: { count: number; rewards: Reward[] }[] = [
  { count: 10, rewards: [{ type: 'gems', amount: 50 }] },
  { count: 20, rewards: [{ type: 'gems', amount: 100 }, { type: 'phaseMaterials', amount: 2 }] },
  { count: 30, rewards: [{ type: 'gems', amount: 150 }, { type: 'skillEssence', amount: 300 }] },
  { count: 40, rewards: [{ type: 'gems', amount: 200 }, { type: 'item', item: 'exp_l', amount: 5 }] },
  { count: 50, rewards: [{ type: 'gems', amount: 250 }, { type: 'phaseMaterials', amount: 4 }] },
  { count: 60, rewards: [{ type: 'gems', amount: 300 }, { type: 'item', item: 'exp_xl', amount: 2 }] },
  { count: 70, rewards: [{ type: 'gems', amount: 400 }, { type: 'phaseMaterials', amount: 6 }, { type: 'skillEssence', amount: 600 }] },
];

/** The reward for holding every character in the roster. */
const COMPLETE: Reward[] = [
  { type: 'gems', amount: 1000 },
  { type: 'phaseMaterials', amount: 15 },
  { type: 'item', item: 'exp_xl', amount: 5 },
];

/** The milestones in order; the counts above the roster's size are left out and the complete-the-book one comes last. */
export function collectionMilestones(total = HERO_ROSTER.length): CollectionMilestone[] {
  const list: CollectionMilestone[] = STEPS.filter((s) => s.count < total).map((s) => ({ count: s.count, rewards: s.rewards }));
  list.push({ count: total, rewards: COMPLETE });
  return list;
}
