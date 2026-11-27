/**
 * Firestore エミュレーターを使う試験 (本番には、つながらない: プロジェクト ID は demo- で始まる)。
 *   実行: cd functions && npm run test:emulator   (Java と firebase-tools が要る。 firebase emulators:exec が、エミュレーターを立てて、これを走らせる)
 *
 * 1. purchaseClaims: 取引 ID の結びつけ (新規・同じ uid の再送・別の uid・同時の2人)
 * 2. handleVerifyPurchase / makeVerifyPurchase(onCall): サインイン・設定・検証・結びつけ を通した結果と、Firestore に残るもの
 * 3. ルール: 実際の firestore.rules で、purchases は、クライアントからは読めも書けもしない (ルールは変えていない)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createIapVerifier, type IapConfig } from '../src/iapVerify';
import { claimPurchase } from '../src/purchaseClaims';
import { handleVerifyPurchase, makeVerifyPurchase, type VerifierSource, type VerifyPurchaseResponse } from '../src/purchases';
import { makeChain, signJws, transactionPayload, type TransactionOptions } from './testChain';

const PROJECT = 'demo-abyrus-iap';
const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = host ? false : 'FIRESTORE_EMULATOR_HOST が無い (npm run test:emulator で走らせる)';

const config: IapConfig = { bundleId: 'app.test.game', appAppleId: 1234567890, environments: ['Sandbox'], onlineChecks: false };
const chain = makeChain();
const verifier = createIapVerifier(config, [chain.rootDer]);
const source: VerifierSource = async () => ({ ok: true, verifier });
const jws = (o: TransactionOptions = {}): string => signJws(transactionPayload(o), chain.leafKey, chain.x5c);

let app: App;
let db: Firestore;
let counter = 0;
/** 試験ごとに、重ならない取引 ID。 */
const nextId = (): string => `9${Date.now()}${String(++counter).padStart(3, '0')}`;

const purchase = (transactionId: string) => ({
  gameProductId: 'gems-160',
  storeProductId: 'gems_160',
  transactionId,
  originalTransactionId: transactionId,
  environment: 'Sandbox',
  purchaseDate: 1_800_000_000_000,
});

before(() => {
  if (skip) return;
  app = initializeApp({ projectId: PROJECT }, 'purchases-test');
  db = getFirestore(app);
});
after(async () => {
  if (!skip) await db.terminate();
});

describe('purchaseClaims (Admin SDK の transaction)', { skip }, () => {
  test('はじめての取引は作られ、同じ uid の再送は成功、別の uid は断られる', async () => {
    const id = nextId();
    assert.equal(await claimPurchase(db, 'alice', purchase(id)), 'created');
    const first = (await db.doc(`purchases/${id}`).get()).data();
    assert.equal(first?.uid, 'alice');
    assert.equal(first?.productId, 'gems-160');
    assert.equal(first?.storeProductId, 'gems_160');
    assert.equal(first?.environment, 'Sandbox');
    assert.ok(first?.verifiedAt);

    assert.equal(await claimPurchase(db, 'alice', purchase(id)), 'same_user');
    assert.equal(await claimPurchase(db, 'bob', purchase(id)), 'other_user');
    const after = (await db.doc(`purchases/${id}`).get()).data();
    assert.equal(after?.uid, 'alice', '別の uid に、上書きされない');
    assert.deepEqual(after?.verifiedAt, first?.verifiedAt, '再送で、書き換わらない');
  });

  test('同時に、別の2人が同じ取引を出しても、結びつくのは1人だけ', async () => {
    for (let round = 0; round < 5; round++) {
      const id = nextId();
      const results = await Promise.all(['u1', 'u2', 'u3', 'u4'].map((uid) => claimPurchase(db, uid, purchase(id))));
      assert.equal(results.filter((r) => r === 'created').length, 1);
      assert.equal(results.filter((r) => r === 'other_user').length, 3);
      const owner = (await db.doc(`purchases/${id}`).get()).get('uid');
      assert.ok(['u1', 'u2', 'u3', 'u4'].includes(owner));
    }
  });

  test('同時に、同じ人が同じ取引を出しても、成功する (created は1回)', async () => {
    const id = nextId();
    const results = await Promise.all([1, 2, 3].map(() => claimPurchase(db, 'solo', purchase(id))));
    assert.equal(results.filter((r) => r === 'created').length, 1);
    assert.equal(results.filter((r) => r === 'same_user').length, 2);
  });
});

