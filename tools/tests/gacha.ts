// Checks the 特設ガチャ rules (★6, 天井 at 40, ten-pull ★3+) against the real GachaSystem and hero data, without a browser.
import { SaveSystem } from '../../src/game/systems/SaveSystem';
import { GachaSystem, heroPoolOf, ratesOf } from '../../src/game/systems/GachaSystem';
import { GACHA_BANNERS } from '../../src/game/data/gachaBanners';
import { HERO_ROSTER, createHeroInstance } from '../../src/game/data/heroes';
import { HERO_SKILLS, RARITY_SKILL_SLOTS } from '../../src/game/data/skills';
import { ProgressionSystem } from '../../src/game/systems/ProgressionSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;

/** A deterministic random source (mulberry32), so a failure can be repeated. */
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

const special = GACHA_BANNERS.find((b) => b.id === 'special')!;
const standard = GACHA_BANNERS.find((b) => b.id === 'standard')!;
const first = GACHA_BANNERS.find((b) => b.id === 'first')!;

// ---- data
ok(GACHA_BANNERS[0].id === 'special', 'the special banner is first in the list');
ok(!GACHA_BANNERS.some((b) => b.id === 'new-gacha'), 'the old new-gacha banner is gone');
const rates = ratesOf(special);
const sum = rates.reduce((s, r) => s + r.rate, 0);
ok(Math.abs(sum - 1) < 1e-9, `special rates add up to 1 (${sum})`);
ok(rates.some((r) => r.rarity === 6 && Math.abs(r.rate - 0.004) < 1e-12), 'special has a ★6 at 0.4%');
ok(special.pity?.at === 40 && special.pity.minRarity === 5, '天井: 40 pulls, ★5 or better');
ok(special.tenMin === 3, '10連: ★3 or better');
for (const b of [standard, first]) ok(!ratesOf(b).some((r) => r.rarity === 6) && !heroPoolOf(b).some((h) => h.rarity === 6), `${b.id}: no ★6 in its rates or pool`);
ok(heroPoolOf(special).filter((h) => h.rarity === 6).length === 1, 'special pool has exactly one ★6');

const ids = HERO_ROSTER.map((h) => h.id);
ok(new Set(ids).size === ids.length, `hero ids are unique (${ids.length} heroes)`);
const count = (r: number): number => HERO_ROSTER.filter((h) => h.rarity === r).length;
console.log(`      ★1=${count(1)} ★2=${count(2)} ★3=${count(3)} ★4=${count(4)} ★5=${count(5)} ★6=${count(6)}`);
ok(count(6) === 1 && HERO_ROSTER.find((h) => h.rarity === 6)!.id === 'aion', 'one ★6, aion');
const newIds = ['aion', 'kurenai', 'sieg', 'thorne', 'gale', 'ivy', 'lilith', 'quartz', 'brann', 'raijin', 'ouka', 'haruka', 'jin', 'sora', 'gen', 'rosa', 'taiga', 'miru', 'orga', 'lune', 'felix', 'tsubame', 'robin', 'ines', 'kaede', 'gustav', 'bruno', 'doris', 'lena', 'noel', 'mimi'];
ok(newIds.length === 31 && newIds.every((id) => ids.includes(id)), 'all 31 new heroes are in the roster');
ok(newIds.filter((id) => HERO_ROSTER.find((h) => h.id === id)!.rarity === 3).length === 20, '20 new ★3');
ok(newIds.filter((id) => HERO_ROSTER.find((h) => h.id === id)!.rarity === 4).length === 10, '10 new ★4');
let skillsOk = true;
for (const h of HERO_ROSTER) if ((HERO_SKILLS[h.id]?.length ?? 0) !== RARITY_SKILL_SLOTS[h.rarity]) skillsOk = false;
ok(skillsOk, 'every hero has a skill kit as long as its rarity grants');
let createOk = true;
for (const h of HERO_ROSTER) {
  const inst = createHeroInstance(h.id, `x-${h.id}`);
  const stats = ProgressionSystem.computeHeroStats(inst);
  if (inst.rarity !== h.rarity || stats.maxHp.isZero()) createOk = false;
}
ok(createOk, 'createHeroInstance and computeHeroStats work for every hero');
const aion = ProgressionSystem.computeHeroStats(createHeroInstance('aion', 'a'));
const gauss = ProgressionSystem.computeHeroStats(createHeroInstance('gauss', 'g'));
console.log(`      aion lv1 HP ${aion.maxHp.toString()} ATK ${aion.atk.toString()}  vs ★5 gauss HP ${gauss.maxHp.toString()} ATK ${gauss.atk.toString()}`);

