// データ引き継ぎ: the encryption, the code, issuing and restoring a save (through an in-memory transport instead of Firestore),
// what a restored save is checked for and how it takes on the new device's identity, and the チュートリアル's 名前 step
// (only a brand-new save is asked for a name). The Firestore rules for `transfers` are checked separately, against the emulator.
import { readFileSync } from 'node:fs';
import { TRANSFER_TEXT } from '../../src/game/data/transferText';
import { TUTORIAL_STEPS } from '../../src/game/data/tutorial';
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  KDF_ITERATIONS,
  KDF_ITERATIONS_MAX,
  KDF_ITERATIONS_MIN,
  MAX_CIPHERTEXT_BYTES,
  PASSWORD_MAX,
  PASSWORD_MIN,
  TooLargeError,
  decryptText,
  encryptText,
  formatCode,
  fromBase64,
  generateCode,
  normalizeCode,
  packageProblem,
  passwordProblem,
  toBase64,
} from '../../src/game/systems/TransferCrypto';
import {
  LOCK_MS,
  MAX_WRONG_TRIES,
  TransferSystem,
  TransportError,
  adoptTransferred,
  checkSaveShape,
  createMemoryTransport,
  isFreshSave,
  type TransferDoc,
  type TransferTransport,
} from '../../src/game/systems/TransferSystem';
import { TutorialSystem } from '../../src/game/systems/TutorialSystem';
import { createHeroInstance } from '../../src/game/data/heroes';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// the browser's storage, as a small stub that can be told to fail
const mem = new Map<string, string>();
let storageFails = false;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (storageFails) throw new Error('quota');
    mem.set(k, v);
  },
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const PW = 'kuroneko-2026';
/** Fewer rounds than the game uses, so the many issue/open calls below run quickly (the full count is used where it is checked). */
const FAST = { iterations: KDF_ITERATIONS_MIN };
const fastEncrypt = (text: string, password: string, extra: { compress?: boolean } = {}) => encryptText(text, password, { ...FAST, ...extra });

/** A played save: not brand new, with things that must come back exactly. */
function playedSave(): SaveData {
  const save = SaveSystem.createDefault();
  save.playerName = 'ゆうしゃ';
  save.playerLevel = 23;
  save.stageProgress = 41;
  save.gems = 98765;
  save.tutorial = { ...save.tutorial, opening: true, done: true, step: 15 };
  save.heroes.push(createHeroInstance('mizuki', 'extra-1', 30, 12));
  save.items = { exp_m: 7 };
  return save;
}

// ============================================================================ the code
{
  const codes = new Set<string>();
  let shape = true;
  for (let i = 0; i < 2000; i++) {
    const c = generateCode();
    codes.add(c);
    if (c.length !== CODE_LENGTH || !Array.from(c).every((ch) => CODE_ALPHABET.includes(ch))) shape = false;
  }
  ok(CODE_LENGTH >= 20, `the code is at least 20 characters (${CODE_LENGTH})`);
  ok(shape, 'every code is 20 characters from the alphabet');
  ok(codes.size === 2000, '2000 codes in a row are all different');
  ok(!/[IO01]/.test(CODE_ALPHABET) && new Set(CODE_ALPHABET).size === 32, 'the alphabet is 32 distinct characters without I O 0 1 (so 5 bits each, no bias)');
  // a deliberately skewed random source still gives only alphabet characters
  ok(Array.from(generateCode((b) => b.fill(255))).every((ch) => CODE_ALPHABET.includes(ch)), 'any byte value maps into the alphabet');
  const code = generateCode();
  ok(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(formatCode(code)), 'it is shown as XXXXX-XXXXX-XXXXX-XXXXX');
  ok(normalizeCode(formatCode(code)) === code, 'what is shown reads back as the same code');
  ok(normalizeCode(`  ${formatCode(code).toLowerCase()}  `) === code, 'lower case and spaces around it are fine');
  ok(normalizeCode(formatCode(code).replace(/-/g, ' ')) === code, 'spaces in place of hyphens are fine');
  ok(normalizeCode('ＡＢＣＤＥ－ＦＧＨＪＫ－ＬＭＮＰＱ－ＲＳＴＵＶ') === 'ABCDEFGHJKLMNPQRSTUV', 'full-width letters (an IME left on) are read');
  ok(normalizeCode('ABCDE-FGHJK-LMNPQ') === null && normalizeCode('') === null, 'a short code is not a code');
  ok(normalizeCode('ABCDEFGHJKLMNPQRSTUVW') === null, 'a long one is not either');
  ok(normalizeCode('ABCDEFGHJKLMNPQRSTU0') === null && normalizeCode('ABCDEFGHJKLMNPQRSTUI') === null, 'a character that is not in the alphabet (0 O 1 I) is refused');
}

