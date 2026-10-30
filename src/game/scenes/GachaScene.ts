import Phaser from 'phaser';
import { SaveSystem, type SaveData, type HeroPullOutcome } from '../systems/SaveSystem';
import { SoundSystem } from '../systems/SoundSystem';
import { GachaSystem, costOf, pityLeft } from '../systems/GachaSystem';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForEquipment } from '../ui/RewardTiles';
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
import { applyBackground } from '../ui/Background';
import { caption } from '../ui/theme';
import { RARITY_COLORS } from '../types';
import { enter, enterStagger } from '../ui/Transitions';

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
        onDetail: () => this.scene.start('GachaDetail', { bannerId: entry.id }),
        onSingle: () => this.doPull(entry, 1),
        onTen: () => this.doPull(entry, 10),
        pityLeft: pityLeft(this.getSave(), entry) ?? undefined,
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

  /** One pull or a ten-pull of `entry`: pays its price, rolls with its own rates and 天井 (see
   *  GachaSystem), and shows what came out. */
  private doPull(entry: GachaBannerEntry, count: 1 | 10): void {
    const save = this.getSave();
    if (!SaveSystem.spendGems(save, costOf(entry, count))) {
      showToast(this, '魔晶石が足りません', '#ff8a8a');
      return;
    }
    if (entry.kind === 'equipment') {
      const items = GachaSystem.pullEquipment(save, entry, count);
      save.equipment.push(...items);
      SaveSystem.save(save);
      this.refreshResources();
      SoundSystem.play(this, items.some((i) => Number(i.defId.split('-')[1]) >= 4) ? 'reveal' : 'confirm');
      this.closeModal();
      this.modal = showRewardModal(this, this.scroll, { title: entry.title, tiles: tilesForEquipment(items), note: '装備はバッグに入りました（装備画面で確認・強化できます）', onClose: () => this.scene.restart() });
      return;
    }
    const heroes = GachaSystem.pullHeroes(save, entry, count);
    const outcomes = heroes.map((hero) => SaveSystem.addHero(save, hero));
    SaveSystem.save(save);
    this.refreshResources();
    this.showResults(outcomes);
  }

  private showResults(outcomes: HeroPullOutcome[]): void {
    SoundSystem.play(this, outcomes.some((o) => o.hero.rarity >= 4) ? 'reveal' : 'confirm');
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
