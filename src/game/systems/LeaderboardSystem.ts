import { isLeaderboardConfigured, getFirebaseConfig } from './firebaseConfig';
import type { InfiniteModeRunResult } from './SaveSystem';
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  score: number;
  survivalSeconds: number;
  enemiesDefeated: number;
  difficultyReached: number;
}

export type LeaderboardSubmitResult =
  | { status: 'not_configured' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rank: number; isNewBest: boolean };

export type LeaderboardFetchResult<T> = { status: 'not_configured' } | { status: 'error'; message: string } | { status: 'ok'; data: T };

// One document per device (doc id == the anonymous auth uid). Security
// rules (see BACKEND_SETUP.md) enforce that a client can only create/update
// its own document and only with a sane, non-decreasing score - see there
// for the exact rule text.
const COLLECTION = 'infiniteModeScores';
const MAX_SCORE = 100_000_000;
const MAX_SURVIVAL_SECONDS = 86_400;
const MAX_ENEMIES_DEFEATED = 1_000_000;
const MAX_NAME_LENGTH = 24;

// The Firebase SDK (app + auth + firestore) is a few hundred KB and most
// players will never open the Event tab in a given session, so it's loaded
// on demand via dynamic import instead of sitting in the main bundle every
// other scene pays for too. Every exported method below is already async,
// so there's no behavior change - just a separate chunk fetched the first
// time any of them actually runs.
let sdkPromise: Promise<typeof import('firebase/firestore') & { _auth: typeof import('firebase/auth') }> | undefined;
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let signInPromise: Promise<User> | undefined;

async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]).then(([appMod, authMod, firestoreMod]) => {
      if (!app) {
        app = appMod.initializeApp(getFirebaseConfig());
        auth = authMod.getAuth(app);
        db = firestoreMod.getFirestore(app);
      }
      return { ...firestoreMod, _auth: authMod };
    });
  }
  return sdkPromise;
}

/** Anonymous auth gives every device a stable uid (persisted by the SDK
 *  across reloads) with no sign-up flow, which is exactly enough identity
 *  for "don't let a client overwrite another player's entry" - the
 *  security rules key off request.auth.uid. */
async function ensureSignedIn(): Promise<User> {
  const sdk = await loadSdk();
  const { _auth } = sdk;
  if (auth!.currentUser) return auth!.currentUser;
  if (!signInPromise) {
    signInPromise = new Promise<User>((resolve, reject) => {
      const unsubscribe = _auth.onAuthStateChanged(
        auth!,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user);
          }
        },
        (err) => {
          unsubscribe();
          reject(err);
        },
      );
      _auth.signInAnonymously(auth!).catch((err) => {
        unsubscribe();
        reject(err);
      });
    });
  }
  return signInPromise;
}

function clampName(name: string): string {
  const trimmed = name.trim() || 'プレイヤー';
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Thin client for the global Infinite Mode leaderboard. Every method checks
 * isLeaderboardConfigured() first and returns a `not_configured` result
 * without ever touching the network or loading the Firebase SDK when the
 * env vars aren't set - callers (InfiniteModeScene) use that to fall back
 * to the local personal best instead of blocking on or crashing from a
 * backend that was never set up. A runtime failure (offline, misconfigured
 * project) is reported the same way via `error`, never thrown.
 */
export const LeaderboardSystem = {
  isConfigured(): boolean {
    return isLeaderboardConfigured();
  },

  /** Writes this device's score only if it beats what's already stored for
   *  it (so retries/weaker runs never clobber a better one), then returns
   *  this device's resulting rank among all stored scores. */
  async submitScore(playerName: string, stats: InfiniteModeRunResult): Promise<LeaderboardSubmitResult> {
    if (!isLeaderboardConfigured()) return { status: 'not_configured' };
    try {
      const { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getCountFromServer } = await loadSdk();
      const user = await ensureSignedIn();
      const ref = doc(db!, COLLECTION, user.uid);
      const existingSnap = await getDoc(ref);
      const existingData = existingSnap.data();
      const existingScore = typeof existingData?.score === 'number' ? existingData.score : 0;
      const submittedScore = Math.min(MAX_SCORE, Math.max(0, Math.round(stats.score)));
      const isNewBest = submittedScore > existingScore;

      if (isNewBest) {
        await setDoc(ref, {
          playerName: clampName(playerName),
          score: submittedScore,
          survivalSeconds: Math.min(MAX_SURVIVAL_SECONDS, Math.max(0, Math.round(stats.survivalSeconds))),
          enemiesDefeated: Math.min(MAX_ENEMIES_DEFEATED, Math.max(0, Math.round(stats.enemiesDefeated))),
          difficultyReached: Math.max(0, Math.round(stats.difficultyReached * 10) / 10),
          updatedAt: serverTimestamp(),
        });
      }

      const bestScore = isNewBest ? submittedScore : existingScore;
      const rankQuery = query(collection(db!, COLLECTION), where('score', '>', bestScore));
      const countSnap = await getCountFromServer(rankQuery);
      return { status: 'ok', rank: countSnap.data().count + 1, isNewBest };
    } catch (err) {
      return { status: 'error', message: errorMessage(err) };
    }
  },

  async fetchTopScores(topN = 50): Promise<LeaderboardFetchResult<LeaderboardEntry[]>> {
    if (!isLeaderboardConfigured()) return { status: 'not_configured' };
    try {
      const { collection, query, orderBy, limit, getDocs } = await loadSdk();
      const topQuery = query(collection(db!, COLLECTION), orderBy('score', 'desc'), limit(topN));
      const snap = await getDocs(topQuery);
      const data: LeaderboardEntry[] = snap.docs.map((d) => {
        const v = d.data();
        return {
          playerId: d.id,
          playerName: typeof v.playerName === 'string' ? v.playerName : 'プレイヤー',
          score: typeof v.score === 'number' ? v.score : 0,
          survivalSeconds: typeof v.survivalSeconds === 'number' ? v.survivalSeconds : 0,
          enemiesDefeated: typeof v.enemiesDefeated === 'number' ? v.enemiesDefeated : 0,
          difficultyReached: typeof v.difficultyReached === 'number' ? v.difficultyReached : 0,
        };
      });
      return { status: 'ok', data };
    } catch (err) {
      return { status: 'error', message: errorMessage(err) };
    }
  },

  async fetchRankForScore(score: number): Promise<LeaderboardFetchResult<number>> {
    if (!isLeaderboardConfigured()) return { status: 'not_configured' };
    try {
      const { collection, query, where, getCountFromServer } = await loadSdk();
      const rankQuery = query(collection(db!, COLLECTION), where('score', '>', score));
      const countSnap = await getCountFromServer(rankQuery);
      return { status: 'ok', data: countSnap.data().count + 1 };
    } catch (err) {
      return { status: 'error', message: errorMessage(err) };
    }
  },
};
