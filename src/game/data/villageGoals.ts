import { BUILDINGS, VILLAGE_BUILDERS, getBuilding, type BuildingKind, type MaterialBundle } from './village';

/**
 * 村の目標: one-time goals for the village to grow toward, each paying a small reward the first time it is met (魔晶石,
 * 素材, and hours of the 放置報酬 gold). They are grouped in tiers that follow the 城's level: tier N is what a village
 * with a 城 of Lv.N is asked for, so the list always shows what to do next and what is coming. Edit this file to add or
 * change a goal (数字は仮のバランス); the scene needs no change. Progress is read from the village itself (see
 * systems/VillageGoals.ts), so a goal that is already met when it is added can be collected at once.
 */

/** What a goal counts. */
export type GoalMetric =
  /** The 城's level. */
  | { kind: 'castle' }
  /** Buildings of this kind that stand (finished), or 'decor' for every 装飾. */
  | { kind: 'count'; of: BuildingKind | 'decor' }
  /** The highest level reached by a building of this kind, or by any ('any'). */
  | { kind: 'topLevel'; of: BuildingKind | 'any' }
  /** 売上倍率 (×1 = a village of one level-1 店). */
  | { kind: 'income' }
  /** 防衛 (every 柵 and 門 added up). */
  | { kind: 'defense' }
  /** 襲撃 beaten in battle. */
  | { kind: 'raids' }
  /** 素材 that has come into the village's store, added up over time. */
  | { kind: 'gathered' }
  /** 建築員 (what the 城 gives and the ones bought). */
  | { kind: 'builders' }
  /** How many kinds of building stand (of all those there are). */
  | { kind: 'variety' };

export interface GoalReward {
  gems?: number;
  /** Hours of the 放置報酬 gold at the stage reached. */
  goldHours?: number;
  materials?: MaterialBundle;
}

export interface VillageGoal {
  id: string;
  /** The 城 level this goal belongs to (1-6): it is asked for once the 城 is that level, and teased before. */
  tier: number;
  text: string;
  metric: GoalMetric;
  target: number;
  reward: GoalReward;
}

/** The top tier (the 城's highest level). */
export const GOAL_TIERS = 6;

const goal = (id: string, tier: number, text: string, metric: GoalMetric, target: number, reward: GoalReward): VillageGoal => ({ id, tier, text, metric, target, reward });

