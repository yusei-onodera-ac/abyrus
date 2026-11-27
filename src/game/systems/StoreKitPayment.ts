import { STORE_PRODUCTS, gameProductIdOf, isStoreProduct, storeProductId } from '../data/storeProducts';
import type { PaidReceipt, PaymentGateway, PaymentRequest, PaymentResult } from './PaymentSystem';

/**
 * The App Store gateway (StoreKit 2 through the Capacitor plugin @capgo/native-purchases): the part with the rules, with the plugin and
 * the server behind small interfaces so a test can stand in for them (tools/tests/payments.ts). The wiring to the real plugin, the
 * Firebase callable and the game's save is systems/NativeStore.ts. Design and the data flow: docs/PAYMENTS.md.
 *
 * The rules:
 *  - buy: the store takes the money -> the signed transaction (JWS) goes to the server (`verifyPurchase`) -> 'paid' -> the SCREEN hands the
 *    goods over and saves -> only then `receipt.finish()` tells the store it is done. Until finished, the store keeps offering the payment.
 *  - recovery: the payments the store still has unfinished (the app died after paying, or before the goods were saved; an Ask to Buy that was
 *    approved later) are picked up at launch and when the store announces them, checked by the server and handed over - the same way.
 *  - nothing is handed over twice: a transaction already in the save is only finished (PurchaseDelivery remembers the ids).
 *  - starting never waits for the store or the network: `start()` is called without `await`, and each step fails on its own.
 *
 * ※ Not checked against a real device, the App Store or Apple's servers: the plugin's behaviour is read from its source (docs/PAYMENTS.md).
 */

// ---------------------------------------------------------------------------------------------------- the plugin (the parts used)

export interface StoreTransaction {
  /** StoreKit's transaction id (digits, as text). */
  transactionId: string;
  /** The store's product id (storeProductId of the game's). */
  productIdentifier: string;
  /** The signed transaction (StoreKit 2 JWS): what the server checks. */
  jwsRepresentation?: string;
}

export interface StoreProductInfo {
  identifier: string;
  /** The price as the store writes it in the player's currency: "$4.99", "¥480". */
  priceString: string;
}

export interface StorePlugin {
  configure?(options: { autoFinishTransactions?: boolean }): Promise<void>;
  getProducts(options: { productIdentifiers: string[] }): Promise<{ products: StoreProductInfo[] }>;
  purchaseProduct(options: { productIdentifier: string; autoAcknowledgePurchases?: boolean }): Promise<StoreTransaction>;
  getUnfinishedTransactions(): Promise<{ transactions: StoreTransaction[] }>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
  addListener(event: 'transactionUpdated', listener: (transaction: StoreTransaction) => void): Promise<{ remove(): Promise<void> }>;
}

// ---------------------------------------------------------------------------------------------------- the server and the game's save

export type VerifyOutcome =
  /** The server says the transaction is real, this player's, and not used by anyone else. */
  | { status: 'ok' }
  /** The store took it back (a refund): nothing to hand over; the transaction is finished and forgotten. */
  | { status: 'revoked' }
  /** The server refused it (wrong app, a product it does not sell ...). Left unfinished: the money was taken, so it is not thrown away. */
  | { status: 'rejected'; reason: string }
  /** The server could not be asked, or had a hiccup: try again later. */
  | { status: 'retry' };

export interface PurchaseVerifier {
  /** Never rejects. */
  verify(productId: string, signedTransaction: string): Promise<VerifyOutcome>;
}

/** The server's reply (functions/src/purchases.ts) as a VerifyOutcome. Anything that is not a clear answer is 'retry'. */
export function outcomeOfResponse(data: unknown): VerifyOutcome {
  if (typeof data !== 'object' || data === null) return { status: 'retry' };
  const body = data as { ok?: unknown; reason?: unknown };
  if (body.ok === true) return { status: 'ok' };
  const reason = typeof body.reason === 'string' ? body.reason : '';
  if (reason === 'revoked') return { status: 'revoked' };
  if (reason === '' || reason === 'retry' || reason === 'error' || reason === 'not_signed_in') return { status: 'retry' };
  return { status: 'rejected', reason };
}

export interface StoreDelivery {
  isDelivered(transactionId: string): boolean;
  /** Hands the goods over and saves (and shows what came). 'not_ready' = there is no save to put them in yet (the game is still starting). */
  deliver(productId: string, transactionId: string): 'delivered' | 'duplicate' | 'unknown' | 'not_ready';
}

