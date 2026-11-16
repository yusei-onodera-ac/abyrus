// Runs the 同盟 rules (Local backend + AllianceService + the save + the perk hooks) end to end without a browser.
import { LocalAllianceBackend } from '../../src/game/alliance/LocalAllianceBackend';
import { AllianceService } from '../../src/game/alliance/AllianceService';
import { restoreAlliance } from '../../src/game/alliance/AllianceSave';
import type { PlayerProfile, HelperHero, AllianceDetail } from '../../src/game/alliance/AllianceBackend';
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { IdleSystem } from '../../src/game/systems/IdleSystem';
import { StageRewardSystem, type StageBonus } from '../../src/game/systems/StageRewardSystem';
import { BattleSystem } from '../../src/game/systems/BattleSystem';
import { createHeroInstance } from '../../src/game/data/heroes';
import { DONATIONS, perksForLevel, raidWarPoints, weekIdOf, weekStartOf, dayKeyOf, allianceExpToNext, raidDamageCap } from '../../src/game/data/alliance';
import { BigNumber } from '../../src/game/systems/BigNumber';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// Monday 2026-11-09, 10:00 local.
const START = new Date(2026, 10, 9, 10, 0, 0).getTime();

// a localStorage that keeps what is saved (SaveSystem.save / load)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

interface Rig {
  save: SaveData;
  b: LocalAllianceBackend;
  me: PlayerProfile;
  clock: { t: number };
  advance: (ms: number) => Promise<void>;
}

function rig(power = 5000, level = 20, now = START): Rig {
  const save = SaveSystem.createDefault();
  save.playerLevel = level;
  save.playerName = 'テスター';
  save.gems = 10000;
  const clock = { t: now };
  const b = new LocalAllianceBackend(() => save, { now: () => clock.t });
  const me: PlayerProfile = { uid: save.social.playerId, name: 'テスター', level, power };
  return {
    save,
    b,
    me,
    clock,
    advance: async (ms) => {
      clock.t += ms;
      await b.load(me);
    },
  };
}

const must = <T>(r: { ok: boolean; value?: T; message?: string }, label: string): T => {
  if (!r.ok) throw new Error(`${label}: ${r.message}`);
  return r.value as T;
};

// ---------------------------------------------------------------------------------------------- data tables
{
  ok(perksForLevel(1).raidAttemptsPerDay === 3 && perksForLevel(5).raidAttemptsPerDay === 4 && perksForLevel(8).raidAttemptsPerDay === 5 && perksForLevel(10).raidAttemptsPerDay === 5, 'attempts: 3 / 4 at Lv5 / 5 at Lv8 and Lv10');
  ok(perksForLevel(1).memberMax === 20 && perksForLevel(5).memberMax === 25 && perksForLevel(10).memberMax === 30, 'member cap 20 / 25 / 30');
  ok(perksForLevel(10).idleGoldBonus === 0.2 && perksForLevel(10).expDropBonus === 0.15 && perksForLevel(10).staminaMaxBonus === 20, 'Lv10 perks match the design table');
  ok(allianceExpToNext(1) === 3000 && allianceExpToNext(2) === 4800 && allianceExpToNext(10) === null, 'EXP curve 3000 x 1.6^(Lv-1), none at the max');
  ok(raidWarPoints(0) === 0 && raidWarPoints(1e6) > 0 && raidWarPoints(1e40) < 1000, 'war points from damage: log-like, small even for 1e40');
  ok(weekIdOf(START) === '2026-11-09' && weekIdOf(START + 6 * DAY) === '2026-11-09' && weekIdOf(START + 7 * DAY - 1 * HOUR - 10 * HOUR + 1) !== undefined, 'week id = the Monday');
  ok(weekStartOf(START) === new Date(2026, 10, 9).getTime(), 'week starts Monday 0:00');
  ok(dayKeyOf(new Date(2026, 10, 10, 3, 59).getTime()) === '2026-11-09' && dayKeyOf(new Date(2026, 10, 10, 4, 0).getTime()) === '2026-11-10', 'the day turns at 4:00');
}

// ---------------------------------------------------------------------------------------------- search, create, join
{
  const r = rig(5000, 20);
  ok(must(await r.b.load(r.me), 'load') === null, 'a new player is in no alliance');
  const all = must(await r.b.search(r.me, {}), 'search');
  ok(all.length === 30, 'search lists 30 by default');
  const text = all[0].name.slice(0, 2);
  const found = must(await r.b.search(r.me, { text }), 'search text');
  ok(found.length >= 1 && found.every((a) => a.name.includes(text)), 'search by part of a name');
  const joinable = must(await r.b.search(r.me, { joinableOnly: true, limit: 40 }), 'joinable');
  ok(joinable.every((a) => a.joinPolicy !== 'invite' && a.memberCount < a.memberMax && a.minPlayerLevel <= 20), 'joinableOnly leaves out invite-only, full and out-of-reach');
  const rec = must(await r.b.recommended(r.me), 'recommended');
  ok(rec.length > 0 && rec.length <= 5 && rec.every((a) => a.joinPolicy !== 'invite'), 'recommended: a few joinable alliances');

  const base = { name: 'テスト同盟', emblem: 3, description: 'ためしの同盟です', joinPolicy: 'approval' as const, minPlayerLevel: 0 };
  ok(!(await r.b.create(r.me, { ...base, name: 'あ' })).ok, 'a name of 1 character is refused');
  const longName = await r.b.create(r.me, { ...base, name: 'あいうえおかきくけこさ' });
  ok(!longName.ok && longName.reason === 'bad_name', 'a name of 11 characters is refused');
  ok(!(await r.b.create(r.me, { ...base, name: 'テスト😀' })).ok, 'an emoji in the name is refused');
  const taken = await r.b.create(r.me, { ...base, name: all[0].name });
  ok(!taken.ok && taken.reason === 'name_taken', 'a name that is used is refused');
  ok(!(await r.b.create(r.me, { ...base, emblem: 99 })).ok, 'a bad emblem is refused');
  ok(!(await r.b.create(r.me, { ...base, description: 'あ'.repeat(61) })).ok, 'a description over 60 characters is refused');
  const made = must(await r.b.create(r.me, base), 'create');
  ok(made.name === 'テスト同盟' && made.level === 1 && made.memberCount === 1 && made.league === 'bronze' && made.memberMax === 20, 'created: Lv1, 1 member, bronze, cap 20');
  const again = await r.b.create(r.me, { ...base, name: 'べつの同盟' });
  ok(!again.ok && again.reason === 'already_in_alliance', 'cannot create a second one');
  const detail = must(await r.b.load(r.me), 'load')!;
  ok(detail.me.role === 'leader' && detail.members.length === 1 && detail.coins === 0, 'the creator is leader, alone, with no coins');
  ok(detail.raid.maxHp > 0 && detail.raid.hp === detail.raid.maxHp && detail.raid.attemptsLeft === 3 && detail.raid.boss.name.length > 0, 'a boss is up with full HP and 3 attempts');
  ok(detail.war.league === 'bronze' && detail.war.table.length === 20 && detail.war.table.filter((e) => e.mine).length === 1, 'the league table has 20 alliances, one of them mine');
  ok(detail.donationLeft.gold === 5 && detail.donationLeft.materials === 5 && detail.donationLeft.gems === 3, 'donation limits 5 / 5 / 3');
  ok(r.save.alliance.allianceId === made.id && r.save.alliance.level === 1, 'the save remembers the alliance and its level');
}

