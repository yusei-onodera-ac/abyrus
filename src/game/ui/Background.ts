import Phaser from 'phaser';

export type BackgroundScreen =
  | 'home'
  | 'battle'
  | 'gacha'
  | 'roster'
  | 'hero_detail'
  | 'stage_select'
  | 'event'
  | 'legion'
  | 'profile'
  | 'settings';

const BACKGROUND_SCREENS: BackgroundScreen[] = [
  'home',
  'battle',
  'gacha',
  'roster',
  'hero_detail',
  'stage_select',
  'event',
  'legion',
  'profile',
  'settings',
];

function textureKey(screen: BackgroundScreen): string {
  return `bg_${screen}`;
}

/**
 * Queues every screen's background artwork for loading. Call once from
 * BootScene.preload(). These files are optional, exactly like the hero
 * illustration PNGs: most won't exist yet, and a missing one must not
 * break the load queue. BootScene already registers a no-op
 * FILE_LOAD_ERROR handler, which covers these loads too.
 */
export function preloadBackgrounds(scene: Phaser.Scene): void {
  for (const screen of BACKGROUND_SCREENS) {
    scene.load.image(textureKey(screen), `/assets/backgrounds/${screen}.jpg`);
  }
}

/**
 * Lays a full-bleed background image behind everything else in the scene,
 * scaled to cover the viewport. Returns null (and adds nothing) when that
 * screen's artwork hasn't been supplied yet - callers should already have
 * set a solid `cameras.main.setBackgroundColor` fallback before calling
 * this, same as CharacterGenerator falling back to procedural art.
 */
export function applyBackground(
  scene: Phaser.Scene,
  screen: BackgroundScreen,
  width = 720,
  height = 1280,
): Phaser.GameObjects.Image | null {
  const key = textureKey(screen);
  if (!scene.textures.exists(key)) return null;

  const frame = scene.textures.get(key).getSourceImage();
  const scale = Math.max(width / frame.width, height / frame.height);
  const image = scene.add.image(width / 2, height / 2, key).setScale(scale).setDepth(-100);

  // A real background photo needs a touch of darkening so UI text drawn
  // over it stays legible regardless of what the artwork looks like.
  const vignette = scene.add.graphics().setDepth(-99);
  vignette.fillStyle(0x05060a, 0.35);
  vignette.fillRect(0, 0, width, height);

  return image;
}
