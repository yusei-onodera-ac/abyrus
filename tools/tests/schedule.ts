// The year's calendar (data/schedule.ts) and what runs on it: 期間限定イベント, ピックアップガチャ and ブーストキャンペーン - checked without a browser.
import { SCHEDULE_START, SCHEDULE_END, SCHEDULED_CAMPAIGNS, SCHEDULED_EVENTS, SCHEDULED_GACHAS } from '../../src/game/data/schedule';
import { GACHA_BANNERS, getActiveGachaBanners, isGachaActive, type GachaBannerEntry } from '../../src/game/data/gachaBanners';
import { EVENTS, eventPhase, getVisibleEvents, UPCOMING_DAYS } from '../../src/game/data/events';
import { describeCampaign } from '../../src/game/data/campaigns';
import { getHeroDefinition } from '../../src/game/data/heroes';
import { GachaSystem, heroPoolOf, heroRatesOf, pickupHeroesOf, pityLeft, ratesOf } from '../../src/game/systems/GachaSystem';
import { CampaignSystem } from '../../src/game/systems/CampaignSystem';
import { EventSystem } from '../../src/game/systems/EventSystem';
import { eventProgress, isEventRunning, isExchangeOpen, loadEvents, openEvents, recordEvent, runningEvents, touchEventLogin } from '../../src/game/systems/EventProgress';
import { recordMission } from '../../src/game/systems/MissionProgress';
import { ProgressionSystem } from '../../src/game/systems/ProgressionSystem';
import { SaveSystem } from '../../src/game/systems/SaveSystem';
import { StaminaSystem, stageStaminaCost } from '../../src/game/systems/StaminaSystem';
import { StageRewardSystem } from '../../src/game/systems/StageRewardSystem';
import { SweepSystem } from '../../src/game/systems/SweepSystem';
import { WEEKDAY_TIERS } from '../../src/game/data/weekdayDungeons';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;

const T = (iso: string): number => new Date(iso).getTime();
const DAY = 24 * 60 * 60 * 1000;
const start = T(SCHEDULE_START);
const end = T(SCHEDULE_END);
const days = Math.round((end - start) / DAY);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================ the calendar
ok(days === 365, `the year is 365 days (${days})`);
ok(SCHEDULED_EVENTS.length === 14, `14 events (${SCHEDULED_EVENTS.length})`);
const heroGachas = SCHEDULED_GACHAS.filter((g) => g.kind !== 'equipment');
const equipGachas = SCHEDULED_GACHAS.filter((g) => g.kind === 'equipment');
ok(heroGachas.length === 25 && equipGachas.length === 3, `25 ピックアップ and 3 装備の感謝祭 (${heroGachas.length} / ${equipGachas.length})`);
ok(SCHEDULED_CAMPAIGNS.length === 24, `24 campaigns (${SCHEDULED_CAMPAIGNS.length})`);

const ids = [...SCHEDULED_EVENTS.map((e) => e.id), ...SCHEDULED_GACHAS.map((g) => g.id), ...SCHEDULED_CAMPAIGNS.map((c) => c.id)];
ok(new Set(ids).size === ids.length, 'every id in the calendar is unique');
ok(new Set(GACHA_BANNERS.map((b) => b.id)).size === GACHA_BANNERS.length, 'every gacha banner id is unique (the 天井 count is kept by it)');

const span = (x: { startsAt?: string; endsAt?: string }): [number, number] => [T(x.startsAt!), T(x.endsAt!)];
const inYear = (x: { startsAt?: string; endsAt?: string }): boolean => {
  const [a, b] = span(x);
  return a >= start && b <= end && a < b;
};
ok(SCHEDULED_EVENTS.every(inYear), 'every event lies inside the year and ends after it starts');
ok(SCHEDULED_GACHAS.every(inYear), 'every gacha lies inside the year');
ok(SCHEDULED_CAMPAIGNS.every(inYear), 'every campaign lies inside the year');
ok(SCHEDULED_EVENTS.every((e) => e.startsAt.endsWith('T00:00:00') && e.endsAt.endsWith('T23:59:00')), 'events start at 0:00 and end at 23:59');

