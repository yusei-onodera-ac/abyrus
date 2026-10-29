import Phaser from 'phaser';
import { formatEventPeriod, type EventEntry, type EventPhase } from '../data/events';
import { Button } from './Button';
import { buildCardPanel, buildChip, wrappedText } from './CardParts';
import { createPanel } from './Panel';
import { CARD_WIDTH } from './ScreenFrame';
import { mixColor } from './StageMap';
import { body, CHROME } from './theme';

export const EVENT_CARD_WIDTH = CARD_WIDTH;
const PAD = 12;
const INK = '#1c130a';
const DRAWN_BANNER_H = 190;
const FONT_SERIF = 'Georgia, "Hiragino Mincho ProN", "Noto Serif JP", serif';

function bannerKey(id: string): string {
  return `event_banner_${id}`;
}

/** Queues every event banner image for loading. Call once from
 *  BootScene.preload(). Missing files are fine - an event without art (or
 *  whose file isn't there yet) gets a banner drawn in its own color. */
export function preloadEventArt(scene: Phaser.Scene, events: EventEntry[]): void {
  for (const e of events) {
    if (e.image) scene.load.image(bannerKey(e.id), `/assets/events/${e.image}`);
  }
}

export interface EventCardHandlers {
  onOpen: () => void;
  /** Click guard for the card's button, see ScrollView.isTap(). */
  guard: () => boolean;
}

const PHASE_CHIP: Record<EventPhase, { text: string; fill: number; color: string }> = {
  live: { text: '開催中', fill: 0x2f7a3a, color: '#e6ffe0' },
  upcoming: { text: '開催予定', fill: 0x3a4f7a, color: '#e0ecff' },
  ended: { text: '終了', fill: 0x4a3a3a, color: '#d8c8c8' },
};

/** The banner when there is no image: the event's color shading from dark to
 *  bright, its emblem as a huge faint glyph, and its title across the middle. */
function drawBanner(scene: Phaser.Scene, entry: EventEntry, x: number, y: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
  const g = scene.add.graphics();
  const dark = mixColor(entry.accent, 0x000000, 0.7);
  const light = mixColor(entry.accent, 0x000000, 0.25);
  g.fillGradientStyle(dark, dark, light, light, 1);
  g.fillRect(x, y, w, h);
  // A few soft rings, so the banner is not a flat slab.
  g.lineStyle(2, 0xffffff, 0.06);
  for (let i = 1; i <= 4; i++) g.strokeCircle(x + w * 0.82, y + h * 0.3, i * 46);

  const emblem = entry.emblem ?? Array.from(entry.title)[0] ?? '';
  const glyph = scene.add.text(x + w * 0.5, y + h * 0.5, emblem, { fontFamily: FONT_SERIF, fontSize: '170px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.13);
  const title = scene.add
    .text(x + w / 2, y + h / 2, entry.title, { fontFamily: FONT_SERIF, fontSize: '50px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 8, align: 'center' })
    .setOrigin(0.5);
  // Japanese has no spaces to wrap at, so a long title is shrunk to fit instead.
  if (title.width > w - 60) title.setScale((w - 60) / title.width);
  return [g, glyph, title];
}

/** One event: title and status, banner, description, period, and the button
 *  that opens it. Container is anchored top-left; `height` is what the list
 *  needs to reserve for it. */
export function buildEventCard(
  scene: Phaser.Scene,
  entry: EventEntry,
  phase: EventPhase,
  handlers: EventCardHandlers,
): { container: Phaser.GameObjects.Container; height: number } {
  const container = scene.add.container(0, 0);
  const w = EVENT_CARD_WIDTH;
  const innerW = w - PAD * 2;
  let y = PAD;

  const headerH = 48;
  container.add(createPanel(scene, w / 2, y + headerH / 2, innerW, headerH, { fillColor: 0x150e07, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, borderWidth: 1.5, radius: 8, gradient: false }));
  container.add(body(scene, PAD + 16, y + headerH / 2, entry.title, { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
  const chip = buildChip(scene, 0, y + headerH / 2, PHASE_CHIP[phase].text, { fill: PHASE_CHIP[phase].fill, color: PHASE_CHIP[phase].color, fontSize: 18 });
  chip.container.setX(w - PAD - 12 - chip.width);
  container.add(chip.container);
  y += headerH + 8;

  // Banner art at the width of the card (its height follows the art, never squashed).
  const key = bannerKey(entry.id);
  let bannerH = DRAWN_BANNER_H;
  if (entry.image && scene.textures.exists(key)) {
    const frame = scene.textures.get(key).getSourceImage();
    bannerH = Math.round((innerW * frame.height) / frame.width);
    container.add(scene.add.image(w / 2, y + bannerH / 2, key).setDisplaySize(innerW, bannerH));
  } else {
    container.add(drawBanner(scene, entry, PAD, y, innerW, bannerH));
  }
  if (phase !== 'live') {
    const veil = scene.add.graphics();
    veil.fillStyle(0x000000, 0.42);
    veil.fillRect(PAD, y, innerW, bannerH);
    container.add(veil);
  }
  const outline = scene.add.graphics();
  outline.lineStyle(2, 0x120a04, 0.9);
  outline.strokeRect(PAD, y, innerW, bannerH);
  container.add(outline);
  y += bannerH + 12;

  const description = wrappedText(scene, PAD + 6, y, entry.description, innerW - 12, { fontSize: '20px', color: '#f5e6c8' });
  container.add(description);
  y += description.height + 8;
  container.add(body(scene, PAD + 6, y, `開催期間　${formatEventPeriod(entry)}`, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0));
  y += 34;

  const canOpen = phase === 'live' && entry.kind !== undefined;
  const label = canOpen ? 'イベントへ' : phase === 'upcoming' ? '開催予定' : '準備中';
  const button = new Button(scene, w / 2, y + 36, innerW, 72, label, handlers.onOpen, { variant: canOpen ? 'gold' : 'wood', fontSize: '28px', guard: handlers.guard });
  if (!canOpen) button.setEnabled(false);
  container.add(button);
  y += 72 + PAD + 4;

  // The card body goes in last, once the height is known, then sinks to the back.
  container.addAt(buildCardPanel(scene, w, y), 0);
  return { container, height: y };
}
