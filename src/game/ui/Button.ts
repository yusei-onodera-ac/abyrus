import Phaser from 'phaser';
import { createPanel, type PanelOptions } from './Panel';
import { buttonLabel, buttonSubLabel, COLORS, CHROME } from './theme';
import { hasButtonAsset, buttonAssetKeys } from './ButtonAssets';

/** primary/secondary/ghost/danger are the original purple-palette set.
 *  gold = main call-to-action on wood/brass screens; wood = the muted
 *  utility button that sits beside it (one shared color, per the UI
 *  direction: bright color is for the main CTA only). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'wood';

const VARIANT_PANEL: Record<ButtonVariant, PanelOptions> = {
  primary: { fillColor: 0x3a2d5c, borderColor: COLORS.accent, glowColor: COLORS.accent, radius: 16 },
  secondary: { fillColor: 0x2a2c3d, borderColor: COLORS.borderLight, glowColor: COLORS.borderLight, radius: 14 },
  ghost: { fillColor: COLORS.panelFill, fillAlpha: 0.55, borderColor: COLORS.border, glowColor: COLORS.border, radius: 12 },
  danger: { fillColor: 0x4a2630, borderColor: 0xb84f4f, glowColor: 0xb84f4f, radius: 14 },
  // Flat fills: Panel's gradient sheen draws a visible diagonal seam on a
  // fill this bright. The gloss strip below stands in for it.
  gold: { fillColor: 0xe0822a, fillAlpha: 1, borderColor: CHROME.brassBright, glowColor: CHROME.brassBright, radius: 14, gradient: false },
  wood: { fillColor: 0x3d2a18, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brass, radius: 12, gradient: false },
};

/** Alpha of a white highlight laid over the top half of the button. */
const VARIANT_GLOSS: Partial<Record<ButtonVariant, number>> = { gold: 0.2, wood: 0.1 };

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** Variants drawn on top of illustrated/wood chrome need a dark outline to
 *  stay legible on their bright or textured fills; the purple set doesn't. */
const VARIANT_TEXT: Partial<Record<ButtonVariant, { label: TextStyle; sub: TextStyle }>> = {
  gold: {
    label: { color: '#ffffff', stroke: '#4a2406', strokeThickness: 5 },
    sub: { fontSize: '18px', fontStyle: 'bold', color: '#fff0cc', stroke: '#4a2406', strokeThickness: 4 },
  },
  wood: {
    label: { color: '#ffe9b8', stroke: '#1c130a', strokeThickness: 4 },
    sub: { fontSize: '16px', color: '#d8c49a', stroke: '#1c130a', strokeThickness: 3 },
  },
};

export interface ButtonOptions {
  variant?: ButtonVariant;
  /** Small caption drawn under the main label, e.g. a gem cost. */
  subLabel?: string;
  fontSize?: string;
  /** Checked on release; returning false swallows the click. Lets a button
   *  inside a scrolling list ignore the release that ends a drag. */
  guard?: () => boolean;
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
      const gloss = VARIANT_GLOSS[variant];
      if (gloss) {
        const r = (VARIANT_PANEL[variant].radius ?? 14) - 3;
        const highlight = scene.add.graphics();
        highlight.fillStyle(0xffffff, gloss);
        highlight.fillRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height / 2 - 4, { tl: r, tr: r, bl: 2, br: 2 });
        this.add(highlight);
      }
    }

    const hasSub = !!opts.subLabel;
    const variantText = VARIANT_TEXT[variant];
    const labelStyle = { ...variantText?.label, ...(opts.fontSize ? { fontSize: opts.fontSize } : {}) };
    const label1 = buttonLabel(scene, 0, hasSub ? -11 : 0, label, labelStyle).setOrigin(0.5);
    this.add(label1);
    if (hasSub) {
      const label2 = buttonSubLabel(scene, 0, 15, opts.subLabel!, variantText?.sub).setOrigin(0.5);
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
      if (opts.guard && !opts.guard()) return;
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
