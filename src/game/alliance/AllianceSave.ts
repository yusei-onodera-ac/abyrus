import type {
  AllianceChatMessage,
  AllianceInvite,
  AllianceMember,
  AllianceRequest,
  AllianceRole,
  DonationKind,
  HelperHero,
  JoinPolicy,
  League,
} from './AllianceBackend';
import { EMBLEM_COUNT, LEAGUES } from './AllianceBackend';
import { ALLIANCE_MAX_LEVEL, CHAT_KEEP } from '../data/alliance';
import { isAllianceConfigured } from '../systems/firebaseConfig';

/**
 * セーブの `alliance`: プレイヤー個人の同盟の状態と、ローカル(疑似メンバー)の世界。
 * Online の Backend でも、`allianceId` と `level` と `pendingStagePoints` と `shop` は、プレイヤー側の状態として使う
 * (`world` は、Local だけが使う)。
 */

/** 疑似メンバーとして動くための、余分な値つきのメンバー。 */
export interface StoredMember extends AllianceMember {
  /** 活発さ (0..1)。 */
  act: number;
  /** 今日の挑戦回数 / 今日の寄付。 */
  used: number;
  don: Record<DonationKind, number>;
}

export interface StoredRaid {
  weekId: string;
  bossIndex: number;
  maxHp: number;
  hp: number;
  startsAt: number;
  endsAt: number;
  defeatedAt: number | null;
  damageBy: Record<string, number>;
  claimed: boolean;
  lastHit?: string;
}

export interface PastRaid {
  weekId: string;
  bossIndex: number;
  defeated: boolean;
  myDamage: number;
  myRank: number;
  claimed: boolean;
}

export interface StoredWar {
  seasonId: string;
  league: League;
  startsAt: number;
  raid: number;
  donation: number;
  stages: number;
  helpers: number;
}

export interface PastWar {
  seasonId: string;
  league: League;
  rank: number;
  promoted: boolean;
  demoted: boolean;
  participated: boolean;
  claimed: boolean;
}

/** プレイヤー自身の、今日のカウンター (日替わり4:00)。 */
export interface MeCounters {
  day: string;
  donated: Record<DonationKind, number>;
  /** 今日の、ボスへの挑戦の回数。 */
  used: number;
  staminaSent: string[];
  receivedGifts: number;
  /** 受け取りを待っているスタミナ。 */
  pendingStamina: number;
  /** 今日、フレンドに招待を出した相手。 */
  invitedToday: string[];
  /** 助っ人の貸し出し報酬を、今日もらった数 (貸した側 = 自分)。 */
  lent: number;
  /** 自分が借りた相手ごとの、今日の回数 (貸した側の報酬の上限を数える)。 */
  borrowed: Record<string, number>;
  lastHelpRequestAt: number;
}

export interface RaidTicketState {
  id: string;
  weekId: string;
  issuedAt: number;
  maxDamage: number;
  durationMs: number;
}

export interface FriendInviteState {
  uid: string;
  name: string;
  level: number;
  decideAt: number;
  accept: boolean;
}

export interface OwnAlliance {
  id: string;
  name: string;
  emblem: number;
  description: string;
  joinPolicy: JoinPolicy;
  minPlayerLevel: number;
  level: number;
  exp: number;
  createdAt: number;
  /** 疑似の参加者が、この人数になるまで、少しずつ集まる (自分で作った同盟のみ。0 = 集まらない)。 */
  recruitTarget: number;
  members: StoredMember[];
  applicants: AllianceRequest[];
  coins: number;
  raid: StoredRaid;
  pastRaid: PastRaid | null;
  war: StoredWar;
  pastWar: PastWar | null;
  chat: AllianceChatMessage[];
  day: string;
  me: MeCounters;
  ticket: RaidTicketState | null;
  friendInvites: FriendInviteState[];
}

export interface PendingRequest {
  allianceId: string;
  at: number;
  decideAt: number;
  accept: boolean;
}

export interface LocalWorld {
  seed: number;
  /** 疑似同盟の強さの基準 (この世界を作ったときの、プレイヤーの総合力)。 */
  refPower: number;
  createdAt: number;
  /** 疑似メンバーを、ここまで進めた (1時間の境目)。 */
  tickAt: number;
  /** プレイヤーが、最後に同盟を開いた時刻。 */
  lastSeenAt: number;
  requests: PendingRequest[];
  invites: AllianceInvite[];
  /** フレンドID -> 招待を出した日 ("2026-11-10")。 */
  inviteSent: Record<string, string>;
  own: OwnAlliance | null;
}

