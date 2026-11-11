import type {
  AllianceReward,
  AlliancePerks,
  DonationKind,
  League,
  RaidBossDef,
} from '../alliance/AllianceBackend';
import { LEAGUES } from '../alliance/AllianceBackend';
import { REGIONS } from './regions';
import type { SaveData } from '../systems/SaveSystem';

/**
 * 同盟の数字: ここの表だけを直せば、バランスが変わる (数字は仮のバランス)。設計は docs/ALLIANCE_DESIGN.md。
 * ここは、画面にも Backend にも依らない (Phaser を読まない)。
 */

// ---------------------------------------------------------------------------------------------- 同盟の決まり

export const ALLIANCE_MAX_LEVEL = 10;
export const ALLIANCE_CREATE_GEMS = 300;
/** 抜けてから、別の同盟に入れるまで。 */
export const LEAVE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const OFFICER_MAX = 3;
/** 同盟長が7日ログインしないと、次の人に譲られる。 */
export const LEADER_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PLAYER_LEVEL_MAX = 50;
export const CHAT_KEEP = 120;
export const CHAT_TEXT_MAX = 100;

// ---------------------------------------------------------------------------------------------- 同盟Lv

/** 同盟EXP: Lv から次の Lv まで (最大Lvは null)。 */
export function allianceExpToNext(level: number): number | null {
  if (level >= ALLIANCE_MAX_LEVEL) return null;
  return Math.round(1000 * Math.pow(1.6, Math.max(1, level) - 1));
}

/** 同盟Lv (index 0 = Lv1) ごとの恩恵。 */
const PERKS: AlliancePerks[] = [
  { idleGoldBonus: 0.0, expDropBonus: 0.0, staminaMaxBonus: 0, raidAttemptsPerDay: 3, memberMax: 20 },
  { idleGoldBonus: 0.02, expDropBonus: 0.0, staminaMaxBonus: 0, raidAttemptsPerDay: 3, memberMax: 21 },
  { idleGoldBonus: 0.04, expDropBonus: 0.03, staminaMaxBonus: 0, raidAttemptsPerDay: 3, memberMax: 22 },
  { idleGoldBonus: 0.06, expDropBonus: 0.03, staminaMaxBonus: 5, raidAttemptsPerDay: 3, memberMax: 23 },
  { idleGoldBonus: 0.08, expDropBonus: 0.06, staminaMaxBonus: 5, raidAttemptsPerDay: 4, memberMax: 25 },
  { idleGoldBonus: 0.1, expDropBonus: 0.06, staminaMaxBonus: 10, raidAttemptsPerDay: 4, memberMax: 26 },
  { idleGoldBonus: 0.12, expDropBonus: 0.09, staminaMaxBonus: 10, raidAttemptsPerDay: 4, memberMax: 27 },
  { idleGoldBonus: 0.14, expDropBonus: 0.09, staminaMaxBonus: 15, raidAttemptsPerDay: 5, memberMax: 28 },
  { idleGoldBonus: 0.16, expDropBonus: 0.12, staminaMaxBonus: 15, raidAttemptsPerDay: 5, memberMax: 29 },
  { idleGoldBonus: 0.2, expDropBonus: 0.15, staminaMaxBonus: 20, raidAttemptsPerDay: 5, memberMax: 30 },
];

/** その Lv の恩恵 (Lv は 1..最大に丸める)。 */
export function perksForLevel(level: number): AlliancePerks {
  return PERKS[Math.max(1, Math.min(ALLIANCE_MAX_LEVEL, Math.floor(level))) - 1];
}

const NO_PERKS: AlliancePerks = { idleGoldBonus: 0, expDropBonus: 0, staminaMaxBonus: 0, raidAttemptsPerDay: 0, memberMax: 0 };

/** 同盟に入っていないときは、何もつかない。(セーブの `alliance.level` は、入っている同盟のLv。0 = 入っていない) */
export function allianceLevelOf(save: Pick<SaveData, 'alliance'>): number {
  const level = save.alliance?.level ?? 0;
  return save.alliance?.allianceId && level > 0 ? Math.min(ALLIANCE_MAX_LEVEL, level) : 0;
}
export function perksOfSave(save: Pick<SaveData, 'alliance'>): AlliancePerks {
  const level = allianceLevelOf(save);
  return level > 0 ? perksForLevel(level) : NO_PERKS;
}
/** 放置ゴールドの増え (0.08 = +8%)。 */
export function allianceIdleGoldBonus(save: Pick<SaveData, 'alliance'>): number {
  return perksOfSave(save).idleGoldBonus;
}
/** 経験値素材ドロップの増え。 */
export function allianceExpDropBonus(save: Pick<SaveData, 'alliance'>): number {
  return perksOfSave(save).expDropBonus;
}
/** スタミナ上限の増え。 */
export function allianceStaminaBonus(save: Pick<SaveData, 'alliance'>): number {
  return perksOfSave(save).staminaMaxBonus;
}

