import type { ResearchLine, ResearchView } from '../alliance/AllianceBackend';
import { RESEARCH_LINE_IDS } from '../alliance/AllianceBackend';
import type { PlainKey } from '../i18n';
import type { SaveData } from '../systems/SaveSystem';

/**
 * 同盟研究: 同盟の資金 (寄付から貯まる) で進める、メンバー全員への、常時かかる控えめな加算。
 * ここの表だけを直せば、バランスが変わる (数字は仮のバランス)。設計は docs/ALLIANCE_DESIGN.md の「同盟研究」。
 * Phaser にも画面にも依らない。
 *
 * - 資金: 寄付1回につき、その寄付の同盟EXPと同じ数だけ貯まる (ゴールド +100 / 素材 +120 / 魔晶石 +300)。EXP (同盟Lv) とは別の財布。
 * - 研究できるのは、同盟長と副長。1回で1段。すぐに終わる (時間はかからない)。資金は、その場で引かれる。
 * - 各系統は 5段。何段目を進められるかは、同盟Lv で決まる (どの系統も同じ)。値段も、段で決まる (どの系統も同じ。ルールを小さく保つため)。
 * - 効果は、同盟Lv の恩恵 (data/alliance.ts の PERKS) に足される。入っている間だけ効く (抜けると消える)。
 * - 無限モードの戦闘には、戦闘の加算をかけない (ランキングを、同盟の入っている・いないで、変えないため)。
 */

export interface ResearchStep {
  /** この段に進むための、同盟の資金。 */
  cost: number;
  /** この段に進むために、同盟がなっていなければならない同盟Lv。 */
  needLevel: number;
}

export const RESEARCH_MAX_LEVEL = 5;

/** 1段目 〜 5段目。1日に、メンバー1人が資金に足せる最大は 2,000 (ゴールド5回・素材5回・魔晶石3回)。活発な同盟 (20人のうち6割が1,500ずつ) なら 1日 18,000。
 *  1段目は 1日で届く。1系統を最後まで進めるのに、およそ3週間。3系統そろえて、2か月ほど。 */
export const RESEARCH_STEPS: ResearchStep[] = [
  { cost: 15000, needLevel: 2 },
  { cost: 30000, needLevel: 3 },
  { cost: 60000, needLevel: 5 },
  { cost: 110000, needLevel: 7 },
  { cost: 180000, needLevel: 9 },
];

/** 効果の種類: battle = 味方全員の攻撃力と HP / idleGold = 放置ゴールド / expDrop = 経験値素材のドロップ。 */
export type ResearchEffect = 'battle' | 'idleGold' | 'expDrop';

export interface ResearchLineDef {
  id: ResearchLine;
  name: PlainKey;
  /** 効果の説明 (「味方全員の攻撃力とHPが増える」)。 */
  effectText: PlainKey;
  effect: ResearchEffect;
  /** 段ごとの効果 (その段までの合計。0.03 = +3%)。 */
  values: number[];
}

export const RESEARCH_LINES: ResearchLineDef[] = [
  { id: 'battle', name: 'alliance.research.line.battle', effectText: 'alliance.research.effect.battle', effect: 'battle', values: [0.01, 0.02, 0.03, 0.04, 0.05] },
  { id: 'income', name: 'alliance.research.line.income', effectText: 'alliance.research.effect.income', effect: 'idleGold', values: [0.02, 0.04, 0.06, 0.08, 0.1] },
  { id: 'growth', name: 'alliance.research.line.growth', effectText: 'alliance.research.effect.growth', effect: 'expDrop', values: [0.02, 0.04, 0.06, 0.08, 0.1] },
];

export function getResearchLine(id: ResearchLine): ResearchLineDef {
  return RESEARCH_LINES.find((l) => l.id === id) ?? RESEARCH_LINES[0];
}

export function emptyResearchLevels(): Record<ResearchLine, number> {
  return { battle: 0, income: 0, growth: 0 };
}

export function cleanResearchLevels(raw: unknown): Record<ResearchLine, number> {
  const out = emptyResearchLevels();
  if (raw && typeof raw === 'object') {
    for (const id of RESEARCH_LINE_IDS) {
      const n = (raw as Record<string, unknown>)[id];
      if (typeof n === 'number' && Number.isFinite(n)) out[id] = Math.max(0, Math.min(RESEARCH_MAX_LEVEL, Math.floor(n)));
    }
  }
  return out;
}

/** その段までの効果 (0段 = 0)。 */
export function researchValue(line: ResearchLine, level: number): number {
  const l = Math.max(0, Math.min(RESEARCH_MAX_LEVEL, Math.floor(level)));
  return l === 0 ? 0 : (getResearchLine(line).values[l - 1] ?? 0);
}

/** いま進められる次の段 (最後まで進んでいれば null)。 */
export function nextResearchStep(level: number): ResearchStep | null {
  return level >= RESEARCH_MAX_LEVEL ? null : RESEARCH_STEPS[Math.max(0, level)];
}

/** 同盟Lv と 資金から見た、次の段に進める状態。 */
export type ResearchBlock = 'max' | 'level' | 'fund' | null;
export function researchBlock(level: number, allianceLevel: number, fund: number): ResearchBlock {
  const step = nextResearchStep(level);
  if (!step) return 'max';
  if (allianceLevel < step.needLevel) return 'level';
  if (fund < step.cost) return 'fund';
  return null;
}

/** 1つの研究 (系統ごとの段) が、どの系統の何%か。入っていなければ 0。 */
export function researchBonusFor(levels: Record<ResearchLine, number>, effect: ResearchEffect): number {
  let sum = 0;
  for (const def of RESEARCH_LINES) if (def.effect === effect) sum += researchValue(def.id, levels[def.id] ?? 0);
  return sum;
}

/** セーブの、いまの同盟の研究 (入っていなければ全部 0)。 */
export function researchLevelsOfSave(save: Pick<SaveData, 'alliance'>): Record<ResearchLine, number> {
  return save.alliance?.allianceId && save.alliance.research ? save.alliance.research : emptyResearchLevels();
}

/** 研究の効果 (入っていなければ 0): 放置ゴールド・経験値素材・戦闘 (攻撃力と HP)。 */
export function researchBonusOfSave(save: Pick<SaveData, 'alliance'>, effect: ResearchEffect): number {
  return researchBonusFor(researchLevelsOfSave(save), effect);
}

export function researchView(levels: Record<ResearchLine, number>, canResearch: boolean): ResearchView {
  return { levels: { ...levels }, canResearch };
}
