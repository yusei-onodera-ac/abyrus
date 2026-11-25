import type { AllianceReward, MissionMetric, MissionScope } from '../alliance/AllianceBackend';
import type { PlainKey } from '../i18n';
import type { MissionKey } from './missions';
import type { SaveData } from '../systems/SaveSystem';

/**
 * 同盟ミッション: 毎日の目標 3件と、毎週の大きな目標 1件。メンバー全員の行動が足されて、同盟の進み具合になる。
 * ここの表だけを直せば、中身とバランスが変わる (数字は仮のバランス)。設計は docs/ALLIANCE_DESIGN.md の「同盟ミッション」。
 * Phaser にも画面にも依らない。
 *
 * - 目標の数 = max(minTarget, 切り上げ(perMember × 期間の初めのメンバー数))。「同盟の4割ほどが、ふつうに遊んだ日」に届く量。
 * - 1日は 4:00 区切り (ほかの1日ごとの数と同じ)。1週間は月曜 0:00 区切り。
 * - 受け取れるのは、同盟が達成して、自分の貢献が minShare 以上のとき。1人1回。期間を過ぎると、受け取れなくなる。
 * - 報酬の `coins` (同盟コイン) は、1回の受け取りで 100 まで (Online のルールの、1回の書き込みの上限)。
 */

export interface AllianceMissionDef {
  id: string;
  scope: MissionScope;
  metric: MissionMetric;
  /** 画面の見出し (数は、進み具合の棒で見せる)。 */
  title: PlainKey;
  /** メンバー1人あたりの目標。 */
  perMember: number;
  /** どんなに小さな同盟でも、これ以上。 */
  minTarget: number;
  /** 受け取るために必要な、自分の貢献。 */
  minShare: number;
  reward: AllianceReward;
}

/** 毎日: この中から、日ごとに 3件 (行動はかぶらない)。 */
export const DAILY_GOAL_COUNT = 3;

export const DAILY_MISSIONS: AllianceMissionDef[] = [
  { id: 'd_stage', scope: 'daily', metric: 'stage', title: 'alliance.mission.def.dStage', perMember: 6, minTarget: 10, minShare: 3, reward: { coins: 25, items: { exp_m: 3 } } },
  { id: 'd_gacha', scope: 'daily', metric: 'gacha', title: 'alliance.mission.def.dGacha', perMember: 2, minTarget: 3, minShare: 1, reward: { coins: 25, gems: 10 } },
  { id: 'd_donate', scope: 'daily', metric: 'donate', title: 'alliance.mission.def.dDonate', perMember: 1.5, minTarget: 3, minShare: 1, reward: { coins: 25, goldHours: 1 } },
  { id: 'd_stamina', scope: 'daily', metric: 'stamina', title: 'alliance.mission.def.dStamina', perMember: 80, minTarget: 100, minShare: 20, reward: { coins: 25, items: { equip_essence: 60 } } },
  { id: 'd_enhance', scope: 'daily', metric: 'enhance', title: 'alliance.mission.def.dEnhance', perMember: 3, minTarget: 3, minShare: 1, reward: { coins: 25, items: { exp_s: 30 } } },
  { id: 'd_idle', scope: 'daily', metric: 'idle', title: 'alliance.mission.def.dIdle', perMember: 0.7, minTarget: 2, minShare: 1, reward: { coins: 25, gems: 10 } },
];

/** 毎週: 週ごとに、この中から 1件 (順番に回る)。報酬は、毎日のものより大きい。 */
export const WEEKLY_MISSIONS: AllianceMissionDef[] = [
  { id: 'w_stage', scope: 'weekly', metric: 'stage', title: 'alliance.mission.def.wStage', perMember: 40, minTarget: 60, minShare: 10, reward: { coins: 100, gems: 60, phaseMaterials: 1 } },
  { id: 'w_donate', scope: 'weekly', metric: 'donate', title: 'alliance.mission.def.wDonate', perMember: 10, minTarget: 15, minShare: 3, reward: { coins: 100, gems: 60, phaseMaterials: 1 } },
  { id: 'w_raid', scope: 'weekly', metric: 'raid', title: 'alliance.mission.def.wRaid', perMember: 6, minTarget: 4, minShare: 1, reward: { coins: 100, gems: 60, phaseMaterials: 1 } },
  { id: 'w_gacha', scope: 'weekly', metric: 'gacha', title: 'alliance.mission.def.wGacha', perMember: 12, minTarget: 15, minShare: 3, reward: { coins: 100, gems: 60, phaseMaterials: 1 } },
  { id: 'w_stamina', scope: 'weekly', metric: 'stamina', title: 'alliance.mission.def.wStamina', perMember: 500, minTarget: 600, minShare: 100, reward: { coins: 100, gems: 60, phaseMaterials: 1 } },
];

export const ALL_MISSIONS: AllianceMissionDef[] = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];

export function getMissionDef(id: string): AllianceMissionDef | undefined {
  return ALL_MISSIONS.find((m) => m.id === id);
}

/** 1人が、1期間 (1日 / 1週間) に足せる、行動ごとの上限。ふつうの遊びでは届かない大きさで、改造した申告の頭打ちに使う (Online のルールと同じ数)。 */
export const MISSION_DAILY_CAP: Record<MissionMetric, number> = { stage: 300, gacha: 300, donate: 13, raid: 5, stamina: 1000, idle: 10, enhance: 200, helper: 20 };
/** 1週間の上限は、1日の上限の 7倍。 */
export const MISSION_WEEKLY_CAP_FACTOR = 7;
export function missionCap(metric: MissionMetric, scope: MissionScope): number {
  return MISSION_DAILY_CAP[metric] * (scope === 'weekly' ? MISSION_WEEKLY_CAP_FACTOR : 1);
}
/** 1回の `reportMissions` で足せる、行動ごとの数の上限。 */
export const MISSION_REPORT_MAX = 999;

/** ふつうの個人ミッション (data/missions.ts) の行動のうち、同盟ミッションにも数えるもの。(寄付・共闘ボス・助っ人は、AllianceService が数える) */
export const MISSION_METRIC_OF_KEY: Partial<Record<MissionKey, MissionMetric>> = {
  quest_clear: 'stage',
  gacha_pull: 'gacha',
  stamina: 'stamina',
  idle_claim: 'idle',
  hero_enhance: 'enhance',
  equip_enhance: 'enhance',
};

/** 疑似メンバー (Local) が、活発さ 1 のとき、1日に足す数の目安 (疑似メンバーの活発さは、平均 0.6。目標の 75% ほどが、疑似メンバーだけで進む量)。
 *  寄付と共闘ボスは、疑似メンバーの本当の寄付・挑戦が数えられる (ここの数は、世界を作ったときの、途中までの進み具合にだけ使う)。 */
export const MISSION_SIM_PER_DAY: Record<MissionMetric, number> = { stage: 7, gacha: 2.4, donate: 1.4, raid: 1.5, stamina: 95, idle: 0.85, enhance: 3.6, helper: 0.4 };

/** 同盟に入っているプレイヤーの行動を、同盟ミッションに送る分として、セーブに貯める (入っていなければ、何もしない)。送るのは AllianceService.flushMissions。 */
export function addAllianceMissionPending(save: Pick<SaveData, 'alliance'>, metric: MissionMetric, amount: number): void {
  if (!save.alliance?.allianceId || !(amount >= 1)) return;
  const pending = save.alliance.missionPending;
  pending[metric] = Math.min(99_999, (pending[metric] ?? 0) + Math.floor(amount));
}
