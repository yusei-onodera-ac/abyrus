// 本物の課金 (App Store / StoreKit 2): クライアント側の決まりを、偽のプラグイン・偽のサーバーに差し替えて調べる。
// 実機にも Apple にも Firebase にも触れない。(サーバー側の検証は functions/test/、 docs/PAYMENTS.md)
//   - 買う: キャンセル / 承認待ち (Ask to Buy) / 失敗 / サーバーに届かない / 返金済み / 断られた
//   - 品物を渡して、セーブしてから、finish する (順番)。二重に渡さない。払った人には必ず渡す (購入回数の制限は無視)
//   - 未完了の取引の回復 (落ちたあとの起動・あとから承認)。プレミアムパスも同じ道
//   - 起動時の監視が、ゲームの起動を遅らせない
//   - 価格の表示 (ストアの文字 / 円) と、管理画面から足された品
//   - ゲームの円の商品の一覧と、ストアの品の表・サーバーの許可リストが、食い違わない
import { PACKS, GEM_PRODUCTS, STATIC_YEN_PRODUCTS } from '../../src/game/data/shop';
import { PREMIUM } from '../../src/game/data/premium';
import { STORE_PRODUCTS, gameProductIdOf, isStoreProduct, storeProductId } from '../../src/game/data/storeProducts';
import { PaymentSystem } from '../../src/game/systems/PaymentSystem';
import { PAID_KEEP, PurchaseDelivery } from '../../src/game/systems/PurchaseDelivery';
import { PremiumSystem } from '../../src/game/systems/PremiumSystem';
import { applyRemoteShop, resetRemoteShop } from '../../src/game/systems/RemoteShopConfig';
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { ShopSystem } from '../../src/game/systems/ShopSystem';
import { StoreKitGateway, outcomeOfResponse, type PurchaseVerifier, type StoreDelivery, type StorePlugin, type StoreTransaction, type VerifyOutcome } from '../../src/game/systems/StoreKitPayment';
import { isNativeIos, startStorePayments } from '../../src/game/systems/NativeStore';
// サーバーの許可リスト (functions/ は別パッケージ: 写しが、ゲーム側と同じかを見る)
import { STORE_PRODUCTS as SERVER_PRODUCTS, storeProductId as serverStoreProductId } from '../../functions/src/products';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------------- 偽物

/** ストアのプラグインの代わり: 未完了の取引を覚え、finish で消す。次の purchaseProduct の答えは、こちらで決める。 */
class FakeStore implements StorePlugin {
  unfinished = new Map<string, StoreTransaction>();
  log: string[] = [];
  next: 'ok' | Error | 'no-jws' = 'ok';
  products: { identifier: string; priceString: string }[] = [];
  productsError = false;
  listener?: (t: StoreTransaction) => void;
  finishError = false;
  private serial = 2_000_000_000;

  tx(productIdentifier: string, withJws = true): StoreTransaction {
    const transactionId = String(++this.serial);
    return { transactionId, productIdentifier, ...(withJws ? { jwsRepresentation: `jws.${productIdentifier}.${transactionId}` } : {}) };
  }
  async configure(options: { autoFinishTransactions?: boolean }): Promise<void> {
    this.log.push(`configure:${options.autoFinishTransactions}`);
  }
  async getProducts(options: { productIdentifiers: string[] }): Promise<{ products: { identifier: string; priceString: string }[] }> {
    this.log.push('getProducts');
    if (this.productsError) throw new Error('store offline');
    return { products: this.products.filter((p) => options.productIdentifiers.includes(p.identifier)) };
  }
  async purchaseProduct(options: { productIdentifier: string; autoAcknowledgePurchases?: boolean }): Promise<StoreTransaction> {
    this.log.push(`purchase:${options.productIdentifier}:auto=${options.autoAcknowledgePurchases}`);
    if (this.next instanceof Error) throw this.next;
    const t = this.tx(options.productIdentifier, this.next !== 'no-jws');
    this.unfinished.set(t.transactionId, t); // (a payment stays unfinished until finishTransaction)
    return t;
  }
  async getUnfinishedTransactions(): Promise<{ transactions: StoreTransaction[] }> {
    this.log.push('getUnfinished');
    return { transactions: [...this.unfinished.values()] };
  }
  async finishTransaction(options: { transactionId: string }): Promise<void> {
    this.log.push(`finish:${options.transactionId}`);
    if (this.finishError) throw new Error('finish failed');
    this.unfinished.delete(options.transactionId);
  }
  async addListener(_event: 'transactionUpdated', listener: (t: StoreTransaction) => void): Promise<{ remove(): Promise<void> }> {
    this.log.push('addListener');
    this.listener = listener;
    return { remove: async () => {} };
  }
}

