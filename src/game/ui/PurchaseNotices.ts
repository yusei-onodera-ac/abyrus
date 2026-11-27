import Phaser from 'phaser';
import type { Delivered } from '../systems/PurchaseDelivery';
import { showRewardModal } from './RewardModal';
import { tilesForGoods, tilesForGranted } from './RewardTiles';
import { t } from '../i18n';

/**
 * Tells the player about a purchase that reached the save by itself - a payment the app died on, an Ask to Buy that was approved later
 * (systems/NativeStore.ts) - with the usual popup: what came, and a 確認 button. The goods are already in the save; this only shows them.
 *
 * It waits for a calm screen (Home or the shop), so it never lands in the middle of a fight or a summon; a screen that is left while the
 * popup is open gets it again on the next calm one. After 確認 the screen is built again, so its top bar shows the new numbers.
 */
const CALM_SCREENS = ['Home', 'Shop'];
const CHECK_EVERY_MS = 2000;
/** The popup sits over a screen with nothing under it that needs to stop reacting (the dim layer swallows the taps). */
const NO_LOCK = {
  setEnabled(): void {},
};

const queue: Delivered[] = [];
let showing = false;
let waiting: ReturnType<typeof setTimeout> | undefined;

function pump(game: Phaser.Game): void {
  if (showing || waiting !== undefined || queue.length === 0) return;
  const scene = game.scene.getScenes(true).find((s) => CALM_SCREENS.includes(s.scene.key));
  if (!scene) {
    waiting = setTimeout(() => {
      waiting = undefined;
      pump(game);
    }, CHECK_EVERY_MS);
    return;
  }
  show(game, scene, queue.shift()!);
}

function show(game: Phaser.Game, scene: Phaser.Scene, delivered: Delivered): void {
  showing = true;
  let done = false;
  const end = (confirmed: boolean): void => {
    if (done) return;
    done = true;
    showing = false;
    if (confirmed) scene.scene.restart();
    else queue.unshift(delivered); // the screen went away under the popup: show it again on the next calm one
    pump(game);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => end(false));
  if (delivered.kind === 'goods') {
    showRewardModal(scene, NO_LOCK, { title: t('shop.recovered.title'), note: delivered.product.name, tiles: tilesForGoods(delivered.goods), onClose: () => end(true) });
  } else {
    showRewardModal(scene, NO_LOCK, { title: t('shop.premium.joinedTitle'), note: t('shop.premium.packClaimed'), tiles: tilesForGranted(delivered.granted), onClose: () => end(true) });
  }
}

export const PurchaseNotices = {
  push(game: Phaser.Game, delivered: Delivered): void {
    queue.push(delivered);
    pump(game);
  },
};