// one 期間限定イベント at a time; no day without a hero ピックアップ, none with two; every day has an event or a campaign
function liveCount(items: { startsAt?: string; endsAt?: string }[], t: number): number {
  return items.filter((x) => T(x.startsAt!) <= t && t < T(x.endsAt!)).length;
}
let eventOverlap = 0;
let gachaGap = 0;
let gachaOverlap = 0;
const uncovered: string[] = [];
for (let d = 0; d < days; d++) {
  const noon = start + d * DAY + 12 * 3600 * 1000;
  const events = liveCount(SCHEDULED_EVENTS, noon);
  const gachas = liveCount(heroGachas, noon);
  const campaigns = liveCount(SCHEDULED_CAMPAIGNS, noon);
  if (events > 1) eventOverlap++;
  if (gachas === 0) gachaGap++;
  if (gachas > 1) gachaOverlap++;
  if (events + campaigns === 0) uncovered.push(new Date(noon).toISOString().slice(0, 10));
}
ok(eventOverlap === 0, 'no two 期間限定イベント run on the same day');
ok(gachaGap === 0 && gachaOverlap === 0, `exactly one hero ピックアップ is on every day (gaps ${gachaGap}, overlaps ${gachaOverlap})`);
ok(uncovered.length === 0, `every day has an event or a campaign (bare days: ${uncovered.join(' ') || 'none'})`);
ok(equipGachas.every((g, i, a) => i === 0 || T(g.startsAt!) > T(a[i - 1].endsAt!)), 'the 装備の感謝祭 do not overlap each other');

// ============================================================================ the events
const kinds = new Set(SCHEDULED_EVENTS.map((e) => e.kind));
ok(kinds.has('dungeon') && kinds.has('mission'), 'both kinds of event are in the year');
for (const e of SCHEDULED_EVENTS) {
  const label = e.id;
  ok(e.milestones.every((m, i, a) => m.points > 0 && (i === 0 || m.points > a[i - 1].points) && m.rewards.length > 0 && m.rewards.every((r) => r.amount > 0)), `${label}: 累計報酬 rise and pay something`);
  ok(new Set(e.shop.map((i) => i.id)).size === e.shop.length && e.shop.every((i) => i.cost > 0 && i.limit > 0 && i.rewards.length > 0), `${label}: 交換所 items are unique, priced and limited`);
  ok(new Set(e.missions.map((m) => m.id)).size === e.missions.length && e.missions.every((m) => m.target > 0 && m.tokens > 0), `${label}: missions are unique and pay something`);
  ok(e.firstClearGems.length === 4 && e.region >= 0 && e.region <= 4 && e.tokenPerStamina > 0, `${label}: dungeon settings are sane`);
  ok(/^[0-9a-z-]+$/.test(e.id) && e.image === `${e.id}.jpg`, `${label}: its picture is events/<id>.jpg`);
  const last = e.milestones[e.milestones.length - 1].points;
  const fromMissions = e.missions.reduce((sum, m) => sum + m.tokens, 0);
  const daysOn = Math.round((T(e.endsAt) - T(e.startsAt)) / DAY);
  if (e.kind === 'mission') ok(fromMissions >= last, `${label}: the missions alone (${fromMissions}) reach the last step (${last})`);
  else {
    // 180 seconds a point of stamina: the most that can be spent in the days it runs.
    const mostStamina = (daysOn * 24 * 3600) / 180;
    ok(mostStamina * e.tokenPerStamina + fromMissions >= last, `${label}: the last step (${last}) can be reached in ${daysOn} days`);
  }
}
const gemsOf = (rewards: { type: string; amount: number }[]): number => rewards.filter((r) => r.type === 'gems').reduce((s, r) => s + r.amount, 0);
const gemBudget = SCHEDULED_EVENTS.map((e) => ({ id: e.id, gems: e.milestones.reduce((s, m) => s + gemsOf(m.rewards), 0) + e.firstClearGems.reduce((a, b) => a + b, 0) * (e.kind === 'dungeon' ? 1 : 0) }));
console.log('      free 魔晶石 of a full 累計報酬 + first clears:', gemBudget.map((g) => `${g.id} ${g.gems}`).join(', '));
ok(gemBudget.every((g) => g.gems >= 150 && g.gems <= 1500), 'each event gives between 150 and 1,500 魔晶石 for the rewards (a ten-pull is 900)');

