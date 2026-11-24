/**
 * データ引き継ぎの、暗号の部分。Phaser も Firebase も使わない (ブラウザの WebCrypto だけ。Node でも動く)。
 *
 *  - 引き継ぎコード: 紛らわしい文字 (I O 0 1) を除いた32文字から、乱数で20文字。32文字 = ちょうど5ビットなので、かたよりはない (100ビット)。
 *    画面には XXXXX-XXXXX-XXXXX-XXXXX の形で出す。サーバーでは、ハイフンなしの20文字が、ドキュメントIDになる。
 *  - 暗号化: パスワードから PBKDF2 (SHA-256, 60万回) で鍵を作り、AES-GCM (256ビット) で暗号化する。パスワードは、この端末の外に出ない。
 *    サーバーに置くのは、暗号文・salt・iv と、その作り方 (回数・圧縮) だけ。
 *  - 圧縮: 暗号化の前に gzip で縮める (セーブは繰り返しが多く、10分の1ほどになる)。この端末に CompressionStream がなければ、縮めずに置く。
 *    受け取る側に DecompressionStream がなければ、縮めてあるデータは開けない ('unsupported')。
 *  - GCM の認証タグが、パスワード違いと改ざんの両方を見分ける。どちらも 'password' として返す (中身を、壊れたまま、渡すことはない)。
 *    additionalData に「形式の版 + 圧縮の有無」を入れてあるので、サーバー上でそれを書きかえても、開けなくなる。
 */

/** 引き継ぎコードに使う文字 (SocialSystem の友達IDと同じ。I O 0 1 は入れない)。 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 20;
const CODE_GROUP = 5;

/** サーバーに置く暗号文の上限 (バイト)。Firestore のドキュメントは 1MiB までで、base64 にすると 4/3 倍になるので、余裕をみて 600,000。 */
export const MAX_CIPHERTEXT_BYTES = 600_000;
/** 開いたあとの JSON の上限 (圧縮爆弾よけ)。 */
export const MAX_PLAIN_BYTES = 32 * 1024 * 1024;

export const TRANSFER_FORMAT = 1;
export const KDF_NAME = 'PBKDF2-SHA256';
export const KDF_ITERATIONS = 600_000;
/** 受け取るときに許す回数の範囲 (firestore.rules と同じ)。 */
export const KDF_ITERATIONS_MIN = 100_000;
export const KDF_ITERATIONS_MAX = 2_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

export type Compression = 'gzip' | 'none';

/** サーバーに置く暗号文の一式 (+ そのドキュメントの持ち主と時刻は、TransferSystem が足す)。 */
export interface EncryptedPackage {
  version: number;
  kdf: string;
  iterations: number;
  /** base64 (16バイト)。 */
  salt: string;
  /** base64 (12バイト)。 */
  iv: string;
  compression: Compression;
  /** base64。 */
  ciphertext: string;
  /** 暗号文のバイト数 (base64 にする前)。 */
  size: number;
}

export type DecryptResult = { ok: true; text: string } | { ok: false; reason: 'password' | 'format' | 'unsupported' };

export class TooLargeError extends Error {
  readonly bytes: number;
  constructor(bytes: number) {
    super(`transfer data too large: ${bytes} bytes`);
    this.bytes = bytes;
  }
}

// ---------------------------------------------------------------------------------------------- コード

export function generateCode(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(CODE_LENGTH));
  // 256 は 32 で割り切れるので、剰余でかたよらない。
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** "ABCDEFGHJKLMNPQRSTUV" -> "ABCDE-FGHJK-LMNPQ-RSTUV" */
export function formatCode(code: string): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += CODE_GROUP) groups.push(code.slice(i, i + CODE_GROUP));
  return groups.join('-');
}

