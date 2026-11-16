/**
 * プレイヤーレベル (the number in the top bar). Plain numbers, placeholder balance.
 *
 * Playing the quest earns it: winning a stage gives as much player EXP as the
 * stamina that stage cost. Each level up refills stamina, raises its maximum
 * and pays 魔晶石.
 */
export const MAX_PLAYER_LEVEL = 100;

/** Player EXP from `level` to the next: gentle, so early levels come in a few stages. */
export function playerExpToNext(level: number): number {
  return 8 + 3 * level;
}

/** Highest stamina at `level`: 50 at the start, +1 every two levels (100 at the cap). */
export function staminaMaxFor(level: number): number {
  return 50 + Math.floor(level / 2);
}

/** 魔晶石 handed over on reaching `level`: a few every level, a bonus every tenth. */
export function levelUpGems(level: number): number {
  return level % 10 === 0 ? 50 : 10;
}
