import Phaser from 'phaser';
import { hex, RARITY_COLORS, type HeroData } from '../types';
import type { CharacterGenerator } from '../characters/CharacterGenerator';
import { createPanel } from './Panel';
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

    const frame = createPanel(scene, 0, 0, width, width, {
      fillColor: COLORS.panelFill,
      borderColor: rarityColor,
      glowColor: rarityColor,
      radius: Math.max(10, width * 0.14),
      rarity: hero.rarity,
    });
    this.portrait = scene.add.sprite(0, -4, textureKey).setDisplaySize(width * 0.8, width * 0.8);
    const stars = scene.add.text(0, width / 2 - 14, '★'.repeat(hero.rarity), { fontSize: '12px', color: hex(rarityColor) }).setOrigin(0.5);
    const nameText = scene.add.text(0, -width / 2 + 10, `${hero.name} Lv${hero.level}`, { fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);

    const hpBg = scene.add.rectangle(0, width / 2 - 26, width * 0.8, 6, 0x000000, 0.6).setRounded(3);
    this.hpFill = scene.add.rectangle(-width * 0.4, width / 2 - 26, width * 0.8, 6, 0x4caf50).setOrigin(0, 0.5).setRounded(3);
    this.ultFill = scene.add
      .rectangle(-width * 0.4, width / 2 - 18, width * 0.8, 4, 0xffd23f)
      .setOrigin(0, 0.5)
      .setScale(0, 1)
      .setRounded(2);

    this.add([frame, this.portrait, stars, nameText, hpBg, this.hpFill, this.ultFill]);
    this.setSize(width, width);

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
