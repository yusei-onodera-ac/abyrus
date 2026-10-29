import Phaser from 'phaser';
import { SaveSystem, expToNextLevel, type SaveData } from '../systems/SaveSystem';
import { MAX_SKILL_LEVEL, SKILL_KIND_LABELS, SKILL_SLOT_UNLOCK_LEVEL, formatSkillEffectSummary, getHeroSkillLoadout, getSkillSlotCount, isSkillSlotUnlocked, skillUpgradeCost, type SkillDefinition } from '../data/skills';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { Button } from '../ui/Button';
import { BackButton } from '../ui/BackButton';
import { BottomNavBar } from '../ui/BottomNavBar';
import { applyBackground } from '../ui/Background';
import { buildCardPanel } from '../ui/CardParts';
import { HeroSlot } from '../ui/HeroSlot';
import { buildInfoPanel } from '../ui/InfoPanel';
import { openModal, type ModalHandle } from '../ui/Modal';
import { createPanel, createDivider } from '../ui/Panel';
import { buildStoneStage } from '../ui/StoneStage';
import { body, caption, heading, CHROME } from '../ui/theme';
import { enter } from '../ui/Transitions';
import { CLASS_LABELS, RARITY_COLORS, MAX_PHASE, hex, type HeroData } from '../types';

interface HeroDetailData {
  heroId: string;
  /** Scene to return to when the back button is tapped. */
  from: string;
}

const INK = '#1c130a';
/** The stage (hero on his summoning circle) fills the screen down to here. */
const STAGE_H = 650;
const PANEL_X = 12;
const PANEL_W = 696;
const GAP = 8;

/** Hero detail, laid out like the reference: the hero large on a stage with
 *  the class plate and 総合力 in its corners, then an info block (portrait chip,
 *  Lv / EXP / HP / 攻撃) and titled panels under it. 強化する opens the 強化
 *  screen. Opened by tapping a hero in the roster. */
export class HeroDetailScene extends Phaser.Scene {
  private detailData!: HeroDetailData;
  private save!: SaveData;
  private modal?: ModalHandle;
  private chips?: Phaser.GameObjects.Container;

  constructor() {
    super('HeroDetail');
  }

  init(data: HeroDetailData): void {
    this.detailData = data;
    this.modal = undefined;
    this.chips = undefined;
  }

  create(): void {
    const save: SaveData = this.game.registry.get('save');
    this.save = save;
    const hero = SaveSystem.getHero(save, this.detailData.heroId);
    if (!hero) {
      this.scene.start(this.detailData.from);
      return;
    }

    this.cameras.main.setBackgroundColor('#10121c');
    const accent = RARITY_COLORS[hero.rarity];
    const generator = new CharacterGenerator(this);

    this.buildStage(hero, generator, accent);
    this.buildHeaderBar();
    this.buildStageLabels(hero);
    this.buildSkillChips(hero);

    let y = STAGE_H + 10;
    y += this.buildStatusBlock(hero, generator, y) + GAP;
    y += this.buildPhasePanel(hero, y) + GAP;
    this.buildStatsPanel(hero, y);

    new BottomNavBar(this, 720, 1280, null);
    this.buildButtons(hero);
    enter(this, new BackButton(this, () => this.scene.start(this.detailData.from)), { dx: -40, dy: 0, duration: 300, delay: 250 });
  }

