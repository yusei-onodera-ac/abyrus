/**
 * App Store (アプリ内課金) で売る品: 円で買うもの全部。ストアにある品と、ゲームの商品 ID の対応表。
 * サーバー (functions/src/products.ts) の許可リストの写し。品を足したら、両方を直す
 * (食い違いは tools/tests/payments.ts が見つける。ゲームの円の商品の一覧とも突き合わせている)。
 *
 * 管理画面 (Firestore の shopProducts) から足された円の商品は、ここに無いので、買えない
 * (ストアに品を作り、ここと、サーバーの許可リストに足してから)。docs/PAYMENTS.md。
 */

/** consumable = 消耗型 (魔晶石・パック)。nonRenewing = 自動更新しない定期購入 (プレミアムパスの30日)。 */
export type StoreKind = 'consumable' | 'nonRenewing';

export interface StoreProduct {
  /** ゲームの中の商品 ID (data/shop.ts の id、data/premium.ts の productId)。 */
  gameId: string;
  kind: StoreKind;
}

export const STORE_PRODUCTS: readonly StoreProduct[] = [
  { gameId: 'pack-starter', kind: 'consumable' },
  { gameId: 'pack-limited', kind: 'consumable' },
  { gameId: 'pack-weekly', kind: 'consumable' },
  { gameId: 'pack-daily', kind: 'consumable' },
  { gameId: 'gems-50', kind: 'consumable' },
  { gameId: 'gems-160', kind: 'consumable' },
  { gameId: 'gems-330', kind: 'consumable' },
  { gameId: 'gems-850', kind: 'consumable' },
  { gameId: 'gems-1800', kind: 'consumable' },
  { gameId: 'gems-3800', kind: 'consumable' },
  { gameId: 'premium-pass', kind: 'nonRenewing' },
];

/**
 * ストア側の商品 ID。ゲームの商品 ID から、ここ1か所で決める (サーバーにも同じ関数がある)。
 * 英数字・アンダースコア・ピリオドだけが使える、という前提で、ハイフンをアンダースコアに替える。
 * ※未確認: この文字の決まりは、App Store Connect で商品を作るときに確かめる (docs/PAYMENTS.md)。
 */
export function storeProductId(gameId: string): string {
  return gameId.replace(/-/g, '_');
}

/** ゲームの商品 ID が、ストアで売っている品か。 */
export function isStoreProduct(gameId: string): boolean {
  return STORE_PRODUCTS.some((p) => p.gameId === gameId);
}

/** ストアの商品 ID から、ゲームの商品 ID。知らない品なら undefined。 */
export function gameProductIdOf(storeId: string): string | undefined {
  return STORE_PRODUCTS.find((p) => storeProductId(p.gameId) === storeId)?.gameId;
}