// ---------------------------------------------------------------------------------------------- 寄付

export interface DonationRule {
  kind: DonationKind;
  label: string;
  /** 同盟EXP / 個人の貢献 (= 同盟コイン) / 同盟ポイント(貢献と同じ)。 */
  allianceExp: number;
  contribution: number;
  /** 1日の上限 (メンバーごと)。 */
  limit: number;
  /** 1回に払うもの: gold = 放置報酬の何時間分か、materials = 素材の合計個数、gems = 魔晶石。 */
  cost: { goldHours?: number; materials?: number; gems?: number };
}

export const DONATIONS: Record<DonationKind, DonationRule> = {
  gold: { kind: 'gold', label: 'ゴールド', allianceExp: 100, contribution: 10, limit: 5, cost: { goldHours: 1 } },
  materials: { kind: 'materials', label: '素材', allianceExp: 120, contribution: 12, limit: 5, cost: { materials: 100 } },
  gems: { kind: 'gems', label: '魔晶石', allianceExp: 300, contribution: 30, limit: 3, cost: { gems: 10 } },
};
export const DONATION_KINDS: DonationKind[] = ['gold', 'materials', 'gems'];

// ---------------------------------------------------------------------------------------------- 共闘ボス

export const RAID_BOSS_COUNT = 5;
/** 1回の挑戦の長さ。 */
export const RAID_DURATION_MS = 60_000;
/** 切符の有効期間: これを過ぎて出した結果は無効 (挑戦回数は戻らない)。 */
export const RAID_TICKET_TTL_MS = 10 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const BOSS_TEXT = [
  '迷いの森を支配する、紅い角の大鹿。突進は、盾ごと押し潰す。',
  '砂塵の底に棲む女王蠍。毒の尾が、陣形を崩す。',
  '凍てつく山の王、白銀の虎。一撃が重い。',
  '古い遺跡に眠る骨の竜。長い戦いになる。',
  '闇を走る大狼。速さに、ついていけるか。',
];

/** 週ごとのボス (地方のボスを順に回す)。 */
export const RAID_BOSSES: RaidBossDef[] = REGIONS.slice(0, RAID_BOSS_COUNT).map((r, i) => ({
  id: `raid_${r.id}`,
  name: r.bossName,
  art: r.bossArt,
  heroClass: r.bossClass,
  description: BOSS_TEXT[i] ?? '',
}));

/** その週のボスの最大HP: メンバーの総合力の合計に比例し、ボスが進むほど・同盟Lvが高いほど重い。 */
export function raidMaxHp(totalPower: number, bossIndex: number, allianceLevel: number): number {
  const power = Math.max(100, totalPower);
  return power * 400 * (1 + 0.15 * bossIndex) * (1 + 0.05 * (Math.max(1, allianceLevel) - 1));
}

/** 1回の挑戦で入るダメージの上限: パーティの総合力 × 係数 (60秒で、実際に出る数の2〜4倍の余裕を持たせた切り捨て用)。 */
export const RAID_DAMAGE_FACTOR = 100;
export function raidDamageCap(power: number): number {
  return Math.max(100, power) * RAID_DAMAGE_FACTOR;
}

/** ボスへのダメージ → 同盟ポイント。桁があふれないよう、対数に近い伸び。 */
export function raidWarPoints(damage: number): number {
  if (!(damage > 0)) return 0;
  return Math.max(1, Math.floor(Math.pow(Math.log10(1 + damage), 1.5)));
}

/** 撃破 / 週の終わりの報酬。 */
export const RAID_REWARD_DEFEAT: AllianceReward = { gems: 50, phaseMaterials: 3, coins: 100 };
export const RAID_REWARD_TOP: AllianceReward[] = [
  { gems: 100, coins: 150 },
  { gems: 60, coins: 100 },
  { gems: 30, coins: 60 },
];
export const RAID_REWARD_PARTICIPATION: AllianceReward = { gems: 15, coins: 30 };

