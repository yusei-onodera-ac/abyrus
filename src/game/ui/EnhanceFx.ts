import Phaser from 'phaser';
import { BattleFx, type FxPalette } from '../characters/BattleFx';
import type { CharacterGenerator } from '../characters/CharacterGenerator';
import { MAX_PHASE, type HeroData } from '../types';
import { HeroSlot } from './HeroSlot';
import { body } from './theme';

const INK = '#1c130a';
/** Above the scene's popups (200), under the tutorial (300). */
const DEPTH = 260;
const CX = 360;
const CY = 540;
const RAYS = 'enhancefx_rays';

export interface EnhanceFxOptions {
  /** level: a level (or more) was gained; phase: フェーズ素材 was used; fuse: copies were fused in. */
  kind: 'level' | 'phase' | 'fuse';
  hero: HeroData;
  generator: CharacterGenerator;
  /** The level (kind 'level') or the phase (the other two) before and after. */
  from: number;
  to: number;
  /** kind 'level': lines under the number, e.g. what HP and 攻撃 became. */
  lines?: string[];
  /** kind 'fuse': the copies that were used up (they fly into the hero). */
  materials?: HeroData[];
}

const LOOK: Record<EnhanceFxOptions['kind'], { title: string; color: number; text: string; stroke: string; palette: FxPalette }> = {
  level: { title: 'LEVEL UP!', color: 0xffd23f, text: '#fff4a8', stroke: '#8a3a00', palette: 'gold' },
  phase: { title: 'PHASE UP!', color: 0xb07bff, text: '#f0e4ff', stroke: '#3a1a7a', palette: 'violet' },
  fuse: { title: '合成！', color: 0x5fe08a, text: '#e4ffee', stroke: '#0e5a3a', palette: 'green' },
};

/** One shared set of spark emitters per scene (BattleFx), dropped when the scene shuts down. */
const sparks = new WeakMap<Phaser.Scene, BattleFx>();

function sparksFor(scene: Phaser.Scene): BattleFx {
  let fx = sparks.get(scene);
  if (!fx) {
    fx = new BattleFx(scene);
    sparks.set(scene, fx);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sparks.delete(scene));
  }
  return fx;
}

/**
 * What an upgrade looks like: the screen dims, rays turn behind the hero, who pops up big
 * under a headline (LEVEL UP! / PHASE UP! / 合成！) with a burst of sparks - and then the number
 * itself (the level counting up, the phase diamonds lighting one by one, the copies flying in
 * to be fused). Tap to close, which is possible a moment after it starts.
 */
