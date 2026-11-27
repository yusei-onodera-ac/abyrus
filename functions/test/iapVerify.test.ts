/**
 * iapVerify.ts の単体試験。自作の証明書の鎖 (testChain.ts) で署名した取引を作って、通るべきものが通り、断るべきものが断られるかを見る。
 * Apple のサーバーにも、本物のルート証明書にも出さない。 (実行: cd functions && npm test)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIapVerifier, parseIapSettings, type IapConfig, type TransactionVerifier } from '../src/iapVerify';
import { loadAppleRoots } from '../src/appleRoots';
import { makeChain, signJws, transactionPayload, type Chain, type TransactionOptions } from './testChain';

const BUNDLE = 'app.test.game';
const config = (over: Partial<IapConfig> = {}): IapConfig => ({ bundleId: BUNDLE, appAppleId: 1234567890, environments: ['Sandbox'], onlineChecks: false, ...over });

const chain = makeChain();
const verifierFor = (c: IapConfig, ch: Chain = chain): TransactionVerifier => createIapVerifier(c, [ch.rootDer]);
const jws = (o: TransactionOptions = {}, ch: Chain = chain): string => signJws(transactionPayload(o), ch.leafKey, ch.x5c);

test('正しい取引 (消耗型) は通る。取引 ID・環境・元の取引 ID が返る', async () => {
  const r = await verifierFor(config()).verify('gems-160', jws({ productId: 'gems_160', transactionId: '2000000001' }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.purchase.gameProductId, 'gems-160');
    assert.equal(r.purchase.storeProductId, 'gems_160');
    assert.equal(r.purchase.transactionId, '2000000001');
    assert.equal(r.purchase.originalTransactionId, '2000000000000001');
    assert.equal(r.purchase.environment, 'Sandbox');
  }
});

test('プレミアムパスは、自動更新しない定期購入として通る (消耗型としては通らない)', async () => {
  const v = verifierFor(config());
  const ok = await v.verify('premium-pass', jws({ productId: 'premium_pass', type: 'Non-Renewing Subscription' }));
  assert.equal(ok.ok, true);
  const wrongType = await v.verify('premium-pass', jws({ productId: 'premium_pass', type: 'Consumable' }));
  assert.deepEqual(wrongType.ok === false && wrongType.reason, 'wrong_type');
  const reverse = await v.verify('gems-160', jws({ productId: 'gems_160', type: 'Non-Renewing Subscription' }));
  assert.deepEqual(reverse.ok === false && reverse.reason, 'wrong_type');
});

test('商品 ID が許可リストに無いと断る (管理画面から足されただけの品・知らない品)', async () => {
  const v = verifierFor(config());
  for (const id of ['gems-9999', 'pack-admin-added', '', 'gems_160', '../purchases']) {
    const r = await v.verify(id, jws({ productId: 'gems_9999' }));
    assert.equal(r.ok === false && r.reason, 'not_allowed', `商品 ${JSON.stringify(id)}`);
  }
});

test('署名された商品 ID が、言ってきた商品と違うと断る (安い品の取引で、高い品を取る)', async () => {
  const r = await verifierFor(config()).verify('gems-3800', jws({ productId: 'gems_50' }));
  assert.equal(r.ok === false && r.reason, 'wrong_product');
});

test('Bundle ID が違うと断る', async () => {
  const r = await verifierFor(config()).verify('gems-160', jws({ bundleId: 'app.someone.else' }));
  assert.equal(r.ok === false && r.reason, 'wrong_app');
});

test('環境: 設定にある環境の取引だけ通る。 Production,Sandbox の設定は、両方通る', async () => {
  const sandbox = jws({ environment: 'Sandbox' });
  const production = jws({ environment: 'Production' });
  const sandboxOnly = verifierFor(config({ environments: ['Sandbox'] }));
  assert.equal((await sandboxOnly.verify('gems-160', sandbox)).ok, true);
  assert.equal((await sandboxOnly.verify('gems-160', production)).ok === false, true);
  const productionOnly = verifierFor(config({ environments: ['Production'] }));
  assert.equal((await productionOnly.verify('gems-160', production)).ok, true);
  const refused = await productionOnly.verify('gems-160', sandbox);
  assert.equal(refused.ok === false && refused.reason, 'wrong_environment');
  const both = verifierFor(config({ environments: ['Production', 'Sandbox'] }));
  const a = await both.verify('gems-160', sandbox);
  const b = await both.verify('gems-160', production);
  assert.equal(a.ok && a.purchase.environment, 'Sandbox');
  assert.equal(b.ok && b.purchase.environment, 'Production');
});

test('取り消された (返金された) 取引は、断る', async () => {
  const r = await verifierFor(config()).verify('gems-160', jws({ revoked: true }));
  assert.equal(r.ok === false && r.reason, 'revoked');
});

test('取引 ID が無い・おかしい取引は、断る', async () => {
  const v = verifierFor(config());
  assert.equal((await v.verify('gems-160', jws({ transactionId: null }))).ok === false && true, true);
  const none = await v.verify('gems-160', jws({ transactionId: null }));
  assert.equal(none.ok === false && none.reason, 'bad_transaction');
  const slash = await v.verify('gems-160', jws({ transactionId: 'a/b' }));
  assert.equal(slash.ok === false && slash.reason, 'bad_transaction');
});

test('中身を書き換えると、署名が合わなくて断る', async () => {
  const token = jws({ productId: 'gems_50' });
  const [h, , s] = token.split('.');
  const forged = Buffer.from(JSON.stringify(transactionPayload({ productId: 'gems_3800' }))).toString('base64url');
  const r = await verifierFor(config()).verify('gems-3800', `${h}.${forged}.${s}`);
  assert.equal(r.ok === false && r.reason, 'bad_signature');
});

test('Apple のルートにつながらない鎖 (別のルートで作った、自作の鎖) は、断る', async () => {
  const other = makeChain();
  // 検証器は chain のルートを信じているが、取引は other の鎖で署名されている
  const r = await verifierFor(config(), chain).verify('gems-160', jws({}, other));
  assert.equal(r.ok === false && r.reason, 'bad_signature');
});

test('本物の Apple Root CA - G3 を信じる検証器は、自作の鎖の取引を、断る', async () => {
  const real = createIapVerifier(config({ environments: ['Sandbox'] }), loadAppleRoots());
  const r = await real.verify('gems-160', jws({}));
  assert.equal(r.ok === false && r.reason, 'bad_signature');
});

test('葉・中間に Apple 独自の拡張が無い鎖は、断る', async () => {
  for (const options of [{ noLeafOid: true }, { noIntermediateOid: true }]) {
    const ch = makeChain(options);
    const r = await verifierFor(config(), ch).verify('gems-160', jws({}, ch));
    assert.equal(r.ok === false && r.reason, 'bad_signature', JSON.stringify(options));
  }
});

test('鎖の長さが 3 でないものは、断る', async () => {
  for (const x5c of [chain.x5c.slice(0, 2), [chain.x5c[0]], [...chain.x5c, chain.x5c[2]], []]) {
    const token = signJws(transactionPayload(), chain.leafKey, x5c);
    const r = await verifierFor(config()).verify('gems-160', token);
    assert.equal(r.ok === false && r.reason, 'bad_signature', `鎖 ${x5c.length} 枚`);
  }
});

test('期限が切れた葉の証明書は、断る (署名の日時が、期限のあと)', async () => {
  const ch = makeChain({ leafNotAfter: '20210101000000Z' });
  const r = await verifierFor(config(), ch).verify('gems-160', jws({}, ch));
  assert.equal(r.ok === false && r.reason, 'bad_signature');
});

test('署名の無い (alg: none) 取引や、形の違う文字は、断る', async () => {
  const v = verifierFor(config());
  const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', x5c: chain.x5c })).toString('base64url');
  const body = Buffer.from(JSON.stringify(transactionPayload())).toString('base64url');
  const unsigned = await v.verify('gems-160', `${head}.${body}.`);
  assert.equal(unsigned.ok === false && unsigned.reason, 'bad_signature');
  for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', 'x'.repeat(20_000)]) {
    const r = await v.verify('gems-160', bad);
    assert.equal(r.ok === false && r.reason, 'bad_input', `入力 ${bad.slice(0, 12)}`);
  }
  const garbage = await v.verify('gems-160', 'aaa.bbb.ccc');
  assert.equal(garbage.ok === false && garbage.reason, 'bad_signature');
  for (const bad of [undefined, null, 5, {}, ['a.b.c']]) {
    assert.equal((await v.verify('gems-160', bad)).ok === false && true, true);
    assert.equal((await v.verify(bad, 'a.b.c')).ok === false && true, true);
  }
});

test('onlineChecks: 証明書の失効の問い合わせができないときは、あとで (retry)。問い合わせ先が無い鎖は、断る', async () => {
  // 問い合わせ先 (OCSP) が、つながらない場所を指している: 一時的な失敗として、retry
  const unreachable = makeChain({ ocspUrl: 'http://127.0.0.1:9/ocsp' });
  const retry = await verifierFor(config({ onlineChecks: true }), unreachable).verify('gems-160', jws({}, unreachable));
  assert.equal(retry.ok === false && retry.reason, 'retry');
  // 問い合わせ先が書いていない鎖 (自作) は、証明書がおかしい、として断る
  const none = await verifierFor(config({ onlineChecks: true })).verify('gems-160', jws({}));
  assert.equal(none.ok === false && none.reason, 'bad_signature');
});

test('設定の読み取り: Bundle ID・環境・Apple ID・onlineChecks', () => {
  const raw = { bundleId: ' app.x ', appAppleId: '', environment: 'sandbox', onlineChecks: '' };
  const sandbox = parseIapSettings(raw);
  assert.ok(sandbox.ok && sandbox.config.bundleId === 'app.x' && sandbox.config.environments.join() === 'Sandbox' && sandbox.config.onlineChecks === true && sandbox.config.appAppleId === undefined);
  const both = parseIapSettings({ ...raw, appAppleId: '1234567890', environment: 'Production, Sandbox ,production' });
  assert.ok(both.ok && both.config.environments.join() === 'Production,Sandbox' && both.config.appAppleId === 1234567890);
  const off = parseIapSettings({ ...raw, onlineChecks: 'False' });
  assert.ok(off.ok && off.config.onlineChecks === false);
  // 足りない・おかしい設定は、使わない
  for (const bad of [
    { ...raw, bundleId: '' },
    { ...raw, environment: '' },
    { ...raw, environment: 'production' }, // Apple ID が無い
    { ...raw, environment: 'Xcode' }, // 署名を確かめない環境は、受けない
    { ...raw, environment: 'LocalTesting' },
    { ...raw, environment: 'Sandbox,Staging' },
    { ...raw, appAppleId: 'abc' },
    { ...raw, appAppleId: '-5' },
  ]) {
    assert.equal(parseIapSettings(bad).ok, false, JSON.stringify(bad));
  }
});
