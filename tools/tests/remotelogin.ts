// 管理画面が書く ログインボーナス (loginBonusDays) を、ゲームが読む: RemoteLoginBonus.
// ネットワークには触らない。読んだ中身を自分で作って、検めて、カレンダーに入れるところを調べる。
import { LOGIN_BONUS } from '../../src/game/data/loginBonus';
import { LoginBonusSystem } from '../../src/game/systems/LoginBonusSystem';
import { REMOTE_LOGIN_GEMS_MAX, RemoteLoginBonus, applyRemoteLoginBonus, parseLoginBonusDay, resetRemoteLoginBonus } from '../../src/game/systems/RemoteLoginBonus';
import { SaveSystem } from '../../src/game/systems/SaveSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const staticCalendar = JSON.stringify(LOGIN_BONUS);
const doc = (id: string, day: unknown, reward: unknown) => ({ id, data: { day, reward } });

// ---- one day
{
  ok(JSON.stringify(parseLoginBonusDay({ day: 3, reward: { type: 'gems', amount: 50 } })) === JSON.stringify({ day: 3, reward: { type: 'gems', amount: 50 } }), 'a valid document is a day and its reward');
  ok(parseLoginBonusDay({ day: 31, reward: { type: 'gold', amount: 1_000_000_000 } }) !== null && parseLoginBonusDay({ day: 1, reward: { type: 'stamina', amount: 10 } }) !== null, 'day 1 and day 31, and the biggest gold, are fine');
  ok(JSON.stringify(parseLoginBonusDay({ day: 5, reward: { type: 'item', item: 'exp_m', amount: 3 } })?.reward) === JSON.stringify({ type: 'item', item: 'exp_m', amount: 3 }), 'an item reward carries its item id');
  ok(JSON.stringify(parseLoginBonusDay({ day: 7, reward: { type: 'equipment', rarity: 3, amount: 2 } })?.reward) === JSON.stringify({ type: 'equipment', rarity: 3, amount: 2 }), 'an equipment reward carries its rarity');
  ok(parseLoginBonusDay({ day: 9, reward: { type: 'gems', amount: REMOTE_LOGIN_GEMS_MAX } }) !== null, 'exactly the gem limit is fine');

  const bad: [string, unknown][] = [
    ['not an object', 'x'],
    ['null', null],
    ['an array', [1]],
    ['no day', { reward: { type: 'gold', amount: 5 } }],
    ['day 0', { day: 0, reward: { type: 'gold', amount: 5 } }],
    ['day 32', { day: 32, reward: { type: 'gold', amount: 5 } }],
    ['day 1.5', { day: 1.5, reward: { type: 'gold', amount: 5 } }],
    ['day is text', { day: '3', reward: { type: 'gold', amount: 5 } }],
    ['the old 7-day shape (rewardType / rewardAmount)', { dayNumber: 3, rewardType: 'gold', rewardAmount: 5 }],
    ['no reward', { day: 3 }],
    ['unknown reward type', { day: 3, reward: { type: 'diamond', amount: 5 } }],
    ['amount 0', { day: 3, reward: { type: 'gold', amount: 0 } }],
    ['amount not whole', { day: 3, reward: { type: 'gold', amount: 2.5 } }],
    ['amount over a billion', { day: 3, reward: { type: 'gold', amount: 1_000_000_001 } }],
    ['gems over the limit', { day: 3, reward: { type: 'gems', amount: REMOTE_LOGIN_GEMS_MAX + 1 } }],
    ['an item with no item id', { day: 3, reward: { type: 'item', amount: 3 } }],
    ['an item that does not exist', { day: 3, reward: { type: 'item', item: 'nope', amount: 3 } }],
    ['equipment with rarity 9', { day: 3, reward: { type: 'equipment', rarity: 9, amount: 1 } }],
  ];
  for (const [what, d] of bad) ok(parseLoginBonusDay(d) === null, `not valid → left out: ${what}`);
}

// ---- the calendar
{
  resetRemoteLoginBonus();
  ok(LOGIN_BONUS.length === 31, 'the written calendar has 31 days');
  const r = applyRemoteLoginBonus([
    doc('a', 2, { type: 'gems', amount: 77 }),
    doc('b', 31, { type: 'equipment', rarity: 4, amount: 1 }),
    doc('c', 2, { type: 'gold', amount: 1 }),
    doc('broken', 99, { type: 'gold', amount: 1 }),
    { id: 'old', data: { dayNumber: 1, rewardType: 'gold', rewardAmount: 5000 } },
    'junk',
  ]);
  ok(r.status === 'ok' && r.days === 2 && r.dropped === 4, 'valid days replace the written reward; the rest are dropped (a second one for day 2, day 99, the old shape, junk)');
  ok(LoginBonusSystem.rewardFor(2).type === 'gems' && LoginBonusSystem.rewardFor(2).amount === 77, 'day 2 pays the operator\'s reward (the smaller id wins when there are two)');
  ok(LoginBonusSystem.rewardFor(31).type === 'equipment', 'day 31 pays the operator\'s reward');
  const written = JSON.parse(staticCalendar);
  ok(LOGIN_BONUS.every((rw, i) => i === 1 || i === 30 || JSON.stringify(rw) === JSON.stringify(written[i])) && LOGIN_BONUS.length === 31, 'every other day keeps the written reward, and the calendar is still 31 days');

  // the game's own claim
  const save = SaveSystem.createDefault();
  const day2 = new Date(2026, 10, 2, 12, 0, 0).getTime();
  const granted = LoginBonusSystem.claim(save, day2);
  ok(!!granted && save.loginBonus.claimed.includes(2) && save.gems >= 1500 + 77 - 1, 'claiming day 2 hands over the operator\'s 77 gems');

  applyRemoteLoginBonus([doc('a', 2, { type: 'gems', amount: 5 })]);
  ok(LoginBonusSystem.rewardFor(31).type === written[30].type && LoginBonusSystem.rewardFor(2).amount === 5, 'a new read starts from the written calendar again (a day taken off the server comes back as the written one)');
  ok(applyRemoteLoginBonus({ no: 'list' }).status === 'unavailable' && JSON.stringify(LOGIN_BONUS) === staticCalendar, 'something that is not even a list = the written calendar');
  ok(applyRemoteLoginBonus([]).days === 0 && JSON.stringify(LOGIN_BONUS) === staticCalendar, 'an empty list = the written calendar');
  resetRemoteLoginBonus();
}

// ---- reading it (with a stand-in for Firestore)
{
  RemoteLoginBonus.forget();
  const result = await RemoteLoginBonus.refresh(async () => [doc('x', 4, { type: 'gold', amount: 123 })]);
  ok(result.status === 'ok' && result.days === 1 && LoginBonusSystem.rewardFor(4).amount === 123, 'refresh reads and applies');
  let calls = 0;
  const again = await RemoteLoginBonus.refresh(async () => {
    calls++;
    return [];
  });
  ok(again === result && calls === 0, 'it reads only once (the same result comes back)');
  RemoteLoginBonus.forget();
  ok(JSON.stringify(LOGIN_BONUS) === staticCalendar, 'forget goes back to the written calendar');
  const failed = await RemoteLoginBonus.refresh(async () => {
    throw new Error('offline');
  });
  ok(failed.status === 'unavailable' && JSON.stringify(LOGIN_BONUS) === staticCalendar, 'a failure leaves the written calendar and does not throw');
  RemoteLoginBonus.forget();
  ok((await RemoteLoginBonus.refresh()).status === 'not_configured', 'without Firebase settings: not_configured at once, no network');
  RemoteLoginBonus.forget();
}

if (failures) process.exit(1);
