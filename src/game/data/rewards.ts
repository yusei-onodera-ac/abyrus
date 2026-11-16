import type { Rarity } from '../types';
import type { ItemId } from './items';

/** One thing a bonus hands over: the ログインボーナス, the プレミアムパス pack,
 *  and so on all describe their contents with this. */
export type Reward =
  | { type: 'gems' | 'gold' | 'stamina' | 'phaseMaterials' | 'skillEssence'; amount: number }
  | { type: 'item'; item: ItemId; amount: number }
  /** `amount` pieces of equipment of that rarity, each a random one. */
  | { type: 'equipment'; rarity: Rarity; amount: number };
