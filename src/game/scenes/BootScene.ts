import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { HERO_ROSTER } from '../data/heroes';
import { preloadBackgrounds } from '../ui/Background';
import { preloadButtonAssets } from '../ui/ButtonAssets';
import { heading, caption, COLORS } from '../ui/theme';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Illustration PNGs and background artwork are optional: most heroes
    // and screens won't have one yet, and a missing file must not break the
    // load queue. CharacterGenerator/applyBackground fall back to
    // procedural art or a solid color whenever the texture failed to load.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});

    this.buildLoadingUi();

    for (const hero of HERO_ROSTER) {
      this.load.image(hero.id, `/assets/characters/${hero.id}.png`);
    }
    preloadBackgrounds(this);
    preloadButtonAssets(this);
  }

  create(): void {
    const save = SaveSystem.load();
    this.game.registry.set('save', save);
    this.scene.start('Home');
  }

  private buildLoadingUi(): void {
    this.cameras.main.setBackgroundColor('#0a0b12');
    heading(this, 360, 560, 'ABYRUS', { fontSize: '46px' }).setOrigin(0.5);
    caption(this, 360, 610, '無限算盤の子', { fontSize: '14px' }).setOrigin(0.5);

    const barWidth = 360;
    const barHeight = 10;
    const barY = 690;
    this.add.rectangle(360, barY, barWidth, barHeight, 0x1b1d29, 0.9).setStrokeStyle(1, COLORS.border);
    const fill = this.add.rectangle(360 - barWidth / 2, barY, barWidth, barHeight - 4, COLORS.accentBright).setOrigin(0, 0.5).setScale(0, 1);
    const percentLabel = caption(this, 360, barY + 26, '0%').setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      fill.setScale(value, 1);
      percentLabel.setText(`${Math.round(value * 100)}%`);
    });
  }
}
