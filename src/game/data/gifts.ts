import type { GiftReward } from '../systems/SaveSystem';

export interface GiftCampaign {
  id: string;
  title: string;
  message: string;
  reward: GiftReward;
  /** Local end time, e.g. "2026-11-11T23:59:00". The gift expires then, and a
   *  player who first opens the game after it is never sent it. */
  endsAt?: string;
  /** Otherwise: how many days the gift stays claimable once it lands in the
   *  player's プレゼントBOX (default 30). */
  expireDays?: number;
}

/**
 * Gifts the operator hands out. Each is delivered to a save once, the next
 * time the player reaches the home screen - so adding an entry here sends it
 * to everyone, and one the player deleted never comes back. This is the thing
 * to edit for a handout; no code elsewhere needs to change.
 */
export const GIFT_CAMPAIGNS: GiftCampaign[] = [
  {
    id: 'welcome-gems',
    title: 'ようこそ記念',
    message: 'ABYRUSへようこそ！ガチャで仲間を集めましょう。',
    reward: { type: 'gems', amount: 300 },
    expireDays: 30,
  },
  {
    id: 'welcome-gold',
    title: '冒険の準備金',
    message: '装備や成長にお使いください。',
    reward: { type: 'gold', amount: 1000 },
    expireDays: 14,
  },
  {
    id: 'thanks-gems',
    title: 'ご利用ありがとうございます',
    message: 'お礼の気持ちです。',
    reward: { type: 'gems', amount: 100 },
    expireDays: 7,
  },
];
