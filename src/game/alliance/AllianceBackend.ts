/**
 * 同盟の、画面とルールが頼るもの: 型と、Backend のインターフェース。(設計: docs/ALLIANCE_DESIGN.md)
 *
 * 同盟の状態は、画面から、`AllianceService` だけを通して読み書きする。AllianceService は、次のどちらかの Backend を使う:
 *   - OnlineAllianceBackend (Firestore): Firebase が設定されているとき。
 *   - LocalAllianceBackend (セーブ内): 設定がないとき。疑似メンバーで、同じルールのまま遊べる。
 * どちらも、この `AllianceBackend` を実装する。ここの型は、サーバーに保存できる形（数は number か string、BigNumber は使わない。
 * ダメージなどの大きな数は、double の number で持つ: 1e300 まで入るので足りる）。
 */
import type { PlainKey } from '../i18n';

// ---------------------------------------------------------------------------------------------- 共通

/** サーバーの時刻（ミリ秒）と、ローカルの時計の差。Local では 0。 */
export type Millis = number;

/** 失敗の理由（画面は、`message` をそのまま見せてよい）。 */
export interface Failure {
  ok: false;
  reason: AllianceFailReason;
  message: string;
}
export type Result<T> = { ok: true; value: T } | Failure;

export type AllianceFailReason =
  | 'not_signed_in'
  | 'not_in_alliance'
  | 'already_in_alliance'
  | 'cooldown' // 抜けてから24時間
  | 'not_found'
  | 'full'
  | 'level_too_low'
  | 'invite_only'
  | 'already_requested'
  | 'no_permission'
  | 'bad_name'
  | 'name_taken'
  | 'not_enough' // 魔晶石・素材が足りない
  | 'limit_reached' // 1日の上限・挑戦回数
  | 'raid_over' // ボスは撃破済み、または期間外
  | 'bad_input'
  | 'offline'
  | 'error';

/** プレイヤー自身。ID は、フレンドIDと同じもの（social.playerId）。 */
export interface PlayerProfile {
  uid: string;
  name: string;
  /** プレイヤーLv。 */
  level: number;
  /** 総合力（ProgressionSystem.computeDeckTotals の power を、number にしたもの）。 */
  power: number;
}

// ---------------------------------------------------------------------------------------------- 同盟

export type AllianceRole = 'leader' | 'officer' | 'member';
export type JoinPolicy = 'open' | 'approval' | 'invite';
/** The names of the roles / join rules: keys, so the text is looked up (`t(ALLIANCE_ROLE_LABEL[role])`) where it is drawn. */
export const ALLIANCE_ROLE_LABEL: Record<AllianceRole, PlainKey> = { leader: 'alliance.role.leader', officer: 'alliance.role.officer', member: 'alliance.role.member' };
export const JOIN_POLICY_LABEL: Record<JoinPolicy, PlainKey> = { open: 'alliance.joinPolicy.open', approval: 'alliance.joinPolicy.approval', invite: 'alliance.joinPolicy.invite' };

export const EMBLEM_COUNT = 12;
export const NAME_MIN = 2;
export const NAME_MAX = 10;
export const DESCRIPTION_MAX = 60;

/** 一覧に出るときの、同盟の要約。 */
export interface AllianceSummary {
  id: string;
  name: string;
  /** 0..EMBLEM_COUNT-1 */
  emblem: number;
  description: string;
  level: number;
  memberCount: number;
  memberMax: number;
  joinPolicy: JoinPolicy;
  /** 参加に必要なプレイヤーLv (0 = 条件なし)。 */
  minPlayerLevel: number;
  leaderName: string;
  /** 今週の同盟ポイント。 */
  weekPoints: number;
  /** メンバーの総合力の合計。 */
  power: number;
  league: League;
}

