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
