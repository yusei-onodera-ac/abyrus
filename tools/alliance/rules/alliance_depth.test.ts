// 同盟の「ミッション」と「研究」の Firestore ルール (firestore.rules) を、Firestore エミュレーターで試す。本番には触らない
// (initializeTestEnvironment は、エミュレーターにしかつながらない)。
//
// 道具: vitest と @firebase/rules-unit-testing が要る (リポジトリの package.json には入れていない。abyrus-admin の `npm run test:rules`
// と同じ道具)。この3つが入っているフォルダ (例: abyrus-admin の clone) に、このファイルを `tests/` として置いて、そこから:
//   firebase emulators:exec --only firestore --project demo-abyrus-alliance-depth "vitest run"
// (ルールは、RULES_PATH の環境変数か、このファイルから見た ../../../firestore.rules を読む)。手順は docs/ALLIANCE_SERVER.md の「ルールの試験」。
//
// 「いまの時刻」は、実時間。4:00 (日本時間) の前後数秒に走らせると、日付がずれて、1回だけ落ちることがある。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const RULES_PATH = process.env.RULES_PATH ?? resolve(__dirname, '../../../firestore.rules');
let env: RulesTestEnvironment;

const LEADER = 'auth-leader';
const OFFICER = 'auth-officer';
const MEMBER = 'auth-member';
const OTHER = 'auth-other'; // a second plain member
const STRANGER = 'auth-stranger';
const AL = 'al1';

// ---- the same day / week keys as the rules and onlineLogic.ts (written out again here, on purpose)
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const dayKeyJs = (ms: number): string => {
  const d = new Date(ms + 5 * HOUR);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
};
const mondayKeyJs = (ms: number): string => {
  const day = Math.floor((ms + 9 * HOUR) / DAY);
  const monday = new Date((day - ((day + 3) % 7)) * DAY);
  return `${monday.getUTCFullYear()}-${monday.getUTCMonth() + 1}-${monday.getUTCDate()}`;
};
const DAILY_ID = (): string => `d${dayKeyJs(Date.now())}`;
const WEEKLY_ID = (): string => `w${mondayKeyJs(Date.now())}`;

const allianceDoc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'テスト同盟', nameLower: 'てすと', emblem: 1, description: '', level: 5, exp: 100, memberCount: 4, memberMax: 25, joinPolicy: 'open', minPlayerLevel: 0,
  leaderName: 'リーダー', leaderAuth: LEADER, weekPoints: 0, power: 1000, league: 'bronze', fund: 100000, research: { battle: 1 }, createdAt: new Date(), updatedAt: new Date(), ...over,
});
const memberDoc = (role: string, n: string): Record<string, unknown> => ({ playerId: `pid${n}`.padEnd(8, 'x'), name: `メンバー${n}`, level: 10, power: 1000, role, contribution: 0, weekContribution: 0, weekId: '', coins: 0, lastActiveAt: new Date(), joinedAt: new Date(), helper: null });

const goals3 = [
  { id: 'd_stage', metric: 'stage', target: 50 },
  { id: 'd_donate', metric: 'donate', target: 6 },
  { id: 'd_idle', metric: 'idle', target: 4 },
];

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-abyrus-alliance-depth', firestore: { rules: readFileSync(RULES_PATH, 'utf8') } });
});
afterAll(async () => env?.cleanup());

async function seed(over: Record<string, unknown> = {}): Promise<void> {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'alliances', AL), allianceDoc(over));
    for (const [uid, role, n] of [[LEADER, 'leader', '1'], [OFFICER, 'officer', '2'], [MEMBER, 'member', '3'], [OTHER, 'member', '4']] as const) {
      await setDoc(doc(db, 'alliances', AL, 'members', uid), memberDoc(role, n));
    }
  });
}

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const allianceRef = (uid: string) => doc(as(uid), 'alliances', AL);
const boardRef = (uid: string, id: string) => doc(as(uid), 'alliances', AL, 'missionTotals', id);

// ------------------------------------------------------------------------------------------------ research

