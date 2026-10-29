/**
 * ショップの品揃え。価格・中身・購入回数・販売期間はすべてここだけで決まる
 * (画面側のコードは触らない)。商品を足す/変えるときは配列を編集するだけ。
 *
 *  - PACKS          お得パック   円 or 魔晶石で購入
 *  - GEM_PRODUCTS   魔晶石       円で購入
 *  - GOLD_PRODUCTS  ゴールド     魔晶石で購入
 *  - ITEM_PRODUCTS  アイテム     魔晶石 or ゴールドで購入
 *
 * 数字はどれも仮のバランス。実際の経済に合わせて調整すること。
 */

/** Where the shop opens: the top bar's + buttons ask for the part of the shop
 *  that sells what they show. */
export type ShopFocus = 'packs' | 'gems' | 'gold' | 'stamina' | 'materials';

export type GoodType = 'gems' | 'gold' | 'stamina' | 'phaseMaterials';

/** One thing a product hands over. `stamina` restores that much (up to the max). */
export interface Good {
  type: GoodType;
  amount: number;
}

/** What a product costs: real money (円, tax included), 魔晶石 or ゴールド. */
export interface Price {
  currency: 'yen' | 'gems' | 'gold';
  amount: number;
}

export type LimitPeriod = 'once' | 'day' | 'week' | 'month';

/** At most `count` purchases per `period` ('once' = ever; day/week/month reset
 *  at the player's local midnight / Monday / 1st). */
export interface PurchaseLimit {
  period: LimitPeriod;
  count: number;
}

export interface ShopProduct {
  id: string;
  name: string;
  description?: string;
  price: Price;
  goods: Good[];
  /** Part of the main good that is "おまけ" (already included in `goods`), shown as a chip. */
  bonus?: number;
  limit?: PurchaseLimit;
  /** Red tag on the card: 初回限定, 期間限定, おすすめ... */
  badge?: string;
  /** Sold from / until, as a date string Date.parse understands. Outside this
   *  window the product is hidden (before startsAt) or listed as ended. */
  startsAt?: string;
  endsAt?: string;
  /** Item shop only: which section the product sits under. */
  category?: 'stamina' | 'material';
}

export const PACKS: ShopProduct[] = [
  {
    id: 'pack-starter',
    name: '初心者パック',
    description: '最初の冒険を強力に後押しする、1回限りのお得なセット。',
    price: { currency: 'yen', amount: 480 },
    goods: [
      { type: 'gems', amount: 300 },
      { type: 'gold', amount: 20000 },
      { type: 'phaseMaterials', amount: 3 },
    ],
    limit: { period: 'once', count: 1 },
    badge: '初回限定',
  },
  {
    id: 'pack-limited',
    name: 'ゴージャスパック',
    description: '期間中は月に1回だけ買える、特大ボリュームのパック。',
    price: { currency: 'yen', amount: 1220 },
    goods: [
      { type: 'gems', amount: 700 },
      { type: 'gold', amount: 100000 },
      { type: 'phaseMaterials', amount: 8 },
    ],
    limit: { period: 'month', count: 1 },
    badge: '期間限定',
    endsAt: '2026-12-31T23:59:59+09:00',
  },
  {
    id: 'pack-weekly',
    name: 'ウィークリーパック',
    description: '週に1回、まとめて補充できる定番パック。',
    price: { currency: 'yen', amount: 980 },
    goods: [
      { type: 'gems', amount: 420 },
      { type: 'gold', amount: 50000 },
      { type: 'phaseMaterials', amount: 5 },
    ],
    limit: { period: 'week', count: 1 },
  },
  {
    id: 'pack-daily',
    name: 'デイリーお得パック',
    description: '毎日1回買える、ちょっとお得な魔晶石とスタミナ。',
    price: { currency: 'yen', amount: 160 },
    goods: [
      { type: 'gems', amount: 60 },
      { type: 'stamina', amount: 30 },
    ],
    limit: { period: 'day', count: 1 },
  },
  {
    id: 'pack-adventurer',
    name: '冒険者応援パック',
    description: '魔晶石で買えるパック。ゴールドと素材とスタミナをまとめて。',
    price: { currency: 'gems', amount: 100 },
    goods: [
      { type: 'gold', amount: 15000 },
      { type: 'phaseMaterials', amount: 2 },
      { type: 'stamina', amount: 50 },
    ],
    limit: { period: 'day', count: 1 },
    badge: '魔晶石で購入',
  },
];

