import { setLanguage } from './core';
import { isLanguage, type Language } from './languages';

/** Called once by BootScene with the language the save holds: that is what the game starts in. In development `?lang=en` (any
 *  code we have) shows that language for this visit only, without touching the save or the device's remembered choice. */
export function applyLanguageAtBoot(saved: Language): Language {
  const dev = import.meta.env.DEV || import.meta.env.VITE_DEV_ENV === '1';
  const forced = dev && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
  if (forced && isLanguage(forced)) {
    setLanguage(forced, { persist: false });
    return forced;
  }
  setLanguage(saved);
  return saved;
}