export function addRewards(a: AllianceReward, b: AllianceReward): AllianceReward {
  const items: Record<string, number> = { ...(a.items ?? {}) };
  for (const [k, v] of Object.entries(b.items ?? {})) items[k] = (items[k] ?? 0) + v;
  const sum = (x?: number, y?: number): number | undefined => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
  const out: AllianceReward = {};
  const gems = sum(a.gems, b.gems);
  const phase = sum(a.phaseMaterials, b.phaseMaterials);
  const coins = sum(a.coins, b.coins);
  const hours = sum(a.goldHours, b.goldHours);
  if (gems !== undefined) out.gems = gems;
  if (phase !== undefined) out.phaseMaterials = phase;
  if (coins !== undefined) out.coins = coins;
  if (hours !== undefined) out.goldHours = hours;
  if (Object.keys(items).length > 0) out.items = items;
  const badge = b.badge ?? a.badge;
  if (badge) out.badge = badge;
  return out;
}

/** 撃破の報酬 (ダメージが入った全員)。rank は、ダメージの順位 (1〜)。 */
export function raidDefeatReward(rank: number): AllianceReward {
  const top = rank >= 1 && rank <= RAID_REWARD_TOP.length ? RAID_REWARD_TOP[rank - 1] : undefined;
  return top ? addRewards(RAID_REWARD_DEFEAT, top) : { ...RAID_REWARD_DEFEAT };
}

// ---------------------------------------------------------------------------------------------- 対抗戦

export const WAR_LEAGUE_SIZE = 20;
export const WAR_PROMOTE = 3;
export const WAR_RELEGATE = 3;
export const WAR_STAGE_POINTS = 20;
export const WAR_HELPER_POINTS = 5;
/** 1回の呼び出しで足せる同盟ポイントの上限 (入力のでたらめを切る)。 */
export const WAR_POINTS_MAX_PER_CALL = 2000;

export function leagueIndex(league: League): number {
  return LEAGUES.indexOf(league);
}
/** 同盟Lv → 初めに振り分けられるリーグ。 */
export function leagueForLevel(level: number): League {
  return LEAGUES[Math.min(LEAGUES.length - 1, Math.floor((Math.max(1, level) - 1) / 2))];
}

export const WAR_REWARDS: { fromRank: number; toRank: number; label: string; reward: AllianceReward }[] = [
  { fromRank: 1, toRank: 1, label: '1位', reward: { gems: 300, coins: 400, phaseMaterials: 5 } },
  { fromRank: 2, toRank: 2, label: '2位', reward: { gems: 200, coins: 300, phaseMaterials: 3 } },
  { fromRank: 3, toRank: 3, label: '3位', reward: { gems: 150, coins: 250, phaseMaterials: 2 } },
  { fromRank: 4, toRank: 6, label: '4〜6位', reward: { gems: 100, coins: 150, phaseMaterials: 1 } },
  { fromRank: 7, toRank: 10, label: '7〜10位', reward: { gems: 60, coins: 100 } },
  { fromRank: 11, toRank: 20, label: '11〜20位', reward: { gems: 30, coins: 50 } },
];

/** 順位の報酬 (リーグが高いほど、魔晶石と同盟コインが増える)。 */
export function warRewardFor(rank: number, league: League): AllianceReward {
  const band = WAR_REWARDS.find((b) => rank >= b.fromRank && rank <= b.toRank) ?? WAR_REWARDS[WAR_REWARDS.length - 1];
  const k = 1 + 0.25 * leagueIndex(league);
  const r = band.reward;
  const out: AllianceReward = { gems: Math.round((r.gems ?? 0) * k), coins: Math.round((r.coins ?? 0) * k) };
  if (r.phaseMaterials) out.phaseMaterials = r.phaseMaterials;
  if (rank === 1) out.badge = `league_${league}`;
  return out;
}

/** 1シーズンに、同盟のメンバー1人あたり、およそ何ポイント入るか (疑似の同盟の強さの目安)。refPower は、メンバーの総合力。 */
export function expectedWarPointsPerMember(refPower: number): number {
  return 14 * raidWarPoints(Math.max(100, refPower) * 35) + 120;
}

// ---------------------------------------------------------------------------------------------- 支援・助っ人

export const SUPPORT_STAMINA = 10;
/** 1日に贈れる人数 / 1日に受け取れる贈り物の数。 */
export const SUPPORT_SEND_LIMIT = 5;
export const SUPPORT_RECEIVE_LIMIT = 10;
/** 助っ人を貸した側の報酬 (同盟コイン)。1日に、同じ人の助っ人で貰えるのは3回まで。 */
export const HELPER_LENDER_COINS = 5;
export const HELPER_LENDER_DAILY_LIMIT = 3;
/** 救援要請を続けて出せる間隔。 */
export const HELP_REQUEST_INTERVAL_MS = 60 * 60 * 1000;
export const HELP_ANSWER_CONTRIBUTION = 5;

// ---------------------------------------------------------------------------------------------- 同盟ショップ

