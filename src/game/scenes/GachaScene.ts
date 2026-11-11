import Phaser from 'phaser';
import { SaveSystem, type SaveData, type HeroPullOutcome } from '../systems/SaveSystem';
import { SoundSystem } from '../systems/SoundSystem';
import { SettingsSystem } from '../systems/SettingsSystem';
import { GachaSystem, costOf, pityLeft } from '../systems/GachaSystem';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForEquipment } from '../ui/RewardTiles';
import { getActiveGachaBanners, type GachaBannerEntry } from '../data/gachaBanners';
import { gachaMovieId } from '../data/gachaMovies';
import { playMovieOverlay } from '../ui/MovieOverlay';
import { playGemDrop } from '../ui/GemDrop';
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
import { BattleFx } from '../characters/BattleFx';
import { rainbow } from '../ui/Rainbow';
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
  /** True from a pull being paid until its results are up: a second tap in between does nothing. */
  private pulling = false;

  constructor() {
    super('Gacha');
  }

  create(): void {
    this.pulling = false;
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
    if (this.pulling) return;
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
      this.playPull(entry, count, Math.max(...items.map((i) => Number(i.defId.split('-')[1]))), () => {
        SoundSystem.play(this, items.some((i) => Number(i.defId.split('-')[1]) >= 4) ? 'reveal' : 'confirm');
        this.closeModal();
        this.modal = showRewardModal(this, this.scroll, { title: entry.title, tiles: tilesForEquipment(items), note: '装備はバッグに入りました（装備画面で確認・強化できます）', onClose: () => this.scene.restart() });
      });
      return;
    }
    const heroes = GachaSystem.pullHeroes(save, entry, count);
    const outcomes = heroes.map((hero) => SaveSystem.addHero(save, hero));
    SaveSystem.save(save);
    this.refreshResources();
    this.playPull(entry, count, Math.max(...heroes.map((hero) => hero.rarity)), () => this.showResults(outcomes));
  }

  /** What happens between the tap and the results: the gems are dropped onto the magic circle (a
   *  pile of ten for a ten-pull), then the pull's movie - picked by the best ★ in it (data/gachaMovies)
   *  - and then `show`, which puts the results up underneath as the movie fades. The pull is already
   *  paid and saved. */
  private playPull(entry: GachaBannerEntry, count: 1 | 10, bestRarity: number, show: () => void): void {
    this.pulling = true;
    const layer = playGemDrop(this, {
      count,
      rarity: bestRarity,
      cost: costOf(entry, count),
      onDrop: () => {
        playMovieOverlay(this, gachaMovieId(bestRarity), {
          volume: SettingsSystem.getVolume(this.getSave(), 'se'),
          onEnd: () => {
            this.pulling = false;
            layer.close();
            show();
          },
        });
      },
    });
  }

  private showResults(outcomes: HeroPullOutcome[]): void {
    SoundSystem.play(this, outcomes.some((o) => o.hero.rarity >= 5) ? 'reveal5' : outcomes.some((o) => o.hero.rarity >= 4) ? 'reveal' : 'confirm');
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

      if (hero.rarity >= 6) this.spawnGrandBurst(x, y, 120 * i);
      else if (hero.rarity >= 5) this.spawnBurst(x, y, RARITY_COLORS[hero.rarity], 120 * i);

      const card = new HeroCard(this, x, y, hero, this.generator, 110);
      card.setScale(0);
      container.add(card);
      // Tapping a character opens its detail screen.
      const zone = this.add.zone(x, y, 116, 150).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.openHeroDetail(outcome));
      container.add(zone);
      this.tweens.add({
        targets: card,
        scale: 1,
        duration: 380,
        delay: 120 * i,
        ease: 'Back.easeOut',
        onStart: () => {
          if (hero.rarity >= 6) {
            // ★6: a long white-gold flash and a shake, the biggest moment of the whole screen.
            this.cameras.main.flash(420, 255, 240, 200, false);
            this.cameras.main.shake(520, 0.007);
          } else if (hero.rarity >= 4) this.cameras.main.flash(150, 255, 230, 150, false);
        },
      });
    });

    container.add(caption(this, 360, 1030, 'キャラをタップすると、詳細を見られます', { fontSize: '20px', color: '#d8c49a', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(0.5));
    const closeBtn = new Button(this, 360, 1100, 220, 64, '確認', () => this.closeModal(), { variant: 'gold', fontSize: '24px' });
    container.add(closeBtn);
    closeBtn.setScale(0);
    this.tweens.add({ targets: closeBtn, scale: 1, duration: 300, delay: 120 * outcomes.length + 120, ease: 'Back.easeOut' });
  }

  /** キャラ詳細 of a character that just came out: the copy itself, or - when it was not kept (a
   *  repeat past what can be used) - the best copy held of that character. */
  private openHeroDetail(outcome: HeroPullOutcome): void {
    const save = this.getSave();
    const owned = SaveSystem.getHero(save, outcome.hero.id) ?? [...SaveSystem.getCopies(save, outcome.hero)].sort((a, b) => b.phase - a.phase || b.level - a.level)[0];
    if (!owned) return;
    this.scene.start('HeroDetail', { heroId: owned.id, from: 'Gacha' });
  }

  /** The ★6 reveal: three turns of rainbow rays going out much further than a ★5's, with gold rings spreading behind
   *  them and a shower of sparks - longer and bigger than anything else the screen does. */
  private spawnGrandBurst(x: number, y: number, delay: number): void {
    const layer = this.add.graphics({ x, y }).setDepth(250);
    const rays = 24;
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < rays; i++) {
        const angle = (Math.PI * 2 * (i + round / 3)) / rays;
        const inner = 14 + round * 10;
        const outer = 90 + round * 55 + (i % 2) * 28;
        layer.lineStyle(round === 0 ? 5 : 3, rainbow(i / rays + round * 0.11, 0.6), 0.95);
        layer.beginPath();
        layer.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        layer.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        layer.strokePath();
      }
    }
    layer.setScale(0.25).setAlpha(0);
    this.tweens.add({ targets: layer, scale: 2.1, alpha: { from: 1, to: 0 }, angle: 40, duration: 1100, delay, ease: 'Quad.easeOut', onComplete: () => layer.destroy() });

    for (let k = 0; k < 3; k++) {
      const ring = this.add.circle(x, y, 40, 0xffd23f, 0).setStrokeStyle(6 - k * 1.5, k === 1 ? 0xff4fd8 : 0xffd23f, 0.95).setDepth(249).setAlpha(0);
      this.tweens.add({ targets: ring, scale: 4.2, alpha: { from: 0.95, to: 0 }, duration: 900, delay: delay + k * 180, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    }

    const fx = new BattleFx(this);
    this.time.delayedCall(delay, () => {
      fx.celebrate(x, y, 'gold', true);
      fx.celebrate(x, y, 'violet', true);
    });
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