// ============================================================================ the password
{
  ok(passwordProblem('') === 'empty', 'an empty password is refused');
  ok(passwordProblem('short7!') === 'short' && passwordProblem('a'.repeat(PASSWORD_MIN - 1)) === 'short', `under ${PASSWORD_MIN} characters is refused`);
  ok(passwordProblem('a1b2c3d4') === null && passwordProblem('ぱすわーどです1') === null, `${PASSWORD_MIN} characters and over is fine (Japanese too)`);
  ok(passwordProblem('x'.repeat(PASSWORD_MAX + 1)) === 'long' && passwordProblem('x1y2'.repeat(PASSWORD_MAX / 4)) === null, `over ${PASSWORD_MAX} is refused`);
  ok(passwordProblem('aaaaaaaa') === 'weak' && passwordProblem('12345678') === 'weak' && passwordProblem('Password') === 'weak', 'one repeated character and the obvious ones are refused');
}

// ============================================================================ encrypt / decrypt
{
  const text = JSON.stringify({ hello: 'こんにちは', n: [1, 2, 3], big: 'abc'.repeat(5000) });
  const pkg = await fastEncrypt(text, PW);
  ok(packageProblem(pkg) === null, 'a package made here passes the format check');
  ok(pkg.version === 1 && pkg.kdf === 'PBKDF2-SHA256', 'PBKDF2-SHA256');
  ok(pkg.compression === 'gzip' && pkg.size < text.length / 4, `repeating text is compressed first (${text.length} -> ${pkg.size} bytes)`);
  ok(fromBase64(pkg.salt)?.length === 16 && fromBase64(pkg.iv)?.length === 12 && fromBase64(pkg.ciphertext)?.length === pkg.size, 'salt 16 bytes, iv 12 bytes, size is the ciphertext length');
  ok(!pkg.ciphertext.includes('hello') && !atob(pkg.ciphertext).includes('hello') && !JSON.stringify(pkg).includes(PW), 'neither the text nor the password is in what is stored');

  const back = await decryptText(pkg, PW);
  ok(back.ok && back.text === text, 'the right password gives the text back exactly');

  const wrong = await decryptText(pkg, `${PW}x`);
  ok(!wrong.ok && wrong.reason === 'password', 'a wrong password fails (with an error, no text)');
  const wrongCase = await decryptText(pkg, PW.toUpperCase());
  ok(!wrongCase.ok, 'case matters');

  const second = await fastEncrypt(text, PW);
  ok(second.salt !== pkg.salt && second.iv !== pkg.iv && second.ciphertext !== pkg.ciphertext, 'the same text and password gives different salt, iv and ciphertext every time');

  // changing anything stored is noticed: it never opens to something else
  const flipped = fromBase64(pkg.ciphertext)!;
  flipped[flipped.length >> 1] ^= 1;
  const tampered = await decryptText({ ...pkg, ciphertext: toBase64(flipped) }, PW);
  ok(!tampered.ok, 'one flipped bit in the ciphertext is noticed (GCM tag)');
  const swapped = await decryptText({ ...pkg, compression: 'none' }, PW);
  ok(!swapped.ok, 'saying "not compressed" for a compressed package does not open it (the flag is authenticated)');
  const otherSalt = await decryptText({ ...pkg, salt: second.salt }, PW);
  ok(!otherSalt.ok, 'a different salt does not open it');

  // a package that is not well-formed is refused before any key is made
  const bad = async (over: object, label: string): Promise<void> => {
    const r = await decryptText({ ...pkg, ...over } as typeof pkg, PW);
    ok(!r.ok && r.reason === 'format', label);
  };
  await bad({ iterations: KDF_ITERATIONS_MIN - 1 }, 'too few rounds is refused');
  await bad({ iterations: KDF_ITERATIONS_MAX + 1 }, 'a huge number of rounds (made to hang the app) is refused');
  await bad({ iterations: 1e12 }, 'an absurd one too');
  await bad({ version: 2 }, 'an unknown version is refused');
  await bad({ kdf: 'scrypt' }, 'an unknown KDF is refused');
  await bad({ salt: 'not base64!' }, 'a salt that is not base64 is refused');
  await bad({ iv: toBase64(new Uint8Array(8)) }, 'an iv of the wrong length is refused');
  await bad({ ciphertext: '' }, 'an empty ciphertext is refused');
  await bad({ ciphertext: toBase64(new Uint8Array(MAX_CIPHERTEXT_BYTES + 100)), size: MAX_CIPHERTEXT_BYTES + 100 }, 'a ciphertext over the limit is refused');
  await bad({ size: pkg.size + 1 }, 'a size that does not match the ciphertext is refused');
  await bad({ compression: 'zip' }, 'an unknown compression is refused');

  // the same password typed in full-width characters (a different IME state) is the same password
  const wide = await fastEncrypt('x', 'ＡＢＣ１２３４５６７');
  ok((await decryptText(wide, 'ABC1234567')).ok === true, 'full-width characters in the password count as their normal ones');

  const plain = await fastEncrypt(text, PW, { compress: false });
  ok(plain.compression === 'none' && (await decryptText(plain, PW)).ok, 'it works without compression too (a device without CompressionStream)');

  // what the game really uses: 600,000 rounds (the only place the full count is run, as it is slow)
  const real = await encryptText(text, PW);
  ok(real.iterations === KDF_ITERATIONS && KDF_ITERATIONS >= 600_000 && (await decryptText(real, PW)).ok, `the game's own setting: PBKDF2-SHA256, ${KDF_ITERATIONS} rounds, and it opens`);
}

