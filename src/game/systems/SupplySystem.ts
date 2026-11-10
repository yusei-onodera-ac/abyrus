import { SUPPLY_BOTH_BONUS, SUPPLY_SLOTS, getSupplySlot, type SupplySlot, type SupplySlotId } from '../data/supply';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import type { SaveData } from './SaveSystem';
import { periodKey } from './ShopSystem';

/**
 * 朝夕の補給 (data/supply.ts): a small reward at two times of the day, once each per day, and a bonus for taking both.
 * Everything is read from the player's own clock and the save's record of today; nothing runs in the background.
 */

/** 'upcoming' (not open yet today), 'open' (can be taken now), 'claimed' (taken today), 'missed' (its time went by). */
export type SupplyState = 'upcoming' | 'open' | 'claimed' | 'missed';

/** What taking a slot handed over. */
export interface SupplyClaim {
  slot: SupplySlot;
  granted: GrantedReward[];
  /** The both-slots bonus, when this was the slot that completed the day. */
  bonus: GrantedReward[];
}

const HOUR_MS = 3600 * 1000;

/** Local midnight at the start of the day `now` is in. */
function startOfDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Epoch ms a slot opens / closes on the day `now` is in (the closing hour 24 is the next midnight). */
function opensAt(slot: SupplySlot, now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), slot.startHour).getTime();
}
function closesAt(slot: SupplySlot, now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), slot.endHour).getTime();
}

export const SupplySystem = {
  /** The slots taken today (the record of another day counts as none). */
  claimedToday(save: SaveData, now = Date.now()): SupplySlotId[] {
    return save.supply.day === periodKey('day', now) ? (save.supply.claimed as SupplySlotId[]) : [];
  },

  bonusTaken(save: SaveData, now = Date.now()): boolean {
    return save.supply.day === periodKey('day', now) && save.supply.bonus;
  },

  state(save: SaveData, slot: SupplySlot, now = Date.now()): SupplyState {
    if (SupplySystem.claimedToday(save, now).includes(slot.id)) return 'claimed';
    if (now < opensAt(slot, now)) return 'upcoming';
    return now < closesAt(slot, now) ? 'open' : 'missed';
  },

  /** How many slots can be taken right now (the Home box's red dot). */
  openCount(save: SaveData, now = Date.now()): number {
    return SUPPLY_SLOTS.filter((slot) => SupplySystem.state(save, slot, now) === 'open').length;
  },

  /** True once every slot of today has been taken. */
  allTaken(save: SaveData, now = Date.now()): boolean {
    const taken = SupplySystem.claimedToday(save, now);
    return SUPPLY_SLOTS.every((slot) => taken.includes(slot.id));
  },

  /** True while the both-slots bonus can still be earned today: nothing has been missed. */
  bonusReachable(save: SaveData, now = Date.now()): boolean {
    return SUPPLY_SLOTS.every((slot) => SupplySystem.state(save, slot, now) !== 'missed');
  },

  /** Seconds until `slot` opens: today's opening if it is still to come, else tomorrow's. 0 while it is open. */
  secondsUntilOpen(slot: SupplySlot, now = Date.now()): number {
    if (now >= opensAt(slot, now) && now < closesAt(slot, now)) return 0;
    const next = now < opensAt(slot, now) ? opensAt(slot, now) : opensAt(slot, startOfDay(now) + 36 * HOUR_MS);
    return Math.max(0, Math.ceil((next - now) / 1000));
  },

  /** The soonest thing to say about the clock: the slot to look forward to (the open one first, else the next to open), or
   *  null when every slot of today is taken or past. */
  next(save: SaveData, now = Date.now()): { slot: SupplySlot; state: SupplyState; seconds: number } | null {
    const open = SUPPLY_SLOTS.find((slot) => SupplySystem.state(save, slot, now) === 'open');
    if (open) return { slot: open, state: 'open', seconds: Math.max(0, Math.ceil((closesAt(open, now) - now) / 1000)) };
    const upcoming = SUPPLY_SLOTS.filter((slot) => SupplySystem.state(save, slot, now) === 'upcoming').sort((a, b) => opensAt(a, now) - opensAt(b, now))[0];
    return upcoming ? { slot: upcoming, state: 'upcoming', seconds: Math.max(0, Math.ceil((opensAt(upcoming, now) - now) / 1000)) } : null;
  },

  /** Why `slot` cannot be taken now, or null when it can. */
  check(save: SaveData, slot: SupplySlot, now = Date.now()): string | null {
    switch (SupplySystem.state(save, slot, now)) {
      case 'open':
        return null;
      case 'claimed':
        return '受け取り済みです';
      case 'upcoming':
        return 'まだ受け取れる時間ではありません';
      default:
        return '受け取れる時間が過ぎました';
    }
  },

  /** Takes slot `id`: its reward is handed over, and with it the bonus when this completes the day (every slot taken).
   *  Null, with nothing changed, when `check` says no. */
  claim(save: SaveData, id: string, now = Date.now(), rng: () => number = Math.random): SupplyClaim | null {
    const slot = getSupplySlot(id);
    if (!slot || SupplySystem.check(save, slot, now) !== null) return null;
    const day = periodKey('day', now);
    if (save.supply.day !== day) save.supply = { day, claimed: [], bonus: false };
    save.supply.claimed.push(slot.id);
    const granted = RewardSystem.grantAll(save, slot.rewards, rng);
    let bonus: GrantedReward[] = [];
    if (!save.supply.bonus && SupplySystem.allTaken(save, now)) {
      save.supply.bonus = true;
      bonus = RewardSystem.grantAll(save, SUPPLY_BOTH_BONUS, rng);
    }
    return { slot, granted, bonus };
  },
};
