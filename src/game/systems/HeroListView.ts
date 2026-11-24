import { ProgressionSystem } from './ProgressionSystem';
import type { HeroClass, HeroData } from '../types';
import type { PlainKey } from '../i18n';

/**
 * How a list of the player's heroes is ordered and narrowed (the 編成 screen's roster and the 強化 tab's list share it).
 * Kept as plain data so the choice can live for the whole session and the rules can be tested without a screen.
 */
export type HeroSort = 'rarity' | 'level' | 'power' | 'new' | 'class';

/** `label` is a message key: the chip text is looked up (t) where it is drawn, so it follows the language. */
export const HERO_SORTS: { key: HeroSort; label: PlainKey }[] = [
  { key: 'rarity', label: 'hero.list.sortRarity' },
  { key: 'level', label: 'hero.list.sortLevel' },
  { key: 'power', label: 'hero.stat.power' },
  { key: 'new', label: 'hero.list.sortNewest' },
  { key: 'class', label: 'hero.list.sortClass' },
];

export interface HeroListView {
  sort: HeroSort;
  /** 0 = every rarity. */
  rarity: number;
  /** '' = every class. */
  heroClass: HeroClass | '';
}

export const DEFAULT_HERO_LIST_VIEW: HeroListView = { sort: 'rarity', rarity: 0, heroClass: '' };

const CLASS_ORDER: HeroClass[] = ['warrior', 'tank', 'archer', 'mage', 'healer'];

function powerOf(hero: HeroData): number {
  const value = ProgressionSystem.computeHeroPower(hero).toNumber();
  return Number.isFinite(value) ? value : Number.MAX_VALUE;
}

/** The heroes that pass the filters, in the chosen order. Copies of one character sit together under ★順 (the highest
 *  level first); the other orders look at each copy on its own. `heroes` is in the order they were obtained. */
export function applyHeroListView(heroes: readonly HeroData[], view: HeroListView): HeroData[] {
  const list = heroes.filter((h) => (view.rarity === 0 || h.rarity === view.rarity) && (view.heroClass === '' || h.heroClass === view.heroClass));
  const obtained = new Map(heroes.map((h, i) => [h.id, i]));
  const best = new Map<string, number>();
  for (const h of heroes) best.set(h.heroId, Math.max(best.get(h.heroId) ?? 0, h.level));
  const byCharacter = (a: HeroData, b: HeroData): number => a.heroId.localeCompare(b.heroId) || b.level - a.level;

  switch (view.sort) {
    case 'level':
      return list.sort((a, b) => b.level - a.level || b.rarity - a.rarity || byCharacter(a, b));
    case 'power': {
      const power = new Map(list.map((h) => [h.id, powerOf(h)]));
      return list.sort((a, b) => (power.get(b.id) ?? 0) - (power.get(a.id) ?? 0) || byCharacter(a, b));
    }
    case 'new':
      return list.sort((a, b) => (obtained.get(b.id) ?? 0) - (obtained.get(a.id) ?? 0));
    case 'class':
      return list.sort((a, b) => CLASS_ORDER.indexOf(a.heroClass) - CLASS_ORDER.indexOf(b.heroClass) || b.rarity - a.rarity || (best.get(b.heroId) ?? 0) - (best.get(a.heroId) ?? 0) || byCharacter(a, b));
    case 'rarity':
    default:
      return list.sort((a, b) => b.rarity - a.rarity || (best.get(b.heroId) ?? 0) - (best.get(a.heroId) ?? 0) || byCharacter(a, b));
  }
}

/** True when the view narrows the list or changes the default order (worth showing as "changed"). */
export function isDefaultHeroListView(view: HeroListView): boolean {
  return view.sort === DEFAULT_HERO_LIST_VIEW.sort && view.rarity === 0 && view.heroClass === '';
}

const REGISTRY_KEY = 'heroListView';

interface RegistryLike {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

/** The view chosen on any list screen this session. */
export function readHeroListView(registry: RegistryLike): HeroListView {
  const v = registry.get(REGISTRY_KEY) as Partial<HeroListView> | undefined;
  if (!v) return { ...DEFAULT_HERO_LIST_VIEW };
  const sort = HERO_SORTS.some((s) => s.key === v.sort) ? (v.sort as HeroSort) : DEFAULT_HERO_LIST_VIEW.sort;
  const rarity = typeof v.rarity === 'number' && v.rarity >= 0 && v.rarity <= 6 ? Math.floor(v.rarity) : 0;
  const heroClass = CLASS_ORDER.includes(v.heroClass as HeroClass) ? (v.heroClass as HeroClass) : '';
  return { sort, rarity, heroClass };
}

export function writeHeroListView(registry: RegistryLike, view: HeroListView): void {
  registry.set(REGISTRY_KEY, { ...view });
}
