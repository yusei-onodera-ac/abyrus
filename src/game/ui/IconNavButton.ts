import Phaser from 'phaser';
import { caption } from './theme';

/** Round icon + small label nav button, used for the home screen's icon
 *  cluster (quest / gacha / roster) instead of a stacked list of long
 *  rectangle buttons. Hit-tests through a plain `Zone` with Phaser's
 *  auto-generated rectangle hit area (the same proven approach `Button`
 *  uses) rather than a custom circle shape, since a circular hit area on a
 *  Container needs its coordinates defined relative to the container's
 *  top-left - not its visual center - to line up with where Phaser's
 *  InputManager actually tests it; a plain square zone sized to the icon's
 *  footprint sidesteps that pitfall entirely while still feeling "round"
 *  to the player, since the icon art itself is a circular badge. */
export class IconNavButton extends Phaser.GameObjects.Container {
  private hitZone: Phaser.GameObjects.Zone;
  private disabled = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    textureKey: string,
    label: string,
    size: number,
    onClick: () => void,
  ) {
    super(scene, x, y);

    const icon = scene.add.image(0, 0, textureKey).setDisplaySize(size, size);
    const labelText = caption(scene, 0, size / 2 + 16, label, { fontSize: '13px', color: '#ffffff' }).setOrigin(0.5);
    this.add([icon, labelText]);

    this.hitZone = scene.add.zone(0, 0, size, size).setOrigin(0.5);
    this.add(this.hitZone);
    this.setSize(size, size + 30);

    this.hitZone.setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerover', () => this.animateTo(1.08, 110));
    this.hitZone.on('pointerout', () => this.animateTo(1, 140));
    this.hitZone.on('pointerdown', () => this.animateTo(0.92, 70));
    this.hitZone.on('pointerup', () => {
      if (this.disabled) return;
      this.animateTo(1.08, 90);
      onClick();
    });

    scene.add.existing(this);
  }

  private animateTo(scale: number, duration: number): void {
    if (this.disabled) return;
    this.scene.tweens.add({ targets: this, scale, duration, ease: 'Sine.easeOut' });
  }
}