export interface AlliancePlayerState {
  version: 1;
  /** 入っている同盟のID (入っていなければ null)。 */
  allianceId: string | null;
  /** 入っている同盟のLv (恩恵の計算に使う。入っていなければ 0)。 */
  level: number;
  /** 最後に抜けた時刻 (24時間は、別の同盟に入れない)。 */
  leftAt: number;
  /** まだ同盟ポイントに換えていない、メインステージの初クリアの数。 */
  pendingStagePoints: number;
  /** 同盟ショップの、今週の購入数。 */
  shop: { week: string; bought: Record<string, number> };
  /** 助っ人に登録したキャラ (自分のキャラの id)。Backend 側の写しとは別に、画面が見るために持つ。 */
  helperHeroId: string;
  world: LocalWorld | null;
}

export function defaultAlliancePlayerState(): AlliancePlayerState {
  return { version: 1, allianceId: null, level: 0, leftAt: 0, pendingStagePoints: 0, shop: { week: '', bought: {} }, helperHeroId: '', world: null };
}

export function emptyDonated(): Record<DonationKind, number> {
  return { gold: 0, materials: 0, gems: 0 };
}

export function emptyMeCounters(day: string): MeCounters {
  return { day, donated: emptyDonated(), used: 0, staminaSent: [], receivedGifts: 0, pendingStamina: 0, invitedToday: [], lent: 0, borrowed: {}, lastHelpRequestAt: 0 };
}

// ---------------------------------------------------------------------------------------------- 読み込み時の掃除

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback);
const int = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => Math.floor(num(v, fallback, min, max));
const str = (v: unknown, fallback = '', max = 200): string => (typeof v === 'string' ? v.slice(0, max) : fallback);
const ROLES: AllianceRole[] = ['leader', 'officer', 'member'];
const POLICIES: JoinPolicy[] = ['open', 'approval', 'invite'];

function league(v: unknown): League {
  return LEAGUES.includes(v as League) ? (v as League) : 'bronze';
}

function cleanDonated(v: unknown): Record<DonationKind, number> {
  const o = isObj(v) ? v : {};
  return { gold: int(o.gold, 0, 0, 99), materials: int(o.materials, 0, 0, 99), gems: int(o.gems, 0, 0, 99) };
}

function cleanHelper(v: unknown): HelperHero | null {
  if (!isObj(v) || typeof v.heroId !== 'string' || typeof v.ownerUid !== 'string') return null;
  const classes = ['warrior', 'mage', 'archer', 'tank', 'healer'];
  const gear = isObj(v.gear) ? v.gear : {};
  const piece = (p: unknown): { defId: string; level: number } | null => (isObj(p) && typeof p.defId === 'string' ? { defId: p.defId, level: int(p.level, 1, 1, 99) } : null);
  return {
    ownerUid: v.ownerUid,
    ownerName: str(v.ownerName, '', 20),
    heroId: v.heroId,
    name: str(v.name, v.heroId, 30),
    heroClass: (classes.includes(v.heroClass as string) ? v.heroClass : 'warrior') as HelperHero['heroClass'],
    rarity: int(v.rarity, 1, 1, 6) as HelperHero['rarity'],
    level: int(v.level, 1, 1, 100),
    phase: int(v.phase, 1, 1, 10),
    skillLevels: Array.isArray(v.skillLevels) ? v.skillLevels.slice(0, 4).map((n) => int(n, 1, 1, 10)) : [1, 1, 1, 1],
    gear: { weapon: piece(gear.weapon), armor: piece(gear.armor), accessory: piece(gear.accessory) },
    power: num(v.power, 0, 0),
    setAt: num(v.setAt, 0, 0),
  };
}

function cleanMember(v: unknown): StoredMember | null {
  if (!isObj(v) || typeof v.uid !== 'string' || typeof v.name !== 'string') return null;
  return {
    uid: v.uid,
    name: v.name.slice(0, 20),
    level: int(v.level, 1, 1, 100),
    role: ROLES.includes(v.role as AllianceRole) ? (v.role as AllianceRole) : 'member',
    power: num(v.power, 0, 0),
    contribution: num(v.contribution, 0, 0),
    weekContribution: num(v.weekContribution, 0, 0),
    weekDamage: num(v.weekDamage, 0, 0),
    lastActiveAt: num(v.lastActiveAt, 0, 0),
    joinedAt: num(v.joinedAt, 0, 0),
    helper: cleanHelper(v.helper),
    simulated: v.simulated === true ? true : undefined,
    act: num(v.act, 0.5, 0, 1),
    used: int(v.used, 0, 0, 99),
    don: cleanDonated(v.don),
  };
}

