import { ITEMS, type ItemId } from '../data/items';
import { PREMIUM, PREMIUM_JOIN_PACK } from '../data/premium';
import type { Reward } from '../data/rewards';
import type { Rarity } from '../types';
import { GEM_PRODUCTS, GOLD_PRODUCTS, ITEM_PRODUCTS, PACKS, type Good, type GoodType, type LimitPeriod, type ShopProduct } from '../data/shop';
import { isLeaderboardConfigured } from './firebaseConfig';
import { openFirestore, withTimeout } from './firestoreRead';

/**
 * ショップの商品とプレミアムパスの値段を、運営の管理画面 (abyrus-admin) が Firestore に書いたものから読む。
 *
 *   shopProducts/{商品id}  { name, description, group: 'pack'|'gems'|'gold'|'item', priceCurrency: 'yen'|'gems'|'gold', priceAmount,
 *                            goods: [{type, amount}], bonus?, limitPeriod?, limitCount?, badge?, startsAt?, endsAt?, category? }
 *   config/premium         { yen, durationDays, dailyGems, battleSpeed, idleCapHours, joinPack: [{type, amount, item?, rarity?}] }
 *
 * LeaderboardSystem と同じ流儀: 設定 (VITE_FIREBASE_*) がなければネットワークにも SDK にも触れず、取得に失敗しても (オフライン・
 * ルール・形式の違い) 何も言わず、data/shop.ts と data/premium.ts の静的データのまま。例外は絶対に投げない。
 *
 * 取れたら、静的な配列・オブジェクトの中身を **その場で** 入れ替える (PACKS / GEM_PRODUCTS / GOLD_PRODUCTS / ITEM_PRODUCTS / PREMIUM /
 * PREMIUM_JOIN_PACK)。画面と購入のコード (ShopScene・PremiumScene・ShopSystem・PremiumSystem) は同じ変数を読むので、触らずに済む。
 * 起動時に1回だけ取る (BootScene)。取れた後に開いた画面から新しい値になる。
 *
 * 決まり:
 *  - 1つ1つのドキュメントを検めて、形が正しくないもの (型・範囲・知らない素材) は捨てる。正しいものだけを使う。
 *  - 商品は group ごとに入れ替える。ある group に正しい商品が1つもなければ、その group は静的データのまま (間違えて売り場を空にしない)。
 *  - 順番: 静的データにある id は静的データの並びのまま、新しい id はそのあとに id 順で足す。
 *  - プレミアムの値は、1項目ずつ検めて、正しい項目だけ上書きする。joinPack は、正しい報酬が1つ以上あるときだけ入れ替える。
 *  - 商品の id がそのまま購入回数の数え方の鍵になる (SaveData.shop.purchases): 管理画面は、いまの商品の id を変えないこと。
 */

export type RemoteShopGroup = 'pack' | 'gems' | 'gold' | 'item';

/** What was read, before any checking (tests give their own). */
export interface RemoteShopData {
  products: { id: string; data: unknown }[];
  premium: unknown | null;
}
export type RemoteShopFetcher = () => Promise<RemoteShopData>;

export type RemoteShopStatus = 'not_configured' | 'unavailable' | 'ok';
export interface RemoteShopResult {
  status: RemoteShopStatus;
  /** How many products were used (after dropping the invalid ones). */
  products: number;
  /** How many documents were dropped as invalid. */
  dropped: number;
  /** Which premium fields were taken. */
  premium: string[];
}

// ---------------------------------------------------------------------------------------------------- checking one document

const GROUPS: RemoteShopGroup[] = ['pack', 'gems', 'gold', 'item'];
const CURRENCIES = ['yen', 'gems', 'gold'] as const;
const PERIODS: LimitPeriod[] = ['once', 'day', 'week', 'month'];
const PLAIN_GOODS = ['gems', 'gold', 'stamina', 'phaseMaterials', 'skillEssence'];
const MAX_YEN = 1_000_000;
const MAX_AMOUNT = 1_000_000_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isItemId = (v: unknown): v is ItemId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v);

