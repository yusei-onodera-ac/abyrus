import Phaser from 'phaser';
import { SoundSystem } from '../systems/SoundSystem';
import { CHROME, body } from './theme';

/** A fight's controls (オート / 2倍速) are two small round buttons at the bottom right, just above
 *  the party bar's panel: within thumb's reach, and small enough to stay out of the fight's way. */
export const BATTLE_CONTROL_POS = { auto: { x: 668, y: 984 }, speed: { x: 588, y: 984 } };
const R = 36;
const INK = '#1c130a';

/**
 * One of those buttons: a brass-rimmed disc with a short label and, under it, its state (ON /
 * OFF, or パス限定 for a pass-only feature). Lit orange while ON, dark wood while OFF.
 */
export class RoundControl extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, label: string, status: string, on: boolean, onClick: () => void) {
    super(scene, 0, 0);

    const disc = scene.add.graphics();
    disc.fillStyle(0x000000, 0.35);
    disc.fillCircle(2, 4, R);
    disc.fillStyle(on ? 0xe0822a : 0x2a1b0e, 1);
    disc.fillCircle(0, 0, R);
    disc.lineStyle(2, on ? 0xffe9b8 : CHROME.brassDark, 0.75);
    disc.strokeCircle(0, 0, R - 5);
    disc.lineStyle(3, on ? CHROME.brassBright : CHROME.brass, 1);
    disc.strokeCircle(0, 0, R);
    disc.fillStyle(0xffffff, on ? 0.2 : 0.08);
    disc.fillEllipse(0, -R * 0.46, R * 1.3, R * 0.62);
    this.add(disc);

    const main = body(scene, 0, -6, label, {
      fontSize: label.length <= 2 ? '25px' : '20px',
      fontStyle: 'bold',
      color: on ? '#ffffff' : '#ffe9b8',
      stroke: on ? '#4a2406' : INK,
      strokeThickness: 4,
    }).setOrigin(0.5);
    const sub = body(scene, 0, 17, status, { fontSize: '12px', fontStyle: 'bold', color: on ? '#fff0cc' : '#d8c49a', stroke: on ? '#4a2406' : INK, strokeThickness: 3 }).setOrigin(0.5);
    this.add([main, sub]);

    const zone = scene.add.zone(0, 0, R * 2, R * 2).setOrigin(0.5);
    zone.setInteractive({ useHandCursor: true });
    const scaleTo = (scale: number, duration: number): void => {
      scene.tweens.add({ targets: this, scale, duration, ease: 'Sine.easeOut' });
    };
    zone.on('pointerdown', () => scaleTo(0.9, 70));
    zone.on('pointerout', () => scaleTo(1, 130));
    zone.on('pointerup', () => {
      scaleTo(1.05, 90);
      SoundSystem.play(scene, 'tap');
      onClick();
    });
    this.add(zone);
    this.setSize(R * 2, R * 2);

    scene.add.existing(this);
  }
}
