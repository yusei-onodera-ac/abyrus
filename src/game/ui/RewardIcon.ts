import Phaser from 'phaser';
import type { GoodType } from '../data/shop';
import type { GiftReward } from '../systems/SaveSystem';
import { coinIcon, gemIcon, phaseMaterialIcon, staminaIcon } from './Icons';

export const REWARD_LABEL: Record<GiftReward['type'], string> = { gems: '魔晶石', gold: 'ゴールド' };
export const REWARD_COLOR: Record<GiftReward['type'], string> = { gems: '#bfeaff', gold: '#ffe79a' };

/** Same, for everything the shop hands out. */
export const GOOD_LABEL: Record<GoodType, string> = { gems: '魔晶石', gold: 'ゴールド', stamina: 'スタミナ', phaseMaterials: 'フェーズ素材' };
export const GOOD_COLOR: Record<GoodType, string> = { gems: '#bfeaff', gold: '#ffe79a', stamina: '#ffd9a0', phaseMaterials: '#d9c2ff' };

/** Fits a supplied image (kept in its own aspect) into a `size` square. */
function fitted(scene: Phaser.Scene, key: string, x: number, y: number, size: number): Phaser.GameObjects.Image {
  const frame = scene.textures.get(key).getSourceImage();
  return scene.add.image(x, y, key).setScale(Math.min(size / frame.width, size / frame.height));
}

/** The illustration for a reward: the supplied coin/gem art when loaded,
 *  fitted into `size` with its aspect kept, else the procedural badge. */
export function addRewardIcon(scene: Phaser.Scene, type: GiftReward['type'], x: number, y: number, size: number): Phaser.GameObjects.Image {
  const suppliedKey = type === 'gems' ? 'currency_gem' : 'currency_coin';
  if (scene.textures.exists(suppliedKey)) return fitted(scene, suppliedKey, x, y, size);
  return scene.add.image(x, y, type === 'gems' ? gemIcon(scene, size) : coinIcon(scene, size));
}

/** The illustration for any shop good - the supplied currency art where there
 *  is some (魔晶石, ゴールド, スタミナ), else a code-drawn icon. */
export function addGoodIcon(scene: Phaser.Scene, type: GoodType, x: number, y: number, size: number): Phaser.GameObjects.Image {
  if (type === 'gems' || type === 'gold') return addRewardIcon(scene, type, x, y, size);
  if (type === 'stamina') {
    if (scene.textures.exists('currency_stamina')) return fitted(scene, 'currency_stamina', x, y, size);
    return scene.add.image(x, y, staminaIcon(scene, size));
  }
  return scene.add.image(x, y, phaseMaterialIcon(scene, size));
}
