import Phaser from 'phaser';

/** Small soft textures the village's ambient effects are made of (made once, shared by every scene). */
export const SOFT = 'vl_soft';
export const STAR = 'vl_star';
export const DROP = 'vl_drop';

export function ensureLifeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SOFT)) {
    const canvas = scene.textures.createCanvas(SOFT, 64, 64);
    const ctx = canvas?.getContext();
    if (canvas && ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      canvas.refresh();
    }
  }
  if (!scene.textures.exists(STAR)) {
    const canvas = scene.textures.createCanvas(STAR, 32, 32);
    const ctx = canvas?.getContext();
    if (canvas && ctx) {
      const halo = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      halo.addColorStop(0, 'rgba(255,255,255,0.9)');
      halo.addColorStop(0.3, 'rgba(255,255,255,0.25)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(19, 13);
      ctx.lineTo(32, 16);
      ctx.lineTo(19, 19);
      ctx.lineTo(16, 32);
      ctx.lineTo(13, 19);
      ctx.lineTo(0, 16);
      ctx.lineTo(13, 13);
      ctx.closePath();
      ctx.fill();
      canvas.refresh();
    }
  }
  if (!scene.textures.exists(DROP)) {
    const canvas = scene.textures.createCanvas(DROP, 12, 12);
    const ctx = canvas?.getContext();
    if (canvas && ctx) {
      const g = ctx.createRadialGradient(6, 6, 0, 6, 6, 6);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 12, 12);
      canvas.refresh();
    }
  }
}

export interface Spawn {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  ax?: number;
  ay?: number;
  /** ms */
  life: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  tint?: number;
  /** Degrees per second. */
  spin?: number;
  /** Share of the life over which it fades in. */
  fadeIn?: number;
}

interface Particle {
  image: Phaser.GameObjects.Image;
  on: boolean;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  life: number;
  age: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  spin: number;
  fadeIn: number;
}

/**
 * A fixed-size pool of image particles, updated by hand: no emitters to keep alive, a hard cap on what exists at once
 * (a spawn beyond the cap is dropped), nothing left running after `destroy`. One pool = one texture and one blend mode.
 */
export class ParticlePool {
  private readonly items: Particle[] = [];
  private live = 0;
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly texture: string;
  private readonly additive: boolean;
  private readonly cap: number;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, texture: string, additive: boolean, cap: number) {
    this.scene = scene;
    this.layer = layer;
    this.texture = texture;
    this.additive = additive;
    this.cap = cap;
  }

  get count(): number {
    return this.live;
  }

  spawn(s: Spawn): void {
    let p = this.items.find((item) => !item.on);
    if (!p) {
      if (this.items.length >= this.cap) return;
      const image = this.scene.add.image(0, 0, this.texture).setVisible(false);
      if (this.additive) image.setBlendMode(Phaser.BlendModes.ADD);
      this.layer.add(image);
      p = { image, on: false, vx: 0, vy: 0, ax: 0, ay: 0, life: 1, age: 0, s0: 1, s1: 1, a0: 1, a1: 0, spin: 0, fadeIn: 0 };
      this.items.push(p);
    }
    p.on = true;
    p.vx = s.vx ?? 0;
    p.vy = s.vy ?? 0;
    p.ax = s.ax ?? 0;
    p.ay = s.ay ?? 0;
    p.life = s.life;
    p.age = 0;
    p.s0 = s.s0;
    p.s1 = s.s1;
    p.a0 = s.a0;
    p.a1 = s.a1;
    p.spin = s.spin ?? 0;
    p.fadeIn = s.fadeIn ?? 0.15;
    p.image.setPosition(s.x, s.y).setScale(s.s0).setAlpha(0).setAngle(0).setTint(s.tint ?? 0xffffff).setVisible(true);
    this.live++;
  }

  update(dtMs: number): void {
    if (this.live === 0) return;
    const dt = dtMs / 1000;
    for (const p of this.items) {
      if (!p.on) continue;
      p.age += dtMs;
      if (p.age >= p.life) {
        p.on = false;
        p.image.setVisible(false);
        this.live--;
        continue;
      }
      const t = p.age / p.life;
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.image.x += p.vx * dt;
      p.image.y += p.vy * dt;
      p.image.setScale(p.s0 + (p.s1 - p.s0) * t);
      const fade = p.fadeIn > 0 ? Math.min(1, t / p.fadeIn) : 1;
      p.image.setAlpha((p.a0 + (p.a1 - p.a0) * t) * fade);
      if (p.spin) p.image.angle += p.spin * dt;
    }
  }

  clear(): void {
    for (const p of this.items) {
      p.on = false;
      p.image.setVisible(false);
    }
    this.live = 0;
  }

  destroy(): void {
    for (const p of this.items) p.image.destroy();
    this.items.length = 0;
    this.live = 0;
  }
}
