import Phaser from 'phaser';
import { getBuilding, type BuildingKind } from '../data/village';
import { unlocksAt } from '../data/villageGoals';
import { SoundSystem } from '../systems/SoundSystem';
import type { PlacedBuilding } from '../systems/SaveSystem';
import { body, heading, CHROME } from './theme';
import { buildingArt, isoPoint, type Pt } from './VillageArt';

const INK = '#1c130a';
/** Above the village's own popups (200), under the tutorial (300). */
const DEPTH = 260;
const RAYS = 'villagefx_rays';
const FONT = 'Arial Black, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const SPARKLE_COLORS = [0xfff2a0, 0xffd23f, 0xffffff, 0xbfe6ff, 0xffb86b];
const CONFETTI_COLORS = [0xff6b6b, 0xffd23f, 0x6bd6ff, 0x8cf08c, 0xd59bff, 0xffffff];

/** A building's picture (the supplied one, else drawn from code) shrunk to fit a `size` px box, centred on (0, 0) of the returned container. */
export function villageThumb(scene: Phaser.Scene, kind: BuildingKind, level: number, size: number): Phaser.GameObjects.Container {
  const art = buildingArt(scene, kind, level);
  const b = art.bounds;
  const s = size / Math.max(b.width, b.height, 1);
  art.container.setScale(s).setPosition(-(b.x + b.width / 2) * s, -(b.y + b.height / 2) * s);
  return scene.add.container(0, 0, [art.container]);
}

/** What the village scene lends the celebrations. */
export interface VillageFxHost {
  scene: Phaser.Scene;
  /** The map layer: effects that belong to a spot go in here (world coordinates). */
  world: Phaser.GameObjects.Container;
  /** Where tile (gx, gy)'s top corner is in the world. */
  pos(gx: number, gy: number): Pt;
  zoom(): number;
  /** Pans the camera so the tile is in the middle, then calls `then` (at once when the player is busy with the map). */
  glideTo(gx: number, gy: number, then: () => void): void;
  /** True while a popup is up: a celebration waits for it to close. */
  busy(): boolean;
}

/** What a finished piece of work is celebrated with: the building as it stands now and how it came about. */
interface Job {
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  /** 'moved' = a move that is over (no level to announce). */
  how: 'built' | 'raised' | 'moved';
}

/**
 * Every tween and timer of a celebration is kept, so that closing (or leaving the scene) stops them all. A tween that goes on
 * after the text it moves has been destroyed throws inside Phaser's frame loop and freezes the whole game (see EnhanceFx).
 */
class Tracker {
  private tweens: Phaser.Tweens.Tween[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private readonly scene: Phaser.Scene;
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    const t = this.scene.tweens.add(config);
    this.tweens.push(t);
    return t;
  }

  later(ms: number, callback: () => void): Phaser.Time.TimerEvent {
    const t = this.scene.time.delayedCall(ms, callback);
    this.timers.push(t);
    return t;
  }

  stopAll(): void {
    for (const t of this.tweens) t.stop();
    for (const t of this.timers) t.remove(false);
    this.tweens = [];
    this.timers = [];
  }
}

/** A sunburst of wedges that thin out towards the edge (white, so it can take any tint). */
function ensureRays(scene: Phaser.Scene): void {
  if (scene.textures.exists(RAYS)) return;
  const size = 520;
  const c = size / 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const wedges = 20;
  g.fillStyle(0xffffff, 0.11);
  for (let layer = 0; layer < 9; layer++) {
    const reach = c * (1 - layer * 0.1);
    for (let i = 0; i < wedges; i++) {
      const a0 = (i / wedges) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2 * 0.36) / wedges;
      g.fillTriangle(c, c, c + Math.cos(a0) * reach, c + Math.sin(a0) * reach, c + Math.cos(a1) * reach, c + Math.sin(a1) * reach);
    }
  }
  g.generateTexture(RAYS, size, size);
  g.destroy();
}

/**
 * 完成の演出: when work on a building runs out, the camera glides to it, it pops with a ring of light and a burst of sparks
 * and a "完成！ Lv.N" plate rises over it (confetti for the higher levels); a 城 level-up gets a full-screen celebration listing
 * what it unlocked. Several at once are played one after another, and one waits for any popup to close first.
 */
export class VillageFx {
  private readonly queue: Job[] = [];
  private running = false;
  private readonly tracker: Tracker;
  private disposed = false;
  private readonly host: VillageFxHost;

  constructor(host: VillageFxHost) {
    this.host = host;
    this.tracker = new Tracker(host.scene);
    host.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
  }

