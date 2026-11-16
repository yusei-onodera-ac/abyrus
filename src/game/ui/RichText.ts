import Phaser from 'phaser';
import type { EmojiId } from '../data/emoji';
import { parseParts } from '../systems/ChatSystem';
import { emojiTexture } from './EmojiIcons';
import { breakLines, measureWidth, type LayoutToken } from './TextLayout';

const FONT = 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

export interface RichTextStyle {
  fontSize: number;
  color: string;
  fontStyle?: string;
  stroke?: string;
  strokeThickness?: number;
}

export interface RichText {
  /** Children are positioned from the container's top-left origin. */
  container: Phaser.GameObjects.Container;
  /** Width of the longest line. */
  width: number;
  height: number;
}

/** A chat message laid out as text with in-game emoji drawn inline: wrapped
 *  at `maxWidth` with Japanese line-breaking rules, an emoji counting as one
 *  character-sized picture. */
export function buildRichText(scene: Phaser.Scene, text: string, maxWidth: number, style: RichTextStyle): RichText {
  const font = `${style.fontStyle ?? 'normal'} ${style.fontSize}px ${FONT}`;
  const emojiSize = Math.round(style.fontSize * 1.32);
  const lineHeight = Math.round(style.fontSize * 1.6);

  const tokens: LayoutToken<EmojiId>[] = [];
  for (const part of parseParts(text)) {
    if (part.kind === 'emoji') tokens.push({ ch: null, width: emojiSize + 4, data: part.id });
    else for (const ch of Array.from(part.text)) tokens.push({ ch, width: measureWidth(font, ch) });
  }

  const container = scene.add.container(0, 0);
  // One character-width of slack lets closing punctuation hang past the wrap edge.
  const lines = breakLines(tokens, maxWidth - style.fontSize, style.fontSize);
  let widest = 0;
  lines.forEach((line, row) => {
    const y = row * lineHeight + lineHeight / 2;
    let x = 0;
    let run = '';
    const flush = (): void => {
      if (!run) return;
      const label = scene.add.text(x, y, run, {
        fontFamily: FONT,
        fontSize: `${style.fontSize}px`,
        fontStyle: style.fontStyle,
        color: style.color,
        stroke: style.stroke,
        strokeThickness: style.strokeThickness ?? 0,
      });
      label.setOrigin(0, 0.5);
      container.add(label);
      x += label.width;
      run = '';
    };
    for (const token of line) {
      if (token.ch !== null) {
        run += token.ch;
        continue;
      }
      flush();
      const icon = scene.add.image(x + (emojiSize + 4) / 2, y, emojiTexture(scene, token.data!)).setDisplaySize(emojiSize, emojiSize);
      container.add(icon);
      x += token.width;
    }
    flush();
    widest = Math.max(widest, x);
  });
  return { container, width: Math.ceil(widest), height: Math.max(1, lines.length) * lineHeight };
}
