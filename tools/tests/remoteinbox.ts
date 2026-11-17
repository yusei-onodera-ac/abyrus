// 管理画面が書く プレゼント (gifts) と メール (mail) を、ゲームが読む: RemoteInbox.
// ネットワークには触らない。読んだ中身を自分で作って、検めて、ゲームの配り方 (InboxSystem.deliver) に乗るところまで調べる。
import { GIFT_CAMPAIGNS } from '../../src/game/data/gifts';
import { MAIL_CAMPAIGNS } from '../../src/game/data/mails';
import {
  REMOTE_EXPIRE_DAYS_MAX,
  REMOTE_GEMS_MAX,
  REMOTE_GOLD_MAX,
  REMOTE_GIFT_MESSAGE_MAX,
  REMOTE_MAIL_BODY_MAX,
  REMOTE_TITLE_MAX,
  RemoteInbox,
  applyRemoteInbox,
  parseGift,
  parseMail,
  resetRemoteInbox,
} from '../../src/game/systems/RemoteInbox';
import { InboxSystem } from '../../src/game/systems/InboxSystem';
import { SaveSystem } from '../../src/game/systems/SaveSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const staticGifts = GIFT_CAMPAIGNS.map((g) => g.id).join();
const staticMails = MAIL_CAMPAIGNS.map((m) => m.id).join();
const NOW = Date.parse('2026-11-20T12:00:00+09:00');
const gift = { title: 'お詫びの魔晶石', message: 'ご迷惑をおかけしました。', rewardType: 'gem', rewardAmount: 300, recipientType: 'all', status: 'sent' };
const mail = { subject: 'メンテナンスのお詫び', body: 'ご不便をおかけしました。', recipientType: 'all', status: 'sent', hasReward: false };

// ---- one gift
{
  const g = parseGift('g1', gift);
  ok(!!g && g.id === 'remote-g1' && g.title === gift.title && g.message === gift.message, 'a valid document becomes a gift (id remote-<doc id>)');
  ok(g?.reward.type === 'gems' && g.reward.amount === 300, 'the admin\'s `gem` is the game\'s `gems`');
  ok(parseGift('g2', { ...gift, rewardType: 'gold', rewardAmount: 5000 })?.reward.type === 'gold', 'gold works');
  ok(g?.endsAt === undefined && g?.expireDays === undefined, 'no end and no expiry: the game\'s default 30 days applies');
  ok(parseGift('g3', { ...gift, endsAt: '2026-12-01T23:59:00+09:00' })?.endsAt === '2026-12-01T14:59:00.000Z', 'an end time is carried over');
  ok(parseGift('g4', { ...gift, endsAt: { toDate: () => new Date('2026-12-01T00:00:00Z') } })?.endsAt === '2026-12-01T00:00:00.000Z', 'a Firestore Timestamp works as an end time');
  ok(parseGift('g5', { ...gift, expireDays: 7 })?.expireDays === 7, 'expireDays is carried over');
  ok(parseGift('g6', { ...gift, endsAt: null, expireDays: null }) !== null && parseGift('g6', { ...gift, endsAt: '' }) !== null, 'null / empty optional fields are the same as leaving them out');

  const bad: [string, unknown][] = [
    ['not an object', 'text'],
    ['null', null],
    ['an array', [gift]],
    ['not sent yet (pending)', { ...gift, status: 'pending' }],
    ['already claimed', { ...gift, status: 'claimed' }],
    ['for one named player', { ...gift, recipientType: 'specific', recipientPlayerId: 'abc' }],
    ['no recipientType', { ...gift, recipientType: undefined }],
    ['an item reward (a gift pays gems and gold only)', { ...gift, rewardType: 'item' }],
    ['unknown reward type', { ...gift, rewardType: 'diamond' }],
    ['amount 0', { ...gift, rewardAmount: 0 }],
    ['amount negative', { ...gift, rewardAmount: -5 }],
    ['amount not whole', { ...gift, rewardAmount: 1.5 }],
    ['amount is text', { ...gift, rewardAmount: '300' }],
    ['gems over the limit', { ...gift, rewardAmount: REMOTE_GEMS_MAX + 1 }],
    ['gold over the limit', { ...gift, rewardType: 'gold', rewardAmount: REMOTE_GOLD_MAX + 1 }],
    ['no title', { ...gift, title: '  ' }],
    ['title too long', { ...gift, title: 'あ'.repeat(REMOTE_TITLE_MAX + 1) }],
    ['no message', { ...gift, message: '' }],
    ['message too long', { ...gift, message: 'あ'.repeat(REMOTE_GIFT_MESSAGE_MAX + 1) }],
    ['end time that is not a date', { ...gift, endsAt: 'tomorrow-ish' }],
    ['expireDays 0', { ...gift, expireDays: 0 }],
    ['expireDays too long', { ...gift, expireDays: REMOTE_EXPIRE_DAYS_MAX + 1 }],
    ['expireDays not whole', { ...gift, expireDays: 2.5 }],
  ];
  for (const [what, doc] of bad) ok(parseGift('x', doc) === null, `not valid → left out: ${what}`);
  ok(parseGift('', gift) === null && parseGift('a/b', gift) === null, 'an empty id, or one with a slash, is left out');
  ok(parseGift('max', { ...gift, rewardAmount: REMOTE_GEMS_MAX })?.reward.amount === REMOTE_GEMS_MAX && parseGift('max', { ...gift, rewardType: 'gold', rewardAmount: REMOTE_GOLD_MAX }) !== null, 'exactly at the limits is fine');
}

