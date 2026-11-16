/**
 * 同盟の、サーバー版 (Firestore + Cloud Functions)。AllianceBackend の全部を実装する。
 * データの形・ルール・Functions は、docs/ALLIANCE_SERVER.md と、firestore.rules / functions/ に書いてある。
 *
 * ※ 未検証: Firebase プロジェクトがまだ無いので、実際の Firestore には、つないでいない。型は通っているが、動作は、
 *   プロジェクトをつないで、確かめる必要がある。
 *
 * 作り:
 *   - Firebase SDK は、LeaderboardSystem と同じく、使うときに動的 import する (設定がなければ、一度も読み込まない)。
 *   - 認証は、匿名認証。認証uid → フレンドID (playerId) の対応は、users/{uid} と playerIndex/{playerId}。
 *     画面に出る `uid` は、すべて playerId (フレンドID)。文書のキーは、認証uid。
 *   - いくつかの文書を同時に変えるときは、transaction か writeBatch。ボスの挑戦 (切符・ダメージ) だけは、Cloud Functions の
 *     callable (`beginRaid` / `finishRaid`) を呼ぶ: ダメージの上限を、サーバーが切る。
 *   - 時刻は、サーバー時刻を使う。最初の通信で、手元の時計との差を測っておく。
 *   - 何があっても throw しない。失敗は `Result` で返す (通信できなければ 'offline')。
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { DocumentData, DocumentReference, Firestore, Timestamp, Unsubscribe } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { getFirebaseConfig, getFunctionsRegion } from '../systems/firebaseConfig';
import { sanitizeText } from '../systems/ChatSystem';
import {
  DESCRIPTION_MAX,
  EMBLEM_COUNT,
  NAME_MAX,
  NAME_MIN,
  fail,
  ok,
  type AllianceBackend,
  type AllianceChatMessage,
  type AllianceDetail,
  type AllianceInvite,
  type AllianceMember,
  type AlliancePerks,
  type AllianceRequest,
  type AllianceReward,
  type AllianceRole,
  type AllianceSettingsPatch,
  type AllianceSummary,
  type CreateAllianceParams,
  type DonationKind,
  type DonationResult,
  type Failure,
  type HelperHero,
  type JoinPolicy,
  type League,
  type PlayerProfile,
  type RaidBossDef,
  type RaidOutcome,
  type RaidRankEntry,
  type RaidTicket,
  type RaidView,
  type Result,
  type SearchQuery,
  type SupportState,
  type WarPointSource,
  type WarRankEntry,
  type WarView,
} from './AllianceBackend';
import {
  DONATION,
  MAX_PENDING_REQUESTS_OUT,
  PROFILE_SYNC_MS,
  SUPPORT,
  WAR,
  WAR_REWARD_TIERS,
  addAllianceExp,
  dayKey,
  expToNext,
  perksForLevel,
  raidBossFor,
  raidBossHp,
  raidMaxDamage,
  raidReward,
  warRewardForRank,
  weekEndMs,
  weekId,
  weekStartMs,
} from './onlineLogic';

// ---------------------------------------------------------------------------------------------- SDK

type FirestoreMod = typeof import('firebase/firestore');
type FunctionsMod = typeof import('firebase/functions');
type AuthMod = typeof import('firebase/auth');

interface Sdk {
  fs: FirestoreMod;
  fn: FunctionsMod;
  authMod: AuthMod;
  db: Firestore;
  auth: Auth;
  functions: Functions;
}

let sdkPromise: Promise<Sdk> | undefined;
let signInPromise: Promise<User> | undefined;

async function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/functions')]).then(([appMod, authMod, fs, fn]) => {
      // ランキング (LeaderboardSystem) が先に初期化していれば、それを使う。
      const app: FirebaseApp = appMod.getApps().length > 0 ? appMod.getApp() : appMod.initializeApp(getFirebaseConfig());
      return { fs, fn, authMod, db: fs.getFirestore(app), auth: authMod.getAuth(app), functions: fn.getFunctions(app, getFunctionsRegion()) };
    });
  }
  return sdkPromise;
}

async function ensureSignedIn(sdk: Sdk): Promise<User> {
  if (sdk.auth.currentUser) return sdk.auth.currentUser;
  if (!signInPromise) {
    signInPromise = new Promise<User>((resolve, reject) => {
      const unsubscribe = sdk.authMod.onAuthStateChanged(
        sdk.auth,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user);
          }
        },
        (err) => {
          unsubscribe();
          reject(err);
        },
      );
      sdk.authMod.signInAnonymously(sdk.auth).catch((err) => {
        unsubscribe();
        reject(err);
      });
    }).catch((err) => {
      signInPromise = undefined;
      throw err;
    });
  }
  return signInPromise;
}

// ---------------------------------------------------------------------------------------------- 失敗

/** 想定している失敗を、transaction の中から投げる (run() が Result にする)。 */
class Stop extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super(failure.message);
    this.failure = failure;
  }
}

const stop = (reason: Failure['reason'], message: string): never => {
  throw new Stop(fail(reason, message));
};

function toFailure(err: unknown): Failure {
  if (err instanceof Stop) return err.failure;
  const code = (err as { code?: string } | null)?.code ?? '';
  const text = err instanceof Error ? err.message : String(err);
  if (code.includes('permission-denied')) return fail('no_permission', 'この操作は、できません（権限がありません）。');
  if (code.includes('unauthenticated')) return fail('not_signed_in', 'サインインできていません。');
  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code.includes('network') || /network|offline|Failed to fetch/i.test(text)) {
    return fail('offline', '通信できませんでした。しばらくしてから、もう一度ためしてください。');
  }
  if (code.includes('resource-exhausted')) return fail('limit_reached', '回数の上限です。');
  if (code.includes('not-found')) return fail('not_found', '見つかりませんでした。');
  return fail('error', `うまくいきませんでした（${text.slice(0, 80)}）`);
}

// ---------------------------------------------------------------------------------------------- 小さな道具

const toMillis = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const ts = v as Timestamp | null | undefined;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
};
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const finiteClamp = (v: number, max = 1e300): number => (Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);

