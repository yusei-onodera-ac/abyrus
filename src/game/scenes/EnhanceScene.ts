import Phaser from 'phaser';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { EnhanceSystem } from '../systems/EnhanceSystem';
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
import { playEnhanceFx } from '../ui/EnhanceFx';
import { CLASS_LABELS, MAX_LEVEL, MAX_PHASE, RARITY_COLORS, hex, type HeroData } from '../types';
import { EXP_ITEMS, ITEMS, type ItemId } from '../data/items';
import { phaseFusionCopies, phaseMaterialCost } from '../data/phaseCost';
import { itemIcon } from '../ui/ItemIcons';
import { InboxScene, type InboxCard } from './InboxScene';

interface EnhanceData {
  heroId: string;
  /** The scene the hero detail screen was opened from - 戻る returns there via the detail. */
  from: string;
}

const PAD = 14;
const INK = '#1c130a';

/** 強化: the screen the hero detail's 強化する button opens. Two ways to make a
 *  hero stronger - 経験値素材 for levels (the other way to gain levels is clearing
 *  quests; gold cannot buy them), フェーズ素材でフェーズ強化 (+1 phase for a number of materials that rises
 *  towards MAX_PHASE) and 合成 (+1 phase for a number of same-character copies that rises the same way).
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
    // Opened from the 強化 tab's list: back to it, not by way of the hero's detail.
    if (this.target.from === 'EnhanceHub') this.scene.start('EnhanceHub');
    else this.scene.start('HeroDetail', this.target);
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
    return [this.heroCard(hero), this.expCard(hero), this.phaseCard(hero), this.fuseCard(hero)];
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
    const atMax = hero.level >= MAX_LEVEL;
    container.add(body(this, x, 104, `Lv.${hero.level}`, { fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, right, 110, atMax ? 'レベル最大' : `次のLvまで：${Math.max(0, needed - hero.exp).toLocaleString('ja-JP')}`, { fontSize: '20px', color: atMax ? '#ffd23f' : '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    const barW = right - x;
    const ratio = atMax ? 1 : Phaser.Math.Clamp(hero.exp / needed, 0, 1);
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

  /** 経験値素材: each of the four sizes with how many are held and a button to use one or ten,
   *  under a line saying what the next level gives (levels also come from clearing quests). */
  private expCard(hero: HeroData): InboxCard {
    const guard = () => this.scroll.isTap();
    const rowH = 96;
    const headH = 76;
    const panel = buildInfoPanel(this, CARD_WIDTH, headH + EXP_ITEMS.length * rowH + 14, '経験値素材', 0x3a7fd6);
    const atMax = hero.level >= MAX_LEVEL;
    if (atMax) {
      panel.container.add(caption(this, PAD + 4, panel.bodyTop + 30, `レベルは最大（Lv.${MAX_LEVEL}）です。`, { fontSize: '22px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    } else {
      const now = ProgressionSystem.computeHeroStats(hero);
      const next = EnhanceSystem.statsAfterLevels(hero, 1);
      panel.container.add(caption(this, PAD + 4, panel.bodyTop + 20, 'レベルは、素材を使うか、クエストをクリアすると上がります。', { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      panel.container.add(caption(this, PAD + 4, panel.bodyTop + 52, `次のレベルで　HP ${now.maxHp.toString()} → ${next.maxHp.toString()}　攻撃 ${now.atk.toString()} → ${next.atk.toString()}`, { fontSize: '19px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    }
    EXP_ITEMS.forEach((id, i) => {
      const def = ITEMS[id];
      const have = SaveSystem.getItem(this.save, id);
      const y = panel.bodyTop + headH + 8 + i * rowH + rowH / 2;
      panel.container.add(this.add.image(PAD + 34, y, itemIcon(this, id, 56)));
      panel.container.add(body(this, PAD + 76, y - 17, def.name, { fontSize: '22px', fontStyle: 'bold', color: def.color, stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      panel.container.add(caption(this, PAD + 76, y + 15, `EXP +${(def.exp ?? 0).toLocaleString('ja-JP')}　所持 ${have.toLocaleString('ja-JP')}`, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      [1, 10].forEach((count, k) => {
        // ×10 sits at the right edge, ×1 just left of it.
        const x = CARD_WIDTH - PAD - 52 - (1 - k) * 114;
        const button = new Button(this, x, y, 104, 62, `×${count}`, () => this.useExp(hero, id, count), { variant: k === 0 ? 'gold' : 'wood', fontSize: '24px', guard });
        button.setEnabled(have > 0 && !atMax);
        panel.container.add(button);
      });
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
    const cost = maxed ? 0 : phaseMaterialCost(hero.phase);
    const enough = have >= cost;
    panel.container.add(
      caption(this, PAD + 4, top + 74, maxed ? 'フェーズは最大です。' : `フェーズ ${hero.phase} → ${hero.phase + 1} に、素材が ${cost}個 要ります。`, { fontSize: '20px', fontStyle: 'bold', color: maxed ? '#ffd23f' : enough ? '#9fe39f' : '#ff9a8a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5),
    );
    panel.container.add(caption(this, PAD + 4, top + 104, maxed ? '' : '上のフェーズほど、多く要ります。同じキャラの合成でも上がります。', { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    const guard = () => this.scroll.isTap();
    const button = new Button(this, CARD_WIDTH / 2, top + bodyH - 44, CARD_WIDTH - PAD * 2, 70, maxed ? 'フェーズ最大' : 'フェーズ素材で強化', () => this.raisePhase(hero), {
      variant: 'gold',
      fontSize: '28px',
      subLabel: maxed ? undefined : `素材 ${have.toLocaleString('ja-JP')} / 必要 ${cost}`,
      guard,
    });
    button.setEnabled(!maxed);
    panel.container.add(button);
    return { container: panel.container, height: panel.height };
  }

  /** 合成: fuse other copies of this character (repeat pulls) into this one: the nearer MAX_PHASE, the more copies one
   *  phase takes (data/phaseCost.ts). Tap a copy to use it (and the next ones, if more are needed), or まとめて合成 for
   *  as many phases as the copies that aren't standing in a deck allow. The copies used up are gone. */
  private fuseCard(hero: HeroData): InboxCard {
    const maxed = hero.phase >= MAX_PHASE;
    const materials = maxed ? [] : SaveSystem.fusionMaterials(this.save, hero);
    const spare = materials.filter((m) => !SaveSystem.isInAnyDeck(this.save, m.id));
    const bulk = this.bulkFusion(hero, spare);
    const need = maxed ? 0 : phaseFusionCopies(hero.phase);
    const guard = () => this.scroll.isTap();
    const lines = maxed
      ? ['フェーズが最大のため、合成できません。']
      : materials.length === 0
        ? [`フェーズ ${hero.phase} → ${hero.phase + 1} の合成には、同じキャラが ${need}体 要ります。`, '同じキャラのかぶりを持っていません。']
        : [
            `フェーズ ${hero.phase} → ${hero.phase + 1} の合成には、同じキャラが ${need}体 要ります。${materials.length < need ? `（あと ${need - materials.length}体）` : ''}`,
            need > 1 ? '素材にする個体をタップ → 足りない分は、ほかの個体も使います。' : '素材にする個体をタップ → フェーズが1上がります。',
            '使った個体は消えます。編成中の個体は、この個体に入れ替わります。',
          ];

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
        new HeroSlot(this, x, y, { hero: material, generator: this.generator, inDeck: SaveSystem.isInAnyDeck(this.save, material.id), onTap: () => this.askFuseWith(hero, material, materials), guard }),
      );
    });
    const buttonY = gridTop + rows * size + (rows - 1) * gridGap + 16 + 35;
    const bulkCopies = bulk.reduce((n, g) => n + g.length, 0);
    const all = new Button(this, CARD_WIDTH / 2, buttonY, CARD_WIDTH - PAD * 2, 70, 'まとめて合成', () => this.askFuse(hero, bulk), {
      variant: 'gold',
      fontSize: '28px',
      subLabel: bulk.length > 0 ? `フェーズ+${bulk.length}（${bulkCopies}体を使用・編成中は除く）` : '編成中以外のかぶりでは足りません',
      guard,
    });
    all.setEnabled(bulk.length > 0);
    panel.container.add(all);
    return { container: panel.container, height: panel.height };
  }

  // --- actions ----------------------------------------------------------

  /** The copies, in groups - one group for each phase they pay for (the first group is what the next phase takes, the
   *  next group what the phase after takes ...) - for as many phases as `spare` copies reach. */
  private bulkFusion(hero: HeroData, spare: HeroData[]): HeroData[][] {
    const groups: HeroData[][] = [];
    let at = 0;
    for (let phase = hero.phase; phase < MAX_PHASE; phase++) {
      const need = phaseFusionCopies(phase);
      if (at + need > spare.length) break;
      groups.push(spare.slice(at, at + need));
      at += need;
    }
    return groups;
  }

  /** A copy was tapped: it, and the cheapest other copies if the phase takes more than one. */
  private askFuseWith(hero: HeroData, tapped: HeroData, all: HeroData[]): void {
    const need = phaseFusionCopies(hero.phase);
    if (all.length < need) {
      showToast(this, `あと ${need - all.length}体 要ります（フェーズ ${hero.phase} → ${hero.phase + 1}）`, '#ffb0a0');
      return;
    }
    const group = [tapped, ...all.filter((m) => m.id !== tapped.id)].slice(0, need);
    this.askFuse(hero, [group]);
  }

  /** Confirms before using up copies: they can't be got back. Each group of copies pays for one phase. */
  private askFuse(hero: HeroData, groups: HeroData[][]): void {
    if (groups.length === 0) return;
    const materials = groups.flat();
    const after = Math.min(MAX_PHASE, hero.phase + groups.length);
    const what = materials.length === 1 ? `Lv.${materials[0].level} の${materials[0].name}を素材にして、` : `${materials.length}体を素材にして、`;
    const inDeck = materials.some((m) => SaveSystem.isInAnyDeck(this.save, m.id));
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '合成しますか？',
      message: `${what}\nフェーズ ${hero.phase} → ${after} に上げます。\n素材にした個体は消えます。${inDeck ? '\n（編成中の枠は、この個体に入れ替わります）' : ''}`,
      confirmLabel: '合成する',
      confirmVariant: 'gold',
      onConfirm: () => this.fuse(hero, groups),
    });
  }

  private fuse(hero: HeroData, groups: HeroData[][]): void {
    let done = 0;
    const from = hero.phase;
    const used: HeroData[] = [];
    for (const group of groups) {
      if (!SaveSystem.fuseHero(this.save, hero.id, group.map((m) => m.id))) break;
      done++;
      used.push(...group);
    }
    if (done === 0) return;
    SaveSystem.save(this.save);
    this.queueRender();
    playEnhanceFx(this, { kind: 'fuse', hero, generator: this.generator, from, to: hero.phase, materials: used });
  }

  private useExp(hero: HeroData, id: ItemId, count: number): void {
    const before = hero.level;
    const statsBefore = ProgressionSystem.computeHeroStats(hero);
    const result = EnhanceSystem.useExpItem(this.save, hero.id, id, count);
    if (result.used === 0) return;
    SaveSystem.save(this.save);
    this.queueRender();
    if (hero.level > before) {
      const now = ProgressionSystem.computeHeroStats(hero);
      playEnhanceFx(this, {
        kind: 'level',
        hero,
        generator: this.generator,
        from: before,
        to: hero.level,
        lines: [`HP ${statsBefore.maxHp.toString()} → ${now.maxHp.toString()}`, `攻撃 ${statsBefore.atk.toString()} → ${now.atk.toString()}`],
      });
    } else {
      showToast(this, `経験値 +${result.gained.toLocaleString('ja-JP')}`);
    }
  }

  private raisePhase(hero: HeroData): void {
    if (hero.phase >= MAX_PHASE) return;
    const cost = phaseMaterialCost(hero.phase);
    const have = this.save.phaseMaterials;
    this.modal?.close();
    if (have < cost) {
      this.modal = openConfirm(this, this.scroll, {
        title: 'フェーズ素材が足りません',
        message: `フェーズ ${hero.phase} → ${hero.phase + 1} には、素材が ${cost}個 要ります。\n（いま ${have}個）\nショップで購入しますか？`,
        confirmLabel: 'ショップへ',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Shop', { focus: 'materials' }),
      });
      return;
    }
    this.modal = openConfirm(this, this.scroll, {
      title: 'フェーズを上げますか？',
      message: `フェーズ素材を ${cost}個 使って、\nフェーズ ${hero.phase} → ${hero.phase + 1} に上げます。\n（いま ${have}個 → ${have - cost}個）`,
      confirmLabel: '上げる',
      confirmVariant: 'gold',
      onConfirm: () => {
        const from = hero.phase;
        if (!SaveSystem.usePhaseMaterial(this.save, hero.id)) return;
        SaveSystem.save(this.save);
        this.queueRender();
        playEnhanceFx(this, { kind: 'phase', hero, generator: this.generator, from, to: hero.phase });
      },
    });
  }
}