describe('verifyPurchase (検証 + 結びつけ)', { skip }, () => {
  const ask = (uid: string | undefined, productId: unknown, signedTransaction: unknown, getVerifier: VerifierSource = source): Promise<VerifyPurchaseResponse> =>
    handleVerifyPurchase({ db, getVerifier }, uid, { productId, signedTransaction });

  test('サインインしていなければ断る', async () => {
    const r = await ask(undefined, 'gems-160', jws());
    assert.deepEqual(r.ok === false && r.reason, 'not_signed_in');
  });

  test('設定が足りなければ not_configured (購入を、すべて断る)', async () => {
    const id = nextId();
    const r = await ask('alice', 'gems-160', jws({ transactionId: id }), async () => ({ ok: false, message: 'IAP_BUNDLE_ID が、設定されていません。' }));
    assert.deepEqual(r.ok === false && r.reason, 'not_configured');
    assert.equal((await db.doc(`purchases/${id}`).get()).exists, false);
  });

  test('正しい取引は通り、purchases に残る。同じ uid の再送も成功。別の uid は used_by_other', async () => {
    const id = nextId();
    const token = jws({ transactionId: id });
    const r = await ask('alice', 'gems-160', token);
    assert.ok(r.ok && r.value.productId === 'gems-160' && r.value.transactionId === id && r.value.environment === 'Sandbox');
    assert.equal((await db.doc(`purchases/${id}`).get()).get('uid'), 'alice');
    const again = await ask('alice', 'gems-160', token);
    assert.ok(again.ok && again.value.transactionId === id);
    const stolen = await ask('mallory', 'gems-160', token);
    assert.deepEqual(stolen.ok === false && stolen.reason, 'used_by_other');
    assert.equal((await db.doc(`purchases/${id}`).get()).get('uid'), 'alice');
  });

  test('断られた取引は、purchases に残らない (商品の食い違い・返金・知らない品・壊れた署名)', async () => {
    const cases: [string, unknown, string][] = [
      ['wrong_product', 'gems-3800', jws({ productId: 'gems_50', transactionId: nextId() })],
      ['revoked', 'gems-160', jws({ revoked: true, transactionId: nextId() })],
      ['not_allowed', 'gems-9999', jws({ productId: 'gems_9999', transactionId: nextId() })],
      ['bad_input', 'gems-160', 'not-a-jws'],
      ['bad_input', undefined, jws()],
    ];
    for (const [reason, productId, token] of cases) {
      const before = (await db.collection('purchases').count().get()).data().count;
      const r = await ask('alice', productId, token);
      assert.equal(r.ok === false && r.reason, reason);
      assert.equal((await db.collection('purchases').count().get()).data().count, before, `${reason}: 文書が増えた`);
    }
  });

  test('onCall の関数 (makeVerifyPurchase) も、同じ結果を返す', async () => {
    const fn = makeVerifyPurchase(db, source);
    const id = nextId();
    const request = (uid: string | undefined) => ({ auth: uid ? { uid, token: {} } : undefined, data: { productId: 'gems-160', signedTransaction: jws({ transactionId: id }) }, rawRequest: {} }) as never;
    const none = (await fn.run(request(undefined))) as VerifyPurchaseResponse;
    assert.deepEqual(none.ok === false && none.reason, 'not_signed_in');
    const ok = (await fn.run(request('alice'))) as VerifyPurchaseResponse;
    assert.ok(ok.ok && ok.value.transactionId === id);
    const other = (await fn.run(request('bob'))) as VerifyPurchaseResponse;
    assert.deepEqual(other.ok === false && other.reason, 'used_by_other');
  });

  test('Firestore が答えないときは error (retry できる失敗) で返し、投げない', async () => {
    const broken = { collection: () => ({ doc: () => ({}) }), runTransaction: () => Promise.reject(new Error('unavailable')) } as unknown as Firestore;
    const r = await handleVerifyPurchase({ db: broken, getVerifier: source }, 'alice', { productId: 'gems-160', signedTransaction: jws() });
    assert.deepEqual(r.ok === false && r.reason, 'error');
  });
});

