export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): FirebaseWebConfig {
  const env = import.meta.env;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  };
}

// Catches the most common "copied .env.example without filling it in"
// mistake so an unfilled placeholder is treated the same as a blank value,
// rather than being passed to the Firebase SDK and failing at network time.
const PLACEHOLDER_MARKERS = ['your-', 'xxxx', 'changeme', 'replace-me'];

function looksConfigured(value: string): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return !PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

let cachedConfigured: boolean | undefined;

/**
 * True once every Firebase env var is present and doesn't look like a
 * copy-pasted placeholder. Every call into LeaderboardSystem checks this
 * first and short-circuits before touching the Firebase SDK, so running
 * without a backend configured never attempts (and fails) a network call -
 * it behaves as a clean, synchronous "not configured" instead.
 */
export function isLeaderboardConfigured(): boolean {
  if (cachedConfigured === undefined) {
    cachedConfigured = Object.values(readConfig()).every(looksConfigured);
  }
  return cachedConfigured;
}

export function getFirebaseConfig(): FirebaseWebConfig {
  return readConfig();
}
