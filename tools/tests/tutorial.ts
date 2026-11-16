// チュートリアル: the main track and the short 村 track after it.
import { TUTORIAL_STEPS, VILLAGE_TUTORIAL_REWARD, VILLAGE_TUTORIAL_STEPS } from '../../src/game/data/tutorial';
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { TutorialSystem } from '../../src/game/systems/TutorialSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// ---- the steps
ok(VILLAGE_TUTORIAL_STEPS.length >= 8 && VILLAGE_TUTORIAL_STEPS.every((s) => s.scene === 'Village'), 'the village steps all run on the village screen');
ok(VILLAGE_TUTORIAL_STEPS.every((s) => s.advance === 'tap'), 'every village step is a tap step (the lit spots are shown, not pressed)');
const ids = [...TUTORIAL_STEPS, ...VILLAGE_TUTORIAL_STEPS].map((s) => s.id);
ok(new Set(ids).size === ids.length, 'every step id is unique (it is also the name of its voice file)');
ok(VILLAGE_TUTORIAL_STEPS.every((s) => s.lines.length > 0 && s.lines.every((l) => l.length > 5)), 'every step says something');
ok(VILLAGE_TUTORIAL_STEPS.every((s) => !s.target || (s.target.x >= 0 && s.target.y >= 0 && s.target.x + s.target.w <= 720 && s.target.y + s.target.h <= 1280)), 'every lit spot is inside the screen');
ok(VILLAGE_TUTORIAL_REWARD.length > 0, 'finishing pays something');

// ---- a new player: the main tutorial first, then the village's
{
  const save: SaveData = SaveSystem.createDefault();
  ok(TutorialSystem.active(save)?.id === TUTORIAL_STEPS[0].id, 'a new player is shown the main tutorial first');
  ok(TutorialSystem.currentVillage(save) === null, 'the village tutorial waits while the main one is going');
  let last: 'main' | 'village' | null = null;
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) last = TutorialSystem.advance(save);
  ok(last === 'main' && save.tutorial.done, 'the last main step finishes the main tutorial');
  ok(TutorialSystem.current(save) === null, 'the main track has nothing left (so Home may hand out the login bonus)');
  ok(TutorialSystem.active(save)?.id === VILLAGE_TUTORIAL_STEPS[0].id, 'and the village track is due next');
  for (let i = 0; i < VILLAGE_TUTORIAL_STEPS.length - 1; i++) ok(TutorialSystem.advance(save) === null, `village step ${i + 1} advances without finishing`);
  ok(TutorialSystem.advance(save) === 'village' && save.tutorial.village.done, 'the last village step finishes the village track');
  ok(TutorialSystem.active(save) === null, 'nothing is due after both');
  ok(TutorialSystem.advance(save) === null, 'advancing past the end does nothing');
}

// ---- skipping skips the track that is on
{
  const save = SaveSystem.createDefault();
  TutorialSystem.skip(save);
  ok(save.tutorial.done && !save.tutorial.village.done, 'skipping the main tutorial leaves the village one to come');
  TutorialSystem.advance(save);
  TutorialSystem.skip(save);
  ok(save.tutorial.village.done && TutorialSystem.active(save) === null, 'skipping the village tutorial ends it');
}

// ---- restart (development)
{
  const save = SaveSystem.createDefault();
  TutorialSystem.skip(save);
  TutorialSystem.skip(save);
  TutorialSystem.restart(save);
  ok(!save.tutorial.done && !save.tutorial.village.done && save.tutorial.step === 0 && save.tutorial.village.step === 0, 'restart resets both tracks');
}

// ---- old saves
{
  // a save from before the village tutorial existed: nothing in `tutorial.village`
  const save = SaveSystem.createDefault();
  save.tutorial = { opening: true, step: 0, done: true } as unknown as SaveData['tutorial'];
  const loaded = JSON.parse(JSON.stringify(save));
  ok(loaded.tutorial.village === undefined, 'sanity: an old save has no village record');
}

if (failures) process.exit(1);
