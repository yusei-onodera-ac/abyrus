import Phaser from 'phaser';
import { BUILDINGS, getBuilding, type BuildingDef, type BuildingKind, type WandererKind } from '../data/village';

/**
 * 村 is drawn from above at an angle: the ground is a grid of 2:1 diamonds, one tile `tileW` wide and `tileH` tall on
 * screen (at 100% zoom). A building covers w x h tiles, so the diamond it stands on is (w + h) * tileW / 2 wide.
 *
 * Pictures of buildings: public/assets/village/<kind>_<level>.png, kind = castle | shop | market | house | lumber | quarry | mine |
 * fence | gate, level = 1..6, plus the 装飾 tree | flowers | fountain | statue (level 1 only): 58 in all. Any of them may be
 * missing: the nearest level that exists stands in, and with none the building is drawn from code. Each is a transparent PNG drawn at the same angle, with the diamond it stands on touching both
 * sides of the picture and its lowest corner at the bottom middle - it is scaled so that diamond fills the building's
 * footprint (BuildingDef.art tunes that). Also optional: construction.png (the site while something is being built;
 * drawn as a 2x2) and ground.png (the whole land, behind everything, instead of the drawn grass and trees).
 */
export const ISO = { tileW: 104, tileH: 52 };
const HW = ISO.tileW / 2;
const HH = ISO.tileH / 2;

export interface Pt {
  x: number;
  y: number;
}

/** Where the top corner of tile (gx, gy) is, measured from the map's own top corner (0, 0). */
export function isoPoint(gx: number, gy: number): Pt {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH };
}

