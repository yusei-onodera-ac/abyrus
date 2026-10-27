import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { GachaSystem, GACHA_RATES, SINGLE_PULL_COST, TEN_PULL_COST } from '../systems/GachaSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { ResourceBar } from '../ui/ResourceBar';
import { HeroCard } from '../ui/HeroCard';
import { RARITY_COLORS, hex, type HeroData } from '../types';

export class GachaScene extends Phaser.Scene {
  private generator!: CharacterGenerator;
  private resourceBar!: ResourceBar;
  private resultContainer?: Phaser.GameObjects.Container;

  constructor() {
    super('Gacha');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    this.cameras.main.setBackgroundColor('#171427');

    this.add.text(360, 60, '召喚の間', { fontSize: '30px', color: '#f1e3ff' }).setOrigin(0.5);
    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.refreshResources();

    this.buildRateTable();
    this.buildButtons();
    this.buildBackButton();
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  private refreshResources(): void {
    const save = this.getSave();
    this.resourceBar.update(SaveSystem.getGold(save), save.gems);
  }

  private buildRateTable(): void {
    this.add.text(40, 130, '排出率(景品表示法対応・表示義務あり)', { fontSize: '13px', color: '#9a93b8' });
    let y = 155;
    for (const entry of GACHA_RATES) {
      this.add.text(50, y, '★'.repeat(entry.rarity), { fontSize: '13px', color: hex(RARITY_COLORS[entry.rarity]) });
      this.add.text(200, y, `${(entry.rate * 100).toFixed(1)}%`, { fontSize: '13px', color: '#ffffff' });
      y += 20;
    }
  }

  private buildButtons(): void {
    const makeButton = (label: string, y: number, cost: number, count: number) => {
      const bg = this.add.rectangle(360, y, 320, 64, 0x3a2d5c).setStrokeStyle(2, 0x8a6fd6).setInteractive({ useHandCursor: true });
      this.add.text(360, y - 10, label, { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
      this.add.text(360, y + 14, `${cost} 魔晶石`, { fontSize: '13px', color: '#c9b8ff' }).setOrigin(0.5);
      bg.on('pointerdown', () => this.doPull(count, cost));
    };
    makeButton('1連召喚', 320, SINGLE_PULL_COST, 1);
    makeButton('10連召喚', 400, TEN_PULL_COST, 10);
  }

  private buildBackButton(): void {
    const bg = this.add.rectangle(80, 1200, 120, 48, 0x2a2c3d).setStrokeStyle(2, 0x4a4d66).setInteractive({ useHandCursor: true });
    this.add.text(80, 1200, '戻る', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerdown', () => this.scene.start('Home'));
  }

  private doPull(count: number, cost: number): void {
    const save = this.getSave();
    if (!SaveSystem.spendGems(save, cost)) {
      this.flashMessage('魔晶石が足りません');
      return;
    }
    const results = GachaSystem.pullMany(count);
    for (const hero of results) SaveSystem.addHero(save, hero);
    SaveSystem.save(save);
    this.refreshResources();
    this.showResults(results);
  }

  private flashMessage(text: string): void {
    const msg = this.add.text(360, 460, text, { fontSize: '16px', color: '#ff8080' }).setOrigin(0.5);
    this.tweens.add({ targets: msg, alpha: 0, delay: 900, duration: 400, onComplete: () => msg.destroy() });
  }

  private showResults(results: HeroData[]): void {
    this.resultContainer?.destroy();
    const container = this.add.container(0, 0);
    this.resultContainer = container;
    const overlay = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.75).setInteractive();
    container.add(overlay);

    const cols = Math.min(5, results.length);
    const rows = Math.ceil(results.length / cols);
    const startY = 640 - (rows - 1) * 90;

    results.forEach((hero, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 360 - ((cols - 1) * 140) / 2 + col * 140;
      const y = startY + row * 180;
      const card = new HeroCard(this, x, y, hero, this.generator, 110);
      card.setScale(0);
      container.add(card);
      this.tweens.add({
        targets: card,
        scale: 1,
        duration: 350,
        delay: 120 * i,
        ease: 'Back.easeOut',
        onStart: () => {
          if (hero.rarity >= 4) this.cameras.main.flash(150, 255, 230, 150, false);
        },
      });
    });

    const closeBtn = this.add.rectangle(360, 1180, 200, 56, 0x3a2d5c).setStrokeStyle(2, 0x8a6fd6).setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(360, 1180, '閉じる', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    container.add([closeBtn, closeTxt]);
    closeBtn.on('pointerdown', () => {
      container.destroy();
      this.resultContainer = undefined;
    });
  }
}