/** サーバー (verifyPurchase) の代わり。 */
class FakeVerifier implements PurchaseVerifier {
  calls: { productId: string; jws: string }[] = [];
  outcome: VerifyOutcome = { status: 'ok' };
  async verify(productId: string, signedTransaction: string): Promise<VerifyOutcome> {
    this.calls.push({ productId, jws: signedTransaction });
    return this.outcome;
  }
}

interface Rig {
  store: FakeStore;
  verifier: FakeVerifier;
  save: SaveData;
  gateway: StoreKitGateway;
  announced: ReturnType<typeof PurchaseDelivery.deliver>[];
  /** deliver / finish の起きた順 (finish は、品物を渡してセーブした「あと」でなければならない) */
  order: string[];
  scheduled: { callback: () => void; ms: number }[];
  waited: number[];
}

function rig(options: { finishDelayMs?: number } = {}): Rig {
  const store = new FakeStore();
  const verifier = new FakeVerifier();
  const save = SaveSystem.createDefault();
  const announced: Rig['announced'] = [];
  const order: string[] = [];
  const scheduled: Rig['scheduled'] = [];
  const waited: number[] = [];
  const delivery: StoreDelivery = {
    isDelivered: (id) => PurchaseDelivery.isDelivered(save, id),
    deliver: (productId, id) => {
      const d = PurchaseDelivery.deliver(save, productId, id);
      if (d.kind === 'duplicate' || d.kind === 'unknown') return d.kind;
      order.push(`deliver:${id}`);
      announced.push(d);
      return 'delivered';
    },
  };
  const originalFinish = store.finishTransaction.bind(store);
  store.finishTransaction = async (o) => {
    order.push(`finish:${o.transactionId}`);
    return originalFinish(o);
  };
  const gateway = new StoreKitGateway({
    plugin: store,
    verifier,
    delivery,
    finishDelayMs: options.finishDelayMs ?? 0,
    wait: async (ms) => void waited.push(ms),
    schedule: (callback, ms) => void scheduled.push({ callback, ms }),
  });
  return { store, verifier, save, gateway, announced, order, scheduled, waited };
}

const request = (productId: string) => ({ productId, name: productId, yen: 480 });
const gemsOf = (save: SaveData): number => save.gems;

/** 画面 (ShopScene.pay) がやることを、そのまま: 渡す -> セーブ -> finish。 */
async function sceneSettles(r: Rig, productId: string, result: Awaited<ReturnType<StoreKitGateway['purchase']>>): Promise<ReturnType<typeof PurchaseDelivery.deliver> | null> {
  if (result.status !== 'paid') return null;
  const delivery = PurchaseDelivery.deliver(r.save, productId, result.receipt?.transactionId);
  SaveSystem.save(r.save);
  r.order.push(`saved:${result.receipt?.transactionId}`);
  await result.receipt?.finish();
  return delivery;
}

// ---------------------------------------------------------------------------------------------------- 買う

{
  const r = rig();
  const before = gemsOf(r.save);
  const result = await r.gateway.purchase(request('gems-160'));
  ok(result.status === 'paid' && !!result.receipt, 'buy: a verified payment is "paid", with a receipt');
  ok(r.store.log.includes('purchase:gems_160:auto=false'), 'buy: the store is asked for the store product id (gems_160), and told NOT to finish it by itself');
  ok(r.verifier.calls.length === 1 && r.verifier.calls[0].productId === 'gems-160' && r.verifier.calls[0].jws.startsWith('jws.gems_160.'), 'buy: the signed transaction goes to the server with the game product id');
  ok(r.store.unfinished.size === 1, 'buy: until the screen is done, the store still holds the payment (nothing was finished)');
  const delivery = await sceneSettles(r, 'gems-160', result);
  ok(delivery?.kind === 'goods' && gemsOf(r.save) === before + 160, 'buy: the screen hands the goods over (魔晶石 ×160)');
  const txId = result.status === 'paid' ? result.receipt!.transactionId : '';
  ok(same(r.order, [`saved:${txId}`, `finish:${txId}`]) && r.store.unfinished.size === 0, 'buy: the store is told it is finished only AFTER the goods are saved');
  ok(r.save.shop.paid.includes(txId), 'buy: the transaction id is remembered in the save');
}

