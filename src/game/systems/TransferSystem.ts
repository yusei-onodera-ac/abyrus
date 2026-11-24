import { TRANSFER_TEXT } from '../data/transferText';
import { defaultAlliancePlayerState } from '../alliance/AllianceSave';
import { allianceStaminaBonus } from '../data/alliance';
import { staminaMaxFor } from '../data/playerLevel';
import { SAVE_VERSION, SaveSystem, type SaveData } from './SaveSystem';
import {
  MAX_CIPHERTEXT_BYTES,
  PASSWORD_MAX,
  PASSWORD_MIN,
  TooLargeError,
  decryptText,
  encryptText,
  generateCode,
  normalizeCode,
  packageProblem,
  passwordProblem,
  type EncryptedPackage,
} from './TransferCrypto';

/**
 * データ引き継ぎ (設計と理由は PR / firestore.rules の `transfers`):
 *
 *   発行: いまのセーブを、パスワードで暗号化 (TransferCrypto) して、ランダムなコードのドキュメントとして、サーバーに預ける。
 *         パスワードは、サーバーにも、この端末にも、残らない。もとのコードは、新しいものができたあとで消す。
 *   引き継ぎ: コードで暗号文を受け取り (get だけ。一覧はできない)、パスワードで開き、本物のセーブか調べ、SaveSystem.restoreFrom の
 *         ふつうの読み込み (古い形の直しなど) を通して、新しい端末の identity にそろえる (adoptTransferred)。
 *         途中のどこで失敗しても、この端末のセーブには、さわらない (置きかえは、呼ぶ側が、最後にする)。
 *
 * 通信は `TransferTransport` に隠してある (本番は TransferStore.ts の Firestore。テストは、メモリのもの)。何があっても throw せず、`Result` で返す。
 */

// ---------------------------------------------------------------------------------------------- 通信の窓口

/** サーバーに置くドキュメント。ID は、引き継ぎコード (ハイフンなし20文字)。 */
export interface TransferDoc extends EncryptedPackage {
  /** 発行した端末の、認証uid。消せるのは、この uid だけ (firestore.rules)。 */
  ownerUid: string;
  /** サーバーの時刻 (epoch ms)。 */
  savedAt: number;
}

export type TransportFailure = 'not_configured' | 'offline' | 'denied' | 'error';

export class TransportError extends Error {
  readonly reason: TransportFailure;
  constructor(reason: TransportFailure, detail: string = reason) {
    super(detail);
    this.reason = reason;
  }
}

export interface TransferTransport {
  /** 認証uid (なければ、匿名でサインインする)。 */
  uid(): Promise<string>;
  /** 新しいコードのドキュメントを作る (同じコードが、すでにあれば失敗する)。 */
  put(code: string, doc: Omit<TransferDoc, 'savedAt'>): Promise<void>;
  /** コードのドキュメント。なければ null。 */
  get(code: string): Promise<TransferDoc | null>;
  /** コードのドキュメントを消す (なくても、成功)。 */
  remove(code: string): Promise<void>;
}

/** 通信のないもの (テストと、開発用の `?transferdev`)。 */
export function createMemoryTransport(uid: string, store: Map<string, TransferDoc> = new Map(), now: () => number = Date.now): TransferTransport {
  return {
    uid: async () => uid,
    async put(code, doc) {
      if (store.has(code)) throw new TransportError('denied', 'exists');
      store.set(code, { ...doc, savedAt: now() });
    },
    get: async (code) => {
      const doc = store.get(code);
      return doc ? { ...doc } : null;
    },
    async remove(code) {
      const doc = store.get(code);
      if (doc && doc.ownerUid !== uid) throw new TransportError('denied', 'not the owner');
      store.delete(code);
    },
  };
}

// ---------------------------------------------------------------------------------------------- 結果

export type TransferFailure =
  | 'not_configured'
  | 'bad_code'
  | 'bad_password'
  | 'not_found'
  | 'wrong_password'
  | 'locked'
  | 'offline'
  | 'denied'
  | 'broken'
  | 'newer'
  | 'unsupported'
  | 'too_large'
  | 'error';

export type TransferResult<T> = ({ ok: true } & T) | { ok: false; reason: TransferFailure; message: string };

const T = TRANSFER_TEXT.errors;

function fail(reason: TransferFailure, message: string): { ok: false; reason: TransferFailure; message: string } {
  return { ok: false, reason, message };
}