// ============================================================================ the size limit
{
  // random text does not shrink: 1 MB of it is over the limit, and says so rather than failing quietly
  const noiseBytes = new Uint8Array(900_000);
  for (let i = 0; i < noiseBytes.length; i += 65_536) crypto.getRandomValues(noiseBytes.subarray(i, i + 65_536));
  const noise = Array.from(noiseBytes, (b) => String.fromCharCode(33 + (b % 90))).join('');
  let tooLarge = false;
  try {
    await encryptText(noise, PW, { iterations: KDF_ITERATIONS_MIN });
  } catch (err) {
    tooLarge = err instanceof TooLargeError;
  }
  ok(tooLarge, `data over ${MAX_CIPHERTEXT_BYTES} bytes after compression is refused (TooLargeError)`);
  const small = await encryptText(noise.slice(0, 300_000), PW, { iterations: KDF_ITERATIONS_MIN });
  ok(small.size < MAX_CIPHERTEXT_BYTES, `300 KB of random text still fits (${small.size} bytes)`);
  // Firestore: 1 MiB a document. The base64 of the largest allowed ciphertext plus the other fields stays well under it.
  ok(Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4 + 1000 < 1_048_576 * 0.8, `the largest document (about ${Math.round((Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4) / 1000)} KB as base64) is well under Firestore's 1 MiB`);

  // a realistic big save: every pull is kept as its own hero, so a long-time player has hundreds
  const save = playedSave();
  for (let i = 0; i < 1500; i++) save.heroes.push(createHeroInstance('mizuki', `bulk-${i}`, 1 + (i % 80), i));
  const json = JSON.stringify(save);
  const big = await encryptText(json, PW, { iterations: KDF_ITERATIONS_MIN });
  console.log(`      (a save with ${save.heroes.length} heroes: ${Math.round(json.length / 1024)} KB of JSON -> ${Math.round(big.size / 1024)} KB stored)`);
  ok(big.size < MAX_CIPHERTEXT_BYTES / 4, 'a save with 1500 heroes is far below the limit');
  const wrapped = JSON.stringify({ app: 'abyrus', format: 1, exportedAt: 1, save });
  ok(wrapped.length > 100_000, 'sanity: that save is big');
}

// ============================================================================ issuing and restoring
const store = new Map<string, TransferDoc>();
const deviceA = createMemoryTransport('uid-A', store);
const deviceB = createMemoryTransport('uid-B', store);

