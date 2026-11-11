import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { applyMockFromUrl, battleFromUrl } from '../systems/MockSave';
import { openingRoute } from '../systems/QuestRoute';
import { TutorialDirector } from '../systems/TutorialDirector';
import { MusicDirector } from '../systems/MusicSystem';
import { parseFriendInput } from '../systems/SocialSystem';
import { HERO_ROSTER } from '../data/heroes';
import { ENEMY_ART_IDS } from '../data/regions';
import { preloadEnemyArt } from '../characters/EnemyArt';
import { preloadEquipArt, preloadItemArt } from '../ui/ItemIcons';
import { preloadVillageArt } from '../ui/VillageArt';
import { preloadPetArt } from '../ui/PetPortrait';
import { preloadBackgrounds } from '../ui/Background';
import { preloadButtonAssets } from '../ui/ButtonAssets';
import { preloadIconAssets } from '../ui/IconAssets';
import { preloadBanners } from '../ui/BannerCarousel';
import { BANNERS } from '../data/banners';
import { preloadGachaArt } from '../ui/GachaPanels';
import { GACHA_BANNERS } from '../data/gachaBanners';
import { preloadNoticeArt } from './NoticeScene';
import { preloadEventArt } from '../ui/EventPanels';
import { EVENTS } from '../data/events';
import { heading, caption, CHROME } from '../ui/theme';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Illustration PNGs and background artwork are optional: most heroes
    // and screens won't have one yet, and a missing file must not break the
    // load queue. CharacterGenerator/applyBackground fall back to
    // procedural art or a solid color whenever the texture failed to load.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});

    this.buildLoadingUi();

    for (const hero of HERO_ROSTER) {
      this.load.image(hero.id, `/assets/characters/${hero.id}.png`);
    }
    preloadBackgrounds(this);
    preloadButtonAssets(this);
    preloadIconAssets(this);
    this.load.image('topbar', '/assets/ui/topbar.png');
    for (const tab of ['event', 'friend', 'home', 'enhance', 'shop']) {
      this.load.image(`tab_${tab}`, `/assets/ui/tab_${tab}.png`);
    }
    this.load.image('currency_coin', '/assets/ui/coin.png');
    this.load.image('currency_gem', '/assets/ui/gem.png');
    this.load.image('currency_stamina', '/assets/ui/stamina.png');
    preloadEnemyArt(this, ENEMY_ART_IDS);
    preloadItemArt(this);
    preloadEquipArt(this);
    preloadVillageArt(this);
    preloadBanners(this, BANNERS);
    preloadGachaArt(this, GACHA_BANNERS);
    preloadNoticeArt(this);
    // ルリ's expressions (public/assets/pet/<mood>.png), if supplied (otherwise she is drawn from code).
    preloadPetArt(this);
    preloadEventArt(this, EVENTS);
    // The banner at the top of the プレミアムパス screen (optional, like the other pictures).
    this.load.image('premium_header', '/assets/events/premium_header.jpg');
  }

  create(): void {
    const save = SaveSystem.load();
    applyMockFromUrl(save);
    this.game.registry.set('save', save);
    // Opened from someone's share link (...?friend=ID): go straight to the
    // 追加 tab with their ID filled in, and tidy the address bar so a reload
    // doesn't offer it again.
    const code = new URLSearchParams(location.search).get('friend');
    const friendId = code ? parseFriendInput(code) : null;
    if (code) history.replaceState(null, '', location.pathname);
    TutorialDirector.install(this.game);
    MusicDirector.install(this.game);
    const battle = battleFromUrl();
    if (battle) this.scene.start(battle.scene, battle.data);
    else if (friendId) this.scene.start('Friend', { tab: 'add', prefill: friendId });
    // The very first launch: the opening story, which ends at Home where the tutorial starts.
    else if (!save.tutorial.opening) {
      const route = openingRoute();
      this.scene.start(route.scene, route.data);
    } else this.scene.start('Home');
  }

  private buildLoadingUi(): void {
    this.cameras.main.setBackgroundColor('#0a0b12');
    // Until the pictures below are in (they are the first things asked for), a plain centred title and bar.
    const title = heading(this, 360, 560, 'ABYRUS', { fontSize: '46px' }).setOrigin(0.5).setDepth(5);
    const tagline = caption(this, 360, 610, '無限算盤の子', { fontSize: '14px' }).setOrigin(0.5).setDepth(5);

    const barW = 420;
    const barH = 16;
    let barY = 690;
    let progress = 0;
    const bar = this.add.graphics().setDepth(5);
    const label = caption(this, 360, 0, '0%', { fontSize: '20px', color: '#f0dfb0', stroke: '#0a0b12', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
    const left = 360 - barW / 2;
    const drawBar = (): void => {
      bar.clear();
      bar.fillStyle(0x0a0b12, 0.85);
      bar.fillRoundedRect(left - 5, barY - barH / 2 - 5, barW + 10, barH + 10, 13);
      bar.fillStyle(0x1b1d29, 1);
      bar.fillRoundedRect(left, barY - barH / 2, barW, barH, 8);
      if (progress > 0) {
        const w = Math.max(16, barW * progress);
        bar.fillStyle(0xe0822a, 1);
        bar.fillRoundedRect(left, barY - barH / 2, w, barH, 8);
        bar.fillStyle(0xffffff, 0.28);
        bar.fillRoundedRect(left + 2, barY - barH / 2 + 2, Math.max(12, w - 4), barH / 2 - 2, 4);
      }
      bar.lineStyle(2, CHROME.brass, 1);
      bar.strokeRoundedRect(left - 1, barY - barH / 2 - 1, barW + 2, barH + 2, 9);
      label.setY(barY + 32);
    };
    drawBar();

    // Key art (public/assets/ui/loading.jpg) behind everything, the bar on its dark band at the bottom; and the logo
    // (public/assets/ui/logo.png) in place of the plain title, with a slow golden shimmer. Both are optional.
    const artKey = 'loading_art';
    const logoKey = 'loading_logo';
    let artReady = false;
    let logo: Phaser.GameObjects.Image | undefined;
    let shimmer: Phaser.GameObjects.Image | undefined;
    const layout = (): void => {
      if (artReady) barY = 1200;
      if (logo && shimmer) {
        const y = artReady ? 172 : 330;
        logo.setY(y);
        shimmer.setY(y);
        tagline.setY(y + logo.displayHeight / 2 + 26);
      }
      drawBar();
    };
    this.load.image(artKey, '/assets/ui/loading.jpg');
    this.load.image(logoKey, '/assets/ui/logo.png');
    this.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${artKey}`, () => {
      this.add.image(360, 640, artKey).setDisplaySize(720, 1280).setDepth(-10);
      artReady = true;
      layout();
    });
    this.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${logoKey}`, () => {
      title.setVisible(false);
      const scale = 450 / this.textures.get(logoKey).getSourceImage().width;
      logo = this.add.image(360, 172, logoKey).setScale(scale * 0.94).setAlpha(0).setDepth(7);
      shimmer = this.add.image(360, 172, logoKey).setScale(scale * 0.94).setAlpha(0).setDepth(6).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd98a);
      this.tweens.add({ targets: logo, alpha: 1, scale, duration: 600, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: shimmer, alpha: { from: 0, to: 0.32 }, scale: scale * 1.03, duration: 1500, delay: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      tagline.setFontSize(24).setColor('#f0dfb0').setStroke('#0a0b12', 6);
      layout();
    });

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      progress = value;
      label.setText(`${Math.round(value * 100)}%`);
      drawBar();
    });
  }
}
