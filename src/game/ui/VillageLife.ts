import Phaser from 'phaser';
import { VILLAGE_COLS, VILLAGE_ROWS, getBuilding, type BuildingKind } from '../data/village';
import type { PlacedBuilding, SaveData } from '../systems/SaveSystem';
import { effectiveLevel, isMoving } from '../systems/VillageIncome';
import { VillageSystem, type WorkKind } from '../systems/VillageSystem';
import { showToast } from './Toast';
import { isoPoint, type Pt } from './VillageArt';
import { PEOPLE, VillageWalkers, peopleTexture } from './VillagePeople';
import { ParticlePool, SOFT, STAR, ensureLifeTextures } from './VillageParticles';

/**
 * 村の生活感: everything in the village that moves by itself. Chimney smoke, flags, the fountain's spray, trees in the
 * wind, glints on the grandest buildings, builders hammering at every site, villagers and animals wandering, and the
 * light of the real hour (dawn, dusk, night with lit windows, drifting cloud shadows, birds, butterflies, fireflies).
 * Nothing here is saved or needs saving; the scene only has to call `beforeRender` / `afterRender` around drawing its
 * buildings. Everything is capped and updated about 30 times a second.
 */

export interface VillageLifeHost {
  world: Phaser.GameObjects.Container;
  /** The container the building views are in (they are drawn in order of their `depth`, which this class sets). */
  buildingLayer: Phaser.GameObjects.Container;
  save: () => SaveData;
  pos: (gx: number, gy: number) => Pt;
  zoom: () => number;
  worldSize: { w: number; h: number };
  /** True while something is being placed or a popup is up: taps on people are ignored then. */
  busy: () => boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SourceKind = 'smoke' | 'forge' | 'glint' | 'spray' | 'coin';

interface Source {
  kind: SourceKind;
  x: number;
  y: number;
  /** For glints: the area they appear in. */
  w: number;
  h: number;
  every: number;
  next: number;
  /** Local hours [from, to) in which a smoke source is lit (none: always). */
  hours?: [number, number][];
}

interface Glow {
  image: Phaser.GameObjects.Image;
  base: number;
  phase: number;
}

interface Sway {
  image: Phaser.GameObjects.Image;
  phase: number;
  amount: number;
}

interface Flag {
  x: number;
  y: number;
  height: number;
  color: number;
  phase: number;
}

interface Builder {
  id: string;
  view: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  base: number;
  /** Where its feet are, in the world. */
  x: number;
  y: number;
  art?: Phaser.GameObjects.Container;
  /** Centre of the top of the building it works on, in the world. */
  topX: number;
  topY: number;
  progress: number;
  kind: WorkKind;
  t: number;
  struck: boolean;
  jolt: number;
  ringDrawn: number;
}

interface Walker2 {
  g: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  kind: 'butterfly' | 'bird';
  color: number;
  /** Where a butterfly stays near. */
  homeX: number;
  homeY: number;
  life: number;
}

interface Firefly {
  image: Phaser.GameObjects.Image;
  homeX: number;
  homeY: number;
  phase: number;
}

// ------------------------------------------------------------------ tuning --
/** Particles alive at once, per kind (a phone must not be buried). */
const CAP_SMOKE = 70;
const CAP_SPARK = 60;
/** Fewest ms between steps of everything that animates by hand (about 30 Hz). */
const STEP_MS = 33;
const MAX_BUTTERFLIES = 6;
const MAX_FIREFLIES = 10;
const MAX_BIRDS = 3;
const CLOUDS = 4;
/** Light of the hour: [hour, colour multiplied over the land, how night it is]. */
const LIGHT: [number, number, number][] = [
  [0, 0x4f5a9a, 1],
  [5, 0x535fa0, 1],
  [6.2, 0xf4b88c, 0.35],
  [7.6, 0xffffff, 0],
  [17, 0xffffff, 0],
  [18.3, 0xffc08a, 0.12],
  [19.6, 0x8a84b8, 0.6],
  [21, 0x4f5a9a, 1],
  [24, 0x4f5a9a, 1],
];
const GLOW_KINDS: BuildingKind[] = ['house', 'shop', 'market', 'castle', 'gate', 'lumber', 'mine', 'quarry', 'fountain'];

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** The colour over the land and how night it is, at `hour` (0-24, fractional). */
export function lightAt(hour: number): { tint: number; night: number } {
  for (let i = 1; i < LIGHT.length; i++) {
    const [h1, c1, n1] = LIGHT[i];
    const [h0, c0, n0] = LIGHT[i - 1];
    if (hour <= h1) {
      const t = (hour - h0) / (h1 - h0);
      return { tint: lerpColor(c0, c1, t), night: n0 + (n1 - n0) * t };
    }
  }
  return { tint: 0x4f5a9a, night: 1 };
}

/** The hour now; in a development build `?vtime=22` pins it (to look at the village at night). */
function currentHour(): number {
  if (import.meta.env.DEV) {
    const v = new URLSearchParams(location.search).get('vtime');
    if (v !== null && Number.isFinite(Number(v))) return Number(v) % 24;
  }
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export class VillageLife {
  private readonly scene: Phaser.Scene;
  private readonly host: VillageLifeHost;
  private readonly overlay: Phaser.GameObjects.Rectangle;
  /** Mirrors the world's position and zoom: glows, shadows and creatures that must not be darkened by the night's tint. */
  private readonly sky: Phaser.GameObjects.Container;
  private readonly fxLayer: Phaser.GameObjects.Container;
  private readonly flagG: Phaser.GameObjects.Graphics;
  private readonly ringG: Phaser.GameObjects.Graphics;
  private readonly smoke: ParticlePool;
  private readonly sparks: ParticlePool;
  private readonly walkers: VillageWalkers;

  private sources: Source[] = [];
  private glows: Glow[] = [];
  private sways: Sway[] = [];
  private flags: Flag[] = [];
  private flowerSpots: Pt[] = [];
  private treeSpots: Pt[] = [];
  private builders = new Map<string, Builder>();
  private clouds: Phaser.GameObjects.Image[] = [];
  private critters: Walker2[] = [];
  private fireflies: Firefly[] = [];

  private acc = 0;
  private clock = 0;
  private sortIn = 0;
  private lightIn = 0;
  private nextBird = 8000 + Math.random() * 15000;
  private night = 0;
  private hour = 12;
  private destroyed = false;
  private down?: { x: number; y: number; wx: number; wy: number; at: number };

  private readonly onUpdate = (_time: number, delta: number): void => this.update(delta);
  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    this.down = { x: p.x, y: p.y, wx: this.host.world.x, wy: this.host.world.y, at: this.scene.time.now };
  };
  private readonly onUp = (p: Phaser.Input.Pointer): void => this.tap(p);

  constructor(scene: Phaser.Scene, host: VillageLifeHost) {
    this.scene = scene;
    this.host = host;
    ensureLifeTextures(scene);

    // Above the land (depth 2), under the screen's own controls (12 and up).
    this.overlay = scene.add.rectangle(360, 640, 720, 1280, 0xffffff, 1).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(3).setVisible(false);
    this.sky = scene.add.container(0, 0).setDepth(3.5);
    this.fxLayer = scene.add.container(0, 0);
    host.world.add(this.fxLayer);
    this.flagG = scene.add.graphics();
    this.ringG = scene.add.graphics();
    this.smoke = new ParticlePool(scene, this.fxLayer, SOFT, false, CAP_SMOKE);
    this.sparks = new ParticlePool(scene, this.fxLayer, STAR, true, CAP_SPARK);
    this.fxLayer.add([this.flagG, this.ringG]);

    this.walkers = new VillageWalkers(scene, { layer: host.buildingLayer, save: host.save, pos: host.pos });

    for (let i = 0; i < CLOUDS; i++) {
      const cloud = scene.add.image(Math.random() * host.worldSize.w, 200 + Math.random() * (host.worldSize.h - 400), SOFT).setTint(0x000000).setAlpha(0).setScale(7 + Math.random() * 4, 3 + Math.random() * 2.5);
      this.clouds.push(cloud);
      this.sky.add(cloud);
    }

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointerup', this.onUp);
    this.syncLight();
  }

  // ---------------------------------------------------------- the hooks --

  /** Before the scene clears and redraws its buildings: whatever of ours stands among them is lifted out, not destroyed. */
  beforeRender(): void {
    if (this.destroyed) return;
    this.walkers.detach();
    for (const b of this.builders.values()) this.host.buildingLayer.remove(b.view, false);
  }

  /** After the scene has drawn its buildings (`views` by id): the draw order, the effects on each, the builders, the people. */
  afterRender(views: Map<string, Phaser.GameObjects.Container>): void {
    if (this.destroyed) return;
    const now = Date.now();
    const save = this.host.save();
    this.sources = [];
    this.sways = [];
    this.flags = [];
    this.flowerSpots = [];
    this.treeSpots = [];
    for (const g of this.glows) g.image.destroy();
    this.glows = [];
    const working = new Set<string>();

    for (const b of save.village.buildings) {
      const view = views.get(b.id);
      if (!view) continue;
      const def = getBuilding(b.kind);
      view.setDepth(b.x + def.w + b.y + def.h);
      const level = effectiveLevel(b, now);
      const work = VillageSystem.work(b, now);
      const scaffold = level === 0 || work?.kind === 'rebuild';
      const rect = this.rectOf(view, b);
      if (work) {
        working.add(b.id);
        this.keepBuilder(b, view, rect, work.progress, work.kind);
      }
      if (scaffold || b.damaged || isMoving(b, now)) continue;
      this.addEffects(b, view, rect, level);
    }

    // A site whose work is over: its builder packs up in a puff of dust.
    for (const [id, builder] of this.builders) {
      if (working.has(id)) continue;
      this.burst(builder.x - 16, builder.y - 8, 9);
      builder.view.destroy();
      if (builder.art?.active) builder.art.setPosition(0, 0);
      this.builders.delete(id);
    }
    for (const builder of this.builders.values()) this.host.buildingLayer.add(builder.view);

    this.walkers.refresh(now);
    this.walkers.attach();
    this.host.buildingLayer.sort('depth');
    this.paintRings();
    this.syncLight();
  }

  /** A puff of dust at a point of the world (a building done, a thing put up). */
  burst(x: number, y: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      this.smoke.spawn({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 70, vy: -8 - Math.random() * 22, ay: 35, life: 650 + Math.random() * 300, s0: 0.14, s1: 0.5, a0: 0.7, a1: 0, tint: 0xd8ccb0, fadeIn: 0.05 });
    }
  }

