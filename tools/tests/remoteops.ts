// 管理画面が書く お知らせ (announcements) と メンテナンス (config/maintenance) を、ゲームが読む: RemoteNotices / RemoteMaintenance.
// ネットワークには触らない。読んだ中身を自分で作って、検めて、入れ替えるところを調べる。
import { getNotices } from '../../src/game/data/notices';
import {
  REMOTE_NOTICE_BODY_MAX,
  REMOTE_NOTICE_LIMIT,
  REMOTE_NOTICE_TITLE_MAX,
  RemoteNotices,
  applyRemoteNotices,
  parseAnnouncement,
  remoteNotices,
  resetRemoteNotices,
} from '../../src/game/systems/RemoteNotices';
import { DEFAULT_MAINTENANCE_MESSAGE, MAINTENANCE_MESSAGE_MAX, RemoteMaintenance, parseMaintenance } from '../../src/game/systems/RemoteMaintenance';
import { waitAtMost, withTimeout } from '../../src/game/systems/firestoreRead';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const JST = (date: string, time = '00:00:00') => Date.parse(`${date}T${time}+09:00`);
const good = { title: 'メンテナンスのお知らせ', body: '12/1 2:00〜5:00 にメンテナンスを行います。\nご不便をおかけします。', publishedDate: '2026-11-20', active: true };

// ---- one announcement
{
  const r = parseAnnouncement('a1', good);
  ok(!!r && r.entry.id === 'remote-a1' && r.entry.category === 'お知らせ' && r.entry.title === good.title && r.entry.body === good.body, 'a valid document becomes a notice (id remote-<doc id>, tag お知らせ)');
  ok(r?.entry.date === '2026/11/20' && r.at === JST('2026-11-20'), 'the date is shown as YYYY/MM/DD and it starts at 0:00 Japan time');
  ok(r?.entry.image === undefined && r?.entry.textureKey === undefined, 'it has no picture (a text-only notice)');
  ok(parseAnnouncement('a2', { ...good, title: '  前後の空白  ' })?.entry.title === '前後の空白', 'spaces around the title are trimmed');

  const bad: [string, unknown][] = [
    ['not an object', 'text'],
    ['null', null],
    ['an array', [good]],
    ['not active', { ...good, active: false }],
    ['active is the string "true"', { ...good, active: 'true' }],
    ['no active', { title: good.title, body: good.body, publishedDate: good.publishedDate }],
    ['no title', { ...good, title: '' }],
    ['title too long', { ...good, title: 'あ'.repeat(REMOTE_NOTICE_TITLE_MAX + 1) }],
    ['no body', { ...good, body: '   ' }],
    ['body too long', { ...good, body: 'あ'.repeat(REMOTE_NOTICE_BODY_MAX + 1) }],
    ['no date', { ...good, publishedDate: undefined }],
    ['date in the wrong shape', { ...good, publishedDate: '2026/11/20' }],
    ['a date that does not exist', { ...good, publishedDate: '2026-02-31' }],
    ['month 13', { ...good, publishedDate: '2026-13-01' }],
    ['title is a number', { ...good, title: 5 }],
  ];
  for (const [what, doc] of bad) ok(parseAnnouncement('x', doc) === null, `not valid → left out: ${what}`);
  ok(parseAnnouncement('', good) === null && parseAnnouncement('a/b', good) === null, 'an empty id, or one with a slash, is left out');
  ok(parseAnnouncement('max', { ...good, title: 'あ'.repeat(REMOTE_NOTICE_TITLE_MAX), body: 'あ'.repeat(REMOTE_NOTICE_BODY_MAX) }) !== null, 'exactly at the limits is fine');
}

// ---- the board
{
  resetRemoteNotices();
  const base = getNotices(JST('2026-11-20')).map((n) => n.id);
  ok(remoteNotices(JST('2026-11-20')).length === 0, 'before anything is read there are no operator notices');

  const doc = (id: string, date: string, extra: object = {}) => ({ id, data: { ...good, title: `お知らせ${id}`, publishedDate: date, ...extra } });
  const r = applyRemoteNotices([doc('old', '2026-11-01'), doc('new', '2026-11-18'), doc('later', '2026-12-05'), doc('off', '2026-11-10', { active: false }), { id: 'broken', data: 7 }, 'junk', { data: good }]);
  ok(r.status === 'ok' && r.read === 3 && r.dropped === 4, 'valid ones are kept, the rest are counted as dropped');

  const now = JST('2026-11-20', '12:00:00');
  ok(remoteNotices(now).map((n) => n.id).join() === 'remote-new,remote-old', 'a notice shows from its date: the one dated later is not shown yet, newest first');
  ok(remoteNotices(JST('2026-12-05')).map((n) => n.id).join() === 'remote-later,remote-new,remote-old', 'and it appears on its day');
  ok(remoteNotices(JST('2026-12-04', '23:59:59')).length === 2, '… not a second before (Japan time)');

  const board = getNotices(now).map((n) => n.id);
  ok(board.slice(0, 2).join() === 'remote-new,remote-old', 'the board shows the operator notices first');
  ok(base.every((id) => board.includes(id)) && board.length === base.length + 2, 'the notices the game makes itself are all still there');

  applyRemoteNotices(Array.from({ length: REMOTE_NOTICE_LIMIT + 5 }, (_, i) => doc(`n${String(i).padStart(2, '0')}`, '2026-11-01')));
  ok(remoteNotices(now).length === REMOTE_NOTICE_LIMIT, `at most ${REMOTE_NOTICE_LIMIT} are shown`);
  ok(applyRemoteNotices({ not: 'an array' }).status === 'unavailable' && remoteNotices(now).length === 0, 'something that is not even a list = nothing, and the earlier ones are gone');
  resetRemoteNotices();
  ok(getNotices(now).map((n) => n.id).join() === base.join(), 'reset: back to the game\'s own notices only');
}

