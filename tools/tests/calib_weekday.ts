import { BattleEngine, BattleSystem } from '../../src/game/systems/BattleSystem';
import { ProgressionSystem } from '../../src/game/systems/ProgressionSystem';
import { createHeroInstance } from '../../src/game/data/heroes';

function run(ids: string[], level: number, skill: number, day: number, tier: number, runs: number, diff?: number): string {
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const stage = ProgressionSystem.getWeekdayStage(day, tier);
    const players = ids.map((id, k) => {
      const h = createHeroInstance(id, `p${k}`, level);
      h.skillLevels = [skill, skill, skill, skill];
      return BattleSystem.createPlayerUnit(h, k < 3 ? 'front' : 'back', k < 3 ? k : k - 3);
    });
    const enemies = stage.enemies.map((d, k) => BattleSystem.createEnemyUnit(d, diff ?? stage.difficulty, k < 3 ? 'front' : 'back', k < 3 ? k : k - 3));
    const engine = new BattleEngine(players, enemies);
    let t = 0;
    while (!engine.isOver() && t < 600000) {
      engine.update(50);
      t += 50;
      for (const u of engine.playerUnits) if (u.alive && u.ultGauge >= 100 && u.skills.length > 0) engine.triggerUlt(u.id);
    }
    if (engine.enemyUnits.every((u) => !u.alive)) wins++;
  }
  return `${Math.round((100 * wins) / runs)}%`;
}
const star5 = ['gauss', 'zeno', 'viara', 'aria', 'astra'];
const star4 = ['baron', 'ren', 'suzuna', 'dias', 'sylva'];
for (const day of [0, 3, 5]) {
  const st = ProgressionSystem.getWeekdayStage(day, 3);
  console.log(`day ${day} ${st.name} | d=${st.difficulty} | ★5 Lv100 skill5 ${run(star5, 100, 5, day, 3, 150)}  skill10 ${run(star5, 100, 10, day, 3, 150)}  skill1 ${run(star5, 100, 1, day, 3, 150)}  Lv95 ${run(star5, 95, 5, day, 3, 150)}  ★4 Lv100 ${run(star4, 100, 10, day, 3, 150)}`);
}
