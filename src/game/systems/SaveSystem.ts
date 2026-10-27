import { BigNumber } from './BigNumber';
import { DUPLICATE_GOLD_REWARD } from './GachaSystem';
import { createHeroInstance } from '../data/heroes';
import type { HeroData, Row } from '../types';

export interface PartyFormation {
  front: (string | null)[];
  back: (string | null)[];
}

export interface SaveData {
  version: number;
  gold: [number, number];
  gems: number;
  heroes: HeroData[];
  party: PartyFormation;
  stageProgress: number;
  updatedAt: number;
}

export interface HeroPullOutcome {
  hero: HeroData;
  /** True if this hero was already owned: no copy was added, gold instead. */
  duplicate: boolean;
  duplicateGold: BigNumber;
}

const STORAGE_KEY = 'abyrus_save_v1';

export function expToNextLevel(level: number): number {
  return Math.round(80 * Math.pow(1.22, level - 1));
}

export const SaveSystem = {
  createDefault(): SaveData {
    const heroes: HeroData[] = [
      createHeroInstance('touma', 'starter-1'),
      createHeroInstance('mina', 'starter-2'),
      createHeroInstance('yuno', 'starter-3'),
    ];
    return {
      version: 1,
      gold: BigNumber.from(500).toJSON(),
      gems: 1500,
      heroes,
      party: { front: [heroes[0].id, heroes[1].id, null], back: [heroes[2].id, null] },
      stageProgress: 0,
      updatedAt: Date.now(),
    };
  },

  load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.createDefault();
      const parsed = JSON.parse(raw) as SaveData;
      if (!parsed.version) return this.createDefault();
      return parsed;
    } catch {
      return this.createDefault();
    }
  },

  save(data: SaveData): void {
    data.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage can fail (quota, private mode) - progress just stays in-memory.
    }
  },

  getGold(data: SaveData): BigNumber {
    return BigNumber.fromJSON(data.gold);
  },

  addGold(data: SaveData, amount: BigNumber): void {
    data.gold = this.getGold(data).add(amount).toJSON();
  },

  spendGems(data: SaveData, amount: number): boolean {
    if (data.gems < amount) return false;
    data.gems -= amount;
    return true;
  },

  /** Adds a newly pulled hero, or converts it to gold if already owned. */
  addHero(data: SaveData, hero: HeroData): HeroPullOutcome {
    const owned = data.heroes.some((h) => h.heroId === hero.heroId);
    if (owned) {
      const duplicateGold = BigNumber.from(DUPLICATE_GOLD_REWARD[hero.rarity]);
      this.addGold(data, duplicateGold);
      return { hero, duplicate: true, duplicateGold };
    }
    data.heroes.push(hero);
    return { hero, duplicate: false, duplicateGold: BigNumber.ZERO };
  },

  getHero(data: SaveData, id: string): HeroData | undefined {
    return data.heroes.find((h) => h.id === id);
  },

  getPartyHeroes(data: SaveData): { front: HeroData[]; back: HeroData[] } {
    const resolve = (id: string | null) => (id ? this.getHero(data, id) : undefined);
    return {
      front: data.party.front.map(resolve).filter((h): h is HeroData => !!h),
      back: data.party.back.map(resolve).filter((h): h is HeroData => !!h),
    };
  },

  setPartySlot(data: SaveData, row: Row, slot: number, heroId: string | null): void {
    for (const r of ['front', 'back'] as const) {
      data.party[r] = data.party[r].map((id, i) => (r === row && i === slot ? id : id === heroId ? null : id));
    }
    data.party[row][slot] = heroId;
  },

  grantExp(data: SaveData, heroId: string, exp: number): void {
    const hero = this.getHero(data, heroId);
    if (!hero) return;
    hero.exp += exp;
    while (hero.exp >= expToNextLevel(hero.level)) {
      hero.exp -= expToNextLevel(hero.level);
      hero.level += 1;
    }
  },

  clearStage(data: SaveData, stageIndex: number): void {
    if (stageIndex >= data.stageProgress) data.stageProgress = stageIndex + 1;
  },
};
