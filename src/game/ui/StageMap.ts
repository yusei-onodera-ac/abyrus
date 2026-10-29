import Phaser from 'phaser';
import type { RegionDef, RegionLook, RegionMotif } from '../data/regions';
import { CHROME } from './theme';
import type { StageNodeState } from './Icons';

const INK = '#1c130a';
const FONT_SERIF = 'Georgia, "Hiragino Mincho ProN", "Noto Serif JP", serif';

/** Linear blend of two 0xRRGGBB colors (t = 0 gives `a`, 1 gives `b`). */
export function mixColor(a: number, b: number, t: number): number {
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Tiny seeded PRNG: the scenery has to land in the same places every time the page is rebuilt. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- scenery --------------------------------------------------------------

type Rand = () => number;

function drawMotif(g: Phaser.GameObjects.Graphics, motif: RegionMotif, x: number, y: number, size: number, color: number, alpha: number, rand: Rand): void {
  g.fillStyle(color, alpha);
  switch (motif) {
    case 'pine':
      g.fillRect(x - size * 0.04, y - size * 0.12, size * 0.08, size * 0.12);
      for (let k = 0; k < 3; k++) {
        const top = y - size * (1 - k * 0.26);
        const half = size * (0.2 + k * 0.1);
        g.fillTriangle(x, top, x - half, top + size * 0.4, x + half, top + size * 0.4);
      }
      break;
    case 'dune':
      g.fillEllipse(x, y, size * 2.4, size * 0.6);
      g.fillStyle(0xffffff, 0.07);
      g.fillEllipse(x - size * 0.2, y - size * 0.1, size * 1.4, size * 0.25);
      break;
    case 'peak':
      g.fillTriangle(x, y - size, x - size * 0.62, y, x + size * 0.62, y);
      g.fillStyle(0xeaf6fc, alpha);
      g.fillTriangle(x, y - size, x - size * 0.2, y - size * 0.62, x + size * 0.2, y - size * 0.62);
      break;
    case 'pillar': {
      const w = size * 0.3;
      const h = size * (0.7 + rand() * 0.5);
      g.fillRect(x - w / 2, y - h, w, h);
      g.fillRect(x - w * 0.8, y - size * 0.08, w * 1.6, size * 0.08);
      g.fillStyle(0xd9b8ff, alpha * 0.5);
      g.fillCircle(x + (rand() - 0.5) * size, y - h - size * 0.25, size * 0.07);
      break;
    }
    case 'tower': {
      const w = size * 0.5;
      const h = size * (0.8 + rand() * 0.9);
      g.fillRect(x - w / 2, y - h, w, h);
      g.fillTriangle(x - w / 2, y - h, x, y - h - size * 0.2, x + w / 2, y - h);
      g.fillStyle(0xffd27a, alpha);
      for (let wy = y - h + 10; wy < y - 10; wy += 16) {
        for (const wx of [-w * 0.25, w * 0.25]) if (rand() < 0.45) g.fillRect(x + wx - 3, wy, 6, 8);
      }
      break;
    }
  }
}

/** Fills `g` (origin top-left) with the sky gradient and scenery of `look`. */
export function drawScenery(g: Phaser.GameObjects.Graphics, look: RegionLook, width: number, height: number, seed: number): void {
  g.fillGradientStyle(look.skyTop, look.skyTop, look.skyBottom, look.skyBottom, 1);
  g.fillRect(0, 0, width, height);

  const rand = seeded(seed);
  const count = Math.max(5, Math.round((width * height) / 14000));
  const items = Array.from({ length: count }, () => {
    const near = rand() < 0.45;
    return { x: rand() * width, y: 30 + rand() * (height - 30), near, size: near ? 46 + rand() * 34 : 28 + rand() * 22 };
  }).sort((a, b) => a.y - b.y);
  for (const item of items) {
    drawMotif(g, look.motif, item.x, item.y, item.size, item.near ? look.motifLight : look.motifDark, item.near ? 0.5 : 0.75, rand);
  }
}

/** The picture behind a stretch of the quest map: the region's own artwork when
 *  `public/assets/backgrounds/region_<id>.jpg` was supplied (and `allowArt`),
 *  otherwise a sky gradient with the region's scenery, drawn from its `look`. */
export function buildRegionBackdrop(scene: Phaser.Scene, region: RegionDef, width: number, height: number, allowArt = true): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const key = `region_${region.id}`;
  if (allowArt && scene.textures.exists(key)) {
    const frame = scene.textures.get(key).getSourceImage();
    const scale = Math.max(width / frame.width, height / frame.height);
    container.add(scene.add.image(width / 2, height / 2, key).setScale(scale));
    const dim = scene.add.graphics();
    dim.fillStyle(0x05060a, 0.35);
    dim.fillRect(0, 0, width, height);
    container.add(dim);
    return container;
  }
  const g = scene.add.graphics();
  drawScenery(g, region.look, width, height, 1000 + region.index * 77);
  container.add(g);
  return container;
}