describe('研究 (research)', () => {
  beforeEach(async () => seed());

  it('an officer advances a line one step: the fund drops by the price of that step', async () => {
    await assertSucceeds(updateDoc(allianceRef(OFFICER), { fund: 100000 - 30000, 'research.battle': 2, updatedAt: serverTimestamp() }));
  });
  it('the leader starts a line that does not exist yet (research.income = 1, the price of step 1)', async () => {
    await assertSucceeds(updateDoc(allianceRef(LEADER), { fund: 100000 - 15000, 'research.income': 1, updatedAt: serverTimestamp() }));
  });
  it('an alliance from before research existed (no fund and no research fields): step 1 still works', async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { research: _research, fund: _fund, ...old } = allianceDoc();
      void _research;
      void _fund;
      await setDoc(doc(ctx.firestore(), 'alliances', AL), { ...old, fund: 20000 });
    });
    await assertSucceeds(updateDoc(allianceRef(LEADER), { fund: 5000, 'research.growth': 1, updatedAt: serverTimestamp() }));
  });
  it('a plain member cannot', async () => {
    await assertFails(updateDoc(allianceRef(MEMBER), { fund: 70000, 'research.battle': 2, updatedAt: serverTimestamp() }));
  });
  it('someone who is not in the alliance cannot', async () => {
    await assertFails(updateDoc(allianceRef(STRANGER), { fund: 70000, 'research.battle': 2, updatedAt: serverTimestamp() }));
  });
  it('the wrong price is refused (too little / too much / the fund untouched)', async () => {
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 100000 - 29999, 'research.battle': 2, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 100000 - 30001, 'research.battle': 2, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(allianceRef(OFFICER), { 'research.battle': 2, updatedAt: serverTimestamp() }));
  });
  it('the price of the step it really is: step 3 costs 60000, not step 2\'s 30000', async () => {
    await seed({ research: { battle: 2 } });
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 100000 - 30000, 'research.battle': 3, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(allianceRef(OFFICER), { fund: 100000 - 60000, 'research.battle': 3, updatedAt: serverTimestamp() }));
  });
  it('skipping a step, or going back, is refused', async () => {
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 100000 - 30000 - 60000, 'research.battle': 3, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 100000 + 15000, 'research.battle': 0, updatedAt: serverTimestamp() }));
  });
  it('two lines at once are refused', async () => {
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 100000 - 30000 - 15000, 'research.battle': 2, 'research.income': 1, updatedAt: serverTimestamp() }));
  });
  it('the alliance level gates the step: Lv2 cannot take step 3 (needs Lv5); Lv9 can take step 5 (needs Lv9)', async () => {
    await seed({ level: 4, research: { battle: 2 } });
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 100000 - 60000, 'research.battle': 3, updatedAt: serverTimestamp() }));
    await seed({ level: 9, research: { battle: 4 }, fund: 200000 });
    await assertSucceeds(updateDoc(allianceRef(OFFICER), { fund: 200000 - 180000, 'research.battle': 5, updatedAt: serverTimestamp() }));
  });
  it('step 1 needs Lv2', async () => {
    await seed({ level: 1, research: {}, fund: 50000 });
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 35000, 'research.income': 1, updatedAt: serverTimestamp() }));
  });
  it('there is no step 6', async () => {
    await seed({ level: 10, research: { battle: 5 }, fund: 500000 });
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 500000 - 180000, 'research.battle': 6, updatedAt: serverTimestamp() }));
  });
  it('not enough fund for the step is refused (the fund cannot go below what the price leaves)', async () => {
    await seed({ fund: 29999 });
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: -1, 'research.battle': 2, updatedAt: serverTimestamp() }));
  });
  it('an unknown line is refused', async () => {
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 85000, 'research.stamina': 1, updatedAt: serverTimestamp() }));
  });
  it('nothing else can change along with a research step', async () => {
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 70000, 'research.battle': 2, name: 'のっとり', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(allianceRef(OFFICER), { fund: 70000, 'research.battle': 2, level: 10, memberMax: 30, updatedAt: serverTimestamp() }));
  });
  it('the fund cannot be raised or lowered by hand, by anyone', async () => {
    await assertFails(updateDoc(allianceRef(LEADER), { fund: 999999, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(allianceRef(LEADER), { fund: 0, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(allianceRef(MEMBER), { fund: 999999, updatedAt: serverTimestamp() }));
  });
  it('anyone signed in can read the fund and the research (it is shown on the search card\'s alliance too)', async () => {
    await assertSucceeds(getDoc(allianceRef(STRANGER)));
  });
});

// ------------------------------------------------------------------------------------------------ the fund from donations

describe('資金 (the fund fills with donations)', () => {
  beforeEach(async () => seed({ level: 3, exp: 500, memberMax: 20 }));

  const donateBatch = (uid: string, over: Record<string, unknown>, daily: Record<string, unknown> = { donGold: 1, total: 1 }) => {
    const db = as(uid);
    const b = writeBatch(db);
    b.update(doc(db, 'alliances', AL), { exp: 600, weekPoints: 10, fund: 100100, updatedAt: serverTimestamp(), ...over });
    b.set(doc(db, 'alliances', AL, 'members', uid, 'daily', dayKeyJs(Date.now())), { ...daily, updatedAt: serverTimestamp() });
    return b.commit();
  };

  it('a donation of 100 EXP adds 100 to the fund in the same batch as the daily count', async () => {
    await assertSucceeds(donateBatch(MEMBER, {}));
  });
  it('the biggest donation (300) adds 300', async () => {
    await assertSucceeds(donateBatch(MEMBER, { exp: 800, fund: 100300, weekPoints: 30 }, { donGems: 1, total: 1 }));
  });
  it('more than 300 in a write is refused; so is taking from the fund through the donation path', async () => {
    await assertFails(donateBatch(MEMBER, { fund: 100301 }));
    await assertFails(donateBatch(MEMBER, { fund: 99000 }));
  });
  it('a donation that leaves the fund alone still works (an alliance from before the fund existed)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { fund: _fund, ...old } = allianceDoc({ level: 3, exp: 500, memberMax: 20 });
      void _fund;
      await setDoc(doc(ctx.firestore(), 'alliances', AL), old);
    });
    const db = as(MEMBER);
    const b = writeBatch(db);
    b.update(doc(db, 'alliances', AL), { exp: 600, weekPoints: 10, updatedAt: serverTimestamp() });
    b.set(doc(db, 'alliances', AL, 'members', MEMBER, 'daily', dayKeyJs(Date.now())), { donGold: 1, total: 1, updatedAt: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
});

// ------------------------------------------------------------------------------------------------ mission boards

const newDaily = (by: Record<string, Record<string, number>> = { [MEMBER]: { stage: 5 } }, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'daily', members: 4, goals: goals3, progress: by[MEMBER] ?? {}, by, claims: {}, updatedAt: serverTimestamp(), ...over,
});
const boardData = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'daily', members: 4, goals: goals3, progress: { stage: 40, donate: 3 }, by: { [MEMBER]: { stage: 25, donate: 2 }, [OTHER]: { stage: 15, donate: 1 } }, claims: {}, updatedAt: new Date(), ...over,
});
const seedBoard = async (data: Record<string, unknown> = boardData(), id = DAILY_ID()): Promise<void> => {
  await seed();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'alliances', AL, 'missionTotals', id), data);
  });
};

