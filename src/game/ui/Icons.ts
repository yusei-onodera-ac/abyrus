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
const ICON_NAV_QUEST = 'icon_nav_quest';
const ICON_NAV_GACHA = 'icon_nav_gacha';
const ICON_NAV_ROSTER = 'icon_nav_roster';
const ICON_TAB_EVENT = 'icon_tab_event';
const ICON_TAB_LEGION = 'icon_tab_legion';
const ICON_TAB_HOME = 'icon_tab_home';
const ICON_TAB_PROFILE = 'icon_tab_profile';
const ICON_TAB_SETTINGS = 'icon_tab_settings';

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

/** Shared circular badge body used by every nav icon: a filled disc with a
 *  ring and a soft rim-light, so the three nav glyphs read as one family of
 *  round buttons rather than unrelated shapes. */
function drawNavBadge(g: Phaser.GameObjects.Graphics, c: number, fill: number, ring: number): void {
  g.fillStyle(ring, 0.14);
  g.fillCircle(c, c, c);
  g.fillStyle(fill, 1);
  g.fillCircle(c, c, c - 4);
  g.lineStyle(2, ring, 0.9);
  g.strokeCircle(c, c, c - 4);
  g.fillStyle(0xffffff, 0.1);
  g.fillEllipse(c, c - (c - 4) * 0.5, (c - 4) * 1.15, (c - 4) * 0.6);
}

/** Quest/stage-select nav icon: a crossed-guard sword over the shared round
 *  badge, since tapping it is the one action that sends the player off to
 *  fight something. */
export function questIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_NAV_QUEST}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x3b5fc4, 0xbfd0ff);
    const bladeTop = c - c * 0.62;
    const bladeBottom = c + c * 0.1;
    g.fillStyle(0xe7ecf5, 1);
    g.fillTriangle(c, bladeTop, c - c * 0.14, bladeBottom, c + c * 0.14, bladeBottom);
    g.fillStyle(0xaab4cc, 1);
    g.fillRect(c - c * 0.22, bladeBottom - 2, c * 0.44, c * 0.12);
    g.fillStyle(0x8a6100, 1);
    g.fillRect(c - c * 0.06, bladeBottom + c * 0.08, c * 0.12, c * 0.3);
    g.lineStyle(1, 0xffffff, 0.5);
    g.beginPath();
    g.moveTo(c - 2, bladeTop + 4);
    g.lineTo(c - 2, bladeBottom - 4);
    g.strokePath();
  });
}

/** Gacha nav icon: a faceted gem ringed by a swirl of smaller orbiting
 *  shards, standing in for the "summoning circle" look of a gacha portal. */
export function gachaIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_NAV_GACHA}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x4a2d6e, 0xd9b8ff);
    const orbit = c - 10;
    const shardCount = 5;
    for (let i = 0; i < shardCount; i++) {
      const angle = (Math.PI * 2 * i) / shardCount - Math.PI / 2;
      const ox = c + Math.cos(angle) * orbit;
      const oy = c + Math.sin(angle) * orbit;
      g.fillStyle(0xb98bff, 0.85);
      g.fillCircle(ox, oy, Math.max(2, c * 0.07));
    }
    const top = c - c * 0.32;
    const bottom = c + c * 0.34;
    const waist = c + c * 0.02;
    g.fillStyle(0xffd23f, 1);
    g.fillTriangle(c, top, c + c * 0.3, waist, c, bottom);
    g.fillTriangle(c, top, c - c * 0.3, waist, c, bottom);
    g.fillStyle(0xfff3c0, 0.9);
    g.fillTriangle(c, top, c * 0.72, waist * 0.92, c, waist);
    g.lineStyle(1, 0x8a6100, 0.7);
    g.strokeTriangle(c, top, c + c * 0.3, waist, c, bottom);
    g.strokeTriangle(c, top, c - c * 0.3, waist, c, bottom);
  });
}

/** Hero-roster nav icon: a ledger/book glyph (folded cover + list rules)
 *  over the shared badge, for "browse everyone you own". */
export function rosterIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_NAV_ROSTER}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x2f7a4d, 0xbdf2cf);
    const w = c * 0.78;
    const h = c * 0.86;
    g.fillStyle(0xf4f1e6, 1);
    g.fillRoundedRect(c - w / 2, c - h / 2, w, h, 4);
    g.fillStyle(0x2f7a4d, 1);
    g.fillRect(c - w / 2, c - h / 2, w * 0.14, h);
    g.lineStyle(1.5, 0x6b6250, 0.8);
    const lineCount = 3;
    for (let i = 0; i < lineCount; i++) {
      const ly = c - h * 0.22 + i * h * 0.24;
      g.beginPath();
      g.moveTo(c - w * 0.28, ly);
      g.lineTo(c + w * 0.32, ly);
      g.strokePath();
    }
  });
}

/** Bottom-tab icons: same round-badge family as the home nav icons above,
 *  drawn procedurally instead of from supplied art so the bottom bar never
 *  depends on an external asset being well-calibrated. */

/** Event tab: a treasure chest with a banded lid, for "limited-time stuff
 *  worth opening". */
