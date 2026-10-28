/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Firebase Web SDK config for the Infinite Mode global leaderboard.
   *  See BACKEND_SETUP.md. All six must be set (and non-placeholder) for
   *  LeaderboardSystem to treat the backend as configured; otherwise the
   *  game falls back to a local-only personal best. */
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
