/** Apple のルート証明書 (functions/certs) の読み込み: Apple が公開している SHA-256 と、一致するかを見る。 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { test } from 'node:test';
import { APPLE_ROOT_G3_FILE, APPLE_ROOT_G3_SHA256, defaultCertsDir, loadAppleRoots, sha256Hex } from '../src/appleRoots';

test('リポジトリの Apple Root CA - G3 は、Apple が公開している SHA-256 と同じ', () => {
  // Apple のサポートページ (https://support.apple.com/en-us/105116) の、Apple Root CA - G3 の行: 63 34 3A BF ... 91 79
  const published = '63 34 3A BF B8 9A 6A 03 EB B5 7E 9B 3F 5F A7 BE 7C 4F 5C 75 6F 30 17 B3 A8 C4 88 C3 65 3E 91 79'.replace(/ /g, '').toLowerCase();
  assert.equal(APPLE_ROOT_G3_SHA256, published);
  const der = readFileSync(path.join(defaultCertsDir(), APPLE_ROOT_G3_FILE));
  assert.equal(sha256Hex(der), published);
});

test('読み込める。証明書の中身は、Apple Root CA - G3 (自己署名・期限 2039 年)', () => {
  const [der] = loadAppleRoots();
  const cert = new X509Certificate(der);
  assert.match(cert.subject, /CN=Apple Root CA - G3/);
  assert.equal(cert.subject, cert.issuer);
  assert.equal(cert.verify(cert.publicKey), true);
  assert.equal(cert.serialNumber.toUpperCase(), '2DC5FC88D2C54B95');
  assert.ok(new Date(cert.validTo).getUTCFullYear() === 2039);
});

test('1バイトでも違うファイルは、使わない', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'abyrus-roots-'));
  const der = Buffer.from(readFileSync(path.join(defaultCertsDir(), APPLE_ROOT_G3_FILE)));
  der[100] ^= 1;
  writeFileSync(path.join(dir, APPLE_ROOT_G3_FILE), der);
  assert.throws(() => loadAppleRoots(dir), /SHA-256/);
  assert.throws(() => loadAppleRoots(path.join(dir, 'nothing')));
});