// --- road -----------------------------------------------------------------

export interface RoadPoint {
  x: number;
  y: number;
}

/** The winding road through `points` (one per stage, in order). The stretch up
 *  to point `litUpTo` - the stages already cleared, and the one to play next -
 *  glows in the region's `accent`. */
export function drawRoad(scene: Phaser.Scene, points: RoadPoint[], accent: number, litUpTo: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  if (points.length < 2) return g;
  const perSegment = 12;
  const total = (points.length - 1) * perSegment;
  const poly = new Phaser.Curves.Spline(points.map((p) => new Phaser.Math.Vector2(p.x, p.y))).getPoints(total);

  const stroke = (width: number, color: number, alpha: number, from = 0, to = total, dy = 0): void => {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(poly[from].x, poly[from].y + dy);
    for (let i = from + 1; i <= to; i++) g.lineTo(poly[i].x, poly[i].y + dy);
    g.strokePath();
  };

  stroke(40, 0x000000, 0.3, 0, total, 4);
  stroke(36, 0x2a1a0c, 0.92);
  stroke(28, mixColor(0xa8895a, accent, 0.18), 1);
  g.lineStyle(3, CHROME.brassBright, 0.4);
  for (let i = 0; i < total; i += 3) {
    g.beginPath();
    g.moveTo(poly[i].x, poly[i].y);
    g.lineTo(poly[i + 1].x, poly[i + 1].y);
    g.strokePath();
  }

  const lit = Math.max(0, Math.min(total, Math.round(litUpTo * perSegment)));
  if (lit > 0) {
    stroke(14, accent, 0.85, 0, lit);
    stroke(5, 0xffffff, 0.28, 0, lit);
  }
  return g;
}

// --- nodes ----------------------------------------------------------------

/** A small padlock, centered on (x, y), for what is still locked. */
export function drawPadlock(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - 6 * scale, y - scale, 12 * scale, 9 * scale, 2 * scale);
  g.lineStyle(2 * scale, color, 1);
  g.beginPath();
  g.arc(x, y - scale, 4 * scale, Math.PI, 0, false);
  g.strokePath();
}

/** normal = an ordinary stage; goal = the last stage of a region (a flag on it);
 *  boss = a boss fight (a crown); final = the 最終決戦 (a bigger crown and a ring of spikes). */
export type MedallionKind = 'normal' | 'goal' | 'boss' | 'final';

export interface MedallionOptions {
  state: StageNodeState;
  size: number;
  /** The region's theme color (gold for the final battle). */
  accent: number;
  kind?: MedallionKind;
  /** Printed on the face; a line break gives two lines. */
  label: string;
  onTap?: () => void;
  /** Checked on release; false swallows the tap (see ScrollView.isTap). */
  guard?: () => boolean;
}

/** A stage on the map: a brass-rimmed wooden medallion whose face reports
 *  locked / next-to-play / cleared at a glance. Origin is its center. */
