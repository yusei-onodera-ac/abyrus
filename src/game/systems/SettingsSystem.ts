import { stripForbidden } from './ChatSystem';
import type { SaveData } from './SaveSystem';
import pkg from '../../../package.json';
import { defaultLanguageForNewSave, isLanguage, SOURCE_LANGUAGE, type Language, type PlainKey } from '../i18n';

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

export type VolumeKind = 'bgm' | 'se' | 'voice';
export type NotificationKind = 'news' | 'stamina' | 'social';

export interface SettingsState {
  /** '' while not registered. Nothing is verified until a server exists. */
  email: string;
  /** Handle without the @; '' while not linked. */
  twitter: string;
  audio: Record<VolumeKind, number>;
  notifications: Record<NotificationKind, boolean>;
  /** オート: a hero's skill is cast the moment its gauge is full (see AutoSkillToggle). */
  autoSkill: boolean;
  /** 2倍速 (プレミアムパス): run fights at double speed. Only has an effect while the pass is active. */
  speed2x: boolean;
  /** The language the game is shown in (see i18n/). A new save starts with the device's; a save from before this existed is Japanese. */
  language: Language;
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

/** What a report stores as its category: Japanese text by design (it is what the operator reads, and what is already saved in
 *  old reports). The player sees the *_LABELS below instead (same order): translate the label, never these. */
export const INQUIRY_CATEGORIES = ['ゲームの内容', 'お支払い・購入', 'アカウント', 'ご意見・ご要望', 'その他']; // i18n-ignore (stored value)
export const BUG_CATEGORIES = ['表示がおかしい', '操作できない・固まる', '数値・報酬が違う', '落ちる・動かない', 'その他']; // i18n-ignore (stored value)

export const INQUIRY_CATEGORY_LABELS: PlainKey[] = ['settings.inquiry.game', 'settings.inquiry.payment', 'settings.account', 'settings.inquiry.feedback', 'settings.other'];
export const BUG_CATEGORY_LABELS: PlainKey[] = ['settings.bug.display', 'settings.bug.freeze', 'settings.bug.values', 'settings.bug.crash', 'settings.other'];

export const NOTIFICATION_LABEL: Record<NotificationKind, PlainKey> = {
  news: 'settings.notify.news',
  stamina: 'settings.notify.stamina',
  social: 'settings.notify.social',
};

const VOLUME_DEFAULT = 7;

function clampVolume(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : VOLUME_DEFAULT;
  return Math.min(VOLUME_STEPS, Math.max(0, n));
}

/** A name that fits the plank: emoji and control characters dropped (as in chat: ChatSystem.stripForbidden), runs of
 *  spaces collapsed, trimmed, cut to PLAYER_NAME_MAX. '' if nothing usable is left. */
export function cleanPlayerName(raw: string): string {
  const text = stripForbidden(raw).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
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
      audio: { bgm: VOLUME_DEFAULT, se: VOLUME_DEFAULT, voice: VOLUME_DEFAULT },
      notifications: { news: true, stamina: true, social: true },
      autoSkill: false,
      speed2x: false,
      language: defaultLanguageForNewSave(),
    };
  },

  /** Keeps whatever a save holds that is well-formed, filling the rest with defaults. */
  restore(raw: Partial<SettingsState> | undefined): SettingsState {
    const fallback = this.createDefaultState();
    // (a save with no settings at all is an old one: its player has been playing in Japanese)
    if (!raw || typeof raw !== 'object') return { ...fallback, language: SOURCE_LANGUAGE };
    return {
      email: typeof raw.email === 'string' && isValidEmail(raw.email) ? raw.email : '',
      twitter: typeof raw.twitter === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(raw.twitter) ? raw.twitter : '',
      audio: { bgm: clampVolume(raw.audio?.bgm), se: clampVolume(raw.audio?.se), voice: clampVolume(raw.audio?.voice) },
      notifications: {
        news: raw.notifications?.news !== false,
        stamina: raw.notifications?.stamina !== false,
        social: raw.notifications?.social !== false,
      },
      autoSkill: raw.autoSkill === true,
      speed2x: raw.speed2x === true,
      language: isLanguage(raw.language) ? raw.language : SOURCE_LANGUAGE,
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

  getAutoSkill(save: SaveData): boolean {
    return save.settings.autoSkill;
  },

  setAutoSkill(save: SaveData, on: boolean): void {
    save.settings.autoSkill = on;
  },

  getSpeed2x(save: SaveData): boolean {
    return save.settings.speed2x;
  },

  setSpeed2x(save: SaveData, on: boolean): void {
    save.settings.speed2x = on;
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
