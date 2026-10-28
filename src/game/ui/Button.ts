import Phaser from 'phaser';
import { createPanel, type PanelOptions } from './Panel';
import { buttonLabel, buttonSubLabel, COLORS } from './theme';
import { hasButtonAsset, buttonAssetKeys } from './ButtonAssets';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_PANEL: Record<ButtonVariant, PanelOptions> = {
  primary: { fillColor: 0x3a2d5c, borderColor: COLORS.accent, glowColor: COLORS.accent, radius: 16 },
  secondary: { fillColor: 0x2a2c3d, borderColor: COLORS.borderLight, glowColor: COLORS.borderLight, radius: 14 },
  ghost: { fillColor: COLORS.panelFill, fillAlpha: 0.55, borderColor: COLORS.border, glowColor: COLORS.border, radius: 12 },
  danger: { fillColor: 0x4a2630, borderColor: 0xb84f4f, glowColor: 0xb84f4f, radius: 14 },
};

export interface ButtonOptions {
  variant?: ButtonVariant;
  /** Small caption drawn under the main label, e.g. a gem cost. */
  subLabel?: string;
  fontSize?: string;
}

/** Interactive button: panel background + label, with hover/press scale and
 *  tint tweens so every tappable control in the game gives the same tactile
 *  feedback instead of sitting dead until released. */
export class Button extends Phaser.GameObjects.Container {
  private hitZone: Phaser.GameObjects.Zone;
  private disabled = false;
  /** Set only when this variant has a supplied normal/pressed skin; the
   *  procedural Panel background is used otherwise. */
  private normalSkin?: Phaser.GameObjects.Image;
  private pressedSkin?: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const variant = opts.variant ?? 'secondary';

    if (hasButtonAsset(scene, variant)) {
      const { normal, pressed } = buttonAssetKeys(variant);
      // setDisplaySize(width, height) assumes the skin art's aspect ratio
      // matches the button's own width:height exactly; it rarely does, so
      // forcing both axes distorted the art. Scale uniformly to fit within
      // the button's footprint instead, preserving the art's aspect ratio.
      // normal/pressed are separate source images at their own native
      // resolutions, so each needs its own fit scale.
      const normalFrame = scene.textures.get(normal).getSourceImage();
      const pressedFrame = scene.textures.get(pressed).getSourceImage();
      const normalScale = Math.min(width / normalFrame.width, height / normalFrame.height);
      const pressedScale = Math.min(width / pressedFrame.width, height / pressedFrame.height);
      this.normalSkin = scene.add.image(0, 0, normal).setScale(normalScale);
      this.pressedSkin = scene.add.image(0, 0, pressed).setScale(pressedScale).setVisible(false);
      this.add([this.normalSkin, this.pressedSkin]);
    } else {
      const panel = createPanel(scene, 0, 0, width, height, VARIANT_PANEL[variant]);
      this.add(panel);
    }

    const hasSub = !!opts.subLabel;
    const label1 = buttonLabel(scene, 0, hasSub ? -11 : 0, label, opts.fontSize ? { fontSize: opts.fontSize } : undefined).setOrigin(0.5);
    this.add(label1);
    if (hasSub) {
      const label2 = buttonSubLabel(scene, 0, 15, opts.subLabel!).setOrigin(0.5);
      this.add(label2);
    }

    this.hitZone = scene.add.zone(0, 0, width, height).setOrigin(0.5);
    this.add(this.hitZone);
    this.setSize(width, height);

    this.hitZone.setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerover', () => this.animateTo(1.04, 110));
    this.hitZone.on('pointerout', () => {
      this.setPressedSkin(false);
      this.animateTo(1, 140);
    });
    this.hitZone.on('pointerdown', () => {
      this.setPressedSkin(true);
      this.animateTo(0.94, 70);
    });
    this.hitZone.on('pointerup', () => {
      this.setPressedSkin(false);
      if (this.disabled) return;
      this.animateTo(1.04, 90);
      onClick();
    });

    scene.add.existing(this);
  }

  private animateTo(scale: number, duration: number): void {
    if (this.disabled) return;
    this.scene.tweens.add({ targets: this, scale, duration, ease: 'Sine.easeOut' });
  }

  private setPressedSkin(pressed: boolean): void {
    if (!this.normalSkin || !this.pressedSkin) return;
    this.normalSkin.setVisible(!pressed);
    this.pressedSkin.setVisible(pressed);
  }

  setEnabled(enabled: boolean): this {
    this.disabled = !enabled;
    if (this.hitZone.input) this.hitZone.input.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    return this;
  }
}
