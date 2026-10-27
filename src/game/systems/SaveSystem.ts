import { BigNumber } from './BigNumber';
import type { HeroClass, HeroData, Row } from '../types';

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

const STORAGE_KEY = 'abyrus_save_v1';

function makeHero(id: string, seed: number, rarity: HeroData['rarity'], heroClass: HeroClass, name: string): HeroData {
  return { id, seed, rarity, heroClass, name, level: 1, exp: 0 };
}

export const SaveSystem = {
  createDefault(): SaveData {
    const heroes: HeroData[] = [
      makeHero('starter-1', 1001, 3, 'warrior', '断刃のレイ'),
      makeHero('starter-2', 1002, 2, 'archer', '疾風のミナ'),
      makeHero('starter-3', 1003, 2, 'healer', '祈算のユノ'),
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

  addHero(data: SaveData, hero: HeroData): void {
    data.heroes.push(hero);
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
    const needed = () => Math.round(80 * Math.pow(1.22, hero.level - 1));
    while (hero.exp >= needed()) {
      hero.exp -= needed();
      hero.level += 1;
    }
  },

  clearStage(data: SaveData, stageIndex: number): void {
    if (stageIndex >= data.stageProgress) data.stageProgress = stageIndex + 1;
  },
};
