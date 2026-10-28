import Phaser from 'phaser';
import { SaveSystem, expToNextLevel, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import {
  MAX_SKILL_LEVEL,
  SKILL_KIND_LABELS,
  SKILL_SLOT_UNLOCK_LEVEL,
  formatSkillEffectSummary,
  getHeroSkillLoadout,
  getSkillSlotCount,
  isSkillSlotUnlocked,
  skillUpgradeCost,
  type SkillDefinition,
} from '../data/skills';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { subheading, body, caption, statLabel, numeric, COLORS } from '../ui/theme';
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
  private save!: SaveData;
  private skillModal?: Phaser.GameObjects.Container;

  constructor() {
    super('HeroDetail');
  }

  init(data: HeroDetailData): void {
    this.detailData = data;
  }

  create(): void {
    const save: SaveData = this.game.registry.get('save');
    this.save = save;
    this.skillModal = undefined;
    const hero = SaveSystem.getHero(save, this.detailData.heroId);
    if (!hero) {
      this.scene.start(this.detailData.from);
      return;
    }

    this.cameras.main.setBackgroundColor('#141420');
    applyBackground(this, 'hero_detail');
    this.buildBackButton();
    this.buildSkillButton(hero);
    this.buildHeader(hero);
    this.buildPortrait(hero);
    this.buildStatsPanel(hero);
    if (this.detailData.from === 'Roster') this.buildFormationButton(hero);
  }

  private buildBackButton(): void {
    const btn = new Button(this, 115, 53, 190, 66, '戻る', () => this.scene.start(this.detailData.from), { variant: 'ghost', fontSize: '15px' });
    enter(this, btn, { duration: 260 });
  }

  private buildFormationButton(hero: HeroData): void {
    const btn = new Button(this, 360, 1180, 320, 60, '編成にセット', () => this.scene.start('Roster', { preSelect: hero.id }), { variant: 'primary' });
    enter(this, btn, { dy: 20, delay: 260 });
  }

  private buildSkillButton(hero: HeroData): void {
    const btn = new Button(this, 605, 53, 190, 66, 'スキル', () => this.openSkillModal(hero), { variant: 'ghost', fontSize: '15px' });
    enter(this, btn, { duration: 260 });
  }

  /** Full-screen overlay listing every skill slot this hero's rarity grants
   *  (locked slots shown greyed-out with their unlock level, unlocked ones
   *  with their live level/effect and a material-spend upgrade button).
   *  Rebuilt from scratch on open and after every upgrade rather than
   *  patched in place - at most 4 rows, so this is cheap and keeps the
   *  row-building logic in one place. */
  private openSkillModal(hero: HeroData): void {
    this.skillModal?.destroy();

    const loadout = getHeroSkillLoadout(hero.heroId);
    const slotCount = getSkillSlotCount(hero.rarity);
    const rowBand = 150;
    const headerH = 150;
    const footerH = 80;
    const panelW = 620;
    const panelH = headerH + slotCount * rowBand + footerH;
    const cx = 360;
    const cy = 640;
    const top = cy - panelH / 2;

    const container = this.add.container(0, 0).setDepth(500);
    this.skillModal = container;

    const overlay = this.add.rectangle(cx, cy, 720, 1280, 0x000000, 0).setInteractive();
    container.add(overlay);
    this.tweens.add({ targets: overlay, fillAlpha: 0.82, duration: 180 });

    const rarityColor = RARITY_COLORS[hero.rarity];
    const panel = createPanel(this, cx, cy, panelW, panelH, {
      fillColor: COLORS.panelFill,
      borderColor: rarityColor,
      glowColor: rarityColor,
      radius: 20,
      rarity: hero.rarity,
    });
    container.add(panel);
    panel.setScale(0.92);
    popIn(this, panel, { duration: 260 });

    const title = subheading(this, cx, top + 36, `${hero.name} のスキル`, { fontSize: '19px' }).setOrigin(0.5);
    container.add(title);
    const essenceText = caption(this, cx, top + 68, `所持 技素: ${this.save.skillEssence.toLocaleString('ja-JP')}`, { fontSize: '13px' }).setOrigin(0.5);
    container.add(essenceText);

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
      const def = loadout[slotIndex];
      if (!def) continue;
      const rowY = top + headerH + slotIndex * rowBand + rowBand / 2;
      this.buildSkillRow(container, hero, def, slotIndex, cx, rowY, panelW - 40, rowBand - 16);
    }

    const closeBtn = new Button(this, cx, top + panelH - footerH / 2, 200, 56, '閉じる', () => this.closeSkillModal(), { variant: 'secondary' });
    container.add(closeBtn);
  }

  private buildSkillRow(
    container: Phaser.GameObjects.Container,
    hero: HeroData,
    def: SkillDefinition,
    slotIndex: number,
    cx: number,
    rowY: number,
    rowW: number,
    rowH: number,
  ): void {
    const unlocked = isSkillSlotUnlocked(slotIndex, hero.level);
    const rowPanel = createPanel(this, cx, rowY, rowW, rowH, {
      fillColor: COLORS.panelFillLight,
      fillAlpha: unlocked ? 0.9 : 0.5,
      borderColor: unlocked ? COLORS.borderLight : COLORS.border,
      glowColor: unlocked ? RARITY_COLORS[hero.rarity] : COLORS.border,
      radius: 14,
    });
    container.add(rowPanel);

    const left = cx - rowW / 2 + 22;
    const nameText = body(this, left, rowY - rowH / 2 + 26, def.name, {
      fontSize: '16px',
      color: unlocked ? hex(COLORS.textPrimary) : hex(COLORS.textMuted),
      fontStyle: 'bold',
    });
    container.add(nameText);
    const kindText = caption(this, left, rowY - rowH / 2 + 50, SKILL_KIND_LABELS[def.kind], { fontSize: '12px' });
    container.add(kindText);

    if (!unlocked) {
      const threshold = SKILL_SLOT_UNLOCK_LEVEL[slotIndex];
      const lockText = caption(this, left, rowY + 16, `Lv.${threshold} で解放`, { fontSize: '13px', color: '#ff8080' });
      container.add(lockText);
      return;
    }

    const level = hero.skillLevels[slotIndex] ?? 1;
    const effectText = caption(this, left, rowY + 14, `Lv.${level}/${MAX_SKILL_LEVEL} ・ ${formatSkillEffectSummary(def, level)}`, {
      fontSize: '13px',
      color: '#cfc9ea',
    });
    container.add(effectText);

    const maxed = level >= MAX_SKILL_LEVEL;
    const cost = maxed ? 0 : skillUpgradeCost(level);
    const canAfford = !maxed && this.save.skillEssence >= cost;
    const upgradeBtn = new Button(
      this,
      cx + rowW / 2 - 92,
      rowY + 6,
      160,
      56,
      maxed ? 'MAX' : '強化',
      () => {
        if (SaveSystem.upgradeHeroSkill(this.save, hero.id, slotIndex)) {
          SaveSystem.save(this.save);
          this.openSkillModal(hero);
        }
      },
      { variant: maxed ? 'ghost' : 'primary', subLabel: maxed ? undefined : `${cost.toLocaleString('ja-JP')} 技素`, fontSize: '14px' },
    );
    if (maxed || !canAfford) upgradeBtn.setEnabled(false);
    container.add(upgradeBtn);
  }

  private closeSkillModal(): void {
    this.skillModal?.destroy();
    this.skillModal = undefined;
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
