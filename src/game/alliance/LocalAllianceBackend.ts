import type {
  AllianceBackend,
  AllianceChatMessage,
  AllianceDetail,
  AllianceInvite,
  AllianceMember,
  AllianceReward,
  AllianceSettingsPatch,
  AllianceSummary,
  CreateAllianceParams,
  DonationKind,
  DonationResult,
  HelperHero,
  JoinPolicy,
  League,
  MissionBoard,
  MissionMetric,
  MissionScope,
  PlayerProfile,
  RaidOutcome,
  RaidRankEntry,
  RaidTicket,
  RaidView,
  ResearchLine,
  ResearchResult,
  Result,
  SearchQuery,
  SupportState,
  WarPointSource,
  WarRankEntry,
  WarView,
} from './AllianceBackend';
import { DESCRIPTION_MAX, DONATION_LABEL, EMBLEM_COUNT, LEAGUES, MISSION_METRICS, NAME_MAX, NAME_MIN, RESEARCH_LINE_IDS, fail, ok } from './AllianceBackend';
import {
  emptyDonated,
  emptyMeCounters,
  type LocalWorld,
  type OwnAlliance,
  type StoredMember,
  type StoredRaid,
} from './AllianceSave';
import {
  ALLIANCE_MAX_LEVEL,
  CHAT_KEEP,
  DONATIONS,
  DONATION_KINDS,
  HELPER_LENDER_COINS,
  HELPER_LENDER_DAILY_LIMIT,
  HELP_ANSWER_CONTRIBUTION,
  HELP_REQUEST_INTERVAL_MS,
  LEADER_IDLE_MS,
  LEAVE_COOLDOWN_MS,
  MIN_PLAYER_LEVEL_MAX,
  OFFICER_MAX,
  RAID_BOSSES,
  RAID_BOSS_COUNT,
  RAID_DURATION_MS,
  RAID_REWARD_PARTICIPATION,
  RAID_TICKET_TTL_MS,
  SUPPORT_RECEIVE_LIMIT,
  SUPPORT_SEND_LIMIT,
  SUPPORT_STAMINA,
  WAR_HELPER_POINTS,
  WAR_LEAGUE_SIZE,
  WAR_POINTS_MAX_PER_CALL,
  WAR_PROMOTE,
  WAR_RELEGATE,
  WAR_REWARDS,
  WEEK_MS,
  allianceExpToNext,
  dayKeyOf,
  expectedWarPointsPerMember,
  leagueForLevel,
  leagueIndex,
  simAllianceName,
  simWords,
  perksForLevel,
  raidDamageCap,
  raidDefeatReward,
  raidMaxHp,
  raidWarPoints,
  rngOf,
  warRewardFor,
  weekIdOf,
  weekNumberOf,
  weekStartOf,
} from '../data/alliance';
import { MISSION_SIM_PER_DAY } from '../data/allianceMissions';
import { emptyResearchLevels, nextResearchStep, researchBlock, researchView } from '../data/allianceResearch';
import { HERO_ROSTER } from '../data/heroes';
import { applyReport, bump, checkClaim, markClaimed, newBoard, viewOfBoard } from './missionLogic';
import { sanitizeText, stripForbidden } from '../systems/ChatSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { getLanguage, t as tl } from '../i18n';

const HOUR = 60 * 60 * 1000;
/** 長く開かなかったときに、疑似メンバーを進める最大の時間 (それより前の分は、飛ばす)。 */
const MAX_CATCHUP_HOURS = 8 * 24;
/** 時間帯ごとの、疑似メンバーの活発さ (0時〜23時)。 */
const HOUR_WEIGHT = [0.1, 0.05, 0.05, 0.05, 0.1, 0.2, 0.4, 0.8, 1, 0.8, 0.6, 0.7, 0.9, 0.8, 0.6, 0.6, 0.7, 0.8, 1, 1.1, 1.2, 1.2, 0.9, 0.4];
const SIM_DIRECTORY_SIZE = 40;
const MAX_REQUESTS = 5;
const MAX_APPLICANTS = 10;
const CREATED_RECRUIT_TARGET = 12;
const DAY = 24 * HOUR;
/** 時間帯ごとの活発さの、1日の合計 (疑似メンバーの1日の数を、1時間ぶんに割るのに使う)。 */
const HOUR_WEIGHT_SUM = HOUR_WEIGHT.reduce((a, b) => a + b, 0);

export interface LocalOptions {
  /** 時計 (試験で差し替える)。 */
  now?: () => number;
}

// ---------------------------------------------------------------------------------------------- 疑似同盟の一覧 (シードから、いつも同じものを作る)

interface SimDef {
  id: string;
  name: string;
  emblem: number;
  description: string;
  level: number;
  memberCount: number;
  joinPolicy: JoinPolicy;
  minPlayerLevel: number;
  leaderName: string;
  power: number;
}

const directoryCache = new Map<string, SimDef[]>();

function directoryOf(world: LocalWorld): SimDef[] {
  // (the language is part of the key: a made-up alliance is named in the language of the moment)
  const key = `${getLanguage()}:${world.seed}:${Math.round(world.refPower)}`;
  const prefixes = simWords('prefix');
  const suffixes = simWords('suffix');
  const descriptions = simWords('description');
  const leaders = simWords('name');
  const cached = directoryCache.get(key);
  if (cached) return cached;
  const taken = new Set<string>();
  const list: SimDef[] = [];
  for (let n = 0; n < SIM_DIRECTORY_SIZE; n++) {
    const r = rngOf(world.seed, 'dir', n);
    let name = '';
    for (let tries = 0; tries < 50; tries++) {
      name = simAllianceName(prefixes[Math.floor(r() * prefixes.length)], suffixes[Math.floor(r() * suffixes.length)]);
      if (!taken.has(name)) break;
      name = '';
    }
    if (!name) name = simAllianceName(prefixes[n % prefixes.length], n);
    taken.add(name);
    const level = Math.max(1, Math.min(ALLIANCE_MAX_LEVEL, 1 + Math.floor(Math.pow(r(), 1.3) * ALLIANCE_MAX_LEVEL)));
    const max = perksForLevel(level).memberMax;
    const full = r() < 0.12;
    const memberCount = full ? max : 8 + Math.floor(r() * (max - 8));
    const p = r();
    const joinPolicy: JoinPolicy = p < 0.5 ? 'open' : p < 0.85 ? 'approval' : 'invite';
    const minPlayerLevel = [0, 0, 0, 5, 10, 15, 20][Math.floor(r() * 7)];
    list.push({
      id: `sim-${n}`,
      name,
      emblem: Math.floor(r() * EMBLEM_COUNT),
      description: descriptions[Math.floor(r() * descriptions.length)],
      level,
      memberCount,
      joinPolicy,
      minPlayerLevel,
      leaderName: leaders[Math.floor(r() * leaders.length)],
      power: memberCount * world.refPower * (0.5 + r() * 1.1),
    });
  }
  directoryCache.set(key, list);
  return list;
}

/** 疑似同盟が、1シーズンで取る同盟ポイントの最終値 (リーグが上がるほど、強い)。 */
function npcFinalPoints(world: LocalWorld, def: SimDef, seasonId: string, league: League): number {
  const r = rngOf(world.seed, 'final', def.id, seasonId);
  const perMember = expectedWarPointsPerMember(def.power / Math.max(1, def.memberCount));
  return Math.round(def.memberCount * perMember * (0.55 + 0.9 * r()) * (1 + 0.3 * leagueIndex(league)));
}

// ---------------------------------------------------------------------------------------------- Backend

export class LocalAllianceBackend implements AllianceBackend {
  readonly mode = 'local' as const;

  private readonly getSave: () => SaveData;
  private readonly opts: LocalOptions;