export const VILLAGE_GOALS: VillageGoal[] = [
  // ---- 城 Lv.1: a village begins.
  goal('t1_house2', 1, '民家を2軒建てる', { kind: 'count', of: 'house' }, 2, { gems: 10, materials: { wood: 40 } }),
  goal('t1_lumber', 1, '伐採所を建てる', { kind: 'count', of: 'lumber' }, 1, { materials: { wood: 50, stone: 30 } }),
  goal('t1_quarry', 1, '採石場を建てる', { kind: 'count', of: 'quarry' }, 1, { materials: { wood: 60, stone: 30 } }),
  goal('t1_fence4', 1, '柵を4つ並べる', { kind: 'count', of: 'fence' }, 4, { gems: 10 }),
  goal('t1_decor2', 1, '装飾を2つ置く', { kind: 'count', of: 'decor' }, 2, { gems: 10, materials: { wood: 30 } }),
  // (A 城 Lv.1 allows one 店, so ×1.4 - a Lv.2 店 and two 民家 - is about the most it can reach.)
  goal('t1_income', 1, '売上を ×1.4 にする', { kind: 'income' }, 1.4, { gems: 15, goldHours: 1 }),
  goal('t1_castle', 1, '城をLv2にする', { kind: 'castle' }, 2, { gems: 30, goldHours: 2, materials: { wood: 100, stone: 100 } }),

  // ---- 城 Lv.2
  goal('t2_shop2', 2, '商店を2軒にする', { kind: 'count', of: 'shop' }, 2, { gems: 15, materials: { wood: 100, stone: 60 } }),
  goal('t2_mine', 2, '鉱山を建てる', { kind: 'count', of: 'mine' }, 1, { gems: 15, materials: { iron: 20 } }),
  goal('t2_gate', 2, '門を建てる', { kind: 'count', of: 'gate' }, 1, { gems: 15, materials: { stone: 100 } }),
  goal('t2_house3', 2, '民家を3軒にする', { kind: 'count', of: 'house' }, 3, { gems: 15 }),
  goal('t2_defense', 2, '防衛を15にする', { kind: 'defense' }, 15, { gems: 20 }),
  goal('t2_income', 2, '売上を ×3 にする', { kind: 'income' }, 3, { gems: 25, goldHours: 2 }),
  goal('t2_decor8', 2, '装飾を8つ置く', { kind: 'count', of: 'decor' }, 8, { gems: 15 }),
  goal('t2_castle', 2, '城をLv3にする', { kind: 'castle' }, 3, { gems: 50, goldHours: 4, materials: { wood: 250, stone: 250, iron: 80 } }),

  // ---- 城 Lv.3
  goal('t3_market', 3, '市場を建てる', { kind: 'count', of: 'market' }, 1, { gems: 30, materials: { wood: 200, stone: 150 } }),
  goal('t3_fountain', 3, '噴水を飾る', { kind: 'count', of: 'fountain' }, 1, { gems: 20, materials: { stone: 150 } }),
  goal('t3_shop4', 3, '商店をLv4にする', { kind: 'topLevel', of: 'shop' }, 4, { gems: 25, materials: { iron: 60 } }),
  goal('t3_income', 3, '売上を ×8 にする', { kind: 'income' }, 8, { gems: 40, goldHours: 3 }),
  goal('t3_defense', 3, '防衛を40にする', { kind: 'defense' }, 40, { gems: 30 }),
  goal('t3_raids', 3, '襲撃を3回撃退する', { kind: 'raids' }, 3, { gems: 30, materials: { wood: 100, stone: 100 } }),
  goal('t3_gather', 3, '素材を合計10,000集める', { kind: 'gathered' }, 10000, { gems: 20 }),
  goal('t3_castle', 3, '城をLv4にする', { kind: 'castle' }, 4, { gems: 80, goldHours: 8, materials: { wood: 600, stone: 900, iron: 300 } }),

  // ---- 城 Lv.4
  goal('t4_shop3', 4, '商店を3軒にする', { kind: 'count', of: 'shop' }, 3, { gems: 30, materials: { wood: 300, stone: 200 } }),
  goal('t4_house5', 4, '民家を5軒にする', { kind: 'count', of: 'house' }, 5, { gems: 30 }),
  goal('t4_statue', 4, '銅像を建てる', { kind: 'count', of: 'statue' }, 1, { gems: 30, materials: { stone: 300, iron: 80 } }),
  goal('t4_builders', 4, '建築員を3人にする', { kind: 'builders' }, 3, { gems: 30 }),
  goal('t4_income', 4, '売上を ×15 にする', { kind: 'income' }, 15, { gems: 45, goldHours: 5 }),
  goal('t4_defense', 4, '防衛を90にする', { kind: 'defense' }, 90, { gems: 40 }),
  goal('t4_raids', 4, '襲撃を10回撃退する', { kind: 'raids' }, 10, { gems: 40, materials: { wood: 250, iron: 100, stone: 300 } }),
  goal('t4_mine2', 4, '鉱山を2つにする', { kind: 'count', of: 'mine' }, 2, { gems: 25, materials: { iron: 150 } }),
  goal('t4_level5', 4, 'どれかの建物をLv5にする', { kind: 'topLevel', of: 'any' }, 5, { gems: 25 }),
  goal('t4_variety', 4, '13種類すべての建物を建てる', { kind: 'variety' }, 13, { gems: 40 }),
  goal('t4_decor18', 4, '装飾を18個置く', { kind: 'count', of: 'decor' }, 18, { gems: 25 }),
  goal('t4_castle', 4, '城をLv5にする', { kind: 'castle' }, 5, { gems: 100, goldHours: 15, materials: { wood: 1500, stone: 2500, iron: 900 } }),

  // ---- 城 Lv.5
  goal('t5_market2', 5, '市場を2つにする', { kind: 'count', of: 'market' }, 2, { gems: 35, materials: { wood: 600, stone: 400, iron: 200 } }),
  goal('t5_quarry3', 5, '採石場を3つにする', { kind: 'count', of: 'quarry' }, 3, { gems: 25, materials: { stone: 200 } }),
  goal('t5_level6', 5, 'どれかの建物をLv6にする', { kind: 'topLevel', of: 'any' }, 6, { gems: 35 }),
  goal('t5_income', 5, '売上を ×40 にする', { kind: 'income' }, 40, { gems: 60, goldHours: 10 }),
  goal('t5_defense', 5, '防衛を200にする', { kind: 'defense' }, 200, { gems: 50 }),
  goal('t5_gather', 5, '素材を合計200,000集める', { kind: 'gathered' }, 200000, { gems: 35 }),
  goal('t5_house6', 5, '民家を6軒にする', { kind: 'count', of: 'house' }, 6, { gems: 30 }),
  goal('t5_decor22', 5, '装飾を22個置く', { kind: 'count', of: 'decor' }, 22, { gems: 25 }),
  goal('t5_castle', 5, '城をLv6にする', { kind: 'castle' }, 6, { gems: 150, goldHours: 30, materials: { wood: 4000, stone: 6000, iron: 2500 } }),

  // ---- 城 Lv.6: a village complete.
  goal('t6_builders', 6, '建築員を4人にする', { kind: 'builders' }, 4, { gems: 40 }),
  goal('t6_market6', 6, '市場をLv6にする', { kind: 'topLevel', of: 'market' }, 6, { gems: 75 }),
  goal('t6_mine6', 6, '鉱山をLv6にする', { kind: 'topLevel', of: 'mine' }, 6, { gems: 50 }),
  goal('t6_income', 6, '売上を ×75 にする', { kind: 'income' }, 75, { gems: 100, goldHours: 20 }),
  goal('t6_defense', 6, '防衛を300にする', { kind: 'defense' }, 300, { gems: 50 }),
  goal('t6_raids', 6, '襲撃を30回撃退する', { kind: 'raids' }, 30, { gems: 50, materials: { wood: 500, iron: 250, stone: 600 } }),
  goal('t6_decor28', 6, '装飾を28個置く', { kind: 'count', of: 'decor' }, 28, { gems: 30 }),
  goal('t6_gather', 6, '素材を合計2,000,000集める', { kind: 'gathered' }, 2000000, { gems: 50 }),
];