function cleanChat(v: unknown): AllianceChatMessage[] {
  if (!Array.isArray(v)) return [];
  const out: AllianceChatMessage[] = [];
  for (const m of v) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.text !== 'string') continue;
    const kind = m.kind === 'system' || m.kind === 'help' ? m.kind : 'text';
    const help = isObj(m.help) && (m.help.what === 'raid' || m.help.what === 'village') ? { what: m.help.what as 'raid' | 'village', helpers: Array.isArray(m.help.helpers) ? m.help.helpers.filter((h): h is string => typeof h === 'string').slice(0, 30) : [], open: m.help.open === true } : undefined;
    out.push({ id: m.id, kind, senderUid: str(m.senderUid, '', 20), senderName: str(m.senderName, '', 20), text: m.text.slice(0, 200), sentAt: num(m.sentAt, 0, 0), ...(kind === 'help' && help ? { help } : {}) });
  }
  return out.slice(-CHAT_KEEP);
}

function cleanRaid(v: unknown): StoredRaid | null {
  if (!isObj(v) || typeof v.weekId !== 'string') return null;
  const damageBy: Record<string, number> = {};
  if (isObj(v.damageBy)) for (const [k, n] of Object.entries(v.damageBy)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) damageBy[k] = n;
  const maxHp = num(v.maxHp, 0, 1);
  return {
    weekId: v.weekId,
    bossIndex: int(v.bossIndex, 0, 0, 99),
    maxHp,
    hp: num(v.hp, maxHp, 0, maxHp),
    startsAt: num(v.startsAt, 0, 0),
    endsAt: num(v.endsAt, 0, 0),
    defeatedAt: typeof v.defeatedAt === 'number' && Number.isFinite(v.defeatedAt) ? v.defeatedAt : null,
    damageBy,
    claimed: v.claimed === true,
    ...(typeof v.lastHit === 'string' ? { lastHit: v.lastHit } : {}),
  };
}

function cleanOwn(v: unknown): OwnAlliance | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !Array.isArray(v.members)) return null;
  const members = v.members.map(cleanMember).filter((m): m is StoredMember => m !== null);
  const raid = cleanRaid(v.raid);
  const war = isObj(v.war) && typeof v.war.seasonId === 'string' ? v.war : null;
  if (members.length === 0 || !raid || !war) return null;
  const me = isObj(v.me) ? v.me : {};
  const pastRaid = isObj(v.pastRaid) && typeof v.pastRaid.weekId === 'string'
    ? { weekId: v.pastRaid.weekId, bossIndex: int(v.pastRaid.bossIndex, 0, 0, 99), defeated: v.pastRaid.defeated === true, myDamage: num(v.pastRaid.myDamage, 0, 0), myRank: int(v.pastRaid.myRank, 0, 0), claimed: v.pastRaid.claimed === true }
    : null;
  const pastWar = isObj(v.pastWar) && typeof v.pastWar.seasonId === 'string'
    ? { seasonId: v.pastWar.seasonId, league: league(v.pastWar.league), rank: int(v.pastWar.rank, 20, 1, 99), promoted: v.pastWar.promoted === true, demoted: v.pastWar.demoted === true, participated: v.pastWar.participated === true, claimed: v.pastWar.claimed === true }
    : null;
  const ticket = isObj(v.ticket) && typeof v.ticket.id === 'string' ? { id: v.ticket.id, weekId: str(v.ticket.weekId, '', 20), issuedAt: num(v.ticket.issuedAt, 0, 0), maxDamage: num(v.ticket.maxDamage, 0, 0), durationMs: num(v.ticket.durationMs, 60000, 1000) } : null;
  const borrowed: Record<string, number> = {};
  if (isObj(me.borrowed)) for (const [k, n] of Object.entries(me.borrowed)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) borrowed[k] = Math.floor(n);
  return {
    id: v.id,
    name: v.name.slice(0, 20),
    emblem: int(v.emblem, 0, 0, EMBLEM_COUNT - 1),
    description: str(v.description, '', 60),
    joinPolicy: POLICIES.includes(v.joinPolicy as JoinPolicy) ? (v.joinPolicy as JoinPolicy) : 'approval',
    minPlayerLevel: int(v.minPlayerLevel, 0, 0, 50),
    level: int(v.level, 1, 1, ALLIANCE_MAX_LEVEL),
    exp: num(v.exp, 0, 0),
    createdAt: num(v.createdAt, 0, 0),
    recruitTarget: int(v.recruitTarget, 0, 0, 30),
    members,
    applicants: Array.isArray(v.applicants)
      ? v.applicants.filter((a): a is Record<string, unknown> => isObj(a) && typeof a.uid === 'string').slice(0, 20).map((a) => ({ uid: a.uid as string, name: str(a.name, '', 20), level: int(a.level, 1, 1, 100), power: num(a.power, 0, 0), at: num(a.at, 0, 0) }))
      : [],
    coins: int(v.coins, 0, 0),
    raid,
    pastRaid,
    war: {
      seasonId: war.seasonId as string,
      league: league(war.league),
      startsAt: num(war.startsAt, 0, 0),
      raid: num(war.raid, 0, 0),
      donation: num(war.donation, 0, 0),
      stages: num(war.stages, 0, 0),
      helpers: num(war.helpers, 0, 0),
    },
    pastWar,
    chat: cleanChat(v.chat),
    day: str(v.day, '', 12),
    me: {
      day: str(me.day, '', 12),
      donated: cleanDonated(me.donated),
      used: int(me.used, 0, 0, 99),
      staminaSent: Array.isArray(me.staminaSent) ? me.staminaSent.filter((s): s is string => typeof s === 'string').slice(0, 30) : [],
      receivedGifts: int(me.receivedGifts, 0, 0, 99),
      pendingStamina: int(me.pendingStamina, 0, 0, 9999),
      invitedToday: Array.isArray(me.invitedToday) ? me.invitedToday.filter((s): s is string => typeof s === 'string').slice(0, 30) : [],
      lent: int(me.lent, 0, 0, 99),
      borrowed,
      lastHelpRequestAt: num(me.lastHelpRequestAt, 0, 0),
    },
    ticket,
    friendInvites: Array.isArray(v.friendInvites)
      ? v.friendInvites.filter((f): f is Record<string, unknown> => isObj(f) && typeof f.uid === 'string').slice(0, 20).map((f) => ({ uid: f.uid as string, name: str(f.name, '', 20), level: int(f.level, 1, 1, 100), decideAt: num(f.decideAt, 0, 0), accept: f.accept === true }))
      : [],
  };
}

