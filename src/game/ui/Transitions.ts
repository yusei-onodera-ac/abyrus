import Phaser from 'phaser';

export interface EnterOptions {
  delay?: number;
  duration?: number;
  dy?: number;
  dx?: number;
  ease?: string;
}

type Enterable = { x: number; y: number; alpha: number };

/** Fades + slides a display object in from a small offset to wherever it
 *  already sits. Call right after creating something in a scene's
 *  create() - the offset is applied synchronously before the first render,
 *  so there's no flash at the resting position first. */
export function enter(scene: Phaser.Scene, target: Enterable, opts: EnterOptions = {}): void {
  const { delay = 0, duration = 320, dy = 18, dx = 0, ease = 'Cubic.easeOut' } = opts;
  const targetX = target.x;
  const targetY = target.y;
  target.x = targetX + dx;
  target.y = targetY + dy;
  target.alpha = 0;
  scene.tweens.add({ targets: target, x: targetX, y: targetY, alpha: 1, delay, duration, ease });
}

/** Staggers `enter` across a list of objects for a cascading reveal, e.g. a
 *  grid of roster cards appearing one after another. */
export function enterStagger(scene: Phaser.Scene, targets: Enterable[], opts: EnterOptions & { stagger?: number } = {}): void {
  const { stagger = 35, ...rest } = opts;
  targets.forEach((t, i) => enter(scene, t, { ...rest, delay: (rest.delay ?? 0) + i * stagger }));
}

type Poppable = { scale: number; alpha?: number };

/** Pops a target in with a scale overshoot - bouncier than a plain fade,
 *  used for gacha reveals and result panels. */
export function popIn(scene: Phaser.Scene, target: Poppable, opts: EnterOptions = {}): void {
  const { delay = 0, duration = 360, ease = 'Back.easeOut' } = opts;
  target.scale = 0;
  if (target.alpha !== undefined) target.alpha = 1;
  scene.tweens.add({ targets: target, scale: 1, delay, duration, ease });
}
