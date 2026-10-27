import Phaser from 'phaser';
import type { BigNumber } from '../systems/BigNumber';
import { createPanel } from './Panel';
import { coinIcon, gemIcon } from './Icons';
import { COLORS } from './theme';

/** Top HUD strip showing the player's two currencies, with coin/gem icons
 *  instead of plain text glyphs and a glass-panel body for depth. */
export class ResourceBar extends Phaser.GameObjects.Container {
  private goldText: Phaser.GameObjects.Text;
  private gemText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    const height = 64;

    const panel = createPanel(scene, width / 2, height / 2, width, height, {
      fillColor: COLORS.panelFill,
      fillAlpha: 0.95,
      borderColor: COLORS.border,
      glowColor: COLORS.accent,
      radius: 16,
    });

    const goldIcon = scene.add.image(34, 20, coinIcon(scene, 26));
    const gemIconImg = scene.add.image(34, 46, gemIcon(scene, 22));

    this.goldText = scene.add
      .text(54, 20, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffe79a', fontStyle: 'bold' })
      .setOrigin(0, 0.5);
    this.gemText = scene.add
      .text(54, 46, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#bfeaff' })
      .setOrigin(0, 0.5);

    this.add([panel, goldIcon, gemIconImg, this.goldText, this.gemText]);
    scene.add.existing(this);
  }

  update(gold: BigNumber, gems: number): void {
    this.goldText.setText(`${gold.toString()} G`);
    this.gemText.setText(`${gems.toLocaleString('ja-JP')} 魔晶石`);
  }
}
