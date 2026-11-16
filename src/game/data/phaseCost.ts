import { MAX_PHASE } from '../types';

/**
 * フェーズを上げるのに要るもの。10に近づくほど、増える。
 *
 *  - フェーズ素材: フェーズ p → p+1 に、`PHASE_MATERIAL_COST[p - 1]` 個。
 *  - 合成: フェーズ p → p+1 に、同じキャラの個体が `PHASE_FUSION_COPIES[p - 1]` 体 (素材にした個体は消える)。
 *
 * 1〜MAX_PHASE-1 のそれぞれに1つずつ (9つ)。数字は仮のバランス: ここだけを直せばよい。
 */
export const PHASE_MATERIAL_COST: readonly number[] = [1, 1, 2, 2, 3, 4, 5, 6, 8];
export const PHASE_FUSION_COPIES: readonly number[] = [1, 1, 1, 1, 2, 2, 2, 3, 3];

function at(table: readonly number[], phase: number): number {
  const i = Math.max(0, Math.min(table.length - 1, Math.floor(phase) - 1));
  return table[i];
}

/** フェーズ素材 needed to raise a hero at `phase` by one (the last entry for a phase beyond the table). */
export function phaseMaterialCost(phase: number): number {
  return at(PHASE_MATERIAL_COST, phase);
}

/** Copies of the same character a 合成 takes to raise a hero at `phase` by one. */
export function phaseFusionCopies(phase: number): number {
  return at(PHASE_FUSION_COPIES, phase);
}

/** Everything it takes to go from `from` to MAX_PHASE: [フェーズ素材, copies]. */
export function phaseTotalCost(from = 1): { materials: number; copies: number } {
  let materials = 0;
  let copies = 0;
  for (let p = Math.max(1, from); p < MAX_PHASE; p++) {
    materials += phaseMaterialCost(p);
    copies += phaseFusionCopies(p);
  }
  return { materials, copies };
}
