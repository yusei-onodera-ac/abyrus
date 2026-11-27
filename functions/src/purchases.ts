/**
 * 本物の課金の、サーバー側: callable verifyPurchase。設計と手順は docs/PAYMENTS.md。
 *
 *   入力   { productId: ゲームの商品 ID, signedTransaction: StoreKit 2 の署名つき取引 (JWS) }
 *   出力   { ok: true, value: { productId, transactionId, environment } } か { ok: false, reason, message }
 *          (同盟の callable と同じ形。reason は、下の Reason)
 *
 * 流れ: サインイン必須 (request.auth.uid) -> 設定を読む -> iapVerify.ts で署名・Bundle ID・環境・商品・取り消しを確かめる
 *       -> purchaseClaims.ts で、取引 ID を uid に結びつける (同じ uid の再送は成功、別の uid は断る)。
 * 品物を渡すのは、クライアント (セーブは端末にある)。サーバーは「この人の、この取引は、本物で、まだ誰にも使われていない」を保証するだけ。
 *
 * 設定 (関数のパラメーター。デプロイのとき functions/.env.<プロジェクトID> か、プロンプトで入れる。コードには決め打ちしない):
 *   IAP_BUNDLE_ID        アプリの Bundle ID
 *   IAP_APP_APPLE_ID     App Store Connect の「Apple ID」(数字)。Production を受けるときだけ要る
 *   IAP_ENVIRONMENT      Sandbox か Production (コンマで並べられる: "Production,Sandbox")
 *   IAP_ONLINE_CHECKS    証明書の失効を Apple に問い合わせるか (既定 true)
 * どれも、空のままデプロイできる (その間は、購入を、すべて not_configured で断る。ほかの関数の、デプロイは止めない)。
 *
 * ※未確認: デプロイしていない。Blaze プランかも不明。エミュレーターと単体試験で確かめた (functions/test/)。
 */
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { defineString } from 'firebase-functions/params';
import { onCall } from 'firebase-functions/v2/https';
import { loadAppleRoots } from './appleRoots';
import { createIapVerifier, parseIapSettings, type TransactionVerifier, type VerifyFailure } from './iapVerify';
import { claimPurchase } from './purchaseClaims';

const IAP_BUNDLE_ID = defineString('IAP_BUNDLE_ID', { default: '', description: 'アプリの Bundle ID (Xcode の Bundle Identifier)' });
const IAP_APP_APPLE_ID = defineString('IAP_APP_APPLE_ID', { default: '', description: 'App Store Connect の Apple ID (数字)。Production を受けるときだけ要る' });
const IAP_ENVIRONMENT = defineString('IAP_ENVIRONMENT', { default: '', description: 'Sandbox か Production (コンマで並べられる)' });
const IAP_ONLINE_CHECKS = defineString('IAP_ONLINE_CHECKS', { default: 'true', description: '証明書の失効を Apple に問い合わせる (true / false)' });

export type PurchaseReason = VerifyFailure | 'not_signed_in' | 'not_configured' | 'used_by_other' | 'error';

export interface VerifiedValue {
  productId: string;
  transactionId: string;
  environment: string;
}

export type VerifyPurchaseResponse = { ok: true; value: VerifiedValue } | { ok: false; reason: PurchaseReason; message: string };

export type VerifierSource = () => Promise<{ ok: true; verifier: TransactionVerifier } | { ok: false; message: string }>;

const failure = (reason: PurchaseReason, message: string): VerifyPurchaseResponse => ({ ok: false, reason, message });

/** 呼び出しの中身。onCall から切り離してあるので、試験は、自作の鎖の検証器と、エミュレーターの Firestore で、これを直接呼ぶ。 */
export async function handleVerifyPurchase(deps: { db: Firestore; getVerifier: VerifierSource }, uid: string | undefined, data: unknown): Promise<VerifyPurchaseResponse> {
  if (!uid) return failure('not_signed_in', 'サインインできていません。');
  const input = (data ?? {}) as { productId?: unknown; signedTransaction?: unknown };
  try {
    const source = await deps.getVerifier();
    if (!source.ok) {
      logger.error('verifyPurchase: 設定が足りません', { message: source.message });
      return failure('not_configured', '購入の確認が、まだ準備できていません。');
    }
    const result = await source.verifier.verify(input.productId, input.signedTransaction);
    if (!result.ok) {
      logger.warn('verifyPurchase: 断りました', { uid, reason: result.reason, productId: typeof input.productId === 'string' ? input.productId : null });
      return failure(result.reason, result.message);
    }
    const claim = await claimPurchase(deps.db, uid, result.purchase);
    if (claim === 'other_user') {
      logger.warn('verifyPurchase: 別の人が使った取引です', { uid, transactionId: result.purchase.transactionId });
      return failure('used_by_other', 'この取引は、すでに使われています。');
    }
    return { ok: true, value: { productId: result.purchase.gameProductId, transactionId: result.purchase.transactionId, environment: result.purchase.environment } };
  } catch (err) {
    logger.error('verifyPurchase', err);
    return failure('error', 'うまくいきませんでした。もう一度ためしてください。');
  }
}

/** 設定 (パラメーター) と Apple のルート証明書から、検証器を作る。作れたものは使い回す (OCSP の結果を、キャッシュするため)。 */
function paramVerifierSource(): VerifierSource {
  let cached: TransactionVerifier | undefined;
  return async () => {
    if (cached) return { ok: true, verifier: cached };
    const parsed = parseIapSettings({ bundleId: IAP_BUNDLE_ID.value(), appAppleId: IAP_APP_APPLE_ID.value(), environment: IAP_ENVIRONMENT.value(), onlineChecks: IAP_ONLINE_CHECKS.value() });
    if (!parsed.ok) return parsed;
    try {
      cached = createIapVerifier(parsed.config, loadAppleRoots());
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true, verifier: cached };
  };
}

/**
 * callable verifyPurchase を作る。index.ts が、setGlobalOptions (地域) のあとに呼ぶ
 * (import の順で、ここが先に動いて、地域が既定になるのを避けるため、関数そのものは index.ts で作る)。
 */
export function makeVerifyPurchase(db: Firestore = getFirestore(), getVerifier: VerifierSource = paramVerifierSource()) {
  // (OCSP の問い合わせは、1回に最大30秒かかりうる)
  return onCall({ timeoutSeconds: 60 }, (request) => handleVerifyPurchase({ db, getVerifier }, request.auth?.uid, request.data));
}
