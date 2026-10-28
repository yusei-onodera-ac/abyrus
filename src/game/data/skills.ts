import type { HeroData, Rarity } from '../types';

/** How many skill slots a hero's rarity grants (not all may be unlocked yet -
 *  see SKILL_SLOT_UNLOCK_LEVEL). Only the rarest ★5 heroes reach the full
 *  4-skill kit; ★1-2 "common" heroes are limited to their one fixed move,
 *  reserving the deepest kits as a tangible rarity payoff. */
export const RARITY_SKILL_SLOTS: Record<Rarity, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };
export const MAX_SKILL_SLOTS = 4;
export const MAX_SKILL_LEVEL = 10;

/** Hero level at which each slot index (0-3) becomes usable. Slot 0 is
 *  always available from level 1; later slots unlock at thresholds spread
 *  across the game's realistic level range - lvl10 is reachable within the
 *  first couple of stage clears, lvl25 after roughly a full campaign
 *  clear, and lvl45 only after serious repeat-stage grinding (see
 *  expToNextLevel/rewardExp in SaveSystem/ProgressionSystem). */
export const SKILL_SLOT_UNLOCK_LEVEL: readonly number[] = [1, 10, 25, 45];

export type SkillEffectKind =
  | 'nuke_single'
  | 'nuke_aoe'
  | 'drain_single'
  | 'buff_atk'
  | 'buff_def'
  | 'debuff_atk'
  | 'debuff_def'
  | 'stun'
  | 'heal_single'
  | 'heal_aoe'
  | 'revive';

export const SKILL_KIND_LABELS: Record<SkillEffectKind, string> = {
  nuke_single: '単体攻撃',
  nuke_aoe: '範囲攻撃',
  drain_single: '吸収攻撃',
  buff_atk: '攻撃強化',
  buff_def: '防御強化',
  debuff_atk: '攻撃低下',
  debuff_def: '防御低下',
  stun: '行動封じ',
  heal_single: '単体回復',
  heal_aoe: '範囲回復',
  revive: '復活',
};

export interface SkillTuning {
  basePotency: number;
  potencyPerLevel: number;
  baseDurationMs?: number;
  durationPerLevelMs?: number;
  secondaryBasePotency?: number;
  secondaryPotencyPerLevel?: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  kind: SkillEffectKind;
  tuning: SkillTuning;
}

export interface UnlockedSkill {
  def: SkillDefinition;
  slotIndex: number;
  level: number;
}

export interface ResolvedSkillEffect {
  potency: number;
  durationMs: number;
  secondaryPotency: number;
}

/** Rarity-neutral tuning baseline for each skill kind (as authored at a ★3
 *  hero). Per-hero definitions scale this by RARITY_POTENCY_MUL so a ★5
 *  hero's skill genuinely hits harder than a ★1 hero's, without every one
 *  of the ~50 roster entries needing its own hand-tuned numbers. Duration
 *  fields are left unscaled - a buff/debuff/stun's uptime is about the
 *  skill kind and level, not the hero's rarity. */
const KIND_BASE_TUNING: Record<SkillEffectKind, SkillTuning> = {
  nuke_single: { basePotency: 220, potencyPerLevel: 16 },
  nuke_aoe: { basePotency: 120, potencyPerLevel: 9 },
  drain_single: { basePotency: 180, potencyPerLevel: 13, secondaryBasePotency: 40, secondaryPotencyPerLevel: 2 },
  buff_atk: { basePotency: 18, potencyPerLevel: 1.6, baseDurationMs: 2400, durationPerLevelMs: 100 },
  buff_def: { basePotency: 20, potencyPerLevel: 1.8, baseDurationMs: 2400, durationPerLevelMs: 100 },
  debuff_atk: { basePotency: 16, potencyPerLevel: 1.4, baseDurationMs: 2400, durationPerLevelMs: 100 },
  debuff_def: { basePotency: 18, potencyPerLevel: 1.5, baseDurationMs: 2400, durationPerLevelMs: 100 },
  stun: { basePotency: 0, potencyPerLevel: 0, baseDurationMs: 900, durationPerLevelMs: 60 },
  heal_single: { basePotency: 28, potencyPerLevel: 2.4 },
  heal_aoe: { basePotency: 16, potencyPerLevel: 1.3 },
  revive: { basePotency: 30, potencyPerLevel: 2 },
};

const RARITY_POTENCY_MUL: Record<Rarity, number> = { 1: 0.75, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3 };

