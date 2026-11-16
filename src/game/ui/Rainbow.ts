import Phaser from 'phaser';

/** Colours of the ★6 tier (gold + magenta + a slowly turning rainbow): the one rarity that is meant to outshine every other. */
export const GOLD = 0xffd23f;

/** An opaque colour from a hue (0..1), pastel when `saturation` is low. */
export function rainbow(hue: number, saturation = 0.7): number {
  const c = Phaser.Display.Color.HSVToRGB(((hue % 1) + 1) % 1, saturation, 1) as Phaser.Types.Display.ColorObject;
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

/**
 * A ring of turning rainbow light round a rounded square (a ★6 card or slot), drawn as a few coloured arcs of the
 * frame that chase each other round it. The tween dies with `owner`.
 */
export function addRainbowFrame(scene: Phaser.Scene, owner: Phaser.GameObjects.Container, size: number, radius: number, grow = 3): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  owner.add(g);
  const half = size / 2 + grow;
  const draw = (turn: number): void => {
    g.clear();
    // A gold under-line, then 24 short bright segments of the frame in turning colours.
    g.lineStyle(2, GOLD, 0.9);
    g.strokeRoundedRect(-half - 2, -half - 2, size + (grow + 2) * 2, size + (grow + 2) * 2, radius + 3);
    const segments = 24;
    for (let i = 0; i < segments; i++) {
      g.lineStyle(4, rainbow(turn + i / segments, 0.75), 0.95);
      const from = ((i + turn * segments) % segments) / segments;
      const a = pointOnSquare(from, half);
      const b = pointOnSquare(from + 0.75 / segments, half);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokePath();
    }
  };
  draw(0);
  const state = { t: 0 };
  const tween = scene.tweens.add({ targets: state, t: 1, duration: 2400, repeat: -1, onUpdate: () => draw(state.t) });
  owner.once(Phaser.GameObjects.Events.DESTROY, () => tween.stop());
  return g;
}

/** A point on the outline of a square of half-side `half` centred on the origin; `t` 0..1 goes once round from the top-left. */
function pointOnSquare(t: number, half: number): { x: number; y: number } {
  const p = (((t % 1) + 1) % 1) * 4;
  const side = Math.floor(p);
  const f = p - side;
  const span = half * 2;
  if (side === 0) return { x: -half + f * span, y: -half };
  if (side === 1) return { x: half, y: -half + f * span };
  if (side === 2) return { x: half - f * span, y: half };
  return { x: -half, y: half - f * span };
}
