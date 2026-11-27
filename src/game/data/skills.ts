import type { HeroData, Rarity } from '../types';
import { localized, t, type PlainKey } from '../i18n';

/** How many skill slots a hero's rarity grants (not all may be unlocked yet -
 *  see SKILL_SLOT_UNLOCK_LEVEL). Only the rarest ★5 heroes reach the full
 *  4-skill kit; ★1-2 "common" heroes are limited to their one fixed move,
 *  reserving the deepest kits as a tangible rarity payoff. */
export const RARITY_SKILL_SLOTS: Record<Rarity, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4 };
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
  | 'invincible'
  | 'heal_single'
  | 'heal_aoe'
  | 'revive';

/** The name of each kind of skill (the small tag beside a skill's name). A key, not the text, so it is read in the current
 *  language where it is drawn: `skillKindLabel(kind)`. */
const SKILL_KIND_LABEL_KEYS: Record<SkillEffectKind, PlainKey> = {
  nuke_single: 'hero.skill.kind.nukeSingle',
  nuke_aoe: 'hero.skill.kind.nukeAoe',
  drain_single: 'hero.skill.kind.drainSingle',
  buff_atk: 'hero.skill.kind.buffAtk',
  buff_def: 'hero.skill.kind.buffDef',
  debuff_atk: 'hero.skill.kind.debuffAtk',
  debuff_def: 'hero.skill.kind.debuffDef',
  stun: 'hero.skill.kind.stun',
  invincible: 'hero.skill.kind.invincible',
  heal_single: 'hero.skill.kind.healSingle',
  heal_aoe: 'hero.skill.kind.healAoe',
  revive: 'hero.skill.kind.revive',
};

export function skillKindLabel(kind: SkillEffectKind): string {
  return t(SKILL_KIND_LABEL_KEYS[kind]);
}

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
  // The caster takes no damage for this long (1.8s at level 1, 2.9s at level 10).
  invincible: { basePotency: 0, potencyPerLevel: 0, baseDurationMs: 1800, durationPerLevelMs: 120 },
  heal_single: { basePotency: 28, potencyPerLevel: 2.4 },
  heal_aoe: { basePotency: 16, potencyPerLevel: 1.3 },
  revive: { basePotency: 30, potencyPerLevel: 2 },
};

const RARITY_POTENCY_MUL: Record<Rarity, number> = { 1: 0.75, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3, 6: 1.55 };

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

/** Short readout of a skill's live numeric effect at its current level, for the
 *  HeroDetail skill list, in the current language ("Power 232% / Drain 52%"). */
