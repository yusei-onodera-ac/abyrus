import Phaser from 'phaser';
import { LANGUAGES, SOURCE_LANGUAGE, getLanguage, type Language } from '../i18n';

export type IconAssetName = 'quest' | 'gacha' | 'roster';

const NAMES: IconAssetName[] = ['quest', 'gacha', 'roster'];

// The art has its label drawn into it ("クエスト"), so it is per language: the Japanese art is public/assets/icons/<name>_*.png and
// another language's is public/assets/icons/<code>/<name>_*.png (optional). A language without its own art gets the procedural badge
// with the (translated) caption IconNavButton draws, until the art is supplied.
function suffix(lang: Language): string {
  return lang === SOURCE_LANGUAGE ? '' : `_${lang}`;
}

function normalKey(name: IconAssetName, lang: Language = getLanguage()): string {
  return `nav_icon_${name}_normal${suffix(lang)}`;
}

function pressedKey(name: IconAssetName, lang: Language = getLanguage()): string {
  return `nav_icon_${name}_pressed${suffix(lang)}`;
}

/**
 * Queues every nav icon's optional normal/pressed artwork PNGs for loading.
 * Call once from BootScene.preload(), exactly like preloadButtonAssets: none
 * of these files are guaranteed to exist, and a missing one must not break
 * the load queue. BootScene already registers a no-op FILE_LOAD_ERROR
 * handler, which covers these loads too.
 */
export function preloadIconAssets(scene: Phaser.Scene): void {
  for (const name of NAMES) {
    for (const { code } of LANGUAGES) {
      const dir = code === SOURCE_LANGUAGE ? '' : `${code}/`;
      scene.load.image(normalKey(name, code), `/assets/icons/${dir}${name}_normal.png`);
      scene.load.image(pressedKey(name, code), `/assets/icons/${dir}${name}_pressed.png`);
    }
  }
}

/** True once both halves of a nav icon's art (normal + pressed) have been
 *  supplied. `IconNavButton` falls back to its procedural badge texture
 *  until both are present, the same "optional art, procedural fallback"
 *  rule Button/ButtonAssets already follow. */
export function hasIconAsset(scene: Phaser.Scene, name: IconAssetName): boolean {
  return resolveIconArt(scene, name) !== null;
}

/** The art to draw for the current language: its own if supplied, else the Japanese (source) art, else null. `labelMatches` is
 *  false for the Japanese art shown in another language (its lettering is Japanese: the caller adds a caption in the language). */
export function resolveIconArt(scene: Phaser.Scene, name: IconAssetName): { normal: string; pressed: string; labelMatches: boolean } | null {
  for (const lang of [getLanguage(), SOURCE_LANGUAGE]) {
    if (scene.textures.exists(normalKey(name, lang)) && scene.textures.exists(pressedKey(name, lang))) {
      return { normal: normalKey(name, lang), pressed: pressedKey(name, lang), labelMatches: lang === getLanguage() };
    }
  }
  return null;
}
