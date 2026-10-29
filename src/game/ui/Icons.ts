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
const ICON_STAMINA = 'icon_stamina';
const ICON_STAGE_PREFIX = 'icon_stage_';
const ICON_NAV_QUEST = 'icon_nav_quest';
const ICON_NAV_GACHA = 'icon_nav_gacha';
const ICON_NAV_ROSTER = 'icon_nav_roster';
const ICON_TAB_EVENT = 'icon_tab_event';
const ICON_TAB_FRIEND = 'icon_tab_friend';
const ICON_TAB_HOME = 'icon_tab_home';
const ICON_TAB_MESSAGE = 'icon_tab_message';
const ICON_TAB_ENHANCE = 'icon_tab_enhance';
const ICON_TAB_SHOP = 'icon_tab_shop';
const ICON_SETTINGS = 'icon_settings';
const ICON_PHASE_MATERIAL = 'icon_phase_material';
const ICON_NOTIFICATION = 'icon_notification';
const ICON_GIFT_BOX = 'icon_gift_box';
const ICON_MAIL = 'icon_mail';

export type StageNodeState = 'locked' | 'unlocked' | 'cleared';

export function ensureTexture(scene: Phaser.Scene, key: string, size: number, draw: (g: Phaser.GameObjects.Graphics, radius: number) => void): string {
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

/** Stamina icon for the energy meter: a stamped medallion matching the
 *  coin/gem family, with a lightning-bolt glyph instead of their motifs. */
export function staminaIcon(scene: Phaser.Scene, size = 28): string {
  return ensureTexture(scene, `${ICON_STAMINA}_${size}`, size, (g, c) => {
    g.fillStyle(0x7a3f0a, 1);
    g.fillCircle(c, c, c);
    g.fillStyle(0xff9f3f, 1);
    g.fillCircle(c, c, c - 2);
    g.fillStyle(0xffe0b0, 0.9);
    g.fillCircle(c, c, c - 6);
    g.lineStyle(1.5, 0x7a3f0a, 0.85);
    g.strokeCircle(c, c, c - 5);

    const bolt = [
      [0.58, 0.1], [0.3, 0.52], [0.46, 0.52], [0.4, 0.9], [0.72, 0.44], [0.54, 0.44],
    ].map(([fx, fy]) => ({ x: fx * c * 2, y: fy * c * 2 }));
    g.fillStyle(0x7a3f0a, 0.9);
    g.fillPoints(bolt, true);
  });
}

/** Placeholder legion crest for the top bar's shield plaque: brass/bronze
 *  to match that bar's own wood-and-gilt art (not the cooler palette the
 *  bottom nav bar's own procedural badges use), until a real legion logo
 *  exists. */
export function legionCrestIcon(scene: Phaser.Scene, size = 40): string {
  return ensureTexture(scene, 'icon_legion_crest_' + size, size, (g, c) => {
    g.fillStyle(0x6b4a28, 1);
    g.fillCircle(c, c, c);
    g.fillStyle(0xc9a052, 1);
    g.fillCircle(c, c, c - 2);
    g.fillStyle(0xe8cb8a, 0.85);
    g.fillCircle(c, c, c - 6);
    g.lineStyle(1.5, 0x6b4a28, 0.9);
    g.strokeCircle(c, c, c - 5);

    g.lineStyle(c * 0.16, 0x4a3118, 1);
    g.beginPath();
    g.moveTo(c - c * 0.5, c - c * 0.5);
    g.lineTo(c + c * 0.5, c + c * 0.5);
    g.strokePath();
    g.beginPath();
    g.moveTo(c + c * 0.5, c - c * 0.5);
    g.lineTo(c - c * 0.5, c + c * 0.5);
    g.strokePath();
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
export function drawNavBadge(g: Phaser.GameObjects.Graphics, c: number, fill: number, ring: number): void {
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

/** Friend tab: two people side by side, for "the players you know". */
export function friendTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_FRIEND}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x2f5a46, 0xbdf2cf);
    const person = (cx: number, cy: number, scale: number, body: number, head: number): void => {
      g.fillStyle(body, 1);
      g.fillEllipse(cx, cy + c * 0.5 * scale, c * 0.86 * scale, c * 0.66 * scale);
      g.fillStyle(head, 1);
      g.fillCircle(cx, cy - c * 0.02 * scale, c * 0.22 * scale);
    };
    person(c + c * 0.3, c - c * 0.02, 0.82, 0x4b7a5c, 0xcfe9d6);
    person(c - c * 0.22, c + c * 0.04, 1, 0x6fae84, 0xf4f1e6);
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

/** Message tab: a speech bubble with three dots. */
export function messageTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_MESSAGE}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x2f4f7a, 0xbfe0ff);
    g.fillStyle(0xf4f1e6, 1);
    g.fillRoundedRect(c - c * 0.6, c - c * 0.46, c * 1.2, c * 0.82, 9);
    g.fillTriangle(c - c * 0.3, c + c * 0.3, c - c * 0.06, c + c * 0.3, c - c * 0.4, c + c * 0.62);
    g.fillStyle(0x2f4f7a, 1);
    for (let i = -1; i <= 1; i++) g.fillCircle(c + i * c * 0.28, c - c * 0.06, Math.max(2, c * 0.085));
  });
}

