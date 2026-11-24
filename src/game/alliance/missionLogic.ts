/**
 * 同盟ミッションの、純粋な決まり (Local も Online も、同じものを使う。Phaser にもセーブにも依らない)。
 * 表は data/allianceMissions.ts。設計は docs/ALLIANCE_DESIGN.md の「同盟ミッション」。
 *
 * 掲示板 (MissionBoard) は、1期間 (1日 / 1週間) に1つ。Online では `alliances/{id}/missionTotals/{期間}` の文書と同じ形で、
 * Local ではセーブの中にある。目標 (goals) は、期間の初めに、メンバーの数から決めて、そのまま変えない。
 */
import type { MissionBoard, MissionBoardView, MissionGoal, MissionMetric, MissionScope } from './AllianceBackend';
import { MISSION_METRICS } from './AllianceBackend';
import { DAILY_GOAL_COUNT, DAILY_MISSIONS, MISSION_REPORT_MAX, WEEKLY_MISSIONS, getMissionDef, missionCap, type AllianceMissionDef } from '../data/allianceMissions';
import { hash32 } from '../data/alliance';
import { t as tl } from '../i18n';

const DAY_MS = 86_400_000;

/** 目標の数: メンバー1人あたり × 人数を、きりのよい数に切り上げる (小さな同盟でも、minTarget 以上)。 */
export function goalTarget(def: AllianceMissionDef, members: number): number {
  const x = def.perMember * Math.max(1, members);
  const step = x >= 1000 ? 100 : x >= 100 ? 10 : x >= 20 ? 5 : 1;
  return Math.max(def.minTarget, Math.ceil(x / step) * step);
}

/** 週の名前 ("2026-11-23": その週の月曜の日付。桁をそろえてもそろえなくてもよい) を、通し番号の週にする (週ごとに1つずつ増える)。 */
export function weekOrdinal(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y || 1970, (m || 1) - 1, d || 1) / (7 * DAY_MS));
}

/** その期間の目標。毎日: 表の中から、期間の名前で決まる 3件 (行動はかぶらない)。毎週: 表の中から、週ごとに順番に 1件。 */
export function pickGoals(scope: MissionScope, key: string, members: number): MissionGoal[] {
  const defs =
    scope === 'daily'
      ? [...DAILY_MISSIONS].sort((a, b) => hash32('allianceMission', key, a.id) - hash32('allianceMission', key, b.id) || a.id.localeCompare(b.id)).slice(0, DAILY_GOAL_COUNT)
      : [WEEKLY_MISSIONS[weekOrdinal(key) % WEEKLY_MISSIONS.length]];
  return defs.map((def) => ({ id: def.id, metric: def.metric, target: goalTarget(def, members) }));
}

export function newBoard(scope: MissionScope, key: string, members: number): MissionBoard {
  return { scope, key, members: Math.max(1, Math.floor(members)), goals: pickGoals(scope, key, members), progress: {}, by: {}, claims: {} };
}

/** 申告された数を、使える形にする (行動の名前が正しく、1以上の整数だけ。1回の申告の上限で切る)。 */
export function cleanReport(raw: Partial<Record<MissionMetric, number>>): Partial<Record<MissionMetric, number>> {
  const out: Partial<Record<MissionMetric, number>> = {};
  for (const metric of MISSION_METRICS) {
    const n = raw[metric];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) out[metric] = Math.min(MISSION_REPORT_MAX, Math.floor(n));
  }
  return out;
}

/** 1人の貢献を、1つの行動について足す (1人が1期間に足せる数の上限で切る)。実際に足せた数を返す。 */
export function bump(board: MissionBoard, memberKey: string, metric: MissionMetric, amount: number): number {
  const add = Math.min(MISSION_REPORT_MAX, Math.floor(amount));
  if (!(add >= 1)) return 0;
  const mine = (board.by[memberKey] ??= {});
  const room = Math.max(0, missionCap(metric, board.scope) - (mine[metric] ?? 0));
  const applied = Math.min(add, room);
  if (applied <= 0) return 0;
  mine[metric] = (mine[metric] ?? 0) + applied;
  board.progress[metric] = (board.progress[metric] ?? 0) + applied;
  return applied;
}

/** 申告された数を、掲示板に足す。実際に足せた数の合計。 */
export function applyReport(board: MissionBoard, memberKey: string, counts: Partial<Record<MissionMetric, number>>): number {
  let total = 0;
  for (const [metric, n] of Object.entries(cleanReport(counts)) as [MissionMetric, number][]) total += bump(board, memberKey, metric, n);
  return total;
}

export type ClaimCheck = { ok: true; def: AllianceMissionDef; goal: MissionGoal } | { ok: false; reason: 'no_such' | 'not_done' | 'share_low' | 'claimed'; need?: number };

/** その人が、そのミッションを、いま受け取れるか。 */
export function checkClaim(board: MissionBoard | null, memberKey: string, missionId: string): ClaimCheck {
  const goal = board?.goals.find((g) => g.id === missionId);
  const def = getMissionDef(missionId);
  if (!board || !goal || !def) return { ok: false, reason: 'no_such' };
  if (board.claims[memberKey]?.includes(missionId)) return { ok: false, reason: 'claimed' };
  if ((board.progress[goal.metric] ?? 0) < goal.target) return { ok: false, reason: 'not_done' };
  const mine = board.by[memberKey]?.[goal.metric] ?? 0;
  if (mine < def.minShare) return { ok: false, reason: 'share_low', need: def.minShare - mine };
  return { ok: true, def, goal };
}

export function markClaimed(board: MissionBoard, memberKey: string, missionId: string): void {
  const list = (board.claims[memberKey] ??= []);
  if (!list.includes(missionId)) list.push(missionId);
}

/** 画面に出す形。`names` は、メンバーの鍵 → 名前 (貢献の上位に出す)。まだ誰も足していない期間は、`newBoard` の、進み 0 の掲示板を渡す。 */
export function viewOfBoard(board: MissionBoard, memberKey: string, names: Record<string, string>, endsAt: number): MissionBoardView {
  const missions: MissionBoardView['missions'] = [];
  for (const goal of board.goals) {
    const def = getMissionDef(goal.id);
    if (!def) continue;
    const progress = board.progress[goal.metric] ?? 0;
    const mine = board.by[memberKey]?.[goal.metric] ?? 0;
    const ranked = Object.entries(board.by)
      .map(([key, counts]) => ({ key, count: counts[goal.metric] ?? 0 }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    const claimed = board.claims[memberKey]?.includes(goal.id) === true;
    const done = progress >= goal.target;
    missions.push({
      id: goal.id,
      metric: goal.metric,
      title: def.title,
      target: goal.target,
      progress,
      mine,
      myRank: mine > 0 ? 1 + ranked.filter((e) => e.count > mine).length : 0,
      minShare: def.minShare,
      top: ranked.slice(0, 3).map((e) => ({ name: names[e.key] ?? tl('alliance.say.leftMember'), count: e.count })),
      reward: { ...def.reward, ...(def.reward.items ? { items: { ...def.reward.items } } : {}) },
      done,
      claimed,
      claimable: done && !claimed && mine >= def.minShare,
    });
  }
  return { scope: board.scope, endsAt, missions };
}

/** 受け取れるミッションの数。 */
export function claimableCount(...views: MissionBoardView[]): number {
  return views.reduce((n, v) => n + v.missions.filter((m) => m.claimable).length, 0);
}