// ---------------------------------------------------------------------------------------------------- the gateway

export interface StoreGatewayDeps {
  plugin: StorePlugin;
  verifier: PurchaseVerifier;
  delivery: StoreDelivery;
  /** How long to wait before telling the store a payment is finished (ms). The save is written to the web view's storage at once, but the
   *  system flushes that to disk a moment later: finishing in the same breath could lose the goods if the app is killed right then. */
  finishDelayMs?: number;
  /** When to try again after the server could not be reached (ms; each retry waits for the next number, then it stops until the next launch). */
  retryDelaysMs?: number[];
  /** For tests. */
  wait?: (ms: number) => Promise<void>;
  schedule?: (callback: () => void, ms: number) => void;
}

const DEFAULT_FINISH_DELAY_MS = 3000;
const DEFAULT_RETRY_DELAYS_MS = [15_000, 60_000, 300_000];

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : String(err));

export class StoreKitGateway implements PaymentGateway {
  readonly isTest = false;
  private readonly plugin: StorePlugin;
  private readonly verifier: PurchaseVerifier;
  private readonly delivery: StoreDelivery;
  private readonly finishDelayMs: number;
  private readonly retryDelays: number[];
  private readonly wait: (ms: number) => Promise<void>;
  private readonly schedule: (callback: () => void, ms: number) => void;

  /** Game product id -> the store's price text. */
  private prices = new Map<string, string>();
  /** Game product ids the store answered for. Only trusted once the store has answered at all. */
  private known = new Set<string>();
  private loaded = false;
  /** Transactions being handled right now (the listener and a recovery can meet the same one). */
  private busy = new Set<string>();
  private retryAttempt = 0;
  private retryScheduled = false;

  constructor(deps: StoreGatewayDeps) {
    this.plugin = deps.plugin;
    this.verifier = deps.verifier;
    this.delivery = deps.delivery;
    this.finishDelayMs = deps.finishDelayMs ?? DEFAULT_FINISH_DELAY_MS;
    this.retryDelays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.schedule = deps.schedule ?? ((callback, ms) => void setTimeout(callback, ms));
  }

  // --- prices ----------------------------------------------------------------

  priceOf(productId: string): string | undefined {
    return this.prices.get(productId);
  }

  canSell(productId: string): boolean {
    return isStoreProduct(productId) && (!this.loaded || this.known.has(productId));
  }

  /** Asks the store for the prices. Resolves true when a price is new. Never rejects. */
  async loadPrices(): Promise<boolean> {
    try {
      const { products } = await this.plugin.getProducts({ productIdentifiers: STORE_PRODUCTS.map((p) => storeProductId(p.gameId)) });
      const known = new Set<string>();
      let changed = false;
      for (const product of products ?? []) {
        const gameId = gameProductIdOf(product.identifier);
        if (!gameId || typeof product.priceString !== 'string' || product.priceString === '') continue;
        known.add(gameId);
        if (this.prices.get(gameId) !== product.priceString) {
          this.prices.set(gameId, product.priceString);
          changed = true;
        }
      }
      // (an empty answer is more likely a hiccup than "the store sells nothing": then every product stays buyable and the purchase itself says no)
      this.known = known;
      this.loaded = known.size > 0;
      return changed;
    } catch {
      return false;
    }
  }

  async refreshPrices(): Promise<boolean> {
    return this.loaded ? false : this.loadPrices();
  }

  // --- buying -----------------------------------------------------------------

  async purchase(request: PaymentRequest): Promise<PaymentResult> {
    const gameId = request.productId;
    if (!this.canSell(gameId)) return { status: 'unavailable' };
    let transaction: StoreTransaction;
    try {
      // autoAcknowledgePurchases false: the plugin must not finish it for us (finishing is ours, after the goods are saved)
      transaction = await this.plugin.purchaseProduct({ productIdentifier: storeProductId(gameId), autoAcknowledgePurchases: false });
    } catch (err) {
      return this.failureOf(err);
    }
    const id = transaction?.transactionId;
    const jws = transaction?.jwsRepresentation;
    if (!id || !jws) return { status: 'failed', message: 'no signed transaction' };

    this.busy.add(id);
    let outcome: VerifyOutcome;
    try {
      outcome = await this.verifier.verify(gameId, jws);
    } catch {
      outcome = { status: 'retry' };
    } finally {
      this.busy.delete(id);
    }
    if (outcome.status === 'ok') return { status: 'paid', receipt: this.receiptFor(id) };
    if (outcome.status === 'retry') {
      // The money was taken; the payment stays unfinished and is handed over when the server answers (see recover()).
      this.retryLater();
      return { status: 'later' };
    }
    if (outcome.status === 'revoked') {
      await this.finish(id);
      return { status: 'failed', message: 'revoked' };
    }
    return { status: 'failed', message: outcome.reason };
  }