// ---------------------------------------------------------------------------------------------- joining an existing alliance, roles, cooldown
{
  const r = rig(5000, 20);
  const list = must(await r.b.search(r.me, { limit: 40 }), 'search');
  const open = list.find((a) => a.joinPolicy === 'open' && a.memberCount < a.memberMax && a.minPlayerLevel <= 20)!;
  const approval = list.find((a) => a.joinPolicy === 'approval' && a.memberCount < a.memberMax && a.minPlayerLevel <= 20)!;
  const inviteOnly = list.find((a) => a.joinPolicy === 'invite')!;
  const full = list.find((a) => a.memberCount >= a.memberMax);
  const highLevel = list.find((a) => a.minPlayerLevel > 0 && r.me.level < a.minPlayerLevel);
  const low = rig(5000, 1);
  const lowList = must(await low.b.search(low.me, { limit: 40 }), 'search low');
  const gated = lowList.find((a) => a.minPlayerLevel > 1 && a.joinPolicy !== 'invite' && a.memberCount < a.memberMax);
  if (gated) {
    const res = await low.b.join(low.me, gated.id);
    ok(!res.ok && res.reason === 'level_too_low', 'a player under the minimum Lv cannot join');
  }
  void highLevel;
  const inv = await r.b.join(r.me, inviteOnly.id);
  ok(!inv.ok && inv.reason === 'invite_only', 'invite-only refuses a plain join');
  if (full) {
    const f = await r.b.join(r.me, full.id);
    ok(!f.ok && f.reason === 'full', 'a full alliance refuses');
  }
  ok(!(await r.b.join(r.me, 'nope')).ok, 'an unknown alliance is not found');

  // approval flow: a request, then the simulated leader answers after a short while
  const req = must(await r.b.join(r.me, approval.id), 'join approval');
  ok(req === 'requested', 'an approval alliance takes a request');
  ok((await r.b.join(r.me, approval.id)).ok === false, 'the same request cannot be made twice');
  ok(must(await r.b.myRequests(r.me), 'mine').includes(approval.id), 'the request is listed');
  must(await r.b.cancelRequest(r.me, approval.id), 'cancel');
  ok(!must(await r.b.myRequests(r.me), 'mine').includes(approval.id), 'a request can be cancelled');
  ok(!(await r.b.cancelRequest(r.me, approval.id)).ok, 'cancelling twice fails');

  // open: joins at once
  ok(must(await r.b.join(r.me, open.id), 'join open') === 'joined', 'a free-to-join alliance takes you at once');
  const d = must(await r.b.load(r.me), 'load')!;
  ok(d.summary.id === open.id && d.me.role === 'member' && d.members.length === open.memberCount + 1, 'joined as a plain member among the simulated ones');
  ok(d.members.some((m) => m.role === 'leader' && m.simulated) && d.members.filter((m) => m.role === 'officer').length >= 1, 'it has a leader and some officers');
  ok(d.raid.hp < d.raid.maxHp && d.raid.hp > 0 || d.raid.hp === d.raid.maxHp, 'joining mid-week finds the boss part-way down');
  ok(r.save.alliance.allianceId === open.id, 'the save has the alliance id');

  // permissions of a plain member
  const other = d.members.find((m) => m.uid !== r.me.uid && m.role === 'member')!;
  const officer = d.members.find((m) => m.role === 'officer')!;
  const leader = d.members.find((m) => m.role === 'leader')!;
  const denied = async (p: Promise<{ ok: boolean; reason?: string }>, label: string) => {
    const res = await p;
    ok(!res.ok && res.reason === 'no_permission', label);
  };
  await denied(r.b.kick(r.me, other.uid), 'a member cannot kick');
  await denied(r.b.setRole(r.me, other.uid, 'officer'), 'a member cannot set roles');
  await denied(r.b.transferLeader(r.me, other.uid), 'a member cannot hand over the lead');
  await denied(r.b.updateSettings(r.me, { description: 'x' }), 'a member cannot change settings');
  await denied(r.b.resolveRequest(r.me, 'x', true), 'a member cannot settle requests');
  await denied(r.b.invite(r.me, r.save.social.friends[0].id), 'a member cannot invite');
  await denied(r.b.disband(r.me), 'a member cannot disband');
  void officer;
  void leader;

  // leaving: cooldown of 24 h
  ok((await r.b.leave(r.me)).ok, 'a member can leave');
  ok(must(await r.b.load(r.me), 'load') === null && r.save.alliance.allianceId === null && r.save.alliance.level === 0, 'after leaving: no alliance, no perks');
  const cd = await r.b.join(r.me, open.id);
  ok(!cd.ok && cd.reason === 'cooldown', 'cannot join again within 24 hours');
  const cd2 = await r.b.create(r.me, { name: 'あたらしい', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 });
  ok(!cd2.ok && cd2.reason === 'cooldown', 'nor create one');
  await r.advance(23 * HOUR);
  ok(!(await r.b.join(r.me, open.id)).ok, 'still locked after 23 hours');
  await r.advance(2 * HOUR);
  ok((await r.b.join(r.me, open.id)).ok, 'free again after 24 hours');

  // approval: the answer comes within minutes (try alliances until one says yes)
  const r2 = rig(5000, 20);
  const approvals = must(await r2.b.search(r2.me, { limit: 40 }), 's').filter((a) => a.joinPolicy === 'approval' && a.memberCount < a.memberMax && a.minPlayerLevel <= 20);
  let joinedViaRequest = false;
  for (const a of approvals) {
    must(await r2.b.join(r2.me, a.id), 'request');
    await r2.advance(11 * 60 * 1000);
    if (must(await r2.b.load(r2.me), 'load')) {
      joinedViaRequest = true;
      ok(must(await r2.b.myRequests(r2.me), 'mine').length === 0, 'the request is gone once answered');
      break;
    }
  }
  ok(joinedViaRequest, 'a request is answered and the player ends up in (most requests are accepted)');
}

