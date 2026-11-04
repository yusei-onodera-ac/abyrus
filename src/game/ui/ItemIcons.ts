import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../data/items';
import { EQUIP_DEFS, type EquipGlyph } from '../data/equipment';
import { RARITY_COLORS, type Rarity } from '../types';
import { CORNER_BADGE_FILL, CORNER_BADGE_RING, CORNER_GLYPH, ITEM_ART_PREFIX, drawNavBadge, ensureTexture, scaledArt } from './Icons';

/** Code-drawn icons for 素材, equipment and the home screen's new corner buttons. */

const POTION: Record<'exp_s' | 'exp_m' | 'exp_l' | 'exp_xl', { body: number; liquid: number }> = {
  exp_s: { body: 0x2f6fa0, liquid: 0x6fc4ff },
  exp_m: { body: 0x2f7a3f, liquid: 0x7be08a },
  exp_l: { body: 0xa87020, liquid: 0xffc65a },
  exp_xl: { body: 0xa03070, liquid: 0xff7ac0 },
};

/** 素材 pictures: `public/assets/items/<item id>.png` (exp_s, exp_m, exp_l, exp_xl, equip_essence), each a
 *  square with a transparent background. An item without one - or whose file is missing - keeps its drawn icon.
 *  技素 and フェーズ素材 are not in ITEMS (the save keeps them in fields of their own), so their pictures are named here. */
const SAVE_MATERIAL_ART = ['skill_essence', 'phase_material'];

export function preloadItemArt(scene: Phaser.Scene): void {
  for (const id of [...Object.keys(ITEMS), ...SAVE_MATERIAL_ART]) scene.load.image(`${ITEM_ART_PREFIX}${id}`, `/assets/items/${id}.png`);
}

/** The supplied picture of `item`, shrunk to `size`, or null when there is none. */
function itemArt(scene: Phaser.Scene, item: ItemId, size: number): string | null {
  return scaledArt(scene, `${ITEM_ART_PREFIX}${item}`, `icon_item_art_${item}_${size}`, size);
}

/** A 素材: its supplied picture if there is one, else a potion bottle for each 経験値素材 (bigger tiers fuller and
 *  brighter) or a glowing crystal for 装備強化素材. */
export function itemIcon(scene: Phaser.Scene, item: ItemId, size = 56): string {
  const art = itemArt(scene, item, size);
  if (art) return art;
  return ensureTexture(scene, `icon_item_${item}_${size}`, size, (g, c) => {
    if (item === 'equip_essence') {
      // A faceted orange crystal on a small anvil-grey base.
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(c, c * 1.82, c * 1.1, c * 0.2);
      g.fillStyle(0x9a4a14, 1);
      g.fillTriangle(c, c * 0.1, c * 1.7, c * 0.78, c, c * 1.75);
      g.fillTriangle(c, c * 0.1, c * 0.3, c * 0.78, c, c * 1.75);
      g.fillStyle(0xffa24a, 1);
      g.fillTriangle(c, c * 0.1, c * 1.7, c * 0.78, c, c * 1.15);
      g.fillStyle(0xffe0a8, 0.9);
      g.fillTriangle(c, c * 0.1, c * 0.62, c * 0.82, c, c * 1.0);
      g.lineStyle(1.5, 0x5a2a08, 0.9);
      g.strokeTriangle(c, c * 0.1, c * 1.7, c * 0.78, c, c * 1.75);
      g.strokeTriangle(c, c * 0.1, c * 0.3, c * 0.78, c, c * 1.75);
      return;
    }
    const look = POTION[item];
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(c, c * 1.86, c * 1.0, c * 0.18);
    // Neck and cork.
    g.fillStyle(0xe8e4f0, 0.9);
    g.fillRoundedRect(c * 0.76, c * 0.22, c * 0.48, c * 0.5, 3);
    g.fillStyle(0xb98a4a, 1);
    g.fillRoundedRect(c * 0.7, c * 0.06, c * 0.6, c * 0.24, 3);
    // Body, glass then liquid.
    g.fillStyle(look.body, 1);
    g.fillCircle(c, c * 1.18, c * 0.7);
    g.fillStyle(look.liquid, 1);
    g.fillCircle(c, c * 1.22, c * 0.6);
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(c * 0.74, c * 0.98, c * 0.3, c * 0.18);
    g.lineStyle(2, 0xffffff, 0.45);
    g.strokeCircle(c, c * 1.18, c * 0.7);
    // The bigger the bottle's worth, the more sparkles on it.
    const sparkles = item === 'exp_s' ? 0 : item === 'exp_m' ? 1 : item === 'exp_l' ? 2 : 3;
    g.fillStyle(0xffffff, 0.95);
    for (let i = 0; i < sparkles; i++) g.fillCircle(c * (1.0 + 0.3 * i), c * (1.35 + 0.12 * (i % 2)), Math.max(1.3, c * 0.06));
  });
}