  /** The wall + floor circle (or the supplied hero_detail background, if there
   *  is one) with the hero standing in it. */
  private buildStage(hero: HeroData, generator: CharacterGenerator, accent: number): void {
    if (!applyBackground(this, 'hero_detail')) buildStoneStage(this, 720, STAGE_H, accent).setDepth(-50);

    // A soft halo in the hero's colour behind the figure.
    const halo = this.add.graphics().setDepth(-40);
    for (let i = 4; i >= 1; i--) {
      halo.fillStyle(accent, 0.045 * i);
      halo.fillEllipse(360, 330, 360 + i * 56, 470 + i * 40);
    }

    let figure: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    if (hero.heroId && this.textures.exists(hero.heroId)) {
      const frame = this.textures.get(hero.heroId).getSourceImage();
      const scale = Math.min(548 / frame.height, 620 / frame.width);
      figure = this.add.image(360, STAGE_H - 64 - (frame.height * scale) / 2, hero.heroId).setScale(scale);
    } else {
      const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity);
      figure = this.add.sprite(360, 380, textureKey).setDisplaySize(330, 330);
    }
    figure.setDepth(-30);
    const restY = figure.y;
    enter(this, figure, { dy: 22, duration: 460, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: figure, y: restY - 9, duration: 2400, delay: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Dark title bar across the top: the screen's name. */
  private buildHeaderBar(): void {
    const bar = this.add.graphics();
    bar.fillStyle(CHROME.woodFill, 0.96);
    bar.fillRect(0, 0, 720, 64);
    bar.fillStyle(CHROME.brass, 1);
    bar.fillRect(0, 62, 720, 3);
    bar.fillStyle(CHROME.brassBright, 0.55);
    bar.fillRect(0, 58, 720, 1);
    const title = heading(this, 360, 32, 'キャラ詳細', { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
    enter(this, bar, { dy: -20, duration: 280 });
    enter(this, title, { dy: -20, duration: 280, delay: 40 });
  }

  /** The class plate in the stage's lower-left and 総合力 in its lower-right. */
  private buildStageLabels(hero: HeroData): void {
    const plate = this.add.graphics();
    plate.fillStyle(0x0d0905, 0.88);
    plate.fillRoundedRect(14, STAGE_H - 78, 156, 58, 10);
    plate.lineStyle(3, CHROME.brass, 1);
    plate.strokeRoundedRect(14, STAGE_H - 78, 156, 58, 10);
    plate.lineStyle(1, CHROME.brassBright, 0.6);
    plate.strokeRoundedRect(19, STAGE_H - 73, 146, 48, 7);
    const label = body(this, 92, STAGE_H - 49, CLASS_LABELS[hero.heroClass], { fontSize: '28px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);

    const power = ProgressionSystem.computeHeroPower(hero).toString();
    const powerText = body(this, 706, STAGE_H - 14, `総合力：${power}`, { fontSize: '25px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(1, 1);
    enter(this, plate, { dx: -30, dy: 0, delay: 200 });
    enter(this, label, { dx: -30, dy: 0, delay: 200 });
    enter(this, powerText, { dx: 30, dy: 0, delay: 200 });
  }

  /** Portrait chip on the left; name, stars, Lv, EXP bar, HP and 攻撃 on the right. */
  private buildStatusBlock(hero: HeroData, generator: CharacterGenerator, y: number): number {
    const stats = ProgressionSystem.computeHeroStats(hero);
    const h = 168;
    const block = this.add.container(PANEL_X, y);
    block.add(buildCardPanel(this, PANEL_W, h));
    block.add(new HeroSlot(this, 80, h / 2, { hero, generator }, 132));

    const x = 168;
    const right = PANEL_W - 18;
    const color = RARITY_COLORS[hero.rarity];
    block.add(body(this, x, 26, hero.name, { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    block.add(this.add.text(right, 26, '★'.repeat(hero.rarity), { fontSize: '24px', color: hex(color), stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));

    const needed = expToNextLevel(hero.level);
    block.add(body(this, x, 68, `Lv.${hero.level}`, { fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    block.add(caption(this, right, 74, `次のLvまで：${Math.max(0, needed - hero.exp).toLocaleString('ja-JP')}`, { fontSize: '21px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));

    const barW = right - x;
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(x, 96, barW, 14, 7);
    bar.fillStyle(0xe0822a, 1);
    bar.fillRoundedRect(x, 96, Math.max(10, barW * Phaser.Math.Clamp(hero.exp / needed, 0, 1)), 14, 7);
    bar.fillStyle(0xffffff, 0.25);
    bar.fillRoundedRect(x + 2, 98, Math.max(6, barW * Phaser.Math.Clamp(hero.exp / needed, 0, 1)) - 4, 5, 3);
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(x, 96, barW, 14, 7);
    block.add(bar);

    block.add(this.statPair('HP', stats.maxHp.toString(), x, 138));
    block.add(this.statPair('攻撃', stats.atk.toString(), x + 262, 138));
    enter(this, block, { dy: 24, duration: 340, delay: 120 });
    return h;
  }

  /** "HP：480" - a small label then its value, the pair's left edge at x. */
  private statPair(label: string, value: string, x: number, y: number): Phaser.GameObjects.Container {
    const l = caption(this, 0, 0, `${label}：`, { fontSize: '21px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    const v = body(this, l.width, 0, value, { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    return this.add.container(x, y, [l, v]);
  }

  /** フェーズ: ten pips and "n / 10". Raised in the 強化 screen. */
  private buildPhasePanel(hero: HeroData, y: number): number {
    const panel = buildInfoPanel(this, PANEL_W, 82, 'フェーズ', 0x6a3fb0);
    const top = panel.bodyTop;
    for (let i = 0; i < MAX_PHASE; i++) {
      const filled = i < hero.phase;
      const px = 30 + i * 36;
      const g = this.add.graphics();
      g.fillStyle(filled ? 0xa97bff : 0x1d130a, 1);
      g.fillPoints([new Phaser.Math.Vector2(px, top + 12), new Phaser.Math.Vector2(px + 13, top + 28), new Phaser.Math.Vector2(px, top + 44), new Phaser.Math.Vector2(px - 13, top + 28)], true);
      g.lineStyle(2, filled ? 0xe6d6ff : CHROME.brassDark, filled ? 0.9 : 0.8);
      g.strokePoints([new Phaser.Math.Vector2(px, top + 12), new Phaser.Math.Vector2(px + 13, top + 28), new Phaser.Math.Vector2(px, top + 44), new Phaser.Math.Vector2(px - 13, top + 28)], true);
      panel.container.add(g);
    }
    panel.container.add(body(this, PANEL_W - 18, top + 28, `${hero.phase} / ${MAX_PHASE}`, { fontSize: '30px', fontStyle: 'bold', color: '#d9c2ff', stroke: INK, strokeThickness: 5 }).setOrigin(1, 0.5));
    panel.container.add(caption(this, 18, top + 64, '同じキャラを合成するか、フェーズ素材を使うと上がります', { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    panel.container.setPosition(PANEL_X, y);
    enter(this, panel.container, { dy: 24, duration: 340, delay: 170 });
    return panel.height;
  }

  /** 防御 / 素早さ / 会心率 / 会心倍率 in four cells. */
  private buildStatsPanel(hero: HeroData, y: number): number {
    const stats = ProgressionSystem.computeHeroStats(hero);
    const panel = buildInfoPanel(this, PANEL_W, 74, 'ステータス', 0x3f7a3a);
    const top = panel.bodyTop;
    const cells: [string, string][] = [
      ['防御力', stats.def.toLocaleString('ja-JP')],
      ['素早さ', stats.spd.toLocaleString('ja-JP')],
      ['会心率', `${Math.round(stats.critRate * 100)}%`],
      ['会心倍率', `×${stats.critMul.toFixed(1)}`],
    ];
    const cellW = PANEL_W / cells.length;
    cells.forEach(([label, value], i) => {
      const cx = cellW * i + cellW / 2;
      panel.container.add(caption(this, cx, top + 20, label, { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      panel.container.add(body(this, cx, top + 50, value, { fontSize: '28px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    });
    panel.container.setPosition(PANEL_X, y);
    enter(this, panel.container, { dy: 24, duration: 340, delay: 220 });
    return panel.height;
  }

  // --- skills -----------------------------------------------------------

  /** The hero's skills as a column of tags down the stage's right edge: name, and
   *  Lv (or the level that unlocks it). Tapping one opens the full list, where
   *  they can be levelled up. */
  private buildSkillChips(hero: HeroData): void {
    this.chips?.destroy();
    const loadout = getHeroSkillLoadout(hero.heroId);
    const slotCount = getSkillSlotCount(hero.rarity);
    const w = 168;
    const h = 62;
    const gap = 8;
    const x = 720 - 12 - w;
    const top = 112;
    const container = this.add.container(0, 0);
    this.chips = container;

    container.add(caption(this, x + w / 2, top - 8, 'スキル', { fontSize: '20px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0.5, 1));
    let shown = 0;
    for (let slot = 0; slot < slotCount; slot++) {
      const def = loadout[slot];
      if (!def) continue;
      const unlocked = isSkillSlotUnlocked(slot, hero.level);
      const y = top + shown * (h + gap);
      shown++;
      const g = this.add.graphics();
      g.fillStyle(0x0d0905, 0.86);
      g.fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(2, unlocked ? CHROME.brass : CHROME.brassDark, unlocked ? 1 : 0.6);
      g.strokeRoundedRect(x, y, w, h, 10);
      container.add(g);
      container.add(body(this, x + 10, y + 19, def.name, { fontSize: '19px', fontStyle: 'bold', color: unlocked ? '#fff4dc' : '#7a6a4a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      const sub = unlocked ? `Lv.${hero.skillLevels[slot] ?? 1}` : `Lv.${SKILL_SLOT_UNLOCK_LEVEL[slot]}で解放`;
      container.add(caption(this, x + 10, y + 44, sub, { fontSize: '17px', color: unlocked ? '#ffd9a0' : '#a89a78', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      if (unlocked) container.add(caption(this, x + w - 10, y + 44, SKILL_KIND_LABELS[def.kind], { fontSize: '14px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    }
    const listH = shown * (h + gap) - gap;
    const hit = this.add.zone(x + w / 2, top + listH / 2, w, listH).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.openSkillModal(hero));
    container.add(hit);
    enter(this, container, { dx: 30, dy: 0, delay: 240 });
  }

  /** The full skill list: each slot with its effect at the current level, and a
   *  強化 button that spends 技素. Rebuilt after every upgrade. */
  private openSkillModal(hero: HeroData): void {
    this.modal?.close();
    this.modal = openModal(this, { setEnabled: () => {} }, 0.78, true);
    const modal = this.modal.container;
    const loadout = getHeroSkillLoadout(hero.heroId);
    const slotCount = getSkillSlotCount(hero.rarity);

    const w = 640;
    const rowH = 148;
    const headH = 128;
    const footH = 100;
    const h = headH + slotCount * rowH + footH;
    const cy = 640;
    const top = cy - h / 2;
    const left = 360 - w / 2;

    const panel = createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: hero.rarity, gradient: false });
    // Swallows taps so touching the panel itself doesn't dismiss the popup.
    const block = this.add.zone(360, cy, w, h).setInteractive();
    modal.add([panel, block]);

    modal.add(body(this, 360, top + 40, `${hero.name} のスキル`, { fontSize: '32px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    modal.add(caption(this, 360, top + 86, `所持 技素：${this.save.skillEssence.toLocaleString('ja-JP')}`, { fontSize: '22px', color: '#ffd9a0', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));

    let row = 0;
    for (let slot = 0; slot < slotCount; slot++) {
      const def = loadout[slot];
      if (!def) continue;
      const rowTop = top + headH + row * rowH;
      row++;
      modal.add(createDivider(this, 360, rowTop, w - 48, CHROME.brassDark));
      this.buildSkillRow(modal, hero, def, slot, left + 28, rowTop + 14, w - 56, rowH - 28);
    }

    modal.add(new Button(this, 360, top + h - footH / 2, 260, 68, '閉じる', () => this.closeSkillModal(), { variant: 'wood', fontSize: '26px' }));
  }

  private buildSkillRow(modal: Phaser.GameObjects.Container, hero: HeroData, def: SkillDefinition, slot: number, x: number, y: number, w: number, h: number): void {
    const unlocked = isSkillSlotUnlocked(slot, hero.level);
    modal.add(body(this, x, y + 20, def.name, { fontSize: '27px', fontStyle: 'bold', color: unlocked ? '#fff4dc' : '#7a6a4a', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    modal.add(caption(this, x + w, y + 20, SKILL_KIND_LABELS[def.kind], { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    modal.add(caption(this, x, y + 56, def.description, { fontSize: '17px', color: '#d8c49a', stroke: INK, strokeThickness: 3, wordWrap: { width: w, useAdvancedWrap: true } }).setOrigin(0, 0.5));

    if (!unlocked) {
      modal.add(caption(this, x, y + h - 14, `キャラ Lv.${SKILL_SLOT_UNLOCK_LEVEL[slot]} で解放`, { fontSize: '21px', fontStyle: 'bold', color: '#ff9a8a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      return;
    }

    const level = hero.skillLevels[slot] ?? 1;
    modal.add(body(this, x, y + h - 14, `Lv.${level} / ${MAX_SKILL_LEVEL}`, { fontSize: '25px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    modal.add(caption(this, x + 150, y + h - 14, formatSkillEffectSummary(def, level), { fontSize: '19px', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    const maxed = level >= MAX_SKILL_LEVEL;
    const cost = maxed ? 0 : skillUpgradeCost(level);
    const button = new Button(this, x + w - 80, y + h - 27, 160, 58, maxed ? 'MAX' : '強化', () => this.upgradeSkill(hero, slot), {
      variant: 'gold',
      fontSize: '26px',
      subLabel: maxed ? undefined : `${cost.toLocaleString('ja-JP')} 技素`,
    });
    button.setEnabled(!maxed && this.save.skillEssence >= cost);
    modal.add(button);
  }

  private upgradeSkill(hero: HeroData, slot: number): void {
    if (!SaveSystem.upgradeHeroSkill(this.save, hero.id, slot)) return;
    SaveSystem.save(this.save);
    this.buildSkillChips(hero);
    this.openSkillModal(hero);
  }

  private closeSkillModal(): void {
    this.modal?.close();
    this.modal = undefined;
  }

  /** 強化する (to the 強化 screen), and 編成にセット when we came from the roster. */
  private buildButtons(hero: HeroData): void {
    const y = 1114;
    const h = 66;
    const enhance = (): void => {
      this.scene.start('Enhance', this.detailData);
    };
    const fromRoster = this.detailData.from === 'Roster';
    // Right of the back tab (which fills the left 156px).
    const left = 176;
    const right = 704;
    const buttons: Button[] = [];
    if (fromRoster) {
      const w = (right - left - 16) / 2;
      buttons.push(new Button(this, left + w / 2, y, w, h, '編成にセット', () => this.scene.start('Roster', { preSelect: hero.id }), { variant: 'wood', fontSize: '26px' }));
      buttons.push(new Button(this, right - w / 2, y, w, h, '強化する', enhance, { variant: 'gold', fontSize: '30px' }));
    } else {
      buttons.push(new Button(this, (left + right) / 2, y, right - left, h, '強化する', enhance, { variant: 'gold', fontSize: '32px' }));
    }
    buttons.forEach((b, i) => enter(this, b, { dy: 20, delay: 260 + i * 50 }));
  }
}
