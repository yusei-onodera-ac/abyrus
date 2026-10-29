import Phaser from 'phaser';
import type { BannerEntry } from '../data/banners';
import { createPanel } from './Panel';
import { caption, CHROME } from './theme';

const AUTO_MS = 3000;
const SLIDE_MS = 380;
/** A press that wanders less than this is a tap, not a swipe. */
const TAP_SLOP = 10;
/** Dragging past this fraction of the width (or flicking fast) changes banner. */
const SWIPE_FRACTION = 0.2;
const FLICK_SPEED = 0.6; // px per ms

function bannerKey(id: string): string {
  return `banner_${id}`;
}

/** Queues every banner's image for loading. Call once from
 *  BootScene.preload(). Missing files are fine - an un-supplied banner
 *  just renders its "準備中" placeholder card instead, the same optional-art
 *  rule every other illustrated piece of chrome in this game follows. */
export function preloadBanners(scene: Phaser.Scene, banners: BannerEntry[]): void {
  for (const b of banners) {
    scene.load.image(bannerKey(b.id), `/assets/banners/${b.image}`);
  }
}

/** One banner's picture (or its placeholder) filling a w x h cell whose
 *  top-left is the container's origin. Covers the cell; the carousel's mask
 *  trims any overflow. */
function buildPage(scene: Phaser.Scene, entry: BannerEntry, w: number, h: number): Phaser.GameObjects.Container {
  const page = scene.add.container(0, 0);
  const key = bannerKey(entry.id);
  if (scene.textures.exists(key)) {
    const frame = scene.textures.get(key).getSourceImage();
    const scale = Math.max(w / frame.width, h / frame.height);
    page.add(scene.add.image(w / 2, h / 2, key).setScale(scale));
  } else {
    page.add(createPanel(scene, w / 2, h / 2, w, h, { fillColor: 0x241810, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, radius: 4, gradient: false }));
    page.add(caption(scene, w / 2, h / 2, 'バナー準備中', { fontSize: '20px', color: '#9a8a6a' }).setOrigin(0.5));
  }
  return page;
}

/** Home screen promo banner: ONE banner on screen at a time, top-left at
 *  (x, y). Swipe left/right to move through them (wrapping around), and it
 *  advances by itself every 3 seconds - dragging pauses that, and the 3
 *  seconds count again from the last touch. A tap opens the banner's
 *  `target` scene, if it has one. Content-only: see data/banners.ts.
 *
 *  Three cells (previous / current / next) are laid side by side and the
 *  whole strip moves, so wrapping works even with just two banners. */