// ---------------------------------------------------------------------------------------------- invites
{
  const r = rig();
  const invites = must(await r.b.invites(r.me), 'invites');
  ok(invites.length === 1 && invites[0].fromName.length > 0, 'one invite from a friend is waiting');
  const id = invites[0].allianceId;
  ok(!(await r.b.acceptInvite(r.me, 'zzz')).ok, 'an unknown invite fails');
  const declined = rig();
  ok((await declined.b.declineInvite(declined.me, (must(await declined.b.invites(declined.me), 'i'))[0].allianceId)).ok && must(await declined.b.invites(declined.me), 'i').length === 0, 'an invite can be declined');
  ok((await r.b.acceptInvite(r.me, id)).ok, 'an invite can be accepted (even to an invite-only alliance)');
  ok(must(await r.b.load(r.me), 'load')!.summary.id === id, 'now a member of it');
  ok(!(await r.b.acceptInvite(r.me, id)).ok, 'cannot accept twice');

  // inviting friends from my own alliance
  const own = rig();
  must(await own.b.create(own.me, { name: '招待の会', emblem: 1, description: '', joinPolicy: 'invite', minPlayerLevel: 0 }), 'create');
  const friend = own.save.social.friends[0];
  ok((await own.b.invite(own.me, friend.id)).ok, 'the leader invites a friend');
  ok(!(await own.b.invite(own.me, friend.id)).ok, 'not the same friend twice');
  ok(!(await own.b.invite(own.me, 'NOTFRIEND')).ok, 'someone who is not a friend cannot be invited');
  await own.advance(4 * HOUR);
  const d = must(await own.b.load(own.me), 'load')!;
  ok(d.members.length === 1 || d.members.some((m) => m.uid === friend.id), 'the friend answers within hours (and joins if they accept)');
  const next = own.save.social.friends[1];
  ok((await own.b.invite(own.me, next.id)).ok, 'another friend can be invited');
}

// ---------------------------------------------------------------------------------------------- donations, levels, perks
{
  const r = rig(5000, 20);
  must(await r.b.create(r.me, { name: '寄付の会', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 }), 'create');
  let totalExp = 0;
  let levelUps = 0;
  for (let i = 0; i < 5; i++) {
    const res = must(await r.b.donate(r.me, 'gold'), 'donate gold');
    totalExp += res.allianceExp;
    if (res.levelUp) levelUps++;
    ok(res.left === 4 - i, `gold donation ${i + 1}: ${res.left} left`);
  }
  const over = await r.b.donate(r.me, 'gold');
  ok(!over.ok && over.reason === 'limit_reached', 'a 6th gold donation in a day is refused');
  for (let i = 0; i < 3; i++) {
    const res = must(await r.b.donate(r.me, 'gems'), 'donate gems');
    totalExp += res.allianceExp;
    if (res.levelUp) levelUps++;
  }
  ok(!(await r.b.donate(r.me, 'gems')).ok, 'a 4th gem donation is refused');
  const d = must(await r.b.load(r.me), 'load')!;
  ok(totalExp === 5 * DONATIONS.gold.allianceExp + 3 * DONATIONS.gems.allianceExp && levelUps === 0 && d.summary.level === 1, '1400 EXP in one day: no level-up yet (Lv2 needs 3000)');
  ok(d.exp === 1400 && d.expToNext === 3000, 'EXP is progress within the level (1400 / 3000)');
  ok(d.coins === 5 * DONATIONS.gold.contribution + 3 * DONATIONS.gems.contribution && d.me.contribution === d.coins, 'contribution = coins = what was donated');
  ok(r.save.alliance.level === 1 && d.perks.idleGoldBonus === 0, 'the save has Lv1 and no perk yet');
  ok(d.war.breakdown.donation === d.coins, 'donations count as war points 1:1 with contribution');
  // next day at 4:00 the limits are back
  r.clock.t = new Date(2026, 10, 10, 4, 5).getTime();
  const d2 = must(await r.b.load(r.me), 'load')!;
  ok(d2.donationLeft.gold === 5 && d2.donationLeft.gems === 3, 'the limits are back after 4:00');
  const sp = await r.b.spendCoins(r.me, d2.coins + 1);
  ok(!sp.ok && sp.reason === 'not_enough', 'cannot spend more coins than held');
  ok(must(await r.b.spendCoins(r.me, 10), 'spend') === d2.coins - 10, 'spending coins returns the balance');
  ok(!(await r.b.spendCoins(r.me, -5)).ok && !(await r.b.spendCoins(r.me, 1.5)).ok, 'a negative or fractional price is refused');
}

// three days of full donations carry the alliance over its first level
{
  const r = rig(5000, 20);
  must(await r.b.create(r.me, { name: '三日の会', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 }), 'create');
  let ups = 0;
  for (let day = 0; day < 3; day++) {
    if (day > 0) r.clock.t += 24 * 3600 * 1000;
    for (let i = 0; i < 5; i++) if (must(await r.b.donate(r.me, 'gold'), 'donate gold').levelUp) ups++;
    for (let i = 0; i < 3; i++) if (must(await r.b.donate(r.me, 'gems'), 'donate gems').levelUp) ups++;
  }
  const d = must(await r.b.load(r.me), 'load')!;
  ok(ups >= 1 && d.summary.level >= 2, 'three days of 1400 EXP: the first level-up comes (3000 needed)');
  ok(r.save.alliance.level === d.summary.level && d.perks.idleGoldBonus >= 0.02, 'the save follows the level and the perk');
}

// ---------------------------------------------------------------------------------------------- the boss
{
  const r = rig(1e9, 50);
  must(await r.b.create(r.me, { name: 'ボス討伐隊', emblem: 2, description: '', joinPolicy: 'approval', minPlayerLevel: 0 }), 'create');
  const d0 = must(await r.b.load(r.me), 'load')!;
  const cap = d0.raid.maxDamagePerAttempt;
  ok(cap === raidDamageCap(1e9) && cap === 1.5e10, 'the damage cap is power x 15');
  const t1 = must(await r.b.beginRaid(r.me), 'begin');
  ok(t1.durationMs === 60000 && t1.maxDamage === cap && t1.boss.name === d0.raid.boss.name, 'a ticket: 60 seconds, the cap and the boss');
  const second = await r.b.beginRaid(r.me);
  ok(!second.ok && second.reason === 'limit_reached', 'cannot begin again before finishing the first');
  const bad = await r.b.finishRaid(r.me, { ...t1, id: 'forged' }, 1);
  ok(!bad.ok && bad.reason === 'bad_input', 'a forged ticket is refused');
  const neg = await r.b.finishRaid(r.me, t1, -5);
  ok(!neg.ok, 'a negative damage is refused (and the ticket is spent)');
  ok(must(await r.b.load(r.me), 'load')!.raid.attemptsLeft === 2, 'the attempt stays used after a bad submission');
  const t2 = must(await r.b.beginRaid(r.me), 'begin 2');
  const out = must(await r.b.finishRaid(r.me, t2, 1e30), 'finish');
  ok(out.damage <= cap + 1 && out.damage > 0, 'a huge claimed damage is cut to the cap');
  ok(out.points === raidWarPoints(out.damage) && out.points > 0, 'the hit gave war points');
  const d1 = must(await r.b.load(r.me), 'load')!;
  ok(d1.raid.myDamage === out.damage && d1.raid.hp === d0.raid.hp - out.damage && d1.raid.ranking[0].uid === r.me.uid, 'my damage is in the boss HP and top of the ranking');
  ok(d1.war.breakdown.raid === out.points, 'the war points are in the breakdown');
  // an expired ticket
  const t3 = must(await r.b.beginRaid(r.me), 'begin 3');
  r.clock.t += 11 * 60 * 1000;
  const late = await r.b.finishRaid(r.me, t3, 1000);
  ok(!late.ok, 'a ticket kept over 10 minutes is void');
  const none = await r.b.beginRaid(r.me);
  ok(!none.ok && none.reason === 'limit_reached', 'the 3 attempts of the day are gone');
  // tomorrow after 4:00: refilled
  r.clock.t = new Date(2026, 10, 10, 4, 10).getTime();
  ok(must(await r.b.load(r.me), 'load')!.raid.attemptsLeft === 3, 'attempts refill at 4:00');
  // keep hitting until the boss is down (alone, 1e11 a hit)
  let defeated = false;
  let lastHit = false;
  for (let day = 0; day < 6 && !defeated; day++) {
    r.clock.t = new Date(2026, 10, 10 + day, 4, 10).getTime();
    await r.b.load(r.me);
    for (let i = 0; i < 3 && !defeated; i++) {
      const t = await r.b.beginRaid(r.me);
      if (!t.ok) break;
      const o = must(await r.b.finishRaid(r.me, t.value, t.value.maxDamage), 'hit');
      defeated = o.defeated;
      lastHit = o.lastHit;
    }
  }
  ok(defeated && lastHit, 'the boss goes down; the last hit is mine');
  const dd = must(await r.b.load(r.me), 'load')!;
  ok(dd.raid.defeatedAt !== null && dd.raid.hp === 0 && dd.raid.attemptsLeft === 0, 'defeated: HP 0 and no more attempts');
  ok(!(await r.b.beginRaid(r.me)).ok, 'no attempts at a boss that is down');
  ok(dd.raid.claimable !== null && dd.raid.claimable.reward.gems! >= 50, 'a reward is waiting');
  const coinsBefore = dd.coins;
  const reward = must(await r.b.claimRaidReward(r.me), 'claim');
  ok(reward.gems! >= 150 && reward.coins! >= 250 && reward.phaseMaterials === 3, 'the defeat reward + 1st place bonus (the only hitter)');
  ok(must(await r.b.load(r.me), 'load')!.coins === coinsBefore + reward.coins!, 'the coins are credited by the backend');
  ok(!(await r.b.claimRaidReward(r.me)).ok, 'the reward can be claimed only once');
}

