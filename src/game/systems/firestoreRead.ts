import type { Firestore } from 'firebase/firestore';
import { getFirebaseConfig } from './firebaseConfig';

/** Rejects with `timeout` if the promise does not settle in `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Resolves to `fallback` instead of waiting longer than `ms` (the work itself keeps going). Never rejects. */
export function waitAtMost<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export interface FirestoreHandle {
  fs: typeof import('firebase/firestore');
  db: Firestore;
}

/**
 * Opens Firestore for a public (no sign-in) read. The Firebase SDK is loaded on demand, like LeaderboardSystem does; the leaderboard
 * and the alliance start the same default app with the same settings, so it is shared when it is already there.
 * Callers check `isLeaderboardConfigured()` first.
 */
export async function openFirestore(): Promise<FirestoreHandle> {
  const [appMod, fs] = await Promise.all([import('firebase/app'), import('firebase/firestore')]);
  const app = appMod.getApps().length > 0 ? appMod.getApp() : appMod.initializeApp(getFirebaseConfig());
  return { fs, db: fs.getFirestore(app) };
}
