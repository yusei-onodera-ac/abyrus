import Phaser from 'phaser';
import { RARITY_COLORS, type Rarity } from '../types';

const AURA_TEXTURE_KEY = 'fx_spark';

/** The scale a sprite rests at (set when its view is made): tweens that swell or squash it
 *  go to and from this, so two of them overlapping cannot leave it stuck at the wrong size. */
function baseScaleOf(sprite: Phaser.GameObjects.Sprite): number {
  return (sprite.getData('baseScale') as number | undefined) ?? sprite.scaleX;
}

/**
 * Owns all per-sprite visual flair: idle bob, aura particles, attack lunge,
 * hit flash, crit camera shake, and death fade. Particle emitters are
 * created once per unit and reused/stopped rather than recreated each hit.
 */
export class AnimationController {
  private scene: Phaser.Scene;
  private auras = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (!scene.textures.exists(AURA_TEXTURE_KEY)) {
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture(AURA_TEXTURE_KEY, 8, 8);
      g.destroy();
    }
  }

  idle(sprite: Phaser.GameObjects.Sprite): void {
    this.scene.tweens.add({
      targets: sprite,
      y: sprite.y - 4,
      duration: 900 + Math.random() * 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Only rarity 3+ get live particles; lower rarities stay visually clean. */
  attachAura(id: string, sprite: Phaser.GameObjects.Sprite, rarity: Rarity): void {
    if (rarity < 3) return;
    const color = RARITY_COLORS[rarity];
    const emitter = this.scene.add.particles(sprite.x, sprite.y + 20, AURA_TEXTURE_KEY, {
      speed: { min: 10, max: 20 },
      scale: { start: 0.5 + rarity * 0.1, end: 0 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 800,
      frequency: Math.max(60, 260 - rarity * 45),
      tint: color,
      blendMode: 'ADD',
      follow: sprite,
      followOffset: { x: 0, y: 20 },
    });
    this.auras.set(id, emitter);
  }

  attack(sprite: Phaser.GameObjects.Sprite, towardsRight: boolean): void {
    const dx = towardsRight ? 14 : -14;
    this.scene.tweens.add({
      targets: sprite,
      x: sprite.x + dx,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** The attacker darts a good way towards its target, swelling as it goes, and snaps back. */
  lunge(sprite: Phaser.GameObjects.Sprite, target: { x: number; y: number }, power = 0.28): void {
    const dx = (target.x - sprite.x) * power;
    const dy = (target.y - sprite.y) * power;
    const base = baseScaleOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      x: sprite.x + dx,
      y: sprite.y + dy,
      scaleX: base * 1.14,
      scaleY: base * 1.14,
      duration: 95,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** The struck one is knocked back away from the attacker and shudders. */
  knockback(sprite: Phaser.GameObjects.Sprite, from: { x: number; y: number }, power: number): void {
    const dx = sprite.x - from.x;
    const dy = sprite.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    this.scene.tweens.add({
      targets: sprite,
      x: sprite.x + (dx / len) * power,
      y: sprite.y + (dy / len) * power,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  hitFlash(sprite: Phaser.GameObjects.Sprite, crit: boolean): void {
    sprite.setTintFill(crit ? 0xffffff : 0xff6666);
    this.scene.time.delayedCall(crit ? 170 : 100, () => sprite.clearTint());
    const baseScale = baseScaleOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      scaleX: baseScale * (crit ? 0.74 : 0.88),
      scaleY: baseScale * (crit ? 0.74 : 0.88),
      duration: 80,
      yoyo: true,
    });
  }

  /** Generic non-damage status pulse (heal/buff/debuff/stun) - same
   *  tint-and-clear beat as hitFlash but without the hit-impact squash,
   *  since nothing was struck. */
  statusFlash(sprite: Phaser.GameObjects.Sprite, color: number): void {
    sprite.setTintFill(color);
    this.scene.time.delayedCall(180, () => sprite.clearTint());
  }

  death(sprite: Phaser.GameObjects.Sprite, onComplete: () => void): void {
    // A white flash, a last swell, then it spins away and fades.
    sprite.setTintFill(0xffffff);
    const base = baseScaleOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      scaleX: base * 1.25,
      scaleY: base * 1.25,
      duration: 110,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: sprite,
          alpha: 0,
          scaleX: base * 0.4,
          scaleY: base * 0.4,
          angle: sprite.angle + Phaser.Math.Between(-35, 35),
          y: sprite.y - 14,
          duration: 380,
          ease: 'Cubic.easeIn',
          onComplete,
        });
      },
    });
  }

  critShake(camera: Phaser.Cameras.Scene2D.Camera): void {
    camera.shake(160, 0.006);
    camera.flash(100, 255, 255, 255, false);
  }

  destroyAura(id: string): void {
    const emitter = this.auras.get(id);
    if (!emitter) return;
    emitter.stop();
    this.scene.time.delayedCall(900, () => emitter.destroy());
    this.auras.delete(id);
  }

  destroyAll(): void {
    for (const emitter of this.auras.values()) emitter.destroy();
    this.auras.clear();
  }
}