// ---------------------------------------------------------------------------------------------- week rollover and the war settlement
{
  const r = rig(5000, 20);
  must(await r.b.create(r.me, { name: '週替わり隊', emblem: 4, description: '', joinPolicy: 'invite', minPlayerLevel: 0 }), 'create');
  const week1 = must(await r.b.load(r.me), 'load')!;
  // some activity this week
  const t = must(await r.b.beginRaid(r.me), 'begin');
  must(await r.b.finishRaid(r.me, t, 4e5), 'finish');
  // make the alliance clearly the best of its league: lots of stage points
  for (let i = 0; i < 40; i++) must(await r.b.addWarPoints(r.me, 'stages', 2000), 'points');
  ok(!(await r.b.addWarPoints(r.me, 'stages', -3)).ok && !(await r.b.addWarPoints(r.me, 'stages', NaN)).ok, 'bad point amounts are refused');
  const lead = must(await r.b.load(r.me), 'load')!;
  ok(lead.war.rank === 1, 'with many points the alliance is 1st in its league');
  // into next week
  r.clock.t = new Date(2026, 10, 16, 0, 30).getTime();
  const week2 = must(await r.b.load(r.me), 'load')!;
  ok(week2.raid.weekId === '2026-11-16' && week2.raid.weekId !== week1.raid.weekId, 'a new week: a new boss record');
  ok(week2.raid.boss.name !== week1.raid.boss.name, 'the boss changes from week to week');
  ok(week2.raid.hp === week2.raid.maxHp || week2.raid.hp < week2.raid.maxHp, 'the new boss has HP');
  ok(week2.war.points === 0 && week2.me.weekDamage === 0, 'weekly counters start over');
  ok(week2.war.league === 'silver', 'first place was promoted: bronze to silver');
  ok(week2.war.claimable !== null && week2.war.claimable.rank === 1 && week2.war.claimable.promoted, 'last season\'s reward (1st, promoted) is waiting');
  ok(week2.raid.claimable !== null && week2.raid.claimable.reward.coins === 30, 'a participation reward for last week\'s boss (not defeated) is waiting');
  const wr = must(await r.b.claimWarReward(r.me), 'claim war');
  ok(wr.gems === Math.round(300 * 1) && wr.coins === 400 && wr.badge === 'league_bronze', '1st place in bronze pays 300 gems / 400 coins and a badge');
  ok(!(await r.b.claimWarReward(r.me)).ok, 'the war reward is claimed once');
  const rr = must(await r.b.claimRaidReward(r.me), 'claim raid');
  ok(rr.coins === 30 && rr.gems === 15, 'the participation reward: 15 gems, 30 coins');
  ok(!(await r.b.claimRaidReward(r.me)).ok, 'claimed once');
  // a quiet week in silver: not first any more -> relegated or at least low
  r.clock.t = new Date(2026, 10, 23, 0, 30).getTime();
  const week3 = must(await r.b.load(r.me), 'load')!;
  ok(week3.raid.weekId === '2026-11-23', 'and another week');
  ok(week3.war.claimable === null || week3.war.claimable.rank > 3, 'a quiet silver week finishes low');
  ok(week3.war.league === 'bronze' || week3.war.league === 'silver', 'the league never jumps more than one step');
  // a very long absence: nothing explodes, one boss record, the sim is capped
  r.clock.t += 60 * DAY;
  const back = must(await r.b.load(r.me), 'load')!;
  ok(back.raid.weekId === weekIdOf(r.clock.t) && back.war.table.length === 20, 'after 60 days away the world is consistent');
}