describe('Firestore のルール (実際の firestore.rules): purchases は、クライアントから読めも書けもしない', { skip }, () => {
  const rulesFile = path.resolve(process.cwd(), '..', 'firestore.rules');
  const base = `http://${host}/v1/projects/${PROJECT}/databases/(default)/documents`;
  /** エミュレーターが受ける、署名なしの ID トークン (ルールの request.auth になる)。 */
  const token = (uid: string): string => {
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return `${part({ alg: 'none', typ: 'JWT' })}.${part({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, firebase: { identities: {}, sign_in_provider: 'anonymous' } })}.`;
  };
  const as = (uid: string | null): Record<string, string> => ({ 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${token(uid)}` } : {}) });
  const fields = { uid: { stringValue: 'alice' }, productId: { stringValue: 'gems-160' } };

  test('ルールが読み込まれている (確認: admins は誰も読めず、shopProducts は誰でも読める)', async () => {
    assert.match(readFileSync(rulesFile, 'utf8'), /match \/admins\/\{adminUid\}/);
    assert.equal((await fetch(`${base}/admins/x`, { headers: as('alice') })).status, 403);
    assert.equal((await fetch(`${base}/shopProducts`, { headers: as(null) })).status, 200);
  });

  test('purchases: サインインしていてもいなくても、本人の取引でも、読めない・一覧できない・書けない・消せない', async () => {
    const id = nextId();
    await claimPurchase(db, 'alice', purchase(id)); // サーバー (Admin SDK) は、ルールの外
    for (const uid of ['alice', 'bob', null]) {
      const who = uid ?? '(未サインイン)';
      assert.equal((await fetch(`${base}/purchases/${id}`, { headers: as(uid) })).status, 403, `${who}: get`);
      assert.equal((await fetch(`${base}/purchases/${nextId()}`, { headers: as(uid) })).status, 403, `${who}: 無い文書の get`);
      assert.equal((await fetch(`${base}/purchases`, { headers: as(uid) })).status, 403, `${who}: list`);
      const query = { structuredQuery: { from: [{ collectionId: 'purchases', allDescendants: true }] } };
      assert.equal((await fetch(`${base}:runQuery`, { method: 'POST', headers: as(uid), body: JSON.stringify(query) })).status, 403, `${who}: collectionGroup`);
      assert.equal((await fetch(`${base}/purchases/${nextId()}`, { method: 'PATCH', headers: as(uid), body: JSON.stringify({ fields }) })).status, 403, `${who}: 作る`);
      assert.equal((await fetch(`${base}/purchases/${id}`, { method: 'PATCH', headers: as(uid), body: JSON.stringify({ fields: { uid: { stringValue: uid ?? 'x' } } }) })).status, 403, `${who}: 書き換える`);
      assert.equal((await fetch(`${base}/purchases/${id}`, { method: 'DELETE', headers: as(uid) })).status, 403, `${who}: 消す`);
    }
    assert.equal((await db.doc(`purchases/${id}`).get()).get('uid'), 'alice', 'どれも通らず、文書は、そのまま');
  });
});
