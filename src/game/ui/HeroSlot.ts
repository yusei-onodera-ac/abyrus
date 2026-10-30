import Phaser from 'phaser';
import type { CharacterGenerator } from '../characters/CharacterGenerator';
import { hex, RARITY_COLORS, type HeroData } from '../types';
import { CHROME } from './theme';

export const HERO_SLOT_SIZE = 108;

const INK = '#1c130a';
/** The illustrations are full-body; a slot shows a square crop from the top
 *  (head to chest). Side as a fraction of image width, and where it starts
 *  as a fraction of image height. */
const BUST_SIDE = 0.56;
const BUST_TOP = 0.03;

export interface HeroSlotOptions {
  /** Omit for an empty slot (grey silhouette). */
  hero?: HeroData;
  generator: CharacterGenerator;
  /** Already in the deck: dims the portrait and adds a 編成中 ribbon. */
  inDeck?: boolean;
  /** Another copy of this hero's character is already in the deck (a deck holds
   *  one of each): dims the portrait and adds a 同キャラ ribbon. */
  twinInDeck?: boolean;
  /** Leave the LV label off (a list of heroes that are not owned has no level to show). */
  hideLevel?: boolean;
  /** Pulsing ring, for the slot/hero the next tap will act on. */
  selected?: boolean;
  onTap?: () => void;
  /** Checked on release; false swallows the tap (see ScrollView.isTap). */
  guard?: () => boolean;
}

/** Square hero tile like the reference's formation slots: rarity-colored
 *  frame, face/bust crop of the illustration, rarity chip top-left, LV
 *  bottom-left. Used for both the 5 deck slots and the owned-hero grid. */
export class HeroSlot extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, opts: HeroSlotOptions, size = HERO_SLOT_SIZE) {
    super(scene, x, y);
    const half = size / 2;
    const radius = 12;
    const { hero } = opts;
    const frameColor = hero ? RARITY_COLORS[hero.rarity] : CHROME.brassDark;

    const bg = scene.add.graphics();
    bg.fillStyle(hero ? 0x1a1209 : 0x0d0905, 1);
    bg.fillRoundedRect(-half, -half, size, size, radius);
    if (hero) {
      bg.fillStyle(frameColor, 0.16);
      bg.fillRoundedRect(-half, -half, size, size, radius);
    }
    this.add(bg);

    if (hero) {
      const portrait = addPortrait(scene, hero, opts.generator, size);
      if (opts.inDeck) portrait.setAlpha(0.4);
      else if (opts.twinInDeck) portrait.setAlpha(0.55);
      this.add(portrait);
    } else {
      this.add(silhouette(scene, size));
    }

    const border = scene.add.graphics();
    border.lineStyle(3, frameColor, 1);
    border.strokeRoundedRect(-half, -half, size, size, radius);
    border.lineStyle(1, 0x000000, 0.5);
    border.strokeRoundedRect(-half + 2, -half + 2, size - 4, size - 4, radius - 2);
    this.add(border);

    if (hero) {
      const chip = scene.add.graphics();
      chip.fillStyle(0x000000, 0.72);
      chip.fillRoundedRect(-half + 5, -half + 5, 48, 26, 7);
      this.add(chip);
      this.add(
        scene.add
          .text(-half + 29, -half + 18, `★${hero.rarity}`, { fontFamily: 'Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: hex(frameColor), stroke: INK, strokeThickness: 3 })
          .setOrigin(0.5),
      );
      if (!opts.hideLevel) {
        this.add(
          scene.add
            .text(-half + 8, half - 6, `LV.${hero.level}`, { fontFamily: 'Arial, sans-serif', fontSize: '19px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 })
            .setOrigin(0, 1),
        );
      }
    }

    const ribbon = opts.inDeck ? { text: '編成中', color: hex(CHROME.brassBright) } : opts.twinInDeck ? { text: '同キャラ', color: '#c9b6ff' } : null;
    if (ribbon) {
      const strip = scene.add.rectangle(0, 0, size - 6, 32, 0x000000, 0.72);
      this.add(strip);
      this.add(
        scene.add
          .text(0, 0, ribbon.text, { fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', fontSize: '19px', fontStyle: 'bold', color: ribbon.color, stroke: INK, strokeThickness: 3 })
          .setOrigin(0.5),
      );
    }

    if (opts.selected) {
      const ring = scene.add.graphics();
      ring.lineStyle(4, CHROME.brassBright, 1);
      ring.strokeRoundedRect(-half - 5, -half - 5, size + 10, size + 10, radius + 3);
      this.add(ring);
      const pulse = scene.tweens.add({ targets: ring, alpha: { from: 1, to: 0.3 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.once(Phaser.GameObjects.Events.DESTROY, () => pulse.stop());
    }

    this.setSize(size, size);

    if (opts.onTap) {
      const hit = scene.add.zone(0, 0, size, size).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      const tweenTo = (scale: number, duration: number) => scene.tweens.add({ targets: this, scale, duration, ease: 'Sine.easeOut' });
      hit.on('pointerover', () => tweenTo(1.04, 110));
      hit.on('pointerout', () => tweenTo(1, 140));
      hit.on('pointerdown', () => tweenTo(0.95, 70));
      hit.on('pointerup', () => {
        tweenTo(1.04, 90);
        if (opts.guard && !opts.guard()) return;
        opts.onTap!();
      });
      this.add(hit);
      this.once(Phaser.GameObjects.Events.DESTROY, () => scene.tweens.killTweensOf(this));
    }

    scene.add.existing(this);
  }
}

/** Head-and-chest crop of the hero's illustration, or the procedural
 *  portrait when that hero has no art yet. Centered on the slot's origin. */
function addPortrait(scene: Phaser.Scene, hero: HeroData, generator: CharacterGenerator, size: number): Phaser.GameObjects.Image {
  const inner = size - 8;
  if (hero.heroId && scene.textures.exists(hero.heroId)) {
    const frame = scene.textures.get(hero.heroId).getSourceImage();
    const side = frame.width * BUST_SIDE;
    const x0 = (frame.width - side) / 2;
    const y0 = frame.height * BUST_TOP;
    const scale = inner / side;
    // A crop leaves the image positioned by its full-frame center, so shift
    // it up by however far the crop's center sits above the frame's.
    const image = scene.add.image(0, (frame.height / 2 - (y0 + side / 2)) * scale, hero.heroId).setScale(scale);
    image.setCrop(x0, y0, side, side);
    return image;
  }
  const { textureKey } = generator.generate(hero.seed, hero.heroClass, hero.rarity);
  return scene.add.image(0, 0, textureKey).setDisplaySize(inner * 0.9, inner * 0.9);
}

/** Grey head-and-shoulders placeholder for an empty slot. */
function silhouette(scene: Phaser.Scene, size: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x5b5f66, 0.9);
  g.fillCircle(0, -size * 0.12, size * 0.15);
  const bodyW = size * 0.56;
  g.fillRoundedRect(-bodyW / 2, size * 0.07, bodyW, size * 0.34, { tl: size * 0.17, tr: size * 0.17, bl: 4, br: 4 });
  return g;
}
