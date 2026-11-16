import { ProgressionSystem } from './ProgressionSystem';
import { SaveSystem, type SaveData } from './SaveSystem';
import { recordMission } from './MissionProgress';
import { ITEMS, type ItemId } from '../data/items';
import { MAX_LEVEL, type CombatStats, type HeroData } from '../types';

/** The hero's stats as they'd be `levels` levels higher. */
export function statsAfterLevels(hero: HeroData, levels: number): CombatStats {
  return ProgressionSystem.computeHeroStats({ ...hero, level: hero.level + levels });
}

/**
 * キャラのレベルは、経験値素材を使うか、クエストをクリアして上げる (ゴールドでは上げられない)。
 * フェーズは、フェーズ素材か同じキャラの合成で上げる。
 */
export const EnhanceSystem = {
  statsAfterLevels,

  /** Uses up to `count` of an 経験値素材 on a hero, one at a time, stopping at the level cap so none is wasted. Returns how many were used and the EXP they gave. */
  useExpItem(save: SaveData, heroId: string, item: ItemId, count: number): { used: number; gained: number } {
    const hero = SaveSystem.getHero(save, heroId);
    const exp = ITEMS[item].exp;
    if (!hero || !exp) return { used: 0, gained: 0 };
    let used = 0;
    while (used < count && hero.level < MAX_LEVEL && SaveSystem.spendItem(save, item, 1)) {
      SaveSystem.grantExp(save, heroId, exp);
      used += 1;
    }
    if (used > 0) recordMission(save, 'hero_enhance');
    return { used, gained: used * exp };
  },
};