export type League = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export const LEAGUES: League[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
export const DONATION_LABEL: Record<DonationKind, PlainKey> = { gold: 'alliance.donation.gold', materials: 'alliance.donation.materials', gems: 'alliance.donation.gems' };
export const LEAGUE_LABEL: Record<League, PlainKey> = { bronze: 'alliance.league.bronze', silver: 'alliance.league.silver', gold: 'alliance.league.gold', platinum: 'alliance.league.platinum', diamond: 'alliance.league.diamond' };

/** 助っ人に登録された、キャラの写し（戦闘に出すのに足りるだけ）。 */
export interface HelperHero {
  /** 貸す人。 */
  ownerUid: string;
  ownerName: string;
  heroId: string;
  name: string;
  heroClass: 'warrior' | 'mage' | 'archer' | 'tank' | 'healer';
  rarity: 1 | 2 | 3 | 4 | 5 | 6;
  level: number;
  phase: number;
  skillLevels: number[];
  /** 装備の写し（defId と level）。 */
  gear: { weapon: { defId: string; level: number } | null; armor: { defId: string; level: number } | null; accessory: { defId: string; level: number } | null };
  /** 総合力（一覧の並べ替えと、上限チェック用）。 */
  power: number;
  /** 登録した時刻。 */
  setAt: Millis;
}

export interface AllianceMember {
  uid: string;
  name: string;
  level: number;
  role: AllianceRole;
  power: number;
  /** これまでの貢献の合計 / 今週の貢献。 */
  contribution: number;
  weekContribution: number;
  /** 今週、ボスに与えたダメージ。 */
  weekDamage: number;
  lastActiveAt: Millis;
  joinedAt: Millis;
  helper: HelperHero | null;
  /** 疑似メンバーか (Local のみ true)。 */
  simulated?: boolean;
}

export interface AllianceRequest {
  uid: string;
  name: string;
  level: number;
  power: number;
  at: Millis;
}

/** 自分あての招待（フレンドから）。 */
export interface AllianceInvite {
  allianceId: string;
  allianceName: string;
  emblem: number;
  fromUid: string;
  fromName: string;
  at: Millis;
}

// ---------------------------------------------------------------------------------------------- 恩恵・寄付

/** 同盟Lvで決まる恩恵（data/alliance.ts の表から作る）。 */
export interface AlliancePerks {
  /** 放置ゴールドの増え（0.08 = +8%）。 */
  idleGoldBonus: number;
  /** 経験値素材ドロップの増え。 */
  expDropBonus: number;
  /** スタミナ上限の増え（+点）。 */
  staminaMaxBonus: number;
  /** 1日の、ボスへの挑戦回数。 */
  raidAttemptsPerDay: number;
  memberMax: number;
}

export type DonationKind = 'gold' | 'materials' | 'gems';

export interface DonationResult {
  kind: DonationKind;
  allianceExp: number;
  contribution: number;
  /** 上がった同盟Lv (上がらなければ null)。 */
  levelUp: number | null;
  /** 今日、この種類をあと何回できるか。 */
  left: number;
}

/** 報酬の中身。受け取る側（AllianceService）が、セーブに足す。 */
export interface AllianceReward {
  gems?: number;
  phaseMaterials?: number;
  /** 同盟コイン。 */
  coins?: number;
  /** 素材 (ItemId -> 個数)。 */
  items?: Record<string, number>;
  /** 放置報酬の何時間分のゴールドか。 */
  goldHours?: number;
  /** 称号の紋章（同盟の紋章の追加など）。 */
  badge?: string;
}

// ---------------------------------------------------------------------------------------------- 共闘ボス

export interface RaidBossDef {
  id: string;
  name: string;
  /** 絵 (public/assets/enemies/<art>.png)。なければ、影絵。 */
  art?: string;
  heroClass: 'warrior' | 'mage' | 'archer' | 'tank' | 'healer';
  /** 同盟Lvに応じたHPは、サーバー(Local)が、週の頭に決める。 */
  description: string;
}

export interface RaidRankEntry {
  uid: string;
  name: string;
  damage: number;
  rank: number;
}

export interface RaidView {
  /** 週のID ("2026-W46")。 */
  weekId: string;
  boss: RaidBossDef;
  maxHp: number;
  hp: number;
  startsAt: Millis;
  endsAt: Millis;
  /** 撃破された時刻 (まだなら null)。 */
  defeatedAt: Millis | null;
  /** 自分の、今日の残り挑戦回数 / 今週の与ダメージ。 */
  attemptsLeft: number;
  myDamage: number;
  /** 上位のダメージ (最大10人)。 */
  ranking: RaidRankEntry[];
  /** 1回の挑戦で入るダメージの上限 (パーティの総合力 × 係数。クライアントも、これで頭打ちにする)。 */
  maxDamagePerAttempt: number;
  /** 受け取れる報酬 (なければ null)。撃破後、または週の終わり。 */
  claimable: { label: string; reward: AllianceReward } | null;
}

/** 挑戦の切符。beginRaid で消費し、finishRaid で結果を出す (未提出のまま 10 分たつと、無効)。 */
export interface RaidTicket {
  id: string;
  weekId: string;
  issuedAt: Millis;
  boss: RaidBossDef;
  /** 戦う時間 (ミリ秒)。 */
  durationMs: number;
  maxDamage: number;
}

export interface RaidOutcome {
  /** 実際に入ったダメージ (上限で切られていることがある)。 */
  damage: number;
  hpLeft: number;
  defeated: boolean;
  /** 自分が止めを刺した (撃破した最後の1撃)。 */
  lastHit: boolean;
  /** 同盟ポイントの増え。 */
  points: number;
}

// ---------------------------------------------------------------------------------------------- 対抗戦

export interface WarRankEntry {
  allianceId: string;
  name: string;
  emblem: number;
  points: number;
  rank: number;
  mine: boolean;
}

export interface WarView {
  seasonId: string;
  league: League;
  startsAt: Millis;
  endsAt: Millis;
  /** 自分の同盟の、順位とポイント。 */
  rank: number;
  points: number;
  /** ポイントの内訳 (今週)。 */
  breakdown: { raid: number; donation: number; stages: number; helpers: number };
  /** リーグ表 (最大20同盟)。 */
  table: WarRankEntry[];
  /** 順位ごとの報酬 (表示用)。 */
  rewards: { fromRank: number; toRank: number; label: string; reward: AllianceReward }[];
  /** 前のシーズンの、受け取れる報酬 (なければ null)。 */
  claimable: { label: string; rank: number; promoted: boolean; demoted: boolean; reward: AllianceReward } | null;
}

export type WarPointSource = 'raid' | 'donation' | 'stages' | 'helpers';

// ---------------------------------------------------------------------------------------------- チャット・支援

export type ChatKind = 'text' | 'system' | 'help';

export interface AllianceChatMessage {
  id: string;
  kind: ChatKind;
  senderUid: string;
  senderName: string;
  text: string;
  sentAt: Millis;
  /** kind 'help': 救援の種類と、助けてくれた人の数。 */
  help?: { what: 'raid' | 'village'; helpers: string[]; open: boolean };
}

export interface SupportState {
  /** 今日、あと何人に贈れるか。 */
  sendLeft: number;
  /** 受け取れるスタミナ（贈られたもの）。 */
  receivable: number;
  /** 今日あと何個、受け取れるか。 */
  receiveLeft: number;
}

// ---------------------------------------------------------------------------------------------- 同盟ミッション

/** 同盟ミッションに数えられる行動 (メンバー全員の分が足されて、同盟の進み具合になる)。 */
export type MissionMetric = 'stage' | 'gacha' | 'donate' | 'raid' | 'stamina' | 'idle' | 'enhance' | 'helper';
export const MISSION_METRICS: MissionMetric[] = ['stage', 'gacha', 'donate', 'raid', 'stamina', 'idle', 'enhance', 'helper'];
export type MissionScope = 'daily' | 'weekly';

/** その期間 (1日 / 1週間) の目標の1つ。目標の数 (target) は、期間の初めに、メンバーの数から決まって、そのまま変わらない。 */
export interface MissionGoal {
  id: string;
  metric: MissionMetric;
  target: number;
}

/** 期間ごとの掲示板 (Online では、`alliances/{id}/missionTotals/{期間}` の文書と同じ形。Local では、セーブの中)。 */
export interface MissionBoard {
  scope: MissionScope;
  /** 期間の名前 (1日: 4:00区切りの日付 / 1週間: その週の月曜の日付)。 */
  key: string;
  /** 期間の初めの、メンバーの数 (目標の数を決めた)。 */
  members: number;
  goals: MissionGoal[];
  /** 行動ごとの、同盟の合計。 */
  progress: Partial<Record<MissionMetric, number>>;
  /** メンバー (Online: 認証uid / Local: フレンドID) ごとの、行動ごとの貢献。 */
  by: Record<string, Partial<Record<MissionMetric, number>>>;
  /** メンバーごとの、受け取り済みのミッションのID。 */
  claims: Record<string, string[]>;
}

export interface MissionView {
  id: string;
  metric: MissionMetric;
  title: PlainKey;
  target: number;
  /** 同盟の合計 (目標を超えていることもある)。 */
  progress: number;
  /** 自分の貢献と、同盟内の順位 (貢献がなければ 0)。 */
  mine: number;
  myRank: number;
  /** 受け取れる最低の貢献 (これに届かないと、達成していても受け取れない)。 */
  minShare: number;
  /** 貢献の上位3人。 */
  top: { name: string; count: number }[];
  reward: AllianceReward;
  done: boolean;
  claimed: boolean;
  claimable: boolean;
}

export interface MissionBoardView {
  scope: MissionScope;
  /** この期間の終わり。 */
  endsAt: Millis;
  missions: MissionView[];
}

export interface MissionsView {
  daily: MissionBoardView;
  weekly: MissionBoardView;
  /** いま受け取れるミッションの数 (赤丸)。 */
  claimable: number;
}

// ---------------------------------------------------------------------------------------------- 同盟研究

/** 研究の系統: battle = 戦闘 (攻撃力・HP) / income = 収入 (放置ゴールド) / growth = 成長 (経験値素材)。 */
export type ResearchLine = 'battle' | 'income' | 'growth';
export const RESEARCH_LINE_IDS: ResearchLine[] = ['battle', 'income', 'growth'];

export interface ResearchView {
  /** 系統ごとの、いまの段 (0 = まだ)。 */
  levels: Record<ResearchLine, number>;
  /** 研究を進められる (同盟長・副長)。 */
  canResearch: boolean;
}

export interface ResearchResult {
  line: ResearchLine;
  /** 進んだあとの段。 */
  level: number;
  /** 使った資金。 */
  spent: number;
  /** 資金の残り。 */
  fundLeft: number;
}

// ---------------------------------------------------------------------------------------------- 同盟の全体像

/** 自分が入っている同盟の、画面に必要なすべて。 */
export interface AllianceDetail {
  summary: AllianceSummary;
  exp: number;
  /** 次のLvまでに必要なEXP (最大Lvなら null)。 */
  expToNext: number | null;
  perks: AlliancePerks;
  /** 次のLvの恩恵 (最大Lvなら null)。 */
  nextPerks: AlliancePerks | null;
  members: AllianceMember[];
  me: AllianceMember;
  /** 自分の同盟コイン。 */
  coins: number;
  /** 自分の今日の寄付の残り回数。 */
  donationLeft: Record<DonationKind, number>;
  /** 承認待ちの申請 (leader / officer だけに入る)。 */
  requests: AllianceRequest[];
  raid: RaidView;
  war: WarView;
  support: SupportState;
  /** 同盟の資金 (寄付で貯まる。研究に使う)。 */
  fund: number;
  /** 同盟研究。 */
  research: ResearchView;
  /** 同盟ミッション (今日の3件と、今週の1件)。 */
  missions: MissionsView;
  /** サーバーの現在時刻 (ミリ秒)。 */
  now: Millis;
}

export interface CreateAllianceParams {
  name: string;
  emblem: number;
  description: string;
  joinPolicy: JoinPolicy;
  minPlayerLevel: number;
}

export type AllianceSettingsPatch = Partial<Omit<CreateAllianceParams, never>>;

export interface SearchQuery {
  /** 名前の一部。 */
  text?: string;
  /** 入れる同盟だけ (満員・招待のみ・条件未達を除く)。 */
  joinableOnly?: boolean;
  limit?: number;
}

// ---------------------------------------------------------------------------------------------- Backend

export interface AllianceBackend {
  /** 'online': サーバーにつながっている。 'local': 疑似メンバーで、この端末だけで動く。 */
  readonly mode: 'online' | 'local';

  // ---- 探す・入る・抜ける
  search(me: PlayerProfile, query: SearchQuery): Promise<Result<AllianceSummary[]>>;
  /** おすすめ (強さの近い、入れる同盟)。 */
  recommended(me: PlayerProfile): Promise<Result<AllianceSummary[]>>;
  create(me: PlayerProfile, params: CreateAllianceParams): Promise<Result<AllianceSummary>>;
  /** 自由参加ならすぐ入る ('joined')。承認制なら申請する ('requested')。 */
  join(me: PlayerProfile, allianceId: string): Promise<Result<'joined' | 'requested'>>;
  cancelRequest(me: PlayerProfile, allianceId: string): Promise<Result<true>>;
  /** 自分が申請中の同盟のID。 */
  myRequests(me: PlayerProfile): Promise<Result<string[]>>;
  /** 自分あての招待。 */
  invites(me: PlayerProfile): Promise<Result<AllianceInvite[]>>;
  /** フレンドを招待する (同盟の幹部以上、フレンド1人につき1日1回)。 */
  invite(me: PlayerProfile, friendUid: string): Promise<Result<true>>;
  acceptInvite(me: PlayerProfile, allianceId: string): Promise<Result<true>>;
  declineInvite(me: PlayerProfile, allianceId: string): Promise<Result<true>>;
  resolveRequest(me: PlayerProfile, uid: string, accept: boolean): Promise<Result<true>>;
  leave(me: PlayerProfile): Promise<Result<true>>;
  kick(me: PlayerProfile, uid: string): Promise<Result<true>>;
  setRole(me: PlayerProfile, uid: string, role: 'officer' | 'member'): Promise<Result<true>>;
  transferLeader(me: PlayerProfile, uid: string): Promise<Result<true>>;
  updateSettings(me: PlayerProfile, patch: AllianceSettingsPatch): Promise<Result<AllianceSummary>>;
  disband(me: PlayerProfile): Promise<Result<true>>;

  // ---- 読む (時間の経過 — 疑似メンバーの動き、週の切り替え、挑戦回数の回復 — も、ここで進む)
  /** 自分の同盟 (入っていなければ null)。プロフィールの Lv・総合力・名前も、ここで同盟側に反映する。 */
  load(me: PlayerProfile): Promise<Result<AllianceDetail | null>>;
  /** 変化があったら呼ばれる (online: リアルタイム。local: 定期的)。解除する関数を返す。 */
  subscribe(me: PlayerProfile, onChange: () => void): () => void;

  // ---- 育成
  donate(me: PlayerProfile, kind: DonationKind): Promise<Result<DonationResult>>;
  /** 同盟コインを使う (同盟ショップ)。足りなければ not_enough。 */
  spendCoins(me: PlayerProfile, amount: number): Promise<Result<number>>;

  /** 同盟の資金を使って、研究を1段進める (同盟長・副長だけ)。 */
  researchUp(me: PlayerProfile, line: ResearchLine): Promise<Result<ResearchResult>>;

  // ---- 同盟ミッション
  /** 自分の行動の数を、同盟ミッションに足す (今日の掲示板と、今週の掲示板の、両方に)。1回の呼び出しで足せる数と、1期間の合計には、上限がある。 */
  reportMissions(me: PlayerProfile, counts: Partial<Record<MissionMetric, number>>): Promise<Result<true>>;
  /** 達成したミッションの報酬を受け取る (1人1回)。返る報酬のコインは、Backend が足し済み。 */
  claimMission(me: PlayerProfile, missionId: string): Promise<Result<AllianceReward>>;

  // ---- 共闘ボス
  beginRaid(me: PlayerProfile): Promise<Result<RaidTicket>>;
  finishRaid(me: PlayerProfile, ticket: RaidTicket, damage: number): Promise<Result<RaidOutcome>>;
  /** 撃破・週の終わりの報酬を受け取る (1回だけ)。 */
  claimRaidReward(me: PlayerProfile): Promise<Result<AllianceReward>>;

  // ---- 対抗戦
  addWarPoints(me: PlayerProfile, source: WarPointSource, points: number): Promise<Result<true>>;
  claimWarReward(me: PlayerProfile): Promise<Result<AllianceReward>>;

  // ---- 助っ人・支援
  setHelper(me: PlayerProfile, helper: HelperHero | null): Promise<Result<true>>;
  /** 借りる (1日の上限や、貸した側の報酬は、Backend が数える)。返るのは、戦闘に出す助っ人の写し。 */
  borrowHelper(me: PlayerProfile, ownerUid: string): Promise<Result<HelperHero>>;
  sendStamina(me: PlayerProfile, toUid: string): Promise<Result<true>>;
  /** 贈られたスタミナを受け取る (受け取れた量)。 */
  claimStamina(me: PlayerProfile): Promise<Result<number>>;
  requestHelp(me: PlayerProfile, what: 'raid' | 'village'): Promise<Result<true>>;
  answerHelp(me: PlayerProfile, messageId: string): Promise<Result<true>>;

  // ---- チャット
  chat(me: PlayerProfile, limit?: number): Promise<Result<AllianceChatMessage[]>>;
  sendChat(me: PlayerProfile, text: string): Promise<Result<AllianceChatMessage>>;
}

// ---------------------------------------------------------------------------------------------- 小さな道具

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(reason: AllianceFailReason, message: string): Failure {
  return { ok: false, reason, message };
}