/** 入力されたコードを、20文字の形にする (大文字小文字・全角・空白・ハイフンは問わない)。形が違えば null。 */
export function normalizeCode(input: string): string | null {
  const code = input.normalize('NFKC').toUpperCase().replace(/[\s\-_]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  return Array.from(code).every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

// ---------------------------------------------------------------------------------------------- パスワード

/** パスワードとして使う形 (全角の英数字を半角に揃える: 端末で入力のしかたが違っても、同じパスワードになる)。 */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

const COMMON_PASSWORDS = ['password', 'passw0rd', '12345678', '123456789', '1234567890', 'qwertyui', 'abcdefgh', '11111111', '00000000', 'abyrus123', 'abyrusabyrus'];

/** パスワードの決まりに合わないとき、その理由。よければ null。 */
export function passwordProblem(password: string): 'empty' | 'short' | 'long' | 'weak' | null {
  const text = normalizePassword(password);
  if (text.length === 0) return 'empty';
  const length = Array.from(text).length;
  if (length < PASSWORD_MIN) return 'short';
  if (length > PASSWORD_MAX) return 'long';
  if (new Set(Array.from(text)).size < 3 || COMMON_PASSWORDS.includes(text.toLowerCase())) return 'weak';
  return null;
}

// ---------------------------------------------------------------------------------------------- base64 と 圧縮

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** base64 を、バイト列に。形が違えば null。 */
export function fromBase64(text: string): Uint8Array | null {
  if (typeof text !== 'string' || text.length === 0 || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  try {
    const raw = atob(text);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function canCompress(): boolean {
  return typeof CompressionStream === 'function';
}
export function canDecompress(): boolean {
  return typeof DecompressionStream === 'function';
}

async function pipe(bytes: Uint8Array, transform: ReadableWritablePair<Uint8Array, Uint8Array>, limit: number): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new TooLargeError(total);
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>, MAX_PLAIN_BYTES);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>, MAX_PLAIN_BYTES);
}

// ---------------------------------------------------------------------------------------------- 暗号化

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function aad(version: number, compression: string): Uint8Array {
  return encoder.encode(`abyrus-transfer/${version}/${compression}`);
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(normalizePassword(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** `text` を暗号化して、サーバーに置く形にする。大きすぎれば TooLargeError。 */
export async function encryptText(text: string, password: string, options: { iterations?: number; compress?: boolean } = {}): Promise<EncryptedPackage> {
  const iterations = options.iterations ?? KDF_ITERATIONS;
  const raw = encoder.encode(text);
  const compression: Compression = options.compress !== false && canCompress() ? 'gzip' : 'none';
  const plain = compression === 'gzip' ? await gzip(raw) : raw;
  if (plain.length + TAG_BYTES > MAX_CIPHERTEXT_BYTES) throw new TooLargeError(plain.length + TAG_BYTES);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, iterations);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(TRANSFER_FORMAT, compression) as BufferSource }, key, plain as BufferSource));
  return { version: TRANSFER_FORMAT, kdf: KDF_NAME, iterations, salt: toBase64(salt), iv: toBase64(iv), compression, ciphertext: toBase64(sealed), size: sealed.length };
}

/** サーバーから受け取った一式の、形が正しいか (中身は見ない)。開けるときの前の検査。 */
export function packageProblem(pkg: unknown): 'format' | null {
  const p = pkg as Partial<EncryptedPackage> | null;
  if (!p || typeof p !== 'object') return 'format';
  if (p.version !== TRANSFER_FORMAT || p.kdf !== KDF_NAME) return 'format';
  if (!Number.isInteger(p.iterations) || p.iterations! < KDF_ITERATIONS_MIN || p.iterations! > KDF_ITERATIONS_MAX) return 'format';
  if (p.compression !== 'gzip' && p.compression !== 'none') return 'format';
  if (typeof p.salt !== 'string' || fromBase64(p.salt)?.length !== SALT_BYTES) return 'format';
  if (typeof p.iv !== 'string' || fromBase64(p.iv)?.length !== IV_BYTES) return 'format';
  if (typeof p.ciphertext !== 'string' || p.ciphertext.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4) return 'format';
  const sealed = fromBase64(p.ciphertext);
  if (!sealed || sealed.length <= TAG_BYTES || sealed.length > MAX_CIPHERTEXT_BYTES || sealed.length !== p.size) return 'format';
  return null;
}

/** 開く。パスワード違い (と改ざん) は 'password'。壊れた中身を、成功として返すことはない。 */
export async function decryptText(pkg: EncryptedPackage, password: string): Promise<DecryptResult> {
  if (packageProblem(pkg)) return { ok: false, reason: 'format' };
  if (pkg.compression === 'gzip' && !canDecompress()) return { ok: false, reason: 'unsupported' };
  const salt = fromBase64(pkg.salt)!;
  const iv = fromBase64(pkg.iv)!;
  const sealed = fromBase64(pkg.ciphertext)!;
  let plain: Uint8Array;
  try {
    const key = await deriveKey(password, salt, pkg.iterations);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(pkg.version, pkg.compression) as BufferSource }, key, sealed as BufferSource));
  } catch {
    return { ok: false, reason: 'password' };
  }
  try {
    const raw = pkg.compression === 'gzip' ? await gunzip(plain) : plain;
    return { ok: true, text: decoder.decode(raw) };
  } catch {
    return { ok: false, reason: 'format' };
  }
}