/** 強化 tab: a bold up-arrow with a spark, for "make them stronger". (Drop
 *  public/assets/ui/tab_enhance.png in to replace it with illustrated art.) */
export function enhanceTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_ENHANCE}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x7a3f1f, 0xffd9a0);
    g.fillStyle(0xfff0cc, 1);
    g.fillTriangle(c, c - c * 0.6, c + c * 0.52, c + c * 0.02, c - c * 0.52, c + c * 0.02);
    g.fillRect(c - c * 0.2, c, c * 0.4, c * 0.52);
    g.lineStyle(1.5, 0x6b3a14, 0.9);
    g.strokeTriangle(c, c - c * 0.6, c + c * 0.52, c + c * 0.02, c - c * 0.52, c + c * 0.02);
    g.fillStyle(0xe0822a, 1);
    g.fillRect(c - c * 0.2, c + c * 0.2, c * 0.4, c * 0.1);
    g.fillStyle(0xffffff, 1);
    const sx = c + c * 0.5;
    const sy = c - c * 0.46;
    const r = c * 0.2;
    const t = c * 0.05;
    g.fillTriangle(sx, sy - r, sx + t, sy, sx - t, sy);
    g.fillTriangle(sx, sy + r, sx + t, sy, sx - t, sy);
    g.fillTriangle(sx - r, sy, sx, sy - t, sx, sy + t);
    g.fillTriangle(sx + r, sy, sx, sy - t, sx, sy + t);
  });
}

/** Shop tab: a tied money pouch with a coin on it, for "spend what you have". */
export function shopTabIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_TAB_SHOP}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, 0x6b4a1f, 0xffd23f);
    g.fillStyle(0xb98a3f, 1);
    g.fillEllipse(c, c + c * 0.2, c * 1.08, c * 0.98);
    g.fillStyle(0xd9a94e, 1);
    g.fillEllipse(c - c * 0.12, c + c * 0.12, c * 0.7, c * 0.62);
    g.lineStyle(1.5, 0x6b4a1f, 0.9);
    g.strokeEllipse(c, c + c * 0.2, c * 1.08, c * 0.98);
    g.fillStyle(0xb98a3f, 1);
    g.fillTriangle(c - c * 0.26, c - c * 0.26, c + c * 0.26, c - c * 0.26, c, c + c * 0.02);
    g.fillStyle(0xe8cb8a, 1);
    g.fillRoundedRect(c - c * 0.3, c - c * 0.4, c * 0.6, c * 0.16, 4);
    g.lineStyle(1.2, 0x6b4a1f, 0.9);
    g.strokeRoundedRect(c - c * 0.3, c - c * 0.4, c * 0.6, c * 0.16, 4);
    g.fillStyle(0xffd23f, 1);
    g.fillCircle(c, c + c * 0.24, c * 0.27);
    g.lineStyle(1.5, 0x8a6100, 0.95);
    g.strokeCircle(c, c + c * 0.24, c * 0.27);
    g.fillStyle(0x8a6100, 0.9);
    g.fillRect(c - c * 0.1, c + c * 0.22, c * 0.2, 3);
  });
}

// The three corner buttons share one plain neutral badge + a single glyph
// tone instead of each getting its own saturated color, per direction -
// they read as one simple, consistent family; only the unread dot (drawn
// by the caller) gets to be a loud color.
export const CORNER_BADGE_FILL = 0x262840;
export const CORNER_BADGE_RING = 0xaaa4c2;
export const CORNER_GLYPH = 0xe9e6f2;

