import Phaser from 'phaser';
import { RARITY_COLORS, type HeroData } from '../types';
import type { CharacterGenerator } from '../characters/CharacterGenerator';

/** Portrait card used in the roster grid and gacha reveal: frame, generated
 *  sprite, rarity stars, name/level, and optional HP/ult bars for reuse in
 *  other contexts. */
export class HeroCard extends Phaser.GameObjects.Container {
  readonly hero: HeroData;
  readonly portrait: Phaser.GameObjects.Sprite;
  private hpFill: Phaser.GameObjects.Rectangle;
  private ultFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, hero: HeroData, generator: CharacterGenerator, width = 96) {
    super(scene, x, y);
    this.hero = hero;
    const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity, hero.heroId);

    const frame = scene.add.rectangle(0, 0, width, width, 0x1b1d29, 0.9).setStrokeStyle(3, RARITY_COLORS[hero.rarity]);
    this.portrait = scene.add.sprite(0, -4, textureKey).setDisplaySize(width * 0.8, width * 0.8);
    const stars = scene.add.text(0, width / 2 - 14, '★'.repeat(hero.rarity), { fontSize: '12px', color: '#ffd23f' }).setOrigin(0.5);
    const nameText = scene.add.text(0, -width / 2 + 10, `${hero.name} Lv${hero.level}`, { fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);

    const hpBg = scene.add.rectangle(0, width / 2 - 26, width * 0.8, 6, 0x000000, 0.6);
    this.hpFill = scene.add.rectangle(-width * 0.4, width / 2 - 26, width * 0.8, 6, 0x4caf50).setOrigin(0, 0.5);
    this.ultFill = scene.add.rectangle(-width * 0.4, width / 2 - 18, width * 0.8, 4, 0xffd23f).setOrigin(0, 0.5).setScale(0, 1);

    this.add([frame, this.portrait, stars, nameText, hpBg, this.hpFill, this.ultFill]);
    this.setSize(width, width);
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