describe('同盟ミッション: laying a board out (create)', () => {
  beforeEach(async () => seed());

  it('the first member to report lays out today\'s board: goals, the member count, their own share', async () => {
    await assertSucceeds(setDoc(boardRef(MEMBER, DAILY_ID()), newDaily()));
  });
  it('and this week\'s board (the id is "w" + Monday\'s date: it checks the rules\' week)', async () => {
    await assertSucceeds(setDoc(boardRef(MEMBER, WEEKLY_ID()), newDaily({ [MEMBER]: { stage: 5 } }, { kind: 'weekly', goals: [{ id: 'w_stage', metric: 'stage', target: 120 }] })));
  });
  it('a board can be laid out with nobody\'s share yet', async () => {
    await assertSucceeds(setDoc(boardRef(MEMBER, DAILY_ID()), newDaily({}, { progress: {} })));
  });
  it('a stranger cannot lay one out, nor read one', async () => {
    await assertFails(setDoc(boardRef(STRANGER, DAILY_ID()), newDaily({ [STRANGER]: { stage: 5 } })));
    await seedBoard();
    await assertFails(getDoc(boardRef(STRANGER, DAILY_ID())));
    await assertSucceeds(getDoc(boardRef(MEMBER, DAILY_ID())));
  });
  const bad: [string, () => Record<string, unknown>, string?][] = [
    ['an old day', () => newDaily(), 'd2020-1-1'],
    ['tomorrow', () => newDaily(), `d${dayKeyJs(Date.now() + 2 * DAY)}`],
    ['a weekly board under a daily id', () => newDaily({ [MEMBER]: { stage: 5 } }, { kind: 'weekly', goals: [{ id: 'w_stage', metric: 'stage', target: 120 }] })],
    ['a daily board under the weekly id', () => newDaily(), WEEKLY_ID()],
    ['last week', () => newDaily({ [MEMBER]: { stage: 5 } }, { kind: 'weekly', goals: [{ id: 'w_stage', metric: 'stage', target: 120 }] }), `w${mondayKeyJs(Date.now() - 7 * DAY)}`],
    ['a member count that is not the alliance\'s (4)', () => newDaily({ [MEMBER]: { stage: 5 } }, { members: 1 })],
    ['four daily goals', () => newDaily({ [MEMBER]: { stage: 5 } }, { goals: [...goals3, { id: 'd_gacha', metric: 'gacha', target: 5 }] })],
    ['two weekly goals', () => newDaily({ [MEMBER]: { stage: 5 } }, { kind: 'weekly', goals: [{ id: 'w_stage', metric: 'stage', target: 120 }, { id: 'w_raid', metric: 'raid', target: 20 }] }), WEEKLY_ID()],
    ['no goals', () => newDaily({ [MEMBER]: { stage: 5 } }, { goals: [] })],
    ['a goal for an action that does not exist', () => newDaily({ [MEMBER]: { stage: 5 } }, { goals: [{ id: 'd_x', metric: 'bogus', target: 5 }] })],
    ['a goal target of 0', () => newDaily({ [MEMBER]: { stage: 5 } }, { goals: [{ id: 'd_stage', metric: 'stage', target: 0 }] })],
    ['a goal target over ten million', () => newDaily({ [MEMBER]: { stage: 5 } }, { goals: [{ id: 'd_stage', metric: 'stage', target: 10000001 }] })],
    ['a goal with an extra field', () => newDaily({ [MEMBER]: { stage: 5 } }, { goals: [{ id: 'd_stage', metric: 'stage', target: 5, reward: 1 }] })],
    ['a share over the daily cap (301 stages)', () => newDaily({ [MEMBER]: { stage: 301 } })],
    ['14 donations in a day', () => newDaily({ [MEMBER]: { donate: 14 } })],
    ['a negative share', () => newDaily({ [MEMBER]: { stage: -1 } })],
    ['a share for an action that does not exist', () => newDaily({ [MEMBER]: { bogus: 1 } })],
    ['a share that is text', () => newDaily({ [MEMBER]: { stage: '5' as never } })],
    ['somebody else\'s share', () => newDaily({ [OTHER]: { stage: 5 } }, { progress: { stage: 5 } })],
    ['two members\' shares at once', () => newDaily({ [MEMBER]: { stage: 5 }, [OTHER]: { stage: 5 } }, { progress: { stage: 10 } })],
    ['a total that is not the creator\'s share', () => newDaily({ [MEMBER]: { stage: 5 } }, { progress: { stage: 50 } })],
    ['claims already in it', () => newDaily({ [MEMBER]: { stage: 5 } }, { claims: { [MEMBER]: ['d_stage'] } })],
    ['an extra field', () => newDaily({ [MEMBER]: { stage: 5 } }, { bonus: 1 })],
  ];
  for (const [what, make, id] of bad) {
    it(`is refused: ${what}`, async () => {
      await assertFails(setDoc(boardRef(MEMBER, id ?? DAILY_ID()), make()));
    });
  }
});

