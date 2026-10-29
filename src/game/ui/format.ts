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
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}時間前`;
  return `${Math.floor(minutes / (60 * 24))}日前`;
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
  if (minutes >= 60 * 24) return `あと${Math.floor(minutes / (60 * 24))}日`;
  if (minutes >= 60) return `あと${Math.floor(minutes / 60)}時間`;
  return `あと${minutes}分`;
}

/** "3:07" - a run's length in minutes and seconds. */
export function formatSurvival(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