/** The tile position (fractional) under a point measured from the map's top corner: the inverse of isoPoint. */
export function isoGrid(px: number, py: number): { gx: number; gy: number } {
  const a = px / HW;
  const b = py / HH;
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

export const VILLAGE_ART_PREFIX = 'village_';
export const VILLAGE_GROUND_KEY = `${VILLAGE_ART_PREFIX}ground`;
const SITE_KEY = `${VILLAGE_ART_PREFIX}construction`;

/** The village's own plot of land, one picture per stage of growth (public/assets/village/ground_<tier>.png): tier 1 is a
 *  rural plot (castle Lv1-2), 2 a town (Lv3-4), 3 a royal city (Lv5-6). A transparent picture of the flat diamond. */
export const VILLAGE_PLOT_TIERS = 3;
export function villagePlotKey(tier: number): string {
  return `${VILLAGE_ART_PREFIX}ground_${tier}`;
}
export function villagePlotTierOf(castleLevel: number): number {
  return Math.max(1, Math.min(VILLAGE_PLOT_TIERS, Math.ceil(castleLevel / 2)));
}
export function villagePlotTier(castleLevel: number): number {
  return Math.max(1, Math.min(VILLAGE_PLOT_TIERS, Math.ceil(castleLevel / 2)));
}

export function villageArtKey(kind: BuildingKind, level: number): string {
  return `${VILLAGE_ART_PREFIX}${kind}_${level}`;
}

/** Loads the supplied village pictures, if any. A missing file is ignored (BootScene ignores load errors). */
export function preloadVillageArt(scene: Phaser.Scene): void {
  for (const def of BUILDINGS) for (let level = 1; level <= def.levels.length; level++) scene.load.image(villageArtKey(def.kind, level), `assets/village/${def.kind}_${level}.png`);
  scene.load.image(SITE_KEY, 'assets/village/construction.png');
  scene.load.image(VILLAGE_GROUND_KEY, 'assets/village/ground.png');
  for (let tier = 1; tier <= VILLAGE_PLOT_TIERS; tier++) scene.load.image(villagePlotKey(tier), `assets/village/ground_${tier}.png`);
  for (const surface of ROAD_SURFACES) scene.load.image(`${VILLAGE_ART_PREFIX}road_${surface}`, `assets/village/road_${surface}.jpg`);
}

// ---- 道: paving laid piece by piece ------------------------------------------------------------------------------
// A road piece is a 1x1 tile whose shape depends on which of its four neighbours are roads too (a 4-bit mask): a
// rounded patch in the middle with an arm to every neighbour, so that a line of pieces reads as one road with corners,
// T-junctions and crossings. The paving itself is the generated sample picture (road_<surface>.jpg: dirt, stone,
// marble - the surface follows the castle's level, like the plot), laid into the shape with a darker kerb round it.

export const ROAD_SURFACES = ['dirt', 'stone', 'marble'] as const;
/** A flat colour for a surface whose picture is missing. */
const ROAD_COLOR = [0xb08a5a, 0x8a8a92, 0xe6e1d2];
/** Half the width of the paving, in tiles (the whole tile is 1). */
const ROAD_HALF = 0.31;
const KERB = 0.05;
/** Bits of a piece's mask: the neighbour at (x, y - 1), (x + 1, y), (x, y + 1), (x - 1, y). */
export const ROAD_N = 1;
export const ROAD_E = 2;
export const ROAD_S = 4;
export const ROAD_W = 8;

/** The picture key of a road piece, made on first use. */
export function roadTile(scene: Phaser.Scene, tier: number, mask: number): string {
  const surface = Math.max(0, Math.min(ROAD_SURFACES.length - 1, tier - 1));
  const key = `${VILLAGE_ART_PREFIX}roadtile_${surface}_${mask}`;
  if (scene.textures.exists(key)) return key;
  const w = ISO.tileW;
  const h = ISO.tileH;
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return key;
  const ctx = canvas.getContext();
  // Tile coordinates (u right-down, v left-down, 0..1) to pixels.
  const toPx = (u: number, v: number): [number, number] => [(u - v) * (w / 2) + w / 2, (u + v) * (h / 2)];
  const shape = (half: number, kerb: number): void => {
    ctx.beginPath();
    const rect = (u0: number, v0: number, u1: number, v1: number): void => {
      const pts = [toPx(u0, v0), toPx(u1, v0), toPx(u1, v1), toPx(u0, v1)];
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    };
    const lo = 0.5 - half - kerb;
    const hi = 0.5 + half + kerb;
    rect(lo, lo, hi, hi);
    if (mask & ROAD_N) rect(lo, 0, hi, 0.5);
    if (mask & ROAD_S) rect(lo, 0.5, hi, 1);
    if (mask & ROAD_E) rect(0.5, lo, 1, hi);
    if (mask & ROAD_W) rect(0, lo, 0.5, hi);
  };
  // Everything stays inside the tile's own diamond, so that neighbours meet exactly at the edge.
  ctx.save();
  ctx.beginPath();
  const corners = [toPx(0, 0), toPx(1, 0), toPx(1, 1), toPx(0, 1)];
  ctx.moveTo(corners[0][0], corners[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
  ctx.closePath();
  ctx.clip();
  // The kerb: a darker, slightly wider shape (its arms' ends are cut by the tile's edge, so no line crosses a joint).
  shape(ROAD_HALF, KERB);
  ctx.fillStyle = 'rgba(48, 36, 24, 0.9)';
  ctx.fill();
  // The paving: the sample, a part of it stretched over one tile so that the stones are a good size.
  shape(ROAD_HALF, 0);
  ctx.save();
  ctx.clip();
  const sample = scene.textures.exists(`${VILLAGE_ART_PREFIX}road_${ROAD_SURFACES[surface]}`) ? scene.textures.get(`${VILLAGE_ART_PREFIX}road_${ROAD_SURFACES[surface]}`).getSourceImage() : undefined;
  if (sample) {
    ctx.imageSmoothingQuality = 'high';
    // (u, v) -> pixels as a transform, then the sample (its middle half) drawn into the unit square.
    ctx.setTransform(w / 2, h / 2, -w / 2, h / 2, w / 2, 0);
    ctx.drawImage(sample as CanvasImageSource, sample.width * 0.25, sample.height * 0.25, sample.width * 0.5, sample.height * 0.5, 0, 0, 1, 1);
  } else {
    ctx.fillStyle = `#${ROAD_COLOR[surface].toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  ctx.restore();
  canvas.refresh();
  return key;
}

/** The picture for `kind` at `level`: that level's, else the nearest lower one, else the nearest higher one. */
function pickArt(scene: Phaser.Scene, kind: BuildingKind, level: number): string | undefined {
  const count = getBuilding(kind).levels.length;
  for (let l = Math.min(level, count); l >= 1; l--) if (scene.textures.exists(villageArtKey(kind, l))) return villageArtKey(kind, l);
  for (let l = Math.max(1, level + 1); l <= count; l++) if (scene.textures.exists(villageArtKey(kind, l))) return villageArtKey(kind, l);
  return undefined;
}

/** A building's picture, with its top corner at (0, 0) (where the footprint's top corner goes) and the rectangle it covers. */
export interface Art {
  container: Phaser.GameObjects.Container;
  bounds: Phaser.Geom.Rectangle;
}

function pictureArt(scene: Phaser.Scene, key: string, def: BuildingDef): Art {
  const source = scene.textures.get(key).getSourceImage() as { width: number; height: number };
  const bottom = isoPoint(def.w, def.h);
  const footprintWidth = ((def.w + def.h) * ISO.tileW) / 2;
  const scale = (footprintWidth / source.width) * (def.art?.scale ?? 1);
  const y = bottom.y + (def.art?.dy ?? 0);
  const image = scene.add.image(bottom.x, y, key).setOrigin(0.5, 1).setScale(scale);
  const container = scene.add.container(0, 0, [image]);
  return { container, bounds: new Phaser.Geom.Rectangle(bottom.x - image.displayWidth / 2, y - image.displayHeight, image.displayWidth, image.displayHeight) };
}

// ------------------------------------------------------------ drawn art --

const OUTLINE = 0x3a2810;
const GOLD = 0xffd23f;

type G = Phaser.GameObjects.Graphics;
interface Faces {
  top: number;
  left: number;
  right: number;
}

function quad(g: G, pts: Pt[], fill: number, alpha = 1, outline = true): void {
  g.fillStyle(fill, alpha);
  g.fillPoints(pts, true);
  if (outline) {
    g.lineStyle(2, OUTLINE, 0.9);
    g.strokePoints(pts, true);
  }
}

/** A box over tiles [x0, x1] x [y0, y1] (tile units inside the footprint), `h` px tall, raised `lift` px. */
function block(g: G, x0: number, y0: number, x1: number, y1: number, h: number, f: Faces, lift = 0, trim = false): void {
  const t = isoPoint(x0, y0);
  const r = isoPoint(x1, y0);
  const b = isoPoint(x1, y1);
  const l = isoPoint(x0, y1);
  const lo = (p: Pt): Pt => ({ x: p.x, y: p.y - lift });
  const hi = (p: Pt): Pt => ({ x: p.x, y: p.y - lift - h });
  quad(g, [lo(l), lo(b), hi(b), hi(l)], f.left);
  quad(g, [lo(b), lo(r), hi(r), hi(b)], f.right);
  quad(g, [hi(t), hi(r), hi(b), hi(l)], f.top);
  if (trim) {
    g.lineStyle(3, GOLD, 1);
    g.strokePoints([hi(l), hi(b), hi(r)], false);
  }
}

/** A four-sided roof over [x0, x1] x [y0, y1], rising `apex` px from `lift`. */
function roof(g: G, x0: number, y0: number, x1: number, y1: number, lift: number, apex: number, f: { left: number; right: number }, trim = false): Pt {
  const l = isoPoint(x0, y1);
  const b = isoPoint(x1, y1);
  const r = isoPoint(x1, y0);
  const c = isoPoint((x0 + x1) / 2, (y0 + y1) / 2);
  const lo = (p: Pt): Pt => ({ x: p.x, y: p.y - lift });
  const top: Pt = { x: c.x, y: c.y - lift - apex };
  quad(g, [lo(l), lo(b), top], f.left);
  quad(g, [lo(b), lo(r), top], f.right);
  if (trim) {
    g.lineStyle(3, GOLD, 1);
    g.strokePoints([lo(l), lo(b), lo(r)], false);
  }
  return top;
}

/** A flat diamond on the ground over [x0, x1] x [y0, y1]. */
function plate(g: G, x0: number, y0: number, x1: number, y1: number, fill: number, alpha = 1, outline = false): void {
  quad(g, [isoPoint(x0, y0), isoPoint(x1, y0), isoPoint(x1, y1), isoPoint(x0, y1)], fill, alpha, outline);
}

function ball(g: G, p: Pt, radius: number): void {
  g.fillStyle(GOLD, 1);
  g.fillCircle(p.x, p.y, radius);
  g.lineStyle(2, OUTLINE, 1);
  g.strokeCircle(p.x, p.y, radius);
}

function drawHouse(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  block(g, 0.3, 0.3, 1.7, 1.7, 34, { top: 0xf0e4c4, left: 0xd8c8a0, right: 0xbfae84 });
  // A door on the right-hand wall and two windows on the left-hand one.
  const d0 = isoPoint(1.7, 0.95);
  const d1 = isoPoint(1.7, 1.25);
  quad(g, [d0, d1, { x: d1.x, y: d1.y - 22 }, { x: d0.x, y: d0.y - 22 }], 0x6b4423);
  for (const x of [0.55, 1.05]) {
    const a = isoPoint(x, 1.7);
    const b = isoPoint(x + 0.28, 1.7);
    quad(g, [{ x: a.x, y: a.y - 14 }, { x: b.x, y: b.y - 14 }, { x: b.x, y: b.y - 27 }, { x: a.x, y: a.y - 27 }], 0x7fb6d9);
  }
  const top = roof(g, 0.12, 0.12, 1.88, 1.88, 34, 44, { left: 0xc4502f, right: 0x953a24 }, tier >= 1);
  if (tier >= 2) ball(g, top, 6);
}

function drawShop(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  block(g, 0.25, 0.25, 1.75, 1.75, 28, { top: 0xb88a55, left: 0xa07040, right: 0x7f5630 });
  // A striped awning over the front.
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const a = 0.1 + (i * 1.8) / stripes;
    const b = 0.1 + ((i + 1) * 1.8) / stripes;
    const color = i % 2 === 0 ? 0xc8402f : 0xf2e6c8;
    block(g, a, 0.1, b, 1.9, 4, { top: color, left: color, right: color }, 30, tier >= 1 && i === 0);
  }
  // A coin on a post.
  const post = isoPoint(1.0, 1.0);
  g.lineStyle(4, OUTLINE, 1);
  g.lineBetween(post.x, post.y - 34, post.x, post.y - 62);
  ball(g, { x: post.x, y: post.y - 70 }, tier >= 2 ? 12 : 9);
}

function drawMarket(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  block(g, 0.1, 0.1, 2.9, 2.9, 5, { top: 0xdcc58f, left: 0xb69e6a, right: 0x9a8454 });
  const stalls: [number, number, number][] = [
    [0.4, 0.4, 0xc8402f],
    [1.75, 0.4, 0x3f78c4],
    [1.05, 1.75, 0x3f9a5a],
  ];
  for (const [x, y, color] of stalls) {
    block(g, x, y, x + 0.8, y + 0.8, 22, { top: 0x9c6b3a, left: 0x8a5a2a, right: 0x6d4620 }, 5);
    block(g, x - 0.1, y - 0.1, x + 0.9, y + 0.9, 4, { top: color, left: color, right: color }, 29, tier >= 1);
    const mid = isoPoint(x + 0.4, y + 0.4);
    ball(g, { x: mid.x, y: mid.y - 40 }, 5);
  }
  if (tier >= 2) ball(g, { x: isoPoint(1.5, 1.5).x, y: isoPoint(1.5, 1.5).y - 14 }, 8);
}

function drawCastle(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.22);
  const stone = { top: 0xb0a898, left: 0x9a9488, right: 0x7f7a6f };
  const light = { top: 0xc9c2b2, left: 0xb3ac9c, right: 0x978f80 };
  block(g, 0.15, 0.15, 3.85, 3.85, 34, stone);
  const tower = (x: number, y: number): void => {
    block(g, x, y, x + 0.8, y + 0.8, 86, stone);
    const top = roof(g, x - 0.1, y - 0.1, x + 0.9, y + 0.9, 86, 46, { left: 0x4a6fb0, right: 0x34568f }, tier >= 1);
    if (tier >= 2) ball(g, { x: top.x, y: top.y - 4 }, 5);
  };
  tower(0.1, 0.1);
  tower(3.1, 0.1);
  tower(0.1, 3.1);
  block(g, 1.2, 1.2, 2.8, 2.8, 80, light, 34, tier >= 1);
  // The gate, in the left-hand wall.
  const a = isoPoint(1.8, 3.85);
  const b = isoPoint(2.3, 3.85);
  quad(g, [a, b, { x: b.x, y: b.y - 30 }, { x: a.x, y: a.y - 30 }], 0x2a2018);
  // A flag over the keep.
  const keep = isoPoint(2, 2);
  g.lineStyle(3, OUTLINE, 1);
  g.lineBetween(keep.x, keep.y - 114, keep.x, keep.y - 150);
  quad(g, [{ x: keep.x, y: keep.y - 150 }, { x: keep.x + 28, y: keep.y - 142 }, { x: keep.x, y: keep.y - 134 }], 0xc8402f);
  tower(3.1, 3.1);
}

const WOOD = { top: 0xc79a58, left: 0xa27a3e, right: 0x80602c };
const STONE = { top: 0xb9b3a7, left: 0x9d978c, right: 0x7f796f };

/** 伐採所: a small hut, a pile of logs and a stump. */
function drawLumber(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  plate(g, 0.12, 0.12, def.w - 0.12, def.h - 0.12, 0x8d7048, 0.55);
  block(g, 0.2, 0.2, 1.0, 1.0, 24, { top: 0xb88a55, left: 0xa07040, right: 0x7f5630 });
  roof(g, 0.08, 0.08, 1.12, 1.12, 24, 26, { left: 0x4f7a3a, right: 0x3d6130 }, tier >= 1);
  // The pile: three logs on the ground, two on them, one on top.
  for (let i = 0; i < 3; i++) block(g, 1.1, 0.28 + i * 0.2, 1.85, 0.28 + i * 0.2 + 0.16, 8, WOOD);
  for (let i = 0; i < 2; i++) block(g, 1.18, 0.38 + i * 0.2, 1.78, 0.38 + i * 0.2 + 0.16, 8, WOOD, 8);
  block(g, 1.28, 0.48, 1.7, 0.64, 8, WOOD, 16, tier >= 2);
  // A stump with an axe in it.
  block(g, 0.3, 1.35, 0.7, 1.75, 14, { top: 0xe0b878, left: 0xa27a3e, right: 0x80602c });
  const axe = isoPoint(0.5, 1.55);
  g.lineStyle(4, OUTLINE, 1);
  g.lineBetween(axe.x, axe.y - 14, axe.x + 8, axe.y - 36);
  g.fillStyle(0xb0b8c4, 1);
  g.fillTriangle(axe.x + 8, axe.y - 36, axe.x + 24, axe.y - 40, axe.x + 12, axe.y - 28);
}

/** 採石場: a pit in the ground with blocks of stone beside it and a pick. */
function drawQuarry(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  plate(g, 0.1, 0.1, def.w - 0.1, def.h - 0.1, 0xa59a86, 0.8);
  plate(g, 0.35, 0.3, 1.45, 1.4, 0x6f6658, 1, true);
  plate(g, 0.5, 0.45, 1.3, 1.25, 0x544c40, 1);
  block(g, 1.35, 0.2, 1.85, 0.7, 26, STONE);
  block(g, 1.45, 0.85, 1.85, 1.25, 14, STONE);
  block(g, 0.15, 1.4, 0.6, 1.85, 18, STONE);
  block(g, 0.75, 1.5, 1.2, 1.85, 10, { top: 0xcfc9bd, left: 0xb3ada1, right: 0x958f84 }, 0, tier >= 1);
  if (tier >= 2) block(g, 1.4, 1.45, 1.8, 1.85, 12, { top: 0xe8e2d4, left: 0xcfc9bb, right: 0xb2ac9e });
  const pick = isoPoint(1.55, 1.6);
  g.lineStyle(4, OUTLINE, 1);
  g.lineBetween(pick.x, pick.y - 4, pick.x + 6, pick.y - 34);
  g.lineStyle(5, 0x8a929e, 1);
  g.lineBetween(pick.x - 8, pick.y - 36, pick.x + 20, pick.y - 30);
}

/** 鉱山: a rocky hill with a timbered entrance and a cart on rails. */
function drawMine(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  plate(g, 0.1, 0.1, def.w - 0.1, def.h - 0.1, 0x8d8272, 0.6);
  // The hill, as a low pyramid over the back two-thirds.
  roof(g, 0.1, 0.1, 2.4, 2.4, 0, 70, { left: 0x857868, right: 0x66594b });
  roof(g, 0.9, 0.9, 2.0, 2.0, 0, 96, { left: 0x93857a, right: 0x6f6256 }, tier >= 1);
  // The entrance on the front-right face: a dark opening under a timber frame.
  const a = isoPoint(2.4, 1.2);
  const b = isoPoint(2.4, 1.8);
  quad(g, [a, b, { x: b.x, y: b.y - 40 }, { x: a.x, y: a.y - 40 }], 0x1e1812);
  g.lineStyle(5, 0x9a6a30, 1);
  g.strokePoints([{ x: a.x, y: a.y }, { x: a.x, y: a.y - 44 }, { x: b.x, y: b.y - 44 }, { x: b.x, y: b.y }], false);
  // Rails and a cart.
  const r0 = isoPoint(2.45, 1.5);
  const r1 = isoPoint(3.0, 1.5);
  g.lineStyle(3, 0x4a4036, 1);
  g.lineBetween(r0.x, r0.y, r1.x, r1.y);
  block(g, 2.55, 1.35, 2.85, 1.65, 12, { top: 0x6f7480, left: 0x5a5f6a, right: 0x474b55 }, 3, tier >= 2);
  g.fillStyle(0x2c2a28, 1);
  const cart = isoPoint(2.7, 1.5);
  g.fillCircle(cart.x, cart.y - 18, 5);
}

/** 柵: two posts with rails, one tile. */
function drawFence(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.1, 0.1, def.w - 0.1, def.h - 0.1, 0x000000, 0.18);
  block(g, 0.12, 0.4, 0.88, 0.5, 5, WOOD, 8, tier >= 2);
  block(g, 0.12, 0.4, 0.88, 0.5, 5, WOOD, 18, tier >= 1);
  block(g, 0.08, 0.32, 0.24, 0.58, 28, { top: 0xdcb070, left: 0xa27a3e, right: 0x80602c });
  block(g, 0.76, 0.32, 0.92, 0.58, 28, { top: 0xdcb070, left: 0xa27a3e, right: 0x80602c });
  if (tier >= 2) {
    ball(g, { x: isoPoint(0.16, 0.45).x, y: isoPoint(0.16, 0.45).y - 32 }, 4);
    ball(g, { x: isoPoint(0.84, 0.45).x, y: isoPoint(0.84, 0.45).y - 32 }, 4);
  }
}

/** 門: two stone pillars with a wooden gate between them under a small roof. */
function drawGate(g: G, def: BuildingDef, tier: number): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  block(g, 0.1, 0.7, 0.55, 1.3, 70, STONE);
  block(g, 1.45, 0.7, 1.9, 1.3, 70, STONE);
  block(g, 0.55, 0.85, 1.45, 1.15, 52, { top: 0xb88a55, left: 0x9a6a30, right: 0x7a521f });
  // Planks on the gate.
  g.lineStyle(2, OUTLINE, 0.7);
  for (let i = 1; i < 4; i++) {
    const t = isoPoint(0.55 + i * 0.22, 1.15);
    g.lineBetween(t.x, t.y, t.x, t.y - 52);
  }
  roof(g, 0.02, 0.62, 2.0, 1.38, 70, 34, { left: 0xc4502f, right: 0x953a24 }, tier >= 1);
  if (tier >= 2) ball(g, { x: isoPoint(1.0, 1.0).x, y: isoPoint(1.0, 1.0).y - 112 }, 6);
}

/** 木: a trunk under two layers of leaves. */
function drawTree(g: G, def: BuildingDef): void {
  plate(g, 0.1, 0.1, def.w - 0.1, def.h - 0.1, 0x000000, 0.2);
  block(g, 0.42, 0.42, 0.58, 0.58, 24, { top: 0x9a6b3a, left: 0x7d5329, right: 0x61401e });
  roof(g, 0.08, 0.08, 0.92, 0.92, 16, 36, { left: 0x4f9a42, right: 0x3a7a32 });
  roof(g, 0.18, 0.18, 0.82, 0.82, 40, 32, { left: 0x5fae50, right: 0x468a3c });
}

/** 花壇: a low stone border round soil with a few flowers. */
function drawFlowers(g: G, def: BuildingDef): void {
  plate(g, 0.06, 0.06, def.w - 0.06, def.h - 0.06, 0x000000, 0.2);
  block(g, 0.1, 0.1, 0.9, 0.9, 8, STONE);
  plate(g, 0.18, 0.18, 0.82, 0.82, 0x6a4a2a, 1);
  const blooms: [number, number, number][] = [
    [0.3, 0.32, 0xe8566a],
    [0.62, 0.3, 0xf6d24a],
    [0.5, 0.52, 0xf4f0e8],
    [0.3, 0.68, 0xf6d24a],
    [0.68, 0.66, 0xe8566a],
  ];
  for (const [x, y, color] of blooms) {
    const at = isoPoint(x, y);
    g.lineStyle(2, 0x2e6a2a, 1);
    g.lineBetween(at.x, at.y - 8, at.x, at.y - 18);
    g.fillStyle(color, 1);
    g.fillCircle(at.x, at.y - 21, 5);
    g.lineStyle(1.5, OUTLINE, 0.9);
    g.strokeCircle(at.x, at.y - 21, 5);
  }
}

/** 噴水: a stone basin of water with a column and a second bowl, and drops of water. */
function drawFountain(g: G, def: BuildingDef): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  block(g, 0.2, 0.2, 1.8, 1.8, 14, STONE);
  block(g, 0.34, 0.34, 1.66, 1.66, 1, { top: 0x7ccdf0, left: 0x5aaed8, right: 0x4a98c0 }, 14);
  block(g, 0.86, 0.86, 1.14, 1.14, 30, STONE, 14);
  block(g, 0.66, 0.66, 1.34, 1.34, 8, STONE, 44);
  block(g, 0.74, 0.74, 1.26, 1.26, 1, { top: 0x9ddcf6, left: 0x7ccdf0, right: 0x5aaed8 }, 52);
  const top = isoPoint(1, 1);
  g.fillStyle(0xcdefff, 0.95);
  for (const [dx, dy] of [[0, -74], [-9, -66], [9, -66], [-16, -56], [16, -56]] as [number, number][]) g.fillCircle(top.x + dx, top.y + dy, 3.5);
}

/** 銅像: a stone plinth under a bronze figure. */
function drawStatue(g: G, def: BuildingDef): void {
  plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
  block(g, 0.4, 0.4, 1.6, 1.6, 16, STONE);
  block(g, 0.55, 0.55, 1.45, 1.45, 14, { top: 0xcfc9bd, left: 0xb3ada1, right: 0x958f84 }, 16);
  const bronze = { top: 0xe6c978, left: 0xc3a050, right: 0xa08038 };
  block(g, 0.8, 0.8, 1.2, 1.2, 38, bronze, 30);
  const head = isoPoint(1, 1);
  g.fillStyle(0xe6c978, 1);
  g.fillCircle(head.x, head.y - 84, 11);
  g.lineStyle(2, OUTLINE, 1);
  g.strokeCircle(head.x, head.y - 84, 11);
  // A raised sword.
  g.lineStyle(5, OUTLINE, 1);
  g.lineBetween(head.x + 22, head.y - 52, head.x + 22, head.y - 104);
  g.lineStyle(3, 0xf4efe0, 1);
  g.lineBetween(head.x + 22, head.y - 52, head.x + 22, head.y - 104);
}

/** One paving piece as a small diamond (the build menu's card; the road on the map is drawn by roadTile below). */
function drawRoadSample(g: G, _def: BuildingDef, tier: number): void {
  const t = isoPoint(0, 0);
  const r = isoPoint(1, 0);
  const b = isoPoint(1, 1);
  const l = isoPoint(0, 1);
  const c = isoPoint(0.5, 0.5);
  const pts = (k: number): Pt[] => [t, r, b, l].map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
  g.fillStyle(0x3a2e22, 1);
  g.fillPoints(pts(0.86), true);
  g.fillStyle(ROAD_COLOR[Math.min(ROAD_COLOR.length - 1, tier)], 1);
  g.fillPoints(pts(0.74), true);
}

const DRAWERS: Record<BuildingKind, (g: G, def: BuildingDef, tier: number) => void> = {
  castle: drawCastle,
  shop: drawShop,
  market: drawMarket,
  house: drawHouse,
  lumber: drawLumber,
  quarry: drawQuarry,
  mine: drawMine,
  fence: drawFence,
  gate: drawGate,
  tree: drawTree,
  flowers: drawFlowers,
  fountain: drawFountain,
  statue: drawStatue,
  road: drawRoadSample,
};

/** How far above the footprint's top corner the drawn building reaches (for its rectangle). */
const DRAWN_HEIGHT: Record<BuildingKind, number> = { castle: 118, shop: 44, market: 36, house: 40, lumber: 44, quarry: 40, mine: 96, fence: 36, gate: 112, tree: 84, flowers: 34, fountain: 90, statue: 120, road: 8 };

/** 0 (plain) to 2 (fully gilded) for a building's level. */
export function gildedTier(level: number): number {
  return level >= 5 ? 2 : level >= 3 ? 1 : 0;
}

function drawnArt(scene: Phaser.Scene, def: BuildingDef, draw: (g: G) => void): Art {
  const g = scene.add.graphics();
  draw(g);
  const left = isoPoint(0, def.h).x - 8;
  const right = isoPoint(def.w, 0).x + 8;
  const height = DRAWN_HEIGHT[def.kind];
  const bottom = isoPoint(def.w, def.h).y + 8;
  return { container: scene.add.container(0, 0, [g]), bounds: new Phaser.Geom.Rectangle(left, -height, right - left, bottom + height) };
}

/** A building at `level`: the supplied picture if there is one, else drawn from code (more gold trim as the level rises). */
export function buildingArt(scene: Phaser.Scene, kind: BuildingKind, level = 1): Art {
  const def = getBuilding(kind);
  const key = pickArt(scene, kind, level);
  if (key) return pictureArt(scene, key, def);
  return drawnArt(scene, def, (g) => DRAWERS[kind](g, def, gildedTier(level)));
}

/** What stands where something is being built: a plot with posts and planks. */
export function constructionArt(scene: Phaser.Scene, kind: BuildingKind): Art {
  const def = getBuilding(kind);
  if (scene.textures.exists(SITE_KEY)) return pictureArt(scene, SITE_KEY, { ...def, w: 2, h: 2, art: undefined });
  return drawnArt(scene, { ...def, kind: 'house' }, (g) => {
    plate(g, 0.05, 0.05, def.w - 0.05, def.h - 0.05, 0x000000, 0.2);
    plate(g, 0.2, 0.2, def.w - 0.2, def.h - 0.2, 0x8a6a44, 1, true);
    const wood = { top: 0xc9a052, left: 0xa98238, right: 0x86642a };
    for (const [x, y] of [[0.3, 0.3], [def.w - 0.5, 0.3], [0.3, def.h - 0.5], [def.w - 0.5, def.h - 0.5]]) block(g, x, y, x + 0.2, y + 0.2, 34, wood);
    block(g, def.w / 2 - 0.35, def.h / 2 - 0.35, def.w / 2 + 0.35, def.h / 2 + 0.35, 14, { top: 0xb88a55, left: 0xa07040, right: 0x7f5630 });
  });
}

/** A 行商人 or 宝箱 on one tile of the map: drawn with the tile's top corner at (0, 0). `bounds` is the part worth tapping. */
export function wandererArt(scene: Phaser.Scene, kind: WandererKind): Art {
  const g = scene.add.graphics();
  plate(g, 0.12, 0.12, 0.88, 0.88, 0x000000, 0.22);
  if (kind === 'chest') {
    block(g, 0.22, 0.22, 0.78, 0.78, 20, { top: 0xc98a3c, left: 0xa86a28, right: 0x84501c });
    block(g, 0.22, 0.22, 0.78, 0.78, 6, { top: 0xe0a24c, left: 0xc98a3c, right: 0xa86a28 }, 20, true);
    const lock = isoPoint(0.5, 0.78);
    ball(g, { x: lock.x, y: lock.y - 14 }, 5);
  } else {
    block(g, 0.22, 0.3, 0.78, 0.7, 16, { top: 0x9c6b3a, left: 0x8a5a2a, right: 0x6d4620 });
    for (let i = 0; i < 4; i++) {
      const color = i % 2 === 0 ? 0x3f78c4 : 0xf2e6c8;
      block(g, 0.1 + i * 0.2, 0.14, 0.3 + i * 0.2, 0.86, 4, { top: color, left: color, right: color }, 40);
    }
    const post = isoPoint(0.5, 0.5);
    ball(g, { x: post.x, y: post.y - 56 }, 8);
  }
  const container = scene.add.container(0, 0, [g]);
  const c = isoPoint(0.5, 0.5);
  return { container, bounds: new Phaser.Geom.Rectangle(c.x - 34, c.y - 72, 68, 92) };
}
