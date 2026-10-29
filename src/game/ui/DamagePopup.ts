import Phaser from 'phaser';
import type { BigNumber } from '../systems/BigNumber';
import { COLORS } from './theme';

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

  /** `label` shows that text instead of the number (e.g. 無敵 on a blocked hit). */
  pop(x: number, y: number, amount: BigNumber, opts: { crit?: boolean; heal?: boolean; label?: string } = {}): void {
    const entry = this.pool.find((e) => !e.inUse) ?? this.pool[0];
    entry.inUse = true;
    const { text } = entry;
    const crit = !!opts.crit;
    const heal = !!opts.heal;

    text.setText(opts.label ?? (heal ? '+' : '') + amount.toString());
    text.setColor(opts.label ? '#9fe0ff' : heal ? Phaser.Display.Color.ValueToColor(COLORS.heal).rgba : crit ? Phaser.Display.Color.ValueToColor(COLORS.gold).rgba : '#ffffff');
    text.setFontSize(crit ? 40 : 24);
    text.setPosition(x + Phaser.Math.Between(-10, 10), y);
    text.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-6, 6)));
    this.scene.tweens.killTweensOf(text);

    // Squash-and-stretch pop: land wide and flat, then snap up to full size
    // with an elastic overshoot before drifting up and fading - reads as a
    // much punchier hit than a flat scale tween.
    text.setScale(crit ? 0.5 : 0.75, crit ? 0.3 : 0.45);
    text.setAlpha(1);
    text.setVisible(true);

    this.scene.tweens.add({
      targets: text,
      scaleX: crit ? 1.35 : 1.05,
      scaleY: crit ? 1.35 : 1.05,
      duration: 110,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          scaleX: crit ? 1.1 : 1,
          scaleY: crit ? 1.1 : 1,
          y: y - (crit ? 72 : 50),
          rotation: 0,
          duration: 180,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.scene.tweens.add({
              targets: text,
              alpha: 0,
              y: text.y - 22,
              delay: 250,
              duration: 320,
              onComplete: () => {
                entry.inUse = false;
                text.setVisible(false);
              },
            });
          },
        });
      },
    });
  }
}