let issued: { code: string; issuedAt: number } | undefined;
{
  const save = playedSave();
  const before = JSON.stringify(save);
  const r = await TransferSystem.issue(save, PW, deviceA, 1_700_000_000_000, FAST);
  ok(r.ok, 'a save can be issued');
  if (!r.ok) throw new Error(r.message);
  issued = r;
  ok(JSON.stringify(save) === before, 'issuing does not change the save');
  ok(r.code.length === 20 && store.size === 1 && store.has(r.code), 'one document is stored, under the code');
  ok(r.replaced === null, 'the first issue has no old code to replace (nothing is said about one)');
  const doc = store.get(r.code)!;
  ok(doc.ownerUid === 'uid-A' && doc.version === 1 && doc.size > 16, 'it carries the owner and the format');
  ok(!JSON.stringify(doc).includes('ゆうしゃ') && !JSON.stringify(doc).includes(PW), 'the stored document holds neither the name nor the password');
  const keys = Object.keys(doc).sort().join();
  ok(keys === ['ciphertext', 'compression', 'iterations', 'iv', 'kdf', 'ownerUid', 'salt', 'savedAt', 'size', 'version'].sort().join(), `only the fields the rules allow: ${keys}`);
  ok(TransferSystem.lastIssued()?.code === r.code && TransferSystem.lastIssued()?.issuedAt === 1_700_000_000_000, 'the device remembers the code and when (not the password)');
  ok(!(mem.get('abyrus_transfer_v1') ?? '').includes(PW), 'the password is nowhere in the browser storage');

  const bad1 = await TransferSystem.issue(save, 'short', deviceA, undefined, FAST);
  ok(!bad1.ok && bad1.reason === 'bad_password' && store.size === 1, 'a weak password is refused, nothing is stored');
  const none = await TransferSystem.issue(save, PW, null, undefined, FAST);
  ok(!none.ok && none.reason === 'not_configured', 'without a server it says so');
}

// ---- restore on "another device"
{
  const stateBefore = new Map(mem);
  const code = issued!.code;
  const r = await TransferSystem.open(formatCode(code), PW, deviceB);
  ok(r.ok, 'the code (as shown) and the password open it on another device');
  if (!r.ok) throw new Error(r.message);
  const s = r.save;
  ok(s.playerName === 'ゆうしゃ' && s.playerLevel === 23 && s.stageProgress === 41 && s.gems === 98765, 'name, level, stage and gems are back');
  ok(s.heroes.length === 4 && s.heroes.some((h) => h.id === 'extra-1' && h.level === 30), 'the heroes are back, with their levels');
  ok(s.items.exp_m === 7, 'the items are back');
  ok(checkSaveShape(JSON.parse(JSON.stringify(s))) === 'ok' && s.version === 1, 'what comes back is a valid save');
  ok(s.decks.length >= 1 && s.activeDeck === 0 && SaveSystem.getPartyHeroes(s).front.length > 0, 'its decks work');
  ok(mem.get('abyrus_save_v1') === stateBefore.get('abyrus_save_v1'), 'opening does not touch the local save');

  // ---- nothing here ever changes the local save
  const local = playedSave();
  local.playerName = 'ここのひと';
  SaveSystem.save(local);
  const snapshot = mem.get('abyrus_save_v1');
  const attempts: [string, string, TransferTransport | null][] = [
    [code, 'wrong-password-1', deviceB],
    ['ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ', PW, deviceB],
    ['nonsense', PW, deviceB],
    ['', PW, deviceB],
    [code, '', deviceB],
    [code, PW, null],
  ];
  const reasons: string[] = [];
  for (const [c, p, t] of attempts) {
    const x = await TransferSystem.open(c, p, t);
    reasons.push(x.ok ? 'OK' : x.reason);
    TransferSystem.recordSuccess();
  }
  ok(reasons.join() === 'wrong_password,not_found,bad_code,bad_code,bad_password,not_configured', `each failure says why: ${reasons.join()}`);
  ok(mem.get('abyrus_save_v1') === snapshot, 'none of the failures touched the local save');
  ok(SaveSystem.load().playerName === 'ここのひと', '... which still loads as it was');
}

// ---- Japanese messages
{
  const wrongPw = await TransferSystem.open(issued!.code, 'nope-nope-1', deviceB);
  TransferSystem.recordSuccess();
  const missing = await TransferSystem.open('AAAAA-AAAAA-AAAAA-AAAAA', PW, deviceB);
  const noCode = await TransferSystem.open('abc', PW, deviceB);
  const jp = /[぀-ヿ一-鿿]/;
  ok(!wrongPw.ok && jp.test(wrongPw.message) && !missing.ok && jp.test(missing.message) && !noCode.ok && jp.test(noCode.message), 'the messages are in Japanese');
  ok(!wrongPw.ok && wrongPw.message.includes('パスワード'), 'wrong password says so');
  ok(!missing.ok && missing.message.includes('見つかりません'), 'an unknown code says so');
}