// ---- ten-pulls: at least one ★3+ every time
{
  const save = SaveSystem.createDefault();
  const r = rng(1);
  let bad = 0;
  let raised = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const heroes = GachaSystem.pullHeroes(save, special, 10, r);
    if (heroes.length !== 10 || !heroes.some((h) => h.rarity >= 3)) bad++;
  }
  ok(bad === 0, `${N} ten-pulls of special: every one has a ★3 or better`);
  void raised;
}
// a ten-pull of the standard banner has no such promise (so some are all ★1-2)
{
  const save = SaveSystem.createDefault();
  const r = rng(2);
  let low = 0;
  for (let i = 0; i < 5000; i++) if (!GachaSystem.pullHeroes(save, standard, 10, r).some((h) => h.rarity >= 3)) low++;
  ok(low > 0, `standard ten-pulls have no ★3 promise (${low} of 5000 had none)`);
}

// ---- 天井: never more than 40 pulls without a ★5+; singles and ten-pulls mixed
{
  const save = SaveSystem.createDefault();
  const r = rng(3);
  let since = 0;
  let maxGap = 0;
  let totals = [0, 0, 0, 0, 0, 0, 0];
  let pulls = 0;
  let fortieth5plus = true;
  for (let i = 0; i < 60000; i++) {
    const n = r() < 0.5 ? 1 : 10;
    const heroes = GachaSystem.pullHeroes(save, special, n, r);
    for (const h of heroes) {
      pulls++;
      totals[h.rarity]++;
      since++;
      if (since === 40 && h.rarity < 5) fortieth5plus = false;
      if (h.rarity >= 5) since = 0;
      maxGap = Math.max(maxGap, since);
    }
  }
  ok(fortieth5plus && maxGap <= 40, `天井: the 40th pull since the last ★5+ is always ★5+ (longest dry run ${maxGap})`);
  console.log(`      ${pulls} pulls: ★6 ${((totals[6] / pulls) * 100).toFixed(3)}%  ★5 ${((totals[5] / pulls) * 100).toFixed(2)}%  ★4 ${((totals[4] / pulls) * 100).toFixed(2)}%  ★3 ${((totals[3] / pulls) * 100).toFixed(2)}%`);
}
// single pulls only: ★6 rate and the counter
{
  const save = SaveSystem.createDefault();
  const r = rng(4);
  let six = 0;
  let since = 0;
  let maxGap = 0;
  const N = 1_000_000;
  for (let i = 0; i < N; i++) {
    const [h] = GachaSystem.pullHeroes(save, special, 1, r);
    since++;
    if (h.rarity === 6) six++;
    if (h.rarity >= 5) since = 0;
    maxGap = Math.max(maxGap, since);
  }
  console.log(`      single pulls x${N}: ★6 ${((six / N) * 100).toFixed(3)}% (listed 0.4%; the 天井 adds a little), longest dry run ${maxGap}`);
  ok(maxGap <= 40 && six / N > 0.0035 && six / N < 0.0075, '★6 single-pull rate is low (about 0.4-0.7%)');
  ok((save.gachaPity['special'] ?? 0) <= 39, 'the counter in the save stays under 40');
}
// the other banners never give a ★6
{
  const save = SaveSystem.createDefault();
  const r = rng(5);
  let six = 0;
  for (const b of [standard, first]) for (let i = 0; i < 100000; i++) if (GachaSystem.pullHeroes(save, b, 1, r)[0].rarity === 6) six++;
  ok(six === 0, 'standard and first: no ★6 in 200000 pulls');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