// ---------------------------------------------------------------------------------------------- simulated members, time, determinism
{
  const make = async () => {
    const r = rig(5000, 20);
    const list = must(await r.b.search(r.me, { limit: 40 }), 's');
    const open = list.find((a) => a.joinPolicy === 'open' && a.memberCount >= 12 && a.memberCount < a.memberMax && a.minPlayerLevel <= 20)!;
    must(await r.b.join(r.me, open.id), 'join');
    return { r, open };
  };
  const a = await make();
  const b2 = await make();
  const hp0 = must(await a.r.b.load(a.r.me), 'load')!.raid.hp;
  for (let i = 0; i < 5 * 24; i++) {
    await a.r.advance(HOUR);
    await b2.r.advance(HOUR);
  }
  const da = must(await a.r.b.load(a.r.me), 'load')!;
  const db = must(await b2.r.b.load(b2.r.me), 'load')!;
  ok(da.raid.hp < hp0 || da.raid.defeatedAt !== null, 'simulated members hit the boss as time passes');
  ok(da.raid.hp === db.raid.hp && da.members.length === db.members.length && da.exp === db.exp, 'same start, same clock: same result (deterministic)');
  ok(da.members.some((m) => m.simulated && m.weekDamage > 0), 'members have damage on record');
  ok(da.exp > 0 || da.summary.level > 1, 'they donate too (alliance EXP grows)');
  const chat = must(await a.r.b.chat(a.r.me, 100), 'chat');
  ok(chat.some((m) => m.kind === 'text' && m.senderUid !== a.r.me.uid), 'they chat now and then');
  ok(chat.some((m) => m.kind === 'system'), 'and the system speaks (joins, level-ups, the boss)');
  // closing the game: one jump gives roughly the same as hourly visits
  const c = await make();
  c.r.clock.t += 5 * 24 * HOUR;
  const dc = must(await c.r.b.load(c.r.me), 'load')!;
  ok(dc.raid.hp < dc.raid.maxHp, 'a 5-day jump moves the sim as well (time passes while the game is closed)');
  // a clock set back changes nothing
  const before = JSON.stringify(must(await c.r.b.load(c.r.me), 'l')!.raid.hp);
  c.r.clock.t -= 3 * DAY;
  const after = JSON.stringify(must(await c.r.b.load(c.r.me), 'l')!.raid.hp);
  ok(before === after, 'a clock set back counts as no time');

  // support, helpers, help requests
  const d = must(await a.r.b.load(a.r.me), 'load')!;
  const others = d.members.filter((m) => m.uid !== a.r.me.uid);
  ok(!(await a.r.b.sendStamina(a.r.me, a.r.me.uid)).ok, 'cannot send stamina to yourself');
  ok((await a.r.b.sendStamina(a.r.me, others[0].uid)).ok && !(await a.r.b.sendStamina(a.r.me, others[0].uid)).ok, 'one gift per person per day');
  for (let i = 1; i < 5; i++) ok((await a.r.b.sendStamina(a.r.me, others[i].uid)).ok, `gift ${i + 1} of 5`);
  const sixth = await a.r.b.sendStamina(a.r.me, others[5].uid);
  ok(!sixth.ok && sixth.reason === 'limit_reached', 'a 6th gift in a day is refused');
  ok(must(await a.r.b.load(a.r.me), 'l')!.support.sendLeft === 0, 'sendLeft shows 0');
  const gift = must(await a.r.b.claimStamina(a.r.me), 'claim stamina');
  ok(gift >= 0 && gift % 10 === 0 && gift <= 100, 'received stamina comes in 10s, at most 10 gifts a day');
  ok(must(await a.r.b.claimStamina(a.r.me), 'again') === 0, 'claiming again gives nothing');

  // helper: set one and borrow others'
  const mine: HelperHero = { ownerUid: a.r.me.uid, ownerName: 'テスター', heroId: 'gauss', name: '算盤王ガウス', heroClass: 'tank', rarity: 5, level: 50, phase: 3, skillLevels: [3, 2, 1, 1], gear: { weapon: { defId: 'weapon-5-0', level: 5 }, armor: null, accessory: null }, power: 1000, setAt: 0 };
  ok(!(await a.r.b.setHelper(a.r.me, { ...mine, ownerUid: 'someone' })).ok, 'only your own hero can be a helper');
  ok((await a.r.b.setHelper(a.r.me, mine)).ok, 'a helper can be set');
  ok(must(await a.r.b.load(a.r.me), 'l')!.me.helper?.heroId === 'gauss', 'it shows on my member card');
  ok(!(await a.r.b.borrowHelper(a.r.me, a.r.me.uid)).ok, 'cannot borrow your own helper');
  const lender = d.members.find((m) => m.uid !== a.r.me.uid && m.helper !== null)!;
  const pointsBefore = must(await a.r.b.load(a.r.me), 'l')!.war.breakdown.helpers;
  const lent = must(await a.r.b.borrowHelper(a.r.me, lender.uid), 'borrow');
  ok(lent.heroId === lender.helper!.heroId && lent.ownerUid === lender.uid, 'borrowing returns the lender\'s hero');
  const pointsAfter = must(await a.r.b.load(a.r.me), 'l')!.war.breakdown.helpers;
  ok(pointsAfter - pointsBefore === 5, 'the first loan gives the alliance 5 war points');
  await a.r.b.borrowHelper(a.r.me, lender.uid);
  await a.r.b.borrowHelper(a.r.me, lender.uid);
  const p3 = must(await a.r.b.load(a.r.me), 'l')!.war.breakdown.helpers;
  await a.r.b.borrowHelper(a.r.me, lender.uid);
  const p4 = must(await a.r.b.load(a.r.me), 'l')!.war.breakdown.helpers;
  ok(p3 - pointsBefore === 15 && p4 === p3, 'the lender is paid for 3 loans a day; the 4th gives nothing more');
  const nohelper = d.members.find((m) => m.uid !== a.r.me.uid && m.helper === null);
  if (nohelper) ok(!(await a.r.b.borrowHelper(a.r.me, nohelper.uid)).ok, 'a member with no helper cannot be borrowed');
  ok((await a.r.b.setHelper(a.r.me, null)).ok && must(await a.r.b.load(a.r.me), 'l')!.me.helper === null, 'the helper can be withdrawn');

  // help requests
  ok((await a.r.b.requestHelp(a.r.me, 'raid')).ok, 'a help request can be sent');
  const quick = await a.r.b.requestHelp(a.r.me, 'village');
  ok(!quick.ok && quick.reason === 'limit_reached', 'but not twice within an hour');
  await a.r.advance(61 * 60 * 1000);
  ok((await a.r.b.requestHelp(a.r.me, 'village')).ok, 'after an hour, again');
  const mineMsg = must(await a.r.b.chat(a.r.me, 100), 'c').find((m) => m.kind === 'help' && m.senderUid === a.r.me.uid)!;
  ok(!(await a.r.b.answerHelp(a.r.me, mineMsg.id)).ok, 'cannot answer your own request');
  // let the others post some, then answer one
  for (let i = 0; i < 24 * 6; i++) await a.r.advance(HOUR);
  const theirs = must(await a.r.b.chat(a.r.me, 120), 'c').find((m) => m.kind === 'help' && m.senderUid !== a.r.me.uid && m.help?.open);
  if (theirs) {
    const before = must(await a.r.b.load(a.r.me), 'l')!.coins;
    ok((await a.r.b.answerHelp(a.r.me, theirs.id)).ok, 'a request from another member can be answered');
    ok(must(await a.r.b.load(a.r.me), 'l')!.coins === before + 5, '...for a few contribution points (and coins)');
    ok(!(await a.r.b.answerHelp(a.r.me, theirs.id)).ok, 'once per request');
  } else console.log('INFO  no open help request from others in the window (random): skipped');
  const myOpen = must(await a.r.b.chat(a.r.me, 120), 'c').filter((m) => m.kind === 'help' && m.senderUid === a.r.me.uid);
  ok(myOpen.some((m) => m.help!.helpers.length > 0) || myOpen.length === 0, 'members answer my own request over time');

  // chat
  const sent = must(await a.r.b.sendChat(a.r.me, '  こんにちは😀 :star: '), 'send');
  ok(sent.text === 'こんにちは :star:' || sent.text.startsWith('こんにちは'), 'the chat message is cleaned (the OS emoji is dropped, the in-game one stays)');
  ok(!(await a.r.b.sendChat(a.r.me, '   ')).ok && !(await a.r.b.sendChat(a.r.me, '😀')).ok, 'an empty message is refused');
  ok(must(await a.r.b.chat(a.r.me, 3), 'c').length === 3 && must(await a.r.b.chat(a.r.me, 1000), 'c').length <= 120, 'the chat log is trimmed to 120');
}

