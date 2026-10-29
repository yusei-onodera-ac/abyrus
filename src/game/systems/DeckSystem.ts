import type { HeroClass, HeroData } from '../types';
import { ProgressionSystem } from './ProgressionSystem';
import type { Deck } from './SaveSystem';

export const MAX_DECKS = 5;
/** Longest deck name, in characters. */
export const DECK_NAME_MAX = 8;
export const FRONT_SLOTS = 3;
export const BACK_SLOTS = 2;

const pad = (ids: string[], size: number): (string | null)[] => Array.from({ length: size }, (_, i) => ids[i] ?? null);

export function emptyDeck(name: string): Deck {
  return { name, front: pad([], FRONT_SLOTS), back: pad([], BACK_SLOTS) };
}

/** Lowest "デッキN" not already taken by another deck. */
export function defaultDeckName(decks: Deck[]): string {
  const taken = new Set(decks.map((d) => d.name));
  for (let n = 1; ; n++) {
    const name = `デッキ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Trims and caps a typed name; a blank one falls back to `fallback`. */
export function cleanDeckName(raw: string, fallback: string): string {
  const name = Array.from(raw.trim()).slice(0, DECK_NAME_MAX).join('');
  return name || fallback;
}

/** Front-line suitability: enemies hit the front row first, so sturdier
 *  classes go there and the squishy damage/support classes behind them. */
const FRONT_PRIORITY: Record<HeroClass, number> = { tank: 0, warrior: 1, archer: 2, healer: 3, mage: 4 };

/** お任せ編成: the five highest-power characters owned (a character's strongest
 *  copy - a deck holds one of each), arranged by class so the sturdiest stand
 *  in front. With fewer than five it fills what it can. */
export function autoFormation(heroes: HeroData[]): Pick<Deck, 'front' | 'back'> {
  const seen = new Set<string>();
  const ranked = heroes
    .map((hero) => ({ hero, power: ProgressionSystem.computeHeroPower(hero) }))
    .sort((a, b) => b.power.compare(a.power) || b.hero.rarity - a.hero.rarity)
    .filter(({ hero }) => {
      if (seen.has(hero.heroId)) return false;
      seen.add(hero.heroId);
      return true;
    })
    .slice(0, FRONT_SLOTS + BACK_SLOTS);
  ranked.sort((a, b) => FRONT_PRIORITY[a.hero.heroClass] - FRONT_PRIORITY[b.hero.heroClass] || b.power.compare(a.power));
  const ids = ranked.map((r) => r.hero.id);
  return { front: pad(ids.slice(0, FRONT_SLOTS), FRONT_SLOTS), back: pad(ids.slice(FRONT_SLOTS), BACK_SLOTS) };
}
