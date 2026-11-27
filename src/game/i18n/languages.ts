/** The languages the game can be shown in. Adding one: see docs/I18N.md ("Adding a language"). */
export interface LanguageInfo {
  /** The code kept in the save (settings.language). */
  readonly code: string;
  /** The language's own name, shown in the language picker (never translated). */
  readonly name: string;
  /** BCP 47 tag for Intl (number grouping, plural rules). */
  readonly locale: string;
  /** Tried in this order after the language itself when a key is missing (Japanese, the source text, is always last). */
  readonly fallback: readonly string[];
  /** Device language tags (lower case, prefix match against navigator.language) that choose this language on a first run. When
   *  several languages match, the longest prefix wins: `zh-hant` (Traditional) beats the bare `zh` (Simplified), so `zh-Hant-CN` is
   *  Traditional and `zh-Hans-TW` is Simplified. */
  readonly match: readonly string[];
  /** A language that is still being written: its table may lack keys (they show in Japanese) and the checker only reports the gap. */
  readonly partial?: boolean;
}

export const LANGUAGES = [
  { code: 'ja', name: '日本語', locale: 'ja-JP', fallback: [], match: ['ja'] },
  { code: 'en', name: 'English', locale: 'en-US', fallback: ['ja'], match: ['en'] },
  // The three below are being translated (their tables are partial): a gap shows in English, then in Japanese.
  { code: 'ko', name: '한국어', locale: 'ko-KR', fallback: ['en'], match: ['ko'], partial: true },
  // (the names are written in each language's own script: 简体 = Simplified, 繁體 = Traditional)
  { code: 'zh-Hans', name: '简体中文', locale: 'zh-Hans-CN', fallback: ['en'], match: ['zh', 'zh-hans', 'zh-cn', 'zh-sg'], partial: true },
  { code: 'zh-Hant', name: '繁體中文', locale: 'zh-Hant-TW', fallback: ['en'], match: ['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'], partial: true },
] as const satisfies readonly LanguageInfo[];

export type Language = (typeof LANGUAGES)[number]['code'];

/** The source language: every key exists in it, and a missing translation falls back to it. */
export const SOURCE_LANGUAGE: Language = 'ja';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGES.some((l) => l.code === value);
}

export function languageInfo(code: Language): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** The language to start in on a first run, from the device's language tag (`navigator.language`):
 *  a tag of a language we have -> that language, any other language -> English, nothing usable -> Japanese
 *  (existing saves never come through here: they keep the language they were saved with, Japanese for old ones).
 *  iOS gives tags such as `zh-Hans-JP`, `zh-Hant-TW`, `ko-KR`: for Chinese the script (Hans / Hant) decides, then the region
 *  (TW HK MO = Traditional), and a bare `zh` is Simplified (the longest matching prefix wins, see `match`). */
export function detectLanguage(tag: string | readonly string[] | null | undefined): Language {
  const first = typeof tag === 'string' ? tag : Array.isArray(tag) ? (tag[0] as string | undefined) : undefined;
  const normalized = typeof first === 'string' ? first.trim().toLowerCase().replace(/_/g, '-') : '';
  if (!/^[a-z]{2,3}(-|$)/.test(normalized)) return SOURCE_LANGUAGE;
  let best: Language | null = null;
  let bestLength = 0;
  for (const lang of LANGUAGES) {
    for (const m of lang.match) {
      // (a match is the whole tag or a prefix followed by "-", so "en" matches "en-GB" but "ja" never matches "jav")
      if ((normalized === m || normalized.startsWith(`${m}-`)) && m.length > bestLength) {
        best = lang.code;
        bestLength = m.length;
      }
    }
  }
  return best ?? 'en';
}

/** The order messages are looked up in for `lang`: itself, its fallbacks, then the source language. */
export function fallbackChain(lang: Language): Language[] {
  const chain: Language[] = [lang];
  for (const code of languageInfo(lang).fallback) if (isLanguage(code) && !chain.includes(code)) chain.push(code);
  if (!chain.includes(SOURCE_LANGUAGE)) chain.push(SOURCE_LANGUAGE);
  return chain;
}
