import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ResourceBar } from '../ui/ResourceBar';

export class HomeScene extends Phaser.Scene {
  private resourceBar!: ResourceBar;

  constructor() {
    super('Home');
  }

  create(): void {
    const save = this.getSave();
    this.cameras.main.setBackgroundColor('#10121c');

    this.add.text(360, 90, 'ABYRUS', { fontFamily: 'Georgia, serif', fontSize: '52px', color: '#e8d9ff' }).setOrigin(0.5);
    this.add.text(360, 140, '無限算盤の子', { fontSize: '16px', color: '#8f88a8' }).setOrigin(0.5);

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.resourceBar.update(SaveSystem.getGold(save), save.gems);

    this.buildStageMap(save);
    this.buildMenuButtons();
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  private buildStageMap(save: SaveData): void {
    this.add.text(40, 190, 'ステージ進行', { fontSize: '18px', color: '#ffffff' });
    const perRow = 6;
    const visibleStages = Math.min(ProgressionSystem.STAGE_COUNT, save.stageProgress + 8);
    for (let i = 0; i < visibleStages; i++) {
      const col = i % perRow;
      const rowIdx = Math.floor(i / perRow);
      const x = 70 + col * 100;
      const y = 250 + rowIdx * 90;
      const unlocked = i <= save.stageProgress;
      const cleared = i < save.stageProgress;
      const node = this.add
        .circle(x, y, 32, unlocked ? (cleared ? 0x2f7a4d : 0x3b5fc4) : 0x2a2b36)
        .setStrokeStyle(2, unlocked ? 0xffffff : 0x44465a);
      this.add.text(x, y, `${i + 1}`, { fontSize: '16px', color: unlocked ? '#ffffff' : '#60627a' }).setOrigin(0.5);
      if (unlocked) {
        node.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.scene.start('Battle', { stageIndex: i });
        });
      }
    }
  }

  private buildMenuButtons(): void {
    const buttons: { label: string; scene: string; y: number }[] = [
      { label: '召喚の間', scene: 'Gacha', y: 1060 },
      { label: '英雄名鑑', scene: 'Roster', y: 1130 },
    ];
    for (const b of buttons) {
      const bg = this.add.rectangle(360, b.y, 300, 56, 0x2a2c3d).setStrokeStyle(2, 0x4a4d66).setInteractive({ useHandCursor: true });
      this.add.text(360, b.y, b.label, { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
      bg.on('pointerdown', () => this.scene.start(b.scene));
    }
  }
}
