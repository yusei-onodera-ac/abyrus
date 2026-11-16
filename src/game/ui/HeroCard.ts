import Phaser from 'phaser';
import { hex, RARITY_COLORS, type HeroData } from '../types';
import type { CharacterGenerator } from '../characters/CharacterGenerator';
import { createPanel } from './Panel';
import { addRainbowFrame } from './Rainbow';
import { COLORS } from './theme';

/** Portrait card used in the roster grid and gacha reveal: a rarity-framed
 *  panel, generated sprite, rarity stars, name/level, and optional HP/ult
 *  bars for reuse in other contexts. Higher rarity gets thicker glow layers
 *  (via Panel's `rarity` option) and a slow pulsing ring, the same "more
 *  decoration at higher rarity" idea CharacterGenerator applies to auras. */
export class HeroCard extends Phaser.GameObjects.Container {
  readonly hero: HeroData;
  readonly portrait: Phaser.GameObjects.Sprite;
  private hpFill: Phaser.GameObjects.Rectangle;
  private ultFill: Phaser.GameObjects.Rectangle;
  private pulseTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, hero: HeroData, generator: CharacterGenerator, width = 96) {
    super(scene, x, y);
    this.hero = hero;
    const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity, hero.heroId);
    const rarityColor = RARITY_COLORS[hero.rarity];
    // A big card (a single pull in the gacha) gets bigger words and bars too, up to twice the size.
    const k = Math.min(2, Math.max(1, width / 110));

    const frame = createPanel(scene, 0, 0, width, width, {
      fillColor: COLORS.panelFill,
      borderColor: rarityColor,
      glowColor: rarityColor,
      radius: Math.max(10, width * 0.14),
      rarity: hero.rarity,
    });
    // The picture a small card shows is the 96px square the generator bakes; a big card (a single pull) shows the
    // character's own full-size picture instead, fitted into the same square, so it stays sharp.
    const art = width >= 150 && scene.textures.exists(hero.heroId) ? scene.textures.getFrame(hero.heroId) : undefined;
    if (art) {
      this.portrait = scene.add.sprite(0, -4, hero.heroId);
      this.portrait.setScale(Math.min((width * 0.8) / art.width, (width * 0.8) / art.height));
    } else {
      this.portrait = scene.add.sprite(0, -4, textureKey).setDisplaySize(width * 0.8, width * 0.8);
    }
    const stars = scene.add.text(0, width / 2 - 14 * k, '★'.repeat(hero.rarity), { fontSize: `${Math.round(12 * k)}px`, color: hex(rarityColor) }).setOrigin(0.5);
    const nameText = scene.add.text(0, -width / 2 + 10 * k, `${hero.name} Lv${hero.level}`, { fontSize: `${Math.round(11 * k)}px`, color: '#ffffff' }).setOrigin(0.5);

    const hpBg = scene.add.rectangle(0, width / 2 - 26 * k, width * 0.8, 6 * k, 0x000000, 0.6).setRounded(3 * k);
    this.hpFill = scene.add.rectangle(-width * 0.4, width / 2 - 26 * k, width * 0.8, 6 * k, 0x4caf50).setOrigin(0, 0.5).setRounded(3 * k);
    this.ultFill = scene.add
      .rectangle(-width * 0.4, width / 2 - 18 * k, width * 0.8, 4 * k, 0xffd23f)
      .setOrigin(0, 0.5)
      .setScale(0, 1)
      .setRounded(2);

    this.add([frame, this.portrait, stars, nameText, hpBg, this.hpFill, this.ultFill]);
    this.setSize(width, width);

    if (hero.rarity === 6) addRainbowFrame(scene, this, width, Math.max(10, width * 0.14), 5);
    if (hero.rarity >= 4) {
      const pulseRing = scene.add.graphics();
      pulseRing.lineStyle(2, rarityColor, 0.8);
      pulseRing.strokeRoundedRect(-width / 2 - 4, -width / 2 - 4, width + 8, width + 8, width * 0.16);
      this.add(pulseRing);
      this.pulseTween = scene.tweens.add({
        targets: pulseRing,
        alpha: { from: 0.75, to: 0.15 },
        duration: 900 + hero.rarity * 60,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.once(Phaser.GameObjects.Events.DESTROY, () => this.pulseTween?.stop());
    }

    scene.add.existing(this);
  }

  setHpRatio(ratio: number): void {
    this.hpFill.setScale(Phaser.Math.Clamp(ratio, 0, 1), 1);
  }

  setUltRatio(ratio: number): void {
    this.ultFill.setScale(Phaser.Math.Clamp(ratio, 0, 1), 1);
  }

  setReadyGlow(ready: boolean): void {
    this.portrait.setTint(ready ? 0xfff2a8 : 0xffffff);
  }
}
