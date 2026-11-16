import Phaser from 'phaser';
import { CHROME } from './theme';

const INK = '#1c130a';
const active = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/** Short-lived pill above the bottom bar, for feedback that doesn't deserve
 *  a popup (not enough gems, a rule the player just hit, an unbuilt
 *  feature). A new toast replaces the one still on screen. */
export function showToast(scene: Phaser.Scene, text: string, color = '#f0ecff'): void {
  active.get(scene)?.destroy();
  const label = scene.add
    .text(0, 0, text, { fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', fontSize: '20px', fontStyle: 'bold', color, stroke: INK, strokeThickness: 3 })
    .setOrigin(0.5);
  const pillW = label.width + 56;
  const pillH = 52;
  const pill = scene.add.graphics();
  pill.fillStyle(CHROME.woodGrain, 0.95);
  pill.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
  pill.lineStyle(2, CHROME.brass, 0.9);
  pill.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
  const toast = scene.add.container(360, 1100, [pill, label]).setDepth(150);
  active.set(scene, toast);
  scene.tweens.add({
    targets: toast,
    alpha: 0,
    delay: 1100,
    duration: 400,
    onComplete: () => {
      toast.destroy();
      if (active.get(scene) === toast) active.delete(scene);
    },
  });
}
