import { getLanguage } from './core';
import type { Language } from './languages';

/** The three faces the game draws text in: the body face (`sans`), the heading face (`serif`) and the heavy face for big
 *  numbers and banners (`black`). */
export type FontKind = 'sans' | 'serif' | 'black';

// What goes after the Latin face (Arial / Georgia / Arial Black, which have no Han characters, kana or Hangul) in the stack, per language.
// Han characters are drawn by the first listed font that has them, so the order is what decides which country's letter shapes you see:
// a Chinese text must hit the Chinese font before the Japanese one, or 直 and 骨 come out in their Japanese shapes. System fonts only
// (iOS: Hiragino, Apple SD Gothic Neo, PingFang; Windows: Malgun Gothic, Microsoft YaHei, Microsoft JhengHei); the Noto names are for
// any other machine that has them.
// (Record<Language, ...>: a language added to LANGUAGES must say its fonts here, or it does not compile.)
const FONTS: Record<Language, { sans: string; serif: string }> = {
  ja: { sans: '"Hiragino Kaku Gothic ProN", "Noto Sans JP"', serif: '"Hiragino Mincho ProN", "Noto Serif JP"' },
  en: { sans: '"Hiragino Kaku Gothic ProN", "Noto Sans JP"', serif: '"Hiragino Mincho ProN", "Noto Serif JP"' },
  ko: {
    sans: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR"',
    serif: '"AppleMyungjo", "Batang", "Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic"',
  },
  'zh-Hans': {
    sans: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC"',
    serif: '"Songti SC", "SimSun", "Noto Serif SC", "PingFang SC", "Microsoft YaHei"',
  },
  'zh-Hant': {
    sans: '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC"',
    serif: '"Songti TC", "PMingLiU", "Noto Serif TC", "PingFang TC", "Microsoft JhengHei"',
  },
};

/** The CSS font-family list for `kind` in `lang` (the language being shown unless one is given: the language picker names each
 *  language in its own letters). Phaser's `fontFamily`, a canvas `font`, and DOM `font:` all take it. Call it where the text is drawn:
 *  screens are rebuilt after a language change, so a stack read then is the right one (never keep it in a module constant). */
export function fontFamily(kind: FontKind = 'sans', lang: Language = getLanguage()): string {
  const head = kind === 'serif' ? 'Georgia' : kind === 'black' ? 'Arial Black' : 'Arial';
  return kind === 'serif' ? `${head}, ${FONTS[lang].serif}, serif` : `${head}, ${FONTS[lang].sans}, sans-serif`;
}
