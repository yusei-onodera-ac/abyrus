import Phaser from 'phaser';
import { SaveSystem, expToNextLevel, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { subheading, caption, statLabel, numeric, COLORS } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';
import { CLASS_LABELS, RARITY_COLORS, hex, type HeroData } from '../types';

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
    applyBackground(this, 'hero_detail');
    this.buildBackButton();
    this.buildHeader(hero);
    this.buildPortrait(hero);
    this.buildStatsPanel(hero);
    if (this.detailData.from === 'Roster') this.buildFormationButton(hero);
  }

  private buildBackButton(): void {
    const btn = new Button(this, 90, 50, 140, 52, '戻る', () => this.scene.start(this.detailData.from), { variant: 'ghost', fontSize: '15px' });
    enter(this, btn, { duration: 260 });
  }

  private buildFormationButton(hero: HeroData): void {
    const btn = new Button(this, 360, 1180, 320, 60, '編成にセット', () => this.scene.start('Roster', { preSelect: hero.id }), { variant: 'primary' });
    enter(this, btn, { dy: 20, delay: 260 });
  }

  private buildHeader(hero: HeroData): void {
    const color = RARITY_COLORS[hero.rarity];
    const stars = this.add.text(360, 46, '★'.repeat(hero.rarity), { fontSize: '20px', color: hex(color) }).setOrigin(0.5);
    const name = subheading(this, 360, 80, hero.name, { fontSize: '30px' }).setOrigin(0.5);
    const classLabel = caption(this, 360, 114, CLASS_LABELS[hero.heroClass], { fontSize: '14px' }).setOrigin(0.5);
    enter(this, stars, { dy: -10, duration: 300 });
    enter(this, name, { dy: -14, delay: 40, duration: 340 });
    enter(this, classLabel, { dy: -8, delay: 80 });
  }

  private buildPortrait(hero: HeroData): void {
    const frameW = 420;
    const frameH = 460;
    const cx = 360;
    const cy = 420;
    const rarityColor = RARITY_COLORS[hero.rarity];

    const panel = createPanel(this, cx, cy, frameW, frameH, {
      fillColor: COLORS.panelFill,
      borderColor: rarityColor,
      glowColor: rarityColor,
      radius: 22,
      rarity: hero.rarity,
    });

    if (hero.heroId && this.textures.exists(hero.heroId)) {
      const frame = this.textures.get(hero.heroId).getSourceImage();
      const scale = Math.min((frameW - 24) / frame.width, (frameH - 24) / frame.height);
      this.add.image(cx, cy, hero.heroId).setScale(scale);
    } else {
      const generator = new CharacterGenerator(this);
      const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity);
      this.add.sprite(cx, cy, textureKey).setDisplaySize(frameW * 0.6, frameW * 0.6);
    }

    popIn(this, panel, { duration: 420 });
  }

  private buildStatsPanel(hero: HeroData): void {
    const stats = ProgressionSystem.computeHeroStats(hero);
    const panelY = 700;
    const panelH = 420;
    const panel = createPanel(this, 360, panelY + panelH / 2, 600, panelH, { radius: 18 });
    enter(this, panel, { dy: 24, duration: 360 });

    const needed = expToNextLevel(hero.level);
    numeric(this, 100, panelY + 24, `Lv.${hero.level}`, { fontSize: '20px' });
    this.add.rectangle(230, panelY + 34, 390, 10, 0x000000, 0.6).setOrigin(0, 0.5).setRounded(5);
    this.add
      .rectangle(230, panelY + 34, 390, 10, COLORS.gem)
      .setOrigin(0, 0.5)
      .setScale(Phaser.Math.Clamp(hero.exp / needed, 0, 1), 1)
      .setRounded(5);
    caption(this, 620, panelY + 24, `${hero.exp} / ${needed}`, { fontSize: '12px' }).setOrigin(1, 0);

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
      const labelText = statLabel(this, 100, y, label);
      const valueText = numeric(this, 620, y, value, { fontSize: '18px' }).setOrigin(1, 0);
      enter(this, labelText, { dx: -8, dy: 0, delay: 80 + i * 30, duration: 240 });
      enter(this, valueText, { dx: 8, dy: 0, delay: 80 + i * 30, duration: 240 });
    });
  }
}
