import Phaser from 'phaser';
import { REGIONS } from '../data/regions';
import { STORY_BACKGROUNDS } from '../data/storyScript';

export type BackgroundScreen =
  | 'home'
  | 'battle'
  | 'gacha'
  | 'roster'
  | 'hero_detail'
  | 'stage_select'
  | 'event'
  | 'friend'
  | 'message'
  | 'shop'
  | 'settings';

const BACKGROUND_SCREENS: BackgroundScreen[] = [
  'home',
  'battle',
  'gacha',
  'roster',
  'hero_detail',
  'stage_select',
  'event',
  'friend',
  'message',
  'shop',
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
  // Per-region artwork, equally optional: the quest map page of each region, and
  // the backdrop of its fights (plus one for the final battle).
  for (const region of REGIONS) {
    scene.load.image(`region_${region.id}`, `/assets/backgrounds/region_${region.id}.jpg`);
    scene.load.image(battleKey(region.id), `/assets/backgrounds/battle_${region.id}.jpg`);
  }
  scene.load.image(battleKey('final'), '/assets/backgrounds/battle_final.jpg');
  scene.load.image(battleKey('infinite'), '/assets/backgrounds/battle_infinite.jpg');
  for (const key of Object.keys(STORY_BACKGROUNDS)) {
    scene.load.image(`story_${key}`, `/assets/backgrounds/story_${key}.jpg`);
  }
}

function battleKey(id: string): string {
  return `bg_battle_${id}`;
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
  return layBackground(scene, textureKey(screen), width, height);
}

/**
 * The backdrop of a fight in region `id` (a RegionDef id, or 'final'): that
 * region's own `battle_<id>.jpg` when supplied, otherwise the shared battle
 * backdrop drained of its color and tinted with `tint`, so the regions still
 * look different (a forest road becomes a sandy track, an icy one, ...).
 * White `tint` leaves the shared backdrop as it is.
 */
export function applyBattleBackground(scene: Phaser.Scene, id: string, tint: number, width = 720, height = 1280): Phaser.GameObjects.Image | null {
  if (scene.textures.exists(battleKey(id))) return layBackground(scene, battleKey(id), width, height);
  const mono = tint !== 0xffffff ? monochromeBattleTexture(scene) : null;
  const image = layBackground(scene, mono ?? textureKey('battle'), width, height);
  if (image && mono) image.setTint(tint);
  return image;
}

const MONO_KEY = 'bg_battle_mono';

/** A grayscale copy of the shared battle backdrop, built once and kept in the
 *  global texture manager (tinting color multiplies, so it needs a gray base). */
function monochromeBattleTexture(scene: Phaser.Scene): string | null {
  if (scene.textures.exists(MONO_KEY)) return MONO_KEY;
  if (!scene.textures.exists(textureKey('battle'))) return null;
  const source = scene.textures.get(textureKey('battle')).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const canvas = scene.textures.createCanvas(MONO_KEY, source.width, source.height);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return null;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = Math.min(255, (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 1.5);
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
  ctx.putImageData(pixels, 0, 0);
  canvas.refresh();
  return MONO_KEY;
}

function layBackground(scene: Phaser.Scene, key: string, width: number, height: number): Phaser.GameObjects.Image | null {
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