{
  const r = rig();
  r.store.next = new Error('User cancelled');
  ok((await r.gateway.purchase(request('gems-160'))).status === 'cancelled', 'cancel: "User cancelled" is cancelled');
  ok(r.verifier.calls.length === 0 && r.store.unfinished.size === 0, 'cancel: nothing is sent to the server, nothing is handed over');
  r.store.next = new Error('Transaction pending');
  ok((await r.gateway.purchase(request('gems-160'))).status === 'pending', 'Ask to Buy: "Transaction pending" is pending (the goods come later, by themselves)');
  r.store.next = new Error('The operation couldn’t be completed');
  const failed = await r.gateway.purchase(request('gems-160'));
  ok(failed.status === 'failed', 'failure: any other error is failed');
  r.store.next = new Error('Cannot find product for id gems_160');
  ok((await r.gateway.purchase(request('gems-160'))).status === 'unavailable', 'failure: a product the store does not have is unavailable');
  r.store.next = 'no-jws';
  ok((await r.gateway.purchase(request('gems-160'))).status === 'failed', 'failure: a transaction with no signed data is not paid');
  ok(r.verifier.calls.length === 0, 'failure: none of those reach the server');
}

{
  const r = rig();
  ok((await r.gateway.purchase(request('pack-admin-added'))).status === 'unavailable', 'a product that is not in the store table (added from the admin) is unavailable');
  ok(!r.store.log.some((l) => l.startsWith('purchase:')), 'that never even reaches the store');
}

// サーバーに届かない / 断られた / 返金済み
{
  const r = rig();
  r.verifier.outcome = { status: 'retry' };
  const result = await r.gateway.purchase(request('gems-330'));
  ok(result.status === 'later', 'server unreachable: the player is told it will arrive (later), not that it failed');
  ok(r.store.unfinished.size === 1 && r.announced.length === 0 && gemsOf(r.save) === SaveSystem.createDefault().gems, 'server unreachable: the payment stays unfinished, nothing is handed over');
  ok(r.scheduled.length === 1 && r.scheduled[0].ms === 15_000, 'server unreachable: it looks again in 15 seconds');
  r.verifier.outcome = { status: 'ok' };
  r.scheduled[0].callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  ok(r.announced.length === 1 && r.save.gems === SaveSystem.createDefault().gems + 330 && r.store.unfinished.size === 0, 'server unreachable: when it answers, the same payment is handed over and finished (and announced)');
}
{
  const r = rig();
  r.verifier.outcome = { status: 'retry' };
  await r.gateway.purchase(request('gems-330'));
  for (let i = 0; i < 5; i++) {
    const next = r.scheduled[r.scheduled.length - 1];
    r.scheduled.length = 0;
    next?.callback();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (r.scheduled.length === 0) break;
  }
  ok(r.verifier.calls.length === 4, 'server unreachable: it tries again 3 times (15s, 1min, 5min), then waits for the next launch');
}
{
  const r = rig();
  r.verifier.outcome = { status: 'rejected', reason: 'wrong_app' };
  const result = await r.gateway.purchase(request('gems-160'));
  ok(result.status === 'failed', 'rejected by the server: not paid');
  ok(r.store.unfinished.size === 1 && r.announced.length === 0, 'rejected by the server: left unfinished (the money was taken: it is not thrown away), nothing handed over');
}
{
  const r = rig();
  r.verifier.outcome = { status: 'revoked' };
  const result = await r.gateway.purchase(request('gems-160'));
  ok(result.status === 'failed' && r.store.unfinished.size === 0, 'a refunded transaction: not paid, and finished (nothing to hand over)');
}
{
  const r = rig({ finishDelayMs: 3000 });
  const result = await r.gateway.purchase(request('gems-160'));
  await sceneSettles(r, 'gems-160', result);
  ok(same(r.waited, [3000]), 'finish waits a moment (3 s) so the saved goods reach the disk before the store forgets the payment');
}