function transportFailure(err: unknown): { ok: false; reason: TransferFailure; message: string } {
  const reason = err instanceof TransportError ? err.reason : 'error';
  if (reason === 'not_configured') return fail('not_configured', T.notConfigured);
  if (reason === 'offline') return fail('offline', T.offline);
  if (reason === 'denied') return fail('denied', T.denied);
  return fail('error', T.unknown);
}

export const PASSWORD_LIMITS = { min: PASSWORD_MIN, max: PASSWORD_MAX };

/** パスワードの決まりに合わないとき、画面に出す言葉。よければ null。 */
export function passwordMessage(password: string): string | null {
  switch (passwordProblem(password)) {
    case 'empty':
      return T.passwordEmpty;
    case 'short':
      return T.passwordShort(PASSWORD_MIN);
    case 'long':
      return T.passwordLong(PASSWORD_MAX);
    case 'weak':
      return T.passwordWeak;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------- この端末に残す、小さな記録

const ISSUED_KEY = 'abyrus_transfer_v1';
const LOCK_KEY = 'abyrus_transfer_lock_v1';

/** 何回まちがえると止めるか / 止めておく時間 (ミリ秒)。 */
export const MAX_WRONG_TRIES = 5;
export const LOCK_MS = 10 * 60 * 1000;

function readJson<V>(key: string): V | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as V) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 残せなくても、引き継ぎそのものは、できている。
  }
}

export interface IssuedRecord {
  /** 20文字のコード (ハイフンなし)。パスワードは、残さない。 */
  code: string;
  issuedAt: number;
  ownerUid: string;
}

// ---------------------------------------------------------------------------------------------- セーブの検査

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 本物のセーブらしいか。ふつうの読み込み (SaveSystem.restoreFrom) は、足りない所を黙って初期値で埋めるので、
 *  壊れたものや別のものを「引き継げた」ことにしないよう、その前に形を調べる。 */
export function checkSaveShape(raw: unknown): 'ok' | 'broken' | 'newer' {
  if (!isRecord(raw)) return 'broken';
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) return 'broken';
  if ((raw.version as number) > SAVE_VERSION) return 'newer';
  const heroes = raw.heroes;
  if (!Array.isArray(heroes) || heroes.length < 1 || heroes.length > 20_000) return 'broken';
  if (!heroes.every((h) => isRecord(h) && typeof h.id === 'string' && typeof h.heroId === 'string' && finite(h.level) && h.level >= 1)) return 'broken';
  if (!Array.isArray(raw.gold) || raw.gold.length !== 2 || !raw.gold.every(finite)) return 'broken';
  if (!finite(raw.gems) || !finite(raw.stageProgress) || raw.stageProgress < 0) return 'broken';
  if (!finite(raw.playerLevel) || raw.playerLevel < 1) return 'broken';
  if (typeof raw.playerName !== 'string') return 'broken';
  if (!Array.isArray(raw.decks) && !isRecord(raw.party)) return 'broken';
  if (!isRecord(raw.social) || typeof raw.social.playerId !== 'string') return 'broken';
  return 'ok';
}

/** まだ何も遊んでいない、できたての (チュートリアルの前の) セーブか。置きかえの前に「消えます」と聞くかどうかを決める。 */
export function isFreshSave(save: SaveData): boolean {
  return !save.tutorial.done && save.tutorial.step === 0 && save.stageProgress === 0 && save.extraProgress === 0 && save.playerLevel === 1 && save.heroes.length <= 3 && Object.keys(save.gachaPity).length === 0;
}

// ---------------------------------------------------------------------------------------------- identity

export interface AdoptOptions {
  /** 同盟をサーバーで動かしているか (isAllianceConfigured)。 */
  online: boolean;
  /** 引き継ぎで、チュートリアルを終えたことにする (チュートリアルの 名前 step から引き継いだとき)。 */
  finishTutorial: boolean;
}

