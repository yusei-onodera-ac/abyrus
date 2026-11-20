import { t } from '../i18n';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "11/7 11:59" - month/day unpadded, minutes padded. */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad2(d.getMinutes())}`;
}

/** "2026/10/28" */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** "3時間前", "2日前" - how long ago something happened. */
export function formatAgo(ms: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000);
  if (minutes < 1) return t('sys.time.justNow');
  if (minutes < 60) return t('sys.time.minutesAgo', { n: minutes });
  if (minutes < 60 * 24) return t('sys.time.hoursAgo', { n: Math.floor(minutes / 60) });
  return t('sys.time.daysAgo', { n: Math.floor(minutes / (60 * 24)) });
}

/** Chat timestamp: "14:05" today, "10/27 14:05" on an earlier day. */
export function formatChatTime(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const clock = `${d.getHours()}:${pad2(d.getMinutes())}`;
  const today = new Date(now);
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return sameDay ? clock : `${d.getMonth() + 1}/${d.getDate()} ${clock}`;
}

/** Time left until a deadline, in the largest sensible unit: "あと3日",
 *  "あと5時間", "あと40分". */
export function formatRemaining(msLeft: number): string {
  const minutes = Math.max(1, Math.floor(msLeft / 60_000));
  if (minutes >= 60 * 24) return t('sys.time.daysLeft', { n: Math.floor(minutes / (60 * 24)) });
  if (minutes >= 60) return t('sys.time.hoursLeft', { n: Math.floor(minutes / 60) });
  return t('sys.time.minutesLeft', { n: minutes });
}

/** "3:07" - a run's length in minutes and seconds. */
export function formatSurvival(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** How long a piece of work takes: "5分", "2時間", "1時間30分", "1日". */
export function formatSpan(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes >= 60 * 24) return t('sys.time.days', { n: Math.round(minutes / (60 * 24)) });
  if (minutes >= 60) {
    const rest = minutes % 60;
    return rest === 0 ? t('sys.time.hours', { n: minutes / 60 }) : t('sys.time.hoursMinutes', { h: Math.floor(minutes / 60), m: rest });
  }
  return t('sys.time.minutes', { n: minutes });
}

/** Like formatSpan but down to the second for short spans: "45秒", "1分15秒", "2分"; from an hour up it is formatSpan's. */
export function formatSpanExact(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s >= 3600) return formatSpan(s);
  if (s < 60) return t('sys.time.seconds', { n: s });
  return s % 60 === 0 ? t('sys.time.minutes', { n: s / 60 }) : t('sys.time.minutesSeconds', { m: Math.floor(s / 60), s: s % 60 });
}