// ---------------------------------------------------------------------------------------------------- 二重に渡さない

{
  const r = rig();
  const t = r.store.tx('gems_160');
  r.store.unfinished.set(t.transactionId, t);
  const g0 = gemsOf(r.save);
  await r.gateway.handle(t);
  await r.gateway.handle(t); // (the store announces the same payment again)
  ok(gemsOf(r.save) === g0 + 160 && r.announced.length === 1, 'duplicate: the same transaction arriving twice is handed over once');
  ok(r.verifier.calls.length === 1, 'duplicate: the second time the server is not even asked (the save already knows it)');
  const d1 = PurchaseDelivery.deliver(r.save, 'gems-160', t.transactionId);
  ok(d1.kind === 'duplicate', 'duplicate: PurchaseDelivery refuses the same id');
}
{
  const r = rig();
  const t = r.store.tx('gems_160');
  r.store.unfinished.set(t.transactionId, t);
  await Promise.all([r.gateway.handle(t), r.gateway.handle(t), r.gateway.recover()]);
  ok(r.verifier.calls.length === 1 && r.announced.length === 1, 'duplicate: the listener and a recovery meeting the same payment at once handle it once');
}
{
  // the id list: oldest dropped
  const save = SaveSystem.createDefault();
  for (let i = 0; i < PAID_KEEP + 7; i++) PurchaseDelivery.deliver(save, 'gems-50', `tx${i}`);
  ok(save.shop.paid.length === PAID_KEEP && save.shop.paid[0] === 'tx7' && save.shop.paid[PAID_KEEP - 1] === `tx${PAID_KEEP + 6}`, 'the remembered ids are a short list, oldest dropped first');
  ok(PurchaseDelivery.deliver(save, 'gems-50', `tx${PAID_KEEP + 6}`).kind === 'duplicate' && PurchaseDelivery.deliver(save, 'gems-50', 'tx0').kind === 'goods', 'the newest are remembered; one that fell off the list is not');
  const test = SaveSystem.createDefault();
  ok(PurchaseDelivery.deliver(test, 'gems-50').kind === 'goods' && PurchaseDelivery.deliver(test, 'gems-50').kind === 'goods' && test.shop.paid.length === 0, 'a payment with no transaction id (the dev build test payment) is never "a duplicate"');
  // the save's own restore
  const restored = SaveSystem.restoreFrom(JSON.parse(JSON.stringify({ ...save, shop: { ...save.shop, paid: [...save.shop.paid, 5, null, '', 'x'.repeat(100)] } })));
  ok(restored.shop.paid.length === PAID_KEEP && restored.shop.paid.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64), 'restoring a save keeps only the ids that are real, newest 50');
  const oldSave = JSON.parse(JSON.stringify(SaveSystem.createDefault()));
  delete oldSave.shop.paid;
  ok(same(SaveSystem.restoreFrom(oldSave).shop.paid, []), 'a save from before the list existed gets an empty one');
}

// ---------------------------------------------------------------------------------------------------- 未完了の取引の回復

