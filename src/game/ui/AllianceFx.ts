import Phaser from 'phaser';
import { perksForLevel } from '../data/alliance';
import { body, heading } from './theme';

const INK = '#1c130a';
const DEPTH = 260;
const RAYS = 'alliancefx_rays';

/** A sunburst of wedges that thin out towards the edge (white, so it can take a tint). */
function ensureRays(scene: Phaser.Scene): void {
  if (scene.textures.exists(RAYS)) return;
  const size = 520;
  const c = size / 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 0.11);
  for (let layer = 0; layer < 9; layer++) {
    const reach = c * (1 - layer * 0.1);
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2 * 0.36) / 20;
      g.fillTriangle(c, c, c + Math.cos(a0) * reach, c + Math.sin(a0) * reach, c + Math.cos(a1) * reach, c + Math.sin(a1) * reach);
    }
  }
  g.generateTexture(RAYS, size, size);
  g.destroy();
}

/**
 * 同盟Lv up: the screen dims, rays turn behind a big "同盟Lv.N", and what the new level gives is listed. A tap closes it
 * (a moment after it starts). Every tween and timer it starts is kept and stopped when it is closed or the scene is left:
 * a tween that outlives the text it moves throws inside Phaser's frame loop and freezes the game (see EnhanceFx).
 */
export function playAllianceLevelUp(scene: Phaser.Scene, level: number, onClose?: () => void): void {
  ensureRays(scene);
  const tweens: Phaser.Tweens.Tween[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];
  const tween = (config: Phaser.Types.Tweens.TweenBuilderConfig): void => {
    tweens.push(scene.tweens.add(config));
  };
  const layer = scene.add.container(0, 0).setDepth(DEPTH);
  let closed = false;
  const stopAll = (): void => {
    for (const t of tweens) t.stop();
    for (const t of timers) t.remove(false);
    tweens.length = 0;
    timers.length = 0;
  };
  layer.once(Phaser.GameObjects.Events.DESTROY, stopAll);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stopAll);

  const dim = scene.add.rectangle(360, 640, 720, 1280, 0x05060c, 0).setInteractive();
  layer.add(dim);
  tween({ targets: dim, fillAlpha: 0.88, duration: 220 });
  const rays = scene.add.image(360, 420, RAYS).setTint(0x7ab8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.9).setAlpha(0);
  layer.add(rays);
  tween({ targets: rays, alpha: { from: 0, to: 0.6 }, duration: 420 });
  tween({ targets: rays, angle: 360, duration: 16000, repeat: -1 });

  const title = heading(scene, 360, 300, 'LEVEL UP!', { fontSize: '78px', color: '#bfe0ff', stroke: '#14407a', strokeThickness: 14 }).setOrigin(0.5).setScale(0).setAlpha(0);
  const lv = body(scene, 360, 420, `同盟Lv.${level}`, { fontSize: '84px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 12 }).setOrigin(0.5).setScale(0.4).setAlpha(0);
  layer.add([title, lv]);
  tween({ targets: title, scale: 1, alpha: 1, duration: 420, delay: 200, ease: 'Back.easeOut' });
  tween({ targets: lv, scale: 1, alpha: 1, duration: 420, delay: 420, ease: 'Back.easeOut' });

  const now = perksForLevel(level);
  const before = perksForLevel(level - 1);
  const pct = (v: number): string => `+${Math.round(v * 100)}%`;
  const lines = [
    `放置ゴールド ${pct(before.idleGoldBonus)} → ${pct(now.idleGoldBonus)}`,
    `経験値素材 ${pct(before.expDropBonus)} → ${pct(now.expDropBonus)}`,
    `スタミナ上限 +${before.staminaMaxBonus} → +${now.staminaMaxBonus}`,
    `ボス挑戦 ${before.raidAttemptsPerDay}回 → ${now.raidAttemptsPerDay}回/日`,
    `メンバー上限 ${before.memberMax}人 → ${now.memberMax}人`,
  ];
  lines.forEach((text, i) => {
    const t = body(scene, 360, 560 + i * 54, text, { fontSize: '30px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 5 }).setOrigin(0.5).setAlpha(0).setScale(0.7);
    layer.add(t);
    tween({ targets: t, alpha: 1, scale: 1, duration: 300, delay: 800 + i * 160, ease: 'Back.easeOut' });
  });

  let canClose = false;
  timers.push(scene.time.delayedCall(700, () => (canClose = true)));
  const hint = body(scene, 360, 1200, 'タップで閉じる', { fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0.5).setAlpha(0);
  layer.add(hint);
  timers.push(scene.time.delayedCall(1800, () => tween({ targets: hint, alpha: { from: 0, to: 0.85 }, duration: 600, yoyo: true, repeat: -1 })));
  dim.on('pointerup', () => {
    if (!canClose || closed) return;
    closed = true;
    stopAll();
    scene.tweens.add({ targets: layer, alpha: 0, duration: 220, onComplete: () => {
      layer.destroy();
      onClose?.();
    } });
  });
}
