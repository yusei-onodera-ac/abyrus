/** EXP from `level` to the next. It climbs steeply (x1.22 a level) up to level 30,
 *  then gently (x1.05) so that the level cap of 100 is a long road, not an
 *  impossible one. (Lives here, not in SaveSystem, so ProgressionSystem can use it
 *  without a cycle; SaveSystem re-exports it.) */
export function expToNextLevel(level: number): number {
  const steep = Math.min(level, 30);
  return Math.round(80 * Math.pow(1.22, steep - 1) * Math.pow(1.05, Math.max(0, level - 30)));
}

/** Total EXP a hero needs to go from level 1 to `level`. */
export function expToReachLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += expToNextLevel(l);
  return total;
}