// ---- wrong tries lock the screen for a while, and a right password does not get past the lock
{
  TransferSystem.recordSuccess();
  let last = '';
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < MAX_WRONG_TRIES; i++) {
    const r = await TransferSystem.open(issued!.code, `bad-password-${i}`, deviceB, t0 + i * 1000);
    last = r.ok ? 'OK' : r.reason;
  }
  ok(last === 'locked', `${MAX_WRONG_TRIES} wrong passwords in a row lock it`);
  const during = await TransferSystem.open(issued!.code, PW, deviceB, t0 + 60_000);
  ok(!during.ok && during.reason === 'locked' && during.message.includes('分'), 'while locked even the right password is not tried (says how many minutes)');
  ok(TransferSystem.lockedFor(t0 + 60_000) > 0 && TransferSystem.lockedFor(t0 + LOCK_MS + 10_000) === 0, 'the lock ends by itself');
  const after = await TransferSystem.open(issued!.code, PW, deviceB, t0 + LOCK_MS + 10_000);
  ok(after.ok, 'after the wait the right password works again');
  ok(TransferSystem.lockedFor(t0 + LOCK_MS + 20_000) === 0 && TransferSystem.triesLeft() === MAX_WRONG_TRIES, 'and the count starts over');
  // a few mistakes, then the right password: the count is cleared by the success
  await TransferSystem.open(issued!.code, 'mistake-1', deviceB);
  await TransferSystem.open(issued!.code, 'mistake-2', deviceB);
  ok(TransferSystem.triesLeft() === MAX_WRONG_TRIES - 2, 'each mistake is counted');
  await TransferSystem.open(issued!.code, PW, deviceB);
  ok(TransferSystem.triesLeft() === MAX_WRONG_TRIES, 'a success clears them');
  // a code that does not exist, or a failed connection, is not a "wrong password"
  await TransferSystem.open('AAAAA-AAAAA-AAAAA-AAAAA', PW, deviceB);
  ok(TransferSystem.triesLeft() === MAX_WRONG_TRIES, 'an unknown code does not count against the password');
}

// ---- network failures, denied access
{
  const failing = (reason: 'offline' | 'denied' | 'error'): TransferTransport => ({
    uid: async () => 'uid-A',
    put: async () => {
      throw new TransportError(reason);
    },
    get: async () => {
      throw new TransportError(reason);
    },
    remove: async () => {
      throw new TransportError(reason);
    },
  });
  const local = playedSave();
  SaveSystem.save(local);
  const snapshot = mem.get('abyrus_save_v1');
  const off = await TransferSystem.open(issued!.code, PW, failing('offline'));
  ok(!off.ok && off.reason === 'offline' && off.message.includes('通信できません'), 'offline is said clearly');
  const denied = await TransferSystem.open(issued!.code, PW, failing('denied'));
  ok(!denied.ok && denied.reason === 'denied', 'a refusal by the server (rules not published yet) is its own message');
  const offIssue = await TransferSystem.issue(playedSave(), PW, failing('offline'), undefined, FAST);
  ok(!offIssue.ok && offIssue.reason === 'offline', 'issuing offline fails clearly');
  const lastBefore = TransferSystem.lastIssued()?.code;
  ok(lastBefore === issued!.code, 'a failed issue does not forget the code that works');
  ok(mem.get('abyrus_save_v1') === snapshot, 'the local save is untouched by all of them');
  TransferSystem.recordSuccess();
}

// ---- issuing again replaces the old code
{
  const save = playedSave();
  save.gems = 111;
  const first = TransferSystem.lastIssued()!.code;
  const again = await TransferSystem.issue(save, 'second-password-1', deviceA, 1_700_100_000_000, FAST);
  ok(again.ok && again.code !== first, 'issuing again makes a new code');
  ok(again.ok && again.replaced && !store.has(first) && store.has(again.code), 'the old code is gone from the server, the new one is there');
  ok(store.size === 1, 'one document per player');
  const oldNow = await TransferSystem.open(first, PW, deviceB);
  ok(!oldNow.ok && oldNow.reason === 'not_found', 'the old code no longer works');
  const fresh = again.ok ? await TransferSystem.open(again.code, 'second-password-1', deviceB) : null;
  ok(!!fresh && fresh.ok && fresh.save.gems === 111, 'the new code gives the new data');
  const oldPwOnNew = again.ok ? await TransferSystem.open(again.code, PW, deviceB) : null;
  ok(!!oldPwOnNew && !oldPwOnNew.ok, 'and the old password does not open it');
  TransferSystem.recordSuccess();

  // issuing from a different account (a restored device): the old document is someone else's, so it stays - and nothing breaks
  const third = await TransferSystem.issue(save, 'third-password-1', deviceB, 1_700_200_000_000, FAST);
  ok(third.ok && third.replaced === false && store.size === 2, 'a code of another account can not be deleted; it is said, and the new code works');
  issued = { code: third.ok ? third.code : '', issuedAt: 0 };
}

