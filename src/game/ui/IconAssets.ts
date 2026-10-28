import Phaser from 'phaser';

export type IconAssetName = 'quest' | 'gacha' | 'roster';

const NAMES: IconAssetName[] = ['quest', 'gacha', 'roster'];

function normalKey(name: IconAssetName): string {
  return `nav_icon_${name}_normal`;
}

function pressedKey(name: IconAssetName): string {
  return `nav_icon_${name}_pressed`;
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
    scene.load.image(normalKey(name), `/assets/icons/${name}_normal.png`);
    scene.load.image(pressedKey(name), `/assets/icons/${name}_pressed.png`);
  }
}

/** True once both halves of a nav icon's art (normal + pressed) have been
 *  supplied. `IconNavButton` falls back to its procedural badge texture
 *  until both are present, the same "optional art, procedural fallback"
 *  rule Button/ButtonAssets already follow. */
export function hasIconAsset(scene: Phaser.Scene, name: IconAssetName): boolean {
  return scene.textures.exists(normalKey(name)) && scene.textures.exists(pressedKey(name));
}

export function iconAssetKeys(name: IconAssetName): { normal: string; pressed: string } {
  return { normal: normalKey(name), pressed: pressedKey(name) };
}