// ============================================================================ the Event tab
{
  const at = (iso: string): number => T(iso);
  ok(eventPhase(EVENTS.find((e) => e.id === 'launch')!, at('2026-11-20T12:00:00')) === 'live', 'launch is live on 11/20');
  ok(eventPhase(EVENTS.find((e) => e.id === 'launch')!, at('2026-12-08T12:00:00')) === 'exchange', 'and in its 交換期間 on 12/8 (3 days after the end)');
  ok(eventPhase(EVENTS.find((e) => e.id === 'launch')!, at('2026-12-10T12:00:00')) === 'ended', 'and over on 12/10');
  ok(eventPhase(EVENTS.find((e) => e.id === 'xmas')!, at('2026-12-01T12:00:00')) === 'upcoming', 'xmas is upcoming on 12/1');
  const early = getVisibleEvents(at('2026-11-20T12:00:00'));
  ok(early[0].entry.id === 'launch', 'the 期間限定イベント is listed first');
  ok(early.some((e) => e.entry.id === 'infinite') && early.some((e) => e.entry.id === 'premium'), 'the permanent events stay in the list');
  ok(!early.some((e) => e.entry.id === 'xmas'), 'an event that starts in more than 14 days is not on the Event tab yet');
  ok(getVisibleEvents(at('2026-12-10T12:00:00')).some((e) => e.entry.id === 'xmas' && e.phase === 'upcoming'), `one within ${UPCOMING_DAYS} days is, as 開催予定`);
  const mid = getVisibleEvents(at('2026-12-08T12:00:00'));
  ok(mid[0].entry.id === 'launch' && mid[0].phase === 'exchange', 'an event in its 交換期間 is listed first (its currency is about to be lost), before the permanent events');
  ok(mid.findIndex((e) => e.entry.id === 'infinite') > 0, 'and the permanent ones follow');
}

// ============================================================================ the gachas
{
  const t = T('2026-11-20T12:00:00');
  const active = getActiveGachaBanners(t);
  ok(active[0].id === 'g01-launch', 'the live ピックアップ is first on the Gacha tab');
  ok(!active.some((b) => b.id === 'g03-xmas'), 'a gacha that has not started is not listed');
  ok(['special', 'first', 'equip-standard', 'standard'].every((id) => active.some((b) => b.id === id)), 'the permanent gachas are still listed');
  ok(!isGachaActive({ startsAt: '2027-01-01T00:00:00', endsAt: '2027-01-02T00:00:00' }, t) && isGachaActive({}, t), 'isGachaActive: not yet / no limits');
  ok(getActiveGachaBanners(T('2026-12-08T12:00:00')).some((b) => b.id === 'equip-fest-1'), 'the 装備の感謝祭 is listed on 12/8');
}
for (const b of heroGachas) {
  const label = b.id;
  const rates = ratesOf(b);
  ok(Math.abs(rates.reduce((s, r) => s + r.rate, 0) - 1) < 1e-9, `${label}: the rarity rates add up to 1`);
  const per = heroRatesOf(b);
  ok(Math.abs(per.reduce((s, r) => s + r.rate, 0) - 1) < 1e-9, `${label}: the characters' rates add up to 1`);
  const picks = pickupHeroesOf(b);
  ok(picks.length === b.pickup!.heroes.length && picks.every((h) => h.rarity >= 3 && h.rarity <= 5), `${label}: every ピックアップ exists, is in the pool and is ★3-5 (${picks.map((h) => h.id).join(',')})`);
  ok(per.filter((r) => r.pickup).every((r) => per.filter((o) => !o.pickup && o.def.rarity === r.def.rarity).every((o) => r.rate > o.rate)), `${label}: each ピックアップ comes out more often than any other of its rarity`);
  ok(!heroPoolOf(b).some((h) => h.rarity === 6), `${label}: no ★6`);
  ok(b.pity?.pickup === true && b.pity.at >= 30 && b.tenMin === 3, `${label}: 天井 on the ピックアップ and a ★3 ten-pull`);
  ok(b.image === `${b.id}.jpg` && b.description.length <= 22, `${label}: picture name and a one-line description (${b.description})`);
  const top = picks.reduce((m, h) => Math.max(m, h.rarity), 0);
  ok(top === (b.pity!.minRarity), `${label}: the 天井's ★ is the top ピックアップ's (${top})`);
}
for (const b of equipGachas) {
  ok(b.kind === 'equipment' && Math.abs(ratesOf(b).reduce((s, r) => s + r.rate, 0) - 1) < 1e-9 && ratesOf(b).find((r) => r.rarity === 5)!.rate === 0.04, `${b.id}: ★5 at 4% and the rates add up`);
}
// the heroes: each ★5 headlines more than once, and every ★4 pickup is a real ★4
{
  const five = new Map<string, number>();
  for (const b of heroGachas) for (const h of pickupHeroesOf(b)) if (h.rarity === 5) five.set(h.id, (five.get(h.id) ?? 0) + 1);
  console.log('      ★5 headlines:', [...five].map(([id, n]) => `${id}×${n}`).join(' '));
  ok(five.size === 6, 'all six ★5 headline at least once in the year');
}