  // ------------------------------------------------------------ the sites --

  /** Where a building's picture is, in the world. */
  private rectOf(view: Phaser.GameObjects.Container, b: PlacedBuilding): Rect {
    const def = getBuilding(b.kind);
    const art = view.list[0] as Phaser.GameObjects.Container | undefined;
    const image = art?.list?.find((child) => child instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
    if (image) return { x: view.x + image.x - image.displayWidth / 2, y: view.y + image.y - image.displayHeight, w: image.displayWidth, h: image.displayHeight };
    const left = isoPoint(0, def.h).x - 8;
    const right = isoPoint(def.w, 0).x + 8;
    const bottom = isoPoint(def.w, def.h).y + 8;
    return { x: view.x + left, y: view.y - 150, w: right - left, h: bottom + 150 };
  }

  private keepBuilder(b: PlacedBuilding, view: Phaser.GameObjects.Container, rect: Rect, progress: number, kind: WorkKind): void {
    const def = getBuilding(b.kind);
    let builder = this.builders.get(b.id);
    if (!builder) {
      const gx = Math.min(VILLAGE_COLS - 0.3, b.x + def.w + 0.45);
      const gy = Math.min(VILLAGE_ROWS - 0.3, b.y + def.h * 0.55);
      const p = this.host.pos(gx, gy);
      const pdef = PEOPLE.find((d) => d.id === 'p_builder') ?? PEOPLE[0];
      const { key, scale } = peopleTexture(this.scene, pdef);
      const body = this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setScale(-scale, scale);
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.22);
      shadow.fillEllipse(0, -2, Math.max(22, body.displayWidth * 0.8), 9);
      const container = this.scene.add.container(p.x, p.y, [shadow, body]).setDepth(gx + gy + 0.2);
      builder = { id: b.id, view: container, body, base: scale, x: p.x, y: p.y, topX: 0, topY: 0, progress, kind, t: Math.random() * 900, struck: false, jolt: 0, ringDrawn: -1 };
      this.builders.set(b.id, builder);
    }
    builder.art = view.list[0] as Phaser.GameObjects.Container;
    builder.topX = rect.x + rect.w / 2;
    builder.topY = rect.y;
    builder.progress = progress;
    builder.kind = kind;
    builder.ringDrawn = -1;
  }

