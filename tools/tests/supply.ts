// Runs 朝夕の補給 (SupplySystem) against a real SaveData, without a browser. Bundled with rolldown (see build.mjs).
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { SupplySystem } from '../../src/game/systems/SupplySystem';
import { SUPPLY_SLOTS, SUPPLY_BOTH_BONUS, getSupplySlot } from '../../src/game/data/supply';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;

/** A local time on 2027-01-05 (or `d` days later). */
const at = (h: number, m = 0, d = 0): number => new Date(2027, 0, 5 + d, h, m).getTime();
const morning = getSupplySlot('morning')!;
const evening = getSupplySlot('evening')!;
const fresh = (): SaveData => {
  const s = SaveSystem.createDefault();
  s.stamina = [10, 50];
  s.staminaAt = at(7);
  return s;
};

// ---- data
ok(SUPPLY_SLOTS.length === 2 && morning.startHour < morning.endHour && morning.endHour <= evening.startHour && evening.endHour <= 24, 'two slots, in order, not overlapping, inside one day');
ok(SUPPLY_SLOTS.every((s) => s.rewards.length > 0 && s.rewards.every((r) => r.amount > 0)), 'every slot gives something');
ok(SUPPLY_BOTH_BONUS.length > 0, 'there is a bonus for taking both');
ok(getSupplySlot('nope') === undefined, 'an unknown slot is not found');

// ---- the clock
const s0 = fresh();
ok(SupplySystem.state(s0, morning, at(5, 59)) === 'upcoming' && SupplySystem.state(s0, evening, at(5, 59)) === 'upcoming', '05:59: both still to come');
ok(SupplySystem.state(s0, morning, at(6, 0)) === 'open', '06:00: the morning opens');
ok(SupplySystem.state(s0, morning, at(13, 59)) === 'open', '13:59: still open');
ok(SupplySystem.state(s0, morning, at(14, 0)) === 'missed', '14:00: it has gone by');
ok(SupplySystem.state(s0, evening, at(17, 59)) === 'upcoming' && SupplySystem.state(s0, evening, at(18, 0)) === 'open', 'the evening opens at 18:00');
ok(SupplySystem.state(s0, evening, at(23, 59)) === 'open', '23:59: the evening is still open');
ok(SupplySystem.state(s0, evening, at(0, 0, 1)) === 'upcoming' && SupplySystem.state(s0, morning, at(0, 0, 1)) === 'upcoming', 'after midnight it is a new day');
ok(SupplySystem.openCount(s0, at(3)) === 0 && SupplySystem.openCount(s0, at(7)) === 1 && SupplySystem.openCount(s0, at(15)) === 0 && SupplySystem.openCount(s0, at(19)) === 1, 'how many can be taken: 0 / 1 / 0 / 1 through the day');

// ---- what comes next
const n1 = SupplySystem.next(s0, at(5))!;
ok(n1.slot.id === 'morning' && n1.state === 'upcoming' && n1.seconds === 3600, 'at 05:00 the morning is an hour away');
const n2 = SupplySystem.next(s0, at(7))!;
ok(n2.slot.id === 'morning' && n2.state === 'open' && n2.seconds === 7 * 3600, 'at 07:00 the morning is open for 7 more hours');
const n3 = SupplySystem.next(s0, at(15))!;
ok(n3.slot.id === 'evening' && n3.state === 'upcoming' && n3.seconds === 3 * 3600, 'at 15:00 (morning missed) the evening is 3 hours away');
ok(SupplySystem.next(s0, at(23, 59)) !== null && SupplySystem.next(s0, at(23, 59))!.state === 'open', 'late evening: the evening is still the thing to take');
ok(SupplySystem.secondsUntilOpen(morning, at(20)) === 10 * 3600, 'at 20:00 tomorrow morning is 10 hours away');
ok(SupplySystem.secondsUntilOpen(morning, at(7)) === 0, 'an open slot is 0 seconds away');

// ---- taking one
const s1 = fresh();
ok(SupplySystem.check(s1, morning, at(5)) === 'まだ受け取れる時間ではありません' && SupplySystem.claim(s1, 'morning', at(5)) === null, 'not before it opens');
ok(s1.stamina[0] === 10 && s1.gems === SaveSystem.createDefault().gems, 'nothing changed by the refused attempt');
const gems0 = s1.gems;
const exp0 = SaveSystem.getItem(s1, 'exp_m');
const c1 = SupplySystem.claim(s1, 'morning', at(7))!;
ok(!!c1 && c1.slot.id === 'morning' && c1.granted.length === 3 && c1.bonus.length === 0, 'the morning slot pays its three things and no bonus yet');
ok(s1.stamina[0] === 40, `stamina 10 -> 40 (${s1.stamina[0]})`);
ok(s1.gems === gems0 + 10 && SaveSystem.getItem(s1, 'exp_m') === exp0 + 3, '魔晶石 +10 and 経験値素材(中) +3');
ok(SupplySystem.state(s1, morning, at(8)) === 'claimed' && SupplySystem.check(s1, morning, at(8)) === '受け取り済みです', 'taken: it says so');
const gemsAfter = s1.gems;
ok(SupplySystem.claim(s1, 'morning', at(8)) === null && s1.gems === gemsAfter && s1.stamina[0] === 40, 'it cannot be taken twice');
ok(SupplySystem.claimedToday(s1, at(9)).join() === 'morning' && !SupplySystem.bonusTaken(s1, at(9)), 'today: morning taken, no bonus');
ok(SupplySystem.claim(s1, 'evening', at(9)) === null, 'the evening is not open at 09:00');
ok(SupplySystem.claim(s1, 'unknown', at(9)) === null, 'an unknown slot is refused');