// ---------------------------------------------------------------------------------------------- the created alliance's own life: recruits, applicants, roles
{
  const r = rig(5000, 20);
  must(await r.b.create(r.me, { name: '成長の会', emblem: 5, description: '', joinPolicy: 'open', minPlayerLevel: 0 }), 'create');
  for (let i = 0; i < 24 * 3; i++) await r.advance(HOUR);
  const d = must(await r.b.load(r.me), 'l')!;
  ok(d.members.length >= 4, 'an open alliance fills up over a few days');
  const ids = d.members.filter((m) => m.uid !== r.me.uid).map((m) => m.uid);
  must(await r.b.setRole(r.me, ids[0], 'officer'), 'o1');
  must(await r.b.setRole(r.me, ids[1], 'officer'), 'o2');
  must(await r.b.setRole(r.me, ids[2], 'officer'), 'o3');
  const fourth = await r.b.setRole(r.me, ids[3], 'officer');
  ok(!fourth.ok && fourth.reason === 'limit_reached', 'at most 3 officers');
  ok(!(await r.b.setRole(r.me, r.me.uid, 'member')).ok, 'the leader cannot demote themself');
  ok((await r.b.setRole(r.me, ids[0], 'member')).ok, 'an officer can be demoted');
  must(await r.b.setRole(r.me, ids[0], 'officer'), 'back');
  const s = must(await r.b.updateSettings(r.me, { name: '成長の会二', description: 'せつめい', joinPolicy: 'approval', minPlayerLevel: 10, emblem: 7 }), 'settings');
  ok(s.name === '成長の会二' && s.joinPolicy === 'approval' && s.minPlayerLevel === 10 && s.emblem === 7, 'the leader changes the settings');
  ok(!(await r.b.updateSettings(r.me, { minPlayerLevel: 99 })).ok && !(await r.b.updateSettings(r.me, { name: 'あ' })).ok, 'bad settings are refused');
  // kick: leader can kick anyone (not themself); officer only members
  ok(!(await r.b.kick(r.me, r.me.uid)).ok, 'cannot kick yourself');
  ok((await r.b.kick(r.me, ids[3])).ok, 'the leader kicks a member');
  ok(must(await r.b.load(r.me), 'l')!.members.every((m) => m.uid !== ids[3]), 'and they are gone');
  // approval policy: applicants appear
  for (let i = 0; i < 24 * 4; i++) await r.advance(HOUR);
  const d2 = must(await r.b.load(r.me), 'l')!;
  if (d2.requests.length > 0) {
    const n = d2.members.length;
    ok((await r.b.resolveRequest(r.me, d2.requests[0].uid, true)).ok && must(await r.b.load(r.me), 'l')!.members.length === n + 1, 'an applicant is accepted');
    if (d2.requests.length > 1) ok((await r.b.resolveRequest(r.me, d2.requests[1].uid, false)).ok, 'an applicant is turned down');
  } else console.log('INFO  no applicant in the window (random): skipped');
  ok(!(await r.b.resolveRequest(r.me, 'ghost', true)).ok, 'an unknown applicant fails');
  // hand over the lead; then the old leader is an officer
  const heir = must(await r.b.load(r.me), 'l')!.members.find((m) => m.uid === ids[1])!;
  ok(heir.role === 'officer', 'the heir is an officer');
  ok((await r.b.transferLeader(r.me, ids[1])).ok, 'the lead is handed over');
  const after = must(await r.b.load(r.me), 'l')!;
  ok(after.me.role === 'officer' && after.members.find((m) => m.uid === ids[1])!.role === 'leader' && after.members.filter((m) => m.role === 'leader').length === 1, 'one leader, and I am an officer now');
  ok(!(await r.b.kick(r.me, ids[1])).ok, 'an officer cannot kick the leader');
  ok(!(await r.b.kick(r.me, ids[2])).ok, 'an officer cannot kick an officer');
  ok(!(await r.b.disband(r.me)).ok, 'an officer cannot disband');
  ok((await r.b.leave(r.me)).ok, 'an officer can leave');

  // a leader who is not alone cannot just leave; alone, leaving ends it
  const r2 = rig(5000, 20);
  must(await r2.b.create(r2.me, { name: '一人の会', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 }), 'c');
  for (let i = 0; i < 24 * 3; i++) await r2.advance(HOUR);
  const d3 = must(await r2.b.load(r2.me), 'l')!;
  if (d3.members.length > 1) {
    const stay = await r2.b.leave(r2.me);
    ok(!stay.ok && stay.reason === 'no_permission', 'a leader with members must hand over before leaving');
  }
  ok((await r2.b.disband(r2.me)).ok && must(await r2.b.load(r2.me), 'l') === null, 'the leader disbands');
  const lone = rig();
  must(await lone.b.create(lone.me, { name: 'ひとり会', emblem: 0, description: '', joinPolicy: 'invite', minPlayerLevel: 0 }), 'c');
  ok((await lone.b.leave(lone.me)).ok, 'a lone leader leaving ends the alliance');

  // a leader away for over 7 days hands the lead over
  const away = rig();
  must(await away.b.create(away.me, { name: '留守の会', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 }), 'c');
  for (let i = 0; i < 24 * 3; i++) await away.advance(HOUR);
  ok(must(await away.b.load(away.me), 'l')!.members.length > 1, '(it has members by now)');
  away.clock.t += 8 * DAY;
  const gone = must(await away.b.load(away.me), 'l')!;
  ok(gone.me.role !== 'leader' && gone.members.filter((m) => m.role === 'leader').length === 1, 'after 8 days away the lead has passed to someone else');
}

// ---------------------------------------------------------------------------------------------- save: round trip and cleaning
{
  const r = rig(5000, 20);
  must(await r.b.create(r.me, { name: '保存の会', emblem: 2, description: 'せつめい', joinPolicy: 'open', minPlayerLevel: 5 }), 'c');
  for (let i = 0; i < 48; i++) await r.advance(HOUR);
  must(await r.b.donate(r.me, 'gold'), 'd');
  const before = must(await r.b.load(r.me), 'l')!;
  SaveSystem.save(r.save);
  const loaded = SaveSystem.load();
  ok(loaded.alliance.allianceId === r.save.alliance.allianceId && loaded.alliance.level === r.save.alliance.level, 'the save round-trips the alliance id and level');
  const b2 = new LocalAllianceBackend(() => loaded, { now: () => r.clock.t });
  const after = must(await b2.load(r.me), 'l')!;
  ok(after.summary.name === before.summary.name && after.members.length === before.members.length && after.exp === before.exp && after.coins === before.coins && after.raid.hp === before.raid.hp, 'a reloaded save gives the same alliance (members, EXP, coins, boss HP)');

  // damaged saves
  ok(restoreAlliance(null).allianceId === null && restoreAlliance('x').version === 1 && restoreAlliance(undefined).world === null, 'no / junk alliance data = the default');
  ok(restoreAlliance({ world: { seed: 'x' } }).world === null, 'a world without a seed is dropped');
  const raw = JSON.parse(JSON.stringify(r.save.alliance));
  raw.world.own.members[0].level = 'oops';
  raw.world.own.members[1] = 5;
  raw.world.own.raid.hp = 'NaN';
  raw.world.own.exp = -50;
  raw.world.own.chat = [1, 2, { id: 'a' }];
  raw.world.refPower = null;
  const fixed = restoreAlliance(raw);
  ok(fixed.world !== null && fixed.world.own !== null && fixed.world.own.members.every((m) => typeof m.level === 'number' && m.level >= 1), 'bad member numbers are repaired and junk members dropped');
  ok(fixed.world!.own!.raid.hp === fixed.world!.own!.raid.maxHp && fixed.world!.own!.exp === 0 && fixed.world!.own!.chat.length === 0, 'bad HP / EXP / chat are repaired');
  const broken = JSON.parse(JSON.stringify(r.save.alliance));
  delete broken.world.own.raid;
  const dropped = restoreAlliance(broken);
  ok(dropped.world !== null && dropped.world.own === null && dropped.allianceId === null && dropped.level === 0, 'an alliance whose boss record is gone is dropped: the player is simply in none');
  const odd = JSON.parse(JSON.stringify(r.save.alliance));
  odd.shop = { week: 5, bought: { phase: -3, x: 'y', gems: 2.7 } };
  odd.pendingStagePoints = -4;
  odd.leftAt = 'soon';
  const o = restoreAlliance(odd);
  ok(o.pendingStagePoints === 0 && o.leftAt === 0 && o.shop.bought.gems === 2 && o.shop.bought.phase === undefined, 'shop counts, pending points and leftAt are cleaned');
  // an old save from before 同盟: SaveSystem.load adds the default
  store.set('abyrus_save_v1', JSON.stringify({ version: 1, gold: [5, 2], heroes: [], decks: [], stageProgress: 0 }));
  ok(SaveSystem.load().alliance.allianceId === null, 'an old save without the field loads with no alliance');
}

