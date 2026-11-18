import { LANGUAGES, SOURCE_LANGUAGE, detectLanguage, fallbackChain, isLanguage, languageInfo, type Language } from './languages';
import { TABLES } from './tables';
import type { MessageKey, ParamArgs, ParamValue } from './types';

export type Params = Readonly<Record<string, ParamValue>>;

// ---------------------------------------------------------------- formatting

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralCategory(locale: string, n: number): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(n);
}

/** Index of the "}" that closes the "{" at `open` (nesting counted), or -1. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** `{name}` is replaced by params.name. `{n, plural, one {# item} other {# items}}` picks a form by the language's plural
 *  rules (`=0 {..}` matches exactly; `#` is the number); the Japanese source text never needs it. Anything unknown is left
 *  as typed so a mistake is visible rather than silent. */
export function formatMessage(message: string, params: Params | undefined, locale: string): string {
  if (!message.includes('{')) return message;
  let out = '';
  for (let i = 0; i < message.length; i++) {
    if (message[i] !== '{') {
      out += message[i];
      continue;
    }
    const end = closingBrace(message, i);
    if (end < 0) return out + message.slice(i);
    out += expand(message.slice(i + 1, end), params, locale);
    i = end;
  }
  return out;
}

function expand(inner: string, params: Params | undefined, locale: string): string {
  const comma = inner.indexOf(',');
  if (comma < 0) {
    const value = params?.[inner.trim()];
    return value === undefined ? `{${inner}}` : String(value);
  }
  const name = inner.slice(0, comma).trim();
  const rest = inner.slice(comma + 1).trim();
  const value = params?.[name];
  if (value === undefined || !rest.startsWith('plural')) return `{${inner}}`;
  const n = Number(value);
  const options = new Map<string, string>();
  let body = rest.slice('plural'.length).replace(/^\s*,/, '');
  for (;;) {
    const m = /^\s*([=\w]+)\s*\{/.exec(body);
    if (!m) break;
    const open = m[0].length - 1;
    const close = closingBrace(body, open);
    if (close < 0) break;
    options.set(m[1], body.slice(open + 1, close));
    body = body.slice(close + 1);
  }
  const chosen = options.get(`=${n}`) ?? options.get(pluralCategory(locale, n)) ?? options.get('other') ?? '';
  return formatMessage(chosen.replace(/#/g, String(value)), params, locale);
}

// ---------------------------------------------------------------- language state

const STORAGE_KEY = 'abyrus.lang';

function readStored(): Language | null {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

function deviceLanguage(): Language {
  return detectLanguage(typeof navigator === 'undefined' ? undefined : navigator.language);
}

/** What the game is shown in right now. The first value is the language the player used last on this device (so the very first
 *  screens, before the save is read, already match), else the device's. Boot then applies the save's own setting. */
let current: Language = readStored() ?? deviceLanguage();
const listeners = new Set<(lang: Language) => void>();

function applyToDocument(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyToDocument();

export function getLanguage(): Language {
  return current;
}

/** Switches the language. `persist: false` is for a temporary choice (the development `?lang=` override). Text already drawn does
 *  not change by itself: the caller restarts its scene (see docs/I18N.md, "Refreshing the screen"). */
export function setLanguage(lang: Language, opts: { persist?: boolean } = {}): void {
  if (!isLanguage(lang)) return;
  const changed = lang !== current;
  current = lang;
  applyToDocument();
  if (opts.persist !== false) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // (private mode etc.: the save still remembers it)
    }
  }
  if (changed) for (const fn of [...listeners]) fn(lang);
}

/** Calls `fn` after every language change; returns the function that stops it. */
export function onLanguageChange(fn: (lang: Language) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The language a brand-new save starts with. */
export function defaultLanguageForNewSave(): Language {
  return deviceLanguage();
}

// ---------------------------------------------------------------- lookup

const warned = new Set<string>();

/** The message `key` in `lang`: that language, then its fallbacks, then Japanese; the key itself if nobody has it. */
export function translate(lang: Language, key: string, params?: Params): string {
  for (const code of fallbackChain(lang)) {
    const message = (TABLES[code] as Readonly<Record<string, string | undefined>>)[key];
    if (message !== undefined) return formatMessage(message, params, languageInfo(code).locale);
  }
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[i18n] missing message: ${key}`);
  }
  return key;
}

/** The message `key` in the current language, `{name}` placeholders filled from `params`.
 *  Never call it where it runs once and is kept (module constants, class field initializers): it would stay in the language of that
 *  moment. Keep the key and call `t` where the text is drawn. */
export function t<K extends MessageKey>(key: K, ...args: ParamArgs<K>): string {
  return translate(current, key, args[0]);
}

/** The same lookup for a key that is built at run time (`t` only takes the keys that exist, which is what keeps typos out; use
 *  this only for keys that come from data, and list them in a typed map so they can still be checked). */
export function tDynamic(key: string, params?: Params): string {
  return translate(current, key, params);
}

/** A whole number with every digit, grouped the way the language does ("1,234,567"). Never abbreviated (no 万/億/K/M). */
export function formatNumber(n: number | bigint, lang: Language = current): string {
  return new Intl.NumberFormat(languageInfo(lang).locale, { maximumFractionDigits: 0 }).format(n);
}

/** For "1 item / 2 items" outside a message: the plural category ('one', 'other' ...) of `n` in the current language. */
export function pluralOf(n: number, lang: Language = current): Intl.LDMLPluralRule {
  return new Intl.PluralRules(languageInfo(lang).locale).select(n);
}

export { LANGUAGES, SOURCE_LANGUAGE };
