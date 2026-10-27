import Phaser from 'phaser';
import { SaveSystem, expToNextLevel, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { CLASS_LABELS, RARITY_COLORS, type HeroData } from '../types';

interface HeroDetailData {
  heroId: string;
  /** Scene to return to when the back button is tapped. */
  from: string;
}

/** Full-screen hero inspector: portrait, rarity/class, level/EXP and combat
 *  stats. Opened by tapping a hero card (roster grid, formation slot, ...). */
export class HeroDetailScene extends Phaser.Scene {
  private detailData!: HeroDetailData;

  constructor() {
    super('HeroDetail');
  }

  init(data: HeroDetailData): void {
    this.detailData = data;
  }

  create(): void {
    const save: SaveData = this.game.registry.get('save');
    const hero = SaveSystem.getHero(save, this.detailData.heroId);
    if (!hero) {
      this.scene.start(this.detailData.from);
      return;
    }

    this.cameras.main.setBackgroundColor('#141420');
    this.buildBackButton();
    this.buildHeader(hero);
    this.buildPortrait(hero);
    this.buildStatsPanel(hero);
    if (this.detailData.from === 'Roster') this.buildFormationButton(hero);
  }

  private buildBackButton(): void {
    const bg = this.add.rectangle(80, 50, 120, 48, 0x2a2c3d).setStrokeStyle(2, 0x4a4d66).setInteractive({ useHandCursor: true });
    this.add.text(80, 50, '戻る', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerdown', () => this.scene.start(this.detailData.from));
  }

  private buildFormationButton(hero: HeroData): void {
    const bg = this.add
      .rectangle(360, 1180, 320, 56, 0x3a2e5c)
      .setStrokeStyle(2, 0x8a6fd6)
      .setInteractive({ useHandCursor: true });
    this.add.text(360, 1180, '編成にセット', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerdown', () => this.scene.start('Roster', { preSelect: hero.id }));
  }

  private buildHeader(hero: HeroData): void {
    const color = RARITY_COLORS[hero.rarity];
    this.add.text(360, 46, '★'.repeat(hero.rarity), { fontSize: '20px', color: Phaser.Display.Color.ValueToColor(color).rgba }).setOrigin(0.5);
    this.add.text(360, 80, hero.name, { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#f0ecff' }).setOrigin(0.5);
    this.add.text(360, 114, CLASS_LABELS[hero.heroClass], { fontSize: '14px', color: '#9a93b8' }).setOrigin(0.5);
  }

  private buildPortrait(hero: HeroData): void {
    const frameW = 420;
    const frameH = 460;
    const cx = 360;
    const cy = 420;

    this.add.rectangle(cx, cy, frameW, frameH, 0x1b1d29, 0.9).setStrokeStyle(4, RARITY_COLORS[hero.rarity]);

    if (hero.heroId && this.textures.exists(hero.heroId)) {
      const frame = this.textures.get(hero.heroId).getSourceImage();
      const scale = Math.min((frameW - 24) / frame.width, (frameH - 24) / frame.height);
      this.add.image(cx, cy, hero.heroId).setScale(scale);
    } else {
      const generator = new CharacterGenerator(this);
      const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity);
      this.add.sprite(cx, cy, textureKey).setDisplaySize(frameW * 0.6, frameW * 0.6);
    }
  }

  private buildStatsPanel(hero: HeroData): void {
    const stats = ProgressionSystem.computeHeroStats(hero);
    const panelY = 700;
    const panelH = 420;
    this.add.rectangle(360, panelY + panelH / 2, 600, panelH, 0x1b1d29, 0.92).setStrokeStyle(2, 0x2e303a);

    const needed = expToNextLevel(hero.level);
    this.add.text(100, panelY + 24, `Lv.${hero.level}`, { fontSize: '20px', color: '#ffffff', fontStyle: 'bold' });
    this.add.rectangle(230, panelY + 34, 390, 10, 0x000000, 0.6).setOrigin(0, 0.5);
    this.add
      .rectangle(230, panelY + 34, 390 * Phaser.Math.Clamp(hero.exp / needed, 0, 1), 10, 0x7cd6ff)
      .setOrigin(0, 0.5);
    this.add.text(620, panelY + 24, `${hero.exp} / ${needed}`, { fontSize: '12px', color: '#9a93b8' }).setOrigin(1, 0);

    const rows: [string, string][] = [
      ['HP', stats.maxHp.toString()],
      ['攻撃力', stats.atk.toString()],
      ['防御力', stats.def.toLocaleString('ja-JP')],
      ['素早さ', stats.spd.toLocaleString('ja-JP')],
      ['会心率', `${Math.round(stats.critRate * 100)}%`],
      ['会心倍率', `x${stats.critMul.toFixed(1)}`],
    ];

    rows.forEach(([label, value], i) => {
      const y = panelY + 90 + i * 50;
      this.add.text(100, y, label, { fontSize: '16px', color: '#9a93b8' });
      this.add.text(620, y, value, { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0);
    });
  }
}
