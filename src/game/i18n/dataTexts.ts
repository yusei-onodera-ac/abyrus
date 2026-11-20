import { enData } from './data/en';
import { getLanguage } from './core';
import { fallbackChain, type Language } from './languages';

/** Translated text of the game's data tables: `{ table: { id: { field: text } } }`, e.g. `{ hero: { h012: { name: 'Lia' } } }`. */
export type DataTexts = Record<string, Record<string, Record<string, string>>>;

const DATA_TEXTS: Partial<Record<Language, DataTexts>> = { en: enData };

/** The seam for text that lives in a data table (a hero's name, a skill's description, a stage title ...): returns the table's
 *  translation for the current language, or `ja` (the text as it stands in the data, always Japanese) when there is none.
 *
 *    name: tr('hero', hero.id, 'name', hero.name)
 *
 *  Call it where the text is shown, not where the table is built, so a language change is picked up. */
export function tr(table: string, id: string, field: string, ja: string): string {
  for (const lang of fallbackChain(getLanguage())) {
    const found = DATA_TEXTS[lang]?.[table]?.[id]?.[field];
    if (found !== undefined) return found;
  }
  return ja;
}

/** `tr()` for a list of lines (a tutorial step's `lines`): the translation keeps them in one text, separated by line breaks. */
export function trList(table: string, id: string, field: string, ja: readonly string[]): string[] {
  const found = tr(table, id, field, '');
  return found === '' ? [...ja] : found.split('\n');
}
