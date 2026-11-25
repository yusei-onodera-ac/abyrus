// The game's text: `t('home.idle.title')`. See docs/I18N.md.
export { t, tDynamic, translate, formatMessage, formatNumber, pluralOf, getLanguage, setLanguage, onLanguageChange, defaultLanguageForNewSave } from './core';
export { tr, trList, localized, type DataTexts } from './dataTexts';
export { applyLanguageAtBoot } from './boot';
export { LANGUAGES, SOURCE_LANGUAGE, detectLanguage, fallbackChain, isLanguage, languageInfo, type Language, type LanguageInfo } from './languages';
export type { MessageKey, Messages, PlainKey } from './types';