  /** Queues what a settle took in: `finished` (built or raised one level) and `rebuilt` (a move that is over). Buildings at their
   *  final level are celebrated as they stand now (`level` is what the building is at). */
  celebrate(done: { finished: PlacedBuilding[]; rebuilt: PlacedBuilding[] }): void {
    const jobs: Job[] = [
      ...done.finished.map((b): Job => ({ kind: b.kind, x: b.x, y: b.y, level: b.level, how: b.level <= 1 ? 'built' : 'raised' })),
      ...done.rebuilt.map((b): Job => ({ kind: b.kind, x: b.x, y: b.y, level: b.level, how: 'moved' })),
    ];
    // After a long absence a lot may have finished at once: the 城 and the few highest are played, the rest just stand.
    const castle = jobs.filter((j) => j.kind === 'castle');
    const rest = jobs.filter((j) => j.kind !== 'castle').sort((a, b) => b.level - a.level).slice(0, 3);
    this.queue.push(...castle, ...rest);
    this.next();
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.tracker.stopAll();
  }

  private next(): void {
    if (this.disposed || this.running || this.queue.length === 0) return;
    if (this.host.busy()) {
      this.tracker.later(500, () => this.next());
      return;
    }
    const job = this.queue.shift()!;
    this.running = true;
    const finish = (): void => {
      this.running = false;
      this.tracker.later(250, () => this.next());
    };
    if (job.kind === 'castle' && job.how === 'raised') this.castleLevelUp(job, finish);
    else {
      const def = getBuilding(job.kind);
      this.host.glideTo(job.x + def.w / 2, job.y + def.h / 2, () => this.spot(job, finish));
    }
  }

  // ------------------------------------------------------------- a spot --

  /** The pop on the map: ring of light, the building's picture swelling over itself, sparks, a plate, confetti for higher levels. */
  private spot(job: Job, finish: () => void): void {
    if (this.disposed) return;
    const { scene, world } = this.host;
    const t = this.tracker;
    const def = getBuilding(job.kind);
    const origin = this.host.pos(job.x, job.y);
    const centre = { x: origin.x + isoPoint(def.w / 2, def.h / 2).x, y: origin.y + isoPoint(def.w / 2, def.h / 2).y };
    const bottom = { x: origin.x + isoPoint(def.w, def.h).x, y: origin.y + isoPoint(def.w, def.h).y };
    const layer = scene.add.container(0, 0);
    world.add(layer);
    const width = ((def.w + def.h) * 104) / 2;

    // Rings of light spreading over the ground.
    for (let i = 0; i < 2; i++) {
      const ring = scene.add.ellipse(centre.x, centre.y, width * 0.7, width * 0.35).setStrokeStyle(8 - i * 3, i === 0 ? 0xfff2a0 : 0xffffff, 1).setAlpha(0);
      layer.add(ring);
      t.tween({ targets: ring, scale: { from: 0.5, to: 1.9 }, alpha: { from: 0.95, to: 0 }, duration: 800, delay: i * 160, ease: 'Cubic.easeOut' });
    }

    // The picture swells over the building and fades: it looks like the building itself popping.
    const art = buildingArt(scene, job.kind, job.level);
    const copy = scene.add.container(bottom.x, bottom.y);
    art.container.setPosition(-isoPoint(def.w, def.h).x, -isoPoint(def.w, def.h).y);
    copy.add(art.container);
    layer.add(copy);
    t.tween({ targets: copy, scaleX: 1.14, scaleY: 1.14, duration: 200, yoyo: true, ease: 'Sine.easeOut' });
    t.tween({ targets: copy, alpha: { from: 0.9, to: 0 }, duration: 900, delay: 100 });

    // Sparks flying out.
    const lift = art.bounds.y + art.bounds.height * 0.45;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const reach = 70 + Math.random() * 110;
      const star = scene.add.star(centre.x, origin.y + lift, 4, 2.5, 9 + Math.random() * 5, SPARKLE_COLORS[i % SPARKLE_COLORS.length]).setAlpha(0);
      layer.add(star);
      t.tween({
        targets: star,
        x: centre.x + Math.cos(a) * reach,
        y: origin.y + lift + Math.sin(a) * reach * 0.6 - 20,
        alpha: { from: 1, to: 0 },
        scale: { from: 1.3, to: 0.2 },
        angle: 180,
        duration: 650 + Math.random() * 450,
        delay: 60 + Math.random() * 120,
        ease: 'Cubic.easeOut',
      });
    }