  private addEffects(b: PlacedBuilding, view: Phaser.GameObjects.Container, r: Rect, level: number): void {
    const def = getBuilding(b.kind);
    const cx = r.x + r.w / 2;
    const add = (kind: SourceKind, x: number, y: number, every: number, w = 0, h = 0, hours?: [number, number][]): void => {
      this.sources.push({ kind, x, y, w, h, every, next: this.clock + Math.random() * every, hours });
    };
    switch (b.kind) {
      case 'house':
        add('smoke', r.x + r.w * 0.52, r.y + r.h * 0.07, 650);
        break;
      case 'lumber':
        add('forge', r.x + r.w * 0.55, r.y + r.h * 0.16, 900);
        break;
      case 'mine':
        if (level >= 3) add('forge', r.x + r.w * 0.62, r.y + r.h * 0.2, 800);
        break;
      case 'shop':
      case 'market':
        add('coin', cx, r.y + 2, 1400);
        add('smoke', r.x + r.w * 0.72, r.y + r.h * 0.1, 1100, 0, 0, [[6, 9], [17, 20.5]]);
        break;
      case 'castle': {
        // Two flagpoles stand in the grass at the plot's side corners.
        const colors = level >= 5 ? 0xfff0c0 : level >= 3 ? 0x4a78d8 : 0xd83a3a;
        for (const [tx, ty] of [[0.42, def.h - 0.42], [def.w - 0.42, 0.42]]) {
          const p = isoPoint(tx, ty);
          this.flags.push({ x: view.x + p.x, y: view.y + p.y, height: 66, color: colors, phase: Math.random() * 6 });
        }
        break;
      }
      case 'fountain':
        add('spray', cx, r.y + r.h * 0.5, 130);
        break;
      case 'tree':
        this.swayTree(view);
        this.treeSpots.push({ x: cx, y: r.y + r.h * 0.55 });
        break;
      case 'flowers':
        this.flowerSpots.push({ x: cx, y: r.y + r.h * 0.6 });
        break;
      default:
        break;
    }
    // The grandest buildings glint.
    if (level >= 5 && !def.decor) add('glint', r.x + r.w * 0.18, r.y + r.h * 0.04, 480, r.w * 0.64, r.h * 0.5);
    if (GLOW_KINDS.includes(b.kind)) {
      const diameter = Math.max(60, r.w * (b.kind === 'castle' ? 0.62 : 0.5));
      const image = this.scene.add
        .image(cx, r.y + r.h * (b.kind === 'fountain' ? 0.5 : 0.6), SOFT)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(b.kind === 'fountain' ? 0x8fd4ff : 0xffb55a)
        .setScale(diameter / 64)
        .setAlpha(0)
        .setVisible(false);
      this.sky.add(image);
      this.glows.push({ image, base: b.kind === 'fountain' ? 0.38 : 0.5, phase: Math.random() * 6 });
    }
  }

