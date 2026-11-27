/**
 * App Store の署名つき取引 (StoreKit 2 の JWS) の検証。純粋なモジュール (Firebase に触らない) なので、単体で試験できる。
 * 使うところ: purchases.ts (callable verifyPurchase)。試験: functions/test/iapVerify.test.ts (自作の証明書の鎖で、Apple のサーバーには出さない)。
 *
 * 確かめること:
 *   1. 署名の鎖 (葉 -> 中間 -> Apple Root CA - G3) と、署名そのもの (Apple 公式の SignedDataVerifier)
 *   2. Bundle ID が、設定どおり (署名が正しければ、SignedDataVerifier が確かめる)
 *   3. 環境 (Sandbox / Production) が、設定の中にある
 *   4. ゲームの商品 ID が許可リスト (products.ts) にあり、署名された商品 ID が、そこから決まるストアの商品 ID と同じ
 *   5. 取引の種類 (消耗型 / 自動更新しない定期購入) が、許可リストの種類と同じ
 *   6. 取り消し (返金) されていない (revocationDate が無い)
 * 取引 ID が、すでに別の人に使われていないか、は、ここではなく purchaseClaims.ts (Firestore) が見る。
 *
 * ※未確認: Apple の本物の署名つき取引・本物のルート証明書・OCSP (onlineChecks) での検証は、していない (Apple のサーバーには出していない)。
 */
import { Environment, SignedDataVerifier, Type, VerificationException, VerificationStatus } from '@apple/app-store-server-library';
import { findStoreProduct, storeProductId, type StoreKind } from './products';

export type IapEnvironment = 'Sandbox' | 'Production';

export interface IapConfig {
  /** アプリの Bundle ID (Xcode の Bundle Identifier と同じ)。 */
  bundleId: string;
  /** App Store Connect の「Apple ID」(アプリの数字の ID)。Production を受けるときだけ要る。 */
  appAppleId?: number;
  /** 受ける環境。順に試す。App 審査と TestFlight は Sandbox の取引を出すので、公開のときは ['Production', 'Sandbox'] になる (docs/PAYMENTS.md)。 */
  environments: IapEnvironment[];
  /** Apple の OCSP で、証明書の失効を確かめる (Apple の推奨。通信が要る)。 */
  onlineChecks: boolean;
}

/** 設定の生の文字 (環境変数・パラメーター)。 */
export interface RawIapSettings {
  bundleId: string;
  appAppleId: string;
  environment: string;
  onlineChecks: string;
}

export function parseIapSettings(raw: RawIapSettings): { ok: true; config: IapConfig } | { ok: false; message: string } {
  const bundleId = raw.bundleId.trim();
  if (!bundleId) return { ok: false, message: 'IAP_BUNDLE_ID が、設定されていません。' };

  const environments: IapEnvironment[] = [];
  for (const part of raw.environment.split(',')) {
    const name = part.trim().toLowerCase();
    if (!name) continue;
    // (Xcode / LocalTesting は受けない: SignedDataVerifier が、署名を確かめずに通してしまう環境なので)
    const env: IapEnvironment | null = name === 'sandbox' ? 'Sandbox' : name === 'production' ? 'Production' : null;
    if (!env) return { ok: false, message: `IAP_ENVIRONMENT に、知らない環境があります: ${part.trim()} (Sandbox か Production)` };
    if (!environments.includes(env)) environments.push(env);
  }
  if (environments.length === 0) return { ok: false, message: 'IAP_ENVIRONMENT が、設定されていません (Sandbox か Production。コンマで並べられる)。' };

  let appAppleId: number | undefined;
  const idText = raw.appAppleId.trim();
  if (idText) {
    if (!/^\d{1,15}$/.test(idText) || Number(idText) <= 0) return { ok: false, message: 'IAP_APP_APPLE_ID は、正の整数で書いてください。' };
    appAppleId = Number(idText);
  }
  if (environments.includes('Production') && appAppleId === undefined) return { ok: false, message: 'Production を受けるには、IAP_APP_APPLE_ID が要ります。' };

  const online = raw.onlineChecks.trim().toLowerCase();
  const onlineChecks = !(online === 'false' || online === '0' || online === 'no' || online === 'off');
  return { ok: true, config: { bundleId, appAppleId, environments, onlineChecks } };
}

