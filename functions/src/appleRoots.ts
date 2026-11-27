/**
 * Apple のルート証明書 (Apple Root CA - G3)。App Store の署名つき取引 (JWS) の鎖の、いちばん上。
 *
 * ファイル: functions/certs/AppleRootCA-G3.cer (DER)。
 *   入手: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer を curl で取った (2026-11-27)。
 *   照合: SHA-256 が、Apple のサポートページ「Lists of available trusted root certificates in iOS, iPadOS, macOS」
 *        (https://support.apple.com/en-us/105116) の、Apple Root CA - G3 の行 (シリアル 2D C5 FC 88 D2 C5 4B 95、期限 2039-04-30) と、
 *        一致した。下の APPLE_ROOT_G3_SHA256 がその値。読み込むたびに、同じ値かを確かめる (違えば、使わない)。
 *
 * 読むのは、初めて使うときだけ (ファイルが無くても、同盟など、ほかの関数は動く)。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Apple Root CA - G3 の SHA-256 (小文字の16進、区切りなし)。 */
export const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

export const APPLE_ROOT_G3_FILE = 'AppleRootCA-G3.cer';

export const sha256Hex = (der: Buffer): string => createHash('sha256').update(der).digest('hex');

/** functions/certs を探す。コンパイルした lib/ からは ../certs、試験用の .test-out/src/ からは ../../certs。 */
export function defaultCertsDir(): string {
  const candidates = [path.resolve(__dirname, '..', 'certs'), path.resolve(__dirname, '..', '..', 'certs')];
  return candidates.find((dir) => existsSync(path.join(dir, APPLE_ROOT_G3_FILE))) ?? candidates[0];
}

/** ルート証明書を読み込む。ファイルの SHA-256 が Apple の公開値と違えば、投げる。 */
export function loadAppleRoots(dir: string = defaultCertsDir()): Buffer[] {
  const der = readFileSync(path.join(dir, APPLE_ROOT_G3_FILE));
  const actual = sha256Hex(der);
  if (actual !== APPLE_ROOT_G3_SHA256) {
    throw new Error(`${APPLE_ROOT_G3_FILE}: SHA-256 が Apple の公開値と違います (${actual})`);
  }
  return [der];
}
