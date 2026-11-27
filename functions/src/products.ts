/**
 * App Store で売る品 (円で買うもの) の許可リスト。
 * ゲーム側の src/game/data/storeProducts.ts の写し (functions/ は別パッケージなので、ゲーム側のファイルを import できない)。
 * 品を足したら、両方を直す。食い違っていないかは、tools/tests/payments.ts が確かめる (ゲームの円の商品の一覧とも突き合わせる)。
 *
 * 管理画面 (Firestore の shopProducts) から足された円の商品は、ここに無いので、買えない。
 * 買えるようにするには、App Store Connect に品を作り、ここと、ゲーム側の表に足して、デプロイする (docs/PAYMENTS.md)。
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
 * ストア側の商品 ID。ゲームの商品 ID から、ここ1か所で決める (ゲーム側にも同じ関数がある)。
 * 英数字・アンダースコア・ピリオドだけが使える、という前提で、ハイフンをアンダースコアに替える。
 * ※未確認: この文字の決まりは、App Store Connect で商品を作るときに確かめる (docs/PAYMENTS.md)。
 */
export function storeProductId(gameId: string): string {
  return gameId.replace(/-/g, '_');
}

/** ゲームの商品 ID から、許可リストの行を引く。無ければ undefined (買えない品)。 */
export function findStoreProduct(gameId: string): StoreProduct | undefined {
  return STORE_PRODUCTS.find((p) => p.gameId === gameId);
}
