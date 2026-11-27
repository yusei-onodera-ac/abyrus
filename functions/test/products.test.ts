/** 許可リスト (products.ts) の決まり。ゲーム側の表と食い違わないことは、ゲーム側の試験 (tools/tests/payments.ts) が見る。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORE_PRODUCTS, findStoreProduct, storeProductId } from '../src/products';

test('ストアの商品 ID は、英数字・アンダースコア・ピリオドだけ。ハイフンはアンダースコアになる', () => {
  for (const p of STORE_PRODUCTS) assert.match(storeProductId(p.gameId), /^[A-Za-z0-9_.]+$/, p.gameId);
  assert.equal(storeProductId('gems-160'), 'gems_160');
  assert.equal(storeProductId('premium-pass'), 'premium_pass');
  assert.equal(storeProductId('pack-starter'), 'pack_starter');
});

test('ゲームの商品 ID も、ストアの商品 ID も、重ならない', () => {
  assert.equal(new Set(STORE_PRODUCTS.map((p) => p.gameId)).size, STORE_PRODUCTS.length);
  assert.equal(new Set(STORE_PRODUCTS.map((p) => storeProductId(p.gameId))).size, STORE_PRODUCTS.length);
});

test('許可リスト: 11品。プレミアムパスだけが、自動更新しない定期購入', () => {
  assert.equal(STORE_PRODUCTS.length, 11);
  assert.deepEqual(STORE_PRODUCTS.filter((p) => p.kind === 'nonRenewing').map((p) => p.gameId), ['premium-pass']);
  assert.equal(findStoreProduct('gems-50')?.kind, 'consumable');
  assert.equal(findStoreProduct('gems_50'), undefined);
  assert.equal(findStoreProduct('item-stamina-s'), undefined);
});