// pickup weights and the 天井
{
  const b = heroGachas.find((g) => g.id === 'g03-xmas')!; // ★5 aria; ★4 ouka, quartz; ★3 noel, celes
  const per = heroRatesOf(b);
  const aria = per.find((r) => r.def.id === 'aria')!;
  const otherFive = per.filter((r) => r.def.rarity === 5 && !r.pickup);
  ok(Math.abs(aria.rate - 0.01) < 1e-12 && otherFive.length === 5 && otherFive.every((r) => Math.abs(r.rate - 0.002) < 1e-12), 'g03: aria is half of the ★5 2% (1%), the other five share the rest (0.2% each)');
  const four = per.filter((r) => r.def.rarity === 4 && r.pickup);
  ok(four.length === 2 && four.every((r) => Math.abs(r.rate - 0.02) < 1e-12), 'g03: the two ★4 ピックアップ share half of 8% (2% each)');

  // statistics: the rate of the ピックアップ in many pulls
  const save = SaveSystem.createDefault();
  const r = rng(7);
  let pulls = 0;
  let ariaCount = 0;
  let fiveCount = 0;
  for (let i = 0; i < 4000; i++) {
    save.gachaPity = {}; // (the 天井 is tested below)
    for (const h of GachaSystem.pullHeroes(save, b, 10, r)) {
      pulls++;
      if (h.rarity === 5) fiveCount++;
      if (h.heroId === 'aria') ariaCount++;
    }
  }
  ok(Math.abs(fiveCount / pulls - 0.02) < 0.004, `★5 comes out at about 2% (${((fiveCount / pulls) * 100).toFixed(2)}%)`);
  ok(Math.abs(ariaCount / pulls - 0.01) < 0.003, `aria at about 1% (${((ariaCount / pulls) * 100).toFixed(2)}%)`);

  // the 天井: the 50th pull without a ★5 is a ★5 ピックアップ
  const save2 = SaveSystem.createDefault();
  save2.gachaPity[b.id] = 49;
  const lowest = (): number => 0.999999; // the natural roll is the lowest rarity
  const [certain] = GachaSystem.pullHeroes(save2, b, 1, lowest);
  ok(certain.rarity === 5 && certain.heroId === 'aria', `the 50th pull is the ★5 ピックアップ even when luck says otherwise (${certain.heroId})`);
  ok(save2.gachaPity[b.id] === 0 && pityLeft(save2, b) === 50, 'and the count starts again');
  const save3 = SaveSystem.createDefault();
  save3.gachaPity[b.id] = 10;
  const [normal] = GachaSystem.pullHeroes(save3, b, 1, lowest);
  ok(normal.rarity === 1 && save3.gachaPity[b.id] === 11, 'before the 天井 a bad roll is a bad pull and counts');

  // several ★5 ピックアップ: the 天井 hands over one of them
  const h24 = heroGachas.find((g) => g.id === 'g24-halloween')!;
  const save4 = SaveSystem.createDefault();
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    save4.gachaPity[h24.id] = 49;
    seen.add(GachaSystem.pullHeroes(save4, h24, 1, rng(100 + i).bind(null) as () => number)[0].heroId);
  }
  console.log('      g24 天井 handed over:', [...seen].join(', '));
  ok([...seen].every((id) => id === 'shade' || id === 'viara'), 'a 天井 on two ★5 ピックアップ hands over one of those two');

  // a ★4 banner: the 天井 is ★4 or better and a ピックアップ
  const g2 = heroGachas.find((g) => g.id === 'g02-winter4')!;
  const save5 = SaveSystem.createDefault();
  save5.gachaPity[g2.id] = 29;
  const [four4] = GachaSystem.pullHeroes(save5, g2, 1, lowest);
  ok(['seira', 'ignis', 'brann'].includes(four4.heroId), `a ★4 banner's 天井 is one of its ★4 ピックアップ (${four4.heroId})`);

  // ten-pull promise
  let tenBad = 0;
  const save6 = SaveSystem.createDefault();
  const r6 = rng(11);
  for (let i = 0; i < 5000; i++) {
    save6.gachaPity = {};
    if (!GachaSystem.pullHeroes(save6, b, 10, r6).some((h) => h.rarity >= 3)) tenBad++;
  }
  ok(tenBad === 0, 'every ten-pull of a ピックアップ has a ★3 or better');
}
ok(SaveSystem.createDefault().gachaPity && Object.keys(SaveSystem.createDefault().gachaPity).length === 0, 'a new save has no 天井 counts');

