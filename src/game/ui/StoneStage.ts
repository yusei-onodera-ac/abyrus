import Phaser from 'phaser';

/** Small deterministic random source, so the wall looks the same every visit. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (r: number, g: number, b: number): number => Phaser.Display.Color.GetColor(r, g, b);

/** A dark stone-wall room with a glowing summoning circle on its floor, drawn
 *  from code: the stage a hero stands on in the detail screen (the reference's
 *  dungeon backdrop). `accent` tints the glow - the hero's rarity colour.
 *  Origin is the top-left; the circle sits near the bottom, centred. */
export function buildStoneStage(scene: Phaser.Scene, w: number, h: number, accent: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x14161b, 1);
  g.fillRect(0, 0, w, h);

  // Brick courses, each row shifted half a brick from the one above.
  const rng = mulberry32(20261029);
  const rowH = 70;
  for (let row = 0; row * rowH < h; row++) {
    const y = row * rowH;
    let x = -rng() * 90 - (row % 2 ? 60 : 0);
    while (x < w) {
      const bw = 120 + rng() * 80;
      const tone = 36 + Math.floor(rng() * 22);
      g.fillStyle(rgb(tone, tone + 2, tone + 8), 1);
      g.fillRoundedRect(x + 2, y + 2, bw - 4, rowH - 4, 6);
      g.fillStyle(0xffffff, 0.06);
      g.fillRoundedRect(x + 4, y + 3, bw - 8, 7, 3);
      g.fillStyle(0x000000, 0.22);
      g.fillRoundedRect(x + 4, y + rowH - 12, bw - 8, 8, 3);
      x += bw;
    }
  }

  // Darken the edges so the middle - where the hero stands - reads brightest.
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.7, 0.7, 0, 0);
  g.fillRect(0, 0, w, 170);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.6, 0.6);
  g.fillRect(0, h - 240, w, 240);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0, 0.55, 0);
  g.fillRect(0, 0, 150, h);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.55, 0, 0.55);
  g.fillRect(w - 150, 0, 150, h);

  // The floor circle: two rings, spokes and a soft glow in the hero's colour.
  const cx = w / 2;
  const cy = h - 78;
  for (let i = 4; i >= 1; i--) {
    g.fillStyle(accent, 0.05 * i);
    g.fillEllipse(cx, cy, 560 + i * 26, 130 + i * 8);
  }
  g.fillStyle(0x0b0c10, 0.55);
  g.fillEllipse(cx, cy, 560, 130);
  g.lineStyle(4, 0x6d6a60, 0.9);
  g.strokeEllipse(cx, cy, 560, 130);
  g.lineStyle(2, accent, 0.75);
  g.strokeEllipse(cx, cy, 440, 98);
  g.lineStyle(2, 0x6d6a60, 0.7);
  g.strokeEllipse(cx, cy, 330, 74);
  g.lineStyle(2, accent, 0.45);
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 165, cy + Math.sin(a) * 37);
    g.lineTo(cx + Math.cos(a) * 220, cy + Math.sin(a) * 49);
    g.strokePath();
  }

  return scene.add.container(0, 0, [g]);
}
