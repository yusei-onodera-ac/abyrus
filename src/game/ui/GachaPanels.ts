import Phaser from 'phaser';
import { formatGachaEnd, FRIEND_GACHA_IMAGE, type GachaBannerEntry } from '../data/gachaBanners';
import { SINGLE_PULL_COST, TEN_PULL_COST } from '../systems/GachaSystem';
import { Button } from './Button';
import { createPanel } from './Panel';
import { body, caption, CHROME } from './theme';

export const GACHA_CARD_WIDTH = 640;
const PAD = 12;
const INK = '#1c130a';
const FRIEND_ROW_HEIGHT = 92;
const PLACEHOLDER_ASPECT = 1024 / 572;

const FRIEND_KEY = 'gacha_friend';

function bannerKey(id: string): string {
  return `gacha_banner_${id}`;
}

/** Queues every gacha banner's art (and the friend-gacha strip) for loading.
 *  Call once from BootScene.preload(). Missing files are fine - an
 *  un-supplied one renders a "準備中" placeholder instead, the same
 *  optional-art rule the rest of the game's illustrated chrome follows. */
export function preloadGachaArt(scene: Phaser.Scene, banners: GachaBannerEntry[]): void {
  for (const b of banners) {
    scene.load.image(bannerKey(b.id), `/assets/gacha/${b.image}`);
  }
  scene.load.image(FRIEND_KEY, `/assets/gacha/${FRIEND_GACHA_IMAGE}`);
}

export interface GachaCardHandlers {
  onDetail: () => void;
  onSingle: () => void;
  onTen: () => void;
  /** Click guard for the card's buttons, see ScrollView.isTap(). */
  guard: () => boolean;
}

/** Promo strip + フレンドガチャ button. Container is anchored top-left. */
export function buildFriendGachaRow(scene: Phaser.Scene, onTap: () => void, guard: () => boolean): { container: Phaser.GameObjects.Container; height: number } {
  const container = scene.add.container(0, 0);
  const buttonW = 204;
  const gap = 12;
  const stripW = GACHA_CARD_WIDTH - buttonW - gap;
  const h = FRIEND_ROW_HEIGHT;

  const strip = createPanel(scene, stripW / 2, h / 2, stripW, h, { fillColor: CHROME.woodGrain, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, radius: 10 });
  container.add(strip);
  if (scene.textures.exists(FRIEND_KEY)) {
    const frame = scene.textures.get(FRIEND_KEY).getSourceImage();
    const scale = Math.min((stripW - 6) / frame.width, (h - 6) / frame.height);
    container.add(scene.add.image(stripW / 2, h / 2, FRIEND_KEY).setScale(scale));
  } else {
    container.add(caption(scene, stripW / 2, h / 2, 'バナー準備中', { fontSize: '16px', color: '#9a8a6a' }).setOrigin(0.5));
  }

  const button = new Button(scene, stripW + gap + buttonW / 2, h / 2, buttonW, h, 'フレンドガチャ', onTap, { variant: 'wood', fontSize: '22px', guard });
  container.add(button);
  return { container, height: h };
}

/** One gacha: title + end time, banner art, description + 詳細, and the two
 *  pull buttons. Container is anchored top-left; `height` is what the list
 *  needs to reserve for it (it follows the banner art's aspect ratio). */
export function buildGachaBannerCard(
  scene: Phaser.Scene,
  entry: GachaBannerEntry,
  handlers: GachaCardHandlers,
): { container: Phaser.GameObjects.Container; height: number } {
  const container = scene.add.container(0, 0);
  const w = GACHA_CARD_WIDTH;
  const innerW = w - PAD * 2;
  let y = PAD;

  // Header: title, then the end time in the same line.
  const headerH = 48;
  container.add(createPanel(scene, w / 2, y + headerH / 2, innerW, headerH, { fillColor: 0x150e07, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, borderWidth: 1.5, radius: 8, gradient: false }));
  const headerText = entry.endsAt ? `${entry.title}　${formatGachaEnd(entry.endsAt)}` : entry.title;
  container.add(
    body(scene, PAD + 16, y + headerH / 2, headerText, { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5),
  );
  y += headerH + 8;

  // Banner art at the width of the card; height follows the art so it's
  // never squashed.
  const key = bannerKey(entry.id);
  let bannerH = Math.round(innerW / PLACEHOLDER_ASPECT);
  if (scene.textures.exists(key)) {
    const frame = scene.textures.get(key).getSourceImage();
    bannerH = Math.round((innerW * frame.height) / frame.width);
    container.add(scene.add.image(w / 2, y + bannerH / 2, key).setDisplaySize(innerW, bannerH));
  } else {
    container.add(createPanel(scene, w / 2, y + bannerH / 2, innerW, bannerH, { fillColor: 0x241810, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, radius: 8, gradient: false }));
    container.add(caption(scene, w / 2, y + bannerH / 2 - 14, 'バナー準備中', { fontSize: '24px', color: '#9a8a6a' }).setOrigin(0.5));
    container.add(caption(scene, w / 2, y + bannerH / 2 + 18, `public/assets/gacha/${entry.image}`, { fontSize: '14px', color: '#6e6048' }).setOrigin(0.5));
  }
  const outline = scene.add.graphics();
  outline.lineStyle(2, 0x120a04, 0.9);
  outline.strokeRect(PAD, y, innerW, bannerH);
  container.add(outline);
  y += bannerH + 10;

  // Description + 詳細.
  const rowH = 52;
  const detailW = 150;
  const descW = innerW - detailW - 10;
  container.add(createPanel(scene, PAD + descW / 2, y + rowH / 2, descW, rowH, { fillColor: 0x150e07, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, borderWidth: 1.5, radius: 8, gradient: false }));
  container.add(body(scene, PAD + 16, y + rowH / 2, entry.description, { fontSize: '20px', color: '#f5e6c8' }).setOrigin(0, 0.5));
  container.add(new Button(scene, PAD + descW + 10 + detailW / 2, y + rowH / 2, detailW, rowH, '詳細', handlers.onDetail, { variant: 'wood', fontSize: '22px', guard: handlers.guard }));
  y += rowH + 12;

  // Pull buttons.
  const ctaH = 82;
  const ctaW = (innerW - 14) / 2;
  container.add(
    new Button(scene, PAD + ctaW / 2, y + ctaH / 2, ctaW, ctaH, 'シングルガチャ', handlers.onSingle, {
      variant: 'gold',
      fontSize: '25px',
      subLabel: `${SINGLE_PULL_COST} 魔晶石`,
      guard: handlers.guard,
    }),
  );
  container.add(
    new Button(scene, PAD + ctaW + 14 + ctaW / 2, y + ctaH / 2, ctaW, ctaH, '10連ガチャ', handlers.onTen, {
      variant: 'gold',
      fontSize: '25px',
      subLabel: `${TEN_PULL_COST} 魔晶石`,
      guard: handlers.guard,
    }),
  );
  y += ctaH + PAD;

  // Card body goes in last, once the height is known, then sinks to the back.
  container.addAt(createPanel(scene, w / 2, y / 2, w, y, { fillColor: CHROME.woodFill, fillAlpha: 0.97, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14 }), 0);
  return { container, height: y };
}
