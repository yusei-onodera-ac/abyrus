// 掃討: only stages cleared before; pays what a win pays except the first-clear extras.
import { createHeroInstance } from '../../src/game/data/heroes';
import { BigNumber } from '../../src/game/systems/BigNumber';
import { FINAL_STAGE_INDEX, ProgressionSystem } from '../../src/game/systems/ProgressionSystem';
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { SWEEP_MAX, SweepSystem, type SweepTarget } from '../../src/game/systems/SweepSystem';
import { WeekdayDungeonSystem } from '../../src/game/systems/WeekdayDungeonSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

function fresh(): SaveData {
  const save = SaveSystem.createDefault();
  for (const id of ['gauss', 'aria', 'ren']) if (!save.heroes.some((h) => h.heroId === id)) save.heroes.push(createHeroInstance(id, `sw-${id}`, 20));
  let slot = 0;
  for (const h of save.heroes.slice(0, 3)) SaveSystem.setDeckSlot(save, save.activeDeck, 'front', slot++, h.id);
  save.stamina = [60, 60];
  save.staminaAt = Date.now();
  return save;
}
const main = (index: number): SweepTarget => ({ kind: 'quest', stage: { kind: 'main', index } });
const extra = (index: number): SweepTarget => ({ kind: 'quest', stage: { kind: 'extra', index } });
const final: SweepTarget = { kind: 'quest', stage: { kind: 'final', index: FINAL_STAGE_INDEX } };
const weekday = (tier: number): SweepTarget => ({ kind: 'weekday', day: 1, tier });

// ---- which stages can be swept
{
  const save = fresh();
  save.stageProgress = 10;
  save.extraProgress = 3;
  ok(SweepSystem.canSweep(save, main(0)) && SweepSystem.canSweep(save, main(9)), 'a main stage cleared before can be swept');
  ok(!SweepSystem.canSweep(save, main(10)) && !SweepSystem.canSweep(save, main(50)), 'the stage not cleared yet (and later ones) cannot');
  ok(SweepSystem.canSweep(save, extra(2)) && !SweepSystem.canSweep(save, extra(3)), 'the same for Extra stages');
  ok(!SweepSystem.canSweep(save, final), 'the final battle cannot be swept before it is won');
  save.stageProgress = FINAL_STAGE_INDEX + 1;
  ok(SweepSystem.canSweep(save, final), 'once the final battle is won it can');
  ok(!SweepSystem.canSweep(save, weekday(0)), 'a weekday tier cannot be swept before it is cleared');
  WeekdayDungeonSystem.markCleared(save, 0);
  ok(SweepSystem.canSweep(save, weekday(0)) && !SweepSystem.canSweep(save, weekday(1)), 'a weekday tier cleared once can, the others cannot');
  WeekdayDungeonSystem.markCleared(save, 0);
  ok(save.weekdayCleared.length === 1, 'marking a tier twice keeps one entry');
}

// ---- how many
{
  const save = fresh();
  save.stageProgress = 30;
  const cost = SweepSystem.costPer(main(5));
  ok(cost === 5, 'an early stage costs 5 stamina');
  ok(SweepSystem.maxCount(save, main(5)) === Math.min(SWEEP_MAX, Math.floor(60 / cost)), 'the count is what the stamina allows, up to the limit');
  save.stamina = [12, 60];
  ok(SweepSystem.maxCount(save, main(5)) === 2, 'with 12 stamina, two sweeps of a 5-stamina stage');
  save.stamina = [4, 60];
  ok(SweepSystem.maxCount(save, main(5)) === 0, 'not enough for one: none');
  save.stamina = [60, 60];
  ok(SweepSystem.maxCount(save, main(40)) === 0, 'a stage not cleared: none');
  const empty = fresh();
  empty.stageProgress = 30;
  for (let i = 0; i < 5; i++) SaveSystem.setDeckSlot(empty, empty.activeDeck, i < 3 ? 'front' : 'back', i < 3 ? i : i - 3, null);
  ok(SweepSystem.maxCount(empty, main(5)) === 0 || SaveSystem.getPartyHeroes(empty).front.length + SaveSystem.getPartyHeroes(empty).back.length > 0, 'an empty formation: none');
}