// ---- taking both pays the bonus
const ess0 = s1.skillEssence;
const gemsBefore2 = s1.gems;
const eq0 = SaveSystem.getItem(s1, 'equip_essence');
const c2 = SupplySystem.claim(s1, 'evening', at(19))!;
ok(!!c2 && c2.bonus.length === SUPPLY_BOTH_BONUS.length, 'the evening slot completes the day: the bonus comes with it');
ok(s1.skillEssence === ess0 + 50 && s1.gems === gemsBefore2 + 10 + 20 && SaveSystem.getItem(s1, 'equip_essence') === eq0 + 20, '技素 +50, 魔晶石 +10 +20, 装備強化素材 +20');
ok(SupplySystem.allTaken(s1, at(20)) && SupplySystem.bonusTaken(s1, at(20)), 'the day is complete');
ok(SupplySystem.next(s1, at(20)) === null && SupplySystem.openCount(s1, at(20)) === 0, 'nothing left today');
const g3 = s1.gems;
ok(SupplySystem.claim(s1, 'evening', at(21)) === null && SupplySystem.claim(s1, 'morning', at(21)) === null && s1.gems === g3, 'neither can be taken again');
// The same order the other way round: evening first would not be possible in the morning, but taking the morning late works
const sLate = fresh();
ok(!!SupplySystem.claim(sLate, 'morning', at(13, 59)), 'the morning can be taken until the last minute');
const cLate = SupplySystem.claim(sLate, 'evening', at(23, 59))!;
ok(cLate.bonus.length > 0, 'and the evening until the last minute; both -> bonus');

// ---- the next day starts clean
ok(SupplySystem.claimedToday(s1, at(7, 0, 1)).length === 0 && !SupplySystem.bonusTaken(s1, at(7, 0, 1)), 'the next day nothing is taken and the bonus is open again');
const g4 = s1.gems;
const d2 = SupplySystem.claim(s1, 'morning', at(7, 0, 1))!;
ok(!!d2 && s1.gems === g4 + 10 && s1.supply.day.endsWith('-06') && s1.supply.claimed.join() === 'morning' && s1.supply.bonus === false, 'taking on the next day starts a new record');

// ---- a missed slot costs the bonus
const sMiss = fresh();
ok(SupplySystem.bonusReachable(sMiss, at(12)) && !SupplySystem.bonusReachable(sMiss, at(15)), 'the bonus is reachable until a slot is missed');
const cMiss = SupplySystem.claim(sMiss, 'evening', at(19))!;
ok(!!cMiss && cMiss.bonus.length === 0 && !SupplySystem.allTaken(sMiss, at(19)) && !SupplySystem.bonusTaken(sMiss, at(19)), 'with the morning missed, the evening pays no bonus');
ok(SupplySystem.claim(sMiss, 'morning', at(19)) === null, 'and the morning cannot be taken after its time');
ok(SupplySystem.check(sMiss, morning, at(19)) === '受け取れる時間が過ぎました', 'it says the time has gone by');

// ---- saving
const sv = fresh();
SupplySystem.claim(sv, 'morning', at(7));
SaveSystem.save(sv);
const back = SaveSystem.load();
ok(back.supply.day === sv.supply.day && back.supply.claimed.join() === 'morning' && back.supply.bonus === false, 'a saved record loads back');
ok(SaveSystem.createDefault().supply.day === '' && SaveSystem.createDefault().supply.claimed.length === 0, 'a new save starts with nothing taken');
store.set('abyrus_save_v1', JSON.stringify({ ...JSON.parse(JSON.stringify(sv)), supply: { day: 5, claimed: ['morning', 'morning', 'x', 3, 'evening'], bonus: 'yes' } }));
const junk = SaveSystem.load();
ok(junk.supply.day === '' && junk.supply.claimed.join() === 'morning,evening' && junk.supply.bonus === false, 'a damaged record is cleaned up (bad day, duplicates, unknown slots, bad flag)');
const old = JSON.parse(JSON.stringify(sv));
delete old.supply;
store.set('abyrus_save_v1', JSON.stringify(old));
const noField = SaveSystem.load();
ok(noField.supply.day === '' && noField.supply.claimed.length === 0 && noField.supply.bonus === false, 'a save from before 補給 gets an empty record');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
