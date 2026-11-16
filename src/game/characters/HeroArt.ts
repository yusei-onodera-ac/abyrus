import Phaser from 'phaser';
import { HERO_ROSTER } from '../data/heroes';
import type { SaveData } from '../systems/SaveSystem';
import { SaveSystem } from '../systems/SaveSystem';

/**
 * Where the characters' pictures come from, and when they are in memory.
 *
 * Every character has three pictures (tools/art/make_thumbs.py makes the two small ones from the big one):
 *   - the illustration  assets/characters/<id>.png        texture key  <id>            (~1000-1800 px wide: 5 to 17 MB in memory EACH)
 *   - the bust          assets/characters/bust/<id>.png    texture key  bust_<id>       the head-and-chest square of a tile (256 px)
 *   - the fit           assets/characters/fit/<id>.png     texture key  char_illust_<id>  the whole figure in a square (192 px)
 *
 * The small two of EVERYBODY are loaded at start (about 70 MB for 161 characters). The illustrations of all of them would be
 * about 1.4 GB - more than a phone lets an app hold - so an illustration is loaded only when it is shown big, and let go of
 * when another one is wanted: the hero's detail screen, the Home showcase and a single gacha pull ask for theirs
 * (`queueHeroArt` in a scene's preload, `ensureHeroArt` while it runs); the Home hero and the party stay loaded (`pinnedHeroIds`).
 * Nothing else needs an illustration: the tiles use the bust, the small portraits and the battle use the fit.
 */

export const bustKey = (heroId: string): string => `bust_${heroId}`;
/** CharacterGenerator's key for the small whole-figure portrait: the loaded `fit` picture takes its place. */
export const fitKey = (heroId: string): string => `char_illust_${heroId}`;

const ILLUSTRATION_URL = (heroId: string): string => `/assets/characters/${heroId}.png`;

/** The two small pictures of every character: asked for in the Boot scene's preload. */
export function preloadHeroThumbs(scene: Phaser.Scene): void {
  for (const hero of HERO_ROSTER) {
    scene.load.image(bustKey(hero.id), `/assets/characters/bust/${hero.id}.png`);
    scene.load.image(fitKey(hero.id), `/assets/characters/fit/${hero.id}.png`);
  }
}

/** The characters whose illustration stays loaded: the Home hero and everyone in the party being used. */
export function pinnedHeroIds(save: SaveData): string[] {
  const ids = new Set<string>();
  const home = SaveSystem.getHomeHero(save);
  if (home) ids.add(home.heroId);
  const party = SaveSystem.getPartyHeroes(save);
  for (const hero of [...party.front, ...party.back]) ids.add(hero.heroId);
  return [...ids];
}

const isRosterId = (id: string): boolean => HERO_ROSTER.some((h) => h.id === id);

/** Lets go of the illustrations that are loaded but not wanted now (never one on screen: call it when a scene starts). */
export function trimHeroArt(scene: Phaser.Scene, keep: Iterable<string>): void {
  const wanted = new Set(keep);
  for (const hero of HERO_ROSTER) {
    if (!wanted.has(hero.id) && scene.textures.exists(hero.id)) scene.textures.remove(hero.id);
  }
}

/** Asks the scene's loader for these illustrations (the ones not loaded yet). Use in preload(); the scene's create() waits for them. */
export function queueHeroArt(scene: Phaser.Scene, heroIds: Iterable<string>): void {
  let queued = false;
  for (const id of new Set(heroIds)) {
    if (!isRosterId(id) || scene.textures.exists(id)) continue;
    scene.load.image(id, ILLUSTRATION_URL(id));
    queued = true;
  }
  // (a picture that is missing must not stop the scene: the small portrait is shown instead)
  if (queued) scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});
}

/** Loads these illustrations while the scene is running (a gacha pull is known only after a tap). Resolves when they are in (or failed). */
export function ensureHeroArt(scene: Phaser.Scene, heroIds: Iterable<string>): Promise<void> {
  const missing = [...new Set(heroIds)].filter((id) => isRosterId(id) && !scene.textures.exists(id));
  if (missing.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    for (const id of missing) scene.load.image(id, ILLUSTRATION_URL(id));
    scene.load.start();
  });
}

/** For checking what is in memory: the textures' size once decoded (width x height x 4 bytes), in MB, and how many illustrations are loaded. */
export function textureReport(scene: Phaser.Scene): { totalMB: number; illustrations: number; illustrationsMB: number; biggest: string[] } {
  let total = 0;
  let illustrations = 0;
  let illustrationsMB = 0;
  const sizes: [string, number][] = [];
  const ids = new Set(HERO_ROSTER.map((h) => h.id));
  for (const key of scene.textures.getTextureKeys()) {
    const texture = scene.textures.get(key);
    const source = texture.getSourceImage() as { width?: number; height?: number } | undefined;
    const mb = ((source?.width ?? 0) * (source?.height ?? 0) * 4) / 1e6;
    total += mb;
    sizes.push([key, mb]);
    if (ids.has(key)) {
      illustrations++;
      illustrationsMB += mb;
    }
  }
  sizes.sort((a, b) => b[1] - a[1]);
  return { totalMB: Math.round(total), illustrations, illustrationsMB: Math.round(illustrationsMB), biggest: sizes.slice(0, 14).map(([key, mb]) => `${key} ${mb.toFixed(1)}`) };
}