// ============================================================================ what is checked after opening
{
  const t = createMemoryTransport('uid-C');
  const put = async (payload: unknown, password = PW): Promise<string> => {
    const pkg = await encryptText(typeof payload === 'string' ? payload : JSON.stringify(payload), password, { iterations: KDF_ITERATIONS_MIN });
    const code = generateCode();
    await t.put(code, { ...pkg, ownerUid: 'uid-C' });
    return code;
  };
  const reasonOf = async (payload: unknown): Promise<string> => {
    const r = await TransferSystem.open(await put(payload), PW, t);
    return r.ok ? 'OK' : r.reason;
  };
  const real = playedSave();
  ok((await reasonOf({ app: 'abyrus', format: 1, exportedAt: 1, save: real })) === 'OK', 'a real save passes');
  ok((await reasonOf({ hello: 'world' })) === 'broken', 'JSON that is not a save is refused');
  ok((await reasonOf('this is not json')) === 'broken', 'text that is not JSON is refused');
  ok((await reasonOf({ app: 'other', format: 1, save: real })) === 'broken', 'another app\'s data is refused');
  ok((await reasonOf({ app: 'abyrus', format: 1, save: { version: 1 } })) === 'broken', 'a save with nothing in it is refused (it would otherwise load as a new game and replace the real one)');
  ok((await reasonOf({ app: 'abyrus', format: 1, save: { ...real, heroes: [] } })) === 'broken', 'a save with no heroes is refused');
  ok((await reasonOf({ app: 'abyrus', format: 1, save: { ...real, gold: 'lots' } })) === 'broken', 'a save with a broken gold is refused');
  ok((await reasonOf({ app: 'abyrus', format: 1, save: { ...real, social: null } })) === 'broken', 'a save without a social state is refused');
  ok((await reasonOf({ app: 'abyrus', format: 1, save: { ...real, version: 2 } })) === 'newer', 'a save from a newer build says so');
  ok((await reasonOf({ app: 'abyrus', format: 1, save: [] })) === 'broken' && (await reasonOf({ app: 'abyrus', format: 1, save: null })) === 'broken', 'an array or null is refused');
  ok((await reasonOf({ app: 'abyrus', format: 2, save: real })) === 'broken', 'an unknown wrapper format is refused');

  // a save from an older build is repaired by the normal load on the way in
  const old = JSON.parse(JSON.stringify(real));
  delete old.village;
  delete old.premium;
  delete old.alliance;
  delete old.tutorial;
  const r = await TransferSystem.open(await put({ app: 'abyrus', format: 1, save: old }), PW, t);
  ok(r.ok && r.save.village.buildings.length >= 1 && r.save.premium.expiresAt === 0 && r.save.alliance.allianceId === null && r.save.tutorial.done, 'a save missing newer fields comes back with them filled in');

  // a document that was changed on the server
  const code = await put({ app: 'abyrus', format: 1, save: real });
  const doc = (await t.get(code))!;
  const broken = createMemoryTransport('uid-C', new Map([[code, { ...doc, size: doc.size + 5 }]]));
  const rb = await TransferSystem.open(code, PW, broken);
  ok(!rb.ok && rb.reason === 'broken', 'a document whose size field was changed is refused');
  const missingField = createMemoryTransport('uid-C', new Map([[code, { ...doc, iv: undefined } as unknown as TransferDoc]]));
  const rm = await TransferSystem.open(code, PW, missingField);
  ok(!rm.ok && rm.reason === 'broken', 'a document with a field missing is refused');
}

