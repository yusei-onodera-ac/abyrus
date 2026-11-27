/**
 * 取引の使い回しを防ぐ: purchases/{取引ID} を、Admin SDK の transaction で作る。
 *   - まだ無い                 -> 作る ('created')
 *   - ある・同じ uid           -> 何もしない ('same_user'。同じ取引を、もう一度確かめに来ただけ: 成功)
 *   - ある・別の uid           -> 断る ('other_user'。ほかの人が、すでに使った取引)
 * purchases は、クライアントからは読めも書けもしない (firestore.rules に match が無い = 拒否。Admin SDK はルールの外)。
 * 試験: functions/test/emulator.test.ts (Firestore エミュレーターに、実際の firestore.rules を読み込ませる)。
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { VerifiedPurchase } from './iapVerify';

export type ClaimResult = 'created' | 'same_user' | 'other_user';

export async function claimPurchase(db: Firestore, uid: string, purchase: VerifiedPurchase): Promise<ClaimResult> {
  const ref = db.collection('purchases').doc(purchase.transactionId);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (snap.exists) return snap.get('uid') === uid ? 'same_user' : 'other_user';
    t.create(ref, {
      uid,
      productId: purchase.gameProductId,
      storeProductId: purchase.storeProductId,
      environment: purchase.environment,
      originalTransactionId: purchase.originalTransactionId,
      purchaseDate: purchase.purchaseDate,
      verifiedAt: FieldValue.serverTimestamp(),
    });
    return 'created';
  });
}
