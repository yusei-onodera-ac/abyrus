import Phaser from 'phaser';
import type { BigNumber } from '../systems/BigNumber';
import { createPanel } from './Panel';
import { coinIcon, gemIcon } from './Icons';
import { COLORS } from './theme';

/** Top HUD strip showing the player's two currencies. Uses the supplied
 *  "topbar" artwork (circular portrait frame + ABYRUS plate + wood plank)
 *  when loaded, laying the gold/gem readout into the open plank area to
 *  the right of the plate; falls back to a plain glass panel otherwise. */
export class ResourceBar extends Phaser.GameObjects.Container {
  private goldText: Phaser.GameObjects.Text;
  private gemText: Phaser.GameObjects.Text;
  /** True when the real topbar artwork is in use, so callers (HomeScene's
   *  separate "ABYRUS" wordmark) can skip anything the art already shows. */
  readonly hasArt: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.hasArt = scene.textures.exists('topbar');

    let height: number;
    let goldPos: { x: number; y: number };
    let gemPos: { x: number; y: number };

    if (this.hasArt) {
      const frame = scene.textures.get('topbar').getSourceImage();
      height = width / (frame.width / frame.height);
      const bg = scene.add.image(0, 0, 'topbar').setOrigin(0, 0).setDisplaySize(width, height);
      this.add(bg);
      // The art's circular portrait frame + ABYRUS plate occupy roughly the
      // left 60% of the bar; the open wood-plank area to the right of that
      // is where the currency readout goes.
      goldPos = { x: width * 0.635, y: height * 0.42 };
      gemPos = { x: width * 0.635, y: height * 0.67 };
    } else {
      height = 64;
      const panel = createPanel(scene, width / 2, height / 2, width, height, {
        fillColor: COLORS.panelFill,
        fillAlpha: 0.95,
        borderColor: COLORS.border,
        glowColor: COLORS.accent,
        radius: 16,
      });
      this.add(panel);
      goldPos = { x: 34, y: 20 };
      gemPos = { x: 34, y: 46 };
    }

    const goldIconSize = this.hasArt ? 24 : 26;
    const gemIconSize = this.hasArt ? 20 : 22;
    const goldIcon = scene.add.image(goldPos.x, goldPos.y, coinIcon(scene, goldIconSize));
    const gemIconImg = scene.add.image(gemPos.x, gemPos.y, gemIcon(scene, gemIconSize));

    const textOffset = this.hasArt ? 18 : 20;
    this.goldText = scene.add
      .text(goldPos.x + textOffset, goldPos.y, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffe79a', fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.gemText = scene.add
      .text(gemPos.x + textOffset, gemPos.y, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#bfeaff' })
      .setOrigin(0, 0.5);

    this.add([goldIcon, gemIconImg, this.goldText, this.gemText]);
    scene.add.existing(this);
  }

  update(gold: BigNumber, gems: number): void {
    this.goldText.setText(`${gold.toString()} G`);
    this.gemText.setText(`${gems.toLocaleString('ja-JP')} 魔晶石`);
  }
}
