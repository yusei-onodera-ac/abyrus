import Phaser from 'phaser';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { EnhanceSystem, LEVEL_STEPS } from '../systems/EnhanceSystem';
import { SaveSystem, expToNextLevel } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { Button } from '../ui/Button';
import { buildCardPanel } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { HeroSlot, HERO_SLOT_SIZE } from '../ui/HeroSlot';
import { buildInfoPanel } from '../ui/InfoPanel';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { CLASS_LABELS, MAX_PHASE, RARITY_COLORS, hex, type HeroData } from '../types';
import { InboxScene, type InboxCard } from './InboxScene';

interface EnhanceData {
  heroId: string;
  /** The scene the hero detail screen was opened from - 戻る returns there via the detail. */
  from: string;
}

const PAD = 14;
const INK = '#1c130a';

/** 強化: the screen the hero detail's 強化する button opens. Two ways to make a
 *  hero stronger - ゴールドでレベルアップ (1 or 5 levels at a time, showing what
 *  HP / 攻撃 become), フェーズ素材でフェーズ強化 (+1 phase per material) and
 *  合成 (+1 phase per same-character copy used up).
 *  戻る goes back to that hero's detail. */
export class EnhanceScene extends InboxScene {
  protected readonly screenTitle = '強化';
  protected emptyText = '';

  private target!: EnhanceData;
  private generator!: CharacterGenerator;

  constructor() {
    super('Enhance');
  }

  init(data: EnhanceData): void {
    super.init();
    this.target = data;
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
  }

  protected goBack(): void {
    this.scene.start('HeroDetail', this.target);
  }

  private hero(): HeroData | undefined {
    return SaveSystem.getHero(this.save, this.target.heroId);
  }

  protected buildCards(): InboxCard[] {
    const hero = this.hero();
    if (!hero) {
      this.time.delayedCall(0, () => this.scene.start(this.target.from));
      return [];
    }
    return [this.heroCard(hero), this.levelCard(hero), this.phaseCard(hero), this.fuseCard(hero)];
  }

  // --- cards ------------------------------------------------------------