/**
 * 引き継いだセーブを、この端末の identity にそろえる。
 *
 * 端末ごとに、認証uid (匿名認証) が違う。サーバーの identity (users/{uid} = フレンドID、playerIndex/{フレンドID} -> uid、同盟のメンバー文書、
 * ランキングの文書) は、すべて「認証uid」に結びついていて、フレンドIDの付けかえ (playerIndex の更新) は、ルールで禁じている。
 * Cloud Function なしでは、新しい端末の uid が、前の端末のフレンドIDや同盟の席を、引き継ぐことはできない。そこで:
 *   - フレンドID (social.playerId) は、この端末のものを使う (サーバーの uid との組が、そのまま保たれる)。持ち主が同じ uid なら、同じ値のまま。
 *   - 同盟 (サーバーで動かしているとき): 入っている印をはずし、助っ人の登録・ポイントの持ち越しを消す。同盟の席は、前の端末の uid についたまま
 *     なので、入り直しになる。この端末の uid が、すでに同盟に入っていれば、次に同盟を開いたときにサーバーの状態が、セーブに写る (AllianceService.refresh)。
 *     週の同盟ショップの購入数は、残す (引き継ぎで、週の上限を戻せないように)。サーバーを使わない版 (疑似メンバー) は、セーブの中で完結するので、そのまま。
 *   - ランキング (infiniteModeScores/{認証uid}) は、削除できないので、前の記録は、前の uid のまま残る。この端末では、次に出したスコアから、新しい記録になる。
 */
export function adoptTransferred(incoming: SaveData, device: SaveData, opts: AdoptOptions): SaveData {
  const next = incoming;
  next.social = { ...next.social, playerId: device.social.playerId };
  if (opts.online) {
    next.alliance = { ...defaultAlliancePlayerState(), leftAt: next.alliance.leftAt, shop: next.alliance.shop };
    // スタミナの上限は、入っている同盟のぶんが、のっている (なくなったので、そろえる。いまの量は、そのまま)。
    next.stamina = [next.stamina[0], staminaMaxFor(next.playerLevel) + allianceStaminaBonus(next)];
  }
  if (opts.finishTutorial) next.tutorial = { ...next.tutorial, opening: true, done: true };
  return next;
}

// ---------------------------------------------------------------------------------------------- 発行・引き継ぎ