// ============================================================================ a new device's identity
{
  const device = SaveSystem.createDefault();
  device.social.playerId = 'DEVICE22';
  const incoming = playedSave();
  incoming.social.playerId = 'OLDOLD22';
  incoming.alliance = { ...incoming.alliance, allianceId: 'alliance-1', level: 3, pendingStagePoints: 5, helperHeroId: 'starter-1', leftAt: 12345, shop: { week: '2026-W46', bought: { x: 2 } } };
  incoming.stamina = [20, 60];

  const online = adoptTransferred(structuredClone(incoming), device, { online: true, finishTutorial: false });
  ok(online.social.playerId === 'DEVICE22', 'the friend ID is this device\'s (it is tied to this device\'s account on the server)');
  ok(online.alliance.allianceId === null && online.alliance.level === 0 && online.alliance.pendingStagePoints === 0 && online.alliance.helperHeroId === '', 'with the alliance server, the alliance link, level, pending points and helper are dropped (rejoin)');
  ok(online.alliance.shop.week === '2026-W46' && online.alliance.shop.bought.x === 2, 'the weekly shop count stays (transfer does not reset the weekly limit)');
  ok(online.alliance.leftAt === 12345, 'the time of leaving stays');
  ok(online.stamina[0] === 20 && online.stamina[1] === 50 + Math.floor(23 / 2), 'the stamina maximum no longer includes the alliance bonus; the amount held is kept');
  ok(online.gems === incoming.gems && online.playerName === 'ゆうしゃ', 'everything else is the restored save\'s');

  const offline = adoptTransferred(structuredClone(incoming), device, { online: false, finishTutorial: false });
  ok(offline.social.playerId === 'DEVICE22' && offline.alliance.allianceId === 'alliance-1' && offline.stamina[1] === 60, 'without the server (simulated members live in the save) the alliance stays as it was');

  const fin = adoptTransferred(SaveSystem.createDefault(), device, { online: false, finishTutorial: true });
  ok(fin.tutorial.done && fin.tutorial.opening, 'restoring from the 名前 step counts the tutorial as done (and the opening as seen)');
  const keep = adoptTransferred(structuredClone(incoming), device, { online: false, finishTutorial: false });
  ok(keep.tutorial.step === 15 && keep.tutorial.done, 'otherwise the save\'s own tutorial state is kept');
}

// ---- storing it
{
  const device = playedSave();
  device.playerName = 'まえのひと';
  SaveSystem.save(device);
  const incoming = playedSave();
  incoming.playerName = 'あたらしい';
  const applied = TransferSystem.apply(device, incoming, { online: false, finishTutorial: false });
  ok(applied.ok, 'apply stores the save');
  ok(SaveSystem.load().playerName === 'あたらしい' && SaveSystem.load().gems === incoming.gems, 'the next load is the restored save');

  const snapshot = mem.get('abyrus_save_v1');
  storageFails = true;
  const failed = TransferSystem.apply(device, playedSave(), { online: false, finishTutorial: false });
  storageFails = false;
  ok(!failed.ok && failed.message.includes('保存できません') && mem.get('abyrus_save_v1') === snapshot, 'if the browser will not store it, it says so and the stored save stays');
}

// ============================================================================ the 名前 step
{
  const fresh = SaveSystem.createDefault();
  ok(isFreshSave(fresh), 'a brand-new save is fresh');
  const step = TutorialSystem.active(fresh);
  ok(step?.advance === 'name' && step.id === 'name_entry' && TutorialSystem.isAskingName(fresh), 'a brand-new save is asked for a name first');
  ok(TUTORIAL_STEPS[0].advance === 'name' && TUTORIAL_STEPS.slice(1).every((s) => s.advance !== 'name'), 'the 名前 step is the first step and the only one');
  ok(step?.scene === 'Home' && step.lines.length > 0, 'it runs on the Home screen, with the guide saying something');
  ok(TRANSFER_TEXT.nameStep.lines.every((l) => step!.lines.includes(l)), 'its lines are the ones in the transfer text module');

  ok(TutorialSystem.confirmName(fresh, '') === null && TutorialSystem.confirmName(fresh, '   ') === null && fresh.tutorial.step === 0 && fresh.playerName === 'プレイヤー', 'an empty name is not accepted: the step stays and the name is unchanged');
  ok(TutorialSystem.confirmName(fresh, '😀😀') === null && fresh.tutorial.step === 0, 'a name that is only emoji is not accepted either');
  const named = TutorialSystem.confirmName(fresh, '  アルテミス🌟のきし  ');
  ok(named === 'アルテミスのきし'.slice(0, 8) && fresh.playerName === named, `the name is cleaned the way chat cleans text and cut to 8 characters (${named})`);
  ok(fresh.tutorial.step === 1 && TutorialSystem.active(fresh)?.id === 'home_welcome' && !TutorialSystem.isAskingName(fresh), 'then the tutorial goes on with its next step');
  ok(TutorialSystem.confirmName(fresh, 'another') === null && fresh.playerName === named, 'it can not be answered again later');

  // the rest of the tutorial is as before and still skippable
  TutorialSystem.skip(fresh);
  ok(fresh.tutorial.done && TutorialSystem.current(fresh) === null, 'the rest of the tutorial can still be skipped');
}

