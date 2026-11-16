import Phaser from 'phaser';
import { BackButton } from './BackButton';
import { createPanel } from './Panel';
import { ScrollView } from './ScrollView';
import { heading, CHROME } from './theme';
import { enter } from './Transitions';

const INK = '#1c130a';

/** Width of a card inside the scrolling list. */
export const CARD_WIDTH = 640;

// Frame around the scrolling list, between the top bar (126px tall) and the
// bottom nav bar (starts at y1156).
const FRAME = { x: 12, y: 206, w: 696, h: 940 };
/** The list itself, inset from the frame; the scrollbar sits in the gap on
 *  its right (see ScrollView). Content coordinates are relative to its
 *  top-left. */
export const SCREEN_VIEW = { x: 24, y: 218, w: 660, h: 916 };

/** Dark slanted plate under the top bar carrying the screen name. */
export function buildTitlePlate(scene: Phaser.Scene, text: string): void {
  const y = 138;
  const w = 440;
  const h = 56;
  const slant = 36;
  const plate = scene.add.graphics();
  plate.fillStyle(CHROME.woodFill, 0.96);
  plate.fillPoints([new Phaser.Math.Vector2(0, y), new Phaser.Math.Vector2(w, y), new Phaser.Math.Vector2(w - slant, y + h), new Phaser.Math.Vector2(0, y + h)], true);
  plate.lineStyle(3, CHROME.brass, 1);
  plate.beginPath();
  plate.moveTo(0, y + h);
  plate.lineTo(w - slant, y + h);
  plate.lineTo(w, y);
  plate.strokePath();
  plate.lineStyle(1, CHROME.brassBright, 0.7);
  plate.beginPath();
  plate.moveTo(0, y + h - 5);
  plate.lineTo(w - slant - 3, y + h - 5);
  plate.strokePath();

  const title = heading(scene, 30, y + h / 2, text, { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5);
  enter(scene, plate, { dx: -30, dy: 0, duration: 320, delay: 60 });
  enter(scene, title, { dx: -30, dy: 0, duration: 320, delay: 100 });
}

/** The wood-and-brass frame the list-style screens put their content in. */
export function buildFrame(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const frame = createPanel(scene, FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h / 2, FRAME.w, FRAME.h, {
    fillColor: CHROME.woodGrain,
    fillAlpha: 0.9,
    borderColor: CHROME.brassDark,
    glowColor: CHROME.brass,
    radius: 16,
    gradient: false,
  });
  enter(scene, frame, { dy: 14, duration: 300, delay: 120 });
  return frame;
}

/** The frame plus the ScrollView inside it - the shared body of the
 *  list-style screens (Gacha, Roster, the inbox). `backButton` says the screen
 *  floats a BackButton over the lower-left corner, so the list scrolls clear of it. */
export function buildFramedScrollView(scene: Phaser.Scene, toolbarHeight = 0, backButton = true): ScrollView {
  buildFrame(scene);
  // A non-zero toolbarHeight leaves that much room at the top of the frame for
  // a pinned bar (bulk actions) the caller draws itself; the list scrolls below it.
  const scroll = new ScrollView(scene, SCREEN_VIEW.x, SCREEN_VIEW.y + toolbarHeight, SCREEN_VIEW.w, SCREEN_VIEW.h - toolbarHeight);
  if (backButton) scroll.setBottomInset(BackButton.ROOM);
  return scroll;
}