/** 技素: its supplied picture (public/assets/items/skill_essence.png) if there is one, else a green orb with a
 *  four-pointed spark. */
export function skillEssenceIcon(scene: Phaser.Scene, size = 56): string {
  const art = scaledArt(scene, `${ITEM_ART_PREFIX}skill_essence`, `icon_item_art_skill_essence_${size}`, size);
  if (art) return art;
  return ensureTexture(scene, `icon_skill_essence_${size}`, size, (g, c) => {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(c, c * 1.86, c * 1.0, c * 0.18);
    g.fillStyle(0x1f6a3a, 1);
    g.fillCircle(c, c, c * 0.9);
    g.fillStyle(0x4fc07a, 1);
    g.fillCircle(c, c, c * 0.78);
    g.fillStyle(0xb8f0c8, 0.55);
    g.fillEllipse(c * 0.78, c * 0.68, c * 0.5, c * 0.3);
    g.fillStyle(0xffffff, 1);
    const r = c * 0.5;
    const t = c * 0.12;
    g.fillTriangle(c, c - r, c + t, c, c - t, c);
    g.fillTriangle(c, c + r, c + t, c, c - t, c);
    g.fillTriangle(c - r, c, c, c - t, c, c + t);
    g.fillTriangle(c + r, c, c, c - t, c, c + t);
    g.lineStyle(2, 0xd8ffe4, 0.8);
    g.strokeCircle(c, c, c * 0.9);
  });
}

/** Equipment pictures: `public/assets/equipment/<piece id>.png` (weapon-1-0, ... - the ids of data/equipment.ts), the
 *  piece alone on a transparent background. One without a picture - or whose file is missing - keeps its drawn shape. */
const EQUIP_ART_PREFIX = 'equip_art_';

/** How much of the disc's inner width the picture spans (the pieces lie on a diagonal, so the tips stay inside the ring). */
const EQUIP_ART_FILL = 0.9;

export function preloadEquipArt(scene: Phaser.Scene): void {
  for (const def of EQUIP_DEFS) scene.load.image(`${EQUIP_ART_PREFIX}${def.id}`, `/assets/equipment/${def.id}.png`);
}

/** The piece's picture on the same disc ringed in its rarity colour that the drawn shapes sit on, or null when it has none. */
function equipArtIcon(scene: Phaser.Scene, defId: string, rarity: Rarity, size: number): string | null {
  const source = `${EQUIP_ART_PREFIX}${defId}`;
  if (!scene.textures.exists(source)) return null;
  const key = `icon_equip_art_${defId}_${size}`;
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, size, size);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return null;
  const c = size / 2;
  const ring = `#${RARITY_COLORS[rarity].toString(16).padStart(6, '0')}`;
  const disc = (r: number, fill: string, alpha: number, dy = 0): void => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(c, c + dy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  disc(c - 1, '#000000', 0.35, 2);
  disc(c - 1, ring, 1);
  disc(c - 4, '#1a1209', 1);
  disc(c - 4, ring, 0.3); // a little lighter than behind the drawn shapes: the pieces are dark and thin
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const side = (c - 4) * 2 * EQUIP_ART_FILL;
  ctx.drawImage(scene.textures.get(source).getSourceImage() as CanvasImageSource, c - side / 2, c - side / 2, side, side);
  canvas.refresh();
  return key;
}

/** An equipment piece on a disc ringed in its rarity colour: its picture if `defId` names a piece that has one, else its shape. */
export function equipIcon(scene: Phaser.Scene, glyph: EquipGlyph, rarity: Rarity, size = 64, defId?: string): string {
  const art = defId ? equipArtIcon(scene, defId, rarity, size) : null;
  if (art) return art;
  return ensureTexture(scene, `icon_equip_${glyph}_${rarity}_${size}`, size, (g, c) => {
    const ring = RARITY_COLORS[rarity];
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(c, c + 2, c - 1);
    g.fillStyle(ring, 1);
    g.fillCircle(c, c, c - 1);
    g.fillStyle(0x1a1209, 1);
    g.fillCircle(c, c, c - 4);
    g.fillStyle(ring, 0.18);
    g.fillCircle(c, c, c - 4);
    drawEquipGlyph(g, glyph, c, 0xf5ecd8, ring);
  });
}