// ============================================================================ the campaigns
{
  CampaignSystem.setTesting(false);
  const at = (iso: string): number => T(iso);
  ok(CampaignSystem.mul('stamina', at('2026-12-10T12:00:00')) === 0.5 && CampaignSystem.mul('gold', at('2026-12-10T12:00:00')) === 1, 'on 12/10 stamina is half, gold is normal');
  ok(CampaignSystem.mul('gold', at('2026-12-15T12:00:00')) === 2 && CampaignSystem.mul('stamina', at('2026-12-15T12:00:00')) === 1, 'on 12/15 gold is doubled');
  ok(CampaignSystem.active(at('2026-12-20T12:00:00')).length === 0, 'no campaign on 12/20 (an event is on)');
  ok(CampaignSystem.staminaCost(5, at('2026-12-10T12:00:00')) === 3 && CampaignSystem.staminaCost(1, at('2026-12-10T12:00:00')) === 1 && CampaignSystem.staminaCost(14, at('2026-12-20T12:00:00')) === 14, 'half the stamina rounds up and is at least 1; none changes it');
  ok(CampaignSystem.scale('exp', 100, at('2027-01-15T12:00:00')) === 200 && CampaignSystem.scale('exp', 100, at('2026-12-20T12:00:00')) === 100, 'EXP doubles on 1/15');
  ok(stageStaminaCost('main', 0, at('2026-12-10T12:00:00')) === 3 && stageStaminaCost('main', 0, at('2026-12-20T12:00:00')) === 5, 'a stage costs 3 instead of 5 in the stamina campaign');
  ok(describeCampaign({ kind: 'stamina', mul: 0.5 }) === 'スタミナ消費 半分' && describeCampaign({ kind: 'gold', mul: 2 }) === 'ゴールド ×2', 'campaigns are described');

  // the drops: bigger in a ドロップ2倍 campaign, the first-clear gems not
  const stage = { kind: 'main' as const, index: 0 };
  const plain = StageRewardSystem.roll(stage, true, 1000, () => 0);
  const real = Date.now;
  Date.now = () => at('2027-01-23T12:00:00');
  const doubled = StageRewardSystem.roll(stage, true, 1000, () => 0);
  Date.now = real;
  ok(doubled.items.length === plain.items.length && doubled.items.every((d, i) => d.amount === plain.items[i].amount * 2), 'drops are doubled on 1/23');
  ok(doubled.gems === plain.gems && doubled.gems > 0, 'the first-clear 魔晶石 is not');

  // a sweep: the cost follows the campaign, the base cost (what the プレイヤーEXP is counted by) does not
  const target = { kind: 'quest' as const, stage: { kind: 'main' as const, index: 2 } };
  const real2 = Date.now;
  Date.now = () => at('2026-12-10T12:00:00');
  ok(SweepSystem.costPer(target) === stageStaminaCost('main', 2) && SweepSystem.costPer(target) < SweepSystem.baseCostPer(target) && SweepSystem.baseCostPer(target) === 5, 'sweep: the cost follows the campaign (3), the base does not (5)');
  Date.now = real2;
  CampaignSystem.setTesting(true);
}

