import Phaser from 'phaser';
import type { UnitInstance } from '../systems/BattleSystem';
import type { CharacterGenerator } from './CharacterGenerator';
import type { EnemyArtFit } from './EnemyArt';

/**
 * The party on the field: about twice the size the 96px baked portraits gave them, so they
 * stand as big as the beasts they fight. The rows sit a little further apart to match.
 */
export const PARTY_ROW_Y = { front: 730, back: 885 };
export const PARTY_SPACING = 200;
/** The longest side a party member is drawn at. */
export const PARTY_SIZE = 176;

/**
 * A party member's picture, fitted to PARTY_SIZE. The hero's own illustration is used at full
 * resolution (the 96px square CharacterGenerator bakes for it would blur at this size); a hero
 * with no illustration yet keeps the generated figure.
 */
export function fitPartyArt(scene: Phaser.Scene, generator: CharacterGenerator, unit: UnitInstance): EnemyArtFit {
  if (unit.heroId && scene.textures.exists(unit.heroId)) {
    const frame = scene.textures.getFrame(unit.heroId);
    const scale = Math.min(PARTY_SIZE / frame.width, PARTY_SIZE / frame.height);
    return { key: unit.heroId, width: frame.width * scale, height: frame.height * scale };
  }
  const generated = generator.generate(unit.seed, unit.heroClass, unit.rarity, unit.heroId);
  return { key: generated.textureKey, width: PARTY_SIZE * 0.9, height: PARTY_SIZE * 0.9 };
}