export function buildBannerCarousel(scene: Phaser.Scene, x: number, y: number, banners: BannerEntry[], w: number, h: number): Phaser.GameObjects.Container {
  const root = scene.add.container(x, y);
  if (banners.length === 0) return root;
  const n = banners.length;

  const track = scene.add.container(0, 0);
  const cells = [0, 1, 2].map(() => scene.add.container(0, 0));
  track.add(cells);
  root.add(track);

  // Clip to the frame so only one banner is ever visible. The mask shape is in
  // world space, so the root itself must not move (it only fades in).
  const maskShape = scene.make.graphics({}, false);
  maskShape.fillStyle(0xffffff, 1);
  maskShape.fillRect(x, y, w, h);
  track.setMask(maskShape.createGeometryMask());

  const ring = scene.add.graphics();
  ring.lineStyle(4, 0x120a04, 0.9);
  ring.strokeRect(-1, -1, w + 2, h + 2);
  ring.lineStyle(2, CHROME.brass, 0.95);
  ring.strokeRect(1, 1, w - 2, h - 2);
  root.add(ring);

  let index = 0;
  let offset = 0; // horizontal displacement of the strip, px
  let dragging = false;
  let moved = false;
  let animating = false;
  let slide: Phaser.Tweens.Tween | null = null;
  let startX = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;

  // Page dots, bottom-center over the banner.
  const dots = scene.add.graphics();
  root.add(dots);
  const drawDots = (): void => {
    dots.clear();
    if (n < 2) return;
    const gap = 16;
    const total = (n - 1) * gap;
    dots.fillStyle(0x000000, 0.45);
    dots.fillRoundedRect(w / 2 - total / 2 - 14, h - 26, total + 28, 18, 9);
    for (let i = 0; i < n; i++) {
      dots.fillStyle(i === index ? CHROME.brassBright : 0x8d7d5e, 1);
      dots.fillCircle(w / 2 - total / 2 + i * gap, h - 17, i === index ? 4.5 : 3.5);
    }
  };

  const layout = (): void => {
    cells[0].x = -w + offset;
    cells[1].x = offset;
    cells[2].x = w + offset;
  };
  const rebuildCells = (): void => {
    const ids = [(index - 1 + n) % n, index, (index + 1) % n];
    cells.forEach((cell, i) => {
      cell.removeAll(true);
      cell.add(buildPage(scene, banners[ids[i]], w, h));
    });
    layout();
    drawDots();
  };
  rebuildCells();

  /** Slides the strip the rest of the way to the next (+1) or previous (-1)
   *  banner, or back to rest (0), then re-centers on whichever is now current. */
  const finishTo = (dir: -1 | 0 | 1, duration: number): void => {
    animating = true;
    slide?.stop();
    const from = offset;
    const target = dir === 1 ? -w : dir === -1 ? w : 0;
    slide = scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        offset = Phaser.Math.Linear(from, target, tween.getValue() ?? 1);
        layout();
      },
      onComplete: () => {
        index = (index + dir + n) % n;
        offset = 0;
        animating = false;
        slide = null;
        rebuildCells();
        if (autoTimer) autoTimer.elapsed = 0;
      },
    });
  };

  // The 3-second timer; any touch or finished slide restarts its count.
  const autoTimer =
    n > 1
      ? scene.time.addEvent({
          delay: AUTO_MS,
          loop: true,
          callback: () => {
            if (!dragging && !animating) finishTo(1, SLIDE_MS);
          },
        })
      : null;

  const hit = scene.add.zone(w / 2, h / 2, w, h).setOrigin(0.5);
  root.add(hit);
  if (n > 1 || banners[0].target) hit.setInteractive({ useHandCursor: true });

  hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (animating) return;
    dragging = true;
    moved = false;
    startX = lastX = pointer.x;
    lastT = scene.time.now;
    velocity = 0;
  });

  const onMove = (pointer: Phaser.Input.Pointer): void => {
    if (!dragging) return;
    const dx = pointer.x - startX;
    if (!moved && Math.abs(dx) <= TAP_SLOP) return;
    moved = true;
    if (n < 2) return;
    const now = scene.time.now;
    velocity = (pointer.x - lastX) / Math.max(1, now - lastT);
    lastX = pointer.x;
    lastT = now;
    offset = Phaser.Math.Clamp(dx, -w, w);
    layout();
  };
  const onUp = (pointer: Phaser.Input.Pointer): void => {
    if (!dragging) return;
    dragging = false;
    if (autoTimer) autoTimer.elapsed = 0;
    if (!moved) {
      const inside = pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;
      const target = banners[index].target;
      if (inside && target) scene.scene.start(target);
      return;
    }
    if (n < 2) return;
    const flicked = Math.abs(velocity) > FLICK_SPEED && scene.time.now - lastT < 120;
    const farEnough = Math.abs(offset) > w * SWIPE_FRACTION;
    if (flicked || farEnough) {
      const dir = (flicked ? velocity : offset) < 0 ? 1 : -1;
      finishTo(dir, Math.max(160, SLIDE_MS * (1 - Math.abs(offset) / w)));
    } else {
      finishTo(0, 200);
    }
  };
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
  scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off(Phaser.Input.Events.POINTER_MOVE, onMove);
    scene.input.off(Phaser.Input.Events.POINTER_UP, onUp);
    scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
    slide?.stop();
    maskShape.destroy();
  });

  return root;
}
