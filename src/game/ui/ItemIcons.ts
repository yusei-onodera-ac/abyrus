import Phaser from 'phaser';
import type { ItemId } from '../data/items';
import { RARITY_COLORS, type EquipSlot, type Rarity } from '../types';
import { CORNER_BADGE_FILL, CORNER_BADGE_RING, CORNER_GLYPH, drawNavBadge, ensureTexture } from './Icons';

/** Code-drawn icons for 素材, equipment and the home screen's new corner buttons. */

const POTION: Record<'exp_s' | 'exp_m' | 'exp_l' | 'exp_xl', { body: number; liquid: number }> = {
  exp_s: { body: 0x2f6fa0, liquid: 0x6fc4ff },
  exp_m: { body: 0x2f7a3f, liquid: 0x7be08a },
  exp_l: { body: 0xa87020, liquid: 0xffc65a },
  exp_xl: { body: 0xa03070, liquid: 0xff7ac0 },
};

/** A 素材: a potion bottle for each 経験値素材 (bigger tiers fuller and brighter), a glowing crystal for 装備強化素材. */
export function itemIcon(scene: Phaser.Scene, item: ItemId, size = 56): string {
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

/** An equipment piece's glyph (sword / armour / ring) on a disc ringed in its rarity colour. */
export function equipIcon(scene: Phaser.Scene, slot: EquipSlot, rarity: Rarity, size = 64): string {
  return ensureTexture(scene, `icon_equip_${slot}_${rarity}_${size}`, size, (g, c) => {
    const ring = RARITY_COLORS[rarity];
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(c, c + 2, c - 1);
    g.fillStyle(ring, 1);
    g.fillCircle(c, c, c - 1);
    g.fillStyle(0x1a1209, 1);
    g.fillCircle(c, c, c - 4);
    g.fillStyle(ring, 0.18);
    g.fillCircle(c, c, c - 4);
    drawEquipGlyph(g, slot, c, 0xf5ecd8, ring);
  });
}

function drawEquipGlyph(g: Phaser.GameObjects.Graphics, slot: EquipSlot, c: number, color: number, accent: number): void {
  g.fillStyle(color, 1);
  g.lineStyle(c * 0.14, color, 1);
  if (slot === 'weapon') {
    g.beginPath();
    g.moveTo(c - c * 0.34, c + c * 0.34);
    g.lineTo(c + c * 0.38, c - c * 0.38);
    g.strokePath();
    g.lineStyle(c * 0.12, accent, 1);
    g.beginPath();
    g.moveTo(c - c * 0.3, c - c * 0.02);
    g.lineTo(c + c * 0.02, c + c * 0.3);
    g.strokePath();
    g.fillStyle(accent, 1);
    g.fillCircle(c - c * 0.4, c + c * 0.4, c * 0.1);
  } else if (slot === 'armor') {
    const shield = [
      new Phaser.Math.Vector2(c - c * 0.4, c - c * 0.36),
      new Phaser.Math.Vector2(c + c * 0.4, c - c * 0.36),
      new Phaser.Math.Vector2(c + c * 0.4, c + c * 0.1),
      new Phaser.Math.Vector2(c, c + c * 0.52),
      new Phaser.Math.Vector2(c - c * 0.4, c + c * 0.1),
    ];
    g.fillPoints(shield, true);
    g.lineStyle(c * 0.09, accent, 1);
    g.beginPath();
    g.moveTo(c, c - c * 0.3);
    g.lineTo(c, c + c * 0.38);
    g.moveTo(c - c * 0.3, c - c * 0.06);
    g.lineTo(c + c * 0.3, c - c * 0.06);
    g.strokePath();
  } else {
    g.lineStyle(c * 0.15, color, 1);
    g.strokeCircle(c, c + c * 0.12, c * 0.3);
    g.fillStyle(accent, 1);
    g.fillTriangle(c, c - c * 0.46, c + c * 0.17, c - c * 0.24, c - c * 0.17, c - c * 0.24);
    g.fillTriangle(c, c - c * 0.1, c + c * 0.17, c - c * 0.24, c - c * 0.17, c - c * 0.24);
  }
}

// --- home screen corner buttons (the same neutral badge as the bell and the gear) ---

export function calendarIcon(scene: Phaser.Scene, size = 72): string {
  return ensureTexture(scene, `icon_calendar_${size}`, size, (g, c) => {
    drawNavBadge(g, c, CORNER_BADGE_FILL, CORNER_BADGE_RING);
    g.fillStyle(CORNER_GLYPH, 1);
    g.fillRoundedRect(c - c * 0.5, c - c * 0.36, c, c * 0.88, 5);
    g.fillStyle(0xd0453a, 1);
    g.fillRoundedRect(c - c * 0.5, c - c * 0.36, c, c * 0.24, { tl: 5, tr: 5, bl: 0, br: 0 });
    g.fillStyle(CORNER_GLYPH, 1);
    g.fillRoundedRect(c - c * 0.3, c - c * 0.5, c * 0.12, c * 0.26, 3);
    g.fillRoundedRect(c + c * 0.18, c - c * 0.5, c * 0.12, c * 0.26, 3);
    g.fillStyle(CORNER_BADGE_FILL, 1);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) g.fillRect(c - c * 0.34 + col * c * 0.28, c + c * 0.02 + row * c * 0.24, c * 0.16, c * 0.14);
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
    drawEquipGlyph(g, 'weapon', c, CORNER_GLYPH, 0xffd23f);
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
