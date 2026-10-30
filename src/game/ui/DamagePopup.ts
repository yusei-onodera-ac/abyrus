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

  /** "CRITICAL!" over a critical number: pops in big, shakes, and is gone with it. */
  private critLabel(x: number, y: number): void {
    const label = this.scene.add
      .text(x, y - 46, 'CRITICAL!', { fontFamily: 'Arial Black, sans-serif', fontSize: '24px', color: '#ffffff', stroke: '#b3220f', strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(1001)
      .setScale(0.3)
      .setRotation(Phaser.Math.DegToRad(-8));
    this.scene.tweens.add({ targets: label, scale: 1.25, rotation: 0, duration: 130, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: label, y: label.y - 36, alpha: 0, delay: 380, duration: 340, onComplete: () => label.destroy() });
  }

  /** `label` shows that text instead of the number (e.g. 無敵 on a blocked hit). */
  pop(x: number, y: number, amount: BigNumber, opts: { crit?: boolean; heal?: boolean; label?: string } = {}): void {
    const entry = this.pool.find((e) => !e.inUse) ?? this.pool[0];
    entry.inUse = true;
    const { text } = entry;
    const crit = !!opts.crit;
    const heal = !!opts.heal;
    if (crit && !opts.label) this.critLabel(x, y);

    text.setText(opts.label ?? (heal ? '+' : '') + amount.toString());
    text.setColor(opts.label ? '#9fe0ff' : heal ? Phaser.Display.Color.ValueToColor(COLORS.heal).rgba : crit ? Phaser.Display.Color.ValueToColor(COLORS.gold).rgba : '#ffffff');
    text.setStroke(crit ? '#b3220f' : heal ? '#0f5a2a' : '#1c130a', crit ? 9 : 6);
    text.setFontSize(crit ? 58 : 32);
    text.setPosition(x + Phaser.Math.Between(-10, 10), y);
    text.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-6, 6)));
    this.scene.tweens.killTweensOf(text);

    // Squash-and-stretch pop: land wide and flat, then snap up to full size
    // with an elastic overshoot before drifting up and fading - reads as a
    // much punchier hit than a flat scale tween.
    text.setScale(crit ? 0.4 : 0.7, crit ? 0.2 : 0.4);
    text.setAlpha(1);
    text.setVisible(true);

    this.scene.tweens.add({
      targets: text,
      scaleX: crit ? 1.7 : 1.2,
      scaleY: crit ? 1.7 : 1.2,
      duration: 100,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          scaleX: crit ? 1.2 : 1,
          scaleY: crit ? 1.2 : 1,
          y: y - (crit ? 96 : 64),
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
