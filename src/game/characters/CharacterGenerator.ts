import Phaser from 'phaser';
import { RARITY_COLORS, type HeroClass, type Rarity } from '../types';

/** Deterministic PRNG so the same seed always draws the same character. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedCharacter {
  textureKey: string;
  size: number;
}

const SIZE = 96;
const CENTER = SIZE / 2;

const SILHOUETTES: Record<HeroClass, 'round' | 'broad' | 'slim'> = {
  warrior: 'broad',
  tank: 'broad',
  mage: 'slim',
  archer: 'slim',
  healer: 'round',
};

/**
 * Builds hero/enemy portraits. When a roster hero's illustration
 * (`assets/characters/<heroId>.png`) has been loaded, that artwork is used;
 * otherwise falls back to procedural shapes composited purely from Graphics,
 * so the game never breaks for a hero whose art hasn't been drawn yet. Four
 * layers make up the procedural fallback, in order: aura (rarity glow) ->
 * silhouette -> weapon -> accessory.
 */
export class CharacterGenerator {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  generate(seed: number, heroClass: HeroClass, rarity: Rarity, heroId?: string): GeneratedCharacter {
    if (heroId && this.scene.textures.exists(heroId)) {
      return { textureKey: this.illustrationTexture(heroId), size: SIZE };
    }
    const key = `char_${heroClass}_${rarity}_${seed}`;
    if (!this.scene.textures.exists(key)) {
      this.draw(key, seed, heroClass, rarity);
    }
    return { textureKey: key, size: SIZE };
  }

  /** Bakes the loaded illustration into a SIZE x SIZE square texture, scaled
   *  to fit with aspect preserved, so it drops into the same sprite
   *  pipeline (uniform setDisplaySize) as the procedural portraits. */
  private illustrationTexture(heroId: string): string {
    const key = `char_illust_${heroId}`;
    if (this.scene.textures.exists(key)) return key;

    const frame = this.scene.textures.getFrame(heroId);
    const scale = Math.min(SIZE / frame.width, SIZE / frame.height);
    const temp = this.scene.add.image(CENTER, CENTER, heroId).setScale(scale).setVisible(false);
    const rt = this.scene.add.renderTexture(0, 0, SIZE, SIZE);
    rt.draw(temp, CENTER, CENTER);
    rt.saveTexture(key);
    rt.destroy();
    temp.destroy();
    return key;
  }

  private draw(key: string, seed: number, heroClass: HeroClass, rarity: Rarity): void {
    const rng = mulberry32(seed);
    const g = this.scene.add.graphics();

    this.drawAura(g, rarity);
    this.drawSilhouette(g, rng, heroClass);
    this.drawWeapon(g, rng, heroClass);
    this.drawAccessory(g, rng, rarity);

    g.generateTexture(key, SIZE, SIZE);
    g.destroy();
  }

  private drawAura(g: Phaser.GameObjects.Graphics, rarity: Rarity): void {
    const color = RARITY_COLORS[rarity];
    for (let i = rarity; i > 0; i--) {
      g.fillStyle(color, 0.07 + i * 0.05);
      g.fillCircle(CENTER, CENTER, 28 + i * 6);
    }
  }

  private drawSilhouette(g: Phaser.GameObjects.Graphics, rng: () => number, heroClass: HeroClass): void {
    const hue = rng();
    const bodyColor = Phaser.Display.Color.HSLToColor(hue, 0.45 + rng() * 0.3, 0.45 + rng() * 0.15).color;
    const shape = SILHOUETTES[heroClass];

    g.fillStyle(bodyColor, 1);
    g.fillCircle(CENTER, CENTER - 20, 12);

    if (shape === 'broad') {
      g.fillRoundedRect(CENTER - 16, CENTER - 8, 32, 36, 8);
    } else if (shape === 'slim') {
      g.fillRoundedRect(CENTER - 10, CENTER - 8, 20, 36, 6);
    } else {
      g.fillRoundedRect(CENTER - 13, CENTER - 8, 26, 32, 10);
    }

    const legColor = Phaser.Display.Color.ValueToColor(bodyColor).darken(20).color;
    g.fillStyle(legColor, 1);
    g.fillRect(CENTER - 12, CENTER + 24, 10, 16);
    g.fillRect(CENTER + 2, CENTER + 24, 10, 16);
  }

  private drawWeapon(g: Phaser.GameObjects.Graphics, rng: () => number, heroClass: HeroClass): void {
    const accent = Phaser.Display.Color.HSLToColor(rng(), 0.7, 0.55).color;
    const x = CENTER + 20;

    if (heroClass === 'warrior' || heroClass === 'tank') {
      g.fillStyle(0xd8d8e0, 1);
      g.fillRect(x - 3, CENTER - 24, 6, 40);
      g.fillStyle(accent, 1);
      g.fillRect(x - 6, CENTER + 14, 12, 6);
    } else if (heroClass === 'mage' || heroClass === 'healer') {
      g.fillStyle(0xc9b38a, 1);
      g.fillRect(x - 2, CENTER - 28, 4, 46);
      g.fillStyle(accent, 1);
      g.fillCircle(x, CENTER - 30, 7);
    } else {
      g.lineStyle(3, 0xc9b38a, 1);
      g.beginPath();
      g.arc(x, CENTER, 20, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70));
      g.strokePath();
      g.lineStyle(1, accent, 0.8);
      g.beginPath();
      g.moveTo(x + 6, CENTER - 19);
      g.lineTo(x + 6, CENTER + 19);
      g.strokePath();
    }
  }

  private drawAccessory(g: Phaser.GameObjects.Graphics, rng: () => number, rarity: Rarity): void {
    const roll = rng();
    const chance = 0.2 + rarity * 0.15;
    if (roll > chance) return;

    const kind = Math.floor(rng() * 3);
    const color = Phaser.Display.Color.HSLToColor(rng(), 0.8, 0.6).color;

    if (kind === 0) {
      g.lineStyle(3, color, 0.9);
      g.strokeEllipse(CENTER, CENTER - 34, 22, 8);
    } else if (kind === 1) {
      g.fillStyle(color, 0.5);
      g.fillTriangle(CENTER - 16, CENTER - 4, CENTER - 34, CENTER - 14, CENTER - 20, CENTER + 10);
      g.fillTriangle(CENTER + 16, CENTER - 4, CENTER + 34, CENTER - 14, CENTER + 20, CENTER + 10);
    } else {
      g.fillStyle(color, 1);
      g.fillTriangle(CENTER - 10, CENTER - 28, CENTER - 14, CENTER - 40, CENTER - 4, CENTER - 30);
      g.fillTriangle(CENTER + 10, CENTER - 28, CENTER + 14, CENTER - 40, CENTER + 4, CENTER - 30);
    }
  }
}