// ============================================================================ an event, played
{
  const def = EventSystem.get('launch')!;
  const now = T('2026-11-20T12:00:00');
  const save = SaveSystem.createDefault();
  save.stageProgress = 31; // 中級 open
  ok(isEventRunning(def, now) && isExchangeOpen(def, now), 'launch runs on 11/20');
  ok(!isEventRunning(def, T('2026-12-07T12:00:00')) && isExchangeOpen(def, T('2026-12-07T12:00:00')) && !isExchangeOpen(def, T('2026-12-10T12:00:00')), 'it stops running at the end; the 交換所 stays three days');
  ok(runningEvents(now).length === 1 && openEvents(now).length === 1 && runningEvents(T('2026-12-10T12:00:00')).length === 0, 'runningEvents / openEvents');
  ok(EventSystem.isTierOpen(save, 0) && EventSystem.isTierOpen(save, 1) && !EventSystem.isTierOpen(save, 2), 'tiers open with the main stages (0 / 30 / 60 / 100)');
  ok([0, 1, 2, 3].map((t) => EventSystem.tokensPerClear(def, t)).join(',') === '20,28,36,60', 'a clear pays twice the stamina: 20, 28, 36, 60');

  // the stage itself
  for (let tier = 0; tier < 4; tier++) {
    const s = ProgressionSystem.getEventStage(def, tier);
    const again = ProgressionSystem.getEventStage(def, tier);
    ok(s.enemies.length >= 3 && s.index === tier && s.name.startsWith(def.title) && s.regionIndex === def.region && JSON.stringify(s.enemies) === JSON.stringify(again.enemies), `the event stage of tier ${tier} is set, named and always the same`);
  }
  const other = ProgressionSystem.getEventStage(EventSystem.get('xmas')!, 0);
  ok(other.regionIndex === 2 && other.name !== ProgressionSystem.getEventStage(def, 0).name, "another event's dungeon has its own region and name");
  ok(ProgressionSystem.getEventStage(def, 3).difficulty === ProgressionSystem.getWeekdayStage(0, 3).difficulty, 'its 超級 is as strong as the 曜日ダンジョン 超級');

  // clearing
  const first = EventSystem.clear(save, def, 0, 1, now)!;
  ok(first.firstClear && first.tokens === 20 && first.gems === 20, 'the first clear pays 20 and the first-clear 魔晶石');
  ok(save.events.launch.tokens === 20 && save.events.launch.points === 20 && EventSystem.isCleared(save, 'launch', 0), 'it is in the record, and the tier is cleared');
  const gemsBefore = save.gems;
  const again = EventSystem.clear(save, def, 0, 3, now)!;
  ok(!again.firstClear && again.tokens === 60 && again.gems === 0 && save.gems === gemsBefore && save.events.launch.tokens === 80, 'three more pay 60 and no 魔晶石');
  ok(EventSystem.clear(save, def, 0, 1, T('2026-12-08T12:00:00')) === null, 'a clear after the end pays nothing');
  ok(save.events.launch.counts.event_clear === 4, 'the clears are counted for the missions (4)');

  // the missions are fed by the ordinary mission counts
  const n = (id: string): number => EventSystem.missions(save, def).find((m) => m.def.id === id)!.count;
  recordMission(save, 'gacha_pull', 4, now);
  ok(n('gacha10') === 4 && !EventSystem.missions(save, def).find((m) => m.def.id === 'gacha10')!.done, 'ガチャ4回: the gacha mission has 4 of 10');
  recordMission(save, 'gacha_pull', 8, now);
  ok(n('gacha10') === 10 && EventSystem.missions(save, def).find((m) => m.def.id === 'gacha10')!.done, 'and 12 in all counts as 10 (done)');
  ok(n('login1') === 1, 'doing something counted the day as a login');
  touchEventLogin(save, now);
  ok(n('login1') === 1, 'a second visit the same day is not another login');
  touchEventLogin(save, now + DAY);
  touchEventLogin(save, now + 2 * DAY);
  ok(n('login3') === 3 && EventSystem.missions(save, def).find((m) => m.def.id === 'login3')!.done, 'three days make the 3-day login mission');
  ok(save.missions.totals.gacha_pull === 12, 'the ordinary mission total still counted them');
  recordMission(save, 'gacha_pull', 5, T('2026-12-10T12:00:00'));
  ok(n('gacha10') === 10, 'after the event nothing counts (and the cap holds)');

  const tokensBefore = save.events.launch.tokens;
  ok(EventSystem.claimMission(save, def, 'gacha10', now) === 200 && save.events.launch.tokens === tokensBefore + 200, 'taking a finished mission pays its currency');
  ok(EventSystem.claimMission(save, def, 'gacha10', now) === null, 'once only');
  ok(EventSystem.claimMission(save, def, 'clear100', now) === null, 'a mission not finished cannot be taken');
  ok(EventSystem.hasClaimable(save, def, now), 'something is claimable (the red dot)');
  const paid = EventSystem.claimAllMissions(save, def, now);
  ok(paid > 0 && EventSystem.missions(save, def).every((m) => !m.done || m.claimed), `take-all pays the rest (${paid})`);

  // the 累計報酬
  const points = save.events.launch.points;
  const reached = EventSystem.milestones(save, def).filter((m) => m.reached).length;
  ok(reached >= 1 && points >= def.milestones[0].points, `${points} points reach ${reached} steps`);
  const gemsPre = save.gems;
  const got = EventSystem.claimMilestone(save, def, 0, now, rng(1))!;
  ok(got.length > 0 && got[0].reward.type === 'gold' && EventSystem.milestones(save, def)[0].claimed, 'the first step is paid (gold) and marked');
  ok(EventSystem.claimMilestone(save, def, 0, now) === null, 'once only');
  ok(EventSystem.claimMilestone(save, def, def.milestones.length - 1, now) === null, 'a step not reached cannot be taken');
  const many = EventSystem.claimAllMilestones(save, def, now, rng(2));
  ok(many.length === 0 || EventSystem.milestones(save, def).every((m) => !m.reached || m.claimed), 'take-all takes every step that is reached');
  void gemsPre;

  // the 交換所
  const p = save.events.launch;
  p.tokens = 500;
  const gold = def.shop.find((i) => i.id === 'gold')!;
  ok(EventSystem.buyBlock(save, def, gold, now) === 'ok', 'a priced item can be bought');
  const goldBefore = save.gold.toString();
  const bought = EventSystem.buy(save, def, 'gold', now)!;
  ok(bought.length === 1 && p.tokens === 500 - gold.cost && EventSystem.bought(save, def, 'gold') === 1 && save.gold.toString() !== goldBefore, 'buying pays the item and takes the price');
  p.tokens = 5;
  ok(EventSystem.buyBlock(save, def, gold, now) === 'tokens' && EventSystem.buy(save, def, 'gold', now) === null && p.tokens === 5, 'without enough it is refused');
  p.tokens = 10_000_000;
  for (let i = 0; i < gold.limit; i++) EventSystem.buy(save, def, 'gold', now);
  ok(EventSystem.bought(save, def, 'gold') === gold.limit && EventSystem.buyBlock(save, def, gold, now) === 'limit' && EventSystem.buy(save, def, 'gold', now) === null, 'the limit holds');
  ok(EventSystem.buyBlock(save, def, def.shop.find((i) => i.id === 'gems')!, T('2026-12-10T12:00:00')) === 'closed', 'after the 交換期間 nothing can be bought');
  const stamina = def.shop.find((i) => i.id === 'stamina')!;
  save.stamina = [10, 50];
  ok(EventSystem.buy(save, def, 'stamina', now) !== null && save.stamina[0] === 50 + 0 - 0 + (save.stamina[0] - 50) && save.stamina[0] > 10, 'a stamina item gives stamina');
  void stamina;
  const bagBefore = save.equipment.length;
  const gear = EventSystem.buy(save, def, 'equip5', now)!;
  ok(gear.length === 1 && gear[0].equipment?.length === 1 && save.equipment.length === bagBefore + 1 && gear[0].equipment[0].defId.split('-')[1] === '5', 'the ★5 equipment item puts a ★5 piece in the bag');
}