{
  // after paying, before the goods: the app died. Next launch: the store still has it.
  const r = rig();
  const t = r.store.tx('pack_starter');
  r.store.unfinished.set(t.transactionId, t);
  // (the 初心者パック is limited to once; the player has bought it before - a paid one is handed over anyway)
  const starter = PACKS.find((p) => p.id === 'pack-starter')!;
  ShopSystem.recordPurchase(r.save, starter, Date.now());
  ok(ShopSystem.blocked(r.save, starter, Date.now()) === 'sold_out', 'recovery setup: the purchase limit is used up');
  const g0 = r.save.gems;
  await r.gateway.recover();
  ok(r.save.gems === g0 + 300 && r.announced.length === 1 && r.announced[0].kind === 'goods', 'recovery: the payment found at launch is checked by the server and handed over, even over the purchase limit');
  ok(same(r.order, [`deliver:${t.transactionId}`, `finish:${t.transactionId}`]) && r.store.unfinished.size === 0, 'recovery: handed over first, finished after');
  ok(r.announced[0].kind === 'goods' && r.announced[0].product.id === 'pack-starter', 'recovery: what came is announced (for the 確認 popup)');
}
{
  // the app died AFTER saving but BEFORE finishing: the save knows the id, the store still has it
  const r = rig();
  const t = r.store.tx('gems_850');
  r.store.unfinished.set(t.transactionId, t);
  PurchaseDelivery.deliver(r.save, 'gems-850', t.transactionId);
  const g0 = r.save.gems;
  await r.gateway.recover();
  ok(r.save.gems === g0 && r.announced.length === 0 && r.store.unfinished.size === 0, 'recovery: a payment the save already has is only finished - nothing is given twice');
  ok(r.verifier.calls.length === 0, 'recovery: ... and the server is not needed for that');
}
{
  // an Ask to Buy approved later arrives as an update
  const r = rig();
  await r.gateway.start();
  ok(r.store.listener !== undefined, 'updates: the gateway listens for payments the store announces');
  const t = r.store.tx('gems_1800');
  r.store.unfinished.set(t.transactionId, t);
  const g0 = r.save.gems;
  r.store.listener!(t);
  await new Promise((resolve) => setTimeout(resolve, 0));
  ok(r.save.gems === g0 + 1800 && r.announced.length === 1 && r.store.unfinished.size === 0, 'updates: an approval that comes later is handed over and finished');
}
{
  const r = rig();
  r.verifier.outcome = { status: 'retry' };
  const t = r.store.tx('gems_160');
  r.store.unfinished.set(t.transactionId, t);
  await r.gateway.recover();
  ok(r.store.unfinished.size === 1 && r.announced.length === 0 && r.scheduled.length === 1, 'recovery: with the server out of reach, the payment is kept and looked at again later');
  const other = rig();
  other.verifier.outcome = { status: 'rejected', reason: 'not_allowed' };
  const t2 = other.store.tx('gems_160');
  other.store.unfinished.set(t2.transactionId, t2);
  await other.gateway.recover();
  ok(other.store.unfinished.size === 1 && other.announced.length === 0, 'recovery: one the server refuses stays in the store (looked at again at the next launch), nothing is handed over');
  const refunded = rig();
  refunded.verifier.outcome = { status: 'revoked' };
  const t3 = refunded.store.tx('gems_160');
  refunded.store.unfinished.set(t3.transactionId, t3);
  await refunded.gateway.recover();
  ok(refunded.store.unfinished.size === 0 && refunded.announced.length === 0, 'recovery: a refunded one is finished, nothing is handed over');
}
{
  // other people's / unknown things in the store's queue are left alone
  const r = rig();
  const stranger = r.store.tx('some_other_app_product');
  r.store.unfinished.set(stranger.transactionId, stranger);
  const noJws = r.store.tx('gems_160', false);
  r.store.unfinished.set(noJws.transactionId, noJws);
  await r.gateway.recover();
  ok(r.verifier.calls.length === 0 && r.announced.length === 0 && r.store.unfinished.size === 2, 'recovery: a product that is not ours, or a transaction with no signed data, is left alone');
}
{
  // a product the game cannot hand over (server said ok but the game has nothing for it): kept, not thrown away
  const r = rig();
  const t = r.store.tx('gems_160');
  r.store.unfinished.set(t.transactionId, t);
  const noGoods = new StoreKitGateway({
    plugin: r.store,
    verifier: r.verifier,
    delivery: { isDelivered: () => false, deliver: () => 'unknown' },
    finishDelayMs: 0,
    wait: async () => {},
    schedule: () => {},
  });
  await noGoods.recover();
  ok(r.store.unfinished.size === 1, 'recovery: when the game has nothing to hand over for it, the payment is not finished');
  const early = new StoreKitGateway({ plugin: r.store, verifier: r.verifier, delivery: { isDelivered: () => false, deliver: () => 'not_ready' }, finishDelayMs: 0, wait: async () => {}, schedule: () => {} });
  await early.recover();
  ok(r.store.unfinished.size === 1, 'recovery: before the game has a save to put it in, the payment is not finished either');
}
{
  // finishing can fail: nothing is lost (next launch the save knows the id)
  const r = rig();
  const t = r.store.tx('gems_160');
  r.store.unfinished.set(t.transactionId, t);
  r.store.finishError = true;
  await r.gateway.recover();
  const g1 = r.save.gems;
  ok(r.store.unfinished.size === 1, 'finish fails: the store still has the payment ...');
  r.store.finishError = false;
  await r.gateway.recover();
  ok(r.save.gems === g1 && r.store.unfinished.size === 0, '... and the next launch only finishes it (nothing is given twice)');
}