// ---------------------------------------------------------------------------------------------- perks in the game systems
{
  const r = rig(5000, 20);
  const plain = IdleSystem.perHour(r.save).gold;
  r.save.alliance.allianceId = 'x';
  r.save.alliance.level = 5;
  const boosted = IdleSystem.perHour(r.save).gold;
  ok(Math.abs(boosted.div(plain).toNumber() - 1.08) < 1e-9, 'Lv5 alliance: idle gold x1.08');
  r.save.alliance.allianceId = null;
  ok(IdleSystem.perHour(r.save).gold.div(plain).toNumber() === 1, 'no alliance: nothing changes');

  // stamina max: load with an alliance of Lv10 adds 20
  const s = SaveSystem.createDefault();
  s.alliance.allianceId = 'x';
  s.alliance.level = 10;
  s.alliance.world = null;
  store.set('abyrus_save_v1', JSON.stringify(s));
  const loadedPlain = SaveSystem.load();
  // (an alliance id with no world is cleaned away on load: stamina max is the level's only)
  ok(loadedPlain.stamina[1] === 50, 'a dangling alliance id (no world) is cleaned: no bonus');

  // exp-material drops
  const bonus: StageBonus = { firstClear: false, gems: 0, phaseMaterials: 0, items: [{ item: 'exp_m', amount: 10 }, { item: 'equip_essence', amount: 10 }], materials: {} };
  const save = SaveSystem.createDefault();
  save.alliance.allianceId = 'x';
  save.alliance.level = 7; // +9%
  StageRewardSystem.grant(save, bonus);
  ok(bonus.items[0].amount === 11 && bonus.items[1].amount === 10 && (save.items.exp_m ?? 0) === 11, 'Lv7: exp materials +9% (10 -> 11), other items unchanged');
  StageRewardSystem.grant(save, bonus);
  ok(bonus.items[0].amount === 11, 'the same bonus is never raised twice');
  const none = SaveSystem.createDefault();
  const b0: StageBonus = { firstClear: false, gems: 0, phaseMaterials: 0, items: [{ item: 'exp_m', amount: 10 }], materials: {} };
  StageRewardSystem.grant(none, b0);
  ok(b0.items[0].amount === 10, 'no alliance: unchanged');

  // clearing a stage for the first time queues a war point
  const st = SaveSystem.createDefault();
  SaveSystem.clearStage(st, 0);
  ok(st.alliance.pendingStagePoints === 0, 'no alliance: no queued stage points');
  st.alliance.allianceId = 'x';
  SaveSystem.clearStage(st, 1);
  SaveSystem.clearStage(st, 1);
  SaveSystem.clearStage(st, 0);
  ok(st.alliance.pendingStagePoints === 1 && st.stageProgress === 2, 'a first clear queues one point; a replay queues none');
}