/** 名前の重複判定に使う形 (全角・半角と大文字・小文字を、同じに。Firestore の文書IDに使えない / を避ける)。 */
export function nameKey(name: string): string {
  return name.trim().normalize('NFKC').toLowerCase().replace(/\//g, '_');
}

function cleanName(name: string): string {
  return name.trim().slice(0, 24) || 'プレイヤー';
}

const ROLE_RANK: Record<AllianceRole, number> = { member: 0, officer: 1, leader: 2 };

function summaryFrom(id: string, d: DocumentData): AllianceSummary {
  const level = num(d.level, 1);
  return {
    id,
    name: str(d.name),
    emblem: num(d.emblem),
    description: str(d.description),
    level,
    memberCount: num(d.memberCount, 1),
    memberMax: num(d.memberMax, perksForLevel(level).memberMax),
    joinPolicy: (['open', 'approval', 'invite'].includes(d.joinPolicy) ? d.joinPolicy : 'approval') as JoinPolicy,
    minPlayerLevel: num(d.minPlayerLevel),
    leaderName: str(d.leaderName),
    weekPoints: num(d.weekPoints),
    power: num(d.power),
    league: (['bronze', 'silver', 'gold', 'platinum', 'diamond'].includes(d.league) ? d.league : 'bronze') as League,
  };
}

interface DirectoryEntry {
  authUid: string;
  playerId: string;
  name: string;
  role: AllianceRole;
}

interface Cached {
  at: number;
  allianceId: string;
  detail: AllianceDetail;
}

interface Session {
  authUid: string;
  playerId: string;
  /** サーバー時刻 - 手元の時計 (ミリ秒)。 */
  offset: number;
  lastSyncAt: number;
  profileKey: string;
}

interface FnOk<T> {
  ok: true;
  value: T;
}
type FnResult<T> = FnOk<T> | { ok: false; reason: Failure['reason']; message: string };

const CACHE_MS = 15_000;

// ---------------------------------------------------------------------------------------------- Backend

export class OnlineAllianceBackend implements AllianceBackend {
  readonly mode = 'online' as const;

  private session_: Session | undefined;
  private sessionPromise: Promise<Session> | undefined;
  private sdk_: Sdk | undefined;
  /** 同盟のメンバーの、フレンドID → 認証uid (load のたびに作り直す)。 */
  private directory = new Map<string, DirectoryEntry>();
  private cached: Cached | undefined;

  // ------------------------------------------------------------------ 土台

  private now(): number {
    return Date.now() + (this.session_?.offset ?? 0);
  }

  private async run<T>(fn: () => Promise<T>): Promise<Result<T>> {
    try {
      return ok(await fn());
    } catch (err) {
      return toFailure(err);
    }
  }

  private async sdk(): Promise<Sdk> {
    if (!this.sdk_) this.sdk_ = await loadSdk();
    return this.sdk_;
  }

  /** サインインして、プロフィール (users/{uid}, playerIndex/{フレンドID}) を、そろえる。1セッションに1回 + 内容が変わったとき + 10分ごと。 */
  private async session(me: PlayerProfile): Promise<Session> {
    const sdk = await this.sdk();
    const profile = { name: cleanName(me.name), level: Math.max(1, Math.min(999, Math.floor(me.level))), power: finiteClamp(me.power) };
    const key = `${me.uid}|${profile.name}|${profile.level}|${Math.round(profile.power)}`;
    const current = this.session_;
    if (current && current.playerId === me.uid && (current.profileKey === key || Date.now() - current.lastSyncAt < PROFILE_SYNC_MS)) return current;
    if (this.sessionPromise) return this.sessionPromise;
    this.sessionPromise = (async () => {
      const user = await ensureSignedIn(sdk);
      const { fs, db } = sdk;
      const userRef = fs.doc(db, 'users', user.uid);
      const snap = await fs.getDoc(userRef);
      if (!snap.exists()) {
        const batch = fs.writeBatch(db);
        batch.set(userRef, { playerId: me.uid, ...profile, allianceId: null, leftAt: null, updatedAt: fs.serverTimestamp() });
        batch.set(fs.doc(db, 'playerIndex', me.uid), { authUid: user.uid });
        try {
          await batch.commit();
        } catch (err) {
          if ((err as { code?: string }).code?.includes('permission-denied')) {
            stop('not_signed_in', 'この端末のIDは、すでに別の端末で使われています。');
          }
          throw err;
        }
      } else {
        if (snap.data().playerId !== me.uid) stop('not_signed_in', 'この端末のアカウントは、別のIDで使われています。');
        await fs.updateDoc(userRef, { ...profile, updatedAt: fs.serverTimestamp() });
      }
      // サーバー時刻との差を測る (書いた updatedAt を、読み戻す)。
      const before = Date.now();
      const written = await fs.getDoc(userRef);
      const serverNow = toMillis(written.data()?.updatedAt);
      const offset = serverNow > 0 ? serverNow - Math.round((before + Date.now()) / 2) : (this.session_?.offset ?? 0);
      const next: Session = { authUid: user.uid, playerId: me.uid, offset, lastSyncAt: Date.now(), profileKey: key };
      this.session_ = next;
      return next;
    })();
    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = undefined;
    }
  }

  private async callFn<T>(name: string, data: unknown): Promise<T> {
    const sdk = await this.sdk();
    const res = await sdk.fn.httpsCallable<unknown, FnResult<T>>(sdk.functions, name)(data);
    const body = res.data;
    if (!body || typeof body !== 'object') stop('error', 'サーバーの返事が、おかしいです。');
    if (!body.ok) throw new Stop(fail(body.reason, body.message));
    return body.value;
  }

  private invalidate(): void {
    this.cached = undefined;
  }

  /** 自分の同盟のID (users 文書の allianceId。メンバー文書が、本当にあるときだけ)。 */
  private async myAllianceId(s: Session): Promise<string | null> {
    const { fs, db } = await this.sdk();
    const user = await fs.getDoc(fs.doc(db, 'users', s.authUid));
    const id = user.data()?.allianceId;
    if (typeof id !== 'string' || !id) return null;
    const member = await fs.getDoc(fs.doc(db, 'alliances', id, 'members', s.authUid));
    return member.exists() ? id : null;
  }

  private async requireAlliance(s: Session): Promise<string> {
    const id = this.cached?.allianceId ?? (await this.myAllianceId(s));
    if (!id) return stop('not_in_alliance', '同盟に入っていません。');
    return id;
  }

  /** フレンドID → 認証uid (読み込み済みのメンバーから。なければ、メンバー一覧を引く)。 */
  private async authOf(allianceId: string, playerId: string): Promise<string> {
    const known = this.directory.get(playerId);
    if (known) return known.authUid;
    const { fs, db } = await this.sdk();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'alliances', allianceId, 'members'), fs.where('playerId', '==', playerId), fs.limit(1)));
    if (snap.empty) return stop('not_found', 'そのメンバーは、見つかりません。');
    const doc = snap.docs[0];
    this.directory.set(playerId, { authUid: doc.id, playerId, name: str(doc.data().name), role: doc.data().role });
    return doc.id;
  }

  // ------------------------------------------------------------------ 探す・入る・抜ける

  async search(me: PlayerProfile, query: SearchQuery): Promise<Result<AllianceSummary[]>> {
    return this.run(async () => {
      await this.session(me);
      const { fs, db } = await this.sdk();
      const limit = Math.max(1, Math.min(50, query.limit ?? 30));
      const text = nameKey(query.text ?? '');
      const q = text
        ? fs.query(fs.collection(db, 'alliances'), fs.where('nameLower', '>=', text), fs.where('nameLower', '<=', `${text}`), fs.limit(limit))
        : fs.query(fs.collection(db, 'alliances'), fs.orderBy('weekPoints', 'desc'), fs.limit(limit));
      const snap = await fs.getDocs(q);
      let list = snap.docs.map((d) => summaryFrom(d.id, d.data()));
      if (query.joinableOnly) list = list.filter((a) => a.joinPolicy !== 'invite' && a.memberCount < a.memberMax && me.level >= a.minPlayerLevel);
      return list;
    });
  }

  async recommended(me: PlayerProfile): Promise<Result<AllianceSummary[]>> {
    return this.run(async () => {
      await this.session(me);
      const { fs, db } = await this.sdk();
      const snap = await fs.getDocs(fs.query(fs.collection(db, 'alliances'), fs.where('joinPolicy', 'in', ['open', 'approval']), fs.orderBy('weekPoints', 'desc'), fs.limit(40)));
      const mine = Math.max(1, me.power);
      const gap = (a: AllianceSummary): number => Math.abs(Math.log10(Math.max(1, a.power / Math.max(1, a.memberCount)) / mine));
      return snap.docs
        .map((d) => summaryFrom(d.id, d.data()))
        .filter((a) => a.memberCount < a.memberMax && me.level >= a.minPlayerLevel)
        .sort((a, b) => gap(a) - gap(b))
        .slice(0, 10);
    });
  }

  /** users 文書が、もう入っていない同盟を指していたら (外された・解散された)、先に直す (入るときのルールは、users.allianceId が空であることを求める)。 */
  private async repairStale(s: Session): Promise<void> {
    const { fs, db } = await this.sdk();
    const userRef = fs.doc(db, 'users', s.authUid);
    const user = await fs.getDoc(userRef);
    const id = user.data()?.allianceId;
    if (typeof id !== 'string' || !id) return;
    const [alliance, member] = await Promise.all([fs.getDoc(fs.doc(db, 'alliances', id)), fs.getDoc(fs.doc(db, 'alliances', id, 'members', s.authUid))]);
    if (!alliance.exists() || !member.exists()) await fs.updateDoc(userRef, { allianceId: null, updatedAt: fs.serverTimestamp() });
  }

  async create(me: PlayerProfile, params: CreateAllianceParams): Promise<Result<AllianceSummary>> {
    return this.run(async () => {
      const name = params.name.trim();
      const length = Array.from(name).length;
      if (length < NAME_MIN || length > NAME_MAX) stop('bad_name', `名前は、${NAME_MIN}〜${NAME_MAX}文字にしてください。`);
      const s = await this.session(me);
      await this.repairStale(s);
      const { fs, db } = await this.sdk();
      const emblem = Math.max(0, Math.min(EMBLEM_COUNT - 1, Math.floor(params.emblem)));
      const description = Array.from(params.description.trim()).slice(0, DESCRIPTION_MAX).join('');
      const joinPolicy: JoinPolicy = (['open', 'approval', 'invite'] as const).includes(params.joinPolicy) ? params.joinPolicy : 'approval';
      const minPlayerLevel = Math.max(0, Math.min(50, Math.floor(params.minPlayerLevel)));
      const key = nameKey(name);
      const allianceRef = fs.doc(fs.collection(db, 'alliances'));
      const userRef = fs.doc(db, 'users', s.authUid);
      const profile = { name: cleanName(me.name), level: Math.max(1, Math.floor(me.level)), power: finiteClamp(me.power) };
      await fs.runTransaction(db, async (t) => {
        const user = await t.get(userRef);
        await this.assertFree(t, s, user.data());
        const taken = await t.get(fs.doc(db, 'allianceNames', key));
        if (taken.exists()) stop('name_taken', 'その名前は、すでに使われています。');
        t.set(allianceRef, {
          name,
          nameLower: key,
          emblem,
          description,
          level: 1,
          exp: 0,
          memberCount: 1,
          memberMax: perksForLevel(1).memberMax,
          joinPolicy,
          minPlayerLevel,
          leaderName: profile.name,
          leaderAuth: s.authUid,
          weekPoints: 0,
          power: profile.power,
          league: 'bronze',
          createdAt: fs.serverTimestamp(),
          updatedAt: fs.serverTimestamp(),
        });
        t.set(fs.doc(db, 'allianceNames', key), { allianceId: allianceRef.id });
        t.set(fs.doc(db, 'alliances', allianceRef.id, 'members', s.authUid), this.newMemberDoc(fs, s, profile, 'leader'));
        t.update(userRef, { allianceId: allianceRef.id, updatedAt: fs.serverTimestamp() });
      });
      this.invalidate();
      const created = await fs.getDoc(allianceRef);
      return summaryFrom(allianceRef.id, created.data() ?? {});
    });
  }

  private newMemberDoc(fs: FirestoreMod, s: Session, profile: { name: string; level: number; power: number }, role: AllianceRole): DocumentData {
    return {
      playerId: s.playerId,
      name: profile.name,
      level: profile.level,
      power: profile.power,
      role,
      contribution: 0,
      weekContribution: 0,
      weekId: weekId(this.now()),
      coins: 0,
      lastActiveAt: fs.serverTimestamp(),
      joinedAt: fs.serverTimestamp(),
      helper: null,
    };
  }

  /** どの同盟にも入っていない (入っているつもりでも、メンバー文書がなければ、入っていない)、かつ、待ち時間が済んでいる。 */
  private async assertFree(t: import('firebase/firestore').Transaction, s: Session, user: DocumentData | undefined): Promise<void> {
    const { fs, db } = await this.sdk();
    const current = user?.allianceId;
    if (typeof current === 'string' && current) {
      const member = await t.get(fs.doc(db, 'alliances', current, 'members', s.authUid));
      if (member.exists()) stop('already_in_alliance', 'すでに同盟に入っています。');
    }
    const left = toMillis(user?.leftAt);
    if (left > 0 && this.now() < left + 24 * 3_600_000) stop('cooldown', '同盟を抜けてから24時間は、別の同盟に入れません。');
  }

  async join(me: PlayerProfile, allianceId: string): Promise<Result<'joined' | 'requested'>> {
    return this.run(async () => {
      const s = await this.session(me);
      await this.repairStale(s);
      const { fs, db } = await this.sdk();
      const userRef = fs.doc(db, 'users', s.authUid);
      const allianceRef = fs.doc(db, 'alliances', allianceId);
      const requestRef = fs.doc(db, 'alliances', allianceId, 'requests', s.authUid);
      const outRef = fs.doc(db, 'users', s.authUid, 'requestsOut', allianceId);
      const inviteRef = fs.doc(db, 'users', s.authUid, 'invites', allianceId);
      const profile = { name: cleanName(me.name), level: Math.max(1, Math.floor(me.level)), power: finiteClamp(me.power) };
      const result = await fs.runTransaction(db, async (t) => {
        const user = await t.get(userRef);
        await this.assertFree(t, s, user.data());
        const alliance = await t.get(allianceRef);
        if (!alliance.exists()) return stop('not_found', 'その同盟は、見つかりません。');
        const a = alliance.data();
        const request = await t.get(requestRef);
        const invite = await t.get(inviteRef);
        const approved = request.exists() && request.data().status === 'approved';
        const full = num(a.memberCount) >= num(a.memberMax, 20);
        if (full) return stop('full', 'この同盟は、満員です。');
        const enter = (): 'joined' => {
          t.set(fs.doc(db, 'alliances', allianceId, 'members', s.authUid), this.newMemberDoc(fs, s, profile, 'member'));
          t.update(allianceRef, { memberCount: num(a.memberCount) + 1, updatedAt: fs.serverTimestamp() });
          t.update(userRef, { allianceId, updatedAt: fs.serverTimestamp() });
          if (request.exists()) t.delete(requestRef);
          t.delete(outRef);
          if (invite.exists()) t.delete(inviteRef);
          return 'joined';
        };
        if (approved || invite.exists()) return enter();
        if (a.joinPolicy === 'open') {
          if (me.level < num(a.minPlayerLevel)) return stop('level_too_low', `プレイヤーLv${num(a.minPlayerLevel)}以上で、入れます。`);
          return enter();
        }
        if (a.joinPolicy === 'invite') return stop('invite_only', 'この同盟は、招待された人だけが入れます。');
        // 承認制: 申請する。
        if (me.level < num(a.minPlayerLevel)) return stop('level_too_low', `プレイヤーLv${num(a.minPlayerLevel)}以上で、申請できます。`);
        if (request.exists()) return stop('already_requested', 'すでに申請しています。');
        t.set(requestRef, { playerId: s.playerId, name: profile.name, level: profile.level, power: profile.power, at: fs.serverTimestamp(), status: 'pending' });
        t.set(outRef, { at: fs.serverTimestamp() });
        return 'requested' as const;
      });
      if (result === 'requested') {
        const out = await fs.getDocs(fs.collection(db, 'users', s.authUid, 'requestsOut'));
        if (out.size > MAX_PENDING_REQUESTS_OUT) {
          // 申請の出しすぎ: いま出した分を、取り消す。
          await this.cancelRequest(me, allianceId);
          return stop('limit_reached', `同時に出せる申請は、${MAX_PENDING_REQUESTS_OUT}つまでです。`);
        }
      }
      this.invalidate();
      return result;
    });
  }

  async cancelRequest(me: PlayerProfile, allianceId: string): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const batch = fs.writeBatch(db);
      batch.delete(fs.doc(db, 'alliances', allianceId, 'requests', s.authUid));
      batch.delete(fs.doc(db, 'users', s.authUid, 'requestsOut', allianceId));
      await batch.commit();
      return true as const;
    });
  }

  async myRequests(me: PlayerProfile): Promise<Result<string[]>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const snap = await fs.getDocs(fs.collection(db, 'users', s.authUid, 'requestsOut'));
      return snap.docs.map((d) => d.id);
    });
  }

  async invites(me: PlayerProfile): Promise<Result<AllianceInvite[]>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const snap = await fs.getDocs(fs.collection(db, 'users', s.authUid, 'invites'));
      const list = await Promise.all(
        snap.docs.map(async (d): Promise<AllianceInvite | null> => {
          const x = d.data();
          // 招待の送り主は、認証uid。画面には、フレンドIDを出す (送り主のプロフィールを引く)。
          let fromPlayerId = '';
          try {
            fromPlayerId = str((await fs.getDoc(fs.doc(db, 'users', str(x.fromAuth)))).data()?.playerId);
          } catch {
            /* 送り主が引けなくても、招待は見せる */
          }
          return { allianceId: d.id, allianceName: str(x.allianceName), emblem: num(x.emblem), fromUid: fromPlayerId, fromName: str(x.fromName), at: toMillis(x.at) };
        }),
      );
      return list.filter((i): i is AllianceInvite => i !== null).sort((a, b) => b.at - a.at);
    });
  }

  async invite(me: PlayerProfile, friendUid: string): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const mine = await fs.getDoc(fs.doc(db, 'alliances', allianceId, 'members', s.authUid));
      if (!mine.exists() || ROLE_RANK[mine.data().role as AllianceRole] < ROLE_RANK.officer) return stop('no_permission', '招待できるのは、幹部以上です。');
      const index = await fs.getDoc(fs.doc(db, 'playerIndex', friendUid));
      if (!index.exists()) return stop('not_found', 'そのフレンドは、まだ同盟のしくみを使っていません。');
      const friendAuth = str(index.data().authUid);
      const alliance = await fs.getDoc(fs.doc(db, 'alliances', allianceId));
      const inviteRef = fs.doc(db, 'users', friendAuth, 'invites', allianceId);
      await fs.runTransaction(db, async (t) => {
        const existing = await t.get(inviteRef);
        if (existing.exists() && this.now() - toMillis(existing.data().at) < 24 * 3_600_000) stop('limit_reached', 'その人には、きょうすでに招待しています。');
        t.set(inviteRef, { allianceName: str(alliance.data()?.name), emblem: num(alliance.data()?.emblem), fromAuth: s.authUid, fromName: cleanName(me.name), at: fs.serverTimestamp() });
      });
      return true as const;
    });
  }

  async acceptInvite(me: PlayerProfile, allianceId: string): Promise<Result<true>> {
    const result = await this.join(me, allianceId);
    return result.ok ? ok(true as const) : result;
  }

  async declineInvite(me: PlayerProfile, allianceId: string): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      await fs.deleteDoc(fs.doc(db, 'users', s.authUid, 'invites', allianceId));
      return true as const;
    });
  }

  async resolveRequest(me: PlayerProfile, uid: string, accept: boolean): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const mine = await fs.getDoc(fs.doc(db, 'alliances', allianceId, 'members', s.authUid));
      if (!mine.exists() || ROLE_RANK[mine.data().role as AllianceRole] < ROLE_RANK.officer) return stop('no_permission', '承認できるのは、幹部以上です。');
      const found = await fs.getDocs(fs.query(fs.collection(db, 'alliances', allianceId, 'requests'), fs.where('playerId', '==', uid), fs.limit(1)));
      if (found.empty) return stop('not_found', 'その申請は、もうありません。');
      const ref = found.docs[0].ref;
      if (!accept) {
        await fs.deleteDoc(ref);
      } else {
        const alliance = await fs.getDoc(fs.doc(db, 'alliances', allianceId));
        if (num(alliance.data()?.memberCount) >= num(alliance.data()?.memberMax, 20)) return stop('full', '満員です。');
        // 承認は「印」をつけるだけ。申請した本人が、次に開いたときに、自分で入る (users 文書は、本人だけが書ける)。
        await fs.updateDoc(ref, { status: 'approved' });
      }
      this.invalidate();
      return true as const;
    });
  }

  async leave(me: PlayerProfile): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const allianceRef = fs.doc(db, 'alliances', allianceId);
      const memberRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid);
      const userRef = fs.doc(db, 'users', s.authUid);
      await fs.runTransaction(db, async (t) => {
        const member = await t.get(memberRef);
        if (!member.exists()) return stop('not_in_alliance', '同盟に入っていません。');
        const alliance = await t.get(allianceRef);
        const count = num(alliance.data()?.memberCount, 1);
        if (member.data().role === 'leader') {
          if (count > 1) return stop('no_permission', '同盟長は、ほかのメンバーに譲ってから、抜けてください。');
          // 1人だけ: 抜けると解散。
          t.delete(allianceRef);
          t.delete(memberRef);
          t.delete(fs.doc(db, 'allianceNames', str(alliance.data()?.nameLower)));
        } else {
          t.delete(memberRef);
          t.update(allianceRef, { memberCount: Math.max(1, count - 1), updatedAt: fs.serverTimestamp() });
        }
        t.update(userRef, { allianceId: null, leftAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
      });
      this.invalidate();
      return true as const;
    });
  }

  async kick(me: PlayerProfile, uid: string): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const target = await this.authOf(allianceId, uid);
      const allianceRef = fs.doc(db, 'alliances', allianceId);
      await fs.runTransaction(db, async (t) => {
        const mine = await t.get(fs.doc(db, 'alliances', allianceId, 'members', s.authUid));
        const theirs = await t.get(fs.doc(db, 'alliances', allianceId, 'members', target));
        if (!mine.exists()) return stop('not_in_alliance', '同盟に入っていません。');
        if (!theirs.exists()) return stop('not_found', 'そのメンバーは、もういません。');
        const my = ROLE_RANK[mine.data().role as AllianceRole];
        const their = ROLE_RANK[theirs.data().role as AllianceRole];
        if (target === s.authUid || my < ROLE_RANK.officer || their >= my) return stop('no_permission', 'このメンバーは、外せません。');
        const alliance = await t.get(allianceRef);
        t.delete(fs.doc(db, 'alliances', allianceId, 'members', target));
        t.update(allianceRef, { memberCount: Math.max(1, num(alliance.data()?.memberCount, 1) - 1), updatedAt: fs.serverTimestamp() });
      });
      this.directory.delete(uid);
      this.invalidate();
      return true as const;
    });
  }

  async setRole(me: PlayerProfile, uid: string, role: 'officer' | 'member'): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const target = await this.authOf(allianceId, uid);
      const mine = await fs.getDoc(fs.doc(db, 'alliances', allianceId, 'members', s.authUid));
      if (!mine.exists() || mine.data().role !== 'leader') return stop('no_permission', '役職を変えられるのは、同盟長だけです。');
      if (target === s.authUid) return stop('bad_input', '自分の役職は、変えられません。');
      if (role === 'officer') {
        const officers = await fs.getDocs(fs.query(fs.collection(db, 'alliances', allianceId, 'members'), fs.where('role', '==', 'officer')));
        if (officers.size >= 3) return stop('limit_reached', '幹部は、3人までです。');
      }
      await fs.updateDoc(fs.doc(db, 'alliances', allianceId, 'members', target), { role });
      this.invalidate();
      return true as const;
    });
  }

  async transferLeader(me: PlayerProfile, uid: string): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const target = await this.authOf(allianceId, uid);
      const myRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid);
      const theirRef = fs.doc(db, 'alliances', allianceId, 'members', target);
      await fs.runTransaction(db, async (t) => {
        const mine = await t.get(myRef);
        const theirs = await t.get(theirRef);
        if (!mine.exists() || mine.data().role !== 'leader') return stop('no_permission', '同盟長だけが、譲れます。');
        if (!theirs.exists() || target === s.authUid) return stop('not_found', 'そのメンバーは、見つかりません。');
        t.update(myRef, { role: 'officer' });
        t.update(theirRef, { role: 'leader' });
        t.update(fs.doc(db, 'alliances', allianceId), { leaderAuth: target, leaderName: str(theirs.data().name), updatedAt: fs.serverTimestamp() });
      });
      this.invalidate();
      return true as const;
    });
  }

  async updateSettings(me: PlayerProfile, patch: AllianceSettingsPatch): Promise<Result<AllianceSummary>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const allianceRef = fs.doc(db, 'alliances', allianceId);
      await fs.runTransaction(db, async (t) => {
        const mine = await t.get(fs.doc(db, 'alliances', allianceId, 'members', s.authUid));
        if (!mine.exists() || mine.data().role !== 'leader') return stop('no_permission', '設定を変えられるのは、同盟長だけです。');
        const alliance = await t.get(allianceRef);
        if (!alliance.exists()) return stop('not_found', '同盟が見つかりません。');
        const a = alliance.data();
        const next: DocumentData = { updatedAt: fs.serverTimestamp() };
        if (patch.name !== undefined && patch.name.trim() !== a.name) {
          const name = patch.name.trim();
          const length = Array.from(name).length;
          if (length < NAME_MIN || length > NAME_MAX) return stop('bad_name', `名前は、${NAME_MIN}〜${NAME_MAX}文字にしてください。`);
          const key = nameKey(name);
          if (key !== a.nameLower) {
            const taken = await t.get(fs.doc(db, 'allianceNames', key));
            if (taken.exists()) return stop('name_taken', 'その名前は、すでに使われています。');
            t.delete(fs.doc(db, 'allianceNames', str(a.nameLower)));
            t.set(fs.doc(db, 'allianceNames', key), { allianceId });
          }
          next.name = name;
          next.nameLower = key;
        }
        if (patch.emblem !== undefined) next.emblem = Math.max(0, Math.min(EMBLEM_COUNT - 1, Math.floor(patch.emblem)));
        if (patch.description !== undefined) next.description = Array.from(patch.description.trim()).slice(0, DESCRIPTION_MAX).join('');
        if (patch.joinPolicy !== undefined && (['open', 'approval', 'invite'] as const).includes(patch.joinPolicy)) next.joinPolicy = patch.joinPolicy;
        if (patch.minPlayerLevel !== undefined) next.minPlayerLevel = Math.max(0, Math.min(50, Math.floor(patch.minPlayerLevel)));
        t.update(allianceRef, next);
      });
      this.invalidate();
      const fresh = await fs.getDoc(allianceRef);
      return summaryFrom(allianceId, fresh.data() ?? {});
    });
  }

  async disband(me: PlayerProfile): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const allianceRef = fs.doc(db, 'alliances', allianceId);
      await fs.runTransaction(db, async (t) => {
        const mine = await t.get(fs.doc(db, 'alliances', allianceId, 'members', s.authUid));
        if (!mine.exists() || mine.data().role !== 'leader') return stop('no_permission', '解散できるのは、同盟長だけです。');
        const alliance = await t.get(allianceRef);
        t.delete(allianceRef);
        t.delete(fs.doc(db, 'allianceNames', str(alliance.data()?.nameLower)));
        t.update(fs.doc(db, 'users', s.authUid), { allianceId: null, updatedAt: fs.serverTimestamp() });
      });
      // ほかのメンバーの文書とサブコレクションは、Cloud Functions (onAllianceDeleted) が消す。メンバーの users 文書は、次に開いたときに直る。
      this.invalidate();
      return true as const;
    });
  }

  // ------------------------------------------------------------------ 読む

  async load(me: PlayerProfile): Promise<Result<AllianceDetail | null>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.withNow(this.cached.detail);

      const userRef = fs.doc(db, 'users', s.authUid);
      const user = await fs.getDoc(userRef);
      const claimed = typeof user.data()?.allianceId === 'string' ? (user.data()?.allianceId as string) : '';
      let allianceId = '';
      if (claimed) {
        const [alliance, member] = await Promise.all([fs.getDoc(fs.doc(db, 'alliances', claimed)), fs.getDoc(fs.doc(db, 'alliances', claimed, 'members', s.authUid))]);
        if (alliance.exists() && member.exists()) allianceId = claimed;
        else await fs.updateDoc(userRef, { allianceId: null, updatedAt: fs.serverTimestamp() }); // 外された・解散された: 直す
      }
      if (!allianceId) {
        // 申請が承認されていたら、ここで入る。
        const out = await fs.getDocs(fs.collection(db, 'users', s.authUid, 'requestsOut'));
        for (const o of out.docs) {
          const request = await fs.getDoc(fs.doc(db, 'alliances', o.id, 'requests', s.authUid));
          if (!request.exists()) {
            await fs.deleteDoc(o.ref);
          } else if (request.data().status === 'approved') {
            const joined = await this.join(me, o.id);
            if (joined.ok) {
              allianceId = o.id;
              break;
            }
          }
        }
      }
      if (!allianceId) {
        this.directory.clear();
        this.cached = undefined;
        return null;
      }
      const detail = await this.buildDetail(me, s, allianceId);
      this.cached = { at: Date.now(), allianceId, detail };
      await this.collectInbox(s, allianceId).catch(() => undefined);
      return detail;
    });
  }

  private withNow(detail: AllianceDetail): AllianceDetail {
    return { ...detail, now: this.now() };
  }

  private async buildDetail(me: PlayerProfile, s: Session, allianceId: string): Promise<AllianceDetail> {
    const { fs, db } = await this.sdk();
    const now = this.now();
    const week = weekId(now);
    const prevWeek = weekId(now - 7 * 86_400_000);
    const day = dayKey(now);
    const allianceRef = fs.doc(db, 'alliances', allianceId);
    const memberRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid);

    const [allianceSnap, memberSnaps, raidSnap, damageSnaps, dailySnap, entrySnap, inboxSnap, claimSnap] = await Promise.all([
      fs.getDoc(allianceRef),
      fs.getDocs(fs.collection(db, 'alliances', allianceId, 'members')),
      fs.getDoc(fs.doc(db, 'alliances', allianceId, 'raid', week)),
      fs.getDocs(fs.collection(db, 'alliances', allianceId, 'raid', week, 'damage')),
      fs.getDoc(fs.doc(db, 'alliances', allianceId, 'members', s.authUid, 'daily', day)),
      fs.getDoc(fs.doc(db, 'seasons', week, 'entries', allianceId)),
      fs.getDocs(fs.collection(db, 'alliances', allianceId, 'members', s.authUid, 'inbox')),
      fs.getDoc(fs.doc(db, 'alliances', allianceId, 'raid', week, 'claims', s.authUid)),
    ]);
    if (!allianceSnap.exists()) stop('not_found', '同盟が見つかりません。');
    const a = allianceSnap.data() ?? {};
    const summary = summaryFrom(allianceId, a);
    const perks = perksForLevel(summary.level);
    const nextPerks: AlliancePerks | null = summary.level >= 10 ? null : perksForLevel(summary.level + 1);

    // メンバーと、今週のダメージ。
    const damage = new Map<string, number>();
    for (const d of damageSnaps.docs) damage.set(d.id, num(d.data().damage));
    this.directory.clear();
    const members: AllianceMember[] = memberSnaps.docs.map((d) => {
      const x = d.data();
      const role = (['leader', 'officer', 'member'].includes(x.role) ? x.role : 'member') as AllianceRole;
      this.directory.set(str(x.playerId), { authUid: d.id, playerId: str(x.playerId), name: str(x.name), role });
      return {
        uid: str(x.playerId),
        name: str(x.name),
        level: num(x.level, 1),
        role,
        power: num(x.power),
        contribution: num(x.contribution),
        weekContribution: x.weekId === week ? num(x.weekContribution) : 0,
        weekDamage: damage.get(d.id) ?? 0,
        lastActiveAt: toMillis(x.lastActiveAt),
        joinedAt: toMillis(x.joinedAt),
        helper: x.helper ? ({ ...(x.helper as HelperHero), ownerUid: str(x.playerId), ownerName: str(x.name) } as HelperHero) : null,
      };
    });
    const mineDoc = memberSnaps.docs.find((d) => d.id === s.authUid);
    if (!mineDoc) stop('not_in_alliance', '同盟に入っていません。');
    const meMember = members.find((m) => m.uid === s.playerId) as AllianceMember;
    // 自分の情報 (名前・Lv・総合力) が変わっていたら、同盟側にも反映する (最終ログインも、ここで更新)。
    const stale = Date.now() - toMillis(mineDoc!.data().lastActiveAt) > PROFILE_SYNC_MS || mineDoc!.data().name !== cleanName(me.name) || num(mineDoc!.data().level) !== Math.floor(me.level);
    if (stale) {
      void fs.updateDoc(memberRef, { name: cleanName(me.name), level: Math.max(1, Math.floor(me.level)), power: finiteClamp(me.power), lastActiveAt: fs.serverTimestamp() }).catch(() => undefined);
    }

    const daily = dailySnap.data() ?? {};
    const donationLeft: Record<DonationKind, number> = {
      gold: Math.max(0, DONATION.gold.perDay - num(daily.donGold)),
      materials: Math.max(0, DONATION.materials.perDay - num(daily.donMaterials)),
      gems: Math.max(0, DONATION.gems.perDay - num(daily.donGems)),
    };

    // ボス。
    const totalPower = members.reduce((sum, m) => sum + m.power, 0);
    const boss: RaidBossDef = raidSnap.exists() && raidSnap.data()?.boss ? (raidSnap.data()?.boss as RaidBossDef) : raidBossFor(now);
    const maxHp = raidSnap.exists() ? num(raidSnap.data()?.maxHp) : raidBossHp(totalPower, summary.level, perks.raidAttemptsPerDay);
    const hp = raidSnap.exists() ? num(raidSnap.data()?.hp) : maxHp;
    const ranking: RaidRankEntry[] = members
      .map((m) => ({ uid: m.uid, name: m.name, damage: m.weekDamage }))
      .filter((r) => r.damage > 0)
      .sort((x, y) => y.damage - x.damage)
      .slice(0, 10)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    const claimable = await this.findClaimable(s, allianceId, now, claimSnap.exists(), raidSnap.exists() ? raidSnap.data() ?? null : null, damage.get(s.authUid) ?? 0, members);
    const raid: RaidView = {
      weekId: week,
      boss,
      maxHp,
      hp: Math.max(0, hp),
      startsAt: raidSnap.exists() ? toMillis(raidSnap.data()?.startsAt) : weekStartMs(now),
      endsAt: raidSnap.exists() ? toMillis(raidSnap.data()?.endsAt) : weekEndMs(now),
      defeatedAt: raidSnap.exists() && raidSnap.data()?.defeatedAt ? toMillis(raidSnap.data()?.defeatedAt) : null,
      attemptsLeft: Math.max(0, perks.raidAttemptsPerDay - num(daily.raidAttempts)),
      myDamage: damage.get(s.authUid) ?? 0,
      ranking,
      maxDamagePerAttempt: raidMaxDamage(me.power, maxHp),
      claimable,
    };

    // 対抗戦。
    const war = await this.buildWar(s, allianceId, summary, entrySnap.exists() ? entrySnap.data() ?? null : null, week, prevWeek);

    // 支援。
    const pending = inboxSnap.docs.filter((d) => d.data().kind === 'stamina').length;
    const receiveLeft = Math.max(0, SUPPORT.receivePerDay - num(daily.staminaReceived));
    const support: SupportState = {
      sendLeft: Math.max(0, SUPPORT.sendPerDay - num(daily.staminaSent)),
      receivable: Math.min(pending, receiveLeft) * SUPPORT.staminaAmount,
      receiveLeft,
    };

    const requests: AllianceRequest[] = [];
    if (ROLE_RANK[meMember.role] >= ROLE_RANK.officer) {
      const reqs = await fs.getDocs(fs.query(fs.collection(db, 'alliances', allianceId, 'requests'), fs.where('status', '==', 'pending')));
      for (const r of reqs.docs) requests.push({ uid: str(r.data().playerId), name: str(r.data().name), level: num(r.data().level, 1), power: num(r.data().power), at: toMillis(r.data().at) });
      requests.sort((x, y) => x.at - y.at);
    }

    const expNext = expToNext(summary.level);
    return {
      summary,
      exp: num(a.exp),
      expToNext: expNext,
      perks,
      nextPerks,
      members: members.sort((x, y) => ROLE_RANK[y.role] - ROLE_RANK[x.role] || y.weekContribution - x.weekContribution),
      me: meMember,
      coins: num(mineDoc!.data().coins),
      donationLeft,
      requests,
      raid,
      war,
      support,
      now,
    };
  }

  /** 受け取れるボスの報酬: 今週のボスが撃破済みならそれ、なければ、先週のボス (週が終わった分)。 */
  private async findClaimable(
    s: Session,
    allianceId: string,
    now: number,
    claimedThisWeek: boolean,
    raidData: DocumentData | null,
    myDamage: number,
    members: AllianceMember[],
  ): Promise<{ label: string; reward: AllianceReward } | null> {
    const target = await this.claimTarget(s, allianceId, now, claimedThisWeek, raidData, myDamage, members);
    return target ? { label: target.label, reward: target.reward } : null;
  }

  private async claimTarget(
    s: Session,
    allianceId: string,
    now: number,
    claimedThisWeek: boolean,
    raidData: DocumentData | null,
    myDamage: number,
    members: AllianceMember[],
  ): Promise<{ week: string; rank: number; label: string; reward: AllianceReward } | null> {
    const { fs, db } = await this.sdk();
    const week = weekId(now);
    if (!claimedThisWeek && raidData?.defeatedAt && myDamage > 0) {
      const rank = 1 + members.filter((m) => m.weekDamage > myDamage).length;
      const r = raidReward(true, rank);
      return { week, rank, ...r };
    }
    const prev = weekId(now - 7 * 86_400_000);
    const [prevRaid, prevClaim, prevDamage] = await Promise.all([
      fs.getDoc(fs.doc(db, 'alliances', allianceId, 'raid', prev)),
      fs.getDoc(fs.doc(db, 'alliances', allianceId, 'raid', prev, 'claims', s.authUid)),
      fs.getDocs(fs.collection(db, 'alliances', allianceId, 'raid', prev, 'damage')),
    ]);
    if (!prevRaid.exists() || prevClaim.exists()) return null;
    const mine = prevDamage.docs.find((d) => d.id === s.authUid);
    if (!mine || num(mine.data().damage) <= 0) return null;
    const rank = 1 + prevDamage.docs.filter((d) => num(d.data().damage) > num(mine.data().damage)).length;
    const r = raidReward(!!prevRaid.data()?.defeatedAt, rank);
    return { week: prev, rank, ...r };
  }

  private async buildWar(s: Session, allianceId: string, summary: AllianceSummary, entry: DocumentData | null, week: string, prevWeek: string): Promise<WarView> {
    const { fs, db } = await this.sdk();
    const now = this.now();
    const league = (entry?.league ?? summary.league) as League;
    let table: WarRankEntry[] = [];
    if (entry?.groupId) {
      const snap = await fs.getDocs(fs.query(fs.collection(db, 'seasons', week, 'entries'), fs.where('groupId', '==', entry.groupId), fs.orderBy('points', 'desc'), fs.limit(WAR.groupSize)));
      table = snap.docs.map((d, i) => ({ allianceId: d.id, name: str(d.data().name), emblem: num(d.data().emblem), points: num(d.data().points), rank: i + 1, mine: d.id === allianceId }));
    }
    if (!table.some((r) => r.mine)) table.push({ allianceId, name: summary.name, emblem: summary.emblem, points: num(entry?.points), rank: table.length + 1, mine: true });
    const mine = table.find((r) => r.mine)!;

    let claimable: WarView['claimable'] = null;
    const [result, claim] = await Promise.all([
      fs.getDoc(fs.doc(db, 'seasons', prevWeek, 'results', allianceId)),
      fs.getDoc(fs.doc(db, 'seasons', prevWeek, 'claims', `${allianceId}_${s.authUid}`)),
    ]);
    if (result.exists() && !claim.exists()) {
      const r = result.data() ?? {};
      const reward = warRewardForRank(num(r.rank, WAR.groupSize));
      claimable = { label: reward.label, rank: num(r.rank), promoted: !!r.promoted, demoted: !!r.demoted, reward: reward.reward };
    }
    return {
      seasonId: week,
      league,
      startsAt: weekStartMs(now),
      endsAt: weekEndMs(now),
      rank: mine.rank,
      points: mine.points,
      breakdown: { raid: num(entry?.raid), donation: num(entry?.donation), stages: num(entry?.stages), helpers: num(entry?.helpers) },
      table,
      rewards: WAR_REWARD_TIERS,
      claimable,
    };
  }

  subscribe(me: PlayerProfile, onChange: () => void): () => void {
    let stopped = false;
    const listeners: Unsubscribe[] = [];
    let allianceListeners: Unsubscribe[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attached = '';
    const fire = (): void => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        this.invalidate();
        if (!stopped) onChange();
      }, 400);
    };
    void (async () => {
      try {
        const s = await this.session(me);
        const { fs, db } = await this.sdk();
        if (stopped) return;
        const listen = (ref: DocumentReference | import('firebase/firestore').Query): Unsubscribe => {
          let first = true;
          return fs.onSnapshot(
            ref as DocumentReference,
            (snap: { metadata: { hasPendingWrites: boolean } }) => {
              if (first) {
                first = false;
                return;
              }
              if (!snap.metadata.hasPendingWrites) fire();
            },
            () => undefined,
          );
        };
        const attach = (allianceId: string): void => {
          for (const u of allianceListeners) u();
          allianceListeners = [];
          attached = allianceId;
          if (!allianceId) return;
          const week = weekId(this.now());
          allianceListeners.push(
            listen(fs.doc(db, 'alliances', allianceId)),
            listen(fs.doc(db, 'alliances', allianceId, 'raid', week)),
            listen(fs.query(fs.collection(db, 'alliances', allianceId, 'chat'), fs.orderBy('sentAt', 'desc'), fs.limit(1))),
          );
        };
        let firstUser = true;
        listeners.push(
          fs.onSnapshot(
            fs.doc(db, 'users', s.authUid),
            (snap) => {
              const id = typeof snap.data()?.allianceId === 'string' ? (snap.data()?.allianceId as string) : '';
              if (id !== attached) {
                attach(id);
                if (!firstUser) fire();
              }
              firstUser = false;
            },
            () => undefined,
          ),
        );
      } catch {
        /* 通信できなくても、画面は動く (手で開き直せば、読み込める) */
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const u of [...listeners, ...allianceListeners]) u();
    };
  }

  // ------------------------------------------------------------------ 育成

  async donate(me: PlayerProfile, kind: DonationKind): Promise<Result<DonationResult>> {
    return this.run(async () => {
      const rule = DONATION[kind];
      if (!rule) return stop('bad_input', '寄付の種類が、おかしいです。');
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const now = this.now();
      const week = weekId(now);
      const day = dayKey(now);
      const allianceRef = fs.doc(db, 'alliances', allianceId);
      const memberRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid);
      const dailyRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid, 'daily', day);
      const entryRef = fs.doc(db, 'seasons', week, 'entries', allianceId);
      const field = kind === 'gold' ? 'donGold' : kind === 'materials' ? 'donMaterials' : 'donGems';
      const result = await fs.runTransaction(db, async (t) => {
        const [alliance, member, daily, entry] = await Promise.all([t.get(allianceRef), t.get(memberRef), t.get(dailyRef), t.get(entryRef)]);
        if (!alliance.exists() || !member.exists()) return stop('not_in_alliance', '同盟に入っていません。');
        const d = daily.data() ?? {};
        const used = num(d[field]);
        if (used >= rule.perDay) return stop('limit_reached', 'きょうは、この寄付は、もうできません。');
        const a = alliance.data() ?? {};
        const grown = addAllianceExp(num(a.level, 1), num(a.exp), rule.allianceExp);
        t.update(allianceRef, {
          exp: grown.exp,
          level: grown.level,
          memberMax: perksForLevel(grown.level).memberMax,
          weekPoints: num(a.weekPoints) + rule.contribution,
          updatedAt: fs.serverTimestamp(),
        });
        const m = member.data() ?? {};
        const sameWeek = m.weekId === week;
        t.update(memberRef, {
          contribution: num(m.contribution) + rule.contribution,
          weekContribution: (sameWeek ? num(m.weekContribution) : 0) + rule.contribution,
          weekId: week,
          coins: num(m.coins) + rule.contribution,
          lastActiveAt: fs.serverTimestamp(),
        });
        t.set(dailyRef, { [field]: used + 1, total: num(d.total) + 1, updatedAt: fs.serverTimestamp() }, { merge: true });
        if (entry.exists()) {
          const e = entry.data() ?? {};
          t.update(entryRef, { donation: num(e.donation) + rule.contribution, points: num(e.points) + rule.contribution, updatedAt: fs.serverTimestamp() });
        }
        return { levelUp: grown.levelUp, left: rule.perDay - used - 1 };
      });
      this.invalidate();
      return { kind, allianceExp: rule.allianceExp, contribution: rule.contribution, levelUp: result.levelUp, left: result.left };
    });
  }

  async spendCoins(me: PlayerProfile, amount: number): Promise<Result<number>> {
    return this.run(async () => {
      const cost = Math.floor(amount);
      if (!(cost > 0)) return stop('bad_input', '金額が、おかしいです。');
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const memberRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid);
      const balance = await fs.runTransaction(db, async (t) => {
        const member = await t.get(memberRef);
        if (!member.exists()) return stop('not_in_alliance', '同盟に入っていません。');
        const coins = num(member.data().coins);
        if (coins < cost) return stop('not_enough', '同盟コインが足りません。');
        t.update(memberRef, { coins: coins - cost });
        return coins - cost;
      });
      this.invalidate();
      return balance;
    });
  }

  // ------------------------------------------------------------------ 共闘ボス (切符とダメージは、Cloud Functions が数える)

  async beginRaid(me: PlayerProfile): Promise<Result<RaidTicket>> {
    return this.run(async () => {
      await this.session(me);
      const ticket = await this.callFn<RaidTicket>('beginRaid', {});
      this.invalidate();
      return ticket;
    });
  }

  async finishRaid(me: PlayerProfile, ticket: RaidTicket, damage: number): Promise<Result<RaidOutcome>> {
    return this.run(async () => {
      await this.session(me);
      const clean = Math.min(finiteClamp(damage), ticket.maxDamage);
      const outcome = await this.callFn<RaidOutcome>('finishRaid', { ticketId: ticket.id, damage: clean });
      this.invalidate();
      return outcome;
    });
  }

  async claimRaidReward(me: PlayerProfile): Promise<Result<AllianceReward>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const detail = await this.buildDetail(me, s, allianceId);
      const claimedThisWeek = (await fs.getDoc(fs.doc(db, 'alliances', allianceId, 'raid', weekId(this.now()), 'claims', s.authUid))).exists();
      const raidSnap = await fs.getDoc(fs.doc(db, 'alliances', allianceId, 'raid', weekId(this.now())));
      const target = await this.claimTarget(s, allianceId, this.now(), claimedThisWeek, raidSnap.exists() ? raidSnap.data() ?? null : null, detail.raid.myDamage, detail.members);
      if (!target) return stop('not_found', '受け取れる報酬は、ありません。');
      // 1人1回: 同じ ID の文書は、二度は作れない (ルールが、update / delete を禁じている)。
      await fs.setDoc(fs.doc(db, 'alliances', allianceId, 'raid', target.week, 'claims', s.authUid), { at: fs.serverTimestamp(), rank: target.rank });
      this.invalidate();
      return target.reward;
    });
  }

  // ------------------------------------------------------------------ 対抗戦

  async addWarPoints(me: PlayerProfile, source: WarPointSource, points: number): Promise<Result<true>> {
    return this.run(async () => {
      // ボスのポイントは、サーバーが finishRaid で入れる。寄付のポイントは、donate が入れる。
      if (source !== 'stages' && source !== 'helpers') return stop('bad_input', 'このポイントは、ここからは入れられません。');
      const cap = source === 'stages' ? WAR.stagePoints : WAR.helperPoints;
      const p = Math.max(0, Math.min(cap, Math.floor(points)));
      if (p === 0) return true as const;
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const now = this.now();
      const entryRef = fs.doc(db, 'seasons', weekId(now), 'entries', allianceId);
      const dailyRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid, 'daily', dayKey(now));
      const allianceRef = fs.doc(db, 'alliances', allianceId);
      await fs.runTransaction(db, async (t) => {
        const [entry, daily, alliance] = await Promise.all([t.get(entryRef), t.get(dailyRef), t.get(allianceRef)]);
        if (!entry.exists()) return; // その週の対抗戦に、まだ入っていない (週の頭の集計待ち)
        const e = entry.data() ?? {};
        const field = source === 'stages' ? 'stages' : 'helpers';
        if (source === 'stages') {
          const used = num(daily.data()?.stages);
          if (used + p > WAR.stagePointsPerDay) return stop('limit_reached', 'きょうは、ステージのポイントは、もう入りません。');
          t.set(dailyRef, { stages: used + p, total: num(daily.data()?.total), updatedAt: fs.serverTimestamp() }, { merge: true });
        }
        t.update(entryRef, { [field]: num(e[field]) + p, points: num(e.points) + p, updatedAt: fs.serverTimestamp() });
        void alliance;
      });
      return true as const;
    });
  }

  async claimWarReward(me: PlayerProfile): Promise<Result<AllianceReward>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const prev = weekId(this.now() - 7 * 86_400_000);
      const result = await fs.getDoc(fs.doc(db, 'seasons', prev, 'results', allianceId));
      if (!result.exists()) return stop('not_found', '受け取れる報酬は、ありません。');
      const rank = num(result.data()?.rank, WAR.groupSize);
      await fs.setDoc(fs.doc(db, 'seasons', prev, 'claims', `${allianceId}_${s.authUid}`), { at: fs.serverTimestamp(), rank });
      this.invalidate();
      return warRewardForRank(rank).reward;
    });
  }

  // ------------------------------------------------------------------ 助っ人・支援

  async setHelper(me: PlayerProfile, helper: HelperHero | null): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const stored = helper ? { ...helper, ownerUid: s.playerId, ownerName: cleanName(me.name), power: finiteClamp(helper.power), setAt: this.now() } : null;
      await fs.updateDoc(fs.doc(db, 'alliances', allianceId, 'members', s.authUid), { helper: stored, lastActiveAt: fs.serverTimestamp() });
      this.invalidate();
      return true as const;
    });
  }

  async borrowHelper(me: PlayerProfile, ownerUid: string): Promise<Result<HelperHero>> {
    return this.run(async () => {
      if (ownerUid === me.uid) return stop('bad_input', '自分の助っ人は、借りられません。');
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const owner = await this.authOf(allianceId, ownerUid);
      const now = this.now();
      const day = dayKey(now);
      const week = weekId(now);
      const ownerRef = fs.doc(db, 'alliances', allianceId, 'members', owner);
      const lendRef = fs.doc(db, 'alliances', allianceId, 'lends', `${owner}_${day}`);
      const entryRef = fs.doc(db, 'seasons', week, 'entries', allianceId);
      const helper = await fs.runTransaction(db, async (t) => {
        const [ownerSnap, lend, entry] = await Promise.all([t.get(ownerRef), t.get(lendRef), t.get(entryRef)]);
        if (!ownerSnap.exists() || !ownerSnap.data().helper) return stop('not_found', 'そのメンバーは、助っ人を登録していません。');
        const found = { ...(ownerSnap.data().helper as HelperHero), ownerUid, ownerName: str(ownerSnap.data().name) };
        const n = lend.exists() ? num(lend.data()?.n) : 0;
        if (n < SUPPORT.lendRewardPerDay) {
          // 貸した人へのお礼 (同盟コイン) と、対抗戦ポイント。1日に3回まで。
          t.set(lendRef, { n: n + 1 });
          t.set(fs.doc(fs.collection(db, 'alliances', allianceId, 'members', owner, 'inbox')), { kind: 'lend', amount: SUPPORT.lendCoins, fromAuth: s.authUid, fromName: cleanName(me.name), at: fs.serverTimestamp() });
          if (entry.exists()) t.update(entryRef, { helpers: num(entry.data()?.helpers) + SUPPORT.lendCoins, points: num(entry.data()?.points) + SUPPORT.lendCoins, updatedAt: fs.serverTimestamp() });
        }
        return found;
      });
      this.invalidate();
      return helper;
    });
  }

  async sendStamina(me: PlayerProfile, toUid: string): Promise<Result<true>> {
    return this.run(async () => {
      if (toUid === me.uid) return stop('bad_input', '自分には、贈れません。');
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const target = await this.authOf(allianceId, toUid);
      const dailyRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid, 'daily', dayKey(this.now()));
      await fs.runTransaction(db, async (t) => {
        const daily = await t.get(dailyRef);
        const sent = num(daily.data()?.staminaSent);
        if (sent >= SUPPORT.sendPerDay) return stop('limit_reached', 'きょう贈れるのは、5人までです。');
        t.set(dailyRef, { staminaSent: sent + 1, total: num(daily.data()?.total), updatedAt: fs.serverTimestamp() }, { merge: true });
        t.set(fs.doc(fs.collection(db, 'alliances', allianceId, 'members', target, 'inbox')), { kind: 'stamina', amount: SUPPORT.staminaAmount, fromAuth: s.authUid, fromName: cleanName(me.name), at: fs.serverTimestamp() });
      });
      this.invalidate();
      return true as const;
    });
  }

  async claimStamina(me: PlayerProfile): Promise<Result<number>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const dailyRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid, 'daily', dayKey(this.now()));
      const [daily, inbox] = await Promise.all([fs.getDoc(dailyRef), fs.getDocs(fs.query(fs.collection(db, 'alliances', allianceId, 'members', s.authUid, 'inbox'), fs.limit(50)))]);
      const received = num(daily.data()?.staminaReceived);
      const room = Math.max(0, SUPPORT.receivePerDay - received);
      const gifts = inbox.docs.filter((d) => d.data().kind === 'stamina').sort((x, y) => toMillis(x.data().at) - toMillis(y.data().at)).slice(0, room);
      if (gifts.length === 0) return 0;
      const batch = fs.writeBatch(db);
      for (const g of gifts) batch.delete(g.ref);
      batch.set(dailyRef, { staminaReceived: received + gifts.length, total: num(daily.data()?.total), updatedAt: fs.serverTimestamp() }, { merge: true });
      await batch.commit();
      this.invalidate();
      return gifts.length * SUPPORT.staminaAmount;
    });
  }

  /** 受け取り箱の、助っ人のお礼 (同盟コイン) を、自分のコインに入れる (1日に15まで)。load の最後に、あれば行う。 */
  private async collectInbox(s: Session, allianceId: string): Promise<void> {
    const { fs, db } = await this.sdk();
    const inbox = await fs.getDocs(fs.query(fs.collection(db, 'alliances', allianceId, 'members', s.authUid, 'inbox'), fs.where('kind', '==', 'lend'), fs.limit(10)));
    if (inbox.empty) return;
    const dailyRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid, 'daily', dayKey(this.now()));
    const memberRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid);
    await fs.runTransaction(db, async (t) => {
      const [daily, member] = await Promise.all([t.get(dailyRef), t.get(memberRef)]);
      const claimed = num(daily.data()?.lendCoinsClaimed);
      let room = 15 - claimed;
      let coins = 0;
      for (const item of inbox.docs) {
        const amount = num(item.data().amount);
        if (amount <= room) {
          coins += amount;
          room -= amount;
        }
        t.delete(item.ref); // 上限を超えたぶんも、箱からは、消す
      }
      if (coins > 0) {
        t.update(memberRef, { coins: num(member.data()?.coins) + coins });
        t.set(dailyRef, { lendCoinsClaimed: claimed + coins, total: num(daily.data()?.total), updatedAt: fs.serverTimestamp() }, { merge: true });
      }
    });
    this.cached = undefined;
  }

  async requestHelp(me: PlayerProfile, what: 'raid' | 'village'): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      await fs.addDoc(fs.collection(db, 'alliances', allianceId, 'chat'), {
        kind: 'help',
        senderAuth: s.authUid,
        senderPlayerId: s.playerId,
        senderName: cleanName(me.name),
        text: what === 'raid' ? '共闘ボスを倒すため、手を貸してください！' : '村が襲われています！ 手を貸してください！',
        sentAt: fs.serverTimestamp(),
        help: { what, helpers: [], open: true },
      });
      return true as const;
    });
  }

  async answerHelp(me: PlayerProfile, messageId: string): Promise<Result<true>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const now = this.now();
      const chatRef = fs.doc(db, 'alliances', allianceId, 'chat', messageId);
      const dailyRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid, 'daily', dayKey(now));
      const memberRef = fs.doc(db, 'alliances', allianceId, 'members', s.authUid);
      const name = cleanName(me.name);
      await fs.runTransaction(db, async (t) => {
        const [chat, daily, member] = await Promise.all([t.get(chatRef), t.get(dailyRef), t.get(memberRef)]);
        if (!chat.exists() || chat.data().kind !== 'help') return stop('not_found', 'その救援は、もうありません。');
        const help = chat.data().help as { what: 'raid' | 'village'; helpers: string[]; open: boolean };
        if (chat.data().senderAuth === s.authUid) return stop('bad_input', '自分の救援には、答えられません。');
        if (!help.open || help.helpers.includes(name)) return stop('limit_reached', 'すでに答えています。');
        t.update(chatRef, { help: { ...help, helpers: [...help.helpers, name] } });
        const answers = num(daily.data()?.answers);
        if (answers < SUPPORT.answersPerDay) {
          const m = member.data() ?? {};
          t.update(memberRef, {
            contribution: num(m.contribution) + SUPPORT.answerContribution,
            weekContribution: (m.weekId === weekId(now) ? num(m.weekContribution) : 0) + SUPPORT.answerContribution,
            weekId: weekId(now),
            coins: num(m.coins) + SUPPORT.answerContribution,
          });
          t.set(dailyRef, { answers: answers + 1, total: num(daily.data()?.total), updatedAt: fs.serverTimestamp() }, { merge: true });
        }
      });
      this.invalidate();
      return true as const;
    });
  }

  // ------------------------------------------------------------------ チャット

  private chatFrom(id: string, d: DocumentData): AllianceChatMessage {
    const kind = (['text', 'system', 'help'].includes(d.kind) ? d.kind : 'text') as AllianceChatMessage['kind'];
    const message: AllianceChatMessage = {
      id,
      kind,
      senderUid: kind === 'system' ? 'system' : str(d.senderPlayerId),
      senderName: kind === 'system' ? '同盟' : str(d.senderName),
      text: str(d.text),
      sentAt: toMillis(d.sentAt) || this.now(),
    };
    if (kind === 'help' && d.help) message.help = { what: d.help.what === 'village' ? 'village' : 'raid', helpers: Array.isArray(d.help.helpers) ? d.help.helpers.map(String) : [], open: d.help.open === true };
    return message;
  }

  async chat(me: PlayerProfile, limit = 50): Promise<Result<AllianceChatMessage[]>> {
    return this.run(async () => {
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const snap = await fs.getDocs(fs.query(fs.collection(db, 'alliances', allianceId, 'chat'), fs.orderBy('sentAt', 'desc'), fs.limit(Math.max(1, Math.min(200, limit)))));
      return snap.docs.map((d) => this.chatFrom(d.id, d.data())).reverse();
    });
  }

  async sendChat(me: PlayerProfile, text: string): Promise<Result<AllianceChatMessage>> {
    return this.run(async () => {
      const clean = sanitizeText(text);
      if (!clean) return stop('bad_input', 'メッセージが、空です。');
      const s = await this.session(me);
      const { fs, db } = await this.sdk();
      const allianceId = await this.requireAlliance(s);
      const ref = await fs.addDoc(fs.collection(db, 'alliances', allianceId, 'chat'), {
        kind: 'text',
        senderAuth: s.authUid,
        senderPlayerId: s.playerId,
        senderName: cleanName(me.name),
        text: clean,
        sentAt: fs.serverTimestamp(),
      });
      return { id: ref.id, kind: 'text' as const, senderUid: s.playerId, senderName: cleanName(me.name), text: clean, sentAt: this.now() };
    });
  }
}

/** AllianceService が、Firebase が設定されているときだけ、読み込んで使う。 */
export function createOnlineAllianceBackend(): AllianceBackend {
  return new OnlineAllianceBackend();
}
