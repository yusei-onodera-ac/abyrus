import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { ResourceBar } from '../ui/ResourceBar';
import { IconNavButton } from '../ui/IconNavButton';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { applyBackground } from '../ui/Background';
import { questIcon, gachaIcon, rosterIcon } from '../ui/Icons';
import { caption } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';
import type { HeroData } from '../types';

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
    this.resourceBar.update(SaveSystem.getGold(save), save.gems);
    enter(this, this.resourceBar, { dy: -20, duration: 300 });

    const wordmark = caption(this, 24, 86, 'ABYRUS', { fontSize: '15px', color: '#9a93b8', fontStyle: 'bold' }).setOrigin(0, 0.5);
    enter(this, wordmark, { dx: -10, dy: 0, duration: 280, delay: 80 });

    this.buildCharacterShowcase(save);
    this.buildNav();
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

    const cx = 460;
    const cy = 520;
    const frameW = 480;
    const frameH = 680;

    const shadow = this.add.ellipse(cx, cy + frameH * 0.47, frameW * 0.55, 42, 0x000000, 0.35);
    shadow.setDepth(-1);

    let portrait: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    if (hero.heroId && this.textures.exists(hero.heroId)) {
      const frame = this.textures.get(hero.heroId).getSourceImage();
      const scale = Math.min(frameW / frame.width, frameH / frame.height);
      portrait = this.add.image(cx, cy, hero.heroId).setScale(scale);
    } else {
      const generator = new CharacterGenerator(this);
      const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity, hero.heroId);
      const fallbackSize = Math.min(frameW, frameH) * 0.78;
      portrait = this.add.sprite(cx, cy, textureKey).setDisplaySize(fallbackSize, fallbackSize);
    }
    enter(this, portrait, { dy: 26, duration: 480, ease: 'Cubic.easeOut' });
  }

  private buildNav(): void {
    const y = 1160;
    const quest = new IconNavButton(this, 360, y, questIcon(this, 108), 'クエスト', 108, () => this.scene.start('StageSelect'));
    const gacha = new IconNavButton(this, 192, y, gachaIcon(this, 84), '召喚', 84, () => this.scene.start('Gacha'));
    const roster = new IconNavButton(this, 528, y, rosterIcon(this, 84), '名鑑', 84, () => this.scene.start('Roster'));
    enterStagger(this, [gacha, quest, roster], { dy: 24, duration: 320, delay: 150, stagger: 60 });
  }
}
