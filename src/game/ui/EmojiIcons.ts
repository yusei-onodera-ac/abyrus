import Phaser from 'phaser';
import type { EmojiId } from '../data/emoji';
import { coinIcon, gemIcon } from './Icons';

/** Every in-game emoji, drawn from code into a SIZE x SIZE texture the first
 *  time it is asked for. (generateTexture rasterizes through Canvas 2D, so
 *  shading is flat layers rather than gradients, like the other icons.) */
const SIZE = 64;
const INK = 0x4a2a08;
const SKIN = 0xffd84a;

type Draw = (g: Phaser.GameObjects.Graphics, c: number) => void;

function base(g: Phaser.GameObjects.Graphics, c: number, fill = SKIN): void {
  g.fillStyle(0x000000, 0.25);
  g.fillCircle(c, c + 2, c - 3);
  g.fillStyle(fill, 1);
  g.fillCircle(c, c, c - 3);
  g.lineStyle(2.5, 0xb97a0e, 1);
  g.strokeCircle(c, c, c - 3);
  g.fillStyle(0xffffff, 0.3);
  g.fillEllipse(c - c * 0.18, c - c * 0.52, c * 0.7, c * 0.3);
}

function arc(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, from: number, to: number, width = 3.2, color = INK): void {
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.arc(x, y, r, from, to, false);
  g.strokePath();
}

const dots = (g: Phaser.GameObjects.Graphics, c: number, dy = -0.12): void => {
  g.fillStyle(INK, 1);
  g.fillEllipse(c - c * 0.34, c + c * dy, c * 0.17, c * 0.26);
  g.fillEllipse(c + c * 0.34, c + c * dy, c * 0.17, c * 0.26);
};
const smile = (g: Phaser.GameObjects.Graphics, c: number): void => arc(g, c, c + c * 0.02, c * 0.46, Math.PI * 0.12, Math.PI * 0.88);
const frown = (g: Phaser.GameObjects.Graphics, c: number): void => arc(g, c, c + c * 0.66, c * 0.36, Math.PI * 1.18, Math.PI * 1.82);

/** Points of a shape written in units of c around the center, optionally rotated. */
const poly = (c: number, pts: [number, number][], rot = 0): Phaser.Math.Vector2[] => {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return pts.map(([x, y]) => new Phaser.Math.Vector2(c + (x * cos - y * sin) * c, c + (x * sin + y * cos) * c));
};

