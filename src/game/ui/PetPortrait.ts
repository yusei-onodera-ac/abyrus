import Phaser from 'phaser';
import type { RuriPortrait } from '../data/storyScript';

/** ルリ's expressions that have a picture: `public/assets/pet/<mood>.png`, a round bust
 *  (256px, with its backing and ring). 'blank' (the miasma's grip) is made from 'normal'. */
const ART_MOODS: RuriPortrait[] = ['normal', 'worried', 'determined', 'happy', 'flying'];

export function preloadPetArt(scene: Phaser.Scene): void {
  for (const mood of ART_MOODS) scene.load.image(`pet_${mood}`, `/assets/pet/${mood}.png`);
}

/** 'normal' drained of colour and dimmed: her eyes losing their colour in the ruins. */
function blankFromArt(scene: Phaser.Scene): string | null {
  const key = 'pet_blank';
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists('pet_normal')) return null;
  const source = scene.textures.get('pet_normal').getSourceImage() as HTMLImageElement;
  const canvas = scene.textures.createCanvas(key, source.width, source.height);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return null;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const grey = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.78;
    d[i] = d[i + 1] = d[i + 2] = grey;
  }
  ctx.putImageData(pixels, 0, 0);
  canvas.refresh();
  return key;
}

/** The pet (ルリ) as a round bust: her picture for that expression if there is one, else a
 *  bird drawn from code - the story player's portrait and the tutorial guide's face. */
export function ruriTexture(scene: Phaser.Scene, mood: RuriPortrait): string {
  const art = mood === 'blank' ? blankFromArt(scene) : scene.textures.exists(`pet_${mood}`) ? `pet_${mood}` : null;
  if (art) return art;

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

/** The pet's face centred at (x, y), `size` px across. */
export function addPetFace(scene: Phaser.Scene, x: number, y: number, size: number, mood: RuriPortrait = 'normal'): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ruriTexture(scene, mood)).setDisplaySize(size, size);
}