/** One shape per kind of piece, drawn inside a disc of radius c centred at (c, c): `color` for the body, `accent` for the detail. */
function drawEquipGlyph(g: Phaser.GameObjects.Graphics, glyph: EquipGlyph, c: number, color: number, accent: number): void {
  const line = (x1: number, y1: number, x2: number, y2: number, w: number, col: number): void => {
    g.lineStyle(w, col, 1);
    g.beginPath();
    g.moveTo(c + x1 * c, c + y1 * c);
    g.lineTo(c + x2 * c, c + y2 * c);
    g.strokePath();
  };
  const poly = (pts: [number, number][], col: number): void => {
    g.fillStyle(col, 1);
    g.fillPoints(
      pts.map(([x, y]) => new Phaser.Math.Vector2(c + x * c, c + y * c)),
      true,
    );
  };
  switch (glyph) {
    case 'sword':
      line(-0.34, 0.34, 0.38, -0.38, c * 0.14, color);
      line(-0.3, -0.02, 0.02, 0.3, c * 0.12, accent);
      g.fillStyle(accent, 1);
      g.fillCircle(c - c * 0.4, c + c * 0.4, c * 0.1);
      break;
    case 'bow': {
      g.lineStyle(c * 0.13, color, 1);
      g.beginPath();
      g.arc(c - c * 0.18, c, c * 0.5, -Math.PI / 2.6, Math.PI / 2.6, false);
      g.strokePath();
      line(0.12, -0.46, 0.12, 0.46, c * 0.05, accent);
      line(-0.4, 0, 0.44, 0, c * 0.07, color);
      poly([[0.44, 0], [0.28, -0.1], [0.28, 0.1]], accent);
      break;
    }
    case 'staff':
      line(-0.36, 0.44, 0.22, -0.2, c * 0.13, color);
      g.fillStyle(accent, 1);
      g.fillCircle(c + c * 0.3, c - c * 0.3, c * 0.2);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(c + c * 0.25, c - c * 0.36, c * 0.06);
      break;
    case 'spear':
      line(-0.4, 0.42, 0.28, -0.26, c * 0.1, color);
      poly([[0.46, -0.46], [0.18, -0.34], [0.34, -0.18]], accent);
      line(-0.1, 0.06, 0.1, 0.26, c * 0.1, accent);
      break;
    case 'axe':
      line(-0.36, 0.4, 0.2, -0.2, c * 0.13, color);
      poly([[0.1, -0.5], [0.46, -0.2], [0.22, 0.04], [0.12, -0.16]], accent);
      break;
    case 'armor':
      poly([[-0.2, -0.46], [0.2, -0.46], [0.46, -0.26], [0.36, -0.04], [0.26, -0.1], [0.26, 0.46], [-0.26, 0.46], [-0.26, -0.1], [-0.36, -0.04], [-0.46, -0.26]], color);
      line(0, -0.46, 0, 0.44, c * 0.07, accent);
      line(-0.22, 0.2, 0.22, 0.2, c * 0.07, accent);
      break;
    case 'shield':
      poly([[-0.4, -0.36], [0.4, -0.36], [0.4, 0.1], [0, 0.52], [-0.4, 0.1]], color);
      line(0, -0.3, 0, 0.38, c * 0.09, accent);
      line(-0.3, -0.06, 0.3, -0.06, c * 0.09, accent);
      break;
    case 'ring':
      g.lineStyle(c * 0.15, color, 1);
      g.strokeCircle(c, c + c * 0.12, c * 0.3);
      poly([[0, -0.46], [0.17, -0.24], [0, -0.1], [-0.17, -0.24]], accent);
      break;
    case 'necklace': {
      g.lineStyle(c * 0.09, color, 1);
      g.beginPath();
      g.arc(c, c - c * 0.28, c * 0.46, Math.PI * 0.12, Math.PI * 0.88, false);
      g.strokePath();
      poly([[0, 0.12], [0.16, 0.3], [0, 0.5], [-0.16, 0.3]], accent);
      break;
    }
    case 'boots':
      poly([[-0.28, -0.42], [0.1, -0.42], [0.1, 0.1], [0.46, 0.2], [0.46, 0.44], [-0.28, 0.44]], color);
      line(-0.28, 0.3, 0.46, 0.3, c * 0.08, accent);
      break;
    case 'crown':
      poly([[-0.46, 0.34], [-0.46, -0.26], [-0.22, 0], [0, -0.42], [0.22, 0], [0.46, -0.26], [0.46, 0.34]], color);
      g.fillStyle(accent, 1);
      g.fillCircle(c, c + c * 0.12, c * 0.1);
      g.fillCircle(c - c * 0.26, c + c * 0.16, c * 0.07);
      g.fillCircle(c + c * 0.26, c + c * 0.16, c * 0.07);
      break;
  }
}