// ---- reading it (with a stand-in for Firestore)
{
  RemoteNotices.forget();
  const result = await RemoteNotices.refresh(async () => [{ id: 'live', data: good }]);
  ok(result.status === 'ok' && result.read === 1 && remoteNotices(JST('2026-11-21')).length === 1, 'refresh reads and applies');
  let calls = 0;
  const again = await RemoteNotices.refresh(async () => {
    calls++;
    return [];
  });
  ok(again === result && calls === 0, 'it reads only once (the same result comes back)');

  RemoteNotices.forget();
  const failed = await RemoteNotices.refresh(async () => {
    throw new Error('offline');
  });
  ok(failed.status === 'unavailable' && remoteNotices(JST('2026-11-21')).length === 0, 'a failure leaves nothing and does not throw');
  RemoteNotices.forget();
  const unconfigured = await RemoteNotices.refresh();
  ok(unconfigured.status === 'not_configured', 'without Firebase settings: not_configured at once, no network');
  RemoteNotices.forget();
}

// ---- メンテナンス
{
  ok(parseMaintenance({ enabled: true, message: '12/1 2:00〜5:00 は、メンテナンス中です。' }).enabled === true, 'enabled: true → maintenance');
  ok(parseMaintenance({ enabled: true, message: '12/1 2:00〜5:00 は、メンテナンス中です。' }).message === '12/1 2:00〜5:00 は、メンテナンス中です。', 'the operator\'s message is shown');
  ok(parseMaintenance({ enabled: false, message: 'x' }).enabled === false, 'enabled: false → normal');
  for (const [what, raw] of [['the string "true"', { enabled: 'true' }], ['the number 1', { enabled: 1 }], ['no enabled', { message: 'x' }], ['null (no document)', null], ['not an object', 'on'], ['an array', [true]], ['undefined', undefined]] as [string, unknown][]) {
    ok(parseMaintenance(raw).enabled === false, `anything but exactly true is NOT maintenance: ${what}`);
  }
  ok(parseMaintenance({ enabled: true }).message === DEFAULT_MAINTENANCE_MESSAGE, 'no message → the default one');
  ok(parseMaintenance({ enabled: true, message: '   ' }).message === DEFAULT_MAINTENANCE_MESSAGE, 'a blank message → the default one');
  ok(parseMaintenance({ enabled: true, message: 'あ'.repeat(MAINTENANCE_MESSAGE_MAX + 1) }).message === DEFAULT_MAINTENANCE_MESSAGE, 'a message that is too long → the default one (still maintenance)');
  ok(parseMaintenance({ enabled: true, message: 'あ'.repeat(MAINTENANCE_MESSAGE_MAX) }).message.length === MAINTENANCE_MESSAGE_MAX, 'exactly at the limit is fine');
  ok(parseMaintenance({ enabled: true, message: 5 }).message === DEFAULT_MAINTENANCE_MESSAGE, 'a message that is not text → the default one');

  ok((await RemoteMaintenance.check(async () => ({ enabled: true, message: 'ただいま調整中' }))).enabled === true, 'check: maintenance on');
  ok((await RemoteMaintenance.check(async () => ({ enabled: false, message: '' }))).enabled === false, 'check: maintenance off');
  const failed = await RemoteMaintenance.check(async () => {
    throw new Error('offline');
  });
  ok(failed.enabled === false, 'check: a failure is NOT maintenance (it fails open)');
  ok((await RemoteMaintenance.check(async () => null)).enabled === false, 'check: no document is NOT maintenance');
  ok((await RemoteMaintenance.check()).enabled === false, 'check: without Firebase settings it is not maintenance, and does not touch the network');
  let n = 0;
  await RemoteMaintenance.check(async () => ({ enabled: true, message: 'a' }));
  const second = await RemoteMaintenance.check(async () => {
    n++;
    return { enabled: false, message: '' };
  });
  ok(n === 1 && second.enabled === false, 'check asks again every time (the retry button needs a fresh answer)');
}

// ---- the waiting helpers
{
  const quick = await waitAtMost(Promise.resolve('value'), 1000, 'fallback');
  ok(quick === 'value', 'waitAtMost: an answer in time is used');
  const t0 = Date.now();
  const late = await waitAtMost(new Promise<string>((r) => setTimeout(() => r('late'), 400)), 40, 'fallback');
  ok(late === 'fallback' && Date.now() - t0 < 300, 'waitAtMost: gives the fallback instead of waiting longer than asked');
  ok((await waitAtMost(Promise.reject(new Error('x')), 1000, 'fallback')) === 'fallback', 'waitAtMost: a rejection becomes the fallback (never rejects)');
  const timedOut = await withTimeout(new Promise<string>((r) => setTimeout(() => r('late'), 400)), 40).catch((e: Error) => e.message);
  ok(timedOut === 'timeout', 'withTimeout: rejects with timeout');
  ok((await withTimeout(Promise.resolve(7), 1000)) === 7, 'withTimeout: an answer in time comes through');
}

if (failures) process.exit(1);
