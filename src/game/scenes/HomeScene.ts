import Phaser from 'phaser';
import type { SaveData } from '../systems/SaveSystem';
import { ResourceBar } from '../ui/ResourceBar';
import { IconNavButton } from '../ui/IconNavButton';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { applyBackground } from '../ui/Background';
import { questIcon, gachaIcon, rosterIcon } from '../ui/Icons';
import { caption } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';
import { BottomNavBar } from '../ui/BottomNavBar';
import { RARITY_COLORS, type HeroData } from '../types';

/** Character-first home hub: a big asymmetric portrait of the player's best
 *  hero layered over the background, with a round icon-cluster nav
 *  underneath instead of a stage-select grid (that lives in
 *  StageSelectScene now) or a stack of long rectangle menu buttons. */
export class HomeScene extends Phaser.Scene {
  private resourceBar!: ResourceBar;

  constructor() {
    super('Home');
  }

  create(): void {
    const save = this.getSave();
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'home');

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.resourceBar.update(save);
    enter(this, this.resourceBar, { dy: -20, duration: 300 });

    // The topbar artwork already has its own "ABYRUS" lettering baked in;
    // only draw this standalone wordmark while running on the plain-panel
    // fallback, so the title isn't duplicated once real art is loaded.
    if (!this.resourceBar.hasArt) {
      const wordmark = caption(this, 24, 86, 'ABYRUS', { fontSize: '15px', color: '#9a93b8', fontStyle: 'bold' }).setOrigin(0, 0.5);
      enter(this, wordmark, { dx: -10, dy: 0, duration: 280, delay: 80 });
    }

    this.buildCharacterShowcase(save);
    this.buildNav();
    new BottomNavBar(this, 720, 1280, 'home');
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  /** Highest rarity among owned heroes, ties broken by whichever was added
   *  most recently (heroes are appended on pull/starter-grant, so later
   *  array entries are newer). */
  private pickShowcaseHero(save: SaveData): HeroData | null {
    if (save.heroes.length === 0) return null;
    let best = save.heroes[0];
    for (const hero of save.heroes) {
      if (hero.rarity >= best.rarity) best = hero;
    }
    return best;
  }

  private buildCharacterShowcase(save: SaveData): void {
    const hero = this.pickShowcaseHero(save);
    if (!hero) return;

    // Driven by target HEIGHT, not a width x height bounding box: the
    // reference composition has the hero filling nearly the full screen
    // height (hair near the top, boots near the bottom), right-of-center.
    // A box-fit (min of two ratios) tends to under-fill on one axis
    // whenever the source art's aspect doesn't exactly match the box's,
    // which is what made an earlier version look small.
    const cx = 460;
    const cy = 600;
    let portrait: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

    if (hero.heroId && this.textures.exists(hero.heroId)) {
      // floorY sits above the bottom nav bar, not the screen edge, so the
      // portrait's feet don't land behind it. Measured from the bar itself
      // rather than hardcoded, so it stays correct if that art changes.
      const floorY = 1280 - BottomNavBar.totalHeight() + 6;
      const targetHeight = 960;
      const portraitCy = floorY - targetHeight / 2;
      const shadow = this.add.ellipse(cx, floorY, targetHeight * 0.4, 42, 0x000000, 0.35);
      shadow.setDepth(-1);

      const frame = this.textures.get(hero.heroId).getSourceImage();
      const scale = targetHeight / frame.height;
      portrait = this.add.image(cx, portraitCy, hero.heroId).setScale(scale);
    } else {
      // The procedural portrait is baked at a small, fixed resolution for
      // card-sized use elsewhere (HeroCard, gacha reveals): stretching it to
      // fill a showcase-sized frame just blows up a blurry blob. Cap it to a
      // modest medallion size instead, with its own soft glow backdrop, so a
      // hero without illustrated art still reads as a deliberate placeholder
      // rather than a broken giant sprite.
      const shadow = this.add.ellipse(cx, cy + 103, 330, 42, 0x000000, 0.35);
      shadow.setDepth(-1);

      const medallionSize = 220;
      const glow = this.add.graphics();
      const glowColor = RARITY_COLORS[hero.rarity];
      for (let i = 3; i > 0; i--) {
        glow.fillStyle(glowColor, 0.05 + i * 0.04);
        glow.fillCircle(cx, cy, medallionSize * 0.5 + i * 14);
      }
      const generator = new CharacterGenerator(this);
      const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity, hero.heroId);
      portrait = this.add.sprite(cx, cy, textureKey).setDisplaySize(medallionSize, medallionSize);
    }

    enter(this, portrait, { dy: 26, duration: 480, ease: 'Cubic.easeOut' });
    this.floatIdle(portrait);
  }

  /** Gentle drifting bob so the showcase hero reads as hovering rather than
   *  pasted on flat. Two independent yoyo tweens at different periods, so
   *  the vertical and horizontal drift fall out of phase instead of
   *  tracing a perfectly repeating diagonal line. */
  private floatIdle(target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): void {
    this.tweens.add({ targets: target, y: target.y - 26, duration: 2600, delay: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: target, x: target.x + 16, duration: 3400, delay: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Cascading diamond cluster in the lower-left, overlapping the bottom of
   *  the character showcase. Quest (biggest) sits directly above roster on
   *  a shared centerline; gacha (mid-sized) offsets to the right, bridging
   *  the two with diagonal overlap on both sides. */
  private buildNav(): void {
    const clusterX = 210;
    const size = 300;
    const quest = new IconNavButton(this, clusterX, 655, 'quest', questIcon(this, 90), 'クエスト', size, () => this.scene.start('StageSelect'));
    const gacha = new IconNavButton(this, 415, 810, 'gacha', gachaIcon(this, 90), '召喚', size, () => this.scene.start('Gacha'));
    const roster = new IconNavButton(this, clusterX, 970, 'roster', rosterIcon(this, 90), '名鑑', size, () => this.scene.start('Roster'));
    enterStagger(this, [quest, gacha, roster], { dy: 24, duration: 320, delay: 150, stagger: 60 });
  }
}
