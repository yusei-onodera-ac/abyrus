import { BigNumber } from './BigNumber';
import { SaveSystem, type Gift, type GiftReward, type SaveData } from './SaveSystem';
import { GIFT_CAMPAIGNS } from '../data/gifts';
import { MAIL_CAMPAIGNS } from '../data/mails';
import { NOTICES } from '../data/notices';

const DAY = 86_400_000;
const DEFAULT_GIFT_DAYS = 30;

const giftKey = (id: string) => `gift:${id}`;
const mailKey = (id: string) => `mail:${id}`;

export interface ClaimSummary {
  /** How many gifts were claimed. */
  count: number;
  gems: number;
  gold: number;
}

/** Rules for お知らせ / プレゼントBOX / メールBOX. Everything takes `now` so a
 *  caller (or a test) can pin the clock. */
export const InboxSystem = {
  /** Sends this save any operator gift/mail it hasn't received yet (see
   *  data/gifts.ts, data/mails.ts). Returns true if the save changed. */
  deliver(save: SaveData, now = Date.now()): boolean {
    let changed = false;

    for (const campaign of GIFT_CAMPAIGNS) {
      if (save.deliveredInboxIds.includes(giftKey(campaign.id))) continue;
      const endsAt = campaign.endsAt ? new Date(campaign.endsAt).getTime() : null;
      // Ended before this player ever got it: skip, don't hand out an expired gift.
      if (endsAt !== null && endsAt <= now) continue;
      save.gifts.push({
        id: campaign.id,
        title: campaign.title,
        message: campaign.message,
        reward: { ...campaign.reward },
        receivedAt: now,
        expiresAt: endsAt ?? now + (campaign.expireDays ?? DEFAULT_GIFT_DAYS) * DAY,
        claimed: false,
      });
      save.deliveredInboxIds.push(giftKey(campaign.id));
      changed = true;
    }

    for (const campaign of MAIL_CAMPAIGNS) {
      if (save.deliveredInboxIds.includes(mailKey(campaign.id))) continue;
      const sentAt = new Date(campaign.sentAt).getTime();
      if (sentAt > now) continue;
      save.mails.push({ id: campaign.id, title: campaign.title, body: campaign.body, sentAt, read: false });
      save.deliveredInboxIds.push(mailKey(campaign.id));
      changed = true;
    }

    return changed;
  },

  // --- gifts -----------------------------------------------------------

  canClaim(gift: Gift, now = Date.now()): boolean {
    return !gift.claimed && gift.expiresAt > now;
  },

  isExpired(gift: Gift, now = Date.now()): boolean {
    return !gift.claimed && gift.expiresAt <= now;
  },

  /** Claimed or expired: nothing more to get from it, so it may be deleted. */
  canDeleteGift(gift: Gift, now = Date.now()): boolean {
    return gift.claimed || gift.expiresAt <= now;
  },

  applyReward(save: SaveData, reward: GiftReward): void {
    if (reward.type === 'gems') save.gems += reward.amount;
    else SaveSystem.addGold(save, BigNumber.from(reward.amount));
  },

  /** Claims one gift. Null (and no change) if it's already claimed, expired, or unknown. */
  claimGift(save: SaveData, id: string, now = Date.now()): GiftReward | null {
    const gift = save.gifts.find((g) => g.id === id);
    if (!gift || !this.canClaim(gift, now)) return null;
    gift.claimed = true;
    this.applyReward(save, gift.reward);
    return gift.reward;
  },

  claimAllGifts(save: SaveData, now = Date.now()): ClaimSummary {
    const summary: ClaimSummary = { count: 0, gems: 0, gold: 0 };
    for (const gift of save.gifts) {
      if (!this.canClaim(gift, now)) continue;
      gift.claimed = true;
      this.applyReward(save, gift.reward);
      summary.count += 1;
      summary[gift.reward.type] += gift.reward.amount;
    }
    return summary;
  },

  /** False (and no change) while the gift is still claimable. */
  deleteGift(save: SaveData, id: string, now = Date.now()): boolean {
    const gift = save.gifts.find((g) => g.id === id);
    if (!gift || !this.canDeleteGift(gift, now)) return false;
    save.gifts = save.gifts.filter((g) => g.id !== id);
    return true;
  },

  /** Deletes every claimed or expired gift; returns how many. Anything still
   *  claimable is left alone. */
  deleteSettledGifts(save: SaveData, now = Date.now()): number {
    const before = save.gifts.length;
    save.gifts = save.gifts.filter((g) => !this.canDeleteGift(g, now));
    return before - save.gifts.length;
  },

  /** Claimable first (soonest expiry first), then the settled ones, newest first. */
  sortedGifts(save: SaveData, now = Date.now()): Gift[] {
    const live = save.gifts.filter((g) => this.canClaim(g, now)).sort((a, b) => a.expiresAt - b.expiresAt);
    const settled = save.gifts.filter((g) => !this.canClaim(g, now)).sort((a, b) => b.receivedAt - a.receivedAt);
    return [...live, ...settled];
  },

  // --- mails -----------------------------------------------------------

  markMailRead(save: SaveData, id: string): boolean {
    const mail = save.mails.find((m) => m.id === id);
    if (!mail || mail.read) return false;
    mail.read = true;
    return true;
  },

  markAllMailsRead(save: SaveData): number {
    let count = 0;
    for (const mail of save.mails) {
      if (mail.read) continue;
      mail.read = true;
      count += 1;
    }
    return count;
  },

  /** Only a read mail can be deleted. */
  deleteMail(save: SaveData, id: string): boolean {
    const mail = save.mails.find((m) => m.id === id);
    if (!mail || !mail.read) return false;
    save.mails = save.mails.filter((m) => m.id !== id);
    return true;
  },

  deleteReadMails(save: SaveData): number {
    const before = save.mails.length;
    save.mails = save.mails.filter((m) => !m.read);
    return before - save.mails.length;
  },

  sortedMails(save: SaveData): SaveData['mails'] {
    return [...save.mails].sort((a, b) => b.sentAt - a.sentAt);
  },

  // --- notices ---------------------------------------------------------

  markNoticeRead(save: SaveData, id: string): boolean {
    if (save.readNotices.includes(id)) return false;
    save.readNotices.push(id);
    return true;
  },

  // --- home-screen red dots ---------------------------------------------

  getUnread(save: SaveData, now = Date.now()): { notification: boolean; giftBox: boolean; mail: boolean } {
    return {
      notification: NOTICES.some((n) => !save.readNotices.includes(n.id)),
      giftBox: save.gifts.some((g) => this.canClaim(g, now)),
      mail: save.mails.some((m) => !m.read),
    };
  },
};
