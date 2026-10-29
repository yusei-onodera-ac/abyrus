import Phaser from 'phaser';
import { Button } from './Button';
import { createPanel } from './Panel';
import { openModal, type ModalHandle, type ModalLock } from './Modal';
import { buildRewardGrid, type RewardTile } from './RewardTiles';
import { heading, caption, CHROME } from './theme';

const INK = '#1c130a';
const W = 640;

/** A popup that shows what the player just received: a title, the reward tiles,
 *  an optional note, and an OK button. `onClose` runs when it is dismissed. */
export function showRewardModal(
  scene: Phaser.Scene,
  lock: ModalLock,
  opts: { title: string; tiles: RewardTile[]; note?: string; onClose?: () => void },
): ModalHandle {
  const handle = openModal(scene, lock, 0.8, false);
  const modal = handle.container;
  const grid = buildRewardGrid(scene, opts.tiles, W - 40);
  const noteH = opts.note ? 54 : 0;
  const h = 118 + grid.height + noteH + 110;
  const top = 640 - h / 2;

  modal.add(createPanel(scene, 360, 640, W, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 20, rarity: 5, gradient: false }));
  modal.add(scene.add.zone(360, 640, W, h).setInteractive());
  modal.add(heading(scene, 360, top + 58, opts.title, { fontSize: '40px', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
  grid.container.setPosition(360 - W / 2 + 20, top + 118);
  modal.add(grid.container);
  if (opts.note) modal.add(caption(scene, 360, top + 118 + grid.height + 30, opts.note, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3, align: 'center' }).setOrigin(0.5));
  modal.add(
    new Button(
      scene,
      360,
      top + h - 56,
      260,
      70,
      'OK',
      () => {
        handle.close();
        opts.onClose?.();
      },
      { variant: 'gold', fontSize: '30px' },
    ),
  );
  return handle;
}
