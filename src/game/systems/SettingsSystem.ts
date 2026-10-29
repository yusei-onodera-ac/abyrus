import type { SaveData } from './SaveSystem';
import pkg from '../../../package.json';

export const APP_VERSION: string = pkg.version;

/** The top bar's name plank holds about this many characters. */
export const PLAYER_NAME_MAX = 8;
export const EMAIL_MAX = 254;
export const TWITTER_MAX = 15;
/** Volume is kept as a whole number of steps, 0 (off) to VOLUME_STEPS (full). */
export const VOLUME_STEPS = 10;
export const REPORT_MAX = 500;
/** Reports waiting to be sent (there is no server yet); the oldest drops first. */
export const MAX_QUEUED_REPORTS = 20;

export type VolumeKind = 'bgm' | 'se';
export type NotificationKind = 'news' | 'stamina' | 'social';

export interface SettingsState {
  /** '' while not registered. Nothing is verified until a server exists. */
  email: string;
  /** Handle without the @; '' while not linked. */
  twitter: string;
  audio: Record<VolumeKind, number>;
  notifications: Record<NotificationKind, boolean>;
}

export type ReportKind = 'inquiry' | 'bug';

/** An お問い合わせ or バグ報告 the player wrote. Kept on the device until a
 *  server can take it (`sent` stays false until then). */
export interface Report {
  id: string;
  kind: ReportKind;
  category: string;
  body: string;
  createdAt: number;
  /** Version, device and screen size, so a bug report arrives with its context. */
  environment: string;
  sent: boolean;
}

export const INQUIRY_CATEGORIES = ['ゲームの内容', 'お支払い・購入', 'アカウント', 'ご意見・ご要望', 'その他'];
export const BUG_CATEGORIES = ['表示がおかしい', '操作できない・固まる', '数値・報酬が違う', '落ちる・動かない', 'その他'];

export const NOTIFICATION_LABEL: Record<NotificationKind, string> = {
  news: 'お知らせ・イベント',
  stamina: 'スタミナ回復',
  social: 'フレンド・メッセージ',
};

const VOLUME_DEFAULT = 7;

function clampVolume(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : VOLUME_DEFAULT;
  return Math.min(VOLUME_STEPS, Math.max(0, n));
}

/** A name that fits the plank: control characters dropped, runs of spaces
 *  collapsed, trimmed, cut to PLAYER_NAME_MAX. '' if nothing usable is left. */
export function cleanPlayerName(raw: string): string {
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, PLAYER_NAME_MAX).join('').trim();
}

export function isValidEmail(text: string): boolean {
  return text.length <= EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text);
}

/** "sample@example.com" -> "sa***@example.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** The bare handle from "@name", "name" or a profile link like
 *  https://x.com/name - or null if it isn't a valid handle. */
export function parseTwitterHandle(text: string): string | null {
  const trimmed = text.trim();
  const fromLink = /(?:twitter|x)\.com\/@?([A-Za-z0-9_]+)/i.exec(trimmed);
  const handle = (fromLink ? fromLink[1] : trimmed).replace(/^@/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

export const SettingsSystem = {
  createDefaultState(): SettingsState {
    return {
      email: '',
      twitter: '',
      audio: { bgm: VOLUME_DEFAULT, se: VOLUME_DEFAULT },
      notifications: { news: true, stamina: true, social: true },
    };
  },

  /** Keeps whatever a save holds that is well-formed, filling the rest with defaults. */
  restore(raw: Partial<SettingsState> | undefined): SettingsState {
    const fallback = this.createDefaultState();
    if (!raw || typeof raw !== 'object') return fallback;
    return {
      email: typeof raw.email === 'string' && isValidEmail(raw.email) ? raw.email : '',
      twitter: typeof raw.twitter === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(raw.twitter) ? raw.twitter : '',
      audio: { bgm: clampVolume(raw.audio?.bgm), se: clampVolume(raw.audio?.se) },
      notifications: {
        news: raw.notifications?.news !== false,
        stamina: raw.notifications?.stamina !== false,
        social: raw.notifications?.social !== false,
      },
    };
  },

  restoreReports(raw: unknown): Report[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is Report => !!r && typeof r.id === 'string' && typeof r.body === 'string' && (r.kind === 'inquiry' || r.kind === 'bug'))
      .slice(-MAX_QUEUED_REPORTS);
  },

  /** 0..1, for the audio code to multiply into what it plays. */
  getVolume(save: SaveData, kind: VolumeKind): number {
    return save.settings.audio[kind] / VOLUME_STEPS;
  },

  setVolume(save: SaveData, kind: VolumeKind, steps: number): void {
    save.settings.audio[kind] = clampVolume(steps);
  },

  /** What a bug report carries along: version, device, screen, player ID. */
  describeEnvironment(save: SaveData): string {
    const ua = typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
    const screen = typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`;
    return `v${APP_VERSION} / ${screen} / ID:${save.social.playerId} / ${ua}`;
  },

  /** Queues a report. Null if there is nothing to send. */
  fileReport(save: SaveData, kind: ReportKind, category: string, body: string, now = Date.now()): Report | null {
    const text = body.trim().slice(0, REPORT_MAX);
    if (!text) return null;
    const report: Report = {
      id: `report-${now}-${Math.floor(Math.random() * 1e6)}`,
      kind,
      category,
      body: text,
      createdAt: now,
      environment: this.describeEnvironment(save),
      sent: false,
    };
    save.reports = [...save.reports, report].slice(-MAX_QUEUED_REPORTS);
    return report;
  },

  unsentReports(save: SaveData, kind: ReportKind): number {
    return save.reports.filter((r) => r.kind === kind && !r.sent).length;
  },
};
