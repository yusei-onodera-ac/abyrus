/**
 * Where real-money purchases go. The shop only talks to this interface; the real thing is
 * `PaymentSystem.setGateway(...)`, nothing in the shop changes.
 *
 *  - the iOS app (Capacitor) uses the App Store gateway (systems/StoreKitPayment.ts, started by
 *    systems/NativeStore.ts): StoreKit 2 takes the money, the server (functions/, `verifyPurchase`) checks the signed
 *    transaction, and the shop hands the goods over - docs/PAYMENTS.md;
 *  - a dev build (`npm run dev`) uses the TEST gateway, which "pays" immediately and charges nobody - so the flow can
 *    be tried end to end;
 *  - the web build and anything else uses the UNAVAILABLE gateway, which never grants anything: the shop says the
 *    payment isn't ready.
 */

export interface PaymentRequest {
  productId: string;
  name: string;
  /** Price in yen, tax included (what is shown until the store tells the player's own price). */
  yen: number;
}

/** What the store keeps for a payment that went through: the screen hands the goods over, saves, and only THEN calls
 *  `finish()` - so a crash in between makes the store offer the same payment again at the next launch (nothing is lost). */
export interface PaidReceipt {
  transactionId: string;
  /** Tells the store the goods are in the save. Never rejects. */
  finish(): Promise<void>;
}

export type PaymentResult =
  /** The money was taken (and, with a store, the server confirmed it). `receipt` is there when a store is behind it. */
  | { status: 'paid'; receipt?: PaidReceipt }
  /** No payment service is connected (or the store does not sell this product). */
  | { status: 'unavailable' }
  /** The player backed out of the store's own dialog. */
  | { status: 'cancelled' }
  /** Waiting for somebody's approval (Ask to Buy): the goods come later, by themselves, once it is approved. */
  | { status: 'pending' }
  /** The store took the money but the server could not be reached to confirm it: the goods come by themselves, later. */
  | { status: 'later' }
  | { status: 'failed'; message?: string };

export interface PaymentGateway {
  /** True when nobody is really charged (shown to the player on the confirm dialog). */
  readonly isTest: boolean;
  /** Resolves 'paid' only once the money has actually been taken. */
  purchase(request: PaymentRequest): Promise<PaymentResult>;
  /** The store's price text in the player's own currency ("$4.99", "¥480"), or undefined when it is not known (yet). */
  priceOf?(productId: string): string | undefined;
  /** False when the store has no such product (e.g. one the operator added from the admin that was never made in the store). */
  canSell?(productId: string): boolean;
  /** Asks the store for its prices again if they have not arrived. Resolves true when something new came in. Never rejects. */
  refreshPrices?(): Promise<boolean>;
}

const testGateway: PaymentGateway = {
  isTest: true,
  purchase: () => Promise.resolve({ status: 'paid' }),
};

const unavailableGateway: PaymentGateway = {
  isTest: false,
  purchase: () => Promise.resolve({ status: 'unavailable' }),
};

let current: PaymentGateway = import.meta.env.DEV ? testGateway : unavailableGateway;

export const PaymentSystem = {
  getGateway(): PaymentGateway {
    return current;
  },

  /** Plug in the real store integration. */
  setGateway(gateway: PaymentGateway): void {
    current = gateway;
  },

  /** The price to show for a yen product: the store's text in the player's currency when it has one, else "¥480" as before. */
  priceLabel(productId: string, yen: number): string {
    return current.priceOf?.(productId) ?? `¥${yen.toLocaleString('ja-JP')}`;
  },

  /** Whether a yen product can be bought at all through the current gateway (true when the gateway does not say). */
  canSell(productId: string): boolean {
    return current.canSell?.(productId) ?? true;
  },
};
