import Phaser from 'phaser';
import { SaveSystem, type SaveData, type HeroPullOutcome } from '../systems/SaveSystem';
import { GachaSystem, GACHA_RATES, SINGLE_PULL_COST, TEN_PULL_COST } from '../systems/GachaSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { ResourceBar } from '../ui/ResourceBar';
import { HeroCard } from '../ui/HeroCard';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { heading, caption, numeric, COLORS } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';
import { RARITY_COLORS, hex } from '../types';

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
    applyBackground(this, 'gacha');

    const title = heading(this, 360, 60, '召喚の間', { fontSize: '32px' }).setOrigin(0.5);
    enter(this, title, { dy: -14, duration: 360 });

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.refreshResources();
    enter(this, this.resourceBar, { dy: -20, duration: 280 });

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
    const panelTop = 118;
    const rowH = 26;
    const panelH = 46 + GACHA_RATES.length * rowH;
    const panel = createPanel(this, 360, panelTop + panelH / 2, 640, panelH, { fillAlpha: 0.78, radius: 16, gradient: false });
    enter(this, panel, { delay: 60, dy: 10 });

    caption(this, 360, panelTop + 18, '排出率(景品表示法対応・表示義務あり)').setOrigin(0.5);
    let y = panelTop + 44;
    for (const entry of GACHA_RATES) {
      this.add.text(110, y, '★'.repeat(entry.rarity), { fontSize: '14px', color: hex(RARITY_COLORS[entry.rarity]) }).setOrigin(0, 0.5);
      numeric(this, 610, y, `${(entry.rate * 100).toFixed(1)}%`, { fontSize: '15px' }).setOrigin(1, 0.5);
      y += rowH;
    }
  }

  private buildButtons(): void {
    const single = new Button(this, 360, 330, 320, 72, '1連召喚', () => this.doPull(1, SINGLE_PULL_COST), {
      variant: 'secondary',
      subLabel: `${SINGLE_PULL_COST} 魔晶石`,
    });
    const ten = new Button(this, 360, 420, 320, 72, '10連召喚', () => this.doPull(10, TEN_PULL_COST), {
      variant: 'primary',
      subLabel: `${TEN_PULL_COST} 魔晶石`,
    });
    enterStagger(this, [single, ten], { dy: 26, delay: 140, stagger: 80 });
  }

  private buildBackButton(): void {
    const btn = new Button(this, 90, 1200, 140, 52, '戻る', () => this.scene.start('Home'), { variant: 'ghost', fontSize: '16px' });
    enter(this, btn, { delay: 220 });
  }

  private doPull(count: number, cost: number): void {
    const save = this.getSave();
    if (!SaveSystem.spendGems(save, cost)) {
      this.flashMessage('魔晶石が足りません');
      return;
    }
    const results = GachaSystem.pullMany(count);
    const outcomes = results.map((hero) => SaveSystem.addHero(save, hero));
    SaveSystem.save(save);
    this.refreshResources();
    this.showResults(outcomes);
  }

  private flashMessage(text: string): void {
    const msg = caption(this, 360, 470, text, { fontSize: '16px', color: hex(COLORS.danger) }).setOrigin(0.5);
    this.tweens.add({ targets: msg, alpha: 0, delay: 900, duration: 400, onComplete: () => msg.destroy() });
  }

  private showResults(outcomes: HeroPullOutcome[]): void {
    this.resultContainer?.destroy();
    const container = this.add.container(0, 0);
    this.resultContainer = container;
    const overlay = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0).setInteractive();
    container.add(overlay);
    this.tweens.add({ targets: overlay, fillAlpha: 0.78, duration: 220 });

    const cols = Math.min(5, outcomes.length);
    const rows = Math.ceil(outcomes.length / cols);
    const startY = 640 - (rows - 1) * 90;

    outcomes.forEach((outcome, i) => {
      const { hero } = outcome;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 360 - ((cols - 1) * 140) / 2 + col * 140;
      const y = startY + row * 180;

      if (hero.rarity >= 5) this.spawnBurst(x, y, RARITY_COLORS[hero.rarity], 120 * i);

      const card = new HeroCard(this, x, y, hero, this.generator, 110);
      card.setScale(0);
      container.add(card);
      if (outcome.duplicate) {
        const dupLabel = caption(this, x, y + 70, `ダブり → +${outcome.duplicateGold.toString()}G`, { fontSize: '12px', color: hex(COLORS.gold) }).setOrigin(0.5);
        container.add(dupLabel);
      }
      this.tweens.add({
        targets: card,
        scale: 1,
        duration: 380,
        delay: 120 * i,
        ease: 'Back.easeOut',
        onStart: () => {
          if (hero.rarity >= 4) this.cameras.main.flash(150, 255, 230, 150, false);
        },
      });
    });

    const closeBtn = new Button(this, 360, 1180, 220, 60, '閉じる', () => {
      container.destroy();
      this.resultContainer = undefined;
    }, { variant: 'primary' });
    container.add(closeBtn);
    closeBtn.setScale(0);
    this.tweens.add({ targets: closeBtn, scale: 1, duration: 300, delay: 120 * outcomes.length + 120, ease: 'Back.easeOut' });
  }

  /** Radial burst of fading lines for the biggest pulls, so a 5-star
   *  reveal feels like more of an event than a same-shaped card pop. */
  private spawnBurst(x: number, y: number, color: number, delay: number): void {
    const g = this.add.graphics({ x, y }).setDepth(50);
    const rays = 10;
    g.lineStyle(3, color, 0.9);
    for (let i = 0; i < rays; i++) {
      const angle = (Math.PI * 2 * i) / rays;
      g.beginPath();
      g.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
      g.lineTo(Math.cos(angle) * 60, Math.sin(angle) * 60);
      g.strokePath();
    }
    g.setScale(0.3).setAlpha(0);
    this.tweens.add({
      targets: g,
      scale: 1.6,
      alpha: { from: 0.9, to: 0 },
      duration: 500,
      delay,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}
