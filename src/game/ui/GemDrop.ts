import Phaser from 'phaser';
import { SoundSystem } from '../systems/SoundSystem';
import { body } from './theme';

const INK = '#1c130a';
/** Under the movie (300), over the scene's popups (200): the movie covers this, and this covers the results being built. */
const DEPTH = 290;
/** The magic circle, and where the gems start. */
const CX = 360;
const CY = 545;
const HOME = { x: 360, y: 1010 };
/** A gem let go this close to the circle falls in; further away it springs back. */
const DROP_RADIUS = 220;
/** Nobody touched anything: the gems go in by themselves. */
const IDLE_MS = 6000;
const GEM_TEXTURE = 'currency_gem';

export interface GemDropOptions {
  /** 1 for a single pull; 10 for a ten-pull, which drops a pile of ten gems. */
  count: number;
  /** The best ★ of the pull, which tints the circle (an omen that never lies: the movie that follows agrees). */
  rarity: number;
  /** What it cost, shown under the gems. */
  cost: number;
  /** The gems are in: the screen has gone dark, and the movie can begin from black. */
  onDrop: () => void;
}

export interface GemDropLayer {
  /** Fades the layer away (whatever was built underneath shows through). */
  close(): void;
}

/**
 * The one action before a pull's movie: the player drags the gem - a pile of ten for a ten-pull -
 * onto a magic circle (or just taps it, and it flies there itself). The circle takes it with a pulse
 * per gem and a flash, then the screen goes black for the movie, which starts from black too.
 * Skippable, and goes by itself if left alone. The circle's colour foreshadows the pull: blue for
 * ★1-2, orange for ★3, gold for ★4, rainbow for ★5.
 */
