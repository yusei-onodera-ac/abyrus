/**
 * 同盟の Cloud Functions (Firebase Functions v2, TypeScript)。
 * 設計: docs/ALLIANCE_DESIGN.md / docs/ALLIANCE_SERVER.md。ルール: firestore.rules。
 *
 * ※ 未検証・型検査なし: このリポジトリには firebase-functions / firebase-admin が入っていないので、ここでは、コンパイルも
 *   実行もしていない。`cd functions && npm install && npm run build` で、まず型を通してから、デプロイする。
 *
 * ここにあるもの:
 *   callable   beginRaid / finishRaid        ボスへの挑戦の切符と、結果の検証 (ダメージの上限は、ここで切る)
 *   trigger    onAllianceCreated             新しい同盟を、今週の対抗戦と、ボスに入れる
 *              onMemberWritten               メンバーの出入りのシステムメッセージと、同盟の総合力の集計
 *              onAllianceDeleted             解散した同盟の、残りのデータを消す
 *   scheduled  weeklyRollover (月曜 0:00 JST) 対抗戦の集計 (順位・昇降格・結果) と、新しいシーズン・新しいボス
 *              leaderHandover (毎日 5:00)     7日間来ていない同盟長を、次の人に譲る
 *              cleanup (毎日 4:30)            古いチャット・切符・1日ごとの文書を消す
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore, type DocumentData, type DocumentReference, type Firestore, type Query, type QueryDocumentSnapshot, type WriteBatch } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  LEADER_IDLE_MS,
  RAID,
  WAR,
  dayKey,
  nextLeague,
  perksForLevel,
  raidBossFor,
  raidBossHp,
  raidMaxDamage,
  raidPoints,
  weekEndMs,
  weekId,
  weekStartMs,
  type League,
} from './constants';

// Firestore のデータベースを作った地域と、同じにすること (トリガーは、データベースと同じ地域でしか動かない)。
setGlobalOptions({ region: 'asia-northeast1', maxInstances: 10 });
initializeApp();
const db: Firestore = getFirestore();

// ---------------------------------------------------------------------------------------------- 小さな道具

type Reason = 'not_signed_in' | 'not_in_alliance' | 'raid_over' | 'limit_reached' | 'not_found' | 'bad_input' | 'error';
const failure = (reason: Reason, message: string) => ({ ok: false as const, reason, message });
const success = <T>(value: T) => ({ ok: true as const, value });

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const millis = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const t = v as Timestamp | null | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
};

/** 書き込みを 400 件ずつの batch に分けて、順に確定する (Firestore の上限は 500)。 */
class Writes {
  private batch: WriteBatch = db.batch();
  private count = 0;
  private done: Promise<unknown>[] = [];

  private flush(): void {
    if (this.count === 0) return;
    this.done.push(this.batch.commit());
    this.batch = db.batch();
    this.count = 0;
  }
  set(ref: DocumentReference, data: DocumentData, merge = false): void {
    if (merge) this.batch.set(ref, data, { merge: true });
    else this.batch.set(ref, data);
    if (++this.count >= 400) this.flush();
  }
  update(ref: DocumentReference, data: DocumentData): void {
    this.batch.update(ref, data);
    if (++this.count >= 400) this.flush();
  }
  delete(ref: DocumentReference): void {
    this.batch.delete(ref);
    if (++this.count >= 400) this.flush();
  }
  async commit(): Promise<void> {
    this.flush();
    await Promise.all(this.done);
  }
}

/** 同盟の、その週のボスの文書の中身 (HP は、同盟の総合力と、同盟Lvで決まる)。 */
function newRaidDoc(alliance: DocumentData, nowMs: number): DocumentData {
  const level = num(alliance.level, 1);
  const maxHp = raidBossHp(num(alliance.power), level, perksForLevel(level).raidAttemptsPerDay);
  return {
    weekId: weekId(nowMs),
    boss: raidBossFor(nowMs),
    maxHp,
    hp: maxHp,
    startsAt: Timestamp.fromMillis(weekStartMs(nowMs)),
    endsAt: Timestamp.fromMillis(weekEndMs(nowMs)),
    defeatedAt: null,
    lastHitName: null,
    allianceLevel: level,
  };
}

