import { t } from '../i18n';
import { isLeaderboardConfigured } from './firebaseConfig';
import { openFirestore, withTimeout } from './firestoreRead';

/**
 * メンテナンス from the operator's admin (Firestore `config/maintenance`, written by abyrus-admin):
 *
 *   config/maintenance  { enabled: boolean, message: string }
 *
 * At launch the game asks once; while `enabled` is true it shows the メンテナンス screen (scenes/MaintenanceScene.ts) instead of Home.
 * It fails OPEN: nothing configured, offline, a timeout, a document that is missing or not the right shape = not in maintenance.
 * (The reverse would lock every player out whenever the network or the rules hiccup.) Nothing here ever throws.
 */

export const MAINTENANCE_MESSAGE_MAX = 300;
/** The built-in message, kept as Japanese: it is what `parseMaintenance` hands back when the operator wrote none (and what tests compare
 *  with). To SHOW a message, pass it through `maintenanceMessageText`, which gives this one in the player's language. */
export const DEFAULT_MAINTENANCE_MESSAGE = 'ただいまメンテナンス中です。\nしばらくしてから、もう一度お試しください。'; // i18n-ignore

/** The text to show for a state's message: the operator's own words as written, or (when it is the built-in default) the default message in the player's language. */
export function maintenanceMessageText(message: string): string {
  return message === DEFAULT_MAINTENANCE_MESSAGE ? t('social.maintenance.defaultMessage') : message;
}

export interface MaintenanceState {
  enabled: boolean;
  message: string;
}

export type MaintenanceFetcher = () => Promise<unknown>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The document's data → the state. `enabled` must be exactly `true` (the string "true", 1, … do not count). */
export function parseMaintenance(raw: unknown): MaintenanceState {
  if (!isObject(raw) || raw.enabled !== true) return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE };
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  return { enabled: true, message: message.length >= 1 && message.length <= MAINTENANCE_MESSAGE_MAX ? message : DEFAULT_MAINTENANCE_MESSAGE };
}

const FETCH_TIMEOUT_MS = 6000;

async function fetchFromFirestore(): Promise<unknown> {
  const { fs, db } = await openFirestore();
  const snap = await fs.getDoc(fs.doc(db, 'config', 'maintenance'));
  return snap.exists() ? snap.data() : null;
}

export const RemoteMaintenance = {
  /** Asks again each time it is called (the メンテナンス screen's 「もう一度確かめる」 needs a fresh answer). `fetcher` is for tests. */
  async check(fetcher?: MaintenanceFetcher): Promise<MaintenanceState> {
    if (!fetcher && !isLeaderboardConfigured()) return parseMaintenance(null);
    try {
      return parseMaintenance(await withTimeout((fetcher ?? fetchFromFirestore)(), FETCH_TIMEOUT_MS));
    } catch {
      return parseMaintenance(null);
    }
  },
};
