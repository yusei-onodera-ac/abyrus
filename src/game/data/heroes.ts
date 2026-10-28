import type { HeroClass, HeroData, Rarity } from '../types';

/** A roster slot: one fixed character with its own portrait, name and class.
 *  Gacha pulls and starter heroes are always instances of one of these. */
export interface HeroDefinition {
  id: string;
  name: string;
  heroClass: HeroClass;
  rarity: Rarity;
}

export const HERO_ROSTER: HeroDefinition[] = [
  { id: 'gauss', name: '算盤王ガウス', heroClass: 'tank', rarity: 5 },
  { id: 'aria', name: '虚数姫アリア', heroClass: 'healer', rarity: 5 },
  { id: 'zeno', name: '無限桁のゼノ', heroClass: 'mage', rarity: 5 },
  { id: 'ren', name: '黒刃のレン', heroClass: 'warrior', rarity: 4 },
  { id: 'suzuna', name: '百矢のスズナ', heroClass: 'archer', rarity: 4 },
  { id: 'baron', name: '守壁のバロン', heroClass: 'tank', rarity: 4 },
  { id: 'kai', name: '業火のカイ', heroClass: 'mage', rarity: 3 },
  { id: 'mina', name: '疾風のミナ', heroClass: 'archer', rarity: 3 },
  { id: 'noa', name: '癒しのノア', heroClass: 'healer', rarity: 3 },
  { id: 'rei', name: '無冠のレイ', heroClass: 'warrior', rarity: 2 },
  { id: 'yuno', name: '夜事のユノ', heroClass: 'healer', rarity: 2 },
  { id: 'touma', name: '見習いのトウマ', heroClass: 'warrior', rarity: 1 },

  // Illustrated batch 1 ("強そう" — strong-looking), ★4-5.
  { id: 'sylva', name: '緑陣のシルヴァ', heroClass: 'warrior', rarity: 4 },
  { id: 'nova', name: '閃光のノヴァ', heroClass: 'archer', rarity: 4 },
  { id: 'kohaku', name: '疾爪のコハク', heroClass: 'warrior', rarity: 4 },
  { id: 'dias', name: '魔剣のディアス', heroClass: 'warrior', rarity: 4 },
  { id: 'astra', name: '星導のアストラ', heroClass: 'mage', rarity: 5 },
  { id: 'viara', name: '蠱毒の女王ヴィアラ', heroClass: 'mage', rarity: 5 },
  { id: 'ignis', name: '溶岩のイグニス', heroClass: 'tank', rarity: 4 },
  { id: 'shade', name: '冥灯のシェイド', heroClass: 'mage', rarity: 5 },
  { id: 'seira', name: '氷波のセイラ', heroClass: 'archer', rarity: 4 },

  // Illustrated batch 2 ("普通そう" — normal-looking), ★1-3.
  { id: 'mizuki', name: '新兵のミズキ', heroClass: 'warrior', rarity: 1 },
  { id: 'ald', name: '新米剣士アルド', heroClass: 'warrior', rarity: 1 },
  { id: 'pino', name: '歯車のピノ', heroClass: 'warrior', rarity: 1 },
  { id: 'garnet', name: '赤髪のガーネット', heroClass: 'warrior', rarity: 1 },
  { id: 'zayd', name: '双刃のザイド', heroClass: 'warrior', rarity: 1 },
  { id: 'ember', name: '火書のエンバー', heroClass: 'mage', rarity: 1 },
  { id: 'momo', name: '森番のモモ', heroClass: 'warrior', rarity: 2 },
  { id: 'lumi', name: '陽光のルミ', heroClass: 'healer', rarity: 2 },
  { id: 'fione', name: '氷刃のフィオネ', heroClass: 'warrior', rarity: 2 },
  { id: 'enju', name: '炎拳のエンジュ', heroClass: 'warrior', rarity: 2 },
  { id: 'fern', name: '森弓のフェルン', heroClass: 'archer', rarity: 2 },
  { id: 'kuroto', name: '影鎖のクロト', heroClass: 'warrior', rarity: 2 },
  { id: 'marin', name: '海賊のマリン', heroClass: 'archer', rarity: 2 },
  { id: 'celes', name: '聖琴のセレス', heroClass: 'healer', rarity: 3 },
  { id: 'toxar', name: '毒蛇のトクサル', heroClass: 'mage', rarity: 3 },
  { id: 'nyx', name: '夜魔のニクス', heroClass: 'mage', rarity: 3 },
  { id: 'morrigan', name: '狙撃のモリガン', heroClass: 'archer', rarity: 3 },

  // Illustrated batch 3 ("普通そう" — normal-looking, second drop), ★1-3.
  { id: 'brisa', name: '原野のブリサ', heroClass: 'warrior', rarity: 1 },
  { id: 'finn', name: '調合のフィン', heroClass: 'mage', rarity: 1 },
  { id: 'rin', name: '拳闘のリン', heroClass: 'warrior', rarity: 1 },
  { id: 'volt', name: '電撃のヴォルト', heroClass: 'warrior', rarity: 2 },
  { id: 'karna', name: '双撃のカルナ', heroClass: 'warrior', rarity: 2 },
  { id: 'mei', name: '双刃舞のメイ', heroClass: 'warrior', rarity: 2 },
  { id: 'raiga', name: '疾風のライガ', heroClass: 'warrior', rarity: 2 },
  { id: 'tia', name: '旋槍のティア', heroClass: 'warrior', rarity: 2 },
  { id: 'joker', name: '賭数のジョーカー', heroClass: 'mage', rarity: 2 },
  { id: 'elrin', name: '聖盾のエルリン', heroClass: 'tank', rarity: 3 },
  { id: 'fros', name: '氷晶のフロス', heroClass: 'mage', rarity: 3 },
  { id: 'noct', name: '星暦のノクト', heroClass: 'mage', rarity: 3 },
];

export function getHeroDefinition(heroId: string): HeroDefinition | undefined {
  return HERO_ROSTER.find((h) => h.id === heroId);
}

export function getHeroesByRarity(rarity: Rarity): HeroDefinition[] {
  return HERO_ROSTER.filter((h) => h.rarity === rarity);
}

/** Deterministic 32-bit hash so every copy of a roster hero always draws the
 *  same procedural fallback portrait (used as the legacy `seed` field),
 *  instead of a new random one on every gacha pull. */
export function heroSeedFromId(heroId: string): number {
  let hash = 0;
  for (let i = 0; i < heroId.length; i++) {
    hash = (Math.imul(hash, 31) + heroId.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function createHeroInstance(heroId: string, instanceId: string, level = 1, exp = 0): HeroData {
  const def = getHeroDefinition(heroId);
  if (!def) throw new Error(`Unknown hero id: ${heroId}`);
  return {
    id: instanceId,
    heroId: def.id,
    seed: heroSeedFromId(def.id),
    rarity: def.rarity,
    heroClass: def.heroClass,
    name: def.name,
    level,
    exp,
  };
}