// ---- saves that exist already are never asked
{
  const legacy = (tutorial: object | undefined, extra: object = {}): SaveData => {
    const raw = JSON.parse(JSON.stringify(SaveSystem.createDefault())) as Record<string, unknown>;
    if (tutorial === undefined) delete raw.tutorial;
    else raw.tutorial = tutorial;
    Object.assign(raw, extra);
    return SaveSystem.restoreFrom(raw);
  };
  const village = { step: 0, done: false };
  const notAsked = (s: SaveData): boolean => !TutorialSystem.isAskingName(s) && TutorialSystem.active(s)?.advance !== 'name';

  const done = legacy({ opening: true, step: 15, done: true, village });
  ok(done.tutorial.done && notAsked(done), 'an old save that finished the tutorial is not asked');
  const none = legacy(undefined);
  ok(none.tutorial.done && notAsked(none), 'an old save from before there was a tutorial is not asked');
  const notStarted = legacy({ opening: true, step: 0, done: false, village });
  ok(notAsked(notStarted) && TutorialSystem.active(notStarted)?.id === 'home_welcome', 'an old save that had not started the tutorial begins at the welcome (the name step is skipped for it)');
  const mid = legacy({ opening: true, step: 3, done: false, village });
  ok(TutorialSystem.active(mid)?.id === 'quest_node' && notAsked(mid), 'an old save in the middle of the tutorial stays on the very step it was on (the list got one longer in front)');
  const midLate = legacy({ opening: true, step: 12, done: false, village });
  ok(TutorialSystem.active(midLate)?.id === 'enhance_info', 'also near the end');
  const skipped = legacy({ opening: true, step: 2, done: true, village });
  ok(skipped.tutorial.step === 2 && notAsked(skipped), 'a skipped one is left alone');

  // the same, through the browser's storage (what Boot does)
  const stored = playedSave();
  stored.tutorial = { opening: true, step: 0, done: false, village, rev: 1 };
  stored.stageProgress = 12;
  SaveSystem.save(stored);
  const loaded = SaveSystem.load();
  ok(loaded.tutorial.step === 0 && TutorialSystem.isAskingName(loaded), 'a save of this version that is at step 0 is asked (it has not started)');
  stored.tutorial = { opening: true, step: 4, done: false, village, rev: 1 };
  SaveSystem.save(stored);
  ok(SaveSystem.load().tutorial.step === 4 && notAsked(SaveSystem.load()), 'a save of this version is not moved on again at each load');
  const raw = JSON.parse(mem.get('abyrus_save_v1')!);
  delete raw.tutorial.rev;
  mem.set('abyrus_save_v1', JSON.stringify(raw));
  ok(SaveSystem.load().tutorial.step === 5, 'one without the revision is moved on once');

  // and a save that is restored, or that has moved well beyond the start, is not a fresh one
  ok(!isFreshSave(playedSave()) && !isFreshSave(legacy({ opening: true, step: 0, done: false, village }, { stageProgress: 3 })), 'a played save is not fresh (a restore asks first)');
  const justSkipped = SaveSystem.createDefault();
  TutorialSystem.skip(justSkipped);
  ok(!isFreshSave(justSkipped), 'a save that skipped the tutorial counts as played');
}

// ============================================================================ the rules file and the code agree
{
  const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8').replace(/\r/g, '');
  const block = rules.slice(rules.indexOf('function validTransfer'), rules.indexOf('// ====', rules.indexOf('match /transfers/')));
  ok(block.includes("match /transfers/{code}") && block.includes('allow list: if false'), 'firestore.rules has the transfers block, and refuses list');
  ok(block.includes(`d.iterations >= ${KDF_ITERATIONS_MIN} && d.iterations <= ${KDF_ITERATIONS_MAX}`), 'the rules allow the same range of PBKDF2 rounds');
  ok(block.includes(`d.size <= ${MAX_CIPHERTEXT_BYTES}`), 'the rules allow the same largest ciphertext');
  ok(block.includes('d.salt.size() == 24') && block.includes('d.iv.size() == 16'), 'the rules expect 16 bytes of salt and 12 of iv (base64)');
  ok(block.includes(`{${CODE_LENGTH}}`) && block.includes('[A-HJ-NP-Z2-9]') && !/[IO01]/.test(CODE_ALPHABET), 'the rules take a code of the same length and alphabet');
  ok(block.includes('request.resource.data.ownerUid == uid()') && block.includes('resource.data.ownerUid == uid()'), 'create takes the writer\'s uid; update and delete the owner\'s');
}

if (failures) process.exit(1);