// ---------------------------------------------------------------------------------------------------- プレミアムパスも同じ道

{
  const r = rig();
  const result = await r.gateway.purchase(request(PREMIUM.productId));
  ok(r.store.log.includes('purchase:premium_pass:auto=false') && r.verifier.calls[0].productId === 'premium-pass', 'premium: bought and verified through the same path (store id premium_pass)');
  const before = Date.now();
  const delivery = await sceneSettles(r, PREMIUM.productId, result);
  ok(delivery?.kind === 'premium' && PremiumSystem.isActive(r.save) && PremiumSystem.daysLeft(r.save) === 30, 'premium: the pass is handed over for 30 days');
  ok(r.save.shop.paid.length === 1 && r.store.unfinished.size === 0 && r.save.premium.expiresAt >= before + 29 * 86_400_000, 'premium: the transaction is remembered and finished');
  // renewing: bought again, the 30 days are added on to the end of the current period
  const end = r.save.premium.expiresAt;
  const again = await r.gateway.purchase(request(PREMIUM.productId));
  await sceneSettles(r, PREMIUM.productId, again);
  ok(Math.abs(r.save.premium.expiresAt - (end + 30 * 86_400_000)) < 5, 'premium: buying again extends the period by 30 days');
}
{
  const r = rig();
  const t = r.store.tx('premium_pass');
  r.store.unfinished.set(t.transactionId, t);
  await r.gateway.recover();
  ok(PremiumSystem.isActive(r.save) && r.announced.length === 1 && r.announced[0].kind === 'premium', 'premium: a pass paid for before the app died is handed over at the next launch');
  await r.gateway.recover();
  ok(PremiumSystem.daysLeft(r.save) === 30, 'premium: and not extended a second time');
}

// ---------------------------------------------------------------------------------------------------- 起動を遅らせない

{
  const never = new Promise<never>(() => {});
  const hung: StorePlugin = {
    configure: () => never,
    getProducts: () => never,
    purchaseProduct: () => never,
    getUnfinishedTransactions: () => never,
    finishTransaction: () => never,
    addListener: () => never,
  };
  const gateway = new StoreKitGateway({ plugin: hung, verifier: new FakeVerifier(), delivery: { isDelivered: () => false, deliver: () => 'delivered' } });
  let returned = false;
  const started = gateway.start().then(() => 'done');
  returned = true; // (start() gave control back at once: the boot does not await it)
  const winner = await Promise.race([started, new Promise<string>((resolve) => setTimeout(() => resolve('boot goes on'), 20))]);
  ok(returned && winner === 'boot goes on', 'start: a store that never answers does not hold anything up (the caller does not await it)');
  ok(gateway.priceOf('gems-160') === undefined && gateway.canSell('gems-160') === true, 'start: until the store answers, prices are unknown and products stay buyable');
}
{
  const failing = rig();
  failing.store.productsError = true;
  failing.store.getUnfinishedTransactions = async () => {
    throw new Error('boom');
  };
  failing.store.addListener = async () => {
    throw new Error('no listener');
  };
  failing.store.configure = async () => {
    throw new Error('old build');
  };
  let rejected = false;
  await failing.gateway.start().catch(() => (rejected = true));
  ok(!rejected, 'start: every step failing on its own never makes start() reject (nothing bubbles into the boot)');
  const hang = rig();
  await hang.gateway.start();
  ok(hang.store.log[0] === 'addListener' && hang.store.log.includes('configure:false') && hang.store.log.includes('getProducts') && hang.store.log.includes('getUnfinished'), 'start: listens first, tells the plugin not to finish by itself, then looks for unfinished payments and asks for prices');
}
{
  // the real wiring does nothing outside the iOS app
  const before = PaymentSystem.getGateway();
  ok(!isNativeIos(), 'wiring: not the iOS app in a test');
  startStorePayments({ registry: { get: () => undefined } } as never);
  ok(PaymentSystem.getGateway() === before, 'wiring: outside the iOS app the gateway is left alone (web / dev builds behave as before)');
}