// ---- one mail
{
  const m = parseMail('m1', mail, NOW);
  ok(!!m && m.mail.id === 'remote-m1' && m.mail.title === mail.subject && m.mail.body === mail.body && !m.gift, 'a valid document becomes a mail (subject → title)');
  ok(m?.mail.sentAt === new Date(NOW).toISOString(), 'with no time on it, the moment the game first sees it is the send time');
  ok(parseMail('m2', { ...mail, updatedAt: { toDate: () => new Date('2026-11-19T00:00:00Z') } }, NOW)?.mail.sentAt === '2026-11-19T00:00:00.000Z', 'the time it was last saved is the send time when there is one');
  ok(parseMail('m3', { ...mail, sentAt: '2026-11-18T09:00:00+09:00' }, NOW)?.mail.sentAt === '2026-11-18T00:00:00.000Z', 'an explicit sentAt wins');
  const withReward = parseMail('m4', { ...mail, hasReward: true, rewardType: 'gold', rewardAmount: 1000 }, NOW);
  ok(withReward?.gift?.id === 'remote-mail-m4' && withReward.gift.reward.type === 'gold' && withReward.gift.reward.amount === 1000 && withReward.gift.title === mail.subject, 'a mail with a reward also carries a プレゼント');
  ok(parseMail('m5', { ...mail, hasReward: true, rewardType: 'item', rewardAmount: 3 }, NOW) === null, 'a reward that cannot be paid (an item) → the mail is left out too, never a mail that promises it');
  ok(parseMail('m6', { ...mail, hasReward: true, rewardType: 'gem', rewardAmount: 0 }, NOW) === null, '… and a typo\'d amount likewise');
  ok(parseMail('m7', { ...mail, hasReward: false, rewardType: 'item', rewardAmount: 3 }, NOW) !== null, 'reward fields are ignored when hasReward is off');

  const bad: [string, unknown][] = [
    ['not an object', 7],
    ['draft', { ...mail, status: 'draft' }],
    ['for one named player', { ...mail, recipientType: 'specific' }],
    ['no subject', { ...mail, subject: '' }],
    ['subject too long', { ...mail, subject: 'あ'.repeat(REMOTE_TITLE_MAX + 1) }],
    ['no body', { ...mail, body: ' ' }],
    ['body too long', { ...mail, body: 'あ'.repeat(REMOTE_MAIL_BODY_MAX + 1) }],
  ];
  for (const [what, doc] of bad) ok(parseMail('x', doc, NOW) === null, `not valid → left out: ${what}`);
}

