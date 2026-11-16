/**
 * 同盟の、画面とルールが頼るもの: 型と、Backend のインターフェース。(設計: docs/ALLIANCE_DESIGN.md)
 *
 * 同盟の状態は、画面から、`AllianceService` だけを通して読み書きする。AllianceService は、次のどちらかの Backend を使う:
 *   - OnlineAllianceBackend (Firestore): Firebase が設定されているとき。
 *   - LocalAllianceBackend (セーブ内): 設定がないとき。疑似メンバーで、同じルールのまま遊べる。
 * どちらも、この `AllianceBackend` を実装する。ここの型は、サーバーに保存できる形（数は number か string、BigNumber は使わない。
 * ダメージなどの大きな数は、double の number で持つ: 1e300 まで入るので足りる）。
 */

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
export const ALLIANCE_ROLE_LABEL: Record<AllianceRole, string> = { leader: '同盟長', officer: '幹部', member: 'メンバー' };
export const JOIN_POLICY_LABEL: Record<JoinPolicy, string> = { open: '自由参加', approval: '承認制', invite: '招待のみ' };

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
export const LEAGUE_LABEL: Record<League, string> = { bronze: 'ブロンズ', silver: 'シルバー', gold: 'ゴールド', platinum: 'プラチナ', diamond: 'ダイヤ' };

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
