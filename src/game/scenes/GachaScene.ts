import Phaser from 'phaser';
import { SaveSystem, type SaveData, type HeroPullOutcome } from '../systems/SaveSystem';
import { GachaSystem, GACHA_RATES, SINGLE_PULL_COST, TEN_PULL_COST } from '../systems/GachaSystem';
import { getActiveGachaBanners, type GachaBannerEntry } from '../data/gachaBanners';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { ResourceBar } from '../ui/ResourceBar';
import { BottomNavBar } from '../ui/BottomNavBar';
import { BackButton } from '../ui/BackButton';
import { HeroCard } from '../ui/HeroCard';
import { Button } from '../ui/Button';
import type { ScrollView } from '../ui/ScrollView';
import { buildFriendGachaRow, buildGachaBannerCard } from '../ui/GachaPanels';
import { buildTitlePlate, buildFramedScrollView, CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { openModal, type ModalHandle } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { heading, caption, body, CHROME } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';
import { RARITY_COLORS, hex } from '../types';

const INK = '#1c130a';

const LIST_GAP = 14;

/** Gacha hub: a scrolling list of the currently running gachas, each with its
 *  own banner art, 詳細 (odds) and pull buttons. Top/bottom bars are the
 *  shared HUD pieces; this scene only owns what's between them. */
export class GachaScene extends Phaser.Scene {
  private generator!: CharacterGenerator;
  private resourceBar!: ResourceBar;
  private scroll!: ScrollView;
  private modal?: ModalHandle;

  constructor() {
    super('Gacha');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'gacha');

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.refreshResources();
    enter(this, this.resourceBar, { dy: -20, duration: 280 });

    buildTitlePlate(this, 'ガチャ');
    this.buildList();
    new BottomNavBar(this, 720, 1280, null);
    enter(this, new BackButton(this, () => this.scene.start('Home')), { dx: -40, dy: 0, duration: 300, delay: 250 });
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  private refreshResources(): void {
    this.resourceBar.update(this.getSave());
  }

  private buildList(): void {
    this.scroll = buildFramedScrollView(this);
    const guard = () => this.scroll.isTap();
    const left = (SCREEN_VIEW.w - CARD_WIDTH) / 2;
    const rows: Phaser.GameObjects.Container[] = [];
    let y = left;

    const friend = buildFriendGachaRow(this, () => showToast(this, 'フレンドガチャ: 準備中です'), guard);
    friend.container.setPosition(left, y);
    rows.push(friend.container);
    y += friend.height + LIST_GAP;

    const banners = getActiveGachaBanners();
    for (const entry of banners) {
      const card = buildGachaBannerCard(this, entry, {
        onDetail: () => this.showDetail(entry),
        onSingle: () => this.doPull(1, SINGLE_PULL_COST),
        onTen: () => this.doPull(10, TEN_PULL_COST),
        guard,
      });
      card.container.setPosition(left, y);
      rows.push(card.container);
      y += card.height + LIST_GAP;
    }

    if (banners.length === 0) {
      this.scroll.content.add(caption(this, SCREEN_VIEW.w / 2, y + 60, '開催中のガチャはありません', { fontSize: '20px', color: '#9a8a6a' }).setOrigin(0.5));
      y += 120;
    }

    this.scroll.content.add(rows);
    this.scroll.setContentHeight(y - LIST_GAP + left);
    enterStagger(this, rows, { dy: 24, duration: 320, delay: 160, stagger: 70 });
  }

  /** Opens a popup layer (see ui/Modal) and returns the container to fill. */
  private openModal(dimAlpha: number, dismissOnDimTap = false): Phaser.GameObjects.Container {
    this.closeModal();
    this.modal = openModal(this, this.scroll, dimAlpha, dismissOnDimTap);
    return this.modal.container;
  }

  private closeModal(): void {
    this.modal?.close();
    this.modal = undefined;
  }

  /** The odds popup behind each card's 詳細 button. Rates come straight from
   *  GACHA_RATES - the same table the pull itself rolls against - since
   *  disclosing them is required (Japan's 景品表示法). */
  private showDetail(entry: GachaBannerEntry): void {
    const modal = this.openModal(0.7, true);
    const w = 580;
    const rowH = 54;
    const h = 150 + GACHA_RATES.length * rowH + 100;
    const cy = 620;
    const top = cy - h / 2;

    const panel = createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false });
    // Swallows taps so touching the panel itself doesn't dismiss the popup.
    const block = this.add.zone(360, cy, w, h).setInteractive();
    modal.add([panel, block]);

    modal.add(heading(this, 360, top + 48, '排出率', { fontSize: '34px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    modal.add(caption(this, 360, top + 94, entry.title, { fontSize: '18px', color: '#d8c49a' }).setOrigin(0.5));

    let y = top + 150 + rowH / 2;
    for (const rate of GACHA_RATES) {
      modal.add(this.add.text(360 - w / 2 + 60, y, '★'.repeat(rate.rarity), { fontSize: '24px', color: hex(RARITY_COLORS[rate.rarity]), stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      modal.add(body(this, 360 + w / 2 - 60, y, `${(rate.rate * 100).toFixed(1)}%`, { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
      y += rowH;
    }

    modal.add(new Button(this, 360, top + h - 56, 240, 68, '閉じる', () => this.closeModal(), { variant: 'wood', fontSize: '24px' }));
  }

  private doPull(count: number, cost: number): void {
    const save = this.getSave();
    if (!SaveSystem.spendGems(save, cost)) {
      showToast(this, '魔晶石が足りません', '#ff8a8a');
      return;
    }
    const results = GachaSystem.pullMany(count);
    const outcomes = results.map((hero) => SaveSystem.addHero(save, hero));
    SaveSystem.save(save);
    this.refreshResources();
    this.showResults(outcomes);
  }

  private showResults(outcomes: HeroPullOutcome[]): void {
    const container = this.openModal(0.78);

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
      if (outcome.kind !== 'new') {
        const text = outcome.kind === 'copy' ? '合成素材に追加' : `上限のため +${outcome.duplicateGold.toString()}G`;
        const color = outcome.kind === 'copy' ? '#9fe39f' : '#ffd23f';
        container.add(caption(this, x, y + 70, text, { fontSize: '15px', color, stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0.5));
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

    const closeBtn = new Button(this, 360, 1100, 220, 64, '閉じる', () => this.closeModal(), { variant: 'gold', fontSize: '24px' });
    container.add(closeBtn);
    closeBtn.setScale(0);
    this.tweens.add({ targets: closeBtn, scale: 1, duration: 300, delay: 120 * outcomes.length + 120, ease: 'Back.easeOut' });
  }

  /** Radial burst of fading lines for the biggest pulls, so a 5-star
   *  reveal feels like more of an event than a same-shaped card pop. */
  private spawnBurst(x: number, y: number, color: number, delay: number): void {
    // Above the result modal (depth 200), which the cards live in.
    const g = this.add.graphics({ x, y }).setDepth(250);
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