  /** Who is being enhanced: chip, name, class, Lv and EXP. */
  private heroCard(hero: HeroData): InboxCard {
    const height = 168;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(new HeroSlot(this, PAD + 66, height / 2, { hero, generator: this.generator }, 132));

    const x = PAD + 132 + 18;
    const right = CARD_WIDTH - PAD - 4;
    container.add(body(this, x, 30, hero.name, { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(this.add.text(right, 30, '★'.repeat(hero.rarity), { fontSize: '24px', color: hex(RARITY_COLORS[hero.rarity]), stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
    container.add(caption(this, x, 64, CLASS_LABELS[hero.heroClass], { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    const needed = expToNextLevel(hero.level);
    container.add(body(this, x, 104, `Lv.${hero.level}`, { fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, right, 110, `次のLvまで：${Math.max(0, needed - hero.exp).toLocaleString('ja-JP')}`, { fontSize: '20px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    const barW = right - x;
    const ratio = Phaser.Math.Clamp(hero.exp / needed, 0, 1);
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(x, 134, barW, 14, 7);
    bar.fillStyle(0xe0822a, 1);
    bar.fillRoundedRect(x, 134, Math.max(10, barW * ratio), 14, 7);
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(x, 134, barW, 14, 7);
    container.add(bar);
    return { container, height };
  }

  /** レベル強化: pay ゴールド for +1 or +5 levels, with HP / 攻撃 before → after. */
  private levelCard(hero: HeroData): InboxCard {
    const now = ProgressionSystem.computeHeroStats(hero);
    const bodyH = 288;
    const panel = buildInfoPanel(this, CARD_WIDTH, bodyH, 'レベル強化', 0xc7701c);
    const top = panel.bodyTop;
    panel.container.add(caption(this, PAD + 4, top + 22, 'ゴールドを使って、レベルを上げます。', { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    // What +1 level does to the two stats that matter.
    const next = EnhanceSystem.statsAfterLevels(hero, 1);
    const rows: [string, string, string][] = [
      ['HP', now.maxHp.toString(), next.maxHp.toString()],
      ['攻撃', now.atk.toString(), next.atk.toString()],
    ];
    rows.forEach(([label, from, to], i) => {
      const y = top + 68 + i * 50;
      panel.container.add(caption(this, PAD + 4, y, label, { fontSize: '22px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      panel.container.add(body(this, PAD + 100, y, from, { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      panel.container.add(body(this, CARD_WIDTH - PAD - 4, y, `→ ${to}`, { fontSize: '26px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
    });
    panel.container.add(caption(this, CARD_WIDTH - PAD - 4, top + 156, '※ 矢印は +1 レベルしたときの数値です', { fontSize: '16px', color: '#a89a78', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));

    const guard = () => this.scroll.isTap();
    const w = (CARD_WIDTH - PAD * 2 - 14) / 2;
    LEVEL_STEPS.forEach((levels, i) => {
      const cost = EnhanceSystem.levelUpCost(hero, levels);
      const affordable = EnhanceSystem.canAfford(this.save, cost);
      const x = PAD + w / 2 + i * (w + 14);
      panel.container.add(
        new Button(this, x, top + bodyH - 62, w, 92, `+${levels} レベル`, () => this.levelUp(hero, levels), {
          variant: i === 0 ? 'gold' : 'wood',
          fontSize: '28px',
          subLabel: `${cost.toLocaleString('ja-JP')} G${affordable ? '' : '（不足）'}`,
          guard,
        }),
      );
    });
    return { container: panel.container, height: panel.height };
  }

  /** フェーズ強化: spend one phase material for +1 phase. */
  private phaseCard(hero: HeroData): InboxCard {
    const maxed = hero.phase >= MAX_PHASE;
    const have = this.save.phaseMaterials;
    const bodyH = 200;
    const panel = buildInfoPanel(this, CARD_WIDTH, bodyH, 'フェーズ強化', 0x6a3fb0);
    const top = panel.bodyTop;
    for (let i = 0; i < MAX_PHASE; i++) {
      const filled = i < hero.phase;
      const px = 30 + i * 36;
      const pts = [new Phaser.Math.Vector2(px, top + 12), new Phaser.Math.Vector2(px + 13, top + 28), new Phaser.Math.Vector2(px, top + 44), new Phaser.Math.Vector2(px - 13, top + 28)];
      const g = this.add.graphics();
      g.fillStyle(filled ? 0xa97bff : 0x1d130a, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2, filled ? 0xe6d6ff : CHROME.brassDark, filled ? 0.9 : 0.8);
      g.strokePoints(pts, true);
      panel.container.add(g);
    }
    panel.container.add(body(this, CARD_WIDTH - PAD - 4, top + 28, `${hero.phase} / ${MAX_PHASE}`, { fontSize: '30px', fontStyle: 'bold', color: '#d9c2ff', stroke: INK, strokeThickness: 5 }).setOrigin(1, 0.5));
    panel.container.add(caption(this, PAD + 4, top + 74, '素材を1つ使うと、フェーズが1上がります。', { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    panel.container.add(caption(this, PAD + 4, top + 104, '同じキャラを合成しても上がります。（下の「合成」）', { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    const guard = () => this.scroll.isTap();
    const button = new Button(this, CARD_WIDTH / 2, top + bodyH - 44, CARD_WIDTH - PAD * 2, 70, maxed ? 'フェーズ最大' : 'フェーズ素材で強化', () => this.raisePhase(hero), {
      variant: 'gold',
      fontSize: '28px',
      subLabel: maxed ? undefined : `素材 ×${have.toLocaleString('ja-JP')}`,
      guard,
    });
    button.setEnabled(!maxed);
    panel.container.add(button);
    return { container: panel.container, height: panel.height };
  }

  /** 合成: fuse another copy of this character (a repeat pull) into this one for
   *  +1 phase each. Tap a copy to use just it, or まとめて合成 for every copy
   *  that isn't standing in a deck. The copies used up are gone. */
  private fuseCard(hero: HeroData): InboxCard {
    const maxed = hero.phase >= MAX_PHASE;
    const materials = maxed ? [] : SaveSystem.fusionMaterials(this.save, hero);
    const bulk = materials.filter((m) => !SaveSystem.isInAnyDeck(this.save, m.id)).slice(0, MAX_PHASE - hero.phase);
    const guard = () => this.scroll.isTap();
    const lines = maxed
      ? ['フェーズが最大のため、合成できません。']
      : materials.length === 0
        ? ['同じキャラのかぶりを持っていません。', 'ガチャで同じキャラが出ると、ここで合成できます。']
        : ['素材にする個体をタップ → フェーズが1上がります。', '素材にした個体は消えます。', '編成中の個体を使うと、この個体が代わりに入ります。'];

    let bodyH = 24 + lines.length * 30;
    const size = HERO_SLOT_SIZE;
    const cols = 5;
    const gapX = (CARD_WIDTH - PAD * 2 - cols * size) / (cols - 1);
    const gridGap = 12;
    const rows = Math.ceil(materials.length / cols);
    if (materials.length > 0) bodyH += 16 + rows * size + (rows - 1) * gridGap + 16 + 70 + 16;

    const panel = buildInfoPanel(this, CARD_WIDTH, bodyH, '合成', 0x2f8f7a);
    const top = panel.bodyTop;
    lines.forEach((text, i) => {
      panel.container.add(caption(this, PAD + 4, top + 22 + i * 30, text, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    });
    if (materials.length === 0) return { container: panel.container, height: panel.height };

    const gridTop = top + 24 + lines.length * 30 + 16;
    materials.forEach((material, i) => {
      const x = PAD + size / 2 + (i % cols) * (size + gapX);
      const y = gridTop + size / 2 + Math.floor(i / cols) * (size + gridGap);
      panel.container.add(
        new HeroSlot(this, x, y, { hero: material, generator: this.generator, inDeck: SaveSystem.isInAnyDeck(this.save, material.id), onTap: () => this.askFuse(hero, [material]), guard }),
      );
    });
    const buttonY = gridTop + rows * size + (rows - 1) * gridGap + 16 + 35;
    const all = new Button(this, CARD_WIDTH / 2, buttonY, CARD_WIDTH - PAD * 2, 70, 'まとめて合成', () => this.askFuse(hero, bulk), {
      variant: 'gold',
      fontSize: '28px',
      subLabel: bulk.length > 0 ? `${bulk.length}体を使用（編成中は除く）` : '編成中以外のかぶりがありません',
      guard,
    });
    all.setEnabled(bulk.length > 0);
    panel.container.add(all);
    return { container: panel.container, height: panel.height };
  }

  // --- actions ----------------------------------------------------------

  /** Confirms before using up copies: they can't be got back. */
  private askFuse(hero: HeroData, materials: HeroData[]): void {
    if (materials.length === 0) return;
    const after = Math.min(MAX_PHASE, hero.phase + materials.length);
    const what =
      materials.length === 1
        ? `Lv.${materials[0].level} の${materials[0].name}を素材にして、`
        : `${materials.length}体を素材にして、`;
    const inDeck = materials.some((m) => SaveSystem.isInAnyDeck(this.save, m.id));
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '合成しますか？',
      message: `${what}\nフェーズ ${hero.phase} → ${after} に上げます。\n素材にした個体は消えます。${inDeck ? '\n（編成中の枠は、この個体に入れ替わります）' : ''}`,
      confirmLabel: '合成する',
      confirmVariant: 'gold',
      onConfirm: () => this.fuse(hero, materials),
    });
  }

  private fuse(hero: HeroData, materials: HeroData[]): void {
    let used = 0;
    for (const material of materials) if (SaveSystem.fuseHero(this.save, hero.id, material.id)) used++;
    if (used === 0) return;
    SaveSystem.save(this.save);
    showToast(this, `合成しました　フェーズ ${hero.phase} になりました`);
    this.queueRender();
  }

  private levelUp(hero: HeroData, levels: number): void {
    const cost = EnhanceSystem.levelUpCost(hero, levels);
    if (!EnhanceSystem.canAfford(this.save, cost)) {
      this.offerGold(cost);
      return;
    }
    const before = hero.level;
    if (EnhanceSystem.levelUp(this.save, hero.id, levels) === null) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    showToast(this, `Lv.${before} → Lv.${hero.level} になりました`);
    this.queueRender();
  }

  private raisePhase(hero: HeroData): void {
    if (hero.phase >= MAX_PHASE) return;
    if (this.save.phaseMaterials <= 0) {
      this.modal?.close();
      this.modal = openConfirm(this, this.scroll, {
        title: 'フェーズ素材が足りません',
        message: 'フェーズ素材を持っていません。\nショップで購入しますか？',
        confirmLabel: 'ショップへ',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Shop', { focus: 'materials' }),
      });
      return;
    }
    if (!SaveSystem.usePhaseMaterial(this.save, hero.id)) return;
    SaveSystem.save(this.save);
    showToast(this, `フェーズ ${hero.phase} になりました`);
    this.queueRender();
  }

  /** Not enough ゴールド for the level-up: offer the shop. */
  private offerGold(cost: number): void {
    const short = Math.max(1, Math.ceil(cost - SaveSystem.getGold(this.save).toNumber()));
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: 'ゴールドが足りません',
      message: `あとゴールド ${short.toLocaleString('ja-JP')} 必要です。\nゴールドを購入しますか？`,
      confirmLabel: 'ゴールドを購入',
      confirmVariant: 'gold',
      onConfirm: () => this.scene.start('Shop', { focus: 'gold' }),
    });
  }
}
