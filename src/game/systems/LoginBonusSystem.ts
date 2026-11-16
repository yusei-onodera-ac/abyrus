import { LOGIN_BONUS } from '../data/loginBonus';
import type { Reward } from '../data/rewards';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import type { SaveData } from './SaveSystem';
import { periodKey } from './ShopSystem';

/** ログインボーナス: a calendar of the current month, one reward per day, each
 *  claimable on its own day only. A new month starts a fresh calendar. */
export const LoginBonusSystem = {
  dayOfMonth(now = Date.now()): number {
    return new Date(now).getDate();
  },

  daysInMonth(now = Date.now()): number {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  },

  /** The reward for day `day` (1-based) of the month. */
  rewardFor(day: number): Reward {
    return LOGIN_BONUS[(day - 1) % LOGIN_BONUS.length];
  },

  /** Days of this month already claimed (the calendar is reset when the month changes). */
  claimedDays(save: SaveData, now = Date.now()): number[] {
    return save.loginBonus.month === periodKey('month', now) ? save.loginBonus.claimed : [];
  },

  canClaim(save: SaveData, now = Date.now()): boolean {
    return !this.claimedDays(save, now).includes(this.dayOfMonth(now));
  },

  /** Hands over today's reward, or null if it was already taken. */
  claim(save: SaveData, now = Date.now(), rng: () => number = Math.random): GrantedReward | null {
    if (!this.canClaim(save, now)) return null;
    const claimed = [...this.claimedDays(save, now), this.dayOfMonth(now)];
    save.loginBonus = { month: periodKey('month', now), claimed };
    return RewardSystem.grant(save, this.rewardFor(this.dayOfMonth(now)), rng);
  },
};
