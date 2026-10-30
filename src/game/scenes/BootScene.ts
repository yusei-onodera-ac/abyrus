import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { applyMockFromUrl, battleFromUrl } from '../systems/MockSave';
import { openingRoute } from '../systems/QuestRoute';
import { TutorialDirector } from '../systems/TutorialDirector';
import { parseFriendInput } from '../systems/SocialSystem';
import { HERO_ROSTER } from '../data/heroes';
import { ENEMY_ART_IDS } from '../data/regions';
import { preloadEnemyArt } from '../characters/EnemyArt';
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
import { heading, caption, COLORS } from '../ui/theme';

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
    preloadBanners(this, BANNERS);
    preloadGachaArt(this, GACHA_BANNERS);
    preloadNoticeArt(this);
    // The tutorial guide's own art, if supplied (otherwise she is drawn from code).
    this.load.image('pet_guide', '/assets/ui/pet_guide.png');
    preloadEventArt(this, EVENTS);
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
    heading(this, 360, 560, 'ABYRUS', { fontSize: '46px' }).setOrigin(0.5);
    caption(this, 360, 610, '無限算盤の子', { fontSize: '14px' }).setOrigin(0.5);

    const barWidth = 360;
    const barHeight = 10;
    const barY = 690;
    this.add.rectangle(360, barY, barWidth, barHeight, 0x1b1d29, 0.9).setStrokeStyle(1, COLORS.border);
    const fill = this.add.rectangle(360 - barWidth / 2, barY, barWidth, barHeight - 4, COLORS.accentBright).setOrigin(0, 0.5).setScale(0, 1);
    const percentLabel = caption(this, 360, barY + 26, '0%').setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      fill.setScale(value, 1);
      percentLabel.setText(`${Math.round(value * 100)}%`);
    });
  }
}