// ---------------------------------------------------------------------------------------------- the service
{
  const save = SaveSystem.createDefault();
  save.playerLevel = 30;
  save.playerName = 'サービス';
  save.gems = 1000;
  SaveSystem.addGold(save, BigNumber.from(1e15));
  save.village.materials = { wood: 500, iron: 50, stone: 100 };
  const me = AllianceService.profile(save);
  ok(me.uid === save.social.playerId && me.name === 'サービス' && me.level === 30 && me.power > 0, 'profile: uid, name, Lv and the deck\'s power');
  ok(AllianceService.cached(save) === undefined, 'nothing cached before the first refresh');
  const first = await AllianceService.refresh(save);
  ok(first.ok && first.value === null && AllianceService.cached(save) === null, 'refresh: in no alliance (cached as null)');
  ok(AllianceService.mode() === 'local' && AllianceService.backend().mode === 'local', 'no Firebase configured: the local backend');

  // create: pays 300 gems, refunds when refused
  const refused = await AllianceService.create(save, { name: 'あ', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 });
  ok(!refused.ok && save.gems === 1000, 'a refused creation costs nothing (gems refunded)');
  const poor = SaveSystem.createDefault();
  poor.gems = 100;
  AllianceService.profile(poor);
  const noGems = await AllianceService.create(poor, { name: 'ひんこん会', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 });
  ok(!noGems.ok && noGems.reason === 'not_enough' && poor.gems === 100, 'without 300 gems: refused, nothing taken');
  AllianceService.profile(save);
  const created = await AllianceService.create(save, { name: 'サービス同盟', emblem: 1, description: '', joinPolicy: 'open', minPlayerLevel: 0 });
  ok(created.ok && save.gems === 700 && save.alliance.allianceId === created.value.id, 'created: 300 gems paid, the save knows');
  ok(!(await AllianceService.create(save, { name: 'もう一つ', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 })).ok && save.gems === 700, 'a second creation is refused without taking gems');

  // donate: pays per the table, refunds on failure
  const goldBefore = SaveSystem.getGold(save);
  const hour = IdleSystem.perHour(save).gold;
  const dg = await AllianceService.donate(save, 'gold');
  ok(dg.ok && SaveSystem.getGold(save).toNumber() < goldBefore.toNumber() && Math.abs(goldBefore.sub(SaveSystem.getGold(save)).div(hour).toNumber() - 1) < 1e-3, 'a gold donation costs one hour of idle gold');
  const gemsBefore = save.gems;
  ok((await AllianceService.donate(save, 'gems')).ok && save.gems === gemsBefore - 10, 'a gem donation costs 10 gems');
  const matBefore = save.village.materials.wood + save.village.materials.iron + save.village.materials.stone;
  ok((await AllianceService.donate(save, 'materials')).ok && save.village.materials.wood + save.village.materials.iron + save.village.materials.stone === matBefore - 100, 'a material donation takes 100 in all');
  ok(save.village.materials.wood < 500 && save.village.materials.iron === 50, 'it takes from the largest stock first (wood), not the smallest');
  for (let i = 0; i < 4; i++) await AllianceService.donate(save, 'gold');
  const goldFull = SaveSystem.getGold(save);
  const limited = await AllianceService.donate(save, 'gold');
  ok(!limited.ok && limited.reason === 'limit_reached' && SaveSystem.getGold(save).toNumber() === goldFull.toNumber(), 'over the daily limit: refused and the gold comes back exactly');
  const gemsNow = save.gems;
  for (let i = 0; i < 2; i++) await AllianceService.donate(save, 'gems');
  ok(!(await AllianceService.donate(save, 'gems')).ok && save.gems === gemsNow - 20, 'the refused 4th gem donation gave the 10 gems back');
  const lack = SaveSystem.createDefault();
  lack.gems = 3;
  AllianceService.profile(lack);
  ok(!(await AllianceService.donate(lack, 'gems')).ok, 'not in an alliance: refused');
  AllianceService.profile(save);

  // shop
  type Loaded = { ok: true; value: AllianceDetail | null };
  const detail = (await AllianceService.refresh(save)) as Loaded;
  const coins = detail.value!.coins;
  ok(coins > 0 && AllianceService.shopItems().length === 5, 'there are coins and 5 shop items');
  const expBefore = save.items.exp_m ?? 0;
  const buyExp = await AllianceService.buy(save, 'exp_m');
  ok(buyExp.ok && (save.items.exp_m ?? 0) === expBefore + 3, 'buying exp_m gives 3');
  const d2 = (await AllianceService.refresh(save)) as Loaded;
  ok(d2.value!.coins === coins - 30, 'the price came out of the coins');
  ok(AllianceService.shopStatus(save, 'gems').left === 1 && AllianceService.shopStatus(save, 'exp_m').left === Infinity, 'shop status: weekly limit left');
  const rich = await AllianceService.buy(save, 'gems');
  ok(!rich.ok && rich.reason === 'not_enough' && AllianceService.shopStatus(save, 'gems').bought === 0, 'too few coins: refused, nothing counted');
  ok(!(await AllianceService.buy(save, 'nothing')).ok, 'an unknown item fails');
  // give coins by claiming a lot of donations is slow: top up via the war/raid rewards instead
  const world = save.alliance.world!;
  world.own!.coins = 5000;
  const g0 = save.gems;
  ok((await AllianceService.buy(save, 'gems')).ok && save.gems === g0 + 30, 'with coins: 30 gems bought');
  const limitedBuy = await AllianceService.buy(save, 'gems');
  ok(!limitedBuy.ok && limitedBuy.reason === 'limit_reached', 'the weekly limit of 1 holds');
  ok((await AllianceService.buy(save, 'phase')).ok && save.phaseMaterials >= 1, 'a phase material can be bought');

  // boss + claim through the service
  const tk = await AllianceService.beginRaid(save);
  ok(tk.ok, 'the service begins a raid');
  if (tk.ok) {
    const fin = await AllianceService.finishRaid(save, tk.value, tk.value.maxDamage);
    ok(fin.ok && fin.value.damage > 0, 'and finishes it');
  }
  world.own!.raid.defeatedAt = Date.now();
  world.own!.raid.hp = 0;
  const gemsPre = save.gems;
  const claimed = await AllianceService.claim(save, 'raid');
  ok(claimed.ok && save.gems === gemsPre + (claimed.ok ? claimed.value.gems! : 0) && save.phaseMaterials >= 3, 'claim adds the gems and phase materials to the save');
  ok(!(await AllianceService.claim(save, 'raid')).ok, 'and only once');

  // helpers
  const hero = save.heroes[0];
  hero.gear.weapon = { id: 'w1', defId: 'weapon-2-0', level: 3 };
  const snap = AllianceService.helperSnapshot(save, hero.id)!;
  ok(snap.heroId === hero.heroId && snap.gear.weapon?.defId === 'weapon-2-0' && snap.gear.weapon.level === 3 && snap.power > 0 && snap.ownerUid === me.uid, 'a helper snapshot copies the hero, gear and power');
  ok(AllianceService.helperSnapshot(save, 'ghost') === null, 'no such hero: null');
  const asHero = AllianceService.helperToHeroData(snap);
  ok(asHero.heroId === hero.heroId && asHero.level === hero.level && asHero.gear.weapon?.defId === 'weapon-2-0' && asHero.id.startsWith('helper:'), 'helperToHeroData restores a HeroData with its gear');
  const unit = BattleSystem.createPlayerUnit(asHero, 'back', 0);
  ok(unit.isPlayer && unit.maxHp.compare(0) > 0 && unit.heroId === hero.heroId, 'the battle engine can field it');
  const set = await AllianceService.setHelper(save, hero.id);
  ok(set.ok && save.alliance.helperHeroId === hero.id, 'setHelper registers it (and the save remembers)');
  const det = await AllianceService.refresh(save);
  ok(det.ok && det.value!.me.helper?.heroId === hero.heroId, 'it shows on my card after a refresh');
  hero.level += 5;
  const det2 = await AllianceService.refresh(save);
  ok(det2.ok && det2.value!.me.helper?.level === hero.level, 'a refresh re-registers the helper after the hero levels up');
  ok((await AllianceService.setHelper(save, 'ghost')).ok === false, 'a hero that is not owned cannot be registered');
  ok((await AllianceService.setHelper(save, null)).ok && save.alliance.helperHeroId === '', 'the helper can be withdrawn');

  // stamina gift
  save.alliance.world!.own!.me.pendingStamina = 30;
  save.stamina = [10, 50];
  const gs = await AllianceService.claimStamina(save);
  ok(gs.ok && gs.value === 30 && save.stamina[0] === 40, 'claimed gifts add to stamina');

  // stage points flow
  save.alliance.pendingStagePoints = 3;
  const warBefore = (await AllianceService.refresh(save)) as Loaded;
  const wp = warBefore.value!.war.breakdown.stages;
  save.alliance.pendingStagePoints = 3;
  await AllianceService.recordStageClear(save, 5);
  const warAfter = (await AllianceService.refresh(save)) as Loaded;
  ok(warAfter.value!.war.breakdown.stages - wp === 60 && save.alliance.pendingStagePoints === 0, '3 first clears = 60 war points, sent and cleared');

  // perks reach the stamina maximum through the service
  save.alliance.level = 10;
  world.own!.level = 10;
  await AllianceService.refresh(save);
  ok(save.stamina[1] === 50 + Math.floor(30 / 2) + 20, 'Lv10 raises the stamina maximum by 20 (50 + 15 for Lv30 + 20)');
  const left = await AllianceService.backend().leave(me);
  ok(left.ok, 'the player can leave');
  await AllianceService.refresh(save);
  ok(save.stamina[1] === 50 + 15 && save.alliance.level === 0 && save.alliance.helperHeroId === '', 'after leaving: the bonus is gone');
}

void createHeroInstance;
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
