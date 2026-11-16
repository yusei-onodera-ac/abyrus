// フェーズ: the nearer MAX_PHASE, the more フェーズ素材 and the more copies one phase takes.
import { PHASE_FUSION_COPIES, PHASE_MATERIAL_COST, phaseFusionCopies, phaseMaterialCost, phaseTotalCost } from '../../src/game/data/phaseCost';
import { createHeroInstance } from '../../src/game/data/heroes';
import { SaveSystem, type SaveData } from '../../src/game/systems/SaveSystem';
import { MAX_PHASE, type HeroData } from '../../src/game/types';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// ---- the tables
ok(PHASE_MATERIAL_COST.length === MAX_PHASE - 1 && PHASE_FUSION_COPIES.length === MAX_PHASE - 1, 'one entry for each step from phase 1 to MAX_PHASE');
ok(PHASE_MATERIAL_COST.every((c, i, a) => c >= 1 && (i === 0 || c >= a[i - 1])), 'the material cost never falls as the phase rises');
ok(PHASE_FUSION_COPIES.every((c, i, a) => c >= 1 && (i === 0 || c >= a[i - 1])), 'neither does the number of copies');
ok(phaseMaterialCost(MAX_PHASE - 1) > phaseMaterialCost(1) && phaseFusionCopies(MAX_PHASE - 1) > phaseFusionCopies(1), 'the last step costs more than the first (both ways)');
ok(phaseMaterialCost(1) === 1 && phaseFusionCopies(1) === 1, 'the first step is cheap: 1 material, 1 copy');
ok(phaseMaterialCost(0) === phaseMaterialCost(1) && phaseMaterialCost(99) === PHASE_MATERIAL_COST[PHASE_MATERIAL_COST.length - 1], 'a phase outside the table uses the nearest entry');
const total = phaseTotalCost(1);
ok(total.materials === PHASE_MATERIAL_COST.reduce((a, b) => a + b, 0) && total.copies === PHASE_FUSION_COPIES.reduce((a, b) => a + b, 0), 'the total is the sum of the steps');
ok(phaseTotalCost(MAX_PHASE).materials === 0 && phaseTotalCost(MAX_PHASE).copies === 0, 'nothing left at MAX_PHASE');

function fresh(): SaveData {
  return SaveSystem.createDefault();
}
function hero(save: SaveData, heroId: string, id: string, phase = 1): HeroData {
  const h = createHeroInstance(heroId, id, 10);
  h.phase = phase;
  save.heroes.push(h);
  return h;
}

// ---- フェーズ素材
{
  const save = fresh();
  const h = hero(save, 'gauss', 'p1');
  h.phase = 5;
  const cost = phaseMaterialCost(5);
  save.phaseMaterials = cost - 1;
  ok(!SaveSystem.usePhaseMaterial(save, h.id) && h.phase === 5 && save.phaseMaterials === cost - 1, 'one short of the cost: nothing happens, nothing is spent');
  save.phaseMaterials = cost + 2;
  ok(SaveSystem.usePhaseMaterial(save, h.id) && h.phase === 6 && save.phaseMaterials === 2, `phase 5 -> 6 takes exactly ${cost} materials`);
  h.phase = MAX_PHASE - 1;
  save.phaseMaterials = 100;
  const last = phaseMaterialCost(MAX_PHASE - 1);
  ok(SaveSystem.usePhaseMaterial(save, h.id) && h.phase === MAX_PHASE && save.phaseMaterials === 100 - last, `the last step takes ${last}`);
  ok(!SaveSystem.usePhaseMaterial(save, h.id) && save.phaseMaterials === 100 - last, 'at MAX_PHASE nothing more can be raised');
}