  /** A tree's crown moves in the wind: the picture is cut across the trunk, and the upper part turns a little about the cut. */
  private swayTree(view: Phaser.GameObjects.Container): void {
    const art = view.list[0] as Phaser.GameObjects.Container | undefined;
    const image = art?.list?.find((child) => child instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
    if (!image || !art || !image.frame) return;
    const w = image.frame.width;
    const h = image.frame.height;
    const cut = 0.72;
    image.setCrop(0, h * cut, w, h * (1 - cut));
    const crown = this.scene.add.image(image.x, image.y - image.displayHeight * (1 - cut), image.texture.key).setScale(image.scaleX, image.scaleY).setOrigin(0.5, cut);
    crown.setCrop(0, 0, w, h * cut);
    art.add(crown);
    this.sways.push({ image: crown, phase: Math.random() * 6, amount: 1.1 + Math.random() * 0.7 });
  }

  // ----------------------------------------------------------- the light --

  private syncLight(): void {
    this.hour = currentHour();
    const { tint, night } = lightAt(this.hour);
    this.night = night;
    if (tint === 0xffffff) this.overlay.setVisible(false);
    else this.overlay.setFillStyle(tint, 1).setVisible(true);
  }

  private dayness(): number {
    return Phaser.Math.Clamp(1 - this.night * 1.6, 0, 1);
  }

  // ---------------------------------------------------------------- loop --

  private viewRect(margin = 120): { l: number; t: number; r: number; b: number } {
    const z = this.host.zoom();
    const w = this.host.world;
    return { l: -w.x / z - margin, t: -w.y / z - margin, r: (720 - w.x) / z + margin, b: (1280 - w.y) / z + margin };
  }

  private update(delta: number): void {
    if (this.destroyed) return;
    // The sky follows the land every frame.
    const w = this.host.world;
    this.sky.setPosition(w.x, w.y).setScale(w.scaleX);
    this.acc += Math.min(delta, 120);
    if (this.acc < STEP_MS) return;
    const dt = this.acc;
    this.acc = 0;
    this.step(dt);
  }

  private step(dt: number): void {
    this.clock += dt;
    const view = this.viewRect();
    const onScreen = (x: number, y: number): boolean => x > view.l && x < view.r && y > view.t && y < view.b;
    const day = this.dayness();

    // Once in a while the hour moves on.
    this.lightIn -= dt;
    if (this.lightIn <= 0) {
      this.lightIn = 5000;
      this.syncLight();
    }

    // Smoke, spray, glints.
    for (const s of this.sources) {
      if (this.clock < s.next) continue;
      s.next = this.clock + s.every * (0.7 + Math.random() * 0.6);
      if (!onScreen(s.x, s.y)) continue;
      if (s.hours && !s.hours.some(([from, to]) => this.hour >= from && this.hour < to)) continue;
      this.emit(s);
    }

    this.smoke.update(dt);
    this.sparks.update(dt);

    // Trees in the wind.
    const t = this.clock / 1000;
    for (const sway of this.sways) {
      if (!sway.image.active) continue;
      sway.image.setAngle(Math.sin(t * 1.15 + sway.phase) * sway.amount);
    }

    // Flags.
    this.flagG.clear();
    for (const f of this.flags) if (onScreen(f.x, f.y)) this.paintFlag(f, t);

    // Builders.
    for (const b of this.builders.values()) this.hammer(b, dt, onScreen);

    // People.
    this.walkers.update(dt, (gx, gy) => {
      const p = this.host.pos(gx, gy);
      return onScreen(p.x, p.y);
    });
    this.sortIn -= dt;
    if (this.sortIn <= 0) {
      this.sortIn = 120;
      this.host.buildingLayer.sort('depth');
    }

    // The light of the hour.
    for (const g of this.glows) {
      const on = this.night > 0.03;
      g.image.setVisible(on);
      if (on) g.image.setAlpha(this.night * g.base * (0.85 + 0.15 * Math.sin(t * 2.3 + g.phase) + 0.05 * Math.sin(t * 7.1 + g.phase * 2)));
    }
    this.driftClouds(dt, day);
    this.creatures(dt, day, onScreen);
  }

  private emit(s: Source): void {
    switch (s.kind) {
      case 'smoke':
        this.smoke.spawn({ x: s.x + (Math.random() - 0.5) * 3, y: s.y, vx: 6 + Math.random() * 6, vy: -16 - Math.random() * 10, ax: 3, life: 2800, s0: 0.1, s1: 0.5, a0: 0.5, a1: 0, tint: 0xe9e4da, fadeIn: 0.22 });
        break;
      case 'forge':
        this.smoke.spawn({ x: s.x, y: s.y, vx: 8 + Math.random() * 6, vy: -20 - Math.random() * 12, ax: 4, life: 2300, s0: 0.1, s1: 0.45, a0: 0.55, a1: 0, tint: 0x9a9690, fadeIn: 0.2 });
        if (Math.random() < 0.25) this.sparks.spawn({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 20, ay: 60, life: 700, s0: 0.12, s1: 0.04, a0: 1, a1: 0, tint: 0xffa040, fadeIn: 0 });
        break;
      case 'spray':
        this.sparks.spawn({ x: s.x + (Math.random() - 0.5) * 8, y: s.y, vx: (Math.random() - 0.5) * 22, vy: -52 - Math.random() * 28, ay: 170, life: 850, s0: 0.2, s1: 0.1, a0: 0.9, a1: 0, tint: 0xbfe6ff, fadeIn: 0.05 });
        break;
      case 'glint':
        this.sparks.spawn({ x: s.x + Math.random() * s.w, y: s.y + Math.random() * s.h, vy: -4, life: 1000, s0: 0.05, s1: 0.5, a0: 0.95, a1: 0, tint: 0xffe9a0, spin: 70, fadeIn: 0.3 });
        break;
      case 'coin':
        this.sparks.spawn({ x: s.x - 52 + Math.random() * 30, y: s.y + (Math.random() - 0.5) * 12, life: 700, s0: 0.08, s1: 0.42, a0: 0.95, a1: 0, tint: 0xfff0a0, spin: 90, fadeIn: 0.3 });
        break;
    }
  }

  private paintFlag(f: Flag, t: number): void {
    const g = this.flagG;
    g.lineStyle(3, 0x5a3a1c, 1);
    g.beginPath();
    g.moveTo(f.x, f.y);
    g.lineTo(f.x, f.y - f.height);
    g.strokePath();
    g.fillStyle(0xffd23f, 1);
    g.fillCircle(f.x, f.y - f.height - 2, 3.5);
    // The cloth: a strip of segments, each waving a little more than the one before.
    const len = 34;
    const segs = 6;
    const top = f.y - f.height + 2;
    const hgt = 17;
    g.fillStyle(f.color, 1);
    g.beginPath();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      g.lineTo(f.x + u * len, top + Math.sin(t * 5 + f.phase + u * 3.2) * 3.5 * u + u * 4);
    }
    for (let i = segs; i >= 0; i--) {
      const u = i / segs;
      const taper = 1 - u * 0.65;
      g.lineTo(f.x + u * len, top + hgt * taper + Math.sin(t * 5 + f.phase + u * 3.2) * 3.5 * u + u * 4);
    }
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0x2a1a0a, 0.8);
    g.strokePath();
  }

  // ------------------------------------------------------------ builders --

  /** One builder: leans back, strikes, and the site jolts and puffs dust at each blow. */
  private hammer(b: Builder, dt: number, onScreen: (x: number, y: number) => boolean): void {
    if (!b.view.active) return;
    b.t += dt;
    const cycle = 950;
    const u = (b.t % cycle) / cycle;
    let lean: number;
    if (u < 0.58) lean = -9 * Math.sin((u / 0.58) * Math.PI * 0.5);
    else if (u < 0.7) lean = -9 + 24 * ((u - 0.58) / 0.12);
    else lean = 15 * (1 - (u - 0.7) / 0.3);
    b.body.setAngle(lean);
    b.body.y = u >= 0.58 && u < 0.7 ? 1.5 : -Math.abs(Math.sin(u * Math.PI)) * 1.5;
    if (u >= 0.66 && u < 0.74 && !b.struck) {
      b.struck = true;
      b.jolt = 2.2;
      if (onScreen(b.x, b.y)) {
        for (let i = 0; i < 3; i++) this.smoke.spawn({ x: b.x - 18 + Math.random() * 6, y: b.y - 6, vx: -18 - Math.random() * 20, vy: -6 - Math.random() * 12, ay: 20, life: 520, s0: 0.1, s1: 0.32, a0: 0.6, a1: 0, tint: 0xd6c8a8, fadeIn: 0.05 });
        if (Math.random() < 0.5) this.sparks.spawn({ x: b.x - 20, y: b.y - 12, vx: -20, vy: -30, ay: 90, life: 450, s0: 0.1, s1: 0.03, a0: 1, a1: 0, tint: 0xffd070, fadeIn: 0 });
      }
    } else if (u < 0.5) b.struck = false;
    // The scaffolding shivers with each blow.
    if (b.art?.active) {
      b.jolt *= 0.82;
      b.art.setPosition(Math.sin(b.t / 60) * b.jolt * 0.5, b.jolt > 0.05 ? -b.jolt * 0.6 : 0);
    }
  }

  /** A ring of progress and a small hammer above every site. */
  private paintRings(): void {
    const g = this.ringG;
    g.clear();
    for (const b of this.builders.values()) {
      if (!b.view.active) continue;
      const x = b.topX;
      const y = b.topY - 4;
      const r = 15;
      g.fillStyle(0x1b1209, 0.88);
      g.fillCircle(x, y, r + 3);
      g.lineStyle(4, 0x4a3a22, 1);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.strokePath();
      g.lineStyle(4, 0xe0822a, 1);
      g.beginPath();
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(b.progress, 0.02, 1));
      g.strokePath();
      // A tiny hammer.
      g.lineStyle(3, 0xd8c49a, 1);
      g.beginPath();
      g.moveTo(x - 5, y + 6);
      g.lineTo(x + 3, y - 4);
      g.strokePath();
      g.fillStyle(0xffe9b8, 1);
      g.fillRect(x - 1, y - 8, 9, 6);
    }
  }

  // -------------------------------------------------------- creatures --

  private driftClouds(dt: number, day: number): void {
    const { w } = this.host.worldSize;
    for (const cloud of this.clouds) {
      cloud.x += (16 * dt) / 1000;
      if (cloud.x > w + 500) cloud.x = -500;
      cloud.setAlpha(0.13 * day);
    }
  }

  private creatures(dt: number, day: number, onScreen: (x: number, y: number) => boolean): void {
    const t = this.clock / 1000;
    const view = this.viewRect(0);

    // Birds cross the screen now and then, by day.
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 20000 + Math.random() * 35000;
      if (day > 0.6 && this.critters.filter((c) => c.kind === 'bird').length < MAX_BIRDS) {
        const n = 1 + Math.floor(Math.random() * 3);
        const y = view.t + (view.b - view.t) * (0.1 + Math.random() * 0.4);
        for (let i = 0; i < n && this.critters.filter((c) => c.kind === 'bird').length < MAX_BIRDS; i++) {
          const g = this.scene.add.graphics();
          this.sky.add(g);
          this.critters.push({ g, x: view.l - 40 - i * 46, y: y + i * 12 + Math.random() * 10, vx: 62 + Math.random() * 14, vy: -4, phase: Math.random() * 6, kind: 'bird', color: 0x2a2a30, homeX: 0, homeY: 0, life: 0 });
        }
      }
    }
    // Butterflies stay by the flower beds by day.
    const butterflies = this.critters.filter((c) => c.kind === 'butterfly').length;
    if (day > 0.5 && this.flowerSpots.length > 0 && butterflies < Math.min(MAX_BUTTERFLIES, this.flowerSpots.length * 2) && Math.random() < dt / 3000) {
      const spot = this.flowerSpots[Math.floor(Math.random() * this.flowerSpots.length)];
      const g = this.scene.add.graphics();
      this.sky.add(g);
      this.critters.push({ g, x: spot.x, y: spot.y - 20, vx: 0, vy: 0, phase: Math.random() * 6, kind: 'butterfly', color: [0xf4a8d0, 0xf6e27a, 0x9fd0ff][Math.floor(Math.random() * 3)], homeX: spot.x, homeY: spot.y - 20, life: 0 });
    }
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.life += dt;
      let gone = false;
      if (c.kind === 'bird') {
        c.x += (c.vx * dt) / 1000;
        c.y += (c.vy * dt) / 1000 + Math.sin(t * 1.3 + c.phase) * 0.12;
        gone = c.x > view.r + 60 || day < 0.3;
        if (onScreen(c.x, c.y)) this.paintBird(c, t);
        else c.g.clear();
      } else {
        // Wander round the bed; leave when the evening comes.
        c.x = c.homeX + Math.sin(t * 0.9 + c.phase) * 46 + Math.sin(t * 2.3 + c.phase * 2) * 8;
        c.y = c.homeY + Math.cos(t * 0.7 + c.phase * 1.3) * 18 + Math.sin(t * 5 + c.phase) * 3;
        gone = day < 0.35 || c.life > 90000;
        if (onScreen(c.x, c.y)) this.paintButterfly(c, t);
        else c.g.clear();
      }
      if (gone) {
        c.g.destroy();
        this.critters.splice(i, 1);
      }
    }

    // Fireflies among the trees (else near the houses) at night.
    const wantFlies = this.night > 0.5 ? MAX_FIREFLIES : 0;
    const spots = this.treeSpots.length > 0 ? this.treeSpots : this.glows.map((g) => ({ x: g.image.x, y: g.image.y }));
    while (this.fireflies.length < wantFlies && spots.length > 0) {
      const spot = spots[Math.floor(Math.random() * spots.length)];
      const image = this.scene.add.image(spot.x, spot.y, SOFT).setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8ff90).setScale(0.28).setAlpha(0);
      this.sky.add(image);
      this.fireflies.push({ image, homeX: spot.x, homeY: spot.y, phase: Math.random() * 6 });
    }
    for (let i = this.fireflies.length - 1; i >= 0; i--) {
      const f = this.fireflies[i];
      if (this.night < 0.4 && this.fireflies.length > wantFlies) {
        f.image.destroy();
        this.fireflies.splice(i, 1);
        continue;
      }
      f.image.x = f.homeX + Math.sin(t * 0.6 + f.phase) * 60 + Math.sin(t * 1.9 + f.phase * 3) * 10;
      f.image.y = f.homeY - 10 + Math.cos(t * 0.5 + f.phase * 1.7) * 36;
      f.image.setAlpha(this.night * Math.max(0, Math.sin(t * 2.4 + f.phase)) * 0.9);
    }
  }

  private paintBird(c: Walker2, t: number): void {
    const flap = Math.sin(t * 9 + c.phase) * 5;
    c.g.clear();
    c.g.lineStyle(2.5, c.color, 0.75);
    c.g.beginPath();
    c.g.moveTo(c.x - 9, c.y - flap);
    c.g.lineTo(c.x, c.y + 1);
    c.g.lineTo(c.x + 9, c.y - flap);
    c.g.strokePath();
  }

  private paintButterfly(c: Walker2, t: number): void {
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 11 + c.phase));
    c.g.clear();
    c.g.fillStyle(c.color, 0.95);
    c.g.fillEllipse(c.x - 3 * flap, c.y - 1, 6 * flap, 7);
    c.g.fillEllipse(c.x + 3 * flap, c.y - 1, 6 * flap, 7);
    c.g.fillStyle(0x3a2a1a, 1);
    c.g.fillRect(c.x - 0.7, c.y - 3, 1.4, 6);
  }

  // ----------------------------------------------------------- tapping --

  /** A tap that lands on a villager (or a builder) says its line. Taps on the screen's controls, or while placing, do not count. */
  private tap(p: Phaser.Input.Pointer): void {
    const down = this.down;
    this.down = undefined;
    if (this.destroyed || !down || this.host.busy()) return;
    if (Math.hypot(p.x - down.x, p.y - down.y) > 10 || Math.abs(this.host.world.x - down.wx) > 2 || Math.abs(this.host.world.y - down.wy) > 2) return;
    if (this.scene.time.now - down.at > 700) return;
    // Anything on the screen's controls (everything over depth 2) took the tap.
    for (const object of this.scene.input.hitTestPointer(p)) {
      let root = object as Phaser.GameObjects.GameObject & { parentContainer?: Phaser.GameObjects.Container; depth?: number };
      while (root.parentContainer) root = root.parentContainer;
      if ((root.depth ?? 0) > 2) return;
    }
    const z = this.host.zoom();
    const wx = (p.x - this.host.world.x) / z;
    const wy = (p.y - this.host.world.y) / z;
    const walker = this.walkers.hit(wx, wy);
    if (walker) {
      this.walkers.poke(walker);
      return;
    }
    for (const b of this.builders.values()) {
      if (Math.abs(wx - b.x) < 30 && wy < b.y + 8 && wy > b.y - 76) {
        showToast(this.scene, 'トンカン、トンカン！もうすぐ完成だ！', '#ffe9b8');
        b.jolt = 2.2;
        return;
      }
    }
  }

  // ----------------------------------------------------------- cleanup --

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    this.scene.input?.off('pointerdown', this.onDown);
    this.scene.input?.off('pointerup', this.onUp);
    this.walkers.destroy();
    for (const b of this.builders.values()) b.view.destroy();
    this.builders.clear();
    this.smoke.destroy();
    this.sparks.destroy();
    for (const c of this.critters) c.g.destroy();
    this.critters = [];
    this.fireflies = [];
    this.glows = [];
    this.sways = [];
    this.overlay.destroy();
    this.sky.destroy();
    this.fxLayer.destroy();
  }
}
