import { BigNumber } from './BigNumber';
import { SaveSystem, type SaveData } from './SaveSystem';
import type { Good, LimitPeriod, ShopProduct } from '../data/shop';

/** Why a product can't be bought right now. */
export type BlockReason = 'not_started' | 'ended' | 'sold_out' | 'stamina_full';

export type PurchaseResult =
  | { ok: true; goods: Good[] }
  | { ok: false; reason: BlockReason | 'gems' | 'gold' };

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** The key of the limit period `now` falls in. A count stored under a different
 *  key belongs to an earlier period and no longer counts. Local time, so a
 *  "daily" product resets at the player's own midnight; weeks start on Monday. */
export function periodKey(period: LimitPeriod, now: number): string {
  const d = new Date(now);
  if (period === 'once') return 'once';
  if (period === 'day') return dateKey(d);
  if (period === 'month') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(monday);
}

const PERIOD_LABEL: Record<LimitPeriod, string> = { once: '', day: '1日', week: '週', month: '月' };

/** "1日1回まで" / "購入は1回のみ" - what the card says about the limit. */
export function describeLimit(product: ShopProduct): string | null {
  const limit = product.limit;
  if (!limit) return null;
  if (limit.period === 'once') return limit.count === 1 ? '購入は1回のみ' : `購入は${limit.count}回まで`;
  return `${PERIOD_LABEL[limit.period]}${limit.count}回まで`;
}

export const ShopSystem = {
  /** Epoch ms of a product's sale window edge, or null if it has none. */
  endsAt(product: ShopProduct): number | null {
    const ms = product.endsAt ? Date.parse(product.endsAt) : NaN;
    return Number.isNaN(ms) ? null : ms;
  },

  startsAt(product: ShopProduct): number | null {
    const ms = product.startsAt ? Date.parse(product.startsAt) : NaN;
    return Number.isNaN(ms) ? null : ms;
  },

  /** True once a product's sale window is over. */
  hasEnded(product: ShopProduct, now: number): boolean {
    const end = this.endsAt(product);
    return end !== null && now > end;
  },

  /** Products to list: not yet started ones are hidden; ended ones are dropped too. */
  visible(products: ShopProduct[], now: number): ShopProduct[] {
    return products.filter((p) => {
      const start = this.startsAt(p);
      return (start === null || now >= start) && !this.hasEnded(p, now);
    });
  },

  /** How many more times this product can be bought right now, or null if unlimited. */
  remaining(save: SaveData, product: ShopProduct, now: number): number | null {
    const limit = product.limit;
    if (!limit) return null;
    const record = save.shop.purchases[product.id];
    const used = record && record.period === periodKey(limit.period, now) ? record.count : 0;
    return Math.max(0, limit.count - used);
  },

  /** Why the product can't be bought regardless of what the player holds, or null. */
  blocked(save: SaveData, product: ShopProduct, now: number): BlockReason | null {
    const start = this.startsAt(product);
    if (start !== null && now < start) return 'not_started';
    if (this.hasEnded(product, now)) return 'ended';
    if (this.remaining(save, product, now) === 0) return 'sold_out';
    // A potion with nothing to restore would just be thrown away.
    if (product.goods.every((g) => g.type === 'stamina') && save.stamina[0] >= save.stamina[1]) return 'stamina_full';
    return null;
  },

  /** How much of the product's currency the player is short by (0 if they can pay). */
  shortfall(save: SaveData, product: ShopProduct): number {
    const { currency, amount } = product.price;
    if (currency === 'gems') return Math.max(0, amount - save.gems);
    if (currency === 'gold') {
      const have = SaveSystem.getGold(save);
      return have.gte(amount) ? 0 : BigNumber.from(amount).sub(have).toNumber();
    }
    return 0;
  },

  /** Hands over a product's goods. Stamina fills only up to the max. */
  grant(save: SaveData, goods: Good[]): void {
    for (const good of goods) {
      if (good.type === 'gems') save.gems += good.amount;
      else if (good.type === 'gold') SaveSystem.addGold(save, BigNumber.from(good.amount));
      else if (good.type === 'phaseMaterials') save.phaseMaterials += good.amount;
      else SaveSystem.recoverStamina(save, good.amount);
    }
  },

  /** Counts one purchase against the product's limit. */
  recordPurchase(save: SaveData, product: ShopProduct, now: number): void {
    if (!product.limit) return;
    const key = periodKey(product.limit.period, now);
    const record = save.shop.purchases[product.id];
    save.shop.purchases[product.id] = { period: key, count: (record && record.period === key ? record.count : 0) + 1 };
  },

  /** Buys a product priced in 魔晶石 or ゴールド: checks it's on sale and
   *  affordable, takes the payment, hands over the goods. Nothing changes on a
   *  refusal. (Yen products go through PaymentSystem first - see completePaid.) */
  buyWithCurrency(save: SaveData, product: ShopProduct, now = Date.now()): PurchaseResult {
    const { currency, amount } = product.price;
    if (currency === 'yen') return { ok: false, reason: 'sold_out' };
    const blocked = this.blocked(save, product, now);
    if (blocked) return { ok: false, reason: blocked };
    const paid = currency === 'gems' ? SaveSystem.spendGems(save, amount) : SaveSystem.spendGold(save, BigNumber.from(amount));
    if (!paid) return { ok: false, reason: currency };
    this.grant(save, product.goods);
    this.recordPurchase(save, product, now);
    return { ok: true, goods: product.goods };
  },

  /** Hands over a yen product once the payment gateway has confirmed the money.
   *  Always grants: the player has paid, so the limit is checked BEFORE the
   *  payment starts (the scene also refuses a second tap while one is open). */
  completePaid(save: SaveData, product: ShopProduct, now = Date.now()): Good[] {
    this.grant(save, product.goods);
    this.recordPurchase(save, product, now);
    return product.goods;
  },
};
