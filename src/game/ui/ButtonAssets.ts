import Phaser from 'phaser';

export type ButtonAssetVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'wood';

const VARIANTS: ButtonAssetVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'gold', 'wood'];

function normalKey(variant: ButtonAssetVariant): string {
  return `btn_${variant}_normal`;
}

function pressedKey(variant: ButtonAssetVariant): string {
  return `btn_${variant}_pressed`;
}

/**
 * Queues every button variant's optional normal/pressed skin PNGs for
 * loading. Call once from BootScene.preload(), exactly like
 * preloadBackgrounds: none of these files exist yet, and a missing one
 * must not break the load queue. BootScene already registers a no-op
 * FILE_LOAD_ERROR handler, which covers these loads too.
 */
export function preloadButtonAssets(scene: Phaser.Scene): void {
  for (const variant of VARIANTS) {
    scene.load.image(normalKey(variant), `/assets/buttons/${variant}_normal.png`);
    scene.load.image(pressedKey(variant), `/assets/buttons/${variant}_pressed.png`);
  }
}

/** True once both halves of a variant's skin (normal + pressed) have been
 *  supplied. `Button` falls back to its procedural Panel rendering until
 *  both textures are present, the same "optional art, procedural fallback"
 *  rule CharacterGenerator and applyBackground already follow. */
export function hasButtonAsset(scene: Phaser.Scene, variant: ButtonAssetVariant): boolean {
  return scene.textures.exists(normalKey(variant)) && scene.textures.exists(pressedKey(variant));
}

export function buttonAssetKeys(variant: ButtonAssetVariant): { normal: string; pressed: string } {
  return { normal: normalKey(variant), pressed: pressedKey(variant) };
}