export function eventTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_EVENT}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x6e3f1f, 0xffd23f);
    const w = c * 1.1;
    const bodyTop = c + c * 0.02;
    const bodyH = c * 0.62;
    g.fillStyle(0x8a5a2b, 1);
    g.fillRoundedRect(c - w / 2, bodyTop, w, bodyH, 5);
    g.fillStyle(0xc9933f, 1);
    g.fillRoundedRect(c - w / 2, bodyTop - c * 0.34, w, c * 0.4, 6);
    g.lineStyle(2, 0xffd23f, 0.9);
    g.strokeRoundedRect(c - w / 2, bodyTop, w, bodyH, 5);
    g.strokeRoundedRect(c - w / 2, bodyTop - c * 0.34, w, c * 0.4, 6);
    g.fillStyle(0xffd23f, 1);
    g.fillRoundedRect(c - c * 0.1, bodyTop - c * 0.05, c * 0.2, c * 0.22, 3);
    g.fillStyle(0xfff3c0, 0.9);
    g.fillCircle(c - c * 0.55, c - c * 0.55, Math.max(1.5, c * 0.05));
    g.fillCircle(c + c * 0.5, c - c * 0.4, Math.max(1.5, c * 0.04));
  });
}

/** Legion tab: crossed blades behind a small round shield, for "allies /
 *  guild". */
export function legionTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_LEGION}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x3a3d52, 0xc9c3dd);
    g.lineStyle(c * 0.14, 0xd8dbe6, 1);
    g.beginPath();
    g.moveTo(c - c * 0.55, c - c * 0.55);
    g.lineTo(c + c * 0.55, c + c * 0.55);
    g.strokePath();
    g.beginPath();
    g.moveTo(c + c * 0.55, c - c * 0.55);
    g.lineTo(c - c * 0.55, c + c * 0.55);
    g.strokePath();
    g.fillStyle(0x8a6100, 1);
    g.fillCircle(c - c * 0.55, c - c * 0.55, c * 0.09);
    g.fillCircle(c + c * 0.55, c - c * 0.55, c * 0.09);
    g.fillStyle(0xb8420f, 1);
    g.fillCircle(c, c, c * 0.24);
    g.lineStyle(1.5, 0xffd23f, 0.9);
    g.strokeCircle(c, c, c * 0.24);
  });
}

/** Home tab: a small keep - a base wall with three crenellated towers. */
export function homeTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_HOME}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x4a4536, 0xe8ddb8);
    const baseW = c * 1.15;
    const baseH = c * 0.5;
    const baseY = c + c * 0.2;
    g.fillStyle(0xb9ad8f, 1);
    g.fillRect(c - baseW / 2, baseY, baseW, baseH);
    g.lineStyle(1.5, 0x6b6250, 0.8);
    g.strokeRect(c - baseW / 2, baseY, baseW, baseH);

    const towerW = c * 0.32;
    const towers = [c - c * 0.55, c, c + c * 0.55];
    const heights = [c * 0.38, c * 0.56, c * 0.38];
    towers.forEach((tx, i) => {
      const th = heights[i];
      const ty = baseY - th;
      g.fillStyle(0xd8cca3, 1);
      g.fillRect(tx - towerW / 2, ty, towerW, th);
      g.lineStyle(1.2, 0x6b6250, 0.8);
      g.strokeRect(tx - towerW / 2, ty, towerW, th);
      // crenellations
      g.fillStyle(0xd8cca3, 1);
      const notch = towerW / 3;
      g.fillRect(tx - towerW / 2, ty - notch * 0.6, notch, notch * 0.6);
      g.fillRect(tx - notch / 2, ty - notch * 0.6, notch, notch * 0.6);
      g.fillRect(tx + towerW / 2 - notch, ty - notch * 0.6, notch, notch * 0.6);
    });
    g.fillStyle(0x3a3322, 0.9);
    g.fillRect(c - c * 0.08, baseY + baseH * 0.3, c * 0.16, baseH * 0.7);
  });
}

/** Profile tab: a plumed helmet silhouette, standing in for "your
 *  character". */
export function profileTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_PROFILE}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x4a3d52, 0xd9b8ff);
    g.fillStyle(0xb8420f, 1);
    g.fillTriangle(c, c - c * 0.75, c - c * 0.12, c - c * 0.1, c + c * 0.12, c - c * 0.1);
    g.fillStyle(0x9aa4bf, 1);
    g.fillEllipse(c, c - c * 0.02, c * 0.78, c * 0.68);
    g.fillStyle(0x6b7291, 1);
    g.fillRoundedRect(c - c * 0.4, c + c * 0.18, c * 0.8, c * 0.3, 6);
    g.fillStyle(0x3a3d52, 1);
    g.fillRect(c - c * 0.06, c - c * 0.3, c * 0.12, c * 0.5);
    g.lineStyle(1.5, 0xd9b8ff, 0.8);
    g.strokeEllipse(c, c - c * 0.02, c * 0.78, c * 0.68);
  });
}

/** Settings tab: a gear - a ringed hub with radial teeth. */
export function settingsTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_SETTINGS}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x3a3d52, 0xc9c3dd);
    const teeth = 8;
    const outer = c * 0.62;
    const toothLen = c * 0.16;
    g.fillStyle(0x9aa0a6, 1);
    for (let i = 0; i < teeth; i++) {
      const angle = (Math.PI * 2 * i) / teeth;
      const tx = c + Math.cos(angle) * outer;
      const ty = c + Math.sin(angle) * outer;
      g.save();
      g.translateCanvas(tx, ty);
      g.rotateCanvas(angle);
      g.fillRect(-toothLen * 0.4, -toothLen * 0.5, toothLen, toothLen);
      g.restore();
    }
    g.fillStyle(0xc3c8cf, 1);
    g.fillCircle(c, c, c * 0.46);
    g.lineStyle(1.5, 0x6b6f78, 0.9);
    g.strokeCircle(c, c, c * 0.46);
    g.fillStyle(0x4a2d6e, 1);
    g.fillCircle(c, c, c * 0.18);
  });
}