export function getVillageGoal(id: string): VillageGoal | undefined {
  return VILLAGE_GOALS.find((g) => g.id === id);
}

export function goalsOfTier(tier: number): VillageGoal[] {
  return VILLAGE_GOALS.filter((g) => g.tier === tier);
}

// ---- 村の発展: what reaching a 城 level gives, read from data/village.ts so it never drifts from the real rules.

/** The highest level of a building the 城 at `castleLevel` lets it be raised to (0 = none: it needs a better 城). */
function levelCap(kind: BuildingKind, castleLevel: number): number {
  const def = getBuilding(kind);
  let cap = 0;
  def.levels.forEach((level, i) => {
    if (level.needCastle <= castleLevel) cap = i + 1;
  });
  return cap;
}

/** How many of `kind` the 城 at `castleLevel` allows. */
function allowed(kind: BuildingKind, castleLevel: number): number {
  const def = getBuilding(kind);
  return def.maxCount[Math.min(def.maxCount.length, castleLevel) - 1] ?? 0;
}

export interface UnlockLine {
  text: string;
  /** A building the line is about, for its small picture; none for a builder line. */
  kind?: BuildingKind;
}

/**
 * What a 城 of Lv.`level` gives over Lv.(level - 1), as lines to show: more builders, buildings that can be built at last,
 * more of the ones already standing, and the higher levels they can be raised to. Empty for level 1.
 */
export function unlocksAt(level: number): UnlockLine[] {
  if (level < 2) return [];
  const lines: UnlockLine[] = [];
  const builders = VILLAGE_BUILDERS[Math.min(VILLAGE_BUILDERS.length, level) - 1];
  const before = VILLAGE_BUILDERS[Math.min(VILLAGE_BUILDERS.length, level - 1) - 1];
  if (builders > before) lines.push({ text: `建築員　${before}人 → ${builders}人` });

  const things = BUILDINGS.filter((d) => d.buildable);
  const fresh = things.filter((d) => allowed(d.kind, level - 1) === 0 && allowed(d.kind, level) > 0);
  for (const d of fresh) lines.push({ text: `${d.name}が${d.decor ? '置ける' : '建てられる'}ようになる`, kind: d.kind });
  // Higher levels: the buildings that gain the same step are told together.
  const caps = new Map<string, { names: string[]; kind: BuildingKind }>();
  for (const d of things.filter((x) => !x.decor)) {
    const was = levelCap(d.kind, level - 1);
    const now = levelCap(d.kind, level);
    if (now > was && was > 0) {
      const key = `${was}-${now}`;
      const entry = caps.get(key) ?? { names: [], kind: d.kind };
      entry.names.push(d.name);
      caps.set(key, entry);
    }
  }
  for (const [key, entry] of caps) {
    const [was, now] = key.split('-');
    lines.push({ text: `${entry.names.length > 3 ? 'ほとんどの建物' : entry.names.join('・')}の最大レベル　Lv${was} → Lv${now}`, kind: entry.kind });
  }
  for (const d of things) {
    const was = allowed(d.kind, level - 1);
    const now = allowed(d.kind, level);
    if (was > 0 && now > was) lines.push({ text: `${d.name}の数　${was} → ${now}`, kind: d.kind });
  }
  return lines;
}
