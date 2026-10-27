import Phaser from 'phaser';
import type { BigNumber } from '../systems/BigNumber';

/** Top HUD strip showing the player's two currencies. */
export class ResourceBar extends Phaser.GameObjects.Container {
  private goldText: Phaser.GameObjects.Text;
  private gemText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    const bg = scene.add.rectangle(0, 0, width, 56, 0x12131c, 0.92).setOrigin(0, 0).setStrokeStyle(1, 0x2e303a);
    this.goldText = scene.add.text(16, 8, '', { fontSize: '16px', color: '#ffd23f', fontStyle: 'bold' });
    this.gemText = scene.add.text(16, 30, '', { fontSize: '14px', color: '#7cd6ff' });
    this.add([bg, this.goldText, this.gemText]);
    scene.add.existing(this);
  }

  update(gold: BigNumber, gems: number): void {
    this.goldText.setText(`⬤ ${gold.toString()} G`);
    this.gemText.setText(`◆ ${gems.toLocaleString('ja-JP')} 魔晶石`);
  }
}
