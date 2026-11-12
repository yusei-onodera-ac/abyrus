// 無限モード: a run can be saved in the middle and picked up again exactly where it was.
import { InfiniteRunEngine, readSuspendedRun, describeSuspendedRun } from '../../src/game/systems/InfiniteModeSystem';
import { createHeroInstance } from '../../src/game/data/heroes';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const heroes = ['gauss', 'ember', 'lumi', 'viara', 'ren'].map((id, i) => createHeroInstance(id, `h${i}`, 30 + i));
const engine = new InfiniteRunEngine({ front: heroes.slice(0, 3), back: heroes.slice(3) });
// 25 simulated seconds, using a skill whenever one is ready
for (let t = 0; t < 25000; t += 50) {
  engine.update(50);
  for (const u of engine.playerUnits) if (u.alive && u.ultGauge >= 100 && u.skills.length > 0) engine.triggerUlt(u.id);
}
const before = engine.getSnapshot();
const json = JSON.stringify(engine.serialize());
ok(before.survivalSeconds > 20, `the run has been going on (${before.survivalSeconds.toFixed(1)} s, ${before.enemiesDefeated} kills)`);

const parsed = JSON.parse(json);
const valid = readSuspendedRun(parsed);
ok(!!valid && !!describeSuspendedRun(valid), 'a saved run reads back as valid and can be described');
const byId = new Map(heroes.map((h) => [h.id, h]));
const restored = InfiniteRunEngine.restore(parsed, (id) => byId.get(id));
ok(!!restored, 'the run restores');
if (!restored) throw new Error('restore failed');
ok(JSON.stringify(before) === JSON.stringify(restored.getSnapshot()), 'the score, time and kills are the same after restoring');
let same = true;
engine.playerUnits.forEach((u, i) => {
  const r = restored.playerUnits[i];
  if (u.hp.toString() !== r.hp.toString() || u.alive !== r.alive || u.ultGauge !== r.ultGauge || u.cooldown !== r.cooldown || u.skills.length !== r.skills.length || u.nextSkillIndex !== r.nextSkillIndex) same = false;
});
ok(same, 'every hero has the same HP, gauge, cooldown and skills');
const slots = (e: InfiniteRunEngine) => e.getEnemySlots().map((s) => (s.unit && s.unit.alive ? `${s.unit.name}:${s.unit.hp.toString()}` : '-')).join(' | ');
ok(slots(engine) === slots(restored), 'the enemies on the field are the same');

// the restored run goes on: another 20 seconds without errors, time keeps counting from where it was
for (let t = 0; t < 20000; t += 50) restored.update(50);
ok(restored.getSnapshot().survivalSeconds > before.survivalSeconds + 15, 'the restored run carries on from where it was');

// damaged saves are refused, a missing hero refuses the run
ok(readSuspendedRun({ version: 1 }) === null && readSuspendedRun(null) === null && readSuspendedRun('x') === null, 'garbage is not a saved run');
const broken = JSON.parse(json);
broken.players[0].hp = { m: 'x', e: 1 };
ok(readSuspendedRun(broken) === null, 'a saved run with a broken HP is refused');
ok(InfiniteRunEngine.restore(parsed, (id) => (id === 'h2' ? undefined : byId.get(id))) === null, 'a missing hero refuses the run');

if (failures) process.exit(1);