export function formatSkillEffectSummary(def: SkillDefinition, level: number): string {
  const effect = getSkillEffect(def, level);
  const potency = Math.round(effect.potency);
  const seconds = (effect.durationMs / 1000).toFixed(1);
  switch (def.kind) {
    case 'nuke_single':
    case 'nuke_aoe':
      return t('hero.skill.summary.power', { potency });
    case 'drain_single':
      return t('hero.skill.summary.powerDrain', { potency, drain: Math.round(effect.secondaryPotency) });
    case 'buff_atk':
    case 'buff_def':
      return t('hero.skill.summary.buff', { potency, seconds });
    case 'debuff_atk':
    case 'debuff_def':
      return t('hero.skill.summary.debuff', { potency, seconds });
    case 'stun':
    case 'invincible':
      return t('hero.skill.summary.duration', { seconds });
    case 'heal_single':
    case 'heal_aoe':
    case 'revive':
      return t('hero.skill.summary.heal', { potency });
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
const HERO_SKILL_ROWS: Record<string, SkillDefinition[]> = {
  // --- ★6 : the full 4-skill kit at the strongest potency ---------------------
  aion: [
    defineSkill(6, 'nuke_aoe', '無限の裁き', '無限に連なる光の環を解き放ち、敵全体を裁く。'),
    defineSkill(6, 'buff_atk', '無限帝の勅令', '帝の勅令が味方全体の攻撃力を極限まで高める。'),
    defineSkill(6, 'heal_aoe', '永遠の祝福', '永遠の光が味方全体を包み、傷を一斉に癒す。'),
    defineSkill(6, 'revive', '終焉の転生', '終焉の彼方から、倒れた味方を呼び戻す。'),
  ],

  // --- ★5 : full 4-skill kits -------------------------------------------
  gauss: [
    defineSkill(5, 'invincible', '絶対防御の算', '算盤の結界で身を包み、しばらくあらゆる攻撃を無効にする。'),
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
    defineSkill(4, 'invincible', '不動の城壁', '城壁のごとく立ちはだかり、しばらく一切の攻撃を受け付けない。'),
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
    defineSkill(4, 'invincible', '熔鎧の不壊', '溶岩で鍛えた鎧が、しばらくあらゆる攻撃を弾き返す。'),
  ],
  seira: [
    defineSkill(4, 'nuke_aoe', '氷波乱舞', '氷の波を放ち、敵全体を凍らせ撃つ。'),
    defineSkill(4, 'debuff_def', '凍砕の一矢', '矢が敵単体の鎧を凍らせ脆くする。'),
    defineSkill(4, 'stun', '氷結封じ', '敵単体を氷塊に閉じ込め、動きを封じる。'),
  ],
  kurenai: [
    defineSkill(4, 'nuke_single', '紅蓮一閃', '炎を纏う刀で、敵単体を斬り裂く。'),
    defineSkill(4, 'nuke_aoe', '焔車乱舞', '炎の斬撃を回転させ、敵全体を薙ぎ払う。'),
    defineSkill(4, 'debuff_def', '焼き断ち', '焔が敵単体の鎧を焼き、防御力を奪う。'),
  ],
  sieg: [
    defineSkill(4, 'buff_def', '聖剣の誓い', '聖剣に誓いを立て、味方全体の防御力を高める。'),
    defineSkill(4, 'nuke_single', '聖断', '聖剣を振り下ろし、敵単体を断つ。'),
    defineSkill(4, 'stun', '裁きの閃光', '聖なる閃光で敵単体の動きを封じる。'),
  ],
  thorne: [
    defineSkill(4, 'nuke_single', '竜牙突き', '竜牙の槍で、敵単体を貫く。'),
    defineSkill(4, 'nuke_aoe', '竜尾旋風', '槍を旋回させ、竜の尾のごとく敵全体を薙ぐ。'),
    defineSkill(4, 'debuff_def', '竜鱗砕き', '槍の一撃が敵単体の守りを砕く。'),
  ],
  gale: [
    defineSkill(4, 'nuke_single', '蒼穹の一矢', '風を裂く矢で、敵単体を射抜く。'),
    defineSkill(4, 'buff_atk', '追い風', '追い風が味方全体の一撃を後押しする。'),
    defineSkill(4, 'debuff_atk', '風縛り', '風が敵単体の腕を縛り、攻撃力を奪う。'),
  ],
  ivy: [
    defineSkill(4, 'drain_single', '棘の矢', '棘の矢が敵単体に刺さり、生命力を吸い上げる。'),
    defineSkill(4, 'debuff_def', '薔薇の毒', '薔薇の毒が敵単体の鎧を蝕む。'),
    defineSkill(4, 'nuke_aoe', '薔薇の雨', '薔薇の花弁を矢に乗せ、敵全体へ降らせる。'),
  ],
  lilith: [
    defineSkill(4, 'nuke_single', '夜帳の紫炎', '紫の炎で敵単体を焼く。'),
    defineSkill(4, 'stun', '月蝕の囚縛', '月蝕の闇が敵単体を縛り、動きを封じる。'),
    defineSkill(4, 'drain_single', '血月の吸魂', '血の月が敵単体の生命力を吸い取る。'),
  ],
  quartz: [
    defineSkill(4, 'nuke_aoe', '水晶の乱反射', '水晶の破片が光を乱反射し、敵全体を撃つ。'),
    defineSkill(4, 'buff_def', '結晶障壁', '結晶の壁が味方全体の防御力を高める。'),
    defineSkill(4, 'stun', '眩耀の輝き', 'まばゆい輝きで敵単体の目を眩ませ、動きを封じる。'),
  ],
  brann: [
    defineSkill(4, 'invincible', '鉄壁の構え', '大盾を構え、しばらくあらゆる攻撃を受け付けない。'),
    defineSkill(4, 'buff_def', '城塞の号令', '城塞のごとき号令で、味方全体の防御力を高める。'),
    defineSkill(4, 'stun', '大盾打ち', '大盾で敵単体を打ち据え、動きを止める。'),
  ],
  raijin: [
    defineSkill(4, 'stun', '雷鳴の一撃', '雷を纏う鎚で敵単体を打ち、動きを封じる。'),
    defineSkill(4, 'nuke_aoe', '雷槌乱打', '雷の鎚を叩きつけ、敵全体を痺れさせ撃つ。'),
    defineSkill(4, 'buff_def', '雷雲の加護', '雷雲が味方全体を覆い、防御力を高める。'),
  ],
  ouka: [
    defineSkill(4, 'heal_single', '桜花の癒し', '桜の花びらが味方単体の傷を癒す。'),
    defineSkill(4, 'heal_aoe', '花吹雪の祝福', '花吹雪が味方全体を包み、傷を癒す。'),
    defineSkill(4, 'revive', '返り咲き', '倒れた味方を、桜のように再び咲かせる。'),
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
  haruka: [
    defineSkill(3, 'nuke_single', '旅立ちの一太刀', '旅で磨いた剣で、敵単体を斬る。'),
    defineSkill(3, 'buff_atk', '旅団の鼓舞', '旅団仕込みの掛け声が、味方全体を奮い立たせる。'),
  ],
  jin: [
    defineSkill(3, 'nuke_single', '大剣斬り', '傭兵の大剣を振り下ろし、敵単体を叩き斬る。'),
    defineSkill(3, 'debuff_def', '鎧割り', '大剣で敵単体の鎧を割り、防御力を奪う。'),
  ],
  sora: [
    defineSkill(3, 'nuke_aoe', '空賊の乱れ撃ち', '銃と曲刀で、敵全体をかき回す。'),
    defineSkill(3, 'debuff_atk', '煙幕弾', '煙幕で敵単体の目をくらまし、攻撃力を奪う。'),
  ],
  gen: [
    defineSkill(3, 'nuke_single', '正拳突き', '研ぎ澄ました正拳で、敵単体を打ち抜く。'),
    defineSkill(3, 'stun', '気絶打', '急所を打ち、敵単体の動きを止める。'),
  ],
  rosa: [
    defineSkill(3, 'nuke_single', '薔薇の刺突', '細剣の鋭い突きで、敵単体を貫く。'),
    defineSkill(3, 'debuff_def', '隙突き', '鎧の隙を突き、敵単体の防御力を落とす。'),
  ],
  taiga: [
    defineSkill(3, 'nuke_aoe', '狼牙旋斬', '斧を振り回し、敵全体を薙ぎ払う。'),
    defineSkill(3, 'buff_atk', '狼の咆哮', '狼の咆哮が、味方全体の攻撃力を高める。'),
  ],
  miru: [
    defineSkill(3, 'nuke_aoe', '流星観測', '観測した流星を呼び、敵全体へ降らせる。'),
    defineSkill(3, 'debuff_def', '星読みの呪', '星の巡りを乱し、敵単体の守りを崩す。'),
  ],
  orga: [
    defineSkill(3, 'nuke_aoe', '爆裂調合', '調合した薬品を投げ、敵全体を爆ぜさせる。'),
    defineSkill(3, 'debuff_atk', '腐食薬', '薬液が敵単体の腕を鈍らせ、攻撃力を奪う。'),
  ],
  lune: [
    defineSkill(3, 'nuke_single', '月影の一撃', '月の影が刃となり、敵単体を撃つ。'),
    defineSkill(3, 'stun', '月光の囚縛', '月光が敵単体を縛り、動きを封じる。'),
  ],
  felix: [
    defineSkill(3, 'nuke_single', '精霊の一撃', '使い魔の精霊が、敵単体へ光弾を放つ。'),
    defineSkill(3, 'buff_atk', '精霊の加護', '精霊が味方全体に力を分け与える。'),
  ],
  tsubame: [
    defineSkill(3, 'nuke_single', '燕返しの矢', '素早い返しの一矢で、敵単体を射抜く。'),
    defineSkill(3, 'debuff_atk', '影縫いの矢', '影を射抜き、敵単体の動きを鈍らせて攻撃力を奪う。'),
  ],
  robin: [
    defineSkill(3, 'nuke_single', '義賊の早撃ち', '抜く手も見せぬ早撃ちで、敵単体を射抜く。'),
    defineSkill(3, 'buff_atk', '森の合図', '森の合図で、味方全体の攻撃を揃える。'),
  ],
  ines: [
    defineSkill(3, 'nuke_aoe', '砂嵐の矢雨', '砂嵐に矢を乗せ、敵全体へ降らせる。'),
    defineSkill(3, 'debuff_def', '熱砂の矢', '熱砂を纏う矢が、敵単体の守りを削る。'),
  ],
  kaede: [
    defineSkill(3, 'nuke_single', '紅葉の一射', '静かに放つ一射で、敵単体を射抜く。'),
    defineSkill(3, 'stun', '弓弦の響き', '弓弦を鳴らし、敵単体の動きを止める。'),
  ],
  gustav: [
    defineSkill(3, 'buff_def', '守衛の構え', '門を守る構えで、味方全体の防御力を高める。'),
    defineSkill(3, 'stun', '槍斧の一撃', '槍斧の柄で敵単体を打ち、動きを止める。'),
  ],
  bruno: [
    defineSkill(3, 'buff_def', '鍛冶の盾', '鍛えた盾で、味方全体の防御力を高める。'),
    defineSkill(3, 'nuke_single', '鉄槌の一撃', '大槌を振り下ろし、敵単体を叩く。'),
  ],
  doris: [
    defineSkill(3, 'buff_def', '修道の祈り', '祈りが味方全体を守り、防御力を高める。'),
    defineSkill(3, 'stun', '盾打ち', '大盾で敵単体を打ち、動きを止める。'),
  ],
  lena: [
    defineSkill(3, 'heal_single', '薬草の手当て', '薬草で味方単体の傷を手当てする。'),
    defineSkill(3, 'heal_aoe', '癒しの薬湯', '薬湯の香りが、味方全体の傷を癒す。'),
  ],
  noel: [
    defineSkill(3, 'heal_aoe', '聖歌の祝福', '聖歌が味方全体の傷を癒す。'),
    defineSkill(3, 'buff_atk', '聖歌隊の鼓舞', '聖歌が味方全体の攻撃力を鼓舞する。'),
  ],
  mimi: [
    defineSkill(3, 'heal_single', '獣医の手当て', '慣れた手つきで、味方単体の傷を手当てする。'),
    defineSkill(3, 'heal_aoe', '森の癒し', '白狐の癒しが、味方全体を包む。'),
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

  // =====================================================================================================
  // 2026-11: 80 more characters (the roster doubled). ★5 four skills, ★4 three, ★3 two, ★2-1 one.
  // =====================================================================================================

  // --- ★5 ---------------------------------------------------------------------------------------------
  phi: [
    defineSkill(5, 'nuke_single', '黄金螺旋斬', '黄金比の螺旋を描く斬撃で、敵単体を貫く。'),
    defineSkill(5, 'buff_atk', '比率の閃き', '最適な間合いを見抜き、味方全体の攻撃力を高める。'),
    defineSkill(5, 'debuff_def', '均衡崩し', '敵単体の守りの均衡を崩し、防御力を落とす。'),
    defineSkill(5, 'nuke_aoe', '螺旋剣舞', '螺旋の剣舞で戦場を駆け、敵全体を斬り払う。'),
  ],
  tau: [
    defineSkill(5, 'nuke_aoe', '円環断', '巨大な輪の刃を投げ放ち、敵全体を薙ぐ。'),
    defineSkill(5, 'buff_def', '円陣の覇気', '円環の陣で、味方全体の防御力を高める。'),
    defineSkill(5, 'stun', '覇者の一喝', '王の一喝で敵単体を竦ませ、行動を封じる。'),
    defineSkill(5, 'nuke_single', '環王の裁断', '輪刃を叩きつけ、敵単体を両断する。'),
  ],
  prime: [
    defineSkill(5, 'nuke_single', '素数の一矢', '割り切れぬ一矢が、敵単体を射抜く。'),
    defineSkill(5, 'debuff_atk', '孤影の照準', '照準に捉えた敵単体の攻撃力を奪う。'),
    defineSkill(5, 'stun', '静止の矢', '時の止まったような一矢で、敵単体の動きを縫い止める。'),
    defineSkill(5, 'nuke_aoe', '素因分解の雨', '光の矢を無数に分け、敵全体へ降らせる。'),
  ],
  sigma: [
    defineSkill(5, 'invincible', '総和の城塞', '積み重ねた金板が全てを弾き、しばらく無敵になる。'),
    defineSkill(5, 'buff_def', '加算の守護', '味方全体の防御を積み上げ、堅牢にする。'),
    defineSkill(5, 'stun', '女帝の威圧', '威厳の一睨みで、敵単体を行動不能にする。'),
    defineSkill(5, 'nuke_single', '王笏の一突き', '槍の王笏で、敵単体を貫く。'),
  ],
  delta: [
    defineSkill(5, 'nuke_single', '三叉の矢', '三つに裂ける矢で、敵単体を撃ち抜く。'),
    defineSkill(5, 'nuke_aoe', '次元裂き', '次元を裂く矢で、敵全体を切り刻む。'),
    defineSkill(5, 'debuff_def', '結晶の楔', '結晶の楔を打ち込み、敵単体の防御力を砕く。'),
    defineSkill(5, 'buff_atk', '光の追い風', '裂け目から吹く光が、味方全体の攻撃力を高める。'),
  ],
  serafina: [
    defineSkill(5, 'heal_single', '癒光の抱擁', '光の翼で味方単体を包み、傷を癒す。'),
    defineSkill(5, 'heal_aoe', '六翼の祝福', '六枚の翼が、味方全体の傷を一斉に癒す。'),
    defineSkill(5, 'revive', '大司教の奇跡', '祈りの奇跡で、倒れた味方を呼び戻す。'),
    defineSkill(5, 'buff_def', '聖域の加護', '聖域の光が、味方全体の防御力を高める。'),
  ],

  // --- ★4 ---------------------------------------------------------------------------------------------
  musashi: [
    defineSkill(4, 'nuke_single', '二天一流・断', '二刀を交差させ、敵単体を断ち斬る。'),
    defineSkill(4, 'nuke_aoe', '二刀乱れ斬り', '二刀を振るい、敵全体を斬り伏せる。'),
    defineSkill(4, 'debuff_def', '破鎧の太刀', '鎧を断つ太刀筋で、敵単体の防御力を削る。'),
  ],
  hild: [
    defineSkill(4, 'nuke_single', '戦乙女の槍', '翼で加速した槍で、敵単体を貫く。'),
    defineSkill(4, 'buff_atk', '勝利への号令', '戦乙女の号令が、味方全体の攻撃力を高める。'),
    defineSkill(4, 'nuke_aoe', '天駆ける斬撃', '空から舞い降り、敵全体を薙ぎ払う。'),
  ],
  shaolan: [
    defineSkill(4, 'nuke_single', '蒼龍拳', '龍気を纏う拳で、敵単体を打ち抜く。'),
    defineSkill(4, 'stun', '点穴', '急所を突き、敵単体の動きを止める。'),
    defineSkill(4, 'nuke_aoe', '昇龍連脚', '昇る龍の連脚で、敵全体を蹴り上げる。'),
  ],
  iris: [
    defineSkill(4, 'nuke_aoe', '七色の光条', '虹の光条で、敵全体を撃つ。'),
    defineSkill(4, 'debuff_atk', '屈折の幻惑', '光を曲げて敵単体を惑わせ、攻撃力を奪う。'),
    defineSkill(4, 'buff_atk', '虹の祝福', '虹の光が、味方全体の攻撃力を高める。'),
  ],
  chrono: [
    defineSkill(4, 'stun', '刻の停止', '時を止め、敵単体の動きを封じる。'),
    defineSkill(4, 'nuke_single', '遅延爆撃', '時間差の魔弾を、敵単体に叩き込む。'),
    defineSkill(4, 'buff_atk', '加速の刻印', '時の流れを早め、味方全体の攻撃力を高める。'),
  ],
  terra: [
    defineSkill(4, 'nuke_aoe', '岩峰召喚', '大地から岩の槍を突き上げ、敵全体を貫く。'),
    defineSkill(4, 'buff_def', '大地の護り', '大地の力が、味方全体の防御力を高める。'),
    defineSkill(4, 'nuke_single', '落岩', '巨岩を落とし、敵単体を押し潰す。'),
  ],
  somu: [
    defineSkill(4, 'stun', '子守りの霧', '眠気を誘う霧で、敵単体の動きを止める。'),
    defineSkill(4, 'debuff_atk', '悪夢の囁き', '悪夢を見せ、敵単体の攻撃力を奪う。'),
    defineSkill(4, 'nuke_aoe', '夢喰いの渦', '夢を喰らう渦で、敵全体を呑み込む。'),
  ],
  nerei: [
    defineSkill(4, 'nuke_aoe', '渦潮の怒り', '渦潮を呼び、敵全体を呑み込む。'),
    defineSkill(4, 'heal_aoe', '潮の恵み', '満ちる潮が、味方全体の傷を癒す。'),
    defineSkill(4, 'debuff_def', '水圧の枷', '水圧で敵単体を押さえ、防御力を落とす。'),
  ],
  hawk: [
    defineSkill(4, 'nuke_single', '鷹の目の一射', '鷹の眼で狙い澄まし、敵単体を射抜く。'),
    defineSkill(4, 'debuff_atk', '鷹の急襲', '鷹を放って敵単体を襲わせ、攻撃力を奪う。'),
    defineSkill(4, 'nuke_aoe', '羽ばたきの矢', '羽ばたく矢の群れで、敵全体を射る。'),
  ],
  kreis: [
    defineSkill(4, 'nuke_single', '重弩の一撃', '極太の矢で、敵単体を撃ち抜く。'),
    defineSkill(4, 'nuke_aoe', '連装掃射', '連装の弩で、敵全体を掃射する。'),
    defineSkill(4, 'stun', '楔打ち', '楔の矢で敵単体を縫い止め、動きを封じる。'),
  ],
  fiora: [
    defineSkill(4, 'nuke_single', '花弁の矢', '花弁をまとう矢で、敵単体を射る。'),
    defineSkill(4, 'buff_atk', '妖精の粉', '妖精の粉が、味方全体の攻撃力を高める。'),
    defineSkill(4, 'debuff_atk', '眠り花粉', '花粉で敵単体を惑わせ、攻撃力を奪う。'),
  ],
  gran: [
    defineSkill(4, 'buff_def', '岩腕の構え', '岩の腕で守りを固め、味方全体の防御力を高める。'),
    defineSkill(4, 'stun', '巨人の拳', '巨人の拳で敵単体を叩き、動きを止める。'),
    defineSkill(4, 'nuke_single', '落石の一撃', '岩の棍棒を振り下ろし、敵単体を打つ。'),
  ],
  torta: [
    defineSkill(4, 'invincible', '甲羅ごもり', '甲羅に籠もり、しばらくあらゆる攻撃を弾く。'),
    defineSkill(4, 'buff_def', '甲羅の守り', '甲羅の守りが、味方全体の防御力を高める。'),
    defineSkill(4, 'nuke_single', '甲羅突撃', '甲羅ごと体当たりし、敵単体を弾き飛ばす。'),
  ],
  magna: [
    defineSkill(4, 'stun', '鬼の咆哮', '鬼の咆哮で、敵単体を竦ませる。'),
    defineSkill(4, 'buff_def', '鉄鬼の護り', '鉄の鎧が仲間を守り、味方全体の防御力を高める。'),
    defineSkill(4, 'nuke_aoe', '金棒薙ぎ', '金棒を薙ぎ払い、敵全体を打ち据える。'),
  ],
  fleur: [
    defineSkill(4, 'heal_single', '花びらの手当て', '花びらが舞い、味方単体の傷を癒す。'),
    defineSkill(4, 'heal_aoe', '満開の祝福', '満開の花が、味方全体の傷を癒す。'),
    defineSkill(4, 'buff_def', '蔓の護り', '蔓が味方を包み、防御力を高める。'),
  ],
  shiro: [
    defineSkill(4, 'heal_single', '狐火の灯り', '温かな狐火が、味方単体の傷を癒す。'),
    defineSkill(4, 'buff_atk', '稲荷の加護', '稲荷の加護が、味方全体の攻撃力を高める。'),
    defineSkill(4, 'heal_aoe', '白狐の舞', '白狐の舞が、味方全体を癒す。'),
  ],
  rain: [
    defineSkill(4, 'heal_aoe', '慈雨', '恵みの雨が、味方全体の傷を癒す。'),
    defineSkill(4, 'heal_single', '雨だれの治癒', '雨粒が傷口を洗い、味方単体を癒す。'),
    defineSkill(4, 'debuff_atk', '霧雨の帳', '霧雨で敵単体の視界を奪い、攻撃力を落とす。'),
  ],
  weiss: [
    defineSkill(4, 'heal_single', '調合治療', '調合した薬で、味方単体を治療する。'),
    defineSkill(4, 'debuff_atk', '毒除けの煙', '特殊な煙で敵単体を弱らせ、攻撃力を落とす。'),
    defineSkill(4, 'heal_aoe', '霧中の施療', '薬の霧が、味方全体の傷を癒す。'),
  ],
  anju: [
    defineSkill(4, 'heal_single', '天使の口づけ', '天使の祈りが、味方単体の傷を癒す。'),
    defineSkill(4, 'revive', '見習い天使の奇跡', 'ひたむきな祈りが、倒れた味方を呼び戻す。'),
    defineSkill(4, 'buff_def', '白い羽根の護り', '白い羽根が舞い、味方全体の防御力を高める。'),
  ],

  // --- ★3 ---------------------------------------------------------------------------------------------
  dante: [
    defineSkill(3, 'nuke_single', '賞金首狩り', '狙った獲物を逃さず、敵単体を斬る。'),
    defineSkill(3, 'debuff_def', '咎人の一太刀', '急所を狙い、敵単体の防御力を削る。'),
  ],
  hinata: [
    defineSkill(3, 'nuke_single', '木刀一本', '稽古で鍛えた木刀で、敵単体を打つ。'),
    defineSkill(3, 'buff_atk', '道場の気合', '道場仕込みの気合が、味方全体を奮い立たせる。'),
  ],
  ulf: [
    defineSkill(3, 'nuke_aoe', '北海の大斧', '大斧を振り回し、敵全体をなぎ倒す。'),
    defineSkill(3, 'buff_atk', '戦士の雄叫び', '雄叫びが、味方全体の攻撃力を高める。'),
  ],
  cecil: [
    defineSkill(3, 'nuke_single', '落ち騎士の剣', '欠けた剣で、それでも敵単体を斬る。'),
    defineSkill(3, 'debuff_atk', '騎士の矜持', '気迫で敵単体を気圧し、攻撃力を落とす。'),
  ],
  leona: [
    defineSkill(3, 'nuke_single', '闘技場の一閃', '観衆の歓声を力に、敵単体を斬る。'),
    defineSkill(3, 'stun', '盾叩き', '小盾で敵単体を殴りつけ、動きを止める。'),
  ],
  toro: [
    defineSkill(3, 'stun', '紅布の誘い', '赤い布で敵単体を誘い、動きを止める。'),
    defineSkill(3, 'nuke_single', '闘牛の一突き', '鋭い突きで、敵単体を貫く。'),
  ],
  skadi: [
    defineSkill(3, 'nuke_single', '氷槍の一撃', '氷の槍で、敵単体を貫く。'),
    defineSkill(3, 'debuff_atk', '凍える風', '凍てつく風が、敵単体の力を奪う。'),
  ],
  bao: [
    defineSkill(3, 'nuke_aoe', '酔拳乱舞', '千鳥足の乱舞で、敵全体を打つ。'),
    defineSkill(3, 'drain_single', '酒気の一撃', '酒の勢いで敵単体を殴り、生気を奪う。'),
  ],
  mike: [
    defineSkill(3, 'nuke_single', '見習いの火花', '覚えたての魔法で、敵単体を撃つ。'),
    defineSkill(3, 'buff_atk', '黒猫の幸運', '黒猫の幸運が、味方全体の攻撃力を高める。'),
  ],
  faust: [
    defineSkill(3, 'nuke_aoe', '頁の嵐', '無数の頁を飛ばし、敵全体を斬る。'),
    defineSkill(3, 'debuff_def', '禁書の注釈', '禁書の一節で、敵単体の防御力を落とす。'),
  ],
  kon: [
    defineSkill(3, 'nuke_aoe', '狐火乱舞', '狐火を乱れ飛ばし、敵全体を焼く。'),
    defineSkill(3, 'stun', '化かし', '化かして敵単体を惑わせ、動きを止める。'),
  ],
  rook: [
    defineSkill(3, 'nuke_single', '猟犬の追撃', '猟犬と共に獲物を追い、敵単体を射抜く。'),
    defineSkill(3, 'debuff_atk', '足止めの矢', '足を狙って、敵単体の力を削ぐ。'),
  ],
  annie: [
    defineSkill(3, 'nuke_single', '早撃ち', '目にも止まらぬ早撃ちで、敵単体を撃つ。'),
    defineSkill(3, 'nuke_aoe', '乱れ撃ち', '連射で、敵全体を撃ち抜く。'),
  ],
  hibari: [
    defineSkill(3, 'nuke_single', '雲雀の一矢', '高く舞い上がる矢で、敵単体を射る。'),
    defineSkill(3, 'buff_atk', 'さえずりの鼓舞', '澄んださえずりが、味方全体を鼓舞する。'),
  ],
  tengri: [
    defineSkill(3, 'nuke_aoe', '草原の矢雨', '草原を渡る風に乗せ、矢の雨を降らせる。'),
    defineSkill(3, 'debuff_def', '騎射の一矢', '馬上仕込みの一矢で、敵単体の守りを崩す。'),
  ],
  isana: [
    defineSkill(3, 'nuke_single', '銛打ち', '大銛を放ち、敵単体を貫く。'),
    defineSkill(3, 'stun', '綱絡め', '綱で敵単体を絡め取り、動きを止める。'),
  ],
  cyril: [
    defineSkill(3, 'nuke_single', '速達の矢', '手紙を結んだ矢が、敵単体に確かに届く。'),
    defineSkill(3, 'buff_atk', '朗報の便り', '良い知らせが、味方全体の攻撃力を高める。'),
  ],
  moss: [
    defineSkill(3, 'buff_def', '苔の鎧', '苔むす体が、味方全体の防御力を高める。'),
    defineSkill(3, 'stun', '石塊の落下', '石の塊を落とし、敵単体を止める。'),
  ],
  grete: [
    defineSkill(3, 'buff_def', '鍋蓋の守り', '大きな鍋蓋で、味方全体を守る。'),
    defineSkill(3, 'nuke_single', 'フライパン一閃', '熱々のフライパンで、敵単体を殴る。'),
  ],
  ivan: [
    defineSkill(3, 'buff_def', '雪国の防壁', '雪を固めた壁が、味方全体の防御力を高める。'),
    defineSkill(3, 'stun', '斧の柄打ち', '斧の柄で敵単体を叩き、動きを止める。'),
  ],
  teo: [
    defineSkill(3, 'buff_def', '従騎士の誓い', '誓いを胸に、味方全体の防御力を高める。'),
    defineSkill(3, 'nuke_single', '見習いの突き', '精一杯の突きを、敵単体に放つ。'),
  ],
  amara: [
    defineSkill(3, 'buff_def', '太陽の盾', '陽光を宿す盾で、味方全体を守る。'),
    defineSkill(3, 'stun', '砂塵の盾打ち', '砂塵と共に盾を叩きつけ、敵単体を止める。'),
  ],
  rhino: [
    defineSkill(3, 'stun', '突角突進', '角で突進し、敵単体の動きを止める。'),
    defineSkill(3, 'buff_def', '犀の鎧', '分厚い鎧が、味方全体の防御力を高める。'),
  ],
  ravi: [
    defineSkill(3, 'buff_def', '梵鐘の守り', '鐘の音が、味方全体の防御力を高める。'),
    defineSkill(3, 'stun', '鐘の一撃', '鐘を打ち鳴らし、敵単体を怯ませる。'),
  ],
  pia: [
    defineSkill(3, 'heal_single', '野戦の応急手当', '素早い応急手当で、味方単体を治療する。'),
    defineSkill(3, 'heal_aoe', '灯火の看護', '灯火の下、味方全体の傷を手当てする。'),
  ],
  hugo: [
    defineSkill(3, 'heal_single', '薬酒の一杯', '薬酒の一杯が、味方単体の傷を癒す。'),
    defineSkill(3, 'buff_atk', '宴の活力', '陽気な活力が、味方全体の攻撃力を高める。'),
  ],
  lotta: [
    defineSkill(3, 'heal_aoe', '旅の子守唄', '穏やかな歌が、味方全体の傷を癒す。'),
    defineSkill(3, 'buff_atk', '陽気な行進曲', '陽気な旋律が、味方全体の攻撃力を高める。'),
  ],
  sachi: [
    defineSkill(3, 'heal_aoe', '湯けむりの癒し', '温かな湯けむりが、味方全体の傷を癒す。'),
    defineSkill(3, 'heal_single', '湯桶の一杯', '温かな湯で、味方単体の傷を癒す。'),
  ],
  owen: [
    defineSkill(3, 'heal_single', '森の薬草', '森の薬草で、味方単体を治療する。'),
    defineSkill(3, 'heal_aoe', '梟の見守り', '梟の見守りが、味方全体の傷を癒す。'),
  ],
  tsumugi: [
    defineSkill(3, 'heal_single', '縫合の糸', '光る糸で傷を縫い合わせ、味方単体を癒す。'),
    defineSkill(3, 'buff_def', '継ぎ当ての加護', '丈夫な継ぎ当てが、味方全体の防御力を高める。'),
  ],

  // --- ★2 : 1-skill kits ------------------------------------------------------------------------------
  cain: [defineSkill(2, 'nuke_single', '見習いの剣闘', '闘技場で覚えた一撃を、敵単体へ。')],
  nene: [defineSkill(2, 'nuke_aoe', '棒術の薙ぎ', '長い棒を振るい、敵全体を打つ。')],
  tobi: [defineSkill(2, 'nuke_single', '授業で習った魔弾', '習いたての魔弾を、敵単体へ放つ。')],
  nel: [defineSkill(2, 'debuff_atk', '雪の冷たさ', '雪の冷気で、敵単体の攻撃力を落とす。')],
  sparky: [defineSkill(2, 'stun', '静電気ショック', '火花で敵単体を痺れさせ、動きを止める。')],
  mugi: [defineSkill(2, 'nuke_single', '麦畑の一矢', '素朴な一矢で、敵単体を射る。')],
  kei: [defineSkill(2, 'nuke_single', '狩りの一矢', '身を潜めて放つ一矢で、敵単体を射る。')],
  lily: [defineSkill(2, 'debuff_atk', '羊追いの石', '投げた石で敵単体を怯ませ、攻撃力を落とす。')],
  dote: [defineSkill(2, 'buff_def', '門番の構え', '門を固く守り、味方全体の防御力を高める。')],
  kuma: [defineSkill(2, 'stun', '熊の一撃', '熊の勢いで敵単体を叩き、動きを止める。')],
  hank: [defineSkill(2, 'nuke_single', '木こりの一振り', '斧を振り下ろし、敵単体を叩き割る。')],
  bell: [defineSkill(2, 'buff_def', '鐘の音の守り', '鐘の音が、味方全体の防御力を高める。')],
  hana: [defineSkill(2, 'heal_single', '花の手当て', '花の香りが、味方単体の傷を癒す。')],
  miel: [defineSkill(2, 'heal_aoe', '蜂蜜の甘さ', '甘い蜂蜜が、味方全体の傷を癒す。')],
  tomo: [defineSkill(2, 'heal_single', '見習いの祈り', 'ひたむきな祈りが、味方単体の傷を癒す。')],

  // --- ★1 : 1-skill kits ------------------------------------------------------------------------------
  nuts: [defineSkill(1, 'nuke_single', '石つぶて', '小石を放ち、敵単体にぶつける。')],
  rie: [defineSkill(1, 'nuke_single', '森の少女の矢', '精一杯引いた矢を、敵単体へ。')],
  taka: [defineSkill(1, 'debuff_atk', '罠の下準備', '仕掛けた罠で、敵単体の攻撃力を落とす。')],
  don: [defineSkill(1, 'buff_def', '木盾の構え', '木の盾を構え、味方全体の防御力を高める。')],
  rock: [defineSkill(1, 'stun', '石頭の頭突き', '固い頭で、敵単体に頭突きをかます。')],
  pam: [defineSkill(1, 'buff_def', '門前の見張り', '門前で見張り、味方全体の防御力を高める。')],
  yomo: [defineSkill(1, 'heal_single', '薬草の煎じ汁', '煎じた薬草で、味方単体の傷を癒す。')],
  mio: [defineSkill(1, 'heal_aoe', '新米僧の祈祷', '真心の祈りが、味方全体を癒す。')],
  tiko: [defineSkill(1, 'nuke_single', '背伸びの魔法', '大きな魔法を、背伸びして敵単体へ。')],
  ryo: [defineSkill(1, 'nuke_single', '木刀の一振り', '木刀を精一杯振り下ろし、敵単体を打つ。')],

  // --- Made ahead of time (2026-11): ★6 x10, then ★5 x20 - released two at a time (data/heroRelease.ts) ---------------------
  omega: [
    defineSkill(6, 'nuke_single', '終焉断', '環状の炎刃を振り下ろし、敵単体を終わらせる。'),
    defineSkill(6, 'nuke_aoe', '終の薙ぎ', '大剣を一閃し、戦場の敵全てを焼き払う。'),
    defineSkill(6, 'debuff_def', '落日の宣告', '落ちる陽のごとく、敵単体の守りを崩す。'),
    defineSkill(6, 'buff_atk', '覇王の鬨', '覇王の鬨の声が、味方全体の攻撃力を極限まで高める。'),
  ],
  alpha: [
    defineSkill(6, 'nuke_single', '始まりの一閃', '光の一筋を放ち、敵単体を貫く。'),
    defineSkill(6, 'buff_atk', '夜明けの号令', '夜明けの光が、味方全体の攻撃力を高める。'),
    defineSkill(6, 'drain_single', '原初の剣舞', '剣舞で敵単体を斬り、その力を奪って傷を癒す。'),
    defineSkill(6, 'nuke_aoe', '創世の光刃', '光の刃が広がり、敵全体を斬り払う。'),
  ],
  zero: [
    defineSkill(6, 'invincible', '虚無の外套', '虚空の闇が身を包み、しばらくあらゆる攻撃を無効にする。'),
    defineSkill(6, 'buff_def', '空環の守り', '空の環が広がり、味方全体の防御力を高める。'),
    defineSkill(6, 'debuff_atk', '無への引力', '敵単体の力を虚空へ吸い込み、攻撃力を削ぐ。'),
    defineSkill(6, 'stun', '静寂の円環', '音も動きも消える静寂で、敵単体の行動を封じる。'),
  ],
  godel: [
    defineSkill(6, 'buff_def', '不完全の城壁', '欠けた壁が、かえって攻撃を受け流し、味方全体を守る。'),
    defineSkill(6, 'invincible', '証明されざる鎧', '証明できぬ鎧が、しばらくあらゆる攻撃を無効にする。'),
    defineSkill(6, 'stun', '矛盾の一撃', '矛盾を突く一撃で、敵単体の動きを止める。'),
    defineSkill(6, 'nuke_single', '決定不能の鉄槌', '決められぬ運命ごと叩き潰し、敵単体を砕く。'),
  ],
  euler: [
    defineSkill(6, 'nuke_aoe', '螺旋の大魔法', '黄金の螺旋が戦場を渦巻き、敵全体を呑み込む。'),
    defineSkill(6, 'buff_atk', '賢帝の導き', '賢帝の導きが、味方全体の攻撃力を高める。'),
    defineSkill(6, 'debuff_atk', '定数の枷', '揺るがぬ定数の枷が、敵単体の攻撃力を落とす。'),
    defineSkill(6, 'nuke_single', '五環の閃光', '五つの環が重なる一撃で、敵単体を撃ち抜く。'),
  ],
  riemann: [
    defineSkill(6, 'nuke_aoe', '零点の星雨', '臨界線の星々が降り注ぎ、敵全体を打つ。'),
    defineSkill(6, 'drain_single', '魔女の吸収', '敵単体の力を吸い上げ、自らの傷を癒す。'),
    defineSkill(6, 'debuff_def', '臨界の呪い', '臨界の呪いが、敵単体の防御力を砕く。'),
    defineSkill(6, 'stun', '沈黙の零点', '零点の静寂が、敵単体の行動を封じる。'),
  ],
  cantor: [
    defineSkill(6, 'nuke_single', '無限階梯の矢', '段を重ねる無限の矢で、敵単体を射抜く。'),
    defineSkill(6, 'nuke_aoe', '分裂する矢雨', '一本の矢が無数に分かれ、敵全体に降り注ぐ。'),
    defineSkill(6, 'buff_atk', '濃度の加護', '階梯の力が、味方全体の攻撃力を高める。'),
    defineSkill(6, 'debuff_def', '対角線の矢', '誰も避けられぬ対角線の矢が、敵単体の防御を貫く。'),
  ],
  fermat: [
    defineSkill(6, 'nuke_single', '余白の一矢', '余白に潜んだ一矢で、敵単体を射抜く。'),
    defineSkill(6, 'debuff_def', '見えざる狙い', '狙いを悟らせず、敵単体の防御力を落とす。'),
    defineSkill(6, 'nuke_aoe', '驚異の矢嵐', '驚異の矢が嵐となって、敵全体を射抜く。'),
    defineSkill(6, 'buff_atk', '狩人の秘密', '狩人の秘訣を分かち、味方全体の攻撃力を高める。'),
  ],
  pi: [
    defineSkill(6, 'heal_aoe', '円環の歌', '終わりなき歌が、味方全体の傷を癒す。'),
    defineSkill(6, 'heal_single', '真珠の祈り', '真珠の光が、味方単体を優しく癒す。'),
    defineSkill(6, 'buff_def', '輪舞の加護', '輪になる光が、味方全体の防御力を高める。'),
    defineSkill(6, 'revive', '永遠の旋律', '永遠の旋律が、倒れた味方を呼び戻す。'),
  ],
  noether: [
    defineSkill(6, 'heal_single', '鏡映の癒し', '鏡写しの光が、味方単体の傷を癒す。'),
    defineSkill(6, 'heal_aoe', '対称の祝福', '左右対称の光が、味方全体を包む。'),
    defineSkill(6, 'buff_def', '保存の加護', '失われぬ守りが、味方全体の防御力を高める。'),
    defineSkill(6, 'revive', '聖女の奇跡', '聖女の奇跡が、倒れた味方を呼び戻す。'),
  ],
  lambda: [
    defineSkill(5, 'nuke_single', '疾駆の双閃', '二つの短剣を閃かせ、敵単体を斬る。'),
    defineSkill(5, 'buff_atk', '加速の号令', '疾走の勢いで、味方全体の攻撃力を高める。'),
    defineSkill(5, 'nuke_aoe', '風裂き', '駆け抜けざまに、敵全体を斬り裂く。'),
    defineSkill(5, 'debuff_def', '足止めの一撃', '足を払う一撃で、敵単体の防御力を落とす。'),
  ],
  kappa: [
    defineSkill(5, 'nuke_single', '断頭の一撃', '大包丁を振り下ろし、敵単体を断つ。'),
    defineSkill(5, 'debuff_def', '骨砕き', '鎧ごと打ち砕き、敵単体の防御力を削る。'),
    defineSkill(5, 'buff_atk', '剛力の咆哮', '咆哮で、味方全体の攻撃力を高める。'),
    defineSkill(5, 'nuke_aoe', '地割れ斬り', '大地ごと断ち、敵全体を薙ぐ。'),
  ],
  theta: [
    defineSkill(5, 'nuke_single', '鋭角の突き', '最短の角度で、敵単体を貫く。'),
    defineSkill(5, 'debuff_def', '角度の見切り', '守りの隙を見切り、敵単体の防御力を落とす。'),
    defineSkill(5, 'buff_atk', '最適角の導き', '最適の角度を示し、味方全体の攻撃力を高める。'),
    defineSkill(5, 'nuke_aoe', '弧を描く連撃', '弧を描く連撃で、敵全体を斬る。'),
  ],
  xi: [
    defineSkill(5, 'nuke_single', '影縫い', '影から影へ走り、敵単体を斬る。'),
    defineSkill(5, 'stun', '影縛り', '影を縫い止め、敵単体の行動を封じる。'),
    defineSkill(5, 'drain_single', '闇討ち', '闇に紛れて斬り、力を奪い取る。'),
    defineSkill(5, 'nuke_aoe', '影分身の刃', '影の分身と共に、敵全体を斬り払う。'),
  ],
  rho: [
    defineSkill(5, 'nuke_single', '紅蓮の突撃', '炎の槍で、敵単体を貫く。'),
    defineSkill(5, 'nuke_aoe', '烈火の薙ぎ払い', '炎の槍を薙ぎ、敵全体を焼く。'),
    defineSkill(5, 'buff_atk', '騎士の誓い', '誓いの炎が、味方全体の攻撃力を高める。'),
    defineSkill(5, 'debuff_atk', '威圧の旗印', '紅の気迫で、敵単体の攻撃力を落とす。'),
  ],
  psi: [
    defineSkill(5, 'nuke_single', '念動の矢', '念じた力を放ち、敵単体を撃つ。'),
    defineSkill(5, 'stun', '精神の縛り', '心を縛り、敵単体の行動を封じる。'),
    defineSkill(5, 'debuff_atk', '幻惑の囁き', '惑わせて、敵単体の攻撃力を落とす。'),
    defineSkill(5, 'nuke_aoe', '精神の嵐', '心の嵐が、敵全体を襲う。'),
  ],
  eta: [
    defineSkill(5, 'nuke_aoe', '蒼穹の雷雲', '雲を呼び、雷で敵全体を打つ。'),
    defineSkill(5, 'nuke_single', '風刃', '風の刃で、敵単体を切り裂く。'),
    defineSkill(5, 'buff_atk', '追い風', '追い風で、味方全体の攻撃力を高める。'),
    defineSkill(5, 'debuff_def', '霧の帳', '霧で守りを曇らせ、敵単体の防御力を落とす。'),
  ],
  nu: [
    defineSkill(5, 'nuke_single', '流星の一矢', '流星のごとき矢で、敵単体を射抜く。'),
    defineSkill(5, 'nuke_aoe', '流星群', '降る星の雨で、敵全体を撃つ。'),
    defineSkill(5, 'buff_atk', '星屑の加護', '星屑が、味方全体の攻撃力を高める。'),
    defineSkill(5, 'debuff_def', '彗星の尾', '彗星の尾が、敵単体の防御力を削る。'),
  ],
  mu: [
    defineSkill(5, 'nuke_single', '極細の狙撃', '針の穴を通す狙撃で、敵単体を射抜く。'),
    defineSkill(5, 'debuff_def', '急所狙い', '急所を撃ち、敵単体の防御力を落とす。'),
    defineSkill(5, 'stun', '麻痺の一矢', '痺れの矢で、敵単体の行動を封じる。'),
    defineSkill(5, 'buff_atk', '精密の号令', '狙いの精度で、味方全体の攻撃力を高める。'),
  ],
  chi: [
    defineSkill(5, 'nuke_single', '交差の一射', '交差する二矢で、敵単体を射抜く。'),
    defineSkill(5, 'nuke_aoe', '十字砲火', '十字に矢を撃ち、敵全体を狙う。'),
    defineSkill(5, 'debuff_atk', '牽制の矢', '牽制の矢で、敵単体の攻撃力を落とす。'),
    defineSkill(5, 'buff_atk', '息の合った連携', '呼吸を合わせ、味方全体の攻撃力を高める。'),
  ],
  iota: [
    defineSkill(5, 'nuke_single', '一矢入魂', '一本の矢に魂を込め、敵単体を射抜く。'),
    defineSkill(5, 'debuff_def', '静かな狙い', '気配を消し、敵単体の防御力を落とす。'),
    defineSkill(5, 'buff_atk', '老練の知恵', '長年の知恵で、味方全体の攻撃力を高める。'),
    defineSkill(5, 'nuke_aoe', '千里の矢', '遠く千里へ、敵全体を射抜く。'),
  ],
  omicron: [
    defineSkill(5, 'buff_def', '小円の守り', '小さな円陣で、味方全体を守る。'),
    defineSkill(5, 'invincible', '丸鎧の殻', '丸い鎧で身を縮め、しばらくあらゆる攻撃を無効にする。'),
    defineSkill(5, 'debuff_atk', '転がる威圧', '転がり込む勢いで、敵単体の攻撃力を落とす。'),
    defineSkill(5, 'stun', '丸盾の体当たり', '丸盾でぶつかり、敵単体の行動を封じる。'),
  ],
  upsilon: [
    defineSkill(5, 'buff_def', '大地の壁', '大地の壁を築き、味方全体の防御力を高める。'),
    defineSkill(5, 'invincible', '岩の抱擁', '岩のように動じず、しばらくあらゆる攻撃を無効にする。'),
    defineSkill(5, 'stun', '地鳴り', '地を鳴らし、敵単体の行動を封じる。'),
    defineSkill(5, 'nuke_single', '石槌の一撃', '石の槌で、敵単体を叩く。'),
  ],
  beta: [
    defineSkill(5, 'buff_def', '堅守の構え', '盾を構え、味方全体の防御力を高める。'),
    defineSkill(5, 'invincible', '不動の騎士', '一歩も退かず、しばらくあらゆる攻撃を無効にする。'),
    defineSkill(5, 'debuff_atk', '盾打ち', '盾で打ち据え、敵単体の攻撃力を落とす。'),
    defineSkill(5, 'nuke_single', '騎士の一閃', '長剣を振り下ろし、敵単体を斬る。'),
  ],
  gamma: [
    defineSkill(5, 'buff_def', '烈光の防壁', '光の防壁が、味方全体の防御力を高める。'),
    defineSkill(5, 'invincible', '城壁の輝き', '輝く城壁となり、しばらくあらゆる攻撃を無効にする。'),
    defineSkill(5, 'stun', '閃光の旗', '閃光の旗で目を眩ませ、敵単体の行動を封じる。'),
    defineSkill(5, 'nuke_aoe', '光の砲撃', '城壁の光が弾け、敵全体を撃つ。'),
  ],
  epsilon: [
    defineSkill(5, 'heal_single', '微光の灯り', '小さな光が、味方単体の傷を癒す。'),
    defineSkill(5, 'heal_aoe', '蛍の群れ', '蛍の光が、味方全体の傷を癒す。'),
    defineSkill(5, 'buff_def', 'ささやかな祈り', '祈りが、味方全体の防御力を高める。'),
    defineSkill(5, 'revive', '最後の灯火', '消えかけた灯火が、倒れた味方を呼び戻す。'),
  ],
  oasis: [
    defineSkill(5, 'heal_single', '泉の恵み', '湧き出る水が、味方単体の傷を癒す。'),
    defineSkill(5, 'heal_aoe', '水の舞', '水の舞が、味方全体を潤し癒す。'),
    defineSkill(5, 'buff_def', '清水の加護', '澄んだ水が、味方全体の防御力を高める。'),
    defineSkill(5, 'revive', '命の湧き水', '尽きぬ泉が、倒れた味方を呼び戻す。'),
  ],
  aurum: [
    defineSkill(5, 'heal_single', '黄金の施術', '黄金の光で、味方単体の傷を癒す。'),
    defineSkill(5, 'heal_aoe', '万能の霊薬', '霊薬の霧が、味方全体を癒す。'),
    defineSkill(5, 'buff_atk', '活力の処方', '活力を与え、味方全体の攻撃力を高める。'),
    defineSkill(5, 'revive', '蘇生の秘術', '秘術で、倒れた味方を呼び戻す。'),
  ],
  lumen: [
    defineSkill(5, 'heal_single', '手当ての灯', '灯りの手当てで、味方単体の傷を癒す。'),
    defineSkill(5, 'heal_aoe', '夜明けのランタン', '灯りが広がり、味方全体を癒す。'),
    defineSkill(5, 'buff_def', '安らぎの光', '安らぎの光が、味方全体の防御力を高める。'),
    defineSkill(5, 'revive', '希望の灯火', '希望の灯火が、倒れた味方を呼び戻す。'),
  ],
  pax: [
    defineSkill(5, 'heal_single', '平穏の手', '平穏の手が、味方単体の傷を癒す。'),
    defineSkill(5, 'heal_aoe', '白鳩の祝福', '白い鳩が舞い、味方全体を癒す。'),
    defineSkill(5, 'buff_def', '和平の加護', '和平の加護が、味方全体の防御力を高める。'),
    defineSkill(5, 'revive', '再生の祈り', '祈りが、倒れた味方を呼び戻す。'),
  ],
};

/** HERO_SKILL_ROWS with each skill's `name` and `description` read through tr() every time they are used (`localized()`), so the
 *  text follows the language and no call site changes. The English is in i18n/data/skillsEn.ts under `skill.<heroId>_<slot>`
 *  (slot = the position in the hero's kit above). `id` stays what defineSkill made of the Japanese, so it never changes. */
export const HERO_SKILLS: Record<string, SkillDefinition[]> = Object.fromEntries(
  Object.entries(HERO_SKILL_ROWS).map(([heroId, kit]) => [heroId, kit.map((def, slot) => localized('skill', `${heroId}_${slot}`, def, ['name', 'description']))]),
);