export const GEM_PRODUCTS: ShopProduct[] = [
  { id: 'gems-50', name: '魔晶石', price: { currency: 'yen', amount: 160 }, goods: [{ type: 'gems', amount: 50 }] },
  { id: 'gems-160', name: '魔晶石', price: { currency: 'yen', amount: 480 }, goods: [{ type: 'gems', amount: 160 }], bonus: 10 },
  { id: 'gems-330', name: '魔晶石', price: { currency: 'yen', amount: 980 }, goods: [{ type: 'gems', amount: 330 }], bonus: 30 },
  { id: 'gems-850', name: '魔晶石', price: { currency: 'yen', amount: 2440 }, goods: [{ type: 'gems', amount: 850 }], bonus: 100 },
  { id: 'gems-1800', name: '魔晶石', price: { currency: 'yen', amount: 4900 }, goods: [{ type: 'gems', amount: 1800 }], bonus: 250, badge: 'おすすめ' },
  { id: 'gems-3800', name: '魔晶石', price: { currency: 'yen', amount: 9800 }, goods: [{ type: 'gems', amount: 3800 }], bonus: 600 },
];

export const GOLD_PRODUCTS: ShopProduct[] = [
  { id: 'gold-1000', name: 'ゴールド', price: { currency: 'gems', amount: 10 }, goods: [{ type: 'gold', amount: 1000 }] },
  { id: 'gold-6000', name: 'ゴールド', price: { currency: 'gems', amount: 50 }, goods: [{ type: 'gold', amount: 6000 }], bonus: 1000 },
  { id: 'gold-14000', name: 'ゴールド', price: { currency: 'gems', amount: 100 }, goods: [{ type: 'gold', amount: 14000 }], bonus: 4000 },
  { id: 'gold-80000', name: 'ゴールド', price: { currency: 'gems', amount: 500 }, goods: [{ type: 'gold', amount: 80000 }], bonus: 30000, badge: 'おすすめ' },
];

export const ITEM_PRODUCTS: ShopProduct[] = [
  {
    id: 'item-stamina-s',
    name: 'スタミナ回復薬（小）',
    description: 'スタミナを10回復する。',
    price: { currency: 'gold', amount: 1000 },
    goods: [{ type: 'stamina', amount: 10 }],
    category: 'stamina',
  },
  {
    id: 'item-stamina-m',
    name: 'スタミナ回復薬（中）',
    description: 'スタミナを30回復する。',
    price: { currency: 'gems', amount: 15 },
    goods: [{ type: 'stamina', amount: 30 }],
    category: 'stamina',
  },
  {
    id: 'item-stamina-l',
    name: 'スタミナ回復薬（大）',
    description: 'スタミナを50回復する。',
    price: { currency: 'gems', amount: 25 },
    goods: [{ type: 'stamina', amount: 50 }],
    category: 'stamina',
  },
  {
    id: 'item-phase-1',
    name: 'フェーズ素材',
    description: '英雄のフェーズを1段階上げられる素材。',
    price: { currency: 'gold', amount: 5000 },
    goods: [{ type: 'phaseMaterials', amount: 1 }],
    limit: { period: 'day', count: 5 },
    category: 'material',
  },
  {
    id: 'item-phase-5',
    name: 'フェーズ素材 ×5',
    description: 'フェーズ素材のまとめ買い。',
    price: { currency: 'gems', amount: 100 },
    goods: [{ type: 'phaseMaterials', amount: 5 }],
    category: 'material',
  },
];
