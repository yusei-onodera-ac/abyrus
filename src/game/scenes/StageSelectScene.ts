import Phaser from 'phaser';
import type { SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { BackButton } from '../ui/BackButton';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { stageNodeIcon, type StageNodeState } from '../ui/Icons';
import { heading, sectionLabel, COLORS } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';

/** Full-screen stage/quest picker, split out of HomeScene so the home
 *  screen itself can stay a character-first hub instead of a level-select
 *  grid - matching how commercial gacha-RPG home screens separate "go on
 *  an adventure" from the hub itself. */
export class StageSelectScene extends Phaser.Scene {
  constructor() {
    super('StageSelect');
  }

  create(): void {
    const save = this.getSave();
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'stage_select');

    const title = heading(this, 360, 60, 'ステージ選択', { fontSize: '30px' }).setOrigin(0.5);
    enter(this, title, { dy: -14, duration: 340 });

    this.buildBackButton();
    this.buildStageMap(save);
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  private buildBackButton(): void {
    enter(this, new BackButton(this, () => this.scene.start('Home')), { dx: -40, dy: 0, duration: 300, delay: 150 });
  }

  private buildStageMap(save: SaveData): void {
    const label = sectionLabel(this, 40, 130, 'ステージ進行');
    enter(this, label, { delay: 60 });

    const perRow = 6;
    const visibleStages = Math.min(ProgressionSystem.STAGE_COUNT, save.stageProgress + 8);
    const nodes: Phaser.GameObjects.Container[] = [];

    const roadPanel = createPanel(this, 360, 186 + Math.floor((visibleStages - 1) / perRow) * 90, 660, Math.ceil(visibleStages / perRow) * 90 + 50, {
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
      const y = 186 + row * 90;
      const unlocked = i <= save.stageProgress;
      const cleared = i < save.stageProgress;
      const state: StageNodeState = cleared ? 'cleared' : unlocked ? 'unlocked' : 'locked';

      if (i > 0) {
        const prevCol = (i - 1) % perRow;
        const prevRow = Math.floor((i - 1) / perRow);
        const px = 70 + prevCol * 100;
        const py = 186 + prevRow * 90;
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
        // Container hit-testing (Phaser InputManager.pointWithinHitArea)
        // adds displayOriginX/Y (half width/height) to the local point
        // before testing it against the hit area shape, so the circle must
        // be centered at (halfW, halfH) - top-left-relative space - rather
        // than at the container's own local (0, 0), or real taps on the
        // node (which looks centered on (0, 0)) mostly miss it.
        node.setInteractive(new Phaser.Geom.Circle(32, 32, 32), Phaser.Geom.Circle.Contains);
        if (node.input) node.input.cursor = 'pointer';
        node.on('pointerover', () => this.tweens.add({ targets: node, scale: 1.1, duration: 100 }));
        node.on('pointerout', () => this.tweens.add({ targets: node, scale: 1, duration: 120 }));
        node.on('pointerdown', () => this.tweens.add({ targets: node, scale: 0.92, duration: 60 }));
        node.on('pointerup', () => this.scene.start('Battle', { stageIndex: i }));
      }
    }

    enterStagger(this, nodes, { dy: 14, duration: 280, delay: 100, stagger: 18 });
  }
}
