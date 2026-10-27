import Phaser from 'phaser';
import type { BigNumber } from '../systems/BigNumber';

interface PoolEntry {
  text: Phaser.GameObjects.Text;
  inUse: boolean;
}

/**
 * Pooled floating damage-number popups. A fixed set of Text objects is
 * created once and reused for every hit, so combat never allocates or
 * destroys game objects at runtime.
 */
export class DamagePopupPool {
  private scene: Phaser.Scene;
  private pool: PoolEntry[] = [];

  constructor(scene: Phaser.Scene, capacity = 24) {
    this.scene = scene;
    for (let i = 0; i < capacity; i++) {
      const text = scene.add
        .text(0, 0, '', {
          fontFamily: 'Arial Black, sans-serif',
          fontSize: '26px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(1000)
        .setVisible(false);
      this.pool.push({ text, inUse: false });
    }
  }

  pop(x: number, y: number, amount: BigNumber, opts: { crit?: boolean; heal?: boolean } = {}): void {
    const entry = this.pool.find((e) => !e.inUse) ?? this.pool[0];
    entry.inUse = true;
    const { text } = entry;
    const crit = !!opts.crit;

    text.setText((opts.heal ? '+' : '') + amount.toString());
    text.setColor(opts.heal ? '#7cfc9a' : crit ? '#ffd23f' : '#ffffff');
    text.setFontSize(crit ? 38 : 24);
    text.setPosition(x + Phaser.Math.Between(-10, 10), y);
    text.setScale(crit ? 0.4 : 0.6);
    text.setAlpha(1);
    text.setVisible(true);

    this.scene.tweens.add({
      targets: text,
      y: y - (crit ? 70 : 50),
      scale: crit ? 1.3 : 1,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          alpha: 0,
          y: text.y - 20,
          delay: 260,
          duration: 300,
          onComplete: () => {
            entry.inUse = false;
            text.setVisible(false);
          },
        });
      },
    });
  }
}
