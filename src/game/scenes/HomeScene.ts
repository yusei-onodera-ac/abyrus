import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ResourceBar } from '../ui/ResourceBar';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { stageNodeIcon, type StageNodeState } from '../ui/Icons';
import { heading, caption, sectionLabel, COLORS } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';

export class HomeScene extends Phaser.Scene {
  private resourceBar!: ResourceBar;

  constructor() {
    super('Home');
  }

  create(): void {
    const save = this.getSave();
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'home');

    const title = heading(this, 360, 100, 'ABYRUS', { fontSize: '52px' }).setOrigin(0.5);
    const subtitle = caption(this, 360, 150, '無限算盤の子', { fontSize: '15px' }).setOrigin(0.5);
    enter(this, title, { dy: -16, duration: 420 });
    enter(this, subtitle, { dy: -10, delay: 90, duration: 360 });

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.resourceBar.update(SaveSystem.getGold(save), save.gems);
    enter(this, this.resourceBar, { dy: -20, duration: 300 });

    this.buildStageMap(save);
    this.buildMenuButtons();
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  private buildStageMap(save: SaveData): void {
    const label = sectionLabel(this, 40, 194, 'ステージ進行');
    enter(this, label, { delay: 60 });

    const perRow = 6;
    const visibleStages = Math.min(ProgressionSystem.STAGE_COUNT, save.stageProgress + 8);
    const nodes: Phaser.GameObjects.Container[] = [];

    const roadPanel = createPanel(this, 360, 250 + Math.floor((visibleStages - 1) / perRow) * 90, 660, Math.ceil(visibleStages / perRow) * 90 + 50, {
      fillColor: COLORS.panelFill,
      fillAlpha: 0.45,
      borderColor: COLORS.border,
      glowColor: COLORS.accent,
      radius: 20,
      gradient: false,
    });
    roadPanel.setDepth(-1);

    const linkLine = this.add.graphics().setDepth(-0.5);

    for (let i = 0; i < visibleStages; i++) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = 70 + col * 100;
      const y = 250 + row * 90;
      const unlocked = i <= save.stageProgress;
      const cleared = i < save.stageProgress;
      const state: StageNodeState = cleared ? 'cleared' : unlocked ? 'unlocked' : 'locked';

      if (i > 0) {
        const prevCol = (i - 1) % perRow;
        const prevRow = Math.floor((i - 1) / perRow);
        const px = 70 + prevCol * 100;
        const py = 250 + prevRow * 90;
        linkLine.lineStyle(3, unlocked ? COLORS.accent : COLORS.border, unlocked ? 0.6 : 0.4);
        linkLine.beginPath();
        linkLine.moveTo(px, py);
        linkLine.lineTo(x, y);
        linkLine.strokePath();
      }

      const node = this.add.container(x, y);
      const icon = this.add.image(0, 0, stageNodeIcon(this, state, 64));
      const numText = this.add
        .text(0, 0, `${i + 1}`, { fontSize: '17px', color: unlocked ? '#ffffff' : '#60627a', fontStyle: 'bold' })
        .setOrigin(0.5);
      node.add([icon, numText]);
      node.setSize(64, 64);
      nodes.push(node);

      if (unlocked) {
        node.setInteractive(new Phaser.Geom.Circle(0, 0, 32), Phaser.Geom.Circle.Contains);
        if (node.input) node.input.cursor = 'pointer';
        node.on('pointerover', () => this.tweens.add({ targets: node, scale: 1.1, duration: 100 }));
        node.on('pointerout', () => this.tweens.add({ targets: node, scale: 1, duration: 120 }));
        node.on('pointerdown', () => this.tweens.add({ targets: node, scale: 0.92, duration: 60 }));
        node.on('pointerup', () => this.scene.start('Battle', { stageIndex: i }));
      }
    }

    enterStagger(this, nodes, { dy: 14, duration: 280, delay: 100, stagger: 18 });
  }

  private buildMenuButtons(): void {
    const buttons: { label: string; scene: string; y: number }[] = [
      { label: '召喚の間', scene: 'Gacha', y: 1070 },
      { label: '英雄名鑑', scene: 'Roster', y: 1150 },
    ];
    const made = buttons.map((b) => new Button(this, 360, b.y, 320, 64, b.label, () => this.scene.start(b.scene), { variant: 'primary' }));
    enterStagger(this, made, { dy: 24, duration: 320, delay: 150, stagger: 70 });
  }
}
