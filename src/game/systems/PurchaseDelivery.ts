import { PREMIUM } from '../data/premium';
import { GEM_PRODUCTS, PACKS, STATIC_YEN_PRODUCTS, type Good, type ShopProduct } from '../data/shop';
import { PremiumSystem } from './PremiumSystem';
import type { GrantedReward } from './RewardSystem';
import type { SaveData } from './SaveSystem';
import { ShopSystem } from './ShopSystem';

/** How many handed-over transaction ids the save remembers (oldest dropped). A transaction only comes back until it is finished,
 *  so a short list is enough: it only has to cover "the app died between saving and telling the store". */
export const PAID_KEEP = 50;

/** What a real-money purchase handed over. */
export type Delivered = { kind: 'goods'; product: ShopProduct; goods: Good[] } | { kind: 'premium'; granted: GrantedReward[] };

export type Delivery =
  | Delivered
  /** This transaction was handed over before: nothing is given a second time. */
  | { kind: 'duplicate' }
  /** A product this game does not know (and that the shop cannot show either): nothing is given, nothing is remembered. */
  | { kind: 'unknown' };

/** The yen product with this id: the shop's live list first (the operator's admin may have changed it), else as it was written in data/shop.ts. */
function findProduct(productId: string): ShopProduct | undefined {
  return [...PACKS, ...GEM_PRODUCTS].find((p) => p.id === productId && p.price.currency === 'yen') ?? STATIC_YEN_PRODUCTS.find((p) => p.id === productId);
}

/**
 * Hands over what a real-money purchase bought. The one place that does it, for a purchase just made in the shop, for the プレミアムパス,
 * and for one the store hands back later (a payment the app died on, an Ask to Buy that was approved): the same code, the same result.
 *
 * Paid is paid: the purchase limit (PurchaseLimit) is not looked at here - it was checked BEFORE the payment started, and a player
 * who has paid always gets the goods (the purchase is counted against the limit anyway). The caller saves, and only then tells the
 * store it is done (PaidReceipt.finish).
 */
export const PurchaseDelivery = {
  isDelivered(save: SaveData, transactionId: string): boolean {
    return (save.shop.paid ?? []).includes(transactionId);
  },

  /**
   * `transactionId` is the store's id of the payment (none for the dev build's test payment). `product` is the shop's own product object
   * when the caller has it (a purchase made on the shop screen); otherwise the product is looked up by `productId`.
   */
  deliver(save: SaveData, productId: string, transactionId?: string, product?: ShopProduct, now = Date.now()): Delivery {
    if (transactionId !== undefined && this.isDelivered(save, transactionId)) return { kind: 'duplicate' };
    let delivered: Delivered;
    if (productId === PREMIUM.productId) {
      delivered = { kind: 'premium', granted: PremiumSystem.activate(save, now) };
    } else {
      const found = product ?? findProduct(productId);
      if (!found) return { kind: 'unknown' };
      delivered = { kind: 'goods', product: found, goods: ShopSystem.completePaid(save, found, now) };
    }
    if (transactionId !== undefined) {
      const paid = (save.shop.paid ??= []);
      paid.push(transactionId);
      if (paid.length > PAID_KEEP) paid.splice(0, paid.length - PAID_KEEP);
    }
    return delivered;
  },
};
