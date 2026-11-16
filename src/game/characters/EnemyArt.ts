import Phaser from 'phaser';

/**
 * Enemy pictures: `public/assets/enemies/<id>.png`, transparent cut-outs of the beasts with
 * their smoke. Which enemy uses which is in data/regions.ts (`art`); an enemy without a
 * picture, or whose file is missing, keeps CharacterGenerator's silhouette.
 *
 * They are drawn much bigger than the 96px silhouettes - the pictures are wide and fine -
 * so the enemy rows sit a little further apart than the heroes' do.
 */
export const ENEMY_ROW_Y = { front: 440, back: 270 };
export const ENEMY_SPACING = 170;

const BOX_W = 168;
const BOX_H = 118;
const BOSS_SCALE = 1.45;
/** The last boss stands alone on the field, so it is drawn bigger still. */
const LAST_BOSS_SCALE = 2.4;
const LAST_BOSS_ART = 'uroboros';

export function enemyArtKey(id: string): string {
  return `enemy_${id}`;
}

export function preloadEnemyArt(scene: Phaser.Scene, ids: string[]): void {
  for (const id of ids) scene.load.image(enemyArtKey(id), `/assets/enemies/${id}.png`);
}

export interface EnemyArtFit {
  key: string;
  width: number;
  height: number;
}

/** The picture `art` scaled to fit the enemy's box (a boss gets a bigger one), or null if there is none. */
export function fitEnemyArt(scene: Phaser.Scene, art: string | undefined, isBoss = false): EnemyArtFit | null {
  const key = art ? enemyArtKey(art) : '';
  if (!key || !scene.textures.exists(key)) return null;
  const frame = scene.textures.getFrame(key);
  const k = art === LAST_BOSS_ART ? LAST_BOSS_SCALE : isBoss ? BOSS_SCALE : 1;
  const scale = Math.min((BOX_W * k) / frame.width, (BOX_H * k) / frame.height);
  return { key, width: frame.width * scale, height: frame.height * scale };
}
