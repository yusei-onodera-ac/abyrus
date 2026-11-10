import type { Reward } from './rewards';

/**
 * 朝夕の補給: two times of the day (the player's own clock) at which a small reward can be taken, once each per day.
 * It is there to give a reason to open the game twice a day. Edit this file to change the hours and what is given
 * (数字は仮のバランス).
 *
 * A slot can be taken from `startHour` until `endHour` (24 = midnight); a slot that was not taken in time is simply
 * gone for that day. Taking BOTH slots on the same day also pays SUPPLY_BOTH_BONUS.
 */
export type SupplySlotId = 'morning' | 'evening';

export interface SupplySlot {
  id: SupplySlotId;
  name: string;
  /** Local hour (0..23) the slot opens at, and the hour (1..24) it closes at. */
  startHour: number;
  endHour: number;
  rewards: Reward[];
}

export const SUPPLY_SLOTS: SupplySlot[] = [
  {
    id: 'morning',
    name: '朝の補給',
    startHour: 6,
    endHour: 14,
    rewards: [
      { type: 'stamina', amount: 30 },
      { type: 'gems', amount: 10 },
      { type: 'item', item: 'exp_m', amount: 3 },
    ],
  },
  {
    id: 'evening',
    name: '夕の補給',
    startHour: 18,
    endHour: 24,
    rewards: [
      { type: 'stamina', amount: 30 },
      { type: 'gems', amount: 10 },
      { type: 'skillEssence', amount: 50 },
    ],
  },
];

/** What taking every slot of one day adds on top. */
export const SUPPLY_BOTH_BONUS: Reward[] = [
  { type: 'gems', amount: 20 },
  { type: 'item', item: 'equip_essence', amount: 20 },
];

export function getSupplySlot(id: string): SupplySlot | undefined {
  return SUPPLY_SLOTS.find((slot) => slot.id === id);
}
