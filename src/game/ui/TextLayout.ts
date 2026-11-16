/** Characters that must not begin a line (closing brackets, punctuation,
 *  small kana, the long-vowel mark): they hang on the end of the previous line. */
export const NO_LINE_START = new Set(Array.from('、。，．・：；？！）］｝〕〉》」』】ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー々〜…)]}.,:;?!'));
/** Characters that must not end a line (opening brackets): they move down with the next character. */
export const NO_LINE_END = new Set(Array.from('（［｛〔〈《「『【([{'));

export const NEWLINE = String.fromCharCode(10);

let measureCtx: CanvasRenderingContext2D | null = null;

/** Rendered width in px of `text` in a CSS font string, without creating a Phaser Text. */
export function measureWidth(font: string, text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx!;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** A unit of a line: one character, or one inline picture, with its advance width. */
export interface LayoutToken<T = unknown> {
  /** The character, or null for an inline picture. */
  ch: string | null;
  width: number;
  /** Anything the caller wants to carry along (e.g. an emoji id). */
  data?: T;
}

/** Splits a run of tokens into lines no wider than `width`, the way Japanese
 *  is normally set: a break may fall between any two tokens, but never before
 *  。、」 etc. (kinsoku) - those hang up to `hang` px past the edge - or after
 *  「（. A token with ch === NEWLINE forces a break. */
export function breakLines<T>(tokens: LayoutToken<T>[], width: number, hang: number): LayoutToken<T>[][] {
  const lines: LayoutToken<T>[][] = [];
  let line: LayoutToken<T>[] = [];
  let used = 0;
  for (const token of tokens) {
    if (token.ch === NEWLINE) {
      lines.push(line);
      line = [];
      used = 0;
      continue;
    }
    const fits = used + token.width <= width;
    const hangs = token.ch !== null && NO_LINE_START.has(token.ch) && used + token.width <= width + hang;
    if (fits || hangs || line.length === 0) {
      line.push(token);
      used += token.width;
      continue;
    }
    // Break before this token; an opening bracket at the end of the line moves down with it.
    let carry: LayoutToken<T> | null = null;
    const last = line[line.length - 1];
    if (last.ch !== null && NO_LINE_END.has(last.ch)) carry = line.pop()!;
    lines.push(line);
    line = carry ? [carry, token] : [token];
    used = line.reduce((sum, t) => sum + t.width, 0);
  }
  lines.push(line);
  return lines;
}
