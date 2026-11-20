import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { getFirebaseConfig, isLeaderboardConfigured } from './firebaseConfig';
import { withTimeout } from './firestoreRead';
import { TransportError, createMemoryTransport, type TransferDoc, type TransferTransport } from './TransferSystem';

/**
 * データ引き継ぎの、サーバー側の入り口: Firestore の `transfers/{コード}` (ルールは firestore.rules)。
 *   get    ... サインインしていれば (匿名でよい) 誰でも、コードを知っていれば、1件だけ。一覧はできない。
 *   create ... 自分の uid を ownerUid にして、決まった形のものだけ。
 *   delete ... 持ち主の uid だけ。
 * Firebase SDK は、使うときに動的 import する (ランキング・同盟と同じ。設定がなければ、一度も読み込まない)。
 */

const COLLECTION = 'transfers';
const TIMEOUT_MS = 25_000;

interface Handle {
  fs: typeof import('firebase/firestore');
  authMod: typeof import('firebase/auth');
  db: Firestore;
  auth: Auth;
}

let handle: Promise<Handle> | undefined;

function open(): Promise<Handle> {
  if (!handle) {
    handle = Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
      .then(([appMod, authMod, fs]) => {
        // ランキング・同盟が先に初期化していれば、それを使う。
        const app = appMod.getApps().length > 0 ? appMod.getApp() : appMod.initializeApp(getFirebaseConfig());
        return { fs, authMod, db: fs.getFirestore(app), auth: authMod.getAuth(app) };
      })
      .catch((err) => {
        handle = undefined;
        throw err;
      });
  }
  return handle;
}

function toTransportError(err: unknown): TransportError {
  if (err instanceof TransportError) return err;
  const code = (err as { code?: string } | null)?.code ?? '';
  const text = err instanceof Error ? err.message : String(err);
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return new TransportError('denied', text);
  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code.includes('network') || /timeout|network|offline|Failed to fetch/i.test(text)) return new TransportError('offline', text);
  return new TransportError('error', text);
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await withTimeout(work(), TIMEOUT_MS);
  } catch (err) {
    throw toTransportError(err);
  }
}

function toMillis(value: unknown): number {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : typeof value === 'number' ? value : 0;
}

const FIELDS = ['version', 'kdf', 'iterations', 'salt', 'iv', 'compression', 'ciphertext', 'size', 'ownerUid'] as const;

function createFirestoreTransport(): TransferTransport {
  return {
    uid: () =>
      guard(async () => {
        const { auth, authMod } = await open();
        await auth.authStateReady();
        return auth.currentUser?.uid ?? (await authMod.signInAnonymously(auth)).user.uid;
      }),
    put: (code, doc) =>
      guard(async () => {
        const { fs, db } = await open();
        const data: Record<string, unknown> = { savedAt: fs.serverTimestamp() };
        for (const field of FIELDS) data[field] = doc[field];
        await fs.setDoc(fs.doc(db, COLLECTION, code), data);
      }),
    get: (code) =>
      guard(async () => {
        const { fs, db, auth, authMod } = await open();
        // サインインしてから読む (ルールが、サインイン済みの人だけに読ませる)。
        await auth.authStateReady();
        if (!auth.currentUser) await authMod.signInAnonymously(auth);
        const snap = await fs.getDoc(fs.doc(db, COLLECTION, code));
        if (!snap.exists()) return null;
        const d = snap.data();
        return { ...d, savedAt: toMillis(d.savedAt) } as TransferDoc;
      }),
    remove: (code) =>
      guard(async () => {
        const { fs, db } = await open();
        await fs.deleteDoc(fs.doc(db, COLLECTION, code));
      }),
  };
}

/** 開発用 (`npm run dev` のときだけ、アドレスに `?transferdev`): サーバーのかわりに、このブラウザの localStorage に置く。画面の流れを、本物のサーバーなしで試せる。 */
function createDevTransport(): TransferTransport {
  const KEY = 'abyrus_dev_transfers';
  let store = new Map<string, TransferDoc>();
  try {
    store = new Map(Object.entries(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, TransferDoc>));
  } catch {
    store = new Map();
  }
  const inner = createMemoryTransport('dev-uid', store);
  const keep = (): void => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(store)));
    } catch {
      // 残せなくても、この画面の間は、使える。
    }
  };
  // 本物のサーバーのように、少し待たせる。
  const slow = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => setTimeout(() => work.then(resolve, reject), 700));
  return {
    uid: () => inner.uid(),
    put: (code, doc) => slow(inner.put(code, doc).then(keep)),
    get: (code) => slow(inner.get(code)),
    remove: (code) => slow(inner.remove(code).then(keep)),
  };
}

let transport: TransferTransport | null | undefined;

/** いま使う窓口。Firebase の設定がなければ null (画面は「使えません」と出す)。 */
export function getTransferTransport(): TransferTransport | null {
  if (transport === undefined) {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('transferdev')) transport = createDevTransport();
    else transport = isLeaderboardConfigured() ? createFirestoreTransport() : null;
  }
  return transport;
}

/** 画面が「使える」と出してよいか。 */
export function isTransferAvailable(): boolean {
  return getTransferTransport() !== null;
}