export function playEnhanceFx(scene: Phaser.Scene, opts: EnhanceFxOptions): void {
  ensureRays(scene);
  const look = LOOK[opts.kind];
  const fx = sparksFor(scene);
  // Every tween and timer the effect starts is remembered, so closing it early (a tap while the number is still
  // counting) stops them: a tween that goes on after its text is destroyed throws inside Phaser's frame loop, which
  // then never schedules the next frame - the whole game freezes.
  const tweens: Phaser.Tweens.Tween[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];
  const tween = (config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween => {
    const t = scene.tweens.add(config);
    tweens.push(t);
    return t;
  };
  const later = (ms: number, callback: () => void): Phaser.Time.TimerEvent => {
    const t = scene.time.delayedCall(ms, callback);
    timers.push(t);
    return t;
  };
  const layer = scene.add.container(0, 0).setDepth(DEPTH);
  const stopAll = (): void => {
    for (const t of tweens) t.stop();
    for (const t of timers) t.remove(false);
    tweens.length = 0;
    timers.length = 0;
  };
  layer.once(Phaser.GameObjects.Events.DESTROY, stopAll);

  const dim = scene.add.rectangle(360, 640, 720, 1280, 0x05060c, 0).setInteractive();
  layer.add(dim);
  tween({ targets: dim, fillAlpha: 0.88, duration: 220 });

  const rays = scene.add.image(CX, CY, RAYS).setTint(look.color).setBlendMode(Phaser.BlendModes.ADD).setScale(1.9).setAlpha(0);
  const glow = scene.add.circle(CX, CY, 170, look.color, 0.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  layer.add([rays, glow]);
  tween({ targets: [rays, glow], alpha: { from: 0, to: 0.55 }, duration: 420 });
  tween({ targets: rays, angle: 360, duration: 16000, repeat: -1 });
  tween({ targets: glow, scale: { from: 1, to: 1.18 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  const slot = new HeroSlot(scene, CX, CY, { hero: opts.hero, generator: opts.generator, hideLevel: true }, 236).setScale(0);
  layer.add(slot);
  tween({ targets: slot, scale: 1, duration: 460, delay: 120, ease: 'Back.easeOut' });

  const title = scene.add
    .text(CX, 250, look.title, { fontFamily: 'Arial Black, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', fontSize: opts.kind === 'fuse' ? '92px' : '78px', color: look.text, stroke: look.stroke, strokeThickness: 14 })
    .setOrigin(0.5)
    .setScale(0)
    .setAlpha(0);
  layer.add(title);
  const reveal = (): void => {
    title.setAlpha(1);
    tween({ targets: title, scale: 1, duration: 420, ease: 'Back.easeOut' });
    fx.celebrate(CX, CY, look.palette, true);
    scene.cameras.main.shake(200, 0.004);
  };

  /** A line of text under the hero that pops in. */
  const popText = (y: number, text: string, size: number, color: string, delay: number): Phaser.GameObjects.Text => {
    const t = body(scene, CX, y, text, { fontSize: `${size}px`, fontStyle: 'bold', color, stroke: INK, strokeThickness: Math.round(size / 6) }).setOrigin(0.5).setAlpha(0).setScale(0.6);
    layer.add(t);
    tween({ targets: t, alpha: 1, scale: 1, duration: 300, delay, ease: 'Back.easeOut' });
    return t;
  };

  /** The phase diamonds: `from` lit, then each new one lighting up in turn. Returns when the last has. */
  const diamonds = (startAt: number): number => {
    const gap = 46;
    const y = 790;
    const x0 = CX - ((MAX_PHASE - 1) * gap) / 2;
    const drawn: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < MAX_PHASE; i++) {
      const g = scene.add.graphics({ x: x0 + i * gap, y });
      paint(g, i < opts.from);
      g.setAlpha(0);
      layer.add(g);
      drawn.push(g);
      tween({ targets: g, alpha: 1, duration: 260, delay: startAt - 200 });
    }
    const gained = Math.max(0, opts.to - opts.from);
    for (let k = 0; k < gained; k++) {
      const i = opts.from + k;
      later(startAt + k * 360, () => {
        paint(drawn[i], true);
        tween({ targets: drawn[i], scale: { from: 1.9, to: 1 }, duration: 320, ease: 'Back.easeOut' });
        fx.celebrate(x0 + i * gap, y, look.palette);
      });
    }
    popText(y + 66, `フェーズ ${opts.from} → ${opts.to}`, 36, '#e6d6ff', startAt);
    return startAt + gained * 360 + 300;
  };

  let doneAt = 0;
  if (opts.kind === 'level') {
    later(440, reveal);
    const level = popText(760, `Lv.${opts.from}`, 70, '#ffffff', 700);
    const count = { n: opts.from };
    tween({
      targets: count,
      n: opts.to,
      duration: 700,
      delay: 900,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        level.setText(`Lv.${Math.round(count.n)}`);
        level.setColor(Math.round(count.n) > opts.from ? '#ffd23f' : '#ffffff');
      },
      onComplete: () => {
        level.setText(`Lv.${opts.to}`);
        fx.celebrate(CX, 760, look.palette);
        tween({ targets: level, scale: { from: 1.35, to: 1 }, duration: 320, ease: 'Back.easeOut' });
      },
    });
    (opts.lines ?? []).forEach((line, i) => popText(840 + i * 46, line, 30, '#9fe39f', 1650 + i * 200));
    doneAt = 1650 + (opts.lines?.length ?? 0) * 200 + 300;
  } else if (opts.kind === 'phase') {
    later(440, reveal);
    doneAt = diamonds(1000);
  } else {
    // The copies appear along the bottom, then each flies into the hero.
    const copies = (opts.materials ?? []).slice(0, 5);
    const size = 100;
    const span = 560;
    copies.forEach((hero, i) => {
      const x = copies.length === 1 ? CX : CX - span / 2 + (span * i) / (copies.length - 1);
      const card = new HeroSlot(scene, x, 1010, { hero, generator: opts.generator, hideLevel: true }, size).setAlpha(0);
      layer.add(card);
      tween({ targets: card, alpha: 1, y: 990, duration: 320, delay: 200 });
      tween({
        targets: card,
        x: CX,
        y: CY,
        scale: 0.3,
        alpha: 0,
        duration: 460,
        delay: 800 + i * 190,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          fx.celebrate(CX, CY, look.palette);
          tween({ targets: slot, scale: { from: 1.14, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        },
      });
    });
    const landed = 800 + Math.max(0, copies.length - 1) * 190 + 460;
    later(Math.max(440, landed - 200), reveal);
    doneAt = diamonds(landed + 500);
  }

  // ---- closing: a tap, once it has been up a moment ----
  let canClose = false;
  let closed = false;
  later(650, () => (canClose = true));
  const hint = body(scene, CX, 1200, 'タップで閉じる', { fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0.5).setAlpha(0);
  layer.add(hint);
  later(doneAt, () => tween({ targets: hint, alpha: { from: 0, to: 0.85 }, duration: 600, yoyo: true, repeat: -1 }));
  dim.on('pointerup', () => {
    if (!canClose || closed) return;
    closed = true;
    stopAll();
    scene.tweens.add({ targets: layer, alpha: 0, duration: 220, onComplete: () => layer.destroy() });
  });
}

/** A phase diamond, lit (violet) or dark. */
function paint(g: Phaser.GameObjects.Graphics, lit: boolean): void {
  const pts = [new Phaser.Math.Vector2(0, -22), new Phaser.Math.Vector2(16, 0), new Phaser.Math.Vector2(0, 22), new Phaser.Math.Vector2(-16, 0)];
  g.clear();
  g.fillStyle(lit ? 0xa97bff : 0x1d130a, 1);
  g.fillPoints(pts, true);
  g.lineStyle(3, lit ? 0xf0e4ff : 0x8a6a3a, lit ? 1 : 0.8);
  g.strokePoints(pts, true);
  if (lit) {
    g.fillStyle(0xffffff, 0.35);
    g.fillTriangle(0, -22, 16, 0, 0, 0);
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
  // Drawn in layers, each a little shorter, so the middle is solid and the tips fade.
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