function cleanWorld(v: unknown): LocalWorld | null {
  if (!isObj(v) || typeof v.seed !== 'number' || !Number.isFinite(v.seed)) return null;
  const inviteSent: Record<string, string> = {};
  if (isObj(v.inviteSent)) for (const [k, d] of Object.entries(v.inviteSent)) if (typeof d === 'string') inviteSent[k] = d;
  return {
    seed: Math.floor(v.seed) >>> 0,
    refPower: num(v.refPower, 100, 100),
    createdAt: num(v.createdAt, 0, 0),
    tickAt: num(v.tickAt, 0, 0),
    lastSeenAt: num(v.lastSeenAt, 0, 0),
    requests: Array.isArray(v.requests)
      ? v.requests.filter((r): r is Record<string, unknown> => isObj(r) && typeof r.allianceId === 'string').slice(0, 20).map((r) => ({ allianceId: r.allianceId as string, at: num(r.at, 0, 0), decideAt: num(r.decideAt, 0, 0), accept: r.accept === true }))
      : [],
    invites: Array.isArray(v.invites)
      ? v.invites
          .filter((i): i is Record<string, unknown> => isObj(i) && typeof i.allianceId === 'string')
          .slice(0, 20)
          .map((i) => ({ allianceId: i.allianceId as string, allianceName: str(i.allianceName, '', 20), emblem: int(i.emblem, 0, 0, EMBLEM_COUNT - 1), fromUid: str(i.fromUid, '', 20), fromName: str(i.fromName, '', 20), at: num(i.at, 0, 0) }))
      : [],
    inviteSent,
    own: cleanOwn(v.own),
  };
}

/** セーブから読んだ `alliance` を、使える形に直す (壊れていたら、初期状態)。 */
export function restoreAlliance(raw: unknown): AlliancePlayerState {
  const base = defaultAlliancePlayerState();
  if (!isObj(raw)) return base;
  const world = cleanWorld(raw.world);
  // 入っている同盟は、ローカルの世界が持っている (壊れて失われたら、入っていない扱い)。
  const own = world?.own ?? null;
  const shop = isObj(raw.shop) ? raw.shop : {};
  const bought: Record<string, number> = {};
  if (isObj(shop.bought)) for (const [k, n] of Object.entries(shop.bought)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) bought[k] = Math.floor(n);
  // Without a server the alliance lives in `world`; a state with an id and no world is a leftover. With one, the id is the server's.
  const online = isAllianceConfigured() && (raw.world === null || raw.world === undefined);
  const allianceId = own ? own.id : online && typeof raw.allianceId === 'string' ? raw.allianceId : null;
  return {
    version: 1,
    allianceId,
    level: allianceId ? int(own ? own.level : raw.level, 0, 0, ALLIANCE_MAX_LEVEL) : 0,
    leftAt: num(raw.leftAt, 0, 0),
    pendingStagePoints: int(raw.pendingStagePoints, 0, 0, 9999),
    shop: { week: str(shop.week, '', 12), bought },
    helperHeroId: str(raw.helperHeroId, '', 40),
    world,
  };
}
