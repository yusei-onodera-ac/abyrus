/**
 * Where real-money purchases go. There is no billing backend yet (a shipped
 * game would use the App Store / Google Play, with the receipt checked by a
 * server), so the shop only talks to this interface; swapping the real thing in
 * is `PaymentSystem.setGateway(...)`, nothing in the shop changes.
 *
 * Until then:
 *  - a dev build (`npm run dev`) uses the TEST gateway, which "pays"
 *    immediately and charges nobody - so the flow can be tried end to end;
 *  - a production build uses the UNAVAILABLE gateway, which never grants
 *    anything: the shop says the payment isn't ready yet.
 */

export interface PaymentRequest {
  productId: string;
  name: string;
  /** Price in yen, tax included. */
  yen: number;
}

export type PaymentResult =
  | { status: 'paid' }
  /** No payment service is connected. */
  | { status: 'unavailable' }
  /** The player backed out of the store's own dialog. */
  | { status: 'cancelled' }
  | { status: 'failed'; message?: string };

export interface PaymentGateway {
  /** True when nobody is really charged (shown to the player on the confirm dialog). */
  readonly isTest: boolean;
  /** Resolves 'paid' only once the money has actually been taken. */
  purchase(request: PaymentRequest): Promise<PaymentResult>;
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
};
