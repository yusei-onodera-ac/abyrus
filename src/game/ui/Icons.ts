import Phaser from 'phaser';

/**
 * Small procedural icon textures (coin, gem, stage node) baked once per
 * scene with Phaser Graphics + generateTexture, the same caching pattern
 * CharacterGenerator uses for portraits. Note: Graphics.generateTexture()
 * rasterizes via the Canvas 2D API, which does not support
 * fillGradientStyle, so shading here is faked with stacked solid-color
 * layers/highlights instead of a true gradient fill.
 */

const ICON_COIN = 'icon_coin';
const ICON_GEM = 'icon_gem';
const ICON_STAGE_PREFIX = 'icon_stage_';

export type StageNodeState = 'locked' | 'unlocked' | 'cleared';

function ensureTexture(scene: Phaser.Scene, key: string, size: number, draw: (g: Phaser.GameObjects.Graphics, radius: number) => void): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  draw(g, size / 2);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** Coin icon for gold: a stamped medallion with a glint highlight. */
export function coinIcon(scene: Phaser.Scene, size = 28): string {
  return ensureTexture(scene, `${ICON_COIN}_${size}`, size, (g, c) => {
    g.fillStyle(0x8a6100, 1);
    g.fillCircle(c, c, c);
    g.fillStyle(0xffd23f, 1);
    g.fillCircle(c, c, c - 2);
    g.fillStyle(0xffe79a, 0.9);
    g.fillCircle(c, c, c - 6);
    g.lineStyle(1.5, 0x8a6100, 0.85);
    g.strokeCircle(c, c, c - 5);
    g.fillStyle(0x8a6100, 0.9);
    g.fillRect(c - c * 0.32, c - 2, c * 0.64, 4);
    g.fillStyle(0xffffff, 0.6);
    g.fillEllipse(c - c * 0.32, c - c * 0.32, c * 0.5, c * 0.28);
  });
}

/** Gem icon for the premium currency: a faceted cut crystal. */
export function gemIcon(scene: Phaser.Scene, size = 28): string {
  return ensureTexture(scene, `${ICON_GEM}_${size}`, size, (g, c) => {
    const top = c * 0.15;
    const bottom = size - c * 0.1;
    const waist = c * 0.92;
    g.fillStyle(0x1f6fa8, 1);
    g.fillTriangle(c, top, size - 2, waist, c, bottom);
    g.fillTriangle(c, top, 2, waist, c, bottom);
    g.fillStyle(0x7cd6ff, 1);
    g.fillTriangle(c, top, size - 2, waist, c, c * 1.15);
    g.fillStyle(0xd9f3ff, 0.85);
    g.fillTriangle(c, top, c * 0.5, c * 0.85, c, c);
    g.lineStyle(1.2, 0x15486b, 0.85);
    g.strokeTriangle(c, top, size - 2, waist, c, bottom);
    g.strokeTriangle(c, top, 2, waist, c, bottom);
  });
}

const STAGE_STYLE: Record<StageNodeState, { fill: number; ring: number; alpha: number }> = {
  locked: { fill: 0x2a2b36, ring: 0x44465a, alpha: 0.9 },
  unlocked: { fill: 0x3b5fc4, ring: 0xffffff, alpha: 1 },
  cleared: { fill: 0x2f7a4d, ring: 0xffd23f, alpha: 1 },
};

/** Stage-select node medallion: an abacus-bead motif ring whose color/glow
 *  reports locked/unlocked/cleared state at a glance. */
export function stageNodeIcon(scene: Phaser.Scene, state: StageNodeState, size = 64): string {
  const key = `${ICON_STAGE_PREFIX}${state}_${size}`;
  return ensureTexture(scene, key, size, (g, c) => {
    const { fill, ring, alpha } = STAGE_STYLE[state];
    g.fillStyle(ring, 0.1);
    g.fillCircle(c, c, c);
    g.fillStyle(ring, 0.16);
    g.fillCircle(c, c, c - 3);
    g.fillStyle(fill, alpha);
    g.fillCircle(c, c, c - 6);
    g.lineStyle(2, ring, 0.9);
    g.strokeCircle(c, c, c - 6);
    g.lineStyle(1, ring, 0.35);
    g.strokeCircle(c, c, c - 12);
    g.fillStyle(0xffffff, state === 'locked' ? 0.04 : 0.14);
    g.fillEllipse(c, c - (c - 6) * 0.45, (c - 6) * 1.1, (c - 6) * 0.55);
  });
}