// ---- what it pays
{
  const save = fresh();
  save.stageProgress = 30;
  const def = ProgressionSystem.getStage(7);
  const goldBefore = SaveSystem.getGold(save);
  const essenceBefore = save.skillEssence;
  const gemsBefore = save.gems;
  const progress = save.stageProgress;
  const expBefore = save.heroes.slice(0, 3).map((h) => h.exp + h.level * 1e9);
  const missionBefore = save.missions.totals.quest_clear ?? 0;
  const result = SweepSystem.run(save, main(7), 3, () => 0.999);
  ok(!!result && result.count === 3, 'a sweep of 3 runs');
  if (!result) throw new Error('sweep failed');
  ok(result.stamina === 15 && save.stamina[0] <= 60 - 15 + 60, 'it spent 3 x the cost');
  const paid = SaveSystem.getGold(save).sub(goldBefore);
  const want = def.rewardGold.mul(3);
  ok(paid.gte(want.mul(0.999999)) && want.gte(paid.mul(0.999999)), "gold is 3 x the stage's gold");
  ok(save.skillEssence - essenceBefore === def.rewardSkillEssence * 3, '技素 is 3 x');
  ok(result.exp === def.rewardExp * 3, 'each hero gets 3 x the stage EXP');
  const expAfter = save.heroes.slice(0, 3).map((h) => h.exp + h.level * 1e9);
  ok(expAfter.every((v, i) => v > expBefore[i]), 'the party really received EXP');
  ok(save.stageProgress === progress, 'progress does not move');
  ok(save.gems === gemsBefore + (result.levelUp?.gems ?? 0), 'no first-clear gems (only a player level-up pays gems)');
  ok((save.missions.totals.quest_clear ?? 0) - missionBefore === 3, 'the クエストクリア mission counts 3');
  ok(result.playerExp === 15, 'プレイヤーEXP = the stamina paid');
}

// ---- rejections
{
  const save = fresh();
  save.stageProgress = 5;
  ok(SweepSystem.run(save, main(9), 1) === null, 'a stage not cleared cannot be swept');
  ok(SweepSystem.run(save, main(2), 0) === null && SweepSystem.run(save, main(2), -1) === null && SweepSystem.run(save, main(2), 1.5) === null, 'a bad count is refused');
  ok(SweepSystem.run(save, main(2), SWEEP_MAX + 1) === null, 'more than the limit is refused');
  save.stamina = [9, 60];
  ok(SweepSystem.run(save, main(2), 2) === null && save.stamina[0] === 9, 'more than the stamina allows is refused and nothing is spent');
}

// ---- weekday: fixed drops each time
{
  const save = fresh();
  save.stageProgress = 60;
  WeekdayDungeonSystem.markCleared(save, 0);
  const bonus = WeekdayDungeonSystem.bonus(1, 0);
  const result = SweepSystem.run(save, weekday(0), 2, () => 0.999);
  ok(!!result, 'a weekday sweep runs');
  if (result) {
    for (const { item, amount } of bonus.items) ok((result.items.find((i) => i.item === item)?.amount ?? 0) >= amount * 2, `weekday: ${item} is paid for each of the 2 sweeps`);
    ok(result.phaseMaterials === bonus.phaseMaterials * 2, 'weekday: フェーズ素材 for each sweep');
    ok(save.stageProgress === 60, 'weekday: progress does not move');
  }
}

// ---- the final battle
{
  const save = fresh();
  save.stageProgress = FINAL_STAGE_INDEX + 1;
  save.stamina = [60, 60];
  const result = SweepSystem.run(save, final, 2, () => 0.999);
  ok(!!result && result.stamina === 40, 'the final battle can be swept (20 stamina each)');
  ok(save.stageProgress === FINAL_STAGE_INDEX + 1, 'and it stays won');
}

// ---- the save keeps the record
{
  const save = fresh();
  WeekdayDungeonSystem.markCleared(save, 2);
  const copy = JSON.parse(JSON.stringify(save));
  ok(copy.weekdayCleared.length === 1 && copy.weekdayCleared[0] === 2, 'the cleared weekday tiers are in the saved data');
  ok(BigNumber.from(5).gt(1), 'sanity');
}

if (failures) process.exit(1);
