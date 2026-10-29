import Phaser from 'phaser';
import { CHROME } from './theme';

const W = 156;
const H = 64;
const INK = '#2a0808';
/** Bottom nav bar top edge (BottomNavBar is 124 tall on a 1280 canvas), and the gap kept above it. */
const BAR_TOP = 1156;
const GAP = 10;
const DEFAULT_Y = BAR_TOP - GAP - H / 2;

/** Drawn entirely from code: a red tab that sticks out of the left screen edge
 *  with a ◀ and 戻る, the way the reference's formation screen has it just
 *  above the bottom bar. Scales about its (screen-edge) origin when pressed,
 *  so it stays attached to the edge. */
export class BackButton extends Phaser.GameObjects.Container {
  /** Vertical space a list should leave clear at its end so its last items
   *  can be scrolled out from under this button. */
  static readonly ROOM = H + GAP + 14;

  constructor(scene: Phaser.Scene, onTap: () => void, y = DEFAULT_Y) {
    super(scene, 0, y);

    // The body starts left of the screen edge so only its right corners show as rounded.
    const bleed = 20;
    const radius = 18;
    const body = scene.add.graphics();
    body.fillStyle(0x000000, 0.35);
    body.fillRoundedRect(-bleed, -H / 2 + 4, W + bleed, H, radius);
    body.fillStyle(0xb3262e, 1);
    body.fillRoundedRect(-bleed, -H / 2, W + bleed, H, radius);
    body.fillStyle(0xffffff, 0.2);
    body.fillRoundedRect(-bleed + 3, -H / 2 + 3, W + bleed - 6, H / 2 - 3, { tl: 0, tr: radius - 3, bl: 0, br: 2 });
    body.lineStyle(3, CHROME.brassBright, 1);
    body.strokeRoundedRect(-bleed, -H / 2, W + bleed, H, radius);
    body.lineStyle(1.5, 0x5a0f14, 0.9);
    body.strokeRoundedRect(-bleed + 3, -H / 2 + 3, W + bleed - 6, H - 6, radius - 3);
    this.add(body);

    // ◀ drawn as a triangle so it doesn't depend on a font having the glyph.
    const arrow = scene.add.graphics();
    arrow.fillStyle(0xffffff, 1);
    arrow.lineStyle(3, 0x3a0a0a, 1);
    arrow.beginPath();
    arrow.moveTo(40, -15);
    arrow.lineTo(40, 15);
    arrow.lineTo(18, 0);
    arrow.closePath();
    arrow.fillPath();
    arrow.strokePath();
    this.add(arrow);

    this.add(
      scene.add
        .text(94, 0, '戻る', { fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', fontSize: '29px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 })
        .setOrigin(0.5),
    );

    const hit = scene.add.zone(W / 2, 0, W, H).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    const tweenTo = (scale: number, duration: number) => scene.tweens.add({ targets: this, scale, duration, ease: 'Sine.easeOut' });
    hit.on('pointerover', () => tweenTo(1.05, 110));
    hit.on('pointerout', () => tweenTo(1, 140));
    hit.on('pointerdown', () => tweenTo(0.94, 70));
    hit.on('pointerup', () => {
      tweenTo(1.05, 90);
      onTap();
    });
    this.add(hit);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.tweens.killTweensOf(this));

    // Above the bottom bar (100), below popups (200).
    this.setDepth(120);
    scene.add.existing(this);
  }
}