describe('同盟ミッション: adding to a board (report)', () => {
  beforeEach(async () => seedBoard());

  const report = (uid: string, mine: Record<string, number>, progress: Record<string, number>, extra: Record<string, unknown> = {}, id = DAILY_ID()) =>
    updateDoc(boardRef(uid, id), { progress, [`by.${uid}`]: mine, updatedAt: serverTimestamp(), ...extra });

  it('a member adds to their own share and the total grows by the same amount', async () => {
    await assertSucceeds(report(MEMBER, { stage: 30, donate: 2 }, { stage: 45, donate: 3 }));
  });
  it('a member who has no share yet adds one', async () => {
    await assertSucceeds(report(OFFICER, { gacha: 4 }, { stage: 40, donate: 3, gacha: 4 }));
  });
  it('an action nobody had counted yet is fine', async () => {
    await assertSucceeds(report(MEMBER, { stage: 25, donate: 2, idle: 1 }, { stage: 40, donate: 3, idle: 1 }));
  });
  it('the total cannot grow by more than the share does', async () => {
    await assertFails(report(MEMBER, { stage: 30, donate: 2 }, { stage: 60, donate: 3 }));
  });
  it('the total cannot grow by less either (the share and the total stay together)', async () => {
    await assertFails(report(MEMBER, { stage: 30, donate: 2 }, { stage: 40, donate: 3 }));
  });
  it('a share cannot go down', async () => {
    await assertFails(report(MEMBER, { stage: 20, donate: 2 }, { stage: 35, donate: 3 }));
  });
  it('someone else\'s share cannot be touched', async () => {
    await assertFails(updateDoc(boardRef(MEMBER, DAILY_ID()), { progress: { stage: 50, donate: 3 }, [`by.${OTHER}`]: { stage: 25, donate: 1 }, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(boardRef(MEMBER, DAILY_ID()), { progress: { stage: 40, donate: 3 }, [`by.${OTHER}`]: { stage: 0, donate: 0 }, updatedAt: serverTimestamp() }));
  });
  it('the daily cap holds: 300 stages are fine, 301 are not (13 donations / 14)', async () => {
    await assertSucceeds(report(MEMBER, { stage: 300, donate: 2 }, { stage: 315, donate: 3 }));
    await assertFails(report(MEMBER, { stage: 301, donate: 2 }, { stage: 316, donate: 3 }));
    await assertFails(report(MEMBER, { stage: 25, donate: 14 }, { stage: 40, donate: 15 }));
  });
  it('the weekly cap is seven times the daily one', async () => {
    await seedBoard(boardData({ kind: 'weekly', goals: [{ id: 'w_stage', metric: 'stage', target: 120 }] }), WEEKLY_ID());
    await assertSucceeds(report(MEMBER, { stage: 2100, donate: 2 }, { stage: 2115, donate: 3 }, {}, WEEKLY_ID()));
    await assertFails(report(MEMBER, { stage: 2101, donate: 2 }, { stage: 2116, donate: 3 }, {}, WEEKLY_ID()));
  });
  it('an action that does not exist is refused', async () => {
    await assertFails(report(MEMBER, { stage: 25, donate: 2, bogus: 1 }, { stage: 40, donate: 3, bogus: 1 }));
  });
  it('the goals, the member count and the kind are fixed once laid out', async () => {
    await assertFails(report(MEMBER, { stage: 26, donate: 2 }, { stage: 41, donate: 3 }, { goals: [{ id: 'd_stage', metric: 'stage', target: 1 }] }));
    await assertFails(report(MEMBER, { stage: 26, donate: 2 }, { stage: 41, donate: 3 }, { members: 1 }));
    await assertFails(report(MEMBER, { stage: 26, donate: 2 }, { stage: 41, donate: 3 }, { kind: 'weekly' }));
  });
  it('the claims cannot be rewritten through a report', async () => {
    await assertFails(report(MEMBER, { stage: 26, donate: 2 }, { stage: 41, donate: 3 }, { claims: { [MEMBER]: ['d_stage'] } }));
  });
  it('a stranger cannot report', async () => {
    await assertFails(report(STRANGER, { stage: 5 }, { stage: 45, donate: 3 }));
  });
  it('yesterday\'s board is closed (only today\'s can be added to)', async () => {
    await seedBoard(boardData(), 'd2020-1-1');
    await assertFails(report(MEMBER, { stage: 30, donate: 2 }, { stage: 45, donate: 3 }, {}, 'd2020-1-1'));
  });
  it('a board cannot be deleted, by the leader either', async () => {
    await assertFails((await import('firebase/firestore')).deleteDoc(boardRef(LEADER, DAILY_ID())));
  });
});

describe('同盟ミッション: taking a reward (claim)', () => {
  // 'd_stage' is met (40 of 50 + the others' ...): make progress meet the target
  const met = (over: Record<string, unknown> = {}): Record<string, unknown> => boardData({ progress: { stage: 60, donate: 3 }, by: { [MEMBER]: { stage: 40, donate: 2 }, [OTHER]: { stage: 20, donate: 1 } }, ...over });
  const claim = (uid: string, ids: string[], others: Record<string, string[]> = {}) => updateDoc(boardRef(uid, DAILY_ID()), { [`claims.${uid}`]: ids, ...Object.fromEntries(Object.entries(others).map(([k, v]) => [`claims.${k}`, v])), updatedAt: serverTimestamp() });

  it('a member who contributed takes a goal that is met', async () => {
    await seedBoard(met());
    await assertSucceeds(claim(MEMBER, ['d_stage']));
  });
  it('and then another one (donate: met at 6? no - 3 of 6): a goal that is not met is refused', async () => {
    await seedBoard(met({ claims: { [MEMBER]: ['d_stage'] } }));
    await assertFails(claim(MEMBER, ['d_stage', 'd_donate']));
  });
  it('a second goal, once it is met, is taken after the first', async () => {
    await seedBoard(met({ progress: { stage: 60, donate: 6 }, claims: { [MEMBER]: ['d_stage'] } }));
    await assertSucceeds(claim(MEMBER, ['d_stage', 'd_donate']));
  });
  it('the same goal twice is refused', async () => {
    await seedBoard(met({ claims: { [MEMBER]: ['d_stage'] } }));
    await assertFails(claim(MEMBER, ['d_stage', 'd_stage']));
  });
  it('two at once are refused (one claim per write)', async () => {
    await seedBoard(met({ progress: { stage: 60, donate: 6 } }));
    await assertFails(claim(MEMBER, ['d_stage', 'd_donate']));
  });
  it('someone with no share in that action cannot (the leader has none)', async () => {
    await seedBoard(met());
    await assertFails(claim(LEADER, ['d_stage']));
  });
  it('an id that is not one of the goals is refused', async () => {
    await seedBoard(met());
    await assertFails(claim(MEMBER, ['d_gacha']));
    await assertFails(claim(MEMBER, ['nope']));
  });
  it('another member\'s claims cannot be written', async () => {
    await seedBoard(met());
    await assertFails(claim(MEMBER, ['d_stage'], { [OTHER]: ['d_stage'] }));
    await assertFails(updateDoc(boardRef(MEMBER, DAILY_ID()), { [`claims.${OTHER}`]: ['d_stage'], updatedAt: serverTimestamp() }));
  });
  it('claims cannot be taken back', async () => {
    await seedBoard(met({ claims: { [MEMBER]: ['d_stage'] } }));
    await assertFails(claim(MEMBER, []));
  });
  it('a claim cannot be mixed with a change to the progress', async () => {
    await seedBoard(met());
    await assertFails(updateDoc(boardRef(MEMBER, DAILY_ID()), { [`claims.${MEMBER}`]: ['d_stage'], progress: { stage: 1000, donate: 3 }, updatedAt: serverTimestamp() }));
  });
  it('yesterday\'s goals cannot be claimed any more', async () => {
    await seedBoard(met(), 'd2020-1-1');
    await assertFails(updateDoc(boardRef(MEMBER, 'd2020-1-1'), { [`claims.${MEMBER}`]: ['d_stage'], updatedAt: serverTimestamp() }));
  });
  it('a coin reward fits the member\'s own write rule (at most +100 in one write)', async () => {
    await seedBoard(met());
    await assertFails(updateDoc(doc(as(MEMBER), 'alliances', AL, 'members', MEMBER), { coins: 101 }));
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'alliances', AL, 'members', MEMBER), { coins: 100 }));
  });
});