export type VerifyFailure =
  /** 入力の形がおかしい。 */
  | 'bad_input'
  /** その商品 ID は、許可リストに無い (管理画面から足されただけの品・知らない品)。 */
  | 'not_allowed'
  /** 署名・証明書の鎖が、正しくない。 */
  | 'bad_signature'
  /** Bundle ID が、このアプリのものではない。 */
  | 'wrong_app'
  /** 環境が、設定の中に無い。 */
  | 'wrong_environment'
  /** 署名された商品 ID が、言ってきた商品と違う。 */
  | 'wrong_product'
  /** 取引の種類が、許可リストの種類と違う。 */
  | 'wrong_type'
  /** 署名は正しいが、取引 ID が無い・おかしい。 */
  | 'bad_transaction'
  /** 取り消し (返金) された取引。 */
  | 'revoked'
  /** 通信などの一時的な失敗。あとで、もう一度。 */
  | 'retry';

export interface VerifiedPurchase {
  gameProductId: string;
  storeProductId: string;
  transactionId: string;
  originalTransactionId: string | null;
  environment: string;
  /** 取引の日時 (ミリ秒)。 */
  purchaseDate: number | null;
}

export type VerifyResult = { ok: true; purchase: VerifiedPurchase } | { ok: false; reason: VerifyFailure; message: string };

export interface TransactionVerifier {
  verify(gameProductId: unknown, signedTransaction: unknown): Promise<VerifyResult>;
}

const fail = (reason: VerifyFailure, message: string): VerifyResult => ({ ok: false, reason, message });

const APPLE_TYPE: Record<StoreKind, Type> = { consumable: Type.CONSUMABLE, nonRenewing: Type.NON_RENEWING_SUBSCRIPTION };

/** 署名つき取引の長さの上限 (本物は、証明書3枚を含めて 4KB ほど)。 */
const MAX_SIGNED_LENGTH = 16_384;
/** 取引 ID は、Firestore の文書 ID にするので、安全な文字だけ。 */
const TRANSACTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

function failureOf(status: VerificationStatus): VerifyResult {
  switch (status) {
    case VerificationStatus.INVALID_APP_IDENTIFIER:
      return fail('wrong_app', 'Bundle ID が、このアプリのものではありません。');
    case VerificationStatus.INVALID_ENVIRONMENT:
      return fail('wrong_environment', '環境 (Sandbox / Production) が、設定にありません。');
    case VerificationStatus.RETRYABLE_VERIFICATION_FAILURE:
      return fail('retry', '証明書の確認が、できませんでした。あとで、もう一度。');
    default:
      return fail('bad_signature', '署名が、正しくありません。');
  }
}

/** 検証器を作る。root は、DER の Apple ルート証明書 (appleRoots.ts)。 */
export function createIapVerifier(config: IapConfig, roots: Buffer[]): TransactionVerifier {
  const verifiers = config.environments.map((env) => new SignedDataVerifier(roots, config.onlineChecks, env === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX, config.bundleId, config.appAppleId));

  return {
    async verify(gameProductId, signedTransaction): Promise<VerifyResult> {
      if (typeof gameProductId !== 'string' || typeof signedTransaction !== 'string') return fail('bad_input', '入力が、おかしいです。');
      if (signedTransaction.length === 0 || signedTransaction.length > MAX_SIGNED_LENGTH || signedTransaction.split('.').length !== 3) return fail('bad_input', '署名つき取引の形が、おかしいです。');
      const product = findStoreProduct(gameProductId);
      if (!product) return fail('not_allowed', 'この商品は、買えません。');

      let decoded;
      for (let i = 0; ; i++) {
        try {
          decoded = await verifiers[i].verifyAndDecodeTransaction(signedTransaction);
          break;
        } catch (err) {
          if (!(err instanceof VerificationException)) return fail('retry', '確認中に、思わぬ失敗がありました。');
          // 署名は正しいが、環境が違う: 次の環境の検証器で、もう一度 (公開のサーバーが、Sandbox の取引も受けるとき)。
          if (err.status === VerificationStatus.INVALID_ENVIRONMENT && i + 1 < verifiers.length) continue;
          return failureOf(err.status);
        }
      }

      const transactionId = decoded.transactionId;
      if (typeof transactionId !== 'string' || !TRANSACTION_ID.test(transactionId)) return fail('bad_transaction', '取引 ID が、おかしいです。');
      if (decoded.productId !== storeProductId(gameProductId)) return fail('wrong_product', '署名された商品が、違います。');
      if (decoded.type !== APPLE_TYPE[product.kind]) return fail('wrong_type', '取引の種類が、違います。');
      if (decoded.revocationDate !== undefined) return fail('revoked', 'この取引は、取り消されています。');
      return {
        ok: true,
        purchase: {
          gameProductId,
          storeProductId: decoded.productId,
          transactionId,
          originalTransactionId: typeof decoded.originalTransactionId === 'string' ? decoded.originalTransactionId : null,
          environment: String(decoded.environment ?? ''),
          purchaseDate: typeof decoded.purchaseDate === 'number' ? decoded.purchaseDate : null,
        },
      };
    },
  };
}
