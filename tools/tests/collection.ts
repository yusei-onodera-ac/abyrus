// 図鑑: counting the characters held, and the rewards for how many.
import { HERO_ROSTER, createHeroInstance } from '../../src/game/data/heroes';
import { collectionMilestones } from '../../src/game/data/collection';
import { CollectionSystem } from '../../src/game/systems/CollectionSystem';
import { SaveSystem } from '../../src/game/systems/SaveSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const save = SaveSystem.createDefault();
const total = HERO_ROSTER.length;
const ms = collectionMilestones();
ok(ms.length >= 2 && ms[ms.length - 1].count === total, 'the last milestone is the whole roster');
ok(ms.every((m, i) => i === 0 || m.count > ms[i - 1].count), 'the milestones rise');
ok(ms.every((m) => m.rewards.length > 0 && m.rewards.every((r) => r.amount > 0)), 'every milestone pays something');
ok(collectionMilestones(25).map((m) => m.count).join() === '10,20,25', 'a smaller roster drops the milestones it cannot reach and ends on its own size');

ok(CollectionSystem.total() === total, 'total = the roster');
const startOwned = CollectionSystem.owned(save);
ok(startOwned === new Set(save.heroes.map((h) => h.heroId)).size, 'owned counts characters, not copies');
const first = HERO_ROSTER.find((d) => !save.heroes.some((h) => h.heroId === d.id))!;
save.heroes.push(createHeroInstance(first.id, 'x1', 1));
save.heroes.push(createHeroInstance(first.id, 'x2', 50));
ok(CollectionSystem.owned(save) === startOwned + 1, 'two copies of one character count once');
ok(CollectionSystem.byRarity(save).reduce((a, g) => a + g.total, 0) === total && CollectionSystem.byRarity(save).reduce((a, g) => a + g.owned, 0) === CollectionSystem.owned(save), 'the rarity rows add up to the whole');

// not reached
ok(CollectionSystem.claim(save, ms[ms.length - 1].count) === null, 'the whole-book reward cannot be taken early');
ok(CollectionSystem.claim(save, 12345) === null, 'a count that is not a milestone gives nothing');

// reach the first milestone
for (const def of HERO_ROSTER) if (!save.heroes.some((h) => h.heroId === def.id) && CollectionSystem.owned(save) < ms[0].count) save.heroes.push(createHeroInstance(def.id, `y-${def.id}`, 1));
ok(CollectionSystem.owned(save) >= ms[0].count, 'the first milestone is reached');
ok(CollectionSystem.claimable(save) >= 1, 'it shows as claimable');
const gemsBefore = save.gems;
const granted = CollectionSystem.claim(save, ms[0].count);
ok(!!granted && granted.length === ms[0].rewards.length, 'claiming gives the listed rewards');
ok(save.gems === gemsBefore + (ms[0].rewards.find((r) => r.type === 'gems')?.amount ?? 0), 'the gems are paid');
ok(CollectionSystem.claim(save, ms[0].count) === null, 'a milestone pays once');
ok(CollectionSystem.state(save, ms[0]) === 'claimed', 'it shows as claimed');

// the whole book
for (const def of HERO_ROSTER) if (!save.heroes.some((h) => h.heroId === def.id)) save.heroes.push(createHeroInstance(def.id, `z-${def.id}`, 1));
ok(CollectionSystem.owned(save) === total, 'every character held');
let paid = 0;
for (const m of ms) if (CollectionSystem.claim(save, m.count)) paid++;
ok(paid === ms.length - 1, 'every other milestone can now be taken once');
ok(CollectionSystem.claimable(save) === 0, 'nothing is left to take');

// the save keeps it
const reloaded = JSON.parse(JSON.stringify(save));
ok(Array.isArray(reloaded.collection.claimed) && reloaded.collection.claimed.length === ms.length, 'the taken milestones are in the saved data');

if (failures) process.exit(1);
