import Phaser from 'phaser';
import { caption } from './theme';
import { hasIconAsset, iconAssetKeys, type IconAssetName } from './IconAssets';

/** Round icon + small label nav button, used for the home screen's icon
 *  cluster (quest / gacha / roster) instead of a stacked list of long
 *  rectangle buttons. Hit-tests through a plain `Zone` with Phaser's
 *  auto-generated rectangle hit area (the same proven approach `Button`
 *  uses) rather than a custom circle shape, since a circular hit area on a
 *  Container needs its coordinates defined relative to the container's
 *  top-left - not its visual center - to line up with where Phaser's
 *  InputManager actually tests it; a plain square zone sized to the icon's
 *  footprint sidesteps that pitfall entirely while still feeling "round"
 *  to the player, since the icon art itself is a circular badge.
 *
 *  Uses supplied normal/pressed artwork (ButtonAssets/IconAssets pattern)
 *  when both halves exist for `iconName`, falling back to the procedural
 *  badge texture (`fallbackTextureKey`) otherwise. */
export class IconNavButton extends Phaser.GameObjects.Container {
  private hitZone: Phaser.GameObjects.Zone;
  private disabled = false;
  /** Set only when this icon has supplied normal/pressed artwork; the
   *  procedural badge image is used otherwise. */
  private normalIcon?: Phaser.GameObjects.Image;
  private pressedIcon?: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    iconName: IconAssetName,
    fallbackTextureKey: string,
    label: string,
    size: number,
    onClick: () => void,
  ) {
    super(scene, x, y);

    const hasArt = hasIconAsset(scene, iconName);
    if (hasArt) {
      const { normal, pressed } = iconAssetKeys(iconName);
      // setDisplaySize(size, size) assumes a square source texture; the
      // supplied badge art isn't pixel-square, so forcing both axes to the
      // same value squashed it. Scale uniformly to fit within size x size
      // instead, preserving the art's own aspect ratio. normal/pressed are
      // separate source images at their own (often very different) native
      // resolutions, so each needs its own fit scale - reusing one scale
      // for both made the badge visibly jump size on press.
      const normalFrame = scene.textures.get(normal).getSourceImage();
      const pressedFrame = scene.textures.get(pressed).getSourceImage();
      const normalScale = Math.min(size / normalFrame.width, size / normalFrame.height);
      const pressedScale = Math.min(size / pressedFrame.width, size / pressedFrame.height);
      this.normalIcon = scene.add.image(0, 0, normal).setScale(normalScale);
      this.pressedIcon = scene.add.image(0, 0, pressed).setScale(pressedScale).setVisible(false);
      this.add([this.normalIcon, this.pressedIcon]);
    } else {
      this.add(scene.add.image(0, 0, fallbackTextureKey).setDisplaySize(size, size));
    }

    // Supplied icon art already has its label baked in (e.g. "クエスト"
    // lettering drawn into the diamond badge); only add a separate caption
    // for the procedural fallback, which is just a bare badge shape.
    if (!hasArt) {
      const labelText = caption(scene, 0, size / 2 + 16, label, { fontSize: '13px', color: '#ffffff' }).setOrigin(0.5);
      this.add(labelText);
    }

    this.hitZone = scene.add.zone(0, 0, size, size).setOrigin(0.5);
    this.add(this.hitZone);
    this.setSize(size, size + 30);

    this.hitZone.setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerover', () => this.animateTo(1.08, 110));
    this.hitZone.on('pointerout', () => {
      this.setPressedIcon(false);
      this.animateTo(1, 140);
    });
    this.hitZone.on('pointerdown', () => {
      this.setPressedIcon(true);
      this.animateTo(0.92, 70);
    });
    this.hitZone.on('pointerup', () => {
      this.setPressedIcon(false);
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

  private setPressedIcon(pressed: boolean): void {
    if (!this.normalIcon || !this.pressedIcon) return;
    this.normalIcon.setVisible(!pressed);
    this.pressedIcon.setVisible(pressed);
  }
}
