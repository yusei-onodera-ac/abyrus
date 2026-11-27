import type Phaser from 'phaser';
import { PurchaseNotices } from '../ui/PurchaseNotices';
import { getFirebaseConfig, getFunctionsRegion, isLeaderboardConfigured } from './firebaseConfig';
import { PaymentSystem } from './PaymentSystem';
import { PurchaseDelivery } from './PurchaseDelivery';
import { SaveSystem, type SaveData } from './SaveSystem';
import { StoreKitGateway, outcomeOfResponse, type PurchaseVerifier, type StoreDelivery, type StorePlugin, type VerifyOutcome } from './StoreKitPayment';

/**
 * Turns the real App Store on - in the iOS app only. The web build and a dev build keep the gateway they have (PaymentSystem).
 * Called once from BootScene.create, without `await`: the game never waits for the store or the network.
 *
 * The three real things behind StoreKitGateway:
 *  - the plugin: @capgo/native-purchases, native code only (installed so `cap sync` puts its Swift in the iOS project). Its JavaScript wrapper
 *    is not used: Capacitor's own `registerPlugin('NativePurchases')` reaches the same native plugin, with just the methods this game calls
 *    (StorePlugin) - fewer moving parts, and nothing of it ends up in the web build;
 *  - the server: the Cloud Function `verifyPurchase` (functions/src/purchases.ts), reached with the same anonymous sign-in the ranking uses;
 *  - the save: the game's own, in the Phaser registry (the shop screens use the same object).
 * docs/PAYMENTS.md. ※ Not run on a device.
 */

/** True inside the iOS app (Capacitor puts `window.Capacitor` there before any page script runs). */
export function isNativeIos(): boolean {
  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return capacitor?.getPlatform?.() === 'ios';
}

const VERIFY_TIMEOUT_MS = 30_000;

/** Asks the server whether this signed transaction is real and this player's. Never rejects: whatever goes wrong is 'retry'. */
const callableVerifier: PurchaseVerifier = {
  async verify(productId, signedTransaction): Promise<VerifyOutcome> {
    try {
      const [appMod, authMod, fnMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/functions')]);
      // (the ranking, the alliance and the transfer start the same default app with the same settings: shared when it is already there)
      const app = appMod.getApps().length > 0 ? appMod.getApp() : appMod.initializeApp(getFirebaseConfig());
      const auth = authMod.getAuth(app);
      await auth.authStateReady(); // (the player the device remembers comes back first: signing in again would make a new one)
      if (!auth.currentUser) await authMod.signInAnonymously(auth);
      const call = fnMod.httpsCallable<{ productId: string; signedTransaction: string }, unknown>(fnMod.getFunctions(app, getFunctionsRegion()), 'verifyPurchase', { timeout: VERIFY_TIMEOUT_MS });
      return outcomeOfResponse((await call({ productId, signedTransaction })).data);
    } catch {
      return { status: 'retry' };
    }
  },
};

/** Hands a payment over to the game's current save (the registry's: a restored or reset save replaces the object), saves, and shows what came. */
function gameDelivery(game: Phaser.Game): StoreDelivery {
  const current = (): SaveData | undefined => game.registry.get('save') as SaveData | undefined;
  return {
    isDelivered: (transactionId) => {
      const save = current();
      return save !== undefined && PurchaseDelivery.isDelivered(save, transactionId);
    },
    deliver: (productId, transactionId) => {
      const save = current();
      if (!save) return 'not_ready';
      const delivery = PurchaseDelivery.deliver(save, productId, transactionId);
      if (delivery.kind === 'duplicate' || delivery.kind === 'unknown') return delivery.kind;
      SaveSystem.save(save);
      PurchaseNotices.push(game, delivery);
      return 'delivered';
    },
  };
}

/**
 * Starts the App Store gateway when this is the iOS app and the Firebase settings are there (without them nothing could be verified, and
 * the shop keeps saying the payment is not ready). The game goes on at once; the store's part runs in the background and never throws.
 */
export function startStorePayments(game: Phaser.Game): void {
  if (!isNativeIos() || !isLeaderboardConfigured()) return;
  void (async () => {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const plugin = registerPlugin<StorePlugin>('NativePurchases');
      const gateway = new StoreKitGateway({ plugin, verifier: callableVerifier, delivery: gameDelivery(game) });
      PaymentSystem.setGateway(gateway);
      await gateway.start();
    } catch {
      // (the shop keeps the gateway it had)
    }
  })();
}