/** 保存した時刻 (画面に出す、'2026/11/18 12:34')。 */
export function formatWhen(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface IssueOk {
  /** ハイフンなしの20文字 (formatCode で画面用に)。 */
  code: string;
  issuedAt: number;
  /** 前のコードを消せたか。前のコードがなかったときは null。 */
  replaced: boolean | null;
}

export interface OpenOk {
  /** 検査して、ふつうの読み込みを通した、引き継ぎ前のセーブ (identity は、まだ、そろえていない)。 */
  save: SaveData;
  savedAt: number;
}

export const TransferSystem = {
  /** 前に、この端末で発行したコード (なければ null)。 */
  lastIssued(): IssuedRecord | null {
    const r = readJson<IssuedRecord>(ISSUED_KEY);
    return r && typeof r.code === 'string' && normalizeCode(r.code) === r.code && finite(r.issuedAt) ? r : null;
  },

  /** いまのセーブを暗号化して、新しいコードで預ける。前のコードがあれば、そのあとで消す。(`options.iterations` は、テストで鍵づくりを速くするため。) */
  async issue(save: SaveData, password: string, transport: TransferTransport | null, now: number = Date.now(), options: { iterations?: number } = {}): Promise<TransferResult<IssueOk>> {
    if (!transport) return fail('not_configured', T.notConfigured);
    const bad = passwordMessage(password);
    if (bad) return fail('bad_password', bad);
    let pkg: EncryptedPackage;
    try {
      const text = JSON.stringify({ app: 'abyrus', format: 1, exportedAt: now, save });
      pkg = await encryptText(text, password, { iterations: options.iterations });
    } catch (err) {
      if (err instanceof TooLargeError) return fail('too_large', T.tooLarge(Math.round(MAX_CIPHERTEXT_BYTES / 1000)));
      return fail('unsupported', T.unsupported);
    }
    try {
      const ownerUid = await transport.uid();
      const code = generateCode();
      await transport.put(code, { ...pkg, ownerUid });
      const previous = TransferSystem.lastIssued();
      let replaced: boolean | null = null;
      if (previous) {
        try {
          // 前のコードは、同じ uid が発行したものだけ、消せる (ルール)。別の端末で発行したものは、消せない。
          await transport.remove(previous.code);
          replaced = true;
        } catch {
          replaced = false;
        }
      }
      writeJson(ISSUED_KEY, { code, issuedAt: now, ownerUid } satisfies IssuedRecord);
      return { ok: true, code, issuedAt: now, replaced };
    } catch (err) {
      return transportFailure(err);
    }
  },

  /** まちがえすぎて止まっているとき、あと何ミリ秒か (止まっていなければ 0)。 */
  lockedFor(now: number = Date.now()): number {
    const lock = readJson<{ fails: number; until: number }>(LOCK_KEY);
    return lock && finite(lock.until) && lock.until > now ? lock.until - now : 0;
  },

  /** パスワードを、あと何回まちがえられるか。 */
  triesLeft(): number {
    const lock = readJson<{ fails: number; until: number }>(LOCK_KEY);
    return Math.max(0, MAX_WRONG_TRIES - (lock && finite(lock.fails) ? lock.fails : 0));
  },

  recordWrongPassword(now: number = Date.now()): void {
    const lock = readJson<{ fails: number; until: number }>(LOCK_KEY);
    // 止まる時間が終わったあとの、最初のまちがいは、数え直し。
    const expired = !!lock && finite(lock.until) && lock.until > 0 && lock.until <= now;
    const fails = (expired || !lock || !finite(lock.fails) ? 0 : lock.fails) + 1;
    writeJson(LOCK_KEY, fails >= MAX_WRONG_TRIES ? { fails, until: now + LOCK_MS } : { fails, until: 0 });
  },

  recordSuccess(): void {
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      // 何も残っていない。
    }
  },

  /** 受け取ったセーブを、この端末のセーブにする: identity をそろえ (adoptTransferred)、ブラウザに書く。書けなければ、何も変わらない
   *  (ブラウザのセーブは、そのまま)。成功したら、呼ぶ側が、ゲームの registry の 'save' を、返したものに入れかえて、画面を開き直す。 */
  apply(device: SaveData, incoming: SaveData, opts: AdoptOptions): TransferResult<{ save: SaveData }> {
    const next = adoptTransferred(incoming, device, opts);
    next.updatedAt = Date.now();
    if (!SaveSystem.persist(next)) return fail('error', TRANSFER_TEXT.restore.doneRetry);
    return { ok: true, save: next };
  },

  /** コードとパスワードで、預けたセーブを受け取って、開く。この端末のセーブには、さわらない。 */
  async open(codeInput: string, password: string, transport: TransferTransport | null, now: number = Date.now()): Promise<TransferResult<OpenOk>> {
    if (!transport) return fail('not_configured', T.notConfigured);
    if (!codeInput.trim()) return fail('bad_code', T.codeEmpty);
    const code = normalizeCode(codeInput);
    if (!code) return fail('bad_code', T.codeBad);
    if (!password) return fail('bad_password', T.passwordEmpty);
    const wait = TransferSystem.lockedFor(now);
    if (wait > 0) return fail('locked', T.locked(Math.ceil(wait / 60_000)));

    let doc: TransferDoc | null;
    try {
      doc = await transport.get(code);
    } catch (err) {
      return transportFailure(err);
    }
    if (!doc) return fail('not_found', T.notFound);
    if (packageProblem(doc)) return fail('broken', T.broken);

    const opened = await decryptText(doc, password);
    if (!opened.ok) {
      if (opened.reason === 'unsupported') return fail('unsupported', T.unsupported);
      if (opened.reason === 'format') return fail('broken', T.broken);
      TransferSystem.recordWrongPassword(now);
      const left = TransferSystem.triesLeft();
      return left > 0 ? fail('wrong_password', T.wrongPasswordLeft(left)) : fail('locked', T.locked(Math.ceil(LOCK_MS / 60_000)));
    }
    TransferSystem.recordSuccess();

    let payload: unknown;
    try {
      payload = JSON.parse(opened.text);
    } catch {
      return fail('broken', T.broken);
    }
    if (!isRecord(payload) || payload.app !== 'abyrus' || payload.format !== 1) return fail('broken', T.broken);
    const shape = checkSaveShape(payload.save);
    if (shape === 'newer') return fail('newer', T.newer);
    if (shape !== 'ok') return fail('broken', T.broken);
    let save: SaveData;
    try {
      save = SaveSystem.restoreFrom(payload.save);
    } catch {
      return fail('broken', T.broken);
    }
    if (save.heroes.length === 0) return fail('broken', T.broken);
    return { ok: true, save, savedAt: finite(doc.savedAt) && doc.savedAt > 0 ? doc.savedAt : now };
  },
};