/** Notification-bell icon for the home screen's corner button row. */
export function notificationIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_NOTIFICATION}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    g.fillStyle(CORNER_GLYPH, 1);
    g.fillCircle(c, c - c * 0.4, c * 0.07);
    g.beginPath();
    g.arc(c, c + c * 0.04, c * 0.42, Math.PI, 0, false);
    g.lineTo(c + c * 0.5, c + c * 0.36);
    g.lineTo(c - c * 0.5, c + c * 0.36);
    g.closePath();
    g.fillPath();
    g.fillRoundedRect(c - c * 0.56, c + c * 0.32, c * 1.12, c * 0.1, 4);
    g.fillEllipse(c, c + c * 0.52, c * 0.26, c * 0.14);
  });
}

/** Present-box icon (ribboned gift) for the home screen's corner button
 *  row - distinct from the bottom bar's chest-shaped Event icon so the
 *  two don't read as the same feature. */
export function giftBoxIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_GIFT_BOX}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    const boxTop = c - c * 0.06;
    const boxSize = c * 0.86;
    g.lineStyle(2, CORNER_GLYPH, 1);
    g.strokeRect(c - boxSize / 2, boxTop, boxSize, c * 0.5);
    g.strokeRect(c - boxSize / 2, boxTop - c * 0.12, boxSize, c * 0.14);
    g.fillStyle(CORNER_GLYPH, 1);
    g.fillRect(c - c * 0.07, boxTop - c * 0.12, c * 0.14, c * 0.62);
    g.lineStyle(2, CORNER_GLYPH, 1);
    g.strokeCircle(c - c * 0.18, boxTop - c * 0.14, c * 0.14);
    g.strokeCircle(c + c * 0.18, boxTop - c * 0.14, c * 0.14);
  });
}

/** Envelope icon for the home screen's corner button row. */
export function mailIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_MAIL}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    const w = c * 0.88;
    const h = c * 0.62;
    const left = c - w / 2;
    const top = c - h / 2;
    g.lineStyle(2, CORNER_GLYPH, 1);
    g.strokeRect(left, top, w, h);
    g.beginPath();
    g.moveTo(left, top);
    g.lineTo(c, top + h * 0.56);
    g.lineTo(left + w, top);
    g.strokePath();
  });
}

/** Gear for the home screen's corner button row (same neutral badge family
 *  as the bell, present and envelope above). */
export function settingsIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `${ICON_SETTINGS}_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    const teeth = 8;
    const outer = c * 0.5;
    const toothLen = c * 0.2;
    g.fillStyle(CORNER_GLYPH, 1);
    for (let i = 0; i < teeth; i++) {
      const angle = (Math.PI * 2 * i) / teeth;
      g.save();
      g.translateCanvas(c + Math.cos(angle) * outer, c + Math.sin(angle) * outer);
      g.rotateCanvas(angle);
      g.fillRect(-toothLen * 0.4, -toothLen * 0.5, toothLen, toothLen);
      g.restore();
    }
    g.fillCircle(c, c, c * 0.42);
    g.fillStyle(CORNER_BADGE_FILL, 1);
    g.fillCircle(c, c, c * 0.17);
  });
}

/** フェーズ素材: a violet crystal shard, in the gem's family but not its colour. */
export function phaseMaterialIcon(scene: Phaser.Scene, size = 28): string {
  return ensureTexture(scene, `${ICON_PHASE_MATERIAL}_${size}`, size, (g, c) => {
    const top = c * 0.1;
    const bottom = size - c * 0.1;
    const waist = c * 0.78;
    g.fillStyle(0x5a2f98, 1);
    g.fillTriangle(c, top, size - 3, waist, c, bottom);
    g.fillTriangle(c, top, 3, waist, c, bottom);
    g.fillStyle(0xa97bff, 1);
    g.fillTriangle(c, top, size - 3, waist, c, c * 1.1);
    g.fillStyle(0xe6d6ff, 0.85);
    g.fillTriangle(c, top, c * 0.52, c * 0.8, c, c * 0.98);
    g.lineStyle(1.2, 0x34185e, 0.9);
    g.strokeTriangle(c, top, size - 3, waist, c, bottom);
    g.strokeTriangle(c, top, 3, waist, c, bottom);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(c * 1.45, c * 0.5, Math.max(1.2, c * 0.07));
  });
}