    // The plate: "完成！" and the level, rising and fading.
    const scale = Math.max(1, 0.9 / Math.max(0.2, this.host.zoom()));
    const plate = this.banner(job);
    plate.setPosition(centre.x, origin.y + art.bounds.y - 26).setScale(0.6 * scale).setAlpha(0);
    layer.add(plate);
    t.tween({ targets: plate, scale, alpha: 1, duration: 320, delay: 150, ease: 'Back.easeOut' });
    t.tween({ targets: plate, y: plate.y - 46 * scale, alpha: 0, duration: 520, delay: 1350, ease: 'Sine.easeIn' });

    if (job.level >= 3 && job.how !== 'moved') this.confetti(layer, centre, art.bounds.y + origin.y - 60, 26);
    SoundSystem.play(scene, job.how === 'moved' ? 'confirm' : job.level >= 2 ? 'levelup' : 'confirm');

    t.later(1950, () => {
      t.stopAll();
      layer.destroy();
      finish();
    });
  }

  private banner(job: Job): Phaser.GameObjects.Container {
    const { scene } = this.host;
    const def = getBuilding(job.kind);
    const title = job.how === 'moved' ? '移転完了！' : '完成！';
    const sub = job.how === 'moved' ? def.name : def.decor ? def.name : `${def.name}　Lv.${job.level}`;
    const big = scene.add.text(0, -12, title, { fontFamily: FONT, fontSize: '34px', color: '#fff4a8', stroke: '#8a3a00', strokeThickness: 7 }).setOrigin(0.5);
    const small = scene.add.text(0, 22, sub, { fontFamily: FONT, fontSize: '19px', color: '#ffffff', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
    const w = Math.max(big.width, small.width) + 56;
    const bg = scene.add.graphics();
    bg.fillStyle(0x1b1209, 0.92);
    bg.fillRoundedRect(-w / 2, -42, w, 84, 16);
    bg.lineStyle(3, CHROME.brassBright, 1);
    bg.strokeRoundedRect(-w / 2, -42, w, 84, 16);
    return scene.add.container(0, 0, [bg, big, small]);
  }

  /** Bits of coloured paper falling over the spot. */
  private confetti(layer: Phaser.GameObjects.Container, centre: Pt, top: number, count: number): void {
    const { scene } = this.host;
    for (let i = 0; i < count; i++) {
      const piece = scene.add
        .rectangle(centre.x + (Math.random() - 0.5) * 260, top - Math.random() * 90, 9 + Math.random() * 6, 5 + Math.random() * 5, CONFETTI_COLORS[i % CONFETTI_COLORS.length])
        .setAngle(Math.random() * 360)
        .setAlpha(0);
      layer.add(piece);
      this.tracker.tween({
        targets: piece,
        y: top + 170 + Math.random() * 130,
        x: piece.x + (Math.random() - 0.5) * 120,
        angle: piece.angle + 360 + Math.random() * 360,
        alpha: { from: 1, to: 0 },
        duration: 1200 + Math.random() * 700,
        delay: Math.random() * 350,
        ease: 'Sine.easeIn',
      });
    }
  }

  // ------------------------------------------------------- 城 level up --

  /** A 城 level-up: the whole screen. Dim, rays behind the new 城, the new level and what it unlocked; tap to close. */
  private castleLevelUp(job: Job, finish: () => void): void {
    if (this.disposed) return;
    const { scene } = this.host;
    ensureRays(scene);
    const t = new Tracker(scene);
    const layer = scene.add.container(0, 0).setDepth(DEPTH);
    const dim = scene.add.rectangle(360, 640, 720, 1280, 0x05060c, 0).setInteractive();
    layer.add(dim);
    t.tween({ targets: dim, fillAlpha: 0.9, duration: 260 });

    const cx = 360;
    const cy = 470;
    const rays = scene.add.image(cx, cy, RAYS).setTint(0xffd23f).setBlendMode(Phaser.BlendModes.ADD).setScale(2.1).setAlpha(0);
    const glow = scene.add.circle(cx, cy, 200, 0xffd23f, 0.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    layer.add([rays, glow]);
    t.tween({ targets: [rays, glow], alpha: { from: 0, to: 0.6 }, duration: 480 });
    t.tween({ targets: rays, angle: 360, duration: 16000, repeat: -1 });
    t.tween({ targets: glow, scale: { from: 1, to: 1.2 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const castle = villageThumb(scene, 'castle', job.level, 470).setPosition(cx, cy).setScale(0);
    layer.add(castle);
    t.tween({ targets: castle, scale: 1, duration: 520, delay: 140, ease: 'Back.easeOut' });

    const title = scene.add
      .text(cx, 170, 'VILLAGE LEVEL UP!', { fontFamily: FONT, fontSize: '58px', color: '#fff4a8', stroke: '#8a3a00', strokeThickness: 12 })
      .setOrigin(0.5)
      .setScale(0)
      .setAlpha(0);
    layer.add(title);
    const burst = (): void => {
      title.setAlpha(1);
      t.tween({ targets: title, scale: 1, duration: 420, ease: 'Back.easeOut' });
      scene.cameras.main.shake(220, 0.005);
      this.sparkBurst(layer, t, cx, cy, 34);
    };
    t.later(460, burst);

    const level = body(scene, cx, 780, `村Lv.${job.level - 1}`, { fontSize: '72px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 10 }).setOrigin(0.5).setAlpha(0).setScale(0.6);
    layer.add(level);
    t.tween({ targets: level, alpha: 1, scale: 1, duration: 300, delay: 800, ease: 'Back.easeOut' });
    t.later(1150, () => {
      level.setText(`村Lv.${job.level}`).setColor('#ffd23f');
      t.tween({ targets: level, scale: { from: 1.4, to: 1 }, duration: 340, ease: 'Back.easeOut' });
      this.sparkBurst(layer, t, cx, 780, 16);
    });

    // What the new level gives.
    const lines = unlocksAt(job.level);
    const panelTop = 850;
    lines.slice(0, 7).forEach((line, i) => {
      const text = heading(scene, cx, panelTop + i * 40, line.text, { fontSize: '25px', color: '#e8ffe0', stroke: INK, strokeThickness: 5 }).setOrigin(0.5).setAlpha(0);
      // A long line is shrunk to fit the screen.
      const fit = Math.min(1, 640 / Math.max(1, text.width));
      text.setScale(0.7 * fit);
      layer.add(text);
      t.tween({ targets: text, alpha: 1, scale: fit, duration: 280, delay: 1350 + i * 150, ease: 'Back.easeOut' });
    });
    const doneAt = 1350 + Math.min(7, lines.length) * 150 + 300;

    this.confettiFall(layer, t, 44);
    SoundSystem.play(scene, 'victory');

    let canClose = false;
    let closed = false;
    t.later(900, () => (canClose = true));
    const hint = body(scene, cx, 1230, 'タップで閉じる', { fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0.5).setAlpha(0);
    layer.add(hint);
    t.later(doneAt, () => t.tween({ targets: hint, alpha: { from: 0, to: 0.85 }, duration: 600, yoyo: true, repeat: -1 }));
    const close = (): void => {
      if (!canClose || closed) return;
      closed = true;
      // Everything running stops first; only then does the layer fade and go.
      t.stopAll();
      scene.tweens.add({
        targets: layer,
        alpha: 0,
        duration: 220,
        onComplete: () => {
          layer.destroy();
          finish();
        },
      });
    };
    dim.on('pointerup', close);
    // Leaving the village screen with it still up: everything stops with the scene's own tweens, and the layer goes with it.
    layer.once(Phaser.GameObjects.Events.DESTROY, () => t.stopAll());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => t.stopAll());
  }

  /** A burst of sparks around a point of the screen. */
  private sparkBurst(layer: Phaser.GameObjects.Container, t: Tracker, x: number, y: number, count: number): void {
    const { scene } = this.host;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const reach = 140 + Math.random() * 230;
      const star = scene.add.star(x, y, 4, 3, 10 + Math.random() * 8, SPARKLE_COLORS[i % SPARKLE_COLORS.length]).setAlpha(0);
      layer.add(star);
      t.tween({ targets: star, x: x + Math.cos(a) * reach, y: y + Math.sin(a) * reach * 0.8, alpha: { from: 1, to: 0 }, scale: { from: 1.4, to: 0.2 }, angle: 240, duration: 700 + Math.random() * 600, ease: 'Cubic.easeOut' });
    }
  }

  /** Paper falling over the whole screen. */
  private confettiFall(layer: Phaser.GameObjects.Container, t: Tracker, count: number): void {
    const { scene } = this.host;
    for (let i = 0; i < count; i++) {
      const piece = scene.add.rectangle(Math.random() * 720, -30, 12 + Math.random() * 8, 7 + Math.random() * 6, CONFETTI_COLORS[i % CONFETTI_COLORS.length]).setAngle(Math.random() * 360);
      layer.add(piece);
      t.tween({
        targets: piece,
        y: 1320,
        x: piece.x + (Math.random() - 0.5) * 200,
        angle: piece.angle + 540 + Math.random() * 360,
        duration: 2600 + Math.random() * 1800,
        delay: 400 + Math.random() * 1400,
        ease: 'Sine.easeIn',
      });
    }
  }
}