function defineSkill(rarity: Rarity, kind: SkillEffectKind, name: string, description: string): SkillDefinition {
  const base = KIND_BASE_TUNING[kind];
  const mul = RARITY_POTENCY_MUL[rarity];
  const tuning: SkillTuning = {
    basePotency: Math.round(base.basePotency * mul * 10) / 10,
    potencyPerLevel: Math.round(base.potencyPerLevel * mul * 100) / 100,
    baseDurationMs: base.baseDurationMs,
    durationPerLevelMs: base.durationPerLevelMs,
    secondaryBasePotency: base.secondaryBasePotency,
    secondaryPotencyPerLevel: base.secondaryPotencyPerLevel,
  };
  return { id: `${kind}-${name}`, name, description, kind, tuning };
}

export function getSkillEffect(def: SkillDefinition, level: number): ResolvedSkillEffect {
  const steps = Math.max(1, Math.min(MAX_SKILL_LEVEL, level)) - 1;
  return {
    potency: def.tuning.basePotency + def.tuning.potencyPerLevel * steps,
    durationMs: (def.tuning.baseDurationMs ?? 0) + (def.tuning.durationPerLevelMs ?? 0) * steps,
    secondaryPotency: (def.tuning.secondaryBasePotency ?? 0) + (def.tuning.secondaryPotencyPerLevel ?? 0) * steps,
  };
}

/** Cost (in skillEssence) to raise a skill from `currentLevel` to
 *  `currentLevel + 1`. Exponential so maxing a single skill (1->10, ~8,000
 *  total) is a real long-term sink, matching the idle-grind pace of the
 *  rest of the economy rather than a one-time purchase. */
export function skillUpgradeCost(currentLevel: number): number {
  return Math.round(50 * Math.pow(currentLevel, 1.7));
}

export function getSkillSlotCount(rarity: Rarity): number {
  return RARITY_SKILL_SLOTS[rarity];
}

export function isSkillSlotUnlocked(slotIndex: number, heroLevel: number): boolean {
  const threshold = SKILL_SLOT_UNLOCK_LEVEL[slotIndex];
  return threshold !== undefined && heroLevel >= threshold;
}

export function getHeroSkillLoadout(heroId: string): SkillDefinition[] {
  return HERO_SKILLS[heroId] ?? [];
}

export function getUnlockedSkillsForHero(hero: HeroData): UnlockedSkill[] {
  const loadout = getHeroSkillLoadout(hero.heroId);
  const slotCount = getSkillSlotCount(hero.rarity);
  const unlocked: UnlockedSkill[] = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    if (!isSkillSlotUnlocked(slotIndex, hero.level)) continue;
    const def = loadout[slotIndex];
    if (!def) continue;
    unlocked.push({ def, slotIndex, level: hero.skillLevels[slotIndex] ?? 1 });
  }
  return unlocked;
}

/** Short Japanese readout of a skill's live numeric effect at its current
 *  level, for the HeroDetail skill list. */
export function formatSkillEffectSummary(def: SkillDefinition, level: number): string {
  const effect = getSkillEffect(def, level);
  switch (def.kind) {
    case 'nuke_single':
    case 'nuke_aoe':
      return `威力 ${Math.round(effect.potency)}%`;
    case 'drain_single':
      return `威力 ${Math.round(effect.potency)}% / 吸収 ${Math.round(effect.secondaryPotency)}%`;
    case 'buff_atk':
    case 'buff_def':
      return `+${Math.round(effect.potency)}% / ${(effect.durationMs / 1000).toFixed(1)}秒`;
    case 'debuff_atk':
    case 'debuff_def':
      return `-${Math.round(effect.potency)}% / ${(effect.durationMs / 1000).toFixed(1)}秒`;
    case 'stun':
      return `${(effect.durationMs / 1000).toFixed(1)}秒`;
    case 'heal_single':
    case 'heal_aoe':
    case 'revive':
      return `回復量 ${Math.round(effect.potency)}%`;
  }
}

/**
 * Fixed, hand-authored skill loadout for every HERO_ROSTER entry. Each
 * hero's kit is built from a shared pool of SkillEffectKind "moves" (see
 * above) but the choice of kind, slot order, and flavor name/description
 * is per-hero - picked to fit their class and the epithet baked into their
 * own name (黒刃のレン -> a corrupting blade; 疾風のライガ -> a gale that
 * rallies the team's tempo; 蠱毒の女王ヴィアラ -> a full poison/curse kit).
 * Array index == skill slot index (0-3); length must equal
 * RARITY_SKILL_SLOTS[hero's rarity].
 */
