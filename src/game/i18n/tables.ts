import { en } from './en';
import { ja } from './ja';
import { ko } from './ko';
import { zhHans } from './zhHans';
import { zhHant } from './zhHant';
import type { Language } from './languages';
import type { Messages } from './types';

/** Every language's messages. A language that is not finished yet may be typed `Partial<Messages>`: whatever it lacks is shown
 *  in the fallback language (Japanese at the end of the chain), and `npm run i18n:check` reports the gap. */
export const TABLES: Record<Language, Readonly<Partial<Messages>>> = { ja, en, ko, 'zh-Hans': zhHans, 'zh-Hant': zhHant };

export { LANGUAGES } from './languages';