  constructor(getSave: () => SaveData, opts: LocalOptions = {}) {
    this.getSave = getSave;
    this.opts = opts;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private save(): SaveData {
    return this.getSave();
  }

  private persist(): void {
    SaveSystem.save(this.save());
  }

  // ------------------------------------------------------------------ the world

  /** この世界 (疑似メンバー・疑似同盟) を用意して、時間を進めて、自分の記録を合わせる。 */
  private sync(me: PlayerProfile): { world: LocalWorld; own: OwnAlliance | null; now: number } {
    const save = this.save();
    const now = this.now();
    if (!save.alliance.world) save.alliance.world = this.newWorld(me, now);
    const world = save.alliance.world;
    this.advance(world, me, now);
    const own = world.own;
    if (own) {
      const m = own.members.find((x) => x.uid === me.uid);
      if (m) {
        m.name = me.name;
        m.level = me.level;
        m.power = Math.max(0, me.power);
        m.lastActiveAt = Math.max(m.lastActiveAt, now);
      }
      this.ensureBoards(world, own, now, true);
      save.alliance.allianceId = own.id;
      save.alliance.level = own.level;
      save.alliance.research = { ...own.research };
    } else {
      save.alliance.allianceId = null;
      save.alliance.level = 0;
      save.alliance.research = emptyResearchLevels();
    }
    world.lastSeenAt = Math.max(world.lastSeenAt, now);
    return { world, own, now };
  }

  private newWorld(me: PlayerProfile, now: number): LocalWorld {
    const world: LocalWorld = {
      seed: (Math.floor(now / 1000) ^ (me.uid.length * 2654435761)) >>> 0,
      refPower: Math.max(100, me.power),
      createdAt: now,
      tickAt: Math.floor(now / HOUR) * HOUR,
      lastSeenAt: now,
      requests: [],
      invites: [],
      inviteSent: {},
      own: null,
    };
    // 見本の招待: フレンドの1人が、疑似同盟に誘ってくれている。
    const friend = this.save().social.friends[0];
    const target = directoryOf(world).find((d) => d.joinPolicy !== 'open' && d.memberCount < perksForLevel(d.level).memberMax) ?? directoryOf(world)[0];
    if (friend && target) world.invites.push({ allianceId: target.id, allianceName: target.name, emblem: target.emblem, fromUid: friend.id, fromName: friend.name, at: now - 3 * HOUR });
    return world;
  }

  // ------------------------------------------------------------------ time

  private advance(world: LocalWorld, me: PlayerProfile, now: number): void {
    const own = world.own;
    // 同盟長が7日開かなかったら、次の人に譲られる。
    if (own && now - world.lastSeenAt >= LEADER_IDLE_MS) this.autoTransferLeader(own, me, now);
    this.resolveRequests(world, me, now);
    const target = Math.floor(now / HOUR) * HOUR;
    if (target > world.tickAt) {
      if (!world.own) {
        world.tickAt = target;
      } else {
        let from = world.tickAt;
        if (target - from > MAX_CATCHUP_HOURS * HOUR) from = target - MAX_CATCHUP_HOURS * HOUR;
        for (let t = from + HOUR; t <= target; t += HOUR) {
          if (!world.own) break;
          this.step(world, world.own, me, t);
        }
        world.tickAt = target;
      }
    }
    // 4:00 と月曜0:00 は、その時刻ちょうどに越える (1時間ごとの歩みの、途中でも)。時計が戻っていたら、何もしない。
    const now2 = world.own;
    if (now2 && now >= world.tickAt) {
      const key = dayKeyOf(now);
      if (key > now2.day) this.resetDay(now2, key);
      if (weekIdOf(now) > now2.raid.weekId) this.rollWeek(world, now2, now - 1);
    }
  }

  private autoTransferLeader(own: OwnAlliance, me: PlayerProfile, now: number): void {
    const mine = own.members.find((m) => m.uid === me.uid);
    if (!mine || mine.role !== 'leader') return;
    const others = own.members.filter((m) => m.uid !== me.uid);
    if (others.length === 0) return;
    const next = others.filter((m) => m.role === 'officer').sort((a, b) => b.contribution - a.contribution)[0] ?? [...others].sort((a, b) => b.contribution - a.contribution)[0];
    next.role = 'leader';
    mine.role = 'member';
    this.say(own, tl('alliance.say.autoLeader', { name: next.name }), now);
  }

  /** 日替わり (4:00) の境目を越えたら、1日ごとの数を戻す。 */
  private resetDay(own: OwnAlliance, key: string): void {
    own.day = key;
    const keep = own.me;
    own.me = { ...emptyMeCounters(key), pendingStamina: keep.pendingStamina, lastHelpRequestAt: keep.lastHelpRequestAt };
    for (const m of own.members) {
      m.used = 0;
      m.don = emptyDonated();
    }
  }

  /** 1時間ぶん進める。`t` は、その時間の終わり。 */
  private step(world: LocalWorld, own: OwnAlliance, me: PlayerProfile, t: number): void {
    const key = dayKeyOf(t - 1);
    if (key !== own.day) this.resetDay(own, key);
    if (weekIdOf(t - 1) !== own.raid.weekId) this.rollWeek(world, own, t - 1);
    const hourIndex = Math.floor(t / HOUR);
    const h = new Date(t - 1).getHours();
    const w = HOUR_WEIGHT[h] ?? 0.5;
    const perks = perksForLevel(own.level);
    const players = own.members.filter((m) => m.uid !== me.uid);
    const mineMember = own.members.find((m) => m.uid === me.uid);
    this.ensureBoards(world, own, t - 1, false);

    for (const m of players) {
      if (!m.simulated) continue;
      const r = rngOf(world.seed, 'act', hourIndex, m.uid);
      // 同盟ミッション: ふつうの遊び (ステージ・ガチャ・強化 ...)。寄付と共闘ボスは、下の、本当の寄付・挑戦が数える。
      for (const metric of MISSION_METRICS) {
        if (metric === 'donate' || metric === 'raid') continue;
        const expected = (MISSION_SIM_PER_DAY[metric] * m.act * w) / HOUR_WEIGHT_SUM;
        const n = Math.floor(expected + rngOf(world.seed, 'mact', hourIndex, m.uid, metric)());
        if (n > 0) this.bumpBoards(own, m.uid, metric, n);
      }
      // ボスに挑む (挑戦回数の半分ほど。回数が増えるほど、挑む数も増える)
      if (!own.raid.defeatedAt && t <= own.raid.endsAt && m.used < perks.raidAttemptsPerDay && r() < m.act * 0.16 * (perks.raidAttemptsPerDay / 3) * w) {
        // (a hit is about the same as a real one - 3.5 to 6.5 times the member's power; on their own they take the boss
        // down in about six days when it is light, and leave a good part of it when it is heavy: your hits finish it)
        const dmg = Math.min(m.power * (3.5 + r() * 3), raidDamageCap(m.power));
        m.used += 1;
        this.applyDamage(own, m, dmg, t);
        this.bumpBoards(own, m.uid, 'raid', 1);
      }
      // 寄付
      for (const kind of DONATION_KINDS) {
        if (m.don[kind] < DONATIONS[kind].limit && r() < m.act * 0.05 * w) this.donateAs(own, m, kind, t, false);
      }
      // 雑談
      if (r() < 0.012 * m.act * w) this.sayAs(own, m, simWords('chat')[Math.floor(r() * simWords('chat').length)], t);
      // 助っ人を借りてくれる
      if (mineMember?.helper && r() < 0.012 * m.act * w && own.me.lent < HELPER_LENDER_DAILY_LIMIT) {
        own.me.lent += 1;
        own.coins += HELPER_LENDER_COINS;
        own.war.helpers += WAR_HELPER_POINTS;
        this.say(own, tl('alliance.say.helperBorrowed', { name: m.name, HELPER_LENDER_COINS }), t);
      }
      // スタミナを贈ってくれる
      if (r() < 0.008 * m.act * w && own.me.receivedGifts < SUPPORT_RECEIVE_LIMIT && own.me.pendingStamina < SUPPORT_RECEIVE_LIMIT * SUPPORT_STAMINA) {
        own.me.receivedGifts += 1;
        own.me.pendingStamina += SUPPORT_STAMINA;
      }
      // 救援要請を出す (開いているものが3つ未満のときだけ)
      if (r() < 0.002 * m.act * w && own.chat.filter((c) => c.kind === 'help' && c.help?.open).length < 3) {
        const what: 'raid' | 'village' = r() < 0.6 ? 'raid' : 'village';
        this.push(own, { kind: 'help', senderUid: m.uid, senderName: m.name, text: simWords('help')[what === 'raid' ? 0 : 1], sentAt: t, help: { what, helpers: [], open: true } });
      }
      // 自分の救援要請に、答えてくれる
      for (const c of own.chat) {
        if (c.kind === 'help' && c.help?.open && c.senderUid === me.uid && !c.help.helpers.includes(m.name) && r() < 0.05 * m.act * w) {
          c.help.helpers.push(m.name);
          if (c.help.helpers.length >= 5) c.help.open = false;
        }
      }
    }
    // 新しい参加者 (自分で作った同盟だけ)
    if (own.recruitTarget > 0 && own.joinPolicy !== 'invite' && own.members.length + own.applicants.length < Math.min(own.recruitTarget, perks.memberMax)) {
      const r = rngOf(world.seed, 'recruit', hourIndex);
      if (r() < 0.06 * w * 4) this.recruitOne(world, own, r, t);
    }
    // フレンドの返事
    for (const f of [...own.friendInvites]) {
      if (f.decideAt > t) continue;
      own.friendInvites = own.friendInvites.filter((x) => x.uid !== f.uid);
      if (f.accept && own.members.length < perks.memberMax && !own.members.some((m) => m.uid === f.uid)) {
        own.members.push(this.makeMember(world, own.id, f.uid, f.name, f.level, 'member', t, true, 0));
        this.growRaid(own);
        this.say(own, tl('alliance.say.joinedByFriend', { name: f.name }), t);
      }
    }
  }

  private recruitOne(world: LocalWorld, own: OwnAlliance, r: () => number, t: number): void {
    const used = new Set([...own.members.map((m) => m.name), ...own.applicants.map((a) => a.name)]);
    const simNames = simWords('name');
    const name = simNames.filter((n) => !used.has(n))[Math.floor(r() * Math.max(1, simNames.length - used.size))] ?? `${simNames[Math.floor(r() * simNames.length)]}${own.members.length}`;
    const level = Math.max(1, Math.round(this.myLevel(own) * (0.6 + r() * 0.8)));
    const power = world.refPower * (0.4 + r() * 1.2);
    const uid = `sim-j${Math.floor(t / HOUR)}`;
    if (own.joinPolicy === 'open') {
      own.members.push(this.makeMember(world, own.id, uid, name, level, 'member', t, true, 0, power));
      this.growRaid(own);
      this.say(own, tl('alliance.say.joined', { name }), t);
    } else if (own.applicants.length < MAX_APPLICANTS) {
      own.applicants.push({ uid, name, level, power, at: t });
    }
  }

  /** メンバーが増えたら、今週のボスも、その分だけ重くなる (倒されていなければ。減ったHPは、そのまま)。 */
  private growRaid(own: OwnAlliance): void {
    const raid = own.raid;
    if (raid.defeatedAt !== null) return;
    const max = raidMaxHp(own.members.reduce((sum, m) => sum + m.power, 0), raid.bossIndex, own.level);
    if (max > raid.maxHp) {
      raid.hp += max - raid.maxHp;
      raid.maxHp = max;
    }
  }

  private myLevel(own: OwnAlliance): number {
    const humans = own.members.filter((m) => !m.simulated);
    return humans.length > 0 ? Math.max(...humans.map((m) => m.level)) : 10;
  }

  /** 週が変わった: ボスと対抗戦の結果を締めて、次の週を始める。 */
  private rollWeek(world: LocalWorld, own: OwnAlliance, t: number): void {
    const meUid = own.members.find((m) => !m.simulated)?.uid ?? '';
    // ボス
    const ranking = this.ranking(own);
    const mine = ranking.find((e) => e.uid === meUid);
    own.pastRaid = { weekId: own.raid.weekId, bossIndex: own.raid.bossIndex, defeated: own.raid.defeatedAt !== null, myDamage: mine?.damage ?? 0, myRank: mine?.rank ?? 0, claimed: own.raid.claimed };
    // 対抗戦
    const total = own.war.raid + own.war.donation + own.war.stages + own.war.helpers;
    const others = this.leagueOthers(world, own, own.war.seasonId, own.war.league).map((d) => npcFinalPoints(world, d, own.war.seasonId, own.war.league));
    const rank = 1 + others.filter((p) => p > total).length;
    const idx = leagueIndex(own.war.league);
    const promoted = rank <= WAR_PROMOTE && idx < LEAGUES.length - 1;
    const demoted = rank > WAR_LEAGUE_SIZE - WAR_RELEGATE && idx > 0;
    own.pastWar = { seasonId: own.war.seasonId, league: own.war.league, rank, promoted, demoted, participated: total > 0, claimed: false };
    const nextLeague = LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, idx + (promoted ? 1 : demoted ? -1 : 0)))];
    const start = weekStartOf(t + 1);
    own.war = { seasonId: weekIdOf(start), league: nextLeague, startsAt: start, raid: 0, donation: 0, stages: 0, helpers: 0 };
    own.raid = this.newRaid(own, start);
    for (const m of own.members) {
      m.weekContribution = 0;
      m.weekDamage = 0;
    }
    const bossName = RAID_BOSSES[own.raid.bossIndex].name;
    const lastRank = own.pastWar.rank;
    this.say(
      own,
      promoted
        ? tl('alliance.say.newWeekPromoted', { bossName, lastRank })
        : demoted
          ? tl('alliance.say.newWeekDemoted', { bossName, lastRank })
          : tl('alliance.say.newWeek', { bossName, lastRank }),
      start,
    );
  }

  private newRaid(own: OwnAlliance, at: number): StoredRaid {
    const bossIndex = weekNumberOf(at) % RAID_BOSS_COUNT;
    const totalPower = own.members.reduce((sum, m) => sum + m.power, 0);
    const start = weekStartOf(at);
    const maxHp = raidMaxHp(totalPower, bossIndex, own.level);
    return { weekId: weekIdOf(at), bossIndex, maxHp, hp: maxHp, startsAt: start, endsAt: start + WEEK_MS, defeatedAt: null, damageBy: {}, claimed: false };
  }

  /** 週の途中で入った同盟は、すでにボスが少し削れていて、メンバーの貢献もある。 */
  private seedProgress(world: LocalWorld, own: OwnAlliance, now: number): void {
    const frac = Math.min(1, Math.max(0, (now - weekStartOf(now)) / WEEK_MS));
    const r = rngOf(world.seed, 'progress', own.id, weekIdOf(now));
    const sims = own.members.filter((m) => m.simulated);
    const total = sims.reduce((s, m) => s + m.act * m.power, 0) || 1;
    const dealt = own.raid.maxHp * 0.7 * frac * (0.8 + 0.4 * r());
    for (const m of sims) {
      const d = (dealt * (m.act * m.power)) / total;
      m.weekDamage = d;
      own.raid.damageBy[m.uid] = d;
      m.weekContribution = Math.floor(frac * r() * 300);
      m.contribution += m.weekContribution;
    }
    own.raid.hp = Math.max(1, own.raid.maxHp - dealt);
    const per = expectedWarPointsPerMember(world.refPower) * frac * (0.5 + r() * 0.8) * sims.length;
    own.war.raid = Math.round(per * 0.55);
    own.war.donation = Math.round(per * 0.3);
    own.war.stages = Math.round(per * 0.1);
    own.war.helpers = Math.round(per * 0.05);
  }

  // ------------------------------------------------------------------ 同盟ミッション

  /** 期間 (1日 / 1週間) が変わっていたら、新しい掲示板を作る。`seed`: 疑似メンバーが、期間の途中までに足した分を、先に入れる
   *  (時計を進めている最中 (step) は、疑似メンバーが自分で足すので、入れない)。 */
  private ensureBoards(world: LocalWorld | undefined, own: OwnAlliance, at: number, seed: boolean): void {
    const keys: [MissionScope, string][] = [
      ['daily', dayKeyOf(at)],
      ['weekly', weekIdOf(at)],
    ];
    for (const [scope, key] of keys) {
      const current = own.missions[scope];
      if (current && current.key === key) continue;
      const board = newBoard(scope, key, own.members.length);
      own.missions[scope] = board;
      if (seed && world) this.seedBoard(world, own, board, at);
    }
  }

  /** 期間の途中から見え始めた掲示板に、疑似メンバーのこれまでの分を入れる。 */
  private seedBoard(world: LocalWorld, own: OwnAlliance, board: MissionBoard, at: number): void {
    const start = board.scope === 'weekly' ? weekStartOf(at) : (() => {
      const d = new Date(at - 4 * HOUR);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 4, 0, 0, 0).getTime();
    })();
    const frac = Math.min(1, Math.max(0, (at - start) / (board.scope === 'weekly' ? WEEK_MS : DAY)));
    if (frac <= 0) return;
    for (const m of own.members) {
      if (!m.simulated) continue;
      for (const metric of MISSION_METRICS) {
        const r = rngOf(world.seed, 'mseed', board.key, m.uid, metric);
        const expected = MISSION_SIM_PER_DAY[metric] * m.act * (board.scope === 'weekly' ? 7 : 1) * frac * (0.6 + 0.8 * r());
        const n = Math.floor(expected + r());
        if (n > 0) bump(board, m.uid, metric, n);
      }
    }
  }

  /** 1人の行動を、今日の掲示板と今週の掲示板の、両方に足す。 */
  private bumpBoards(own: OwnAlliance, uid: string, metric: MissionMetric, n: number): void {
    for (const board of [own.missions.daily, own.missions.weekly]) if (board) bump(board, uid, metric, n);
  }

  private missionsView(own: OwnAlliance, me: PlayerProfile, now: number): AllianceDetail['missions'] {
    const names: Record<string, string> = {};
    for (const m of own.members) names[m.uid] = m.name;
    const dayStart = ((): number => {
      const d = new Date(now - 4 * HOUR);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 4, 0, 0, 0).getTime();
    })();
    const daily = viewOfBoard(own.missions.daily ?? newBoard('daily', dayKeyOf(now), own.members.length), me.uid, names, dayStart + DAY);
    const weekly = viewOfBoard(own.missions.weekly ?? newBoard('weekly', weekIdOf(now), own.members.length), me.uid, names, weekStartOf(now) + WEEK_MS);
    return { daily, weekly, claimable: [...daily.missions, ...weekly.missions].filter((m) => m.claimable).length };
  }

  /** 対抗戦の相手 (自分以外の、同じリーグの19同盟): シーズンごとに固定。 */
  private leagueOthers(world: LocalWorld, own: OwnAlliance, seasonId: string, league: League): SimDef[] {
    const r = rngOf(world.seed, 'league', seasonId, league);
    const pool = directoryOf(world).filter((d) => d.id !== own.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, WAR_LEAGUE_SIZE - 1);
  }

  /** 承認待ちの申請に、疑似の同盟長が返事をする。 */
  private resolveRequests(world: LocalWorld, me: PlayerProfile, now: number): void {
    for (const req of [...world.requests]) {
      if (req.decideAt > now) continue;
      world.requests = world.requests.filter((x) => x !== req);
      if (!req.accept || world.own) continue;
      if (now - this.save().alliance.leftAt < LEAVE_COOLDOWN_MS) continue;
      const def = directoryOf(world).find((d) => d.id === req.allianceId);
      if (!def || def.memberCount >= perksForLevel(def.level).memberMax) continue;
      this.joinSimAlliance(world, def, me, req.decideAt, tl('alliance.say.welcomeApproved'));
    }
  }

  // ------------------------------------------------------------------ building things

  private makeMember(world: LocalWorld, allianceId: string, uid: string, name: string, level: number, role: AllianceMember['role'], at: number, simulated: boolean, index: number, power?: number): StoredMember {
    const r = rngOf(world.seed, allianceId, 'member', uid);
    const p = power ?? world.refPower * (0.4 + r() * 1.2);
    let helper: HelperHero | null = null;
    if (simulated && r() < 0.55) {
      const hero = HERO_ROSTER[Math.floor(r() * HERO_ROSTER.length)];
      helper = {
        ownerUid: uid,
        ownerName: name,
        heroId: hero.id,
        name: hero.name,
        heroClass: hero.heroClass,
        rarity: hero.rarity,
        level: Math.max(1, Math.min(100, level)),
        phase: 1 + Math.floor(r() * 5),
        skillLevels: [1 + Math.floor(r() * 5), 1 + Math.floor(r() * 4), 1, 1],
        gear: { weapon: null, armor: null, accessory: null },
        power: p * 0.2 * (0.6 + r() * 0.8),
        setAt: at - Math.floor(r() * 3 * 24 * HOUR),
      };
    }
    void index;
    return {
      uid,
      name,
      level,
      role,
      power: p,
      contribution: Math.floor(r() * level * 300),
      weekContribution: 0,
      weekDamage: 0,
      lastActiveAt: at - Math.floor(r() * 36 * HOUR),
      joinedAt: at - Math.floor((1 + r() * 90) * 24 * HOUR),
      helper,
      simulated,
      act: 0.2 + 0.75 * Math.pow(r(), 0.8),
      used: 0,
      don: emptyDonated(),
    };
  }

  private baseOwn(me: PlayerProfile, now: number, id: string, params: CreateAllianceParams & { level: number }): OwnAlliance {
    const leader: StoredMember = {
      uid: me.uid,
      name: me.name,
      level: me.level,
      role: 'leader',
      power: Math.max(0, me.power),
      contribution: 0,
      weekContribution: 0,
      weekDamage: 0,
      lastActiveAt: now,
      joinedAt: now,
      helper: null,
      act: 1,
      used: 0,
      don: emptyDonated(),
    };
    const own: OwnAlliance = {
      id,
      name: params.name,
      emblem: params.emblem,
      description: params.description,
      joinPolicy: params.joinPolicy,
      minPlayerLevel: params.minPlayerLevel,
      level: params.level,
      exp: 0,
      createdAt: now,
      recruitTarget: 0,
      members: [leader],
      applicants: [],
      coins: 0,
      raid: { weekId: '', bossIndex: 0, maxHp: 1, hp: 1, startsAt: 0, endsAt: 0, defeatedAt: null, damageBy: {}, claimed: false },
      pastRaid: null,
      war: { seasonId: weekIdOf(now), league: leagueForLevel(params.level), startsAt: weekStartOf(now), raid: 0, donation: 0, stages: 0, helpers: 0 },
      pastWar: null,
      chat: [],
      day: dayKeyOf(now),
      me: emptyMeCounters(dayKeyOf(now)),
      ticket: null,
      friendInvites: [],
      fund: 0,
      research: emptyResearchLevels(),
      missions: { daily: null, weekly: null },
    };
    return own;
  }

  /** 疑似同盟に入る: その同盟のメンバーを、シードから作って、自分を加える。 */
  private joinSimAlliance(world: LocalWorld, def: SimDef, me: PlayerProfile, at: number, welcome: string): OwnAlliance {
    const own = this.baseOwn(me, at, def.id, { name: def.name, emblem: def.emblem, description: def.description, joinPolicy: def.joinPolicy, minPlayerLevel: def.minPlayerLevel, level: def.level });
    const r = rngOf(world.seed, def.id, 'roster');
    const names = [...simWords('name')].filter((n) => n !== def.leaderName && n !== me.name);
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const officers = 1 + Math.floor(r() * OFFICER_MAX);
    const members: StoredMember[] = [];
    for (let i = 0; i < def.memberCount; i++) {
      const name = i === 0 ? def.leaderName : names[(i - 1) % names.length] + (i - 1 >= names.length ? String(i) : '');
      const role = i === 0 ? 'leader' : i <= officers ? 'officer' : 'member';
      const level = Math.max(1, Math.min(100, Math.round(me.level * (0.5 + r() * 1.1))));
      members.push(this.makeMember(world, def.id, `${def.id}-m${i}`, name, level, role, at, true, i));
    }
    // 自分は、いちばん後ろに加わる (leader ではない)。
    const mine = own.members[0];
    mine.role = 'member';
    own.members = [...members, mine];
    own.raid = this.newRaid(own, at);
    this.seedProgress(world, own, at);
    this.say(own, tl('alliance.say.joinedWelcome', { name: me.name, welcome }), at);
    world.own = own;
    world.requests = [];
    const save = this.save();
    save.alliance.allianceId = own.id;
    save.alliance.level = own.level;
    return own;
  }

  // ------------------------------------------------------------------ chat

  private push(own: OwnAlliance, msg: Omit<AllianceChatMessage, 'id'>): AllianceChatMessage {
    const full: AllianceChatMessage = { ...msg, id: `c${Math.floor(msg.sentAt).toString(36)}-${own.chat.length}-${Math.floor(Math.random() * 1e5).toString(36)}` };
    own.chat.push(full);
    if (own.chat.length > CHAT_KEEP) own.chat.splice(0, own.chat.length - CHAT_KEEP);
    return full;
  }

  private say(own: OwnAlliance, text: string, at: number): void {
    this.push(own, { kind: 'system', senderUid: 'system', senderName: 'お知らせ', text, sentAt: at }); // i18n-ignore (stored sender; system lines are drawn without it)
  }

  private sayAs(own: OwnAlliance, m: AllianceMember, text: string, at: number): void {
    this.push(own, { kind: 'text', senderUid: m.uid, senderName: m.name, text, sentAt: at });
  }

  // ------------------------------------------------------------------ the rules shared by simulated members and the player

  /** ボスにダメージが入る。 */
  private applyDamage(own: OwnAlliance, m: StoredMember, damage: number, t: number): { applied: number; defeated: boolean; lastHit: boolean } {
    const raid = own.raid;
    if (raid.defeatedAt !== null || !(damage > 0)) return { applied: 0, defeated: raid.defeatedAt !== null, lastHit: false };
    const applied = Math.min(damage, raid.hp);
    raid.hp -= applied;
    raid.damageBy[m.uid] = (raid.damageBy[m.uid] ?? 0) + applied;
    m.weekDamage += applied;
    m.lastActiveAt = Math.max(m.lastActiveAt, t);
    own.war.raid += raidWarPoints(applied);
    let lastHit = false;
    if (raid.hp <= 1e-9) {
      raid.hp = 0;
      raid.defeatedAt = t;
      raid.lastHit = m.uid;
      lastHit = true;
      this.say(own, tl('alliance.say.bossDefeated', { name: RAID_BOSSES[raid.bossIndex].name, name2: m.name }), t);
    }
    return { applied, defeated: raid.defeatedAt !== null, lastHit };
  }

  /** 同盟EXPが入る。Lvが上がったら、そのLv (上がらなければ null)。 */
  private addAllianceExp(own: OwnAlliance, amount: number, t: number): number | null {
    let up: number | null = null;
    let need = allianceExpToNext(own.level);
    if (need === null) return null;
    own.exp += amount;
    while (need !== null && own.exp >= need && own.level < ALLIANCE_MAX_LEVEL) {
      own.exp -= need;
      own.level += 1;
      up = own.level;
      need = allianceExpToNext(own.level);
      this.say(own, tl('alliance.say.levelUp', { level: own.level }), t);
    }
    if (need === null) own.exp = 0;
    return up;
  }

  private donateAs(own: OwnAlliance, m: StoredMember, kind: DonationKind, t: number, announce: boolean): { levelUp: number | null } {
    const rule = DONATIONS[kind];
    m.don[kind] += 1;
    m.contribution += rule.contribution;
    m.weekContribution += rule.contribution;
    m.lastActiveAt = Math.max(m.lastActiveAt, t);
    own.war.donation += rule.contribution;
    own.fund += rule.allianceExp;
    if (!announce) this.bumpBoards(own, m.uid, 'donate', 1);
    const levelUp = this.addAllianceExp(own, rule.allianceExp, t);
    if (announce) this.say(own, tl('alliance.say.donated', { name: m.name, label: tl(DONATION_LABEL[kind]) }), t);
    return { levelUp };
  }

  private ranking(own: OwnAlliance): (RaidRankEntry & { uid: string })[] {
    const names = new Map(own.members.map((m) => [m.uid, m.name]));
    return Object.entries(own.raid.damageBy)
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([uid, damage], i) => ({ uid, name: names.get(uid) ?? tl('alliance.say.leftMember'), damage, rank: i + 1 }));
  }

  private summaryOf(own: OwnAlliance): AllianceSummary {
    const leader = own.members.find((m) => m.role === 'leader') ?? own.members[0];
    return {
      id: own.id,
      name: own.name,
      emblem: own.emblem,
      description: own.description,
      level: own.level,
      memberCount: own.members.length,
      memberMax: perksForLevel(own.level).memberMax,
      joinPolicy: own.joinPolicy,
      minPlayerLevel: own.minPlayerLevel,
      leaderName: leader.name,
      weekPoints: own.war.raid + own.war.donation + own.war.stages + own.war.helpers,
      power: own.members.reduce((s, m) => s + m.power, 0),
      league: own.war.league,
    };
  }

  private summaryOfDef(world: LocalWorld, def: SimDef, now: number): AllianceSummary {
    const league = leagueForLevel(def.level);
    const frac = Math.min(1, Math.max(0, (now - weekStartOf(now)) / WEEK_MS));
    return {
      id: def.id,
      name: def.name,
      emblem: def.emblem,
      description: def.description,
      level: def.level,
      memberCount: def.memberCount,
      memberMax: perksForLevel(def.level).memberMax,
      joinPolicy: def.joinPolicy,
      minPlayerLevel: def.minPlayerLevel,
      leaderName: def.leaderName,
      weekPoints: Math.round(npcFinalPoints(world, def, weekIdOf(now), league) * frac),
      power: def.power,
      league,
    };
  }

  private joinable(def: SimDef, me: PlayerProfile): boolean {
    return def.joinPolicy !== 'invite' && def.memberCount < perksForLevel(def.level).memberMax && def.minPlayerLevel <= me.level;
  }

  private strip(m: StoredMember): AllianceMember {
    const { act: _a, used: _u, don: _d, ...rest } = m;
    void _a;
    void _u;
    void _d;
    return { ...rest, helper: m.helper ? { ...m.helper, skillLevels: [...m.helper.skillLevels] } : null };
  }

  private requireOwn(me: PlayerProfile): Result<{ world: LocalWorld; own: OwnAlliance; mine: StoredMember; now: number }> {
    const { world, own, now } = this.sync(me);
    if (!own) return fail('not_in_alliance', tl('alliance.error.notInAlliance'));
    const mine = own.members.find((m) => m.uid === me.uid);
    if (!mine) return fail('not_in_alliance', tl('alliance.error.notInAlliance'));
    return ok({ world, own, mine, now });
  }

  private validateName(world: LocalWorld, own: OwnAlliance | null, raw: string, except?: string): Result<string> {
    const name = stripForbidden(raw).replace(/\s+/g, '').trim();
    const length = Array.from(name).length;
    if (name !== raw.replace(/\s+/g, '').trim() || length < NAME_MIN || length > NAME_MAX) return fail('bad_name', tl('alliance.error.nameRules', { NAME_MIN, NAME_MAX }));
    const taken = directoryOf(world).some((d) => d.name === name && d.id !== except) || (own !== null && own.name === name && own.id !== except);
    if (taken) return fail('name_taken', tl('alliance.error.nameTaken'));
    return ok(name);
  }

  private cooldownLeft(now: number): number {
    return Math.max(0, LEAVE_COOLDOWN_MS - (now - this.save().alliance.leftAt));
  }

  private cooldownFail(now: number): Result<never> {
    const left = this.cooldownLeft(now);
    return fail('cooldown', tl('alliance.error.cooldownLeft', { left: Math.ceil(left / HOUR) }));
  }

  // ------------------------------------------------------------------ AllianceBackend: 探す・入る・抜ける

  async search(me: PlayerProfile, query: SearchQuery): Promise<Result<AllianceSummary[]>> {
    const { world, own, now } = this.sync(me);
    let list = directoryOf(world).filter((d) => d.id !== own?.id);
    const text = (query.text ?? '').trim();
    if (text) list = list.filter((d) => d.name.includes(text));
    if (query.joinableOnly) list = list.filter((d) => this.joinable(d, me));
    list.sort((a, b) => b.memberCount - a.memberCount || a.id.localeCompare(b.id));
    this.persist();
    return ok(list.slice(0, query.limit ?? 30).map((d) => this.summaryOfDef(world, d, now)));
  }

  async recommended(me: PlayerProfile): Promise<Result<AllianceSummary[]>> {
    const { world, own, now } = this.sync(me);
    const mine = Math.max(100, me.power);
    const list = directoryOf(world)
      .filter((d) => d.id !== own?.id && this.joinable(d, me))
      .sort((a, b) => Math.abs(Math.log(a.power / a.memberCount / mine)) - Math.abs(Math.log(b.power / b.memberCount / mine)));
    this.persist();
    return ok(list.slice(0, 5).map((d) => this.summaryOfDef(world, d, now)));
  }

  async create(me: PlayerProfile, params: CreateAllianceParams): Promise<Result<AllianceSummary>> {
    const { world, own, now } = this.sync(me);
    if (own) return fail('already_in_alliance', tl('alliance.error.alreadyInAlliance'));
    if (this.cooldownLeft(now) > 0) return this.cooldownFail(now);
    const name = this.validateName(world, own, params.name);
    if (!name.ok) return name;
    if (!Number.isInteger(params.emblem) || params.emblem < 0 || params.emblem >= EMBLEM_COUNT) return fail('bad_input', tl('alliance.error.pickEmblem'));
    const description = stripForbidden(params.description ?? '').replace(/\s+/g, ' ').trim();
    if (Array.from(description).length > DESCRIPTION_MAX) return fail('bad_input', tl('alliance.error.descriptionTooLong', { DESCRIPTION_MAX }));
    if (!['open', 'approval', 'invite'].includes(params.joinPolicy)) return fail('bad_input', tl('alliance.error.pickJoinPolicy'));
    if (!Number.isInteger(params.minPlayerLevel) || params.minPlayerLevel < 0 || params.minPlayerLevel > MIN_PLAYER_LEVEL_MAX) return fail('bad_input', tl('alliance.error.minLevelRange', { MIN_PLAYER_LEVEL_MAX }));
    const id = `a${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const created = this.baseOwn(me, now, id, { name: name.value, emblem: params.emblem, description, joinPolicy: params.joinPolicy, minPlayerLevel: params.minPlayerLevel, level: 1 });
    created.raid = this.newRaid(created, now);
    created.recruitTarget = params.joinPolicy === 'invite' ? 0 : CREATED_RECRUIT_TARGET;
    this.say(created, tl('alliance.say.formed', { name: created.name }), now);
    world.own = created;
    world.requests = [];
    const save = this.save();
    save.alliance.allianceId = id;
    save.alliance.level = 1;
    this.persist();
    return ok(this.summaryOf(created));
  }

  async join(me: PlayerProfile, allianceId: string): Promise<Result<'joined' | 'requested'>> {
    const { world, own, now } = this.sync(me);
    if (own) return fail('already_in_alliance', tl('alliance.error.alreadyInAlliance'));
    if (this.cooldownLeft(now) > 0) return this.cooldownFail(now);
    const def = directoryOf(world).find((d) => d.id === allianceId);
    if (!def) return fail('not_found', tl('alliance.error.noSuchAlliance'));
    if (me.level < def.minPlayerLevel) return fail('level_too_low', tl('alliance.error.needLevelLocal', { minPlayerLevel: def.minPlayerLevel }));
    if (def.memberCount >= perksForLevel(def.level).memberMax) return fail('full', tl('alliance.error.allianceFull'));
    if (def.joinPolicy === 'invite') return fail('invite_only', tl('alliance.error.inviteOnly'));
    if (def.joinPolicy === 'open') {
      this.joinSimAlliance(world, def, me, now, tl('alliance.say.welcome'));
      this.persist();
      return ok('joined');
    }
    if (world.requests.some((r) => r.allianceId === allianceId)) return fail('already_requested', tl('alliance.error.alreadyApplied'));
    if (world.requests.length >= MAX_REQUESTS) return fail('limit_reached', tl('alliance.error.tooManyApplications', { MAX_REQUESTS }));
    const r = rngOf(world.seed, 'request', allianceId, Math.floor(now / 1000));
    world.requests.push({ allianceId, at: now, decideAt: now + Math.floor((120 + r() * 480) * 1000), accept: r() < 0.9 });
    this.persist();
    return ok('requested');
  }

  async cancelRequest(me: PlayerProfile, allianceId: string): Promise<Result<true>> {
    const { world } = this.sync(me);
    const before = world.requests.length;
    world.requests = world.requests.filter((r) => r.allianceId !== allianceId);
    if (world.requests.length === before) return fail('not_found', tl('alliance.error.noSuchRequest'));
    this.persist();
    return ok(true);
  }

  async myRequests(me: PlayerProfile): Promise<Result<string[]>> {
    const { world } = this.sync(me);
    this.persist();
    return ok(world.requests.map((r) => r.allianceId));
  }

  async invites(me: PlayerProfile): Promise<Result<AllianceInvite[]>> {
    const { world } = this.sync(me);
    this.persist();
    return ok(world.invites.map((i) => ({ ...i })));
  }

  async invite(me: PlayerProfile, friendUid: string): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { world, own, mine, now } = got.value;
    if (mine.role === 'member') return fail('no_permission', tl('alliance.error.inviteLeaderOfficer'));
    const friend = this.save().social.friends.find((f) => f.id === friendUid);
    if (!friend) return fail('not_found', tl('alliance.error.notFriend'));
    if (own.members.some((m) => m.uid === friendUid)) return fail('bad_input', tl('alliance.error.alreadyMember'));
    if (own.friendInvites.some((f) => f.uid === friendUid)) return fail('already_requested', tl('alliance.error.alreadyInvited'));
    if (own.members.length >= perksForLevel(own.level).memberMax) return fail('full', tl('alliance.error.theAllianceIsFull'));
    const day = dayKeyOf(now);
    if (world.inviteSent[friendUid] === day) return fail('limit_reached', tl('alliance.error.inviteOncePerDay'));
    world.inviteSent[friendUid] = day;
    const r = rngOf(world.seed, 'finvite', friendUid, Math.floor(now / HOUR));
    own.friendInvites.push({ uid: friend.id, name: friend.name, level: friend.level, decideAt: now + Math.floor((1 + r() * 2) * HOUR), accept: r() < 0.65 });
    this.say(own, tl('alliance.say.friendInvited', { name: mine.name, name2: friend.name }), now);
    this.persist();
    return ok(true);
  }

  async acceptInvite(me: PlayerProfile, allianceId: string): Promise<Result<true>> {
    const { world, own, now } = this.sync(me);
    if (own) return fail('already_in_alliance', tl('alliance.error.alreadyInAlliance'));
    if (this.cooldownLeft(now) > 0) return this.cooldownFail(now);
    const invite = world.invites.find((i) => i.allianceId === allianceId);
    if (!invite) return fail('not_found', tl('alliance.error.noSuchInvite'));
    const def = directoryOf(world).find((d) => d.id === allianceId);
    if (!def) return fail('not_found', tl('alliance.error.allianceGone'));
    if (def.memberCount >= perksForLevel(def.level).memberMax) return fail('full', tl('alliance.error.allianceFull'));
    world.invites = world.invites.filter((i) => i.allianceId !== allianceId);
    this.joinSimAlliance(world, def, me, now, tl('alliance.say.welcomeInvited', { fromName: invite.fromName }));
    this.persist();
    return ok(true);
  }

  async declineInvite(me: PlayerProfile, allianceId: string): Promise<Result<true>> {
    const { world } = this.sync(me);
    const before = world.invites.length;
    world.invites = world.invites.filter((i) => i.allianceId !== allianceId);
    if (world.invites.length === before) return fail('not_found', tl('alliance.error.noSuchInvite'));
    this.persist();
    return ok(true);
  }

  async resolveRequest(me: PlayerProfile, uid: string, accept: boolean): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { world, own, mine, now } = got.value;
    if (mine.role === 'member') return fail('no_permission', tl('alliance.error.decideLeaderOfficer'));
    const req = own.applicants.find((a) => a.uid === uid);
    if (!req) return fail('not_found', tl('alliance.error.noSuchRequest'));
    own.applicants = own.applicants.filter((a) => a.uid !== uid);
    if (accept) {
      if (own.members.length >= perksForLevel(own.level).memberMax) return fail('full', tl('alliance.error.theAllianceIsFull'));
      own.members.push(this.makeMember(world, own.id, req.uid, req.name, req.level, 'member', now, true, 0, req.power));
      this.growRaid(own);
      this.say(own, tl('alliance.say.requestApproved', { name: req.name }), now);
    }
    this.persist();
    return ok(true);
  }

  async leave(me: PlayerProfile): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { world, own, mine, now } = got.value;
    const others = own.members.filter((m) => m.uid !== me.uid);
    if (mine.role === 'leader' && others.length > 0) return fail('no_permission', tl('alliance.error.leaderMustTransfer'));
    world.own = null;
    const save = this.save();
    save.alliance.allianceId = null;
    save.alliance.level = 0;
    save.alliance.leftAt = now;
    this.persist();
    return ok(true);
  }

  async kick(me: PlayerProfile, uid: string): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine, now } = got.value;
    if (mine.role === 'member') return fail('no_permission', tl('alliance.error.kickLeaderOfficer'));
    const target = own.members.find((m) => m.uid === uid);
    if (!target || uid === me.uid) return fail('not_found', tl('alliance.error.noSuchMember'));
    if (target.role === 'leader' || (mine.role === 'officer' && target.role !== 'member')) return fail('no_permission', tl('alliance.error.cantKick'));
    own.members = own.members.filter((m) => m.uid !== uid);
    this.say(own, tl('alliance.say.removed', { name: target.name }), now);
    this.persist();
    return ok(true);
  }

  async setRole(me: PlayerProfile, uid: string, role: 'officer' | 'member'): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine, now } = got.value;
    if (mine.role !== 'leader') return fail('no_permission', tl('alliance.error.leaderOnlyRoles'));
    const target = own.members.find((m) => m.uid === uid);
    if (!target || uid === me.uid) return fail('not_found', tl('alliance.error.noSuchMember'));
    if (role === 'officer' && target.role !== 'officer' && own.members.filter((m) => m.role === 'officer').length >= OFFICER_MAX) return fail('limit_reached', tl('alliance.error.officerMax', { OFFICER_MAX }));
    target.role = role;
    this.say(own, role === 'officer' ? tl('alliance.say.becameOfficer', { name: target.name }) : tl('alliance.say.steppedDown', { name: target.name }), now);
    this.persist();
    return ok(true);
  }

  async transferLeader(me: PlayerProfile, uid: string): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine, now } = got.value;
    if (mine.role !== 'leader') return fail('no_permission', tl('alliance.error.leaderOnlyTransfer'));
    const target = own.members.find((m) => m.uid === uid);
    if (!target || uid === me.uid) return fail('not_found', tl('alliance.error.noSuchMember'));
    const officers = own.members.filter((m) => m.role === 'officer' && m.uid !== uid).length;
    target.role = 'leader';
    mine.role = officers < OFFICER_MAX ? 'officer' : 'member';
    this.say(own, tl('alliance.say.newLeader', { name: target.name }), now);
    this.persist();
    return ok(true);
  }

  async updateSettings(me: PlayerProfile, patch: AllianceSettingsPatch): Promise<Result<AllianceSummary>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { world, own, mine } = got.value;
    if (mine.role !== 'leader') return fail('no_permission', tl('alliance.error.leaderOnlySettings'));
    if (patch.name !== undefined) {
      const name = this.validateName(world, own, patch.name, own.id);
      if (!name.ok) return name;
      own.name = name.value;
    }
    if (patch.emblem !== undefined) {
      if (!Number.isInteger(patch.emblem) || patch.emblem < 0 || patch.emblem >= EMBLEM_COUNT) return fail('bad_input', tl('alliance.error.pickEmblem'));
      own.emblem = patch.emblem;
    }
    if (patch.description !== undefined) {
      const description = stripForbidden(patch.description).replace(/\s+/g, ' ').trim();
      if (Array.from(description).length > DESCRIPTION_MAX) return fail('bad_input', tl('alliance.error.descriptionTooLong', { DESCRIPTION_MAX }));
      own.description = description;
    }
    if (patch.joinPolicy !== undefined) {
      if (!['open', 'approval', 'invite'].includes(patch.joinPolicy)) return fail('bad_input', tl('alliance.error.pickJoinPolicy'));
      own.joinPolicy = patch.joinPolicy;
    }
    if (patch.minPlayerLevel !== undefined) {
      if (!Number.isInteger(patch.minPlayerLevel) || patch.minPlayerLevel < 0 || patch.minPlayerLevel > MIN_PLAYER_LEVEL_MAX) return fail('bad_input', tl('alliance.error.minLevelRange', { MIN_PLAYER_LEVEL_MAX }));
      own.minPlayerLevel = patch.minPlayerLevel;
    }
    this.persist();
    return ok(this.summaryOf(own));
  }

  async disband(me: PlayerProfile): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { world, mine } = got.value;
    if (mine.role !== 'leader') return fail('no_permission', tl('alliance.error.leaderOnlyDisband'));
    world.own = null;
    const save = this.save();
    save.alliance.allianceId = null;
    save.alliance.level = 0;
    this.persist();
    return ok(true);
  }

  // ------------------------------------------------------------------ AllianceBackend: 読む

  async load(me: PlayerProfile): Promise<Result<AllianceDetail | null>> {
    const { world, own, now } = this.sync(me);
    if (!own) {
      this.persist();
      return ok(null);
    }
    const mine = own.members.find((m) => m.uid === me.uid);
    if (!mine) {
      world.own = null;
      this.persist();
      return ok(null);
    }
    const perks = perksForLevel(own.level);
    const next = own.level < ALLIANCE_MAX_LEVEL ? perksForLevel(own.level + 1) : null;
    const detail: AllianceDetail = {
      summary: this.summaryOf(own),
      exp: own.exp,
      expToNext: allianceExpToNext(own.level),
      perks,
      nextPerks: next,
      members: [...own.members].sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || b.weekContribution - a.weekContribution).map((m) => this.strip(m)),
      me: this.strip(mine),
      coins: own.coins,
      donationLeft: {
        gold: Math.max(0, DONATIONS.gold.limit - own.me.donated.gold),
        materials: Math.max(0, DONATIONS.materials.limit - own.me.donated.materials),
        gems: Math.max(0, DONATIONS.gems.limit - own.me.donated.gems),
      },
      requests: mine.role === 'member' ? [] : own.applicants.map((a) => ({ ...a })),
      raid: this.raidView(own, mine, me, now),
      war: this.warView(world, own, now),
      support: this.supportState(own),
      fund: own.fund,
      research: researchView(own.research, mine.role !== 'member'),
      missions: this.missionsView(own, me, now),
      now,
    };
    this.persist();
    return ok(detail);
  }

  subscribe(_me: PlayerProfile, onChange: () => void): () => void {
    // 疑似メンバーは、時計が進むと動く。画面が開いている間は、1分ごとに知らせる。
    const timer = setInterval(onChange, 60_000);
    (timer as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(timer);
  }

  private supportState(own: OwnAlliance): SupportState {
    return {
      sendLeft: Math.max(0, SUPPORT_SEND_LIMIT - own.me.staminaSent.length),
      receivable: own.me.pendingStamina,
      receiveLeft: Math.max(0, SUPPORT_RECEIVE_LIMIT - own.me.receivedGifts),
    };
  }

  private raidView(own: OwnAlliance, mine: StoredMember, me: PlayerProfile, now: number): RaidView {
    const raid = own.raid;
    const ranking = this.ranking(own);
    const myEntry = ranking.find((e) => e.uid === me.uid);
    const perks = perksForLevel(own.level);
    let claimable: RaidView['claimable'] = null;
    if (raid.defeatedAt !== null && !raid.claimed && (myEntry?.damage ?? 0) > 0) {
      claimable = { label: tl('alliance.reward.defeatRank', { rank: myEntry!.rank }), reward: raidDefeatReward(myEntry!.rank) };
    } else if (own.pastRaid && !own.pastRaid.claimed && own.pastRaid.myDamage > 0) {
      claimable = own.pastRaid.defeated
        ? { label: tl('alliance.reward.lastWeekDefeat'), reward: raidDefeatReward(own.pastRaid.myRank) }
        : { label: tl('alliance.reward.lastWeekParticipation'), reward: { ...RAID_REWARD_PARTICIPATION } };
    }
    void now;
    return {
      weekId: raid.weekId,
      boss: RAID_BOSSES[raid.bossIndex],
      maxHp: raid.maxHp,
      hp: raid.hp,
      startsAt: raid.startsAt,
      endsAt: raid.endsAt,
      defeatedAt: raid.defeatedAt,
      attemptsLeft: raid.defeatedAt !== null ? 0 : Math.max(0, perks.raidAttemptsPerDay - own.me.used),
      myDamage: mine.weekDamage,
      ranking: ranking.slice(0, 10).map((e) => ({ uid: e.uid, name: e.name, damage: e.damage, rank: e.rank })),
      maxDamagePerAttempt: raidDamageCap(me.power),
      claimable,
    };
  }

  private warTable(world: LocalWorld, own: OwnAlliance, now: number): { table: WarRankEntry[]; rank: number; points: number } {
    const frac = Math.min(1, Math.max(0, (now - own.war.startsAt) / WEEK_MS));
    const points = own.war.raid + own.war.donation + own.war.stages + own.war.helpers;
    const others = this.leagueOthers(world, own, own.war.seasonId, own.war.league).map((d) => ({ allianceId: d.id, name: d.name, emblem: d.emblem, points: Math.round(npcFinalPoints(world, d, own.war.seasonId, own.war.league) * frac), mine: false }));
    const all = [...others, { allianceId: own.id, name: own.name, emblem: own.emblem, points, mine: true }];
    // 同点なら、自分が上。
    all.sort((a, b) => b.points - a.points || (a.mine ? -1 : b.mine ? 1 : 0));
    const table = all.map((e, i) => ({ ...e, rank: i + 1 }));
    return { table, rank: table.find((e) => e.mine)!.rank, points };
  }

  private warView(world: LocalWorld, own: OwnAlliance, now: number): WarView {
    const { table, rank, points } = this.warTable(world, own, now);
    const past = own.pastWar;
    return {
      seasonId: own.war.seasonId,
      league: own.war.league,
      startsAt: own.war.startsAt,
      endsAt: own.war.startsAt + WEEK_MS,
      rank,
      points,
      breakdown: { raid: own.war.raid, donation: own.war.donation, stages: own.war.stages, helpers: own.war.helpers },
      table,
      rewards: WAR_REWARDS.map((b) => ({ fromRank: b.fromRank, toRank: b.toRank, label: b.label, reward: warRewardFor(b.fromRank, own.war.league) })),
      claimable: past && !past.claimed && past.participated ? { label: tl('alliance.reward.lastWeekWar', { rank: past.rank }), rank: past.rank, promoted: past.promoted, demoted: past.demoted, reward: warRewardFor(past.rank, past.league) } : null,
    };
  }

  // ------------------------------------------------------------------ AllianceBackend: 育成

  async donate(me: PlayerProfile, kind: DonationKind): Promise<Result<DonationResult>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine, now } = got.value;
    const rule = DONATIONS[kind];
    if (!rule) return fail('bad_input', tl('alliance.error.badDonation'));
    if (own.me.donated[kind] >= rule.limit) return fail('limit_reached', tl('alliance.error.donationLimit', { label: tl(DONATION_LABEL[kind]) }));
    own.me.donated[kind] += 1;
    mine.contribution += rule.contribution;
    mine.weekContribution += rule.contribution;
    own.coins += rule.contribution;
    own.war.donation += rule.contribution;
    own.fund += rule.allianceExp;
    const levelUp = this.addAllianceExp(own, rule.allianceExp, now);
    this.save().alliance.level = own.level;
    this.persist();
    return ok({ kind, allianceExp: rule.allianceExp, contribution: rule.contribution, levelUp, left: rule.limit - own.me.donated[kind] });
  }

  async spendCoins(me: PlayerProfile, amount: number): Promise<Result<number>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    if (!Number.isInteger(amount) || amount < 0) return fail('bad_input', tl('alliance.error.badAmount'));
    if (own.coins < amount) return fail('not_enough', tl('alliance.error.notEnoughCoins'));
    own.coins -= amount;
    this.persist();
    return ok(own.coins);
  }

  // ------------------------------------------------------------------ AllianceBackend: 共闘ボス

  async beginRaid(me: PlayerProfile): Promise<Result<RaidTicket>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, now } = got.value;
    const raid = own.raid;
    if (raid.defeatedAt !== null || now >= raid.endsAt) return fail('raid_over', tl('alliance.error.bossAlreadyDefeated'));
    if (own.ticket && now - own.ticket.issuedAt <= RAID_TICKET_TTL_MS) return fail('limit_reached', tl('alliance.error.attemptInProgress'));
    own.ticket = null;
    const perks = perksForLevel(own.level);
    if (own.me.used >= perks.raidAttemptsPerDay) return fail('limit_reached', tl('alliance.error.noAttemptsLeft'));
    own.me.used += 1;
    const ticket = { id: `t${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, weekId: raid.weekId, issuedAt: now, maxDamage: raidDamageCap(me.power), durationMs: RAID_DURATION_MS };
    own.ticket = ticket;
    this.persist();
    return ok({ ...ticket, boss: RAID_BOSSES[raid.bossIndex] });
  }

  async finishRaid(me: PlayerProfile, ticket: RaidTicket, damage: number): Promise<Result<RaidOutcome>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine, now } = got.value;
    const stored = own.ticket;
    if (!stored || stored.id !== ticket.id) return fail('bad_input', tl('alliance.error.attemptInvalid'));
    own.ticket = null;
    if (now - stored.issuedAt > RAID_TICKET_TTL_MS) {
      this.persist();
      return fail('limit_reached', tl('alliance.error.attemptTimedOut'));
    }
    if (stored.weekId !== own.raid.weekId) {
      this.persist();
      return fail('raid_over', tl('alliance.error.attemptWeekChanged'));
    }
    if (typeof damage !== 'number' || !Number.isFinite(damage) || damage < 0) {
      this.persist();
      return fail('bad_input', tl('alliance.error.badDamage'));
    }
    const capped = Math.min(damage, stored.maxDamage);
    const before = own.war.raid;
    const result = this.applyDamage(own, mine, capped, now);
    this.persist();
    return ok({ damage: result.applied, hpLeft: own.raid.hp, defeated: result.defeated, lastHit: result.lastHit, points: own.war.raid - before });
  }

  async claimRaidReward(me: PlayerProfile): Promise<Result<AllianceReward>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine } = got.value;
    const entry = this.ranking(own).find((e) => e.uid === mine.uid);
    let reward: AllianceReward | null = null;
    if (own.raid.defeatedAt !== null && !own.raid.claimed && (entry?.damage ?? 0) > 0) {
      own.raid.claimed = true;
      reward = raidDefeatReward(entry!.rank);
    } else if (own.pastRaid && !own.pastRaid.claimed && own.pastRaid.myDamage > 0) {
      own.pastRaid.claimed = true;
      reward = own.pastRaid.defeated ? raidDefeatReward(own.pastRaid.myRank) : { ...RAID_REWARD_PARTICIPATION };
    }
    if (!reward) return fail('limit_reached', tl('alliance.error.nothingToClaim'));
    own.coins += reward.coins ?? 0;
    this.persist();
    return ok(reward);
  }

  // ------------------------------------------------------------------ AllianceBackend: 対抗戦

  async addWarPoints(me: PlayerProfile, source: WarPointSource, points: number): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    if (!Number.isFinite(points) || points <= 0) return fail('bad_input', tl('alliance.error.badPoints'));
    const add = Math.min(WAR_POINTS_MAX_PER_CALL, Math.floor(points));
    if (source === 'raid') own.war.raid += add;
    else if (source === 'donation') own.war.donation += add;
    else if (source === 'stages') own.war.stages += add;
    else if (source === 'helpers') own.war.helpers += add;
    else return fail('bad_input', tl('alliance.error.badPointType'));
    this.persist();
    return ok(true);
  }

  async claimWarReward(me: PlayerProfile): Promise<Result<AllianceReward>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    const past = own.pastWar;
    if (!past || past.claimed || !past.participated) return fail('limit_reached', tl('alliance.error.nothingToClaim'));
    past.claimed = true;
    const reward = warRewardFor(past.rank, past.league);
    own.coins += reward.coins ?? 0;
    this.persist();
    return ok(reward);
  }

  // ------------------------------------------------------------------ AllianceBackend: 研究・ミッション

  async researchUp(me: PlayerProfile, line: ResearchLine): Promise<Result<ResearchResult>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine } = got.value;
    if (!RESEARCH_LINE_IDS.includes(line)) return fail('bad_input', tl('alliance.error.badResearch'));
    if (mine.role === 'member') return fail('no_permission', tl('alliance.error.researchPermission'));
    const level = own.research[line] ?? 0;
    const block = researchBlock(level, own.level, own.fund);
    const step = nextResearchStep(level);
    if (block === 'max' || !step) return fail('limit_reached', tl('alliance.error.researchMax'));
    if (block === 'level') return fail('level_too_low', tl('alliance.error.researchLevel', { needLevel: step.needLevel }));
    if (block === 'fund') return fail('not_enough', tl('alliance.error.researchFund'));
    own.fund -= step.cost;
    own.research[line] = level + 1;
    this.save().alliance.research = { ...own.research };
    this.persist();
    return ok({ line, level: level + 1, spent: step.cost, fundLeft: own.fund });
  }

  async reportMissions(me: PlayerProfile, counts: Partial<Record<MissionMetric, number>>): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    for (const board of [own.missions.daily, own.missions.weekly]) if (board) applyReport(board, me.uid, counts);
    this.persist();
    return ok(true);
  }

  async claimMission(me: PlayerProfile, missionId: string): Promise<Result<AllianceReward>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    const board = [own.missions.daily, own.missions.weekly].find((b) => b?.goals.some((g) => g.id === missionId)) ?? null;
    const check = checkClaim(board, me.uid, missionId);
    if (!check.ok || !board) {
      if (check.ok) return fail('not_found', tl('alliance.error.noSuchMission'));
      if (check.reason === 'no_such') return fail('not_found', tl('alliance.error.noSuchMission'));
      if (check.reason === 'not_done') return fail('limit_reached', tl('alliance.error.missionNotDone'));
      if (check.reason === 'share_low') return fail('limit_reached', tl('alliance.error.missionShareLow', { need: check.need ?? 1 }));
      return fail('limit_reached', tl('alliance.error.missionClaimed'));
    }
    markClaimed(board, me.uid, missionId);
    const reward: AllianceReward = { ...check.def.reward, ...(check.def.reward.items ? { items: { ...check.def.reward.items } } : {}) };
    own.coins += reward.coins ?? 0;
    this.persist();
    return ok(reward);
  }

  // ------------------------------------------------------------------ AllianceBackend: 助っ人・支援

  async setHelper(me: PlayerProfile, helper: HelperHero | null): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { mine, now } = got.value;
    if (helper && helper.ownerUid !== me.uid) return fail('bad_input', tl('alliance.error.ownHeroOnly'));
    mine.helper = helper ? { ...helper, skillLevels: [...helper.skillLevels], ownerName: me.name, setAt: now } : null;
    this.persist();
    return ok(true);
  }

  async borrowHelper(me: PlayerProfile, ownerUid: string): Promise<Result<HelperHero>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, now } = got.value;
    if (ownerUid === me.uid) return fail('bad_input', tl('alliance.error.ownHelper'));
    const owner = own.members.find((m) => m.uid === ownerUid);
    if (!owner) return fail('not_found', tl('alliance.error.noSuchMember'));
    if (!owner.helper) return fail('not_found', tl('alliance.error.noHelperSet'));
    const count = (own.me.borrowed[ownerUid] ?? 0) + 1;
    own.me.borrowed[ownerUid] = count;
    // 貸した側の報酬は、同じ人の助っ人で、1日に3回まで。
    if (count <= HELPER_LENDER_DAILY_LIMIT) {
      own.war.helpers += WAR_HELPER_POINTS;
      owner.contribution += HELPER_LENDER_COINS;
      owner.weekContribution += HELPER_LENDER_COINS;
    }
    this.persist();
    return ok({ ...owner.helper, skillLevels: [...owner.helper.skillLevels], setAt: owner.helper.setAt || now });
  }

  async sendStamina(me: PlayerProfile, toUid: string): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    if (toUid === me.uid || !own.members.some((m) => m.uid === toUid)) return fail('not_found', tl('alliance.error.noSuchMember'));
    if (own.me.staminaSent.includes(toUid)) return fail('limit_reached', tl('alliance.error.alreadySentToday'));
    if (own.me.staminaSent.length >= SUPPORT_SEND_LIMIT) return fail('limit_reached', tl('alliance.error.sendLimit', { SUPPORT_SEND_LIMIT }));
    own.me.staminaSent.push(toUid);
    this.persist();
    return ok(true);
  }

  async claimStamina(me: PlayerProfile): Promise<Result<number>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    const amount = own.me.pendingStamina;
    own.me.pendingStamina = 0;
    this.persist();
    return ok(amount);
  }

  async requestHelp(me: PlayerProfile, what: 'raid' | 'village'): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, now } = got.value;
    if (what !== 'raid' && what !== 'village') return fail('bad_input', tl('alliance.error.badHelpType'));
    if (now - own.me.lastHelpRequestAt < HELP_REQUEST_INTERVAL_MS) return fail('limit_reached', tl('alliance.error.helpRequestInterval'));
    own.me.lastHelpRequestAt = now;
    // i18n-ignore (stored text of the request; the card draws its own wording)
    this.push(own, { kind: 'help', senderUid: me.uid, senderName: me.name, text: what === 'raid' ? 'ボスの討伐を、手伝ってください！' : '村の襲撃に、力を貸してください！', sentAt: now, help: { what, helpers: [], open: true } });
    this.persist();
    return ok(true);
  }

  async answerHelp(me: PlayerProfile, messageId: string): Promise<Result<true>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, mine, now } = got.value;
    const msg = own.chat.find((c) => c.id === messageId && c.kind === 'help');
    if (!msg || !msg.help) return fail('not_found', tl('alliance.error.noSuchHelpRequest'));
    if (msg.senderUid === me.uid) return fail('bad_input', tl('alliance.error.cantAnswerOwn'));
    if (!msg.help.open) return fail('limit_reached', tl('alliance.error.requestClosed'));
    if (msg.help.helpers.includes(me.name)) return fail('limit_reached', tl('alliance.error.alreadyAnswered'));
    msg.help.helpers.push(me.name);
    if (msg.help.helpers.length >= 5) msg.help.open = false;
    mine.contribution += HELP_ANSWER_CONTRIBUTION;
    mine.weekContribution += HELP_ANSWER_CONTRIBUTION;
    own.coins += HELP_ANSWER_CONTRIBUTION;
    own.war.donation += HELP_ANSWER_CONTRIBUTION;
    this.addAllianceExp(own, HELP_ANSWER_CONTRIBUTION, now);
    this.save().alliance.level = own.level;
    this.persist();
    return ok(true);
  }

  // ------------------------------------------------------------------ AllianceBackend: チャット

  async chat(me: PlayerProfile, limit = 50): Promise<Result<AllianceChatMessage[]>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own } = got.value;
    this.persist();
    return ok(own.chat.slice(-Math.max(1, limit)).map((m) => ({ ...m, ...(m.help ? { help: { ...m.help, helpers: [...m.help.helpers] } } : {}) })));
  }

  async sendChat(me: PlayerProfile, text: string): Promise<Result<AllianceChatMessage>> {
    const got = this.requireOwn(me);
    if (!got.ok) return got;
    const { own, now } = got.value;
    const clean = sanitizeText(text);
    if (!clean) return fail('bad_input', tl('alliance.error.emptyMessage'));
    const msg = this.push(own, { kind: 'text', senderUid: me.uid, senderName: me.name, text: clean, sentAt: now });
    this.persist();
    return ok({ ...msg });
  }
}

function roleOrder(role: AllianceMember['role']): number {
  return role === 'leader' ? 0 : role === 'officer' ? 1 : 2;
}