const DRAW: Record<Exclude<EmojiId, 'gem' | 'coin'>, Draw> = {
  smile: (g, c) => {
    base(g, c);
    dots(g, c);
    smile(g, c);
  },
  laugh: (g, c) => {
    base(g, c);
    arc(g, c - c * 0.34, c - c * 0.06, c * 0.15, Math.PI * 1.1, Math.PI * 1.9);
    arc(g, c + c * 0.34, c - c * 0.06, c * 0.15, Math.PI * 1.1, Math.PI * 1.9);
    g.fillStyle(INK, 1);
    g.beginPath();
    g.arc(c, c + c * 0.08, c * 0.52, 0, Math.PI, false);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xff7a8a, 1);
    g.fillEllipse(c, c + c * 0.5, c * 0.5, c * 0.22);
  },
  wink: (g, c) => {
    base(g, c);
    g.fillStyle(INK, 1);
    g.fillEllipse(c - c * 0.34, c - c * 0.12, c * 0.17, c * 0.26);
    arc(g, c + c * 0.34, c - c * 0.06, c * 0.16, Math.PI * 1.1, Math.PI * 1.9);
    smile(g, c);
  },
  cool: (g, c) => {
    base(g, c);
    g.fillStyle(0x15151f, 1);
    g.fillRoundedRect(c - c * 0.74, c - c * 0.3, c * 0.62, c * 0.36, 6);
    g.fillRoundedRect(c + c * 0.12, c - c * 0.3, c * 0.62, c * 0.36, 6);
    g.fillRect(c - c * 0.14, c - c * 0.24, c * 0.28, c * 0.08);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(c - c * 0.62, c - c * 0.24, c * 0.18, c * 0.05);
    smile(g, c);
  },
  surprise: (g, c) => {
    base(g, c);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c - c * 0.34, c - c * 0.14, c * 0.2);
    g.fillCircle(c + c * 0.34, c - c * 0.14, c * 0.2);
    g.fillStyle(INK, 1);
    g.fillCircle(c - c * 0.34, c - c * 0.12, c * 0.09);
    g.fillCircle(c + c * 0.34, c - c * 0.12, c * 0.09);
    g.fillEllipse(c, c + c * 0.46, c * 0.26, c * 0.34);
  },
  sad: (g, c) => {
    base(g, c);
    dots(g, c, -0.06);
    g.lineStyle(2.5, INK, 1);
    g.lineBetween(c - c * 0.5, c - c * 0.4, c - c * 0.2, c - c * 0.3);
    g.lineBetween(c + c * 0.5, c - c * 0.4, c + c * 0.2, c - c * 0.3);
    frown(g, c);
  },
  cry: (g, c) => {
    base(g, c);
    dots(g, c, -0.1);
    frown(g, c);
    g.fillStyle(0x56b7ff, 1);
    g.fillEllipse(c - c * 0.4, c + c * 0.22, c * 0.15, c * 0.34);
    g.fillEllipse(c + c * 0.4, c + c * 0.22, c * 0.15, c * 0.34);
  },
  angry: (g, c) => {
    base(g, c, 0xff7a4a);
    dots(g, c, -0.02);
    g.lineStyle(3.4, INK, 1);
    g.lineBetween(c - c * 0.58, c - c * 0.5, c - c * 0.14, c - c * 0.28);
    g.lineBetween(c + c * 0.58, c - c * 0.5, c + c * 0.14, c - c * 0.28);
    frown(g, c);
  },
  heart: (g, c) => {
    const draw = (dy: number, color: number): void => {
      g.fillStyle(color, 1);
      g.fillCircle(c - c * 0.3, c - c * 0.2 + dy, c * 0.4);
      g.fillCircle(c + c * 0.3, c - c * 0.2 + dy, c * 0.4);
      g.fillTriangle(c - c * 0.68, c - c * 0.02 + dy, c + c * 0.68, c - c * 0.02 + dy, c, c + c * 0.78 + dy);
    };
    draw(2.5, 0x8c1022);
    draw(0, 0xea3a52);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(c - c * 0.42, c - c * 0.36, c * 0.28, c * 0.16);
  },
  star: (g, c) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.92 : 0.4;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r + 0.06]);
    }
    g.fillStyle(0xb97a0e, 1);
    g.fillPoints(poly(c, pts.map(([x, y]) => [x, y + 0.07] as [number, number])), true);
    g.fillStyle(0xffd23f, 1);
    g.fillPoints(poly(c, pts), true);
    g.fillStyle(0xfff3b0, 0.8);
    g.fillEllipse(c - c * 0.1, c - c * 0.18, c * 0.3, c * 0.2);
  },
  fire: (g, c) => {
    g.fillStyle(0xe8501a, 1);
    g.fillCircle(c, c + c * 0.28, c * 0.62);
    g.fillTriangle(c - c * 0.55, c + c * 0.1, c + c * 0.15, c + c * 0.05, c - c * 0.02, c - c * 0.92);
    g.fillTriangle(c + c * 0.1, c + c * 0.1, c + c * 0.6, c + c * 0.2, c + c * 0.4, c - c * 0.4);
    g.fillStyle(0xffb52e, 1);
    g.fillCircle(c, c + c * 0.4, c * 0.4);
    g.fillTriangle(c - c * 0.3, c + c * 0.3, c + c * 0.3, c + c * 0.3, c, c - c * 0.32);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(c, c + c * 0.52, c * 0.2);
  },
  sword: (g, c) => {
    const rot = Math.PI / 4;
    g.fillStyle(0xe6ebf5, 1);
    g.fillPoints(poly(c, [[0, -0.95], [0.14, -0.7], [0.14, 0.2], [-0.14, 0.2], [-0.14, -0.7]], rot), true);
    g.fillStyle(0x9aa6c0, 1);
    g.fillPoints(poly(c, [[0, -0.95], [0.14, -0.7], [0.14, 0.2], [0, 0.2]], rot), true);
    g.fillStyle(0xd9a52a, 1);
    g.fillPoints(poly(c, [[-0.42, 0.2], [0.42, 0.2], [0.42, 0.34], [-0.42, 0.34]], rot), true);
    g.fillStyle(0x7a4a1c, 1);
    g.fillPoints(poly(c, [[-0.08, 0.34], [0.08, 0.34], [0.08, 0.72], [-0.08, 0.72]], rot), true);
    const pommel = poly(c, [[0, 0.8]], rot)[0];
    g.fillStyle(0xd9a52a, 1);
    g.fillCircle(pommel.x, pommel.y, c * 0.12);
  },
  shield: (g, c) => {
    const kite: [number, number][] = [[-0.62, -0.74], [0.62, -0.74], [0.62, 0.0], [0, 0.9], [-0.62, 0.0]];
    g.fillStyle(0xd8dbe6, 1);
    g.fillPoints(poly(c, kite.map(([x, y]) => [x * 1.08, y * 1.06] as [number, number])), true);
    g.fillStyle(0x3b6fd1, 1);
    g.fillPoints(poly(c, kite), true);
    g.fillStyle(0xffd23f, 1);
    g.fillRect(c - c * 0.09, c - c * 0.6, c * 0.18, c * 1.1);
    g.fillRect(c - c * 0.4, c - c * 0.28, c * 0.8, c * 0.18);
  },
  crown: (g, c) => {
    const shape: [number, number][] = [[-0.74, 0.52], [-0.74, -0.38], [-0.36, 0.08], [0, -0.64], [0.36, 0.08], [0.74, -0.38], [0.74, 0.52]];
    g.fillStyle(0xb97a0e, 1);
    g.fillPoints(poly(c, shape.map(([x, y]) => [x, y + 0.06] as [number, number])), true);
    g.fillStyle(0xffd23f, 1);
    g.fillPoints(poly(c, shape), true);
    g.fillStyle(0xd9a52a, 1);
    g.fillRect(c - c * 0.74, c + c * 0.3, c * 1.48, c * 0.22);
    g.fillStyle(0xe8334a, 1);
    g.fillCircle(c, c - c * 0.6, c * 0.1);
    g.fillStyle(0x56b7ff, 1);
    g.fillCircle(c - c * 0.74, c - c * 0.38, c * 0.09);
    g.fillCircle(c + c * 0.74, c - c * 0.38, c * 0.09);
  },
};

/** Texture key for an in-game emoji, drawing it first if needed. */
export function emojiTexture(scene: Phaser.Scene, id: EmojiId): string {
  if (id === 'gem') return gemIcon(scene, SIZE);
  if (id === 'coin') return coinIcon(scene, SIZE);
  const key = `emoji_${id}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  DRAW[id](g, SIZE / 2);
  g.generateTexture(key, SIZE, SIZE);
  g.destroy();
  return key;
}
