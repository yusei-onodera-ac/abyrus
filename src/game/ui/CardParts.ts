import Phaser from 'phaser';
import { createPanel } from './Panel';
import { breakLines, measureWidth, NEWLINE } from './TextLayout';
import { CHROME } from './theme';

const INK = '#1c130a';
const FONT = 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

/** Wood-and-brass card body shared by the list screens. `highlight` gives it
 *  the bright brass border used for "needs your attention". */
export function buildCardPanel(scene: Phaser.Scene, width: number, height: number, highlight = false): Phaser.GameObjects.Container {
  return createPanel(scene, width / 2, height / 2, width, height, {
    fillColor: CHROME.woodFill,
    fillAlpha: 0.97,
    borderColor: highlight ? CHROME.brassBright : CHROME.brassDark,
    glowColor: CHROME.brass,
    radius: 14,
    gradient: false,
  });
}

/** Small rounded tag, left-center anchored at (x, y). Returns it with its width. */
export function buildChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: { fill: number; color: string; fontSize?: number },
): { container: Phaser.GameObjects.Container; width: number } {
  const fontSize = opts.fontSize ?? 16;
  const label = scene.add
    .text(0, 0, text, { fontFamily: FONT, fontSize: `${fontSize}px`, fontStyle: 'bold', color: opts.color, stroke: INK, strokeThickness: 2 })
    .setOrigin(0, 0.5);
  const width = label.width + 18;
  const height = fontSize + 12;
  const bg = scene.add.graphics();
  bg.fillStyle(opts.fill, 1);
  bg.fillRoundedRect(0, -height / 2, width, height, 6);
  bg.lineStyle(1.5, CHROME.brass, 0.7);
  bg.strokeRoundedRect(0, -height / 2, width, height, 6);
  label.setX(9);
  const container = scene.add.container(x, y, [bg, label]);
  return { container, width };
}

/** Red "unread" dot with a dark ring, like the home screen's corner badges. */
export function buildUnreadDot(scene: Phaser.Scene, x: number, y: number, radius = 8): Phaser.GameObjects.Graphics {
  const dot = scene.add.graphics();
  dot.fillStyle(0x1b1d29, 1);
  dot.fillCircle(x, y, radius + 2);
  dot.fillStyle(0xff4d4d, 1);
  dot.fillCircle(x, y, radius);
  return dot;
}

/** Breaks `text` into lines no wider than `width` px in the given font (see
 *  breakLines for the rules). Explicit line breaks in `text` are kept. */
function wrapJapanese(text: string, font: string, width: number, hangAllowance: number): string {
  const tokens = Array.from(text).map((ch) => ({ ch, width: ch === NEWLINE ? 0 : measureWidth(font, ch) }));
  // measureWidth of single characters ignores kerning, which is nil for CJK.
  return breakLines(tokens, width, hangAllowance)
    .map((line) => line.map((t) => t.ch).join(''))
    .join(NEWLINE);
}

/** Text that wraps at `width` with Japanese line-breaking rules (Phaser's own
 *  wrap only breaks at spaces). */
export function wrappedText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  width: number,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const merged = { fontFamily: FONT, stroke: INK, strokeThickness: 2, ...style };
  const size = parseInt(String(merged.fontSize ?? '16'), 10) || 16;
  const font = `${merged.fontStyle ?? 'normal'} ${size}px ${merged.fontFamily}`;
  // The outline adds to a line's drawn width; leave room for it.
  const room = width - (merged.strokeThickness ?? 0);
  // Normal characters wrap one character-width early, so closing punctuation can always hang in that space.
  return scene.add.text(x, y, wrapJapanese(text, font, room - size, size), merged);
}

const AVATAR_COLORS = [0x3f7fbf, 0xbf5f3f, 0x4f9f6f, 0x9f5fbf, 0xbf9f3f, 0x4fa0a8];

/** A round badge with the person's first character, in a color picked from
 *  their name so the same person always looks the same. Centered at (x, y). */
export function buildAvatar(scene: Phaser.Scene, x: number, y: number, radius: number, name: string): Phaser.GameObjects.Container {
  const hash = Array.from(name || '?').reduce((h, ch) => (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillCircle(0, 3, radius);
  g.fillStyle(AVATAR_COLORS[hash % AVATAR_COLORS.length], 1);
  g.fillCircle(0, 0, radius);
  g.fillStyle(0xffffff, 0.18);
  g.fillEllipse(0, -radius * 0.45, radius * 1.3, radius * 0.7);
  g.lineStyle(3, CHROME.brassBright, 0.95);
  g.strokeCircle(0, 0, radius);
  const initial = scene.add
    .text(0, 0, Array.from(name)[0] ?? '?', { fontFamily: FONT, fontSize: `${Math.round(radius * 1.05)}px`, fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 })
    .setOrigin(0.5);
  return scene.add.container(x, y, [g, initial]);
}
