/**
 * 同盟のオンライン側で使う、時刻・数値の決まり（純粋な関数と表）。OnlineAllianceBackend と、functions/src/constants.ts（サーバー側の写し）が、同じ値を持つ。
 * 値を変えたら、両方を直す（`docs/ALLIANCE_SERVER.md` の「値の同期」）。
 *
 * 注: fork L の `data/alliance.ts` が、ローカル側の同じ表を持つ。重なる値（EXP曲線・恩恵・寄付・報酬）は、最終的に1か所にまとめる。
 * それまで、ここは docs/ALLIANCE_DESIGN.md の数字をそのまま写してある。
 */
import type { AllianceReward, AlliancePerks, DonationKind, League, RaidBossDef } from './AllianceBackend';

// ---------------------------------------------------------------------------------------------- 時刻

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 日本時間 (UTC+9)。 */
const JST = 9 * HOUR;
/** 1日は、日本時間の 4:00 に切り替わる (= UTC に 5 時間足した暦)。 */
const DAY_SHIFT = 5 * HOUR;

const pad = (n: number): string => String(n);

/** 4:00 区切りの日付 ("2026-11-11"。月日は桁をそろえない。Firestore ルールの dayKey() と同じ形)。 */
export function dayKey(ms: number): string {
  const d = new Date(ms + DAY_SHIFT);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 今週の始まり (月曜 0:00 JST) のミリ秒。 */
export function weekStartMs(ms: number): number {
  const t = ms + JST;
  const day = Math.floor(t / DAY); // 1970-01-01 (木) からの日数 (JST の暦)
  const sinceMonday = (day + 3) % 7; // 月曜 = 0
  return (day - sinceMonday) * DAY - JST;
}

/** 今週の終わり (日曜 23:59:59.999 JST) のミリ秒。 */
export function weekEndMs(ms: number): number {
  return weekStartMs(ms) + 7 * DAY - 1;
}

/** 週のID ("2026-W46")。日本時間の ISO 週番号。ボスと対抗戦シーズンのIDも、これ。 */
export function weekId(ms: number): string {
  const monday = weekStartMs(ms) + JST;
  const thursday = new Date(monday + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const dayOfYear = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 通し番号の週 (ボスの順番を回すのに使う。2026-01-05 (月) の週 = 0)。 */
export function weekIndex(ms: number): number {
  const base = Date.UTC(2026, 0, 5) - JST;
  return Math.floor((weekStartMs(ms) - base) / (7 * DAY));
}

// ---------------------------------------------------------------------------------------------- 同盟Lv・恩恵

export const MAX_ALLIANCE_LEVEL = 10;

/** 次のLvまでに必要なEXP (最大Lvなら null)。`1000 * 1.6^(Lv-1)` を、四捨五入。 */
export function expToNext(level: number): number | null {
  if (level >= MAX_ALLIANCE_LEVEL) return null;
  return Math.round(1000 * Math.pow(1.6, Math.max(1, level) - 1));
}

/** 同盟Lvごとの恩恵 (docs/ALLIANCE_DESIGN.md の表)。 */
export function perksForLevel(level: number): AlliancePerks {
  const l = Math.max(1, Math.min(MAX_ALLIANCE_LEVEL, Math.floor(level)));
  const idle = [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.2][l - 1];
  const expDrop = [0, 0, 0.03, 0.03, 0.06, 0.06, 0.09, 0.09, 0.12, 0.15][l - 1];
  const stamina = [0, 0, 0, 5, 5, 10, 10, 15, 15, 20][l - 1];
  const attempts = l >= 8 ? 5 : l >= 5 ? 4 : 3;
  const memberMax = l >= 10 ? 30 : l >= 5 ? 25 : 20;
  return { idleGoldBonus: idle, expDropBonus: expDrop, staminaMaxBonus: stamina, raidAttemptsPerDay: attempts, memberMax };
}

/** 同盟にEXPを足す (繰り越しあり)。上がった場合は、新しい level を返す。 */
export function addAllianceExp(level: number, exp: number, add: number): { level: number; exp: number; levelUp: number | null } {
  let l = level;
  let e = exp + add;
  for (;;) {
    const need = expToNext(l);
    if (need === null) {
      e = 0;
      break;
    }
    if (e < need) break;
    e -= need;
    l += 1;
  }
  return { level: l, exp: e, levelUp: l > level ? l : null };
}

// ---------------------------------------------------------------------------------------------- 寄付

export const DONATION: Record<DonationKind, { allianceExp: number; contribution: number; perDay: number }> = {
  gold: { allianceExp: 100, contribution: 10, perDay: 5 },
  materials: { allianceExp: 120, contribution: 12, perDay: 5 },
  gems: { allianceExp: 300, contribution: 30, perDay: 3 },
};
/** 1日の寄付の合計回数 (ルールの `total` の上限)。 */
export const DONATION_PER_DAY_TOTAL = DONATION.gold.perDay + DONATION.materials.perDay + DONATION.gems.perDay;
/** 1回の寄付で、同盟EXPが増える最大 (ルールの境界)。 */
export const DONATION_MAX_EXP = 300;
/** 1回の書き込みで増える、同盟ポイント・貢献・コインの最大 (ルールの境界)。 */
export const WRITE_MAX_POINTS = 30;
export const WRITE_MAX_COINS = 100;

// ---------------------------------------------------------------------------------------------- 共闘ボス

export const RAID = {
  /** 1回の戦闘 (ミリ秒)。 */
  durationMs: 60_000,
  /** 切符の有効期限。 */
  ticketTtlMs: 10 * 60_000,
  /** 戦闘が終わるのを待つ最短 (これより早い提出は、断る)。 */
  minElapsedMs: 40_000,
  /** 1回で入るダメージの上限 = 総合力 × これ。 */
  powerCoef: 80,
  /** 1回で入るダメージの上限 = ボスの最大HP × これ (どんな申告でも、ここで頭打ち)。 */
  maxShareOfHp: 0.05,
};

/** 切符に刻む、1回のダメージの上限。 */
export function raidMaxDamage(power: number, bossMaxHp: number): number {
  const byPower = Math.max(0, power) * RAID.powerCoef;
  const byShare = Math.max(0, bossMaxHp) * RAID.maxShareOfHp;
  return Math.max(0, Math.min(byPower, byShare));
}

/** 週のボスのHP: 同盟の総合力に比例させ、同盟Lvが高いほど強くする。 */
export function raidBossHp(totalPower: number, allianceLevel: number, attemptsPerDay: number): number {
  const base = Math.max(1_000_000, totalPower) * 30 * attemptsPerDay * 4;
  return Math.round(base * (1 + 0.15 * (Math.max(1, allianceLevel) - 1)));
}

/** ダメージ → 同盟ポイント (対数に近いスケール。1e4 で 1点、1e8 で約13点、1e20 で約 40点)。 */
export function raidPoints(damage: number): number {
  if (!(damage > 0)) return 0;
  return Math.max(0, Math.round(Math.log10(Math.max(1, damage / 10_000) + 1) * 10));
}

/** 週ごとに回すボス (5体)。サーバーが、週の頭に raid ドキュメントへ、この定義ごと書く。 */
export const RAID_BOSSES: RaidBossDef[] = [
  { id: 'garumudo', name: '紅角の大鹿・ガルムード', art: 'garumudo', heroClass: 'tank', description: '燃える角で、突っ込んでくる大鹿。' },
  { id: 'arachnea', name: '砂塵の女王蠍・アラクネア', art: 'arachnea', heroClass: 'archer', description: '砂を巻き上げる、毒針の女王。' },
  { id: 'kongo', name: '白銀の山王虎・コンゴウ', art: 'kongo', heroClass: 'warrior', description: '鎖を引きずる、雪山の王。' },
  { id: 'necrodraco', name: '古骨の竜・ネクロドラコ', art: 'necrodraco', heroClass: 'mage', description: 'よみがえった、骨の竜。' },
  { id: 'kurogane', name: '闇走りの大狼・クロガネ', art: 'wolf', heroClass: 'warrior', description: '夜を駆ける、黒鉄の狼。' },
];

export function raidBossFor(ms: number): RaidBossDef {
  const i = ((weekIndex(ms) % RAID_BOSSES.length) + RAID_BOSSES.length) % RAID_BOSSES.length;
  return RAID_BOSSES[i];
}

/** 撃破・参加の報酬 (仮の数字)。rank は、ダメージの順位 (1〜)。 */
export function raidReward(defeated: boolean, rank: number): { label: string; reward: AllianceReward } {
  if (!defeated) return { label: '参加報酬', reward: { gems: 10, coins: 15 } };
  const extra = rank === 1 ? 50 : rank === 2 ? 30 : rank === 3 ? 20 : 0;
  const reward: AllianceReward = { gems: 30 + extra, phaseMaterials: 2, coins: 50 + extra };
  return { label: rank <= 3 ? `撃破報酬（ダメージ${rank}位）` : '撃破報酬', reward };
}

// ---------------------------------------------------------------------------------------------- 対抗戦

export const WAR = {
  groupSize: 20,
  /** リーグ内の上位 / 下位の、昇格・降格の数。 */
  promote: 3,
  demote: 3,
  /** メインステージ1つの初クリア = 20ポイント / 助っ人を貸した = 5ポイント。 */
  stagePoints: 20,
  helperPoints: 5,
  /** 1日に、ステージで入るポイントの上限 (ルールの境界)。 */
  stagePointsPerDay: 200,
};

export const WAR_REWARD_TIERS: { fromRank: number; toRank: number; label: string; reward: AllianceReward }[] = [
  { fromRank: 1, toRank: 1, label: '1位', reward: { gems: 300, coins: 200, badge: 'war_champion' } },
  { fromRank: 2, toRank: 3, label: '2〜3位', reward: { gems: 200, coins: 150 } },
  { fromRank: 4, toRank: 10, label: '4〜10位', reward: { gems: 100, coins: 80 } },
  { fromRank: 11, toRank: 20, label: '11〜20位', reward: { gems: 50, coins: 40 } },
];

export function warRewardForRank(rank: number): { label: string; reward: AllianceReward } {
  const tier = WAR_REWARD_TIERS.find((t) => rank >= t.fromRank && rank <= t.toRank) ?? WAR_REWARD_TIERS[WAR_REWARD_TIERS.length - 1];
  return { label: `対抗戦 ${rank}位の報酬`, reward: tier.reward };
}

export function nextLeague(league: League, rank: number, groupSize: number): { league: League; promoted: boolean; demoted: boolean } {
  const order: League[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const i = order.indexOf(league);
  // 小さなグループ (6組未満) では、昇降格しない (全員が上位 / 下位になってしまう)。
  if (groupSize >= WAR.promote + WAR.demote) {
    if (rank <= WAR.promote && i < order.length - 1) return { league: order[i + 1], promoted: true, demoted: false };
    if (rank > groupSize - WAR.demote && i > 0) return { league: order[i - 1], promoted: false, demoted: true };
  }
  return { league, promoted: false, demoted: false };
}

// ---------------------------------------------------------------------------------------------- 支援・助っ人

export const SUPPORT = {
  staminaAmount: 10,
  sendPerDay: 5,
  receivePerDay: 10,
  lendCoins: 5,
  lendRewardPerDay: 3,
  answersPerDay: 5,
  answerContribution: 5,
};

/** 抜けてから、別の同盟に入れるまで。 */
export const REJOIN_COOLDOWN_MS = 24 * HOUR;
/** リーダーが、これだけログインしないと、自動で譲られる。 */
export const LEADER_IDLE_MS = 7 * DAY;
export const MAX_PENDING_REQUESTS_OUT = 3;
export const PROFILE_SYNC_MS = 10 * 60_000;
