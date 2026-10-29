/**
 * Where rewarded ads come from. No ad network is connected yet (a shipped game
 * would use AdMob or similar), so the game only talks to this interface;
 * plugging the real thing in is `AdSystem.setGateway(...)`, nothing else changes.
 *
 * Until then a dev build (`npm run dev`) uses the TEST gateway, which "plays" an
 * ad after a moment so the flow can be tried; a production build uses the
 * UNAVAILABLE gateway, which never rewards anything.
 */
export type AdResult =
  /** The whole ad was watched: the reward is due. */
  | 'watched'
  /** No ad service is connected, or none could be loaded. */
  | 'unavailable'
  /** The player closed it early. */
  | 'cancelled';

export interface AdGateway {
  /** True when no real ad is shown (the screen says so). */
  readonly isTest: boolean;
  showRewardedAd(): Promise<AdResult>;
}

const testGateway: AdGateway = {
  isTest: true,
  showRewardedAd: () => new Promise((resolve) => setTimeout(() => resolve('watched'), 1500)),
};

const unavailableGateway: AdGateway = {
  isTest: false,
  showRewardedAd: () => Promise.resolve('unavailable'),
};

let current: AdGateway = import.meta.env.DEV ? testGateway : unavailableGateway;

export const AdSystem = {
  getGateway(): AdGateway {
    return current;
  },

  setGateway(gateway: AdGateway): void {
    current = gateway;
  },
};
