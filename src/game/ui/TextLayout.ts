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
  /** The character (or, for Latin text, the word with the spaces that follow it), or null for an inline picture. */
  ch: string | null;
  /** Advance width. For a word it is the word's own width: the spaces after it are `trail`, which may overhang the edge. */
  width: number;
  /** Width of the spaces after a word: counted when more follows on the line, never when the line breaks there. */
  trail?: number;
  /** Anything the caller wants to carry along (e.g. an emoji id). */
  data?: T;
}

/** Characters that break anywhere (Chinese characters, kana, fullwidth forms, CJK punctuation): one token each. Everything
 *  else (Latin and other space-separated scripts) is kept together as words and broken at spaces. */
const BREAKS_ANYWHERE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Cuts `text` into layout tokens for breakLines: each Japanese/Chinese character on its own, each space-separated word
 *  (with the spaces after it) as one - so Japanese keeps breaking between any two characters and English only at spaces. */
export function tokenize<T = unknown>(text: string, font: string): LayoutToken<T>[] {
  const chars = Array.from(text);
  const tokens: LayoutToken<T>[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === NEWLINE) {
      tokens.push({ ch, width: 0 });
      i++;
    } else if (BREAKS_ANYWHERE.test(ch)) {
      tokens.push({ ch, width: measureWidth(font, ch) });
      i++;
    } else if (ch === ' ') {
      tokens.push({ ch, width: measureWidth(font, ch) });
      i++;
    } else {
      let word = '';
      while (i < chars.length && chars[i] !== NEWLINE && chars[i] !== ' ' && !BREAKS_ANYWHERE.test(chars[i])) word += chars[i++];
      let spaces = '';
      while (i < chars.length && chars[i] === ' ') spaces += chars[i++];
      const width = measureWidth(font, word);
      tokens.push({ ch: word + spaces, width, trail: spaces ? Math.max(0, measureWidth(font, word + spaces) - width) : 0 });
    }
  }
  return tokens;
}

/** The text of a line of tokens, without the spaces that end it. */
export function lineText(line: LayoutToken[]): string {
  return line.map((t) => t.ch ?? '').join('').replace(/ +$/, '');
}

/** Splits a run of tokens into lines no wider than `width`, the way Japanese
 *  is normally set: a break may fall between any two tokens, but never before
 *  。、」 etc. (kinsoku) - those hang up to `hang` px past the edge - or after
 *  「（. A token with ch === NEWLINE forces a break. (Latin words are single tokens, so
 *  they break at spaces; see tokenize.) */
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
    const hangs = token.ch !== null && NO_LINE_START.has(token.ch.trimEnd()) && used + token.width <= width + hang;
    if (fits || hangs || line.length === 0) {
      line.push(token);
      used += token.width + (token.trail ?? 0);
      continue;
    }
    // Break before this token; an opening bracket at the end of the line moves down with it.
    let carry: LayoutToken<T> | null = null;
    const last = line[line.length - 1];
    if (last.ch !== null && NO_LINE_END.has(last.ch.trimEnd())) carry = line.pop()!;
    lines.push(line);
    line = carry ? [carry, token] : [token];
    used = line.reduce((sum, t) => sum + t.width + (t.trail ?? 0), 0);
  }
  lines.push(line);
  return lines;
}
