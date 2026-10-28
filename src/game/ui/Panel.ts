import Phaser from 'phaser';
import type { Rarity } from '../types';
import { COLORS, RARITY_GLOW } from './theme';

export interface PanelOptions {
  fillColor?: number;
  fillAlpha?: number;
  borderColor?: number;
  borderWidth?: number;
  glowColor?: number;
  radius?: number;
  /** When set, the panel gets extra glow/border layers and corner accents
   *  that scale up with rarity, mirroring how CharacterGenerator's aura
   *  gets more elaborate at higher rarity. */
  rarity?: Rarity;
  /** Subtle brighter-top/darker-bottom sheen on the panel body. */
  gradient?: boolean;
}

/** Builds a rounded card/panel as a Container anchored at its center (x, y),
 *  matching the center-anchored convention `scene.add.rectangle` already
 *  uses everywhere else in this codebase. Replaces the old flat
 *  `rectangle + setStrokeStyle` panels with a soft outer glow, a crisp
 *  inner border, and an optional gradient sheen for depth. */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: PanelOptions = {},
): Phaser.GameObjects.Container {
  const {
    fillColor = COLORS.panelFill,
    fillAlpha = 0.93,
    borderColor = COLORS.border,
    borderWidth = 2,
    glowColor = opts.rarity ? RARITY_GLOW[opts.rarity] : COLORS.accent,
    radius = 14,
    rarity,
    gradient = true,
  } = opts;

  const container = scene.add.container(x, y);
  const halfW = width / 2;
  const halfH = height / 2;

  const glowLayers = rarity ? Math.max(1, rarity - 1) : 1;
  for (let i = glowLayers; i >= 1; i--) {
    const glow = scene.add.graphics();
    glow.lineStyle(borderWidth, glowColor, 0.04 + i * (rarity ? 0.06 : 0.035));
    glow.strokeRoundedRect(-halfW - i * 3, -halfH - i * 3, width + i * 6, height + i * 6, radius + i * 2);
    container.add(glow);
  }

  const body = scene.add.graphics();
  if (gradient) {
    const top = Phaser.Display.Color.ValueToColor(fillColor).brighten(6).color;
    const bottom = Phaser.Display.Color.ValueToColor(fillColor).darken(12).color;
    body.fillGradientStyle(top, top, bottom, bottom, fillAlpha);
  } else {
    body.fillStyle(fillColor, fillAlpha);
  }
  body.fillRoundedRect(-halfW, -halfH, width, height, radius);
  body.lineStyle(borderWidth, borderColor, 0.95);
  body.strokeRoundedRect(-halfW, -halfH, width, height, radius);
  container.add(body);

  if (rarity && rarity >= 4) {
    const corners: [number, number][] = [
      [-halfW + 12, -halfH + 12],
      [halfW - 12, -halfH + 12],
      [-halfW + 12, halfH - 12],
      [halfW - 12, halfH - 12],
    ];
    const accentColor = glowColor;
    const deco = scene.add.graphics();
    deco.fillStyle(accentColor, 0.85);
    for (const [cx, cy] of corners) {
      deco.fillTriangle(cx - 6, cy, cx, cy - 6, cx + 6, cy);
      deco.fillTriangle(cx - 6, cy, cx, cy + 6, cx + 6, cy);
    }
    container.add(deco);
  }

  return container;
}

/** Thin divider line used to separate panel sections, drawn relative to the
 *  caller's own coordinate space (not a Container like createPanel). */
export function createDivider(scene: Phaser.Scene, x: number, y: number, width: number, color = COLORS.border): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.lineStyle(1, color, 0.6);
  g.beginPath();
  g.moveTo(x - width / 2, y);
  g.lineTo(x + width / 2, y);
  g.strokePath();
  return g;
}
