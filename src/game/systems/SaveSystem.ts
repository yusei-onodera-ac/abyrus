import { BigNumber } from './BigNumber';
import { DUPLICATE_GOLD_REWARD } from './GachaSystem';
import { createHeroInstance } from '../data/heroes';
import { MAX_SKILL_LEVEL, MAX_SKILL_SLOTS, isSkillSlotUnlocked, skillUpgradeCost } from '../data/skills';
import type { HeroData, Row } from '../types';

export interface PartyFormation {
  front: (string | null)[];
  back: (string | null)[];
}

export interface SaveData {
  version: number;
  gold: [number, number];
  gems: number;
  /** Spent to raise a hero's individual skill level (1-10); earned from
   *  stage clears and Infinite Mode runs. Kept separate from `gems`/`gold`
   *  (and from the concurrently-in-progress `phaseMaterials` currency) so
   *  skill progression - a per-hero, level-gated investment - has its own
   *  economy rather than competing with gacha pulls or phase fusion for
   *  the same pool. */
  skillEssence: number;
  heroes: HeroData[];
  party: PartyFormation;
  stageProgress: number;
  updatedAt: number;
  playerName: string;
  playerLevel: number;
  /** [current, max]. No stamina-gated feature consumes this yet - it's
   *  surfaced on the top bar ahead of that system so the HUD reads as
   *  complete. */
  stamina: [number, number];
  /** Whether each home-screen corner button has something unread. No
   *  notification/gift/mail system exists yet - these just drive the red
   *  dot badge ahead of that system existing. */
  unread: { notification: boolean; giftBox: boolean; mail: boolean };
  /** This device's own best Infinite Mode (Event tab) run. Kept locally so
   *  the Event tab still shows a meaningful personal best even before the
   *  global leaderboard call resolves, or when the backend isn't configured. */
  infiniteMode: {
    bestScore: number;
    bestSurvivalSeconds: number;
    bestEnemiesDefeated: number;
    bestDifficultyReached: number;
    totalRuns: number;
  };
}

export interface InfiniteModeRunResult {
  score: number;
  survivalSeconds: number;
  enemiesDefeated: number;
  difficultyReached: number;
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
    // Starters are drawn from the illustrated roster, not the un-illustrated
    // base 12, so a brand-new save's showcase hero (highest rarity owned)
    // has real art instead of falling back to the bare procedural medallion
    // on the very first screen a player sees.
    const heroes: HeroData[] = [
      createHeroInstance('mizuki', 'starter-1'),
      createHeroInstance('ember', 'starter-2'),
      createHeroInstance('lumi', 'starter-3'),
    ];
    return {
      version: 1,
      gold: BigNumber.from(500).toJSON(),
      gems: 1500,
      skillEssence: 300,
      heroes,
      party: { front: [heroes[0].id, heroes[1].id, null], back: [heroes[2].id, null] },
      stageProgress: 0,
      updatedAt: Date.now(),
      playerName: 'プレイヤー',
      playerLevel: 1,
      stamina: [50, 50],
      unread: { notification: true, giftBox: true, mail: false },
      infiniteMode: { bestScore: 0, bestSurvivalSeconds: 0, bestEnemiesDefeated: 0, bestDifficultyReached: 0, totalRuns: 0 },
    };
  },

  load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.createDefault();
      const parsed = JSON.parse(raw) as SaveData;
      if (!parsed.version) return this.createDefault();
      // Spread over a fresh default so a save written before a field (like
      // playerName) existed still gets a sane value instead of undefined.
      const merged = { ...this.createDefault(), ...parsed };
      // `heroes` is replaced wholesale by the spread above, so a hero saved
      // before `skillLevels` existed needs its own per-object migration too.
      merged.heroes = merged.heroes.map((hero) => ({ ...hero, skillLevels: hero.skillLevels ?? Array(MAX_SKILL_SLOTS).fill(1) }));
      return merged;
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

  addSkillEssence(data: SaveData, amount: number): void {
    data.skillEssence += amount;
  },

  /** Spends skillEssence to raise one hero's skill (by slot index) one
   *  level, if that slot is unlocked, not already maxed, and affordable.
   *  Returns false (no state changed) otherwise. */
  upgradeHeroSkill(data: SaveData, heroId: string, slotIndex: number): boolean {
    const hero = this.getHero(data, heroId);
    if (!hero) return false;
    if (!isSkillSlotUnlocked(slotIndex, hero.level)) return false;
    const currentLevel = hero.skillLevels[slotIndex] ?? 1;
    if (currentLevel >= MAX_SKILL_LEVEL) return false;
    const cost = skillUpgradeCost(currentLevel);
    if (data.skillEssence < cost) return false;
    data.skillEssence -= cost;
    hero.skillLevels[slotIndex] = currentLevel + 1;
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

  /** Records an Infinite Mode run, bumping each personal-best field
   *  independently (a longer survival time and a higher score don't
   *  necessarily come from the same run). */
  recordInfiniteModeResult(data: SaveData, result: InfiniteModeRunResult): void {
    const best = data.infiniteMode;
    best.totalRuns += 1;
    best.bestScore = Math.max(best.bestScore, result.score);
    best.bestSurvivalSeconds = Math.max(best.bestSurvivalSeconds, result.survivalSeconds);
    best.bestEnemiesDefeated = Math.max(best.bestEnemiesDefeated, result.enemiesDefeated);
    best.bestDifficultyReached = Math.max(best.bestDifficultyReached, result.difficultyReached);
  },
};