export const HERO_SKILLS: Record<string, SkillDefinition[]> = {
  // --- ★5 : full 4-skill kits -------------------------------------------
  gauss: [
    defineSkill(5, 'buff_def', '絶対防御の算', '味方全体の防御力を算盤の結界で引き上げる。'),
    defineSkill(5, 'debuff_atk', '減算の重圧', '敵単体に重みを演算し、攻撃力を押し潰す。'),
    defineSkill(5, 'stun', '封算の一手', '敵単体の動きを演算停止に陥れ、束の間行動を封じる。'),
    defineSkill(5, 'nuke_aoe', '無限桁演算陣', '算盤王の全演算力を解放し、戦場の敵全てを圧殺する。'),
  ],
  aria: [
    defineSkill(5, 'heal_single', '虚数の癒糸', '味方単体に虚数の糸を紡ぎ、傷を縫い直す。'),
    defineSkill(5, 'heal_aoe', '虚実の祝福', '虚実の境で味方全体を包み、傷を一斉に癒す。'),
    defineSkill(5, 'revive', '虚数転生', '力尽きた味方を虚数の彼岸から呼び戻す。'),
    defineSkill(5, 'buff_atk', '虚数増幅', '味方全体の攻撃力を虚数演算で底上げする。'),
  ],
  zeno: [
    defineSkill(5, 'nuke_single', '無限桁の一撃', '無限に連なる数式を敵単体へ叩き込む。'),
    defineSkill(5, 'nuke_aoe', '桁溢れの爆算', '演算が桁を溢れさせ、敵全体を吹き飛ばす。'),
    defineSkill(5, 'debuff_def', '桁下げの呪', '敵単体の防御演算を桁落ちさせる。'),
    defineSkill(5, 'stun', '演算停止', '敵単体の思考を無限ループに陥れ、行動を封じる。'),
  ],
  astra: [
    defineSkill(5, 'nuke_aoe', '星導の降星', '無数の星を呼び降ろし、敵全体を撃つ。'),
    defineSkill(5, 'debuff_atk', '暗星の呪縛', '不吉な星回りで敵単体を縛り、攻撃力を奪う。'),
    defineSkill(5, 'buff_atk', '星導の祝詞', '味方全体に星の導きを与え、攻撃力を高める。'),
    defineSkill(5, 'revive', '帰星の導き', '倒れた味方の魂を星々の導きで呼び戻す。'),
  ],
  viara: [
    defineSkill(5, 'drain_single', '蠱毒の牙', '敵単体に毒牙を突き立て、生命力を吸い上げる。'),
    defineSkill(5, 'debuff_atk', '衰毒の呪詛', '衰えの毒を敵単体に流し込み、攻撃力を奪う。'),
    defineSkill(5, 'debuff_def', '腐蝕の蠱毒', '敵単体の鎧を毒で腐らせ、防御力を崩す。'),
    defineSkill(5, 'nuke_aoe', '百蠱の瘴気', '戦場全体に瘴気の毒霧をまき、敵全てを侵す。'),
  ],
  shade: [
    defineSkill(5, 'nuke_single', '冥灯の一閃', '冥府の灯火を凝縮し、敵単体を撃つ。'),
    defineSkill(5, 'stun', '亡者の呼び声', '敵単体に亡者の声を聞かせ、動きを奪う。'),
    defineSkill(5, 'drain_single', '冥府の吸魂', '敵単体の魂を吸い取り、自らの力に変える。'),
    defineSkill(5, 'debuff_def', '冥闇の呪装', '敵単体の守りを冥闇に塗り替え、防御力を落とす。'),
  ],

  // --- ★4 : 3-skill kits --------------------------------------------------
  ren: [
    defineSkill(4, 'nuke_single', '黒刃一閃', '闇を纏う刃で敵単体を斬り裂く。'),
    defineSkill(4, 'debuff_def', '蝕刃', '刃に巣食う闇が敵単体の守りを腐らせる。'),
    defineSkill(4, 'nuke_aoe', '黒刃乱舞', '黒刃を乱れ打ち、敵全体を薙ぎ払う。'),
  ],
  suzuna: [
    defineSkill(4, 'nuke_aoe', '百矢乱射', '百の矢を一斉に放ち、敵全体を射抜く。'),
    defineSkill(4, 'debuff_atk', '矢止めの一射', '敵単体の得物を射止め、攻撃力を奪う。'),
    defineSkill(4, 'nuke_single', '百矢・極', '百矢の精髄を一点に束ね、敵単体を貫く。'),
  ],
  baron: [
    defineSkill(4, 'buff_def', '守壁の号令', '味方全体に鉄壁の守りを布く。'),
    defineSkill(4, 'stun', '盾撃', '大盾を打ち付け、敵単体の動きを止める。'),
    defineSkill(4, 'nuke_single', '守壁反撃', '守りを固めた末、敵単体へ全力の反撃を放つ。'),
  ],
  sylva: [
    defineSkill(4, 'buff_atk', '緑陣の号令', '緑の陣形を敷き、味方全体の攻撃力を高める。'),
    defineSkill(4, 'nuke_single', '陣烈斬', '陣形の勢いを乗せ、敵単体を斬る。'),
    defineSkill(4, 'debuff_atk', '蔓縛りの一撃', '蔓で敵単体を縛り、攻撃力を奪う。'),
  ],
  nova: [
    defineSkill(4, 'nuke_single', '閃光の狙撃', '一瞬の閃光と共に敵単体を射抜く。'),
    defineSkill(4, 'buff_atk', '残光の加速', '残光が味方全体の一撃を加速させる。'),
    defineSkill(4, 'stun', '眩閃', '閃光で敵単体の視界を奪い、動きを封じる。'),
  ],
  kohaku: [
    defineSkill(4, 'nuke_single', '疾爪撃', '疾い爪で敵単体を切り裂く。'),
    defineSkill(4, 'nuke_aoe', '乱爪旋風', '爪の旋風を敵全体へ叩き込む。'),
    defineSkill(4, 'stun', '縛爪', '爪で敵単体の四肢を縫い止め、動きを封じる。'),
  ],
  dias: [
    defineSkill(4, 'drain_single', '魔剣喰', '魔剣が敵単体の生命力を喰らう。'),
    defineSkill(4, 'debuff_def', '魔剣蝕', '魔剣の呪いが敵単体の守りを蝕む。'),
    defineSkill(4, 'nuke_single', '魔剣・断', '魔剣の全力を込め、敵単体を両断する。'),
  ],
  ignis: [
    defineSkill(4, 'nuke_aoe', '溶岩噴出', '足元から溶岩を噴き上げ、敵全体を焼く。'),
    defineSkill(4, 'debuff_def', '灼熱侵食', '灼熱が敵単体の鎧を融かし、防御力を奪う。'),
    defineSkill(4, 'buff_def', '熔鎧の加護', '溶岩で鎧を鍛え、味方全体の防御力を高める。'),
  ],
  seira: [
    defineSkill(4, 'nuke_aoe', '氷波乱舞', '氷の波を放ち、敵全体を凍らせ撃つ。'),
    defineSkill(4, 'debuff_def', '凍砕の一矢', '矢が敵単体の鎧を凍らせ脆くする。'),
    defineSkill(4, 'stun', '氷結封じ', '敵単体を氷塊に閉じ込め、動きを封じる。'),
  ],

  // --- ★3 : 2-skill kits --------------------------------------------------
  kai: [
    defineSkill(3, 'nuke_aoe', '業火爆裂', '業火を敵全体に叩きつけ爆ぜさせる。'),
    defineSkill(3, 'debuff_def', '焦熱侵食', '焦熱が敵単体の守りを焼き崩す。'),
  ],
  mina: [
    defineSkill(3, 'nuke_single', '疾風の一矢', '疾風に乗せた矢で敵単体を射抜く。'),
    defineSkill(3, 'buff_atk', '疾風の加速', '疾風が味方全体の一撃を速める。'),
  ],
  noa: [
    defineSkill(3, 'heal_single', '癒しの手', '味方単体の傷を優しく癒す。'),
    defineSkill(3, 'heal_aoe', '癒しの波動', '癒しの波動を広げ、味方全体を癒す。'),
  ],
  celes: [
    defineSkill(3, 'heal_aoe', '聖琴の旋律', '聖なる旋律を奏で、味方全体を癒す。'),
    defineSkill(3, 'buff_atk', '聖歌の鼓舞', '聖歌が味方全体の攻撃力を鼓舞する。'),
  ],
  toxar: [
    defineSkill(3, 'drain_single', '毒蛇の牙', '毒牙が敵単体の生命力を吸い取る。'),
    defineSkill(3, 'debuff_atk', '猛毒麻痺', '猛毒が敵単体の攻撃力を麻痺させる。'),
  ],
  nyx: [
    defineSkill(3, 'nuke_single', '夜魔の一撃', '夜の闇を纏い敵単体を撃つ。'),
    defineSkill(3, 'stun', '悪夢の囚縛', '悪夢を見せ、敵単体の動きを封じる。'),
  ],
  morrigan: [
    defineSkill(3, 'nuke_single', '狙撃・必中', '弱点を見極めた一射で敵単体を射抜く。'),
    defineSkill(3, 'debuff_atk', '照準封じ', '敵単体の得物を狙い、攻撃力を奪う。'),
  ],
  elrin: [
    defineSkill(3, 'buff_def', '聖盾の加護', '聖なる盾の加護で味方全体の防御力を高める。'),
    defineSkill(3, 'stun', '盾撃一閃', '聖盾を打ち鳴らし、敵単体の動きを止める。'),
  ],
  fros: [
    defineSkill(3, 'nuke_aoe', '氷晶乱舞', '氷の結晶を敵全体へ撃ち込む。'),
    defineSkill(3, 'stun', '氷結封印', '敵単体を氷に閉じ込め、動きを封じる。'),
  ],
  noct: [
    defineSkill(3, 'nuke_single', '星暦の一撃', '星の運命を読み、敵単体を撃つ。'),
    defineSkill(3, 'debuff_def', '暦崩しの呪', '星暦を乱し、敵単体の守りを崩す。'),
  ],

  // --- ★2 : 1-skill kits ---------------------------------------------------
  rei: [defineSkill(2, 'nuke_single', '無冠の一閃', '肩書なき剣士の、純粋な一撃。')],
  yuno: [defineSkill(2, 'heal_single', '夜事の癒し', '夜に紛れ、味方単体の傷をひそかに癒す。')],
  momo: [defineSkill(2, 'debuff_def', '森番の一突き', '森で鍛えた目で、敵単体の鎧の隙を突く。')],
  lumi: [defineSkill(2, 'heal_aoe', '陽光の恵み', '陽光が味方全体を温かく癒す。')],
  fione: [defineSkill(2, 'nuke_single', '氷刃斬', '氷を纏う刃で敵単体を斬る。')],
  enju: [defineSkill(2, 'nuke_single', '炎拳撃', '燃える拳で敵単体を打ち抜く。')],
  fern: [defineSkill(2, 'nuke_single', '森弓の一矢', '森で鍛えた弓で敵単体を射抜く。')],
  kuroto: [defineSkill(2, 'drain_single', '影鎖束縛', '影の鎖が敵単体を縛り、生命力を奪う。')],
  marin: [defineSkill(2, 'nuke_aoe', '散弾乱射', '海賊仕込みの連射で敵全体を撃つ。')],
  volt: [defineSkill(2, 'stun', '電撃麻痺', '電撃が敵単体を麻痺させ、動きを封じる。')],
  karna: [defineSkill(2, 'nuke_aoe', '双撃乱打', '二刀の連撃を敵全体へ叩き込む。')],
  mei: [defineSkill(2, 'nuke_aoe', '双刃の舞', '舞うような双刃の連撃で敵全体を斬る。')],
  raiga: [defineSkill(2, 'buff_atk', '疾風鼓舞', '疾風のごとき気迫で味方全体を鼓舞する。')],
  tia: [defineSkill(2, 'nuke_aoe', '旋槍一掃', '槍を旋回させ、敵全体を薙ぎ払う。')],
  joker: [defineSkill(2, 'nuke_single', '一撃勝負', '全てを賭けた一撃を敵単体に放つ。')],

  // --- ★1 : 1-skill kits ---------------------------------------------------
  touma: [defineSkill(1, 'nuke_single', '見習いの一撃', '覚えたばかりの技を、精一杯敵単体へ振るう。')],
  mizuki: [defineSkill(1, 'debuff_def', '新兵の鍬突き', '教わったばかりの型で、敵単体の守りの隙を突く。')],
  ald: [defineSkill(1, 'nuke_single', '新米の一刀', 'まだ粗いが、真剣な一刀を敵単体へ。')],
  pino: [defineSkill(1, 'stun', '歯車絡め', '歯車仕掛けの一打で敵単体の動きを絡め取る。')],
  garnet: [defineSkill(1, 'nuke_single', '赫髪の一撃', '血気に逆立つ赤髪のまま、敵単体へ斬りかかる。')],
  zayd: [defineSkill(1, 'nuke_aoe', '双刃斬', '二刀を振り回し、敵全体を斬り払う。')],
  ember: [defineSkill(1, 'nuke_single', '火書の一頁', '火の魔導書から炎弾を敵単体へ放つ。')],
  brisa: [defineSkill(1, 'buff_atk', '原野の喊声', '原野に響く喊声が味方全体を奮い立たせる。')],
  finn: [defineSkill(1, 'debuff_atk', '腐食調合液', '調合した薬液が敵単体の攻撃力を鈍らせる。')],
  rin: [defineSkill(1, 'drain_single', '拳闘奪気', '拳打で敵単体から気力を奪い取る。')],
};