// ---------------------------------------------------------------------------------------------------- 価格の表示

{
  const r = rig();
  r.store.products = [
    { identifier: 'gems_160', priceString: '$4.99' },
    { identifier: 'gems_850', priceString: '€24,99' },
    { identifier: 'pack_starter', priceString: '¥480' },
    { identifier: 'other_app_item', priceString: '$0.99' },
    { identifier: 'gems_330', priceString: '' },
  ];
  ok((await r.gateway.loadPrices()) === true, 'prices: loaded from the store');
  ok(r.gateway.priceOf('gems-160') === '$4.99' && r.gateway.priceOf('gems-850') === '€24,99' && r.gateway.priceOf('pack-starter') === '¥480', "prices: the store's own text, in the player's currency");
  ok(r.gateway.priceOf('gems-330') === undefined && r.gateway.priceOf('other-app-item') === undefined, 'prices: an empty text or a product that is not ours is not used');
  ok((await r.gateway.loadPrices()) === false, 'prices: nothing new the second time');
  ok(r.gateway.canSell('gems-160') && !r.gateway.canSell('gems-50') && !r.gateway.canSell('gems-9999'), 'prices: a product the store did not return is not for sale, nor is one that is not in the table');
  const empty = rig();
  await empty.gateway.loadPrices();
  ok(empty.gateway.canSell('gems-160'), 'prices: an empty answer is taken as a hiccup - everything stays buyable');
  const down = rig();
  down.store.productsError = true;
  ok((await down.gateway.loadPrices()) === false && down.gateway.canSell('gems-160'), 'prices: the store failing is not an error');
  const lazy = rig();
  lazy.store.productsError = true;
  await lazy.gateway.refreshPrices();
  lazy.store.productsError = false;
  lazy.store.products = [{ identifier: 'gems_160', priceString: '£3.99' }];
  ok((await lazy.gateway.refreshPrices()) === true && lazy.gateway.priceOf('gems-160') === '£3.99', 'prices: asked again when the shop opens if the first try failed');
  ok((await lazy.gateway.refreshPrices()) === false, 'prices: and not again once they are in');

  const original = PaymentSystem.getGateway();
  PaymentSystem.setGateway(r.gateway);
  ok(PaymentSystem.priceLabel('gems-160', 480) === '$4.99', 'label: the store price is shown when there is one');
  ok(PaymentSystem.priceLabel('gems-50', 160) === '¥160', 'label: otherwise the yen price as before');
  ok(PaymentSystem.priceLabel('x', 1234567) === '¥1,234,567', 'label: big numbers in full digits (no 万 / M)');
  ok(PaymentSystem.canSell('gems-160') === true && PaymentSystem.canSell('gems-50') === false, 'label: canSell follows the gateway');
  PaymentSystem.setGateway(original);
  ok(PaymentSystem.priceLabel('gems-160', 480) === '¥480' && PaymentSystem.canSell('anything') === true, 'label: a gateway with no store (web / dev) shows yen, and sells what the shop lists');
}

// ---------------------------------------------------------------------------------------------------- 管理画面から足された品・差し替えられた品

