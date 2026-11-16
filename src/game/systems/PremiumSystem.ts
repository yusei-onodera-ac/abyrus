import { PREMIUM, PREMIUM_JOIN_PACK } from '../data/premium';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import { SaveSystem, type SaveData } from './SaveSystem';
import { periodKey } from './ShopSystem';

const DAY_MS = 24 * 60 * 60 * 1000;

/** プレミアムパス. There is no store/server behind it yet, so a "subscription" is
 *  a 30-day period that is bought (through PaymentSystem) and bought again to
 *  carry on - nothing renews by itself. */
export const PremiumSystem = {
  isActive(save: SaveData, now = Date.now()): boolean {
    return save.premium.expiresAt > now;
  },

  /** Whole days left, counting today (0 when not active). */
  daysLeft(save: SaveData, now = Date.now()): number {
    return this.isActive(save, now) ? Math.ceil((save.premium.expiresAt - now) / DAY_MS) : 0;
  },

  /** Starts or extends the pass by 30 days (from the end of the current period if
   *  it is still running) and hands over the 加入特典 pack. */
  activate(save: SaveData, now = Date.now()): GrantedReward[] {
    const from = Math.max(now, save.premium.expiresAt);
    save.premium.expiresAt = from + PREMIUM.durationDays * DAY_MS;
    return RewardSystem.grantAll(save, PREMIUM_JOIN_PACK);
  },

  canClaimDaily(save: SaveData, now = Date.now()): boolean {
    return this.isActive(save, now) && save.premium.dailyDay !== periodKey('day', now);
  },

  /** Today's 魔晶石 for a member. Returns how many, or 0 if there is none to take. */
  claimDaily(save: SaveData, now = Date.now()): number {
    if (!this.canClaimDaily(save, now)) return 0;
    save.premium.dailyDay = periodKey('day', now);
    SaveSystem.addGems(save, PREMIUM.dailyGems);
    return PREMIUM.dailyGems;
  },

  /** How fast fights run: the pass's speed if the member has switched it on, else 1. */
  battleSpeed(save: SaveData, now = Date.now()): number {
    return this.isActive(save, now) && save.settings.speed2x ? PREMIUM.battleSpeed : 1;
  },
};