// --- home screen corner buttons (the same neutral badge as the bell and the gear) ---

/** A clipboard with ticked lines on the neutral corner badge: ミッション. */
export function clipboardIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `icon_clipboard_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    g.fillStyle(CORNER_GLYPH, 1);
    g.fillRoundedRect(c - c * 0.42, c - c * 0.46, c * 0.84, c * 1.0, 5);
    g.fillStyle(CORNER_BADGE_FILL, 1);
    g.fillRoundedRect(c - c * 0.22, c - c * 0.56, c * 0.44, c * 0.2, 4);
    g.lineStyle(2.5, CORNER_BADGE_FILL, 1);
    for (let i = 0; i < 3; i++) {
      const y = c - c * 0.14 + i * c * 0.24;
      g.beginPath();
      g.moveTo(c - c * 0.28, y);
      g.lineTo(c - c * 0.2, y + c * 0.07);
      g.lineTo(c - c * 0.08, y - c * 0.07);
      g.moveTo(c + c * 0.04, y);
      g.lineTo(c + c * 0.28, y);
      g.strokePath();
    }
  });
}

export function hourglassIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `icon_hourglass_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    g.fillStyle(CORNER_GLYPH, 1);
    g.fillRoundedRect(c - c * 0.42, c - c * 0.56, c * 0.84, c * 0.12, 3);
    g.fillRoundedRect(c - c * 0.42, c + c * 0.44, c * 0.84, c * 0.12, 3);
    g.fillTriangle(c - c * 0.34, c - c * 0.44, c + c * 0.34, c - c * 0.44, c, c);
    g.fillTriangle(c, c, c - c * 0.34, c + c * 0.44, c + c * 0.34, c + c * 0.44);
    g.fillStyle(0xffd23f, 1);
    g.fillTriangle(c - c * 0.2, c + c * 0.44, c + c * 0.2, c + c * 0.44, c, c + c * 0.14);
    g.fillTriangle(c - c * 0.14, c - c * 0.44, c + c * 0.14, c - c * 0.44, c, c - c * 0.22);
  });
}

export function swordBadgeIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `icon_sword_badge_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    drawEquipGlyph(g, 'sword', c, CORNER_GLYPH, 0xffd23f);
  });
}

export function crownIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `icon_crown_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, 0xffd23f);
    const crown = [
      new Phaser.Math.Vector2(c - c * 0.5, c + c * 0.34),
      new Phaser.Math.Vector2(c - c * 0.5, c - c * 0.26),
      new Phaser.Math.Vector2(c - c * 0.25, c + c * 0.0),
      new Phaser.Math.Vector2(c, c - c * 0.42),
      new Phaser.Math.Vector2(c + c * 0.25, c + c * 0.0),
      new Phaser.Math.Vector2(c + c * 0.5, c - c * 0.26),
      new Phaser.Math.Vector2(c + c * 0.5, c + c * 0.34),
    ];
    g.fillStyle(0xffd23f, 1);
    g.fillPoints(crown, true);
    g.lineStyle(2, 0x8a6100, 1);
    g.strokePoints(crown, true);
    g.fillStyle(0xd0453a, 1);
    g.fillCircle(c, c + c * 0.12, c * 0.1);
    g.fillStyle(0x6fc4ff, 1);
    g.fillCircle(c - c * 0.28, c + c * 0.16, c * 0.07);
    g.fillCircle(c + c * 0.28, c + c * 0.16, c * 0.07);
  });
}