export interface ShopItem {
  id: string;
  name: string;
  cost: number;
  reward: AllianceReward;
  /** 1週間に買える数 (0 = 制限なし)。 */
  weeklyLimit: number;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'phase', name: 'フェーズ素材 ×1', cost: 150, reward: { phaseMaterials: 1 }, weeklyLimit: 5 },
  { id: 'equip', name: '装備強化素材 ×100', cost: 40, reward: { items: { equip_essence: 100 } }, weeklyLimit: 0 },
  { id: 'exp_m', name: '経験値素材(中) ×3', cost: 30, reward: { items: { exp_m: 3 } }, weeklyLimit: 0 },
  { id: 'exp_l', name: '経験値素材(大) ×3', cost: 90, reward: { items: { exp_l: 3 } }, weeklyLimit: 0 },
  { id: 'gems', name: '魔晶石 ×30', cost: 300, reward: { gems: 30 }, weeklyLimit: 1 },
];

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------------------------- 時間 (ローカルの時計: 週は月曜0:00、日替わりの回復は4:00)

const HOUR_MS = 60 * 60 * 1000;
export const DAY_RESET_HOUR = 4;

/** その時刻を含む週の、月曜0:00 (ローカル)。 */
export function weekStartOf(ms: number): number {
  const d = new Date(ms);
  const back = (d.getDay() + 6) % 7; // 月曜 = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, 0, 0, 0, 0).getTime();
}

/** 週のID。月曜0:00のローカル日付 ("2026-11-09")。 */
export function weekIdOf(ms: number): string {
  const d = new Date(weekStartOf(ms));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 何週目か (ボスを回す番号)。1970-01-05 (月曜) から数える。 */
export function weekNumberOf(ms: number): number {
  return Math.floor((weekStartOf(ms) + 3 * HOUR_MS - new Date(1970, 0, 5).getTime()) / WEEK_MS);
}

/** 日替わりの境目は4:00。その時刻が属する日 ("2026-11-10")。 */
export function dayKeyOf(ms: number): string {
  const d = new Date(ms - DAY_RESET_HOUR * HOUR_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------- 乱数 (疑似メンバー・疑似同盟を、シードから固定で作る)

/** 文字列・数の並びから、32bit の整数。 */
export function hash32(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** シード付きの乱数 (0 以上 1 未満)。 */
export function rngOf(...parts: (string | number)[]): () => number {
  let a = hash32(...parts) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------- 疑似同盟・疑似メンバーの名前

export const SIM_ALLIANCE_PREFIX = ['蒼月', '紅蓮', '白銀', '黒鉄', '金獅子', '星屑', '疾風', '深緑', '雷鳴', '氷刃', '暁', '夜明け', '翠嵐', '烈火', '銀狼', '天翔'];
export const SIM_ALLIANCE_SUFFIX = ['同盟', '騎士団', '連合', '会', '団', '隊'];
export const SIM_NAMES = [
  'アキラ', 'サクヤ', 'レオ', 'ミサキ', 'タクミ', 'ハルカ', 'ユウト', 'ナギ', 'シオン', 'カナタ', 'リョウ', 'アヤネ', 'ケイ', 'モエ', 'ジン', 'ヒナタ', 'ソウタ', 'ミレイ', 'ダイキ', 'ココロ',
  'トウヤ', 'ルナ', 'ハヤテ', 'イオリ', 'マヒロ', 'ツバサ', 'カエデ', 'リク', 'セナ', 'ヨシノ', 'ガク', 'ノゾミ', 'テツ', 'ユズ', 'シュン', 'アカリ', 'コウ', 'ミコト', 'ヒカル', 'ナツキ',
];
export const SIM_DESCRIPTIONS = [
  '毎日ボスに挑む、まったり同盟です。',
  '初心者も歓迎。寄付は無理のない範囲で。',
  '対抗戦の上位を目指しています！',
  '週末は、みんなでボスを倒そう。',
  '助っ人の貸し借りで、助け合います。',
  'ゆるく、長く、楽しく。',
  '強さは問いません。やる気のある人、大歓迎。',
  '毎日ログインできる方を募集中です。',
];
export const SIM_CHAT_LINES = [
  'よろしくお願いします！',
  'ボス、残りHPどのくらいですか？',
  '寄付しました〜',
  '今日の分のボス、挑戦してきます。',
  '助っ人、お借りしました。ありがとう！',
  'お疲れさまです！',
  '対抗戦、いい調子ですね。',
  'フェーズ素材、ショップで買えましたよ。',
  'ボス、あと少し！ みんなでがんばろう。',
  'さっきのボス戦、会心が3回出ました:star:',
];
export const SIM_HELP_LINES = ['ボスが強くて…手伝ってください！', '村に襲撃が来ています。助けて！'];