// ---- putting them in the game's lists, and the game's own delivery
{
  resetRemoteInbox();
  const result = applyRemoteInbox(
    {
      gifts: [
        { id: 'b', data: { ...gift, title: 'B' } },
        { id: 'a', data: { ...gift, title: 'A' } },
        { id: 'pending', data: { ...gift, status: 'pending' } },
        { id: 'item', data: { ...gift, rewardType: 'item' } },
        { id: 'one', data: { ...gift, recipientType: 'specific' } },
        'junk',
      ],
      mails: [
        { id: 'm', data: mail },
        { id: 'r', data: { ...mail, hasReward: true, rewardType: 'gem', rewardAmount: 50 } },
        { id: 'draft', data: { ...mail, status: 'draft' } },
        { data: mail },
      ],
    },
    NOW,
  );
  ok(result.status === 'ok' && result.gifts === 3 && result.mails === 2, 'valid ones are added: 2 gifts + 1 gift that rides on a mail, 2 mails');
  ok(result.dropped === 6, 'the rest are counted as dropped (pending, item, specific, junk, draft, no id)');
  ok(GIFT_CAMPAIGNS.map((g) => g.id).join() === `${staticGifts},remote-a,remote-b,remote-mail-r`, 'the game\'s own gifts stay first, the operator\'s follow in id order');
  ok(MAIL_CAMPAIGNS.map((m) => m.id).join() === `${staticMails},remote-m,remote-r`, 'the game\'s own mails stay first, the operator\'s follow');

  const save = SaveSystem.createDefault();
  const changed = InboxSystem.deliver(save, NOW);
  ok(changed && save.gifts.some((g) => g.id === 'remote-a' && g.reward.type === 'gems' && g.reward.amount === 300 && !g.claimed), 'Home\'s delivery puts the operator\'s gift in the プレゼントBOX');
  ok(save.mails.some((m) => m.id === 'remote-m' && m.title === mail.subject), '… and the operator\'s mail in the メールBOX');
  ok(save.gifts.find((g) => g.id === 'remote-a')?.expiresAt === NOW + 30 * 86_400_000, '… claimable for the default 30 days');
  const before = save.gifts.length + save.mails.length;
  InboxSystem.deliver(save, NOW + 1000);
  ok(save.gifts.length + save.mails.length === before, 'delivered once: the next visit does not hand them out again');

  // edited after it was handed out: the same id, so not again
  applyRemoteInbox({ gifts: [{ id: 'a', data: { ...gift, title: 'A (直した)', rewardAmount: 999 } }], mails: [] }, NOW);
  InboxSystem.deliver(save, NOW + 2000);
  ok(save.gifts.filter((g) => g.id === 'remote-a').length === 1 && save.gifts.find((g) => g.id === 'remote-a')?.reward.amount === 300, 'editing a document that was already handed out does not hand it out again');

  // a gift that ended before the player's first visit is not handed out
  applyRemoteInbox({ gifts: [{ id: 'old', data: { ...gift, endsAt: '2026-11-01T00:00:00+09:00' } }], mails: [] }, NOW);
  const fresh = SaveSystem.createDefault();
  InboxSystem.deliver(fresh, NOW);
  ok(!fresh.gifts.some((g) => g.id === 'remote-old'), 'a gift whose end has passed is not sent to a player who first opens the game later');

  ok(applyRemoteInbox({ gifts: 'x', mails: [] }).status === 'unavailable' && GIFT_CAMPAIGNS.map((g) => g.id).join() === staticGifts, 'something that is not even the right shape = unavailable, and the lists are the game\'s own');
  ok(applyRemoteInbox(null).status === 'unavailable', 'null likewise');
  resetRemoteInbox();
  ok(GIFT_CAMPAIGNS.map((g) => g.id).join() === staticGifts && MAIL_CAMPAIGNS.map((m) => m.id).join() === staticMails, 'reset: back to the game\'s own lists exactly');
}

// ---- reading it (with a stand-in for Firestore)
{
  RemoteInbox.forget();
  const result = await RemoteInbox.refresh(async () => ({ gifts: [{ id: 'live', data: gift }], mails: [{ id: 'live', data: mail }] }));
  ok(result.status === 'ok' && result.gifts === 1 && result.mails === 1 && GIFT_CAMPAIGNS.some((g) => g.id === 'remote-live'), 'refresh reads and adds');
  let calls = 0;
  const again = await RemoteInbox.refresh(async () => {
    calls++;
    return { gifts: [], mails: [] };
  });
  ok(again === result && calls === 0, 'it reads only once (the same result comes back)');

  RemoteInbox.forget();
  ok(!GIFT_CAMPAIGNS.some((g) => g.id.startsWith('remote-')), 'forget takes the operator\'s entries out');
  const clash = applyRemoteInbox({ gifts: [{ id: 'same', data: gift }], mails: [{ id: 'same', data: mail }] }, NOW);
  ok(clash.gifts === 1 && clash.mails === 1 && clash.dropped === 0, 'a gift and a mail with the same document id are both kept (different lists)');
  const twice = applyRemoteInbox({ gifts: [], mails: [{ id: 'k', data: { ...mail, hasReward: true, rewardType: 'gold', rewardAmount: 5 } }, { id: 'k', data: mail }] }, NOW);
  ok(twice.mails === 1 && twice.dropped === 1, 'the same id twice in one list: only the first is kept');
  resetRemoteInbox();
  const failed = await RemoteInbox.refresh(async () => {
    throw new Error('offline');
  });
  ok(failed.status === 'unavailable' && GIFT_CAMPAIGNS.map((g) => g.id).join() === staticGifts, 'a failure adds nothing and does not throw');
  RemoteInbox.forget();
  ok((await RemoteInbox.refresh()).status === 'not_configured', 'without Firebase settings: not_configured at once, no network');
  RemoteInbox.forget();
}

if (failures) process.exit(1);