/** A date the product window can use: a string Date.parse understands, or a Firestore Timestamp (as a string back). null = not a date. */
function dateText(v: unknown): string | null {
  if (typeof v === 'string') return Number.isFinite(Date.parse(v)) ? v : null;
  if (isObject(v) && typeof v.toDate === 'function') {
    const d = (v.toDate as () => unknown).call(v);
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (isObject(v) && typeof v.seconds === 'number' && Number.isFinite(v.seconds)) return new Date(v.seconds * 1000).toISOString();
  return null;
}

function goodOf(v: unknown): Good | null {
  if (!isObject(v) || !isInt(v.amount, 1, MAX_AMOUNT)) return null;
  const type = v.type;
  if (typeof type === 'string' && (PLAIN_GOODS.includes(type) || isItemId(type))) return { type: type as GoodType, amount: v.amount };
  return null;
}

/** One shopProducts document -> a product and its group, or null when it is not a valid product. Never throws. */
export function parseShopProduct(id: string, raw: unknown): { group: RemoteShopGroup; product: ShopProduct } | null {
  if (!isText(id, 80) || !isObject(raw)) return null;
  if (!isText(raw.name, 60)) return null;
  if (typeof raw.group !== 'string' || !GROUPS.includes(raw.group as RemoteShopGroup)) return null;
  const currency = raw.priceCurrency;
  if (typeof currency !== 'string' || !(CURRENCIES as readonly string[]).includes(currency)) return null;
  if (!isInt(raw.priceAmount, 1, currency === 'yen' ? MAX_YEN : MAX_AMOUNT)) return null;
  if (!Array.isArray(raw.goods) || raw.goods.length === 0 || raw.goods.length > 10) return null;
  const goods: Good[] = [];
  for (const g of raw.goods) {
    const good = goodOf(g);
    if (!good) return null; // a product that hands out something this game does not know must not be sold
    goods.push(good);
  }

  const product: ShopProduct = { id, name: raw.name.trim(), price: { currency: currency as ShopProduct['price']['currency'], amount: raw.priceAmount }, goods };
  if (raw.description !== undefined && raw.description !== null && raw.description !== '') {
    if (!isText(raw.description, 300)) return null;
    product.description = raw.description;
  }
  if (raw.bonus !== undefined && raw.bonus !== null) {
    if (!isInt(raw.bonus, 0, MAX_AMOUNT)) return null;
    if (raw.bonus > 0) product.bonus = raw.bonus;
  }
  if (raw.limitPeriod !== undefined && raw.limitPeriod !== null && raw.limitPeriod !== '') {
    if (typeof raw.limitPeriod !== 'string' || !PERIODS.includes(raw.limitPeriod as LimitPeriod)) return null;
    const count = raw.limitCount === undefined || raw.limitCount === null ? 1 : raw.limitCount;
    if (!isInt(count, 1, 9999)) return null;
    product.limit = { period: raw.limitPeriod as LimitPeriod, count };
  }
  if (raw.badge !== undefined && raw.badge !== null && raw.badge !== '') {
    if (!isText(raw.badge, 16)) return null;
    product.badge = raw.badge;
  }
  for (const key of ['startsAt', 'endsAt'] as const) {
    const v = raw[key];
    if (v === undefined || v === null || v === '') continue;
    const text = dateText(v);
    if (text === null) return null;
    product[key] = text;
  }
  const group = raw.group as RemoteShopGroup;
  if (group === 'item') {
    // The item shop shows 'stamina' and 'material' sections; one without a (known) section would not be shown at all.
    product.category = raw.category === 'stamina' ? 'stamina' : 'material';
  }
  return { group, product };
}

// ---------------------------------------------------------------------------------------------------- the premium pass

export interface PremiumConfig {
  yen: number;
  durationDays: number;
  dailyGems: number;
  battleSpeed: number;
  idleCapHours: number;
  joinPack: Reward[];
}

function rewardOf(v: unknown): Reward | null {
  if (!isObject(v) || !isInt(v.amount, 1, MAX_AMOUNT)) return null;
  if (typeof v.type === 'string' && PLAIN_GOODS.includes(v.type)) return { type: v.type as 'gems', amount: v.amount };
  if (v.type === 'item' && isItemId(v.item)) return { type: 'item', item: v.item, amount: v.amount };
  if (v.type === 'equipment' && isInt(v.rarity, 1, 5)) return { type: 'equipment', rarity: v.rarity as Rarity, amount: v.amount };
  return null;
}

/** config/premium -> the fields that are valid (each is checked on its own); {} when it is not an object. Never throws. */
export function parsePremiumConfig(raw: unknown): Partial<PremiumConfig> {
  const out: Partial<PremiumConfig> = {};
  if (!isObject(raw)) return out;
  if (isInt(raw.yen, 1, MAX_YEN)) out.yen = raw.yen;
  if (isInt(raw.durationDays, 1, 365)) out.durationDays = raw.durationDays;
  if (isInt(raw.dailyGems, 0, 100_000)) out.dailyGems = raw.dailyGems;
  if (typeof raw.battleSpeed === 'number' && Number.isFinite(raw.battleSpeed) && raw.battleSpeed >= 1 && raw.battleSpeed <= 4) out.battleSpeed = raw.battleSpeed;
  if (isInt(raw.idleCapHours, 1, 168)) out.idleCapHours = raw.idleCapHours;
  if (Array.isArray(raw.joinPack) && raw.joinPack.length <= 12) {
    const pack = raw.joinPack.map(rewardOf).filter((r): r is Reward => r !== null);
    if (pack.length > 0) out.joinPack = pack;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- putting it in

const TARGETS: Record<RemoteShopGroup, ShopProduct[]> = { pack: PACKS, gems: GEM_PRODUCTS, gold: GOLD_PRODUCTS, item: ITEM_PRODUCTS };
/** The static data as it was written in data/shop.ts and data/premium.ts: every apply starts from it, and `reset` goes back to it. */
const STATIC = {
  products: Object.fromEntries(GROUPS.map((g) => [g, [...TARGETS[g]]])) as Record<RemoteShopGroup, ShopProduct[]>,
  premium: { ...PREMIUM },
  joinPack: [...PREMIUM_JOIN_PACK],
};

/** Back to the static data (also what an apply starts from, so a product taken off the server comes back as the static one). */
export function resetRemoteShop(): void {
  for (const g of GROUPS) TARGETS[g].splice(0, TARGETS[g].length, ...STATIC.products[g]);
  Object.assign(PREMIUM, STATIC.premium);
  PREMIUM_JOIN_PACK.splice(0, PREMIUM_JOIN_PACK.length, ...STATIC.joinPack);
}

/** Checks what was read and puts the valid parts in place of the static data. Never throws. */
export function applyRemoteShop(data: RemoteShopData): RemoteShopResult {
  resetRemoteShop();
  const result: RemoteShopResult = { status: 'ok', products: 0, dropped: 0, premium: [] };
  // (what was read is not even the right shape: the static data, as if nothing could be read)
  if (!isObject(data) || !Array.isArray(data.products)) return { ...result, status: 'unavailable' };

  const byGroup: Record<RemoteShopGroup, ShopProduct[]> = { pack: [], gems: [], gold: [], item: [] };
  for (const doc of data.products) {
    const parsed = parseShopProduct(doc.id, doc.data);
    if (!parsed) {
      result.dropped++;
      continue;
    }
    byGroup[parsed.group].push(parsed.product);
  }
  for (const g of GROUPS) {
    const found = byGroup[g];
    if (found.length === 0) continue;
    const staticIds = STATIC.products[g].map((p) => p.id);
    const known = found.filter((p) => staticIds.includes(p.id)).sort((a, b) => staticIds.indexOf(a.id) - staticIds.indexOf(b.id));
    const added = found.filter((p) => !staticIds.includes(p.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    TARGETS[g].splice(0, TARGETS[g].length, ...known, ...added);
    result.products += found.length;
  }

  const premium = parsePremiumConfig(data.premium);
  const { joinPack, ...fields } = premium;
  Object.assign(PREMIUM, fields);
  result.premium.push(...Object.keys(fields));
  if (joinPack) {
    PREMIUM_JOIN_PACK.splice(0, PREMIUM_JOIN_PACK.length, ...joinPack);
    result.premium.push('joinPack');
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------- reading it

const FETCH_TIMEOUT_MS = 8000;

/** Reads the two places from Firestore (public read: no sign-in). The Firebase SDK is loaded on demand, like LeaderboardSystem does. */
async function fetchFromFirestore(): Promise<RemoteShopData> {
  const { fs, db } = await openFirestore();
  const [products, premium] = await Promise.all([fs.getDocs(fs.collection(db, 'shopProducts')), fs.getDoc(fs.doc(db, 'config', 'premium'))]);
  return { products: products.docs.map((d) => ({ id: d.id, data: d.data() })), premium: premium.exists() ? premium.data() : null };
}

let inflight: Promise<RemoteShopResult> | undefined;

export const RemoteShopConfig = {
  isConfigured(): boolean {
    return isLeaderboardConfigured();
  },

  /**
   * Reads the shop and the premium pass once (the same promise comes back on later calls) and puts them in place of the static data.
   * Without Firebase settings it returns `not_configured` at once, without touching the network or loading the SDK; a failure
   * (offline, rules, timeout, nothing there) returns `unavailable` and leaves the static data. It never throws.
   * `fetcher` is for tests: it is used even when Firebase is not configured.
   */
  refresh(fetcher?: RemoteShopFetcher): Promise<RemoteShopResult> {
    if (!inflight) {
      inflight = (async (): Promise<RemoteShopResult> => {
        if (!fetcher && !isLeaderboardConfigured()) return { status: 'not_configured', products: 0, dropped: 0, premium: [] };
        try {
          const data = await withTimeout((fetcher ?? fetchFromFirestore)(), FETCH_TIMEOUT_MS);
          return applyRemoteShop(data);
        } catch {
          resetRemoteShop();
          return { status: 'unavailable', products: 0, dropped: 0, premium: [] };
        }
      })();
    }
    return inflight;
  },

  /** For tests: forget that it was read (and go back to the static data). */
  forget(): void {
    inflight = undefined;
    resetRemoteShop();
  },
};