function systemMessage(text: string): DocumentData {
  return { kind: 'system', senderAuth: 'system', senderPlayerId: 'system', senderName: '同盟', text, sentAt: FieldValue.serverTimestamp() };
}

// ---------------------------------------------------------------------------------------------- 共闘ボス (callable)

/**
 * 挑戦の開始。今日の挑戦回数を1つ使い、切符を発行する (戦う時間と、ダメージの上限を、サーバーが刻む)。
 * 返り値は、{ ok: true, value: RaidTicket } か { ok: false, reason, message }。
 */
export const beginRaid = onCall(async (request) => {
  if (!request.auth) return failure('not_signed_in', 'サインインできていません。');
  const authUid = request.auth.uid;
  const now = Date.now();
  const week = weekId(now);
  const day = dayKey(now);
  try {
    return await db.runTransaction(async (t) => {
      const user = await t.get(db.doc(`users/${authUid}`));
      const allianceId = str(user.get('allianceId'));
      if (!allianceId) return failure('not_in_alliance', '同盟に入っていません。');
      const allianceRef = db.doc(`alliances/${allianceId}`);
      const memberRef = allianceRef.collection('members').doc(authUid);
      const raidRef = allianceRef.collection('raid').doc(week);
      const dailyRef = memberRef.collection('daily').doc(day);
      const [alliance, member, raidSnap, daily] = await Promise.all([t.get(allianceRef), t.get(memberRef), t.get(raidRef), t.get(dailyRef)]);
      if (!alliance.exists || !member.exists) return failure('not_in_alliance', '同盟に入っていません。');
      const a = alliance.data() ?? {};
      const raid = raidSnap.exists ? (raidSnap.data() ?? {}) : newRaidDoc(a, now);
      if (raid.defeatedAt || now > millis(raid.endsAt)) return failure('raid_over', '今週のボスは、もう倒されています。来週を、お待ちください。');
      const used = num(daily.data()?.raidAttempts);
      if (used >= perksForLevel(num(a.level, 1)).raidAttemptsPerDay) return failure('limit_reached', 'きょうの挑戦回数は、もうありません。');

      const ticketRef = allianceRef.collection('tickets').doc();
      const maxDamage = raidMaxDamage(num(member.data()?.power), num(raid.maxHp));
      t.set(ticketRef, { authUid, playerId: str(member.data()?.playerId), weekId: week, issuedAt: now, expiresAt: now + RAID.ticketTtlMs, durationMs: RAID.durationMs, maxDamage, used: false });
      t.set(dailyRef, { raidAttempts: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (!raidSnap.exists) t.set(raidRef, raid);
      return success({ id: ticketRef.id, weekId: week, issuedAt: now, boss: raid.boss, durationMs: RAID.durationMs, maxDamage });
    });
  } catch (err) {
    console.error('beginRaid', err);
    return failure('error', 'うまくいきませんでした。もう一度ためしてください。');
  }
});

/**
 * 挑戦の結果。切符を確かめ (本人・未使用・期限内・戦闘の時間が経っている)、ダメージを上限で切って、
 * ボスのHP・自分のダメージ・対抗戦ポイントを、1つの transaction で動かす。
 */
export const finishRaid = onCall(async (request) => {
  if (!request.auth) return failure('not_signed_in', 'サインインできていません。');
  const authUid = request.auth.uid;
  const data = (request.data ?? {}) as { ticketId?: unknown; damage?: unknown };
  const ticketId = str(data.ticketId);
  const claimed = num(data.damage, NaN);
  if (!ticketId || !Number.isFinite(claimed) || claimed < 0) return failure('bad_input', '結果が、おかしいです。');
  const now = Date.now();
  try {
    return await db.runTransaction(async (t) => {
      const user = await t.get(db.doc(`users/${authUid}`));
      const allianceId = str(user.get('allianceId'));
      if (!allianceId) return failure('not_in_alliance', '同盟に入っていません。');
      const allianceRef = db.doc(`alliances/${allianceId}`);
      const ticketRef = allianceRef.collection('tickets').doc(ticketId);
      const ticketSnap = await t.get(ticketRef);
      if (!ticketSnap.exists) return failure('not_found', '切符が、見つかりません。');
      const ticket = ticketSnap.data() ?? {};
      if (ticket.authUid !== authUid) return failure('bad_input', '切符が、おかしいです。');
      if (ticket.used === true) return failure('bad_input', 'この切符は、もう使われています。');
      if (now > num(ticket.expiresAt)) return failure('bad_input', '切符の期限が、切れました。');
      if (now < num(ticket.issuedAt) + RAID.minElapsedMs) return failure('bad_input', '戦闘が終わる前に、結果は出せません。');
      const week = str(ticket.weekId);
      if (week !== weekId(now)) return failure('raid_over', '週が変わったので、この結果は、受け付けられません。');

      const raidRef = allianceRef.collection('raid').doc(week);
      const damageRef = raidRef.collection('damage').doc(authUid);
      const entryRef = db.doc(`seasons/${week}/entries/${allianceId}`);
      const [raidSnap, damageSnap, entrySnap, alliance, member] = await Promise.all([t.get(raidRef), t.get(damageRef), t.get(entryRef), t.get(allianceRef), t.get(allianceRef.collection('members').doc(authUid))]);
      if (!raidSnap.exists) return failure('not_found', 'ボスが、見つかりません。');
      const raid = raidSnap.data() ?? {};
      const hp = num(raid.hp);
      const damage = Math.max(0, Math.min(claimed, num(ticket.maxDamage)));
      t.update(ticketRef, { used: true, usedAt: FieldValue.serverTimestamp() });
      if (raid.defeatedAt || hp <= 0) {
        // すでに倒されている (ほかの人の挑戦と、行き違った): ダメージは入らない。
        return success({ damage: 0, hpLeft: 0, defeated: true, lastHit: false, points: 0 });
      }
      const hpLeft = Math.max(0, hp - damage);
      const lastHit = hpLeft === 0 && damage > 0;
      const name = str(member.data()?.name, 'プレイヤー');
      const points = raidPoints(damage);
      t.update(raidRef, { hp: hpLeft, ...(lastHit ? { defeatedAt: FieldValue.serverTimestamp(), lastHitName: name } : {}) });
      t.set(damageRef, { damage: num(damageSnap.data()?.damage) + damage, name, playerId: str(member.data()?.playerId), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      t.set(raidRef.collection('hits').doc(), { authUid, damage, at: FieldValue.serverTimestamp() });
      if (points > 0) {
        if (entrySnap.exists) t.update(entryRef, { raid: FieldValue.increment(points), points: FieldValue.increment(points), updatedAt: FieldValue.serverTimestamp() });
        t.update(allianceRef, { weekPoints: num(alliance.data()?.weekPoints) + points, updatedAt: FieldValue.serverTimestamp() });
      }
      if (lastHit) t.set(allianceRef.collection('chat').doc(), systemMessage(`${name}さんが、とどめを刺しました！ ${str(raid.boss?.name, 'ボス')}を、倒しました！`));
      return success({ damage, hpLeft, defeated: hpLeft === 0, lastHit, points });
    });
  } catch (err) {
    console.error('finishRaid', err);
    return failure('error', 'うまくいきませんでした。もう一度ためしてください。');
  }
});

// ---------------------------------------------------------------------------------------------- 同盟の出来事 (trigger)

/** 新しい同盟: 今週の対抗戦 (ブロンズの、途中参加の組) と、今週のボスに入れる。 */
export const onAllianceCreated = onDocumentCreated('alliances/{allianceId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const allianceId = event.params.allianceId;
  const a = snap.data();
  const now = Date.now();
  const week = weekId(now);
  const metaRef = db.doc(`seasons/${week}/meta/late`);
  await db.runTransaction(async (t) => {
    const meta = await t.get(metaRef);
    const countKey = `${str(a.league, 'bronze')}`;
    const n = num(meta.data()?.[countKey]);
    // 途中参加の組は、20同盟ごとに分ける (late-bronze-1, late-bronze-2, ...)。
    const group = `late-${countKey}-${Math.floor(n / WAR.groupSize) + 1}`;
    t.set(metaRef, { [countKey]: n + 1 }, { merge: true });
    t.set(db.doc(`seasons/${week}/entries/${allianceId}`), {
      allianceId,
      name: str(a.name),
      emblem: num(a.emblem),
      league: str(a.league, 'bronze'),
      groupId: group,
      power: num(a.power),
      points: 0,
      raid: 0,
      donation: 0,
      stages: 0,
      helpers: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(db.doc(`alliances/${allianceId}/raid/${week}`), newRaidDoc(a, now));
    t.set(db.collection(`alliances/${allianceId}/chat`).doc(), systemMessage(`同盟「${str(a.name)}」ができました。`));
  });
});

/**
 * メンバーの文書の変化: 加わった / 離れたのシステムメッセージと、同盟の総合力 (power) の集計。
 * 総合力は、クライアントが書けない (ルールが禁じている) ので、ここで足し引きする。
 */
export const onMemberWritten = onDocumentWritten('alliances/{allianceId}/members/{memberAuth}', async (event) => {
  const allianceId = event.params.allianceId;
  const before = event.data?.before.exists ? event.data.before.data() : undefined;
  const after = event.data?.after.exists ? event.data.after.data() : undefined;
  const delta = num(after?.power) - num(before?.power);
  const allianceRef = db.doc(`alliances/${allianceId}`);
  const alliance = await allianceRef.get();
  if (!alliance.exists) return; // 解散のあと
  if (delta !== 0) await allianceRef.update({ power: FieldValue.increment(delta) });
  if (!before && after) await allianceRef.collection('chat').add(systemMessage(`${str(after.name)}さんが、同盟に加わりました。`));
  if (before && !after) await allianceRef.collection('chat').add(systemMessage(`${str(before.name)}さんが、同盟を離れました。`));
});

/** 解散: メンバーの文書・チャット・ボス・切符など、同盟の下にあるものを、すべて消す。 */
export const onAllianceDeleted = onDocumentDeleted('alliances/{allianceId}', async (event) => {
  const allianceId = event.params.allianceId;
  await db.recursiveDelete(db.doc(`alliances/${allianceId}`));
  await db.doc(`seasons/${weekId(Date.now())}/entries/${allianceId}`).delete();
});

// ---------------------------------------------------------------------------------------------- 週の切り替え (scheduled)

/**
 * 毎週月曜 0:00 (日本時間):
 *   1. 先週の結果: 組ごとに順位を付け、結果の文書 (seasons/{先週}/results/{同盟}) と、昇格・降格を書く。
 *   2. 新しいシーズン: 同盟を、リーグごとに、総合力順で20同盟ずつの組に分け、リーグ表の行 (entries) を作る。
 *   3. 新しいボス: すべての同盟に、今週のボスの文書を作る (HP は、総合力と同盟Lvで決まる)。
 * 何度動いても、同じ結果になるように、最初に「済み」の印を見る。
 */
export const weeklyRollover = onSchedule({ schedule: '0 0 * * 1', timeZone: 'Asia/Tokyo', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const now = Date.now();
  const cur = weekId(now);
  const prev = weekId(weekStartMs(now) - 1);
  const doneRef = db.doc(`seasons/${cur}/meta/rollover`);
  if ((await doneRef.get()).exists) return;
  const writes = new Writes();

  // 1. 先週の結果。
  const nextLeagueOf = new Map<string, League>();
  const prevEntries = await db.collection(`seasons/${prev}/entries`).get();
  const groups = new Map<string, QueryDoc[]>();
  for (const d of prevEntries.docs) {
    const g = str(d.get('groupId'));
    groups.set(g, [...(groups.get(g) ?? []), d]);
  }
  for (const [groupId, docs] of groups) {
    docs.sort((x, y) => num(y.get('points')) - num(x.get('points')) || str(x.get('name')).localeCompare(str(y.get('name'))));
    docs.forEach((d, i) => {
      const rank = i + 1;
      const league = str(d.get('league'), 'bronze') as League;
      const moved = nextLeague(league, rank, docs.length);
      nextLeagueOf.set(d.id, moved.league);
      writes.set(db.doc(`seasons/${prev}/results/${d.id}`), {
        allianceId: d.id,
        groupId,
        league,
        nextLeague: moved.league,
        rank,
        groupSize: docs.length,
        points: num(d.get('points')),
        promoted: moved.promoted,
        demoted: moved.demoted,
        at: FieldValue.serverTimestamp(),
      });
    });
  }

  // 2 + 3. 新しいシーズンと、新しいボス。
  const alliances = await db.collection('alliances').get();
  const byLeague = new Map<League, QueryDoc[]>();
  for (const d of alliances.docs) {
    const league = (nextLeagueOf.get(d.id) ?? str(d.get('league'), 'bronze')) as League;
    byLeague.set(league, [...(byLeague.get(league) ?? []), d]);
    writes.update(d.ref, { league, weekPoints: 0 });
    writes.set(d.ref.collection('raid').doc(cur), newRaidDoc({ ...d.data(), league }, now));
  }
  for (const [league, docs] of byLeague) {
    docs.sort((x, y) => num(y.get('power')) - num(x.get('power')));
    docs.forEach((d, i) => {
      writes.set(db.doc(`seasons/${cur}/entries/${d.id}`), {
        allianceId: d.id,
        name: str(d.get('name')),
        emblem: num(d.get('emblem')),
        league,
        groupId: `${league}-${Math.floor(i / WAR.groupSize) + 1}`,
        power: num(d.get('power')),
        points: 0,
        raid: 0,
        donation: 0,
        stages: 0,
        helpers: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
  writes.set(doneRef, { at: FieldValue.serverTimestamp(), alliances: alliances.size });
  await writes.commit();
});

type QueryDoc = QueryDocumentSnapshot;

// ---------------------------------------------------------------------------------------------- 同盟長の引き継ぎ・掃除 (scheduled)

/** 毎日 5:00: 同盟長が7日間、まったく来ていなければ、次の人に譲る (幹部のうち最後にログインした人、いなければ、貢献が最大の人)。 */
export const leaderHandover = onSchedule({ schedule: '0 5 * * *', timeZone: 'Asia/Tokyo', timeoutSeconds: 300 }, async () => {
  const now = Date.now();
  const leaders = await db.collectionGroup('members').where('role', '==', 'leader').get();
  for (const leader of leaders.docs) {
    if (now - millis(leader.get('lastActiveAt')) < LEADER_IDLE_MS) continue;
    const allianceRef = leader.ref.parent.parent;
    if (!allianceRef) continue;
    const members = await allianceRef.collection('members').get();
    const others = members.docs.filter((m) => m.id !== leader.id);
    if (others.length === 0) continue;
    const officers = others.filter((m) => m.get('role') === 'officer').sort((x, y) => millis(y.get('lastActiveAt')) - millis(x.get('lastActiveAt')));
    const next = officers[0] ?? [...others].sort((x, y) => num(y.get('contribution')) - num(x.get('contribution')))[0];
    const batch = db.batch();
    batch.update(leader.ref, { role: 'officer' });
    batch.update(next.ref, { role: 'leader' });
    batch.update(allianceRef, { leaderAuth: next.id, leaderName: str(next.get('name')), updatedAt: FieldValue.serverTimestamp() });
    batch.set(allianceRef.collection('chat').doc(), systemMessage(`同盟長が長く不在のため、${str(next.get('name'))}さんが、新しい同盟長になりました。`));
    await batch.commit();
  }
});

/** 毎日 4:30: 30日より古いチャット、期限が1日以上前に切れた切符、14日より古い「1日ごとの文書」を消す。 */
export const cleanup = onSchedule({ schedule: '30 4 * * *', timeZone: 'Asia/Tokyo', timeoutSeconds: 300 }, async () => {
  const now = Date.now();
  const writer = db.bulkWriter();
  const sweep = async (query: Query): Promise<void> => {
    // 1回に消すのは、最大 2,000 件 (残りは、次の日に)。
    for (let i = 0; i < 5; i++) {
      const snap = await query.limit(400).get();
      if (snap.empty) return;
      for (const d of snap.docs) void writer.delete(d.ref);
      await writer.flush();
      if (snap.size < 400) return;
    }
  };
  await sweep(db.collectionGroup('chat').where('sentAt', '<', Timestamp.fromMillis(now - 30 * 86_400_000)));
  await sweep(db.collectionGroup('tickets').where('expiresAt', '<', now - 86_400_000));
  await sweep(db.collectionGroup('daily').where('updatedAt', '<', Timestamp.fromMillis(now - 14 * 86_400_000)));
  await writer.close();
});