  /** What the plugin said when the purchase did not go through (it rejects with a message: "User cancelled", "Transaction pending" ...). */
  private failureOf(err: unknown): PaymentResult {
    const message = messageOf(err);
    if (/cancel/i.test(message)) return { status: 'cancelled' };
    if (/pending/i.test(message)) return { status: 'pending' };
    if (/cannot find product|product not found/i.test(message)) return { status: 'unavailable' };
    return { status: 'failed', message };
  }

  private receiptFor(transactionId: string): PaidReceipt {
    return { transactionId, finish: () => this.finish(transactionId) };
  }

  /** Tells the store the payment is done (after the goods are saved, and a moment later - see finishDelayMs). Never rejects. */
  private async finish(transactionId: string): Promise<void> {
    try {
      if (this.finishDelayMs > 0) await this.wait(this.finishDelayMs);
      await this.plugin.finishTransaction({ transactionId });
    } catch {
      // not finished: the store offers it again at the next launch, where the save already knows it (nothing is given twice) and it is finished
    }
  }

  // --- payments the store still has -------------------------------------------------

  /** One payment from the store (found unfinished, or announced): check it with the server, hand it over, finish it. Never rejects. */
  async handle(transaction: StoreTransaction): Promise<void> {
    const id = transaction?.transactionId;
    if (!id || this.busy.has(id)) return;
    const gameId = gameProductIdOf(transaction.productIdentifier);
    if (!gameId) return; // not one of ours
    this.busy.add(id);
    try {
      if (this.delivery.isDelivered(id)) {
        // handed over and saved before the app died: only the finish is left (the server is not needed)
        await this.finish(id);
        return;
      }
      const jws = transaction.jwsRepresentation;
      if (!jws) return;
      const outcome = await this.verifier.verify(gameId, jws);
      if (outcome.status === 'revoked') {
        await this.finish(id);
      } else if (outcome.status === 'retry') {
        this.retryLater();
      } else if (outcome.status === 'ok') {
        const result = this.delivery.deliver(gameId, id);
        if (result === 'delivered' || result === 'duplicate') {
          this.retryAttempt = 0;
          await this.finish(id);
        } else if (result === 'not_ready') {
          this.retryLater();
        }
        // 'unknown': a product this game cannot hand over: left unfinished (nothing is thrown away)
      }
    } catch {
      // left as it is: the store offers it again
    } finally {
      this.busy.delete(id);
    }
  }

  /** Picks up every payment the store still has unfinished. Never rejects. */
  async recover(): Promise<void> {
    let transactions: StoreTransaction[];
    try {
      transactions = (await this.plugin.getUnfinishedTransactions()).transactions ?? [];
    } catch {
      return;
    }
    for (const transaction of transactions) await this.handle(transaction);
  }

  /** After the server could not be reached: look again in a while, a few times (then at the next launch). */
  private retryLater(): void {
    if (this.retryScheduled || this.retryAttempt >= this.retryDelays.length) return;
    const delay = this.retryDelays[this.retryAttempt++];
    this.retryScheduled = true;
    this.schedule(() => {
      this.retryScheduled = false;
      void this.recover();
    }, delay);
  }

  // --- starting ----------------------------------------------------------------

  /**
   * The store's side of starting the game: listens for payments the store announces, then looks for unfinished ones and asks for the
   * prices. Call it WITHOUT await - the game must not wait for the store - and it never rejects; each step fails on its own.
   */
  async start(): Promise<void> {
    try {
      await this.plugin.addListener('transactionUpdated', (transaction) => void this.handle(transaction));
    } catch {
      // (without the listener an approval that comes later is found at the next launch instead)
    }
    try {
      // (the plugin must not finish payments by itself: capacitor.config.json says so too, which is what counts - it is read before the plugin listens)
      await this.plugin.configure?.({ autoFinishTransactions: false });
    } catch {
      // (an old plugin build without it)
    }
    await Promise.allSettled([this.loadPrices(), this.recover()]);
  }
}
