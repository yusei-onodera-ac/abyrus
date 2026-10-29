import Phaser from 'phaser';
import type { ScrollView } from './ScrollView';

export interface ModalHandle {
  /** Put the popup's contents in here. Sits above everything, including the
   *  bottom nav bar (depth 100). */
  container: Phaser.GameObjects.Container;
  close(): void;
}

/** Dim layer + container for a popup over a ScrollView screen. The dim layer
 *  swallows taps meant for what's underneath, and the list stops scrolling
 *  until the popup closes. Tapping the dim layer closes it too, unless
 *  `dismissOnDimTap` is false. */
export function openModal(scene: Phaser.Scene, scroll: ScrollView, dimAlpha: number, dismissOnDimTap = false): ModalHandle {
  scroll.setEnabled(false);
  const container = scene.add.container(0, 0).setDepth(200);
  const dim = scene.add.rectangle(360, 640, 720, 1280, 0x000000, 0).setInteractive();
  container.add(dim);
  scene.tweens.add({ targets: dim, fillAlpha: dimAlpha, duration: 220 });

  const handle: ModalHandle = {
    container,
    close: () => {
      container.destroy();
      scroll.setEnabled(true);
    },
  };
  if (dismissOnDimTap) dim.on('pointerup', handle.close);
  return handle;
}