export function stageMedallion(scene: Phaser.Scene, opts: MedallionOptions): Phaser.GameObjects.Container {
  const { state, size, accent, label } = opts;
  const kind = opts.kind ?? 'normal';
  const r = size / 2;
  const locked = state === 'locked';
  const cleared = state === 'cleared';
  const current = state === 'unlocked';
  const rim = locked ? CHROME.brassDark : cleared ? CHROME.brass : CHROME.brassBright;
  const container = scene.add.container(0, 0);

  const halo = scene.add.graphics();
  if (current) {
    halo.fillStyle(accent, 0.2);
    halo.fillCircle(0, 0, r + 12);
    halo.fillStyle(accent, 0.2);
    halo.fillCircle(0, 0, r + 6);
    scene.tweens.add({ targets: halo, alpha: { from: 1, to: 0.3 }, duration: 820, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  container.add(halo);

  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.4);
  g.fillCircle(0, 4, r);
  if (kind === 'final' || kind === 'boss') {
    const spikes = kind === 'final' ? 14 : 10;
    g.fillStyle(rim, 1);
    for (let i = 0; i < spikes; i++) {
      const a = (Math.PI * 2 * i) / spikes;
      const half = 0.13;
      g.fillTriangle(Math.cos(a - half) * (r - 4), Math.sin(a - half) * (r - 4), Math.cos(a + half) * (r - 4), Math.sin(a + half) * (r - 4), Math.cos(a) * (r + 9), Math.sin(a) * (r + 9));
    }
  }
  g.fillStyle(locked ? 0x3a2a18 : rim, 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(CHROME.woodGrain, 1);
  g.fillCircle(0, 0, r - 5);
  g.fillStyle(locked ? 0x2a1d10 : cleared ? mixColor(accent, CHROME.woodGrain, 0.15) : mixColor(accent, CHROME.woodFill, 0.45), 1);
  g.fillCircle(0, 0, r - 7);
  g.fillStyle(0xffffff, locked ? 0.03 : 0.16);
  g.fillEllipse(0, -(r - 7) * 0.45, (r - 7) * 1.2, (r - 7) * 0.55);
  g.lineStyle(1.5, rim, locked ? 0.35 : 0.7);
  g.strokeCircle(0, 0, r - 12);
  container.add(g);

  // What sits on top of the rim.
  let topY = -r - 10;
  if (kind === 'goal') {
    const deco = scene.add.graphics();
    deco.lineStyle(3, rim, 1);
    deco.beginPath();
    deco.moveTo(0, -r + 4);
    deco.lineTo(0, -r - 28);
    deco.strokePath();
    deco.fillStyle(locked ? 0x5a4a30 : accent, 1);
    deco.fillTriangle(0, -r - 28, 24, -r - 19, 0, -r - 10);
    container.add(deco);
    topY = -r - 32;
  } else if (kind === 'boss' || kind === 'final') {
    const w = r * (kind === 'final' ? 0.62 : 0.52);
    const lift = kind === 'final' ? 18 : 12;
    const crown = scene.add.graphics();
    crown.fillStyle(locked ? 0x5a4a30 : CHROME.brassBright, 1);
    crown.lineStyle(2, 0x2a1a0c, 1);
    const points = [
      new Phaser.Math.Vector2(-w, -r + 6),
      new Phaser.Math.Vector2(-w, -r - lift),
      new Phaser.Math.Vector2(-w / 2, -r - lift * 0.4),
      new Phaser.Math.Vector2(0, -r - lift * 1.5),
      new Phaser.Math.Vector2(w / 2, -r - lift * 0.4),
      new Phaser.Math.Vector2(w, -r - lift),
      new Phaser.Math.Vector2(w, -r + 6),
    ];
    crown.fillPoints(points, true);
    crown.strokePoints(points, true);
    container.add(crown);
    topY = -r - lift * 1.5 - 8;
  }

  const lines = label.split('\n').length;
  const fontSize = kind === 'normal' ? 26 : kind === 'final' ? 25 : 28;
  container.add(
    scene.add
      .text(0, 0, label, { fontFamily: FONT_SERIF, fontSize: `${fontSize}px`, fontStyle: 'bold', color: locked ? '#7a6a4a' : '#fff4dc', stroke: INK, strokeThickness: 4, align: 'center', lineSpacing: lines > 1 ? -2 : 0 })
      .setOrigin(0.5),
  );

  const badge = scene.add.graphics();
  const bx = r * 0.7;
  const by = r * 0.7;
  if (cleared) {
    badge.fillStyle(CHROME.brassBright, 1);
    badge.fillCircle(bx, by, 11);
    badge.lineStyle(1.5, 0x2a1a0c, 1);
    badge.strokeCircle(bx, by, 11);
    badge.lineStyle(3, 0x2a1a0c, 1);
    badge.beginPath();
    badge.moveTo(bx - 5, by);
    badge.lineTo(bx - 1, by + 4);
    badge.lineTo(bx + 6, by - 4);
    badge.strokePath();
  } else if (locked) {
    drawPadlock(badge, bx, by, 1.1, CHROME.brassDark);
  }
  container.add(badge);

  // A bobbing arrow over the stage to play next.
  let arrow: Phaser.GameObjects.Graphics | undefined;
  if (current) {
    arrow = scene.add.graphics();
    arrow.fillStyle(CHROME.brassBright, 1);
    arrow.lineStyle(2, 0x2a1a0c, 1);
    arrow.fillTriangle(-11, -9, 11, -9, 0, 7);
    arrow.strokeTriangle(-11, -9, 11, -9, 0, 7);
    arrow.setPosition(0, topY - 8);
    container.add(arrow);
    scene.tweens.add({ targets: arrow, y: topY - 1, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  container.once(Phaser.GameObjects.Events.DESTROY, () => scene.tweens.killTweensOf(arrow ? [halo, arrow, container] : [halo, container]));

  container.setSize(size, size);
  if (opts.onTap && !locked) {
    // Container hit-testing adds displayOriginX/Y (half the size) to the local
    // point before testing the shape, so the circle is centered at (half, half).
    container.setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains);
    if (container.input) container.input.cursor = 'pointer';
    const tweenTo = (scale: number, duration: number) => scene.tweens.add({ targets: container, scale, duration });
    container.on('pointerover', () => tweenTo(1.08, 100));
    container.on('pointerout', () => tweenTo(1, 120));
    container.on('pointerdown', () => tweenTo(0.93, 60));
    container.on('pointerup', () => {
      if (opts.guard && !opts.guard()) return;
      opts.onTap!();
    });
  }
  return container;
}