// ============================================================================ saving and loading
{
  const save = SaveSystem.createDefault();
  const def = EventSystem.get('launch')!;
  const now = T('2026-11-20T12:00:00');
  EventSystem.clear(save, def, 0, 2, now);
  save.events.launch.bought.gold = 3;
  save.events.launch.claimed = [0, 1];
  const back = loadEvents(JSON.parse(JSON.stringify(save.events)), now);
  ok(back.launch.tokens === 40 && back.launch.cleared.join() === '0' && back.launch.bought.gold === 3 && back.launch.claimed.join() === '0,1', 'a record survives the round trip');

  const damaged = loadEvents({ launch: { tokens: 'x', points: -5, claimed: [0, 99, 'a'], bought: { gold: 9999, nonsense: 3 }, counts: { gacha_pull: -3, quest_clear: 4.7 }, missionClaimed: ['gacha10', 'nonsense'], cleared: [0, 7] }, ghost: { tokens: 5 }, xmas: 3 }, now);
  ok(damaged.launch.tokens === 0 && damaged.launch.points === 0 && damaged.launch.claimed.join() === '0', 'damaged numbers are made sane and a step outside the list is dropped');
  ok(damaged.launch.bought.gold === def.shop.find((i) => i.id === 'gold')!.limit && damaged.launch.bought.nonsense === undefined, 'a count is capped at the limit; an unknown item is dropped');
  ok(damaged.launch.counts.gacha_pull === undefined && damaged.launch.counts.quest_clear === 4 && damaged.launch.missionClaimed.join() === 'gacha10' && damaged.launch.cleared.join() === '0', 'counts, taken missions and cleared tiers are cleaned');
  ok(damaged.ghost === undefined && damaged.xmas === undefined, 'an event that is not in the schedule (or a record that is no object) is dropped');
  ok(loadEvents({ launch: { tokens: 50 } }, T('2026-12-20T12:00:00')).launch === undefined, 'a record is dropped a week after the 交換期間 ends');
  ok(Object.keys(loadEvents(null)).length === 0 && Object.keys(loadEvents('x')).length === 0, 'a missing or silly record is nothing');

  // the whole save: an old save has no events
  const old = JSON.parse(JSON.stringify(SaveSystem.createDefault()));
  delete old.events;
  store.set('abyrus_save_v1', JSON.stringify(old));
  ok(Object.keys(SaveSystem.load().events).length === 0, 'a save from before the events has an empty record');
}

// recordEvent on its own
{
  const save = SaveSystem.createDefault();
  recordEvent(save, 'gacha_pull', 3, T('2026-12-10T12:00:00'));
  ok(Object.keys(save.events).length === 0, 'with no event running nothing is recorded');
  recordEvent(save, 'gacha_pull', 0, T('2026-11-20T12:00:00'));
  ok(Object.keys(save.events).length === 0, 'and nothing for zero');
  void eventProgress;
  void StaminaSystem;
  void WEEKDAY_TIERS;
  void getHeroDefinition;
}

if (failures) process.exit(1);
