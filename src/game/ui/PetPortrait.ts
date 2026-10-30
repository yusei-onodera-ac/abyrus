import Phaser from 'phaser';
import type { RuriPortrait } from '../data/storyScript';

/** The pet (ルリ) as a round bust, drawn from code: the story player's portrait and the
 *  tutorial guide's face. If `public/assets/ui/pet_guide.png` exists (BootScene loads it
 *  as 'pet_guide') the tutorial uses that art instead; see addPetFace. */
export function ruriTexture(scene: Phaser.Scene, mood: RuriPortrait): string {
  const key = `story_ruri_${mood}`;
  if (scene.textures.exists(key)) return key;

  const size = 100;
  const c = size / 2;
  const g = scene.add.graphics();
  const desaturated = mood === 'blank';
  // A crow: blue-black feathers (瑠璃色の艶) with a pale rim so it reads on dark scenes.
  const bodyColor = desaturated ? 0x5a5a64 : 0x2c3a62;
  const bellyColor = desaturated ? 0x74747e : 0x44588c;

  g.fillStyle(0x12141c, 0.5);
  g.fillCircle(c, c, c);
  g.fillStyle(bodyColor, 1);
  g.fillEllipse(c, c + 4, c * 1.3, c * 1.5);
  g.fillStyle(bellyColor, 1);
  g.fillEllipse(c, c + 18, c * 0.7, c * 0.8);

  // Wing.
  g.fillStyle(Phaser.Display.Color.ValueToColor(bodyColor).darken(18).color, 1);
  g.fillEllipse(c - 10, c + 12, c * 0.5, c * 0.8);

  // Beak: thick and dark, the crow's mark.
  g.fillStyle(desaturated ? 0x3a3a42 : 0x23232c, 1);
  g.fillTriangle(c + 14, c - 8, c + 40, c + 4, c + 14, c + 14);
  g.fillStyle(0x6a6a7a, 0.7);
  g.fillTriangle(c + 16, c - 5, c + 34, c + 3, c + 16, c + 1);

  // Eye, mood-dependent: pale so it shows on the dark feathers.
  if (mood === 'blank') {
    g.lineStyle(2.5, 0xe8e8ec, 0.9);
    g.strokeCircle(c + 4, c - 14, 7);
  } else {
    const eyeY = mood === 'determined' ? c - 12 : c - 14;
    const eyeRy = mood === 'determined' ? 6 : 11;
    g.fillStyle(0xf0e8cc, 1);
    g.fillEllipse(c + 4, eyeY, 11, eyeRy);
    g.fillStyle(0x0a0a0e, 1);
    g.fillCircle(c + 5.5, eyeY, mood === 'determined' ? 2.2 : 3.2);
  }
  if (mood === 'worried') {
    g.lineStyle(2.5, 0x0a0a12, 0.85);
    g.beginPath();
    g.moveTo(c - 3, c - 26);
    g.lineTo(c + 10, c - 30);
    g.strokePath();
  }

  g.lineStyle(2, 0x8fa4d8, 0.55);
  g.strokeEllipse(c, c + 4, c * 1.3, c * 1.5);

  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** The pet's face centred at (x, y), about `size` px across: the supplied art if there is
 *  some, else the drawn bust. */
export function addPetFace(scene: Phaser.Scene, x: number, y: number, size: number, mood: RuriPortrait = 'normal'): Phaser.GameObjects.Image {
  if (scene.textures.exists('pet_guide')) {
    const frame = scene.textures.get('pet_guide').getSourceImage();
    return scene.add.image(x, y, 'pet_guide').setScale(size / Math.max(frame.width, frame.height));
  }
  return scene.add.image(x, y, ruriTexture(scene, mood)).setDisplaySize(size, size);
}
