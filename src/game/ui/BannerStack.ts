import Phaser from 'phaser';
import type { BannerEntry } from '../data/banners';
import { createPanel } from './Panel';
import { caption, COLORS } from './theme';

const CARD_W = 200;
const CARD_H = 112;

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

/** Vertical stack of rectangular promo cards, anchored at (x, y) = the
 *  first card's center. Returns the cards so the caller can stagger their
 *  entrance like every other button cluster on the home screen. */
export function buildBannerStack(scene: Phaser.Scene, x: number, y: number, banners: BannerEntry[]): Phaser.GameObjects.Container[] {
  const spacing = CARD_H + 14;
  return banners.map((entry, i) => buildBannerCard(scene, x, y + i * spacing, entry));
}

function buildBannerCard(scene: Phaser.Scene, x: number, y: number, entry: BannerEntry): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const key = bannerKey(entry.id);

  if (scene.textures.exists(key)) {
    const frame = scene.textures.get(key).getSourceImage();
    const scale = Math.min(CARD_W / frame.width, CARD_H / frame.height);
    container.add(scene.add.image(0, 0, key).setScale(scale));
  } else {
    const panel = createPanel(scene, 0, 0, CARD_W, CARD_H, { fillColor: COLORS.panelFillLight, radius: 10 });
    container.add(panel);
    container.add(caption(scene, 0, 0, 'バナー準備中', { fontSize: '13px', color: '#9a93b8' }).setOrigin(0.5));
  }

  const ring = scene.add.graphics();
  ring.lineStyle(2, COLORS.border, 0.85);
  ring.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
  container.add(ring);

  const hitZone = scene.add.zone(0, 0, CARD_W, CARD_H).setOrigin(0.5);
  hitZone.setInteractive({ useHandCursor: true });
  hitZone.on('pointerover', () => scene.tweens.add({ targets: container, scale: 1.03, duration: 110, ease: 'Sine.easeOut' }));
  hitZone.on('pointerout', () => scene.tweens.add({ targets: container, scale: 1, duration: 140, ease: 'Sine.easeOut' }));
  hitZone.on('pointerdown', () => scene.tweens.add({ targets: container, scale: 0.97, duration: 70, ease: 'Sine.easeOut' }));
  hitZone.on('pointerup', () => {
    scene.tweens.add({ targets: container, scale: 1.03, duration: 90, ease: 'Sine.easeOut' });
    if (entry.target) scene.scene.start(entry.target);
  });
  container.add(hitZone);

  return container;
}