export function playGemDrop(scene: Phaser.Scene, opts: GemDropOptions): GemDropLayer {
  const { count } = opts;
  buildTextures(scene);
  const layer = scene.add.container(0, 0).setDepth(DEPTH).setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, duration: 220 });

  const bg = scene.add.rectangle(360, 640, 720, 1280, 0x05060c, 1).setInteractive();
  layer.add(bg);

  // ---- the circle ----
  const glow = scene.add.image(CX, CY, 'gemdrop_glow').setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0.5);
  const outer = scene.add.image(CX, CY, 'gemdrop_outer').setBlendMode(Phaser.BlendModes.ADD).setScale(1.15);
  const inner = scene.add.image(CX, CY, 'gemdrop_inner').setBlendMode(Phaser.BlendModes.ADD).setScale(1.15);
  layer.add([glow, outer, inner]);
  const spins = [
    scene.tweens.add({ targets: outer, angle: 360, duration: 26000, repeat: -1 }),
    scene.tweens.add({ targets: inner, angle: -360, duration: 17000, repeat: -1 }),
  ];
  scene.tweens.add({ targets: glow, alpha: { from: 0.38, to: 0.6 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  const tint = (color: number): void => [glow, outer, inner].forEach((o) => o.setTint(color));
  const omen = omenOf(opts.rarity);
  if (omen === 'rainbow') {
    const hue = { h: 0 };
    scene.tweens.add({
      targets: hue,
      h: 1,
      duration: 2600,
      repeat: -1,
      onUpdate: () => {
        const c = Phaser.Display.Color.HSVToRGB(hue.h, 0.55, 1) as Phaser.Types.Display.ColorObject;
        tint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  } else {
    tint(omen);
  }

  // ---- the words ----
  const title = body(scene, 360, 150, '魔晶石を 魔法陣へ！', { fontSize: '44px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 8 }).setOrigin(0.5);
  const sub = body(scene, 360, 208, 'ドラッグ、またはタップ', { fontSize: '26px', fontStyle: 'bold', color: '#cfe4ff', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
  const arrow = body(scene, 360, HOME.y - 132, '▲', { fontSize: '40px', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0.5);
  const cost = body(scene, 360, HOME.y + 130, `魔晶石 ${opts.cost.toLocaleString('ja-JP')}`, { fontSize: '30px', fontStyle: 'bold', color: '#7cd6ff', stroke: INK, strokeThickness: 6 }).setOrigin(0.5);
  layer.add([title, sub, arrow, cost]);
  scene.tweens.add({ targets: sub, alpha: { from: 1, to: 0.45 }, duration: 700, yoyo: true, repeat: -1 });
  scene.tweens.add({ targets: arrow, y: arrow.y - 16, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // ---- the gems ----
  const pile = scene.add.container(HOME.x, HOME.y);
  layer.add(pile);
  const gems = buildGems(scene, count);
  pile.add(gems);
  let badge: Phaser.GameObjects.Container | undefined;
  if (count > 1) {
    badge = scene.add.container(66, 78);
    const pill = scene.add.graphics();
    pill.fillStyle(0xe0822a, 1);
    pill.fillRoundedRect(-48, -22, 96, 44, 14);
    pill.fillStyle(0xffffff, 0.22);
    pill.fillRoundedRect(-44, -19, 88, 16, { tl: 11, tr: 11, bl: 3, br: 3 });
    pill.lineStyle(3, 0xffe9b8, 1);
    pill.strokeRoundedRect(-48, -22, 96, 44, 14);
    const times = body(scene, 0, 0, `×${count}`, { fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: '#4a2406', strokeThickness: 6 }).setOrigin(0.5);
    badge.add([pill, times]);
    pile.add(badge);
  }
  const bob = scene.tweens.add({ targets: pile, y: HOME.y - 10, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  // ---- what happens once the gems are in ----
  let thrown = false;
  let ended = false;
  let idle: Phaser.Time.TimerEvent | undefined;

  const blackout = scene.add.rectangle(360, 640, 720, 1280, 0x000000, 1).setAlpha(0);
  const skip = body(scene, 652, 64, 'スキップ', { fontSize: '24px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
  const skipZone = scene.add.zone(652, 64, 150, 60).setInteractive({ useHandCursor: true });
  layer.add([blackout, skip, skipZone]);
  layer.bringToTop(blackout);
  layer.bringToTop(skip);
  layer.bringToTop(skipZone);

  /** Black out, then let the movie begin. */
  const finish = (ms: number): void => {
    if (ended) return;
    ended = true;
    idle?.remove();
    skip.setVisible(false);
    skipZone.disableInteractive();
    scene.tweens.add({
      targets: blackout,
      alpha: 1,
      duration: ms,
      onComplete: () => opts.onDrop(),
    });
  };

  const pulse = (strong: boolean): void => {
    const ring = scene.add.circle(CX, CY, 150).setStrokeStyle(strong ? 10 : 6, 0xffffff, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH + 1);
    scene.tweens.add({ targets: ring, scale: strong ? 3.4 : 2.1, alpha: 0, duration: strong ? 620 : 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  };

  const finale = (): void => {
    SoundSystem.play(scene, 'skill');
    pulse(true);
    scene.time.delayedCall(120, () => pulse(true));
    const disc = scene.add.circle(CX, CY, 70, 0xffffff, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH + 1).setScale(0.2);
    scene.tweens.add({ targets: disc, scale: 16, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => disc.destroy() });
    scene.cameras.main.flash(260, 255, 255, 255, false);
    scene.cameras.main.shake(260, 0.006);
    scene.time.delayedCall(420, () => finish(260));
  };

  const throwGems = (): void => {
    if (thrown) return;
    thrown = true;
    idle?.remove();
    skip.setVisible(false);
    skipZone.disableInteractive();
    bob.stop();
    scene.tweens.killTweensOf([arrow, sub]);
    scene.tweens.add({ targets: [arrow, title, sub, cost], alpha: 0, duration: 200 });
    if (badge) scene.tweens.add({ targets: badge, alpha: 0, scale: 0.6, duration: 200 });
    // The pile stays where it was let go; each gem goes from there to the centre of the circle.
    const toX = CX - pile.x;
    const toY = CY - pile.y;
    const gap = count > 1 ? 70 : 0;
    gems.forEach((gem, i) => {
      scene.tweens.add({
        targets: gem,
        x: toX,
        y: toY,
        scale: gem.scale * 0.22,
        angle: gem.angle + 420,
        duration: 380,
        delay: 140 + i * gap,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          gem.destroy();
          SoundSystem.play(scene, 'tap');
          pulse(false);
          spins.forEach((t) => (t.timeScale += 1.6));
          scene.tweens.add({ targets: glow, scale: { from: 2.5, to: 2.2 }, duration: 260 });
          scene.cameras.main.shake(70, 0.0025);
          if (i === gems.length - 1) scene.time.delayedCall(140, finale);
        },
      });
    });
  };

  // ---- dragging (or just tapping) the gems ----
  const hit = count > 1 ? 118 : 86;
  const zone = scene.add.zone(0, 0, hit * 2, hit * 2).setOrigin(0.5).setInteractive({ useHandCursor: true });
  pile.add(zone);
  let dragging = false;
  let moved = 0;
  const grab = { x: 0, y: 0 };
  const start = { x: 0, y: 0 };
  zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (thrown) return;
    dragging = true;
    moved = 0;
    bob.pause();
    grab.x = pile.x - p.x;
    grab.y = pile.y - p.y;
    start.x = p.x;
    start.y = p.y;
    scene.tweens.add({ targets: pile, scale: 1.1, duration: 120 });
    idle?.remove();
  });
  const onMove = (p: Phaser.Input.Pointer): void => {
    if (!dragging) return;
    moved = Math.max(moved, Phaser.Math.Distance.Between(p.x, p.y, start.x, start.y));
    pile.setPosition(Phaser.Math.Clamp(p.x + grab.x, 60, 660), Phaser.Math.Clamp(p.y + grab.y, 60, 1220));
  };
  const onUp = (): void => {
    if (!dragging) return;
    dragging = false;
    // A tap, or a drop on the circle: in they go. Anywhere else, the gems spring back.
    if (moved < 14 || Phaser.Math.Distance.Between(pile.x, pile.y, CX, CY) < DROP_RADIUS) {
      throwGems();
      return;
    }
    scene.tweens.add({ targets: pile, x: HOME.x, y: HOME.y, scale: 1, duration: 260, ease: 'Back.easeOut', onComplete: () => bob.resume() });
    idle = scene.time.delayedCall(IDLE_MS, throwGems);
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  layer.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
  });

  skipZone.on('pointerup', () => {
    thrown = true;
    finish(160);
  });
  idle = scene.time.delayedCall(IDLE_MS, throwGems);

  return {
    close(): void {
      scene.tweens.add({ targets: layer, alpha: 0, duration: 380, onComplete: () => layer.destroy() });
    },
  };
}

function omenOf(rarity: number): number | 'rainbow' {
  if (rarity >= 5) return 'rainbow';
  if (rarity === 4) return 0xffd23f;
  if (rarity === 3) return 0xff8a3a;
  return 0x4aa8ff;
}

/** The gem, or a pile of ten: the first at the centre, the rest round it. */
function buildGems(scene: Phaser.Scene, count: number): Phaser.GameObjects.Image[] {
  const key = scene.textures.exists(GEM_TEXTURE) ? GEM_TEXTURE : 'gemdrop_gem';
  const frame = scene.textures.getFrame(key);
  const fit = (size: number): number => size / Math.max(frame.width, frame.height);
  if (count <= 1) return [scene.add.image(0, 0, key).setScale(fit(150))];
  const size = 92;
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i - 1) / Math.max(1, count - 1)) * Math.PI * 2 - Math.PI / 2;
    const reach = i === 0 ? 0 : 66;
    return scene.add
      .image(Math.cos(angle) * reach, Math.sin(angle) * reach, key)
      .setScale(fit(size))
      .setAngle(Phaser.Math.Between(-18, 18));
  }).reverse();
}

/** The circle's drawings are white lines baked once into textures, so they can be tinted and spun. */
function buildTextures(scene: Phaser.Scene): void {
  const make = (key: string, size: number, draw: (g: Phaser.GameObjects.Graphics, c: number) => void): void => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g, size / 2);
    g.generateTexture(key, size, size);
    g.destroy();
  };

  make('gemdrop_outer', 540, (g, c) => {
    g.lineStyle(5, 0xffffff, 1);
    g.strokeCircle(c, c, 262);
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeCircle(c, c, 248);
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const len = i % 8 === 0 ? 20 : 9;
      g.lineStyle(i % 8 === 0 ? 3 : 2, 0xffffff, 0.9);
      g.lineBetween(c + Math.cos(a) * 234, c + Math.sin(a) * 234, c + Math.cos(a) * (234 - len), c + Math.sin(a) * (234 - len));
    }
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(c, c, 206);
    // A band of rune-like dashes between the rings.
    for (let i = 0; i < 28; i++) {
      const a0 = (i / 28) * Math.PI * 2;
      g.lineStyle(9, 0xffffff, 0.9);
      g.beginPath();
      g.arc(c, c, 224, a0, a0 + 0.05 + (i % 3) * 0.035, false);
      g.strokePath();
    }
  });

  make('gemdrop_inner', 420, (g, c) => {
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(c, c, 196);
    g.strokeCircle(c, c, 130);
    const point = (r: number, a: number): { x: number; y: number } => ({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
    // A six-pointed star, a small circle on each point.
    for (const base of [-Math.PI / 2, Math.PI / 2]) {
      const [p1, p2, p3] = [0, 1, 2].map((k) => point(190, base + (k * Math.PI * 2) / 3));
      g.strokeTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }
    for (let k = 0; k < 6; k++) {
      const p = point(190, -Math.PI / 2 + (k * Math.PI) / 3);
      g.strokeCircle(p.x, p.y, 20);
    }
    // A five-pointed star inside, and the eye at the centre.
    const star = [0, 1, 2, 3, 4].map((k) => point(120, -Math.PI / 2 + (((k * 2) % 5) * Math.PI * 2) / 5));
    g.beginPath();
    g.moveTo(star[0].x, star[0].y);
    for (let k = 1; k <= 5; k++) g.lineTo(star[k % 5].x, star[k % 5].y);
    g.strokePath();
    g.strokeCircle(c, c, 44);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, 9);
  });

  make('gemdrop_glow', 520, (g, c) => {
    for (let i = 0; i < 34; i++) {
      g.fillStyle(0xffffff, 0.022);
      g.fillCircle(c, c, 258 - i * 7.4);
    }
  });

  make('gemdrop_gem', 64, (g, c) => {
    g.fillStyle(0x7cd6ff, 1);
    g.fillPoints([new Phaser.Geom.Point(c, 4), new Phaser.Geom.Point(c + 26, c), new Phaser.Geom.Point(c, 60), new Phaser.Geom.Point(c - 26, c)], true);
    g.fillStyle(0xffffff, 0.45);
    g.fillPoints([new Phaser.Geom.Point(c, 4), new Phaser.Geom.Point(c + 26, c), new Phaser.Geom.Point(c, c)], true);
  });
}