// ---- 合成
{
  const save = fresh();
  const base = hero(save, 'aria', 'f-base');
  const a = hero(save, 'aria', 'f-a');
  const b = hero(save, 'aria', 'f-b');
  const other = hero(save, 'gauss', 'f-other');
  ok(SaveSystem.fuseHero(save, base.id, [a.id]) && base.phase === 2 && !save.heroes.some((h) => h.id === a.id), 'phase 1 -> 2: one copy, and it is gone');
  base.phase = 5;
  const need = phaseFusionCopies(5);
  ok(need === 2, 'phase 5 -> 6 takes 2 copies');
  ok(!SaveSystem.fuseHero(save, base.id, [b.id]) && base.phase === 5 && save.heroes.some((h) => h.id === b.id), 'one copy is not enough: nothing happens, the copy stays');
  ok(!SaveSystem.fuseHero(save, base.id, [b.id, other.id]) && base.phase === 5, 'a copy of another character does not count');
  ok(!SaveSystem.fuseHero(save, base.id, [b.id, b.id]) && base.phase === 5, 'the same copy twice is one copy');
  ok(!SaveSystem.fuseHero(save, base.id, [b.id, base.id]) && base.phase === 5, 'the hero itself is not a material');
  const c = hero(save, 'aria', 'f-c');
  ok(SaveSystem.fuseHero(save, base.id, [b.id, c.id]) && base.phase === 6, 'with two copies it goes up one phase');
  ok(!save.heroes.some((h) => h.id === b.id || h.id === c.id) && save.heroes.some((h) => h.id === other.id), 'both copies are gone, the other character stays');
  // more copies than needed: only what the phase takes is used
  base.phase = 2;
  const d1 = hero(save, 'aria', 'g1');
  const d2 = hero(save, 'aria', 'g2');
  ok(SaveSystem.fuseHero(save, base.id, [d1.id, d2.id]) && base.phase === 3 && save.heroes.some((h) => h.id === d2.id), 'with a spare copy, only the first is used when one is enough');
}

// ---- a used copy standing in a deck is replaced by the base; worn gear returns to the bag
{
  const save = fresh();
  const base = hero(save, 'ren', 'd-base');
  base.phase = 8;
  const a = hero(save, 'ren', 'd-a');
  const b = hero(save, 'ren', 'd-b');
  const c = hero(save, 'ren', 'd-c');
  SaveSystem.setDeckSlot(save, save.activeDeck, 'front', 0, a.id);
  SaveSystem.setDeckSlot(save, save.activeDeck, 'front', 1, b.id);
  save.homeHeroId = b.id;
  ok(phaseFusionCopies(8) === 3, 'phase 8 -> 9 takes 3 copies');
  ok(SaveSystem.fuseHero(save, base.id, [a.id, b.id, c.id]) && base.phase === 9, 'fused');
  const deck = save.decks[save.activeDeck];
  const slots = [...deck.front, ...deck.back];
  ok(slots.filter((id) => id === base.id).length === 1, 'the base stands in the deck exactly once (a deck holds one copy of a character)');
  ok(!slots.includes(a.id) && !slots.includes(b.id), 'no used copy is left in the deck');
  ok(save.homeHeroId === base.id, 'the Home hero carries on as the base');
}

// ---- the whole way up
{
  const save = fresh();
  const base = hero(save, 'zeno', 'w-base');
  let copies = 0;
  while (base.phase < MAX_PHASE) {
    const need = phaseFusionCopies(base.phase);
    const mats = Array.from({ length: need }, (_, i) => hero(save, 'zeno', `w-${copies + i}`));
    copies += need;
    if (!SaveSystem.fuseHero(save, base.id, mats.map((m) => m.id))) break;
  }
  ok(base.phase === MAX_PHASE && copies === phaseTotalCost(1).copies, `1 -> ${MAX_PHASE} by copies takes exactly ${phaseTotalCost(1).copies}`);
  const save2 = fresh();
  const h2 = hero(save2, 'zeno', 'm-base');
  save2.phaseMaterials = phaseTotalCost(1).materials;
  while (h2.phase < MAX_PHASE && SaveSystem.usePhaseMaterial(save2, h2.id));
  ok(h2.phase === MAX_PHASE && save2.phaseMaterials === 0, `1 -> ${MAX_PHASE} by materials takes exactly ${phaseTotalCost(1).materials}`);
}

if (failures) process.exit(1);