{
  const r = rig();
  // the operator's admin replaces the pack list with a product of its own
  applyRemoteShop({ products: [{ id: 'pack-admin', data: { name: 'ほしいパック', group: 'pack', priceCurrency: 'yen', priceAmount: 600, goods: [{ type: 'gems', amount: 120 }] } }], premium: null });
  ok(!PACKS.some((p) => p.id === 'pack-starter') && PACKS.some((p) => p.id === 'pack-admin'), 'remote: (setup) the live pack list no longer has the starter pack');
  const t = r.store.tx('pack_starter');
  r.store.unfinished.set(t.transactionId, t);
  const g0 = r.save.gems;
  await r.gateway.recover();
  ok(r.save.gems === g0 + 300 && r.store.unfinished.size === 0, 'remote: a payment for a product the live list lost is still handed over (from the list as written in data/shop.ts)');
  ok(!isStoreProduct('pack-admin') && r.gateway.canSell('pack-admin') === false, 'remote: a product the operator added is not in the store table, so it cannot be bought');
  resetRemoteShop();
  ok(PACKS.some((p) => p.id === 'pack-starter'), 'remote: (cleanup) back to the static list');
}

// ---------------------------------------------------------------------------------------------------- ゲームの表・ストアの表・サーバーの許可リストが、食い違わない

{
  const yenProducts = [...PACKS, ...GEM_PRODUCTS].filter((p) => p.price.currency === 'yen').map((p) => p.id);
  const table = STORE_PRODUCTS.map((p) => p.gameId);
  ok(same([...yenProducts, PREMIUM.productId].sort(), [...table].sort()), 'tables: the store table is exactly the shop\'s yen products + the premium pass');
  ok(same(STATIC_YEN_PRODUCTS.map((p) => p.id).sort(), [...yenProducts].sort()), 'tables: the static snapshot holds every yen product');
  ok(same(STORE_PRODUCTS, SERVER_PRODUCTS), "tables: the server's allow-list (functions/src/products.ts) is the same as the game's table, product by product, kind by kind");
  ok(STORE_PRODUCTS.every((p) => storeProductId(p.gameId) === serverStoreProductId(p.gameId)), 'tables: both sides turn a game id into the same store id');
  ok(['gems-160', 'pack-limited', 'premium-pass', 'x-y-z-1'].every((id) => storeProductId(id) === id.replace(/-/g, '_')), 'tables: hyphens become underscores');
  ok(STORE_PRODUCTS.every((p) => /^[A-Za-z0-9_.]+$/.test(storeProductId(p.gameId))), 'tables: store ids use only letters, digits, underscores and periods');
  ok(new Set(STORE_PRODUCTS.map((p) => storeProductId(p.gameId))).size === STORE_PRODUCTS.length, 'tables: no two products share a store id');
  ok(STORE_PRODUCTS.every((p) => gameProductIdOf(storeProductId(p.gameId)) === p.gameId) && gameProductIdOf('gems-160') === undefined && gameProductIdOf('nope') === undefined, 'tables: the store id maps back to the game id (and only that way round)');
  ok(STORE_PRODUCTS.filter((p) => p.kind === 'nonRenewing').map((p) => p.gameId).join() === PREMIUM.productId && STORE_PRODUCTS.filter((p) => p.kind === 'consumable').length === 10, 'tables: the pass is the non-renewing subscription, the other ten are consumables');
  ok(PREMIUM.productId === 'premium-pass', 'tables: the premium pass id is the one in the tables');
}

// ---------------------------------------------------------------------------------------------------- サーバーの返事の読み取り

{
  ok(outcomeOfResponse({ ok: true, value: { productId: 'gems-160' } }).status === 'ok', 'reply: ok is ok');
  ok(outcomeOfResponse({ ok: false, reason: 'revoked' }).status === 'revoked', 'reply: revoked is revoked');
  ok(['retry', 'error', 'not_signed_in'].every((reason) => outcomeOfResponse({ ok: false, reason }).status === 'retry'), 'reply: retry / error / not_signed_in are tried again later');
  const refused = ['not_allowed', 'bad_signature', 'wrong_app', 'wrong_environment', 'wrong_product', 'wrong_type', 'bad_transaction', 'used_by_other', 'not_configured', 'bad_input'];
  ok(refused.every((reason) => { const o = outcomeOfResponse({ ok: false, reason }); return o.status === 'rejected' && o.reason === reason; }), 'reply: every other reason is a refusal (left in the store)');
  ok([null, undefined, 5, 'ok', {}, { ok: false }, { ok: 'true' }].every((x) => outcomeOfResponse(x).status === 'retry'), 'reply: anything that is not a clear answer is retried later');
}

console.log(failures === 0 ? '\nall payments checks passed' : `\n${failures} payments check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
