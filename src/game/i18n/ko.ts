// 한국어 (Korean) messages: the namespace files under ko/ bundled (same shape as en.ts, but not yet complete: Partial).
import type { Messages } from './types';
import { alliance } from './ko/alliance';
import { battle } from './ko/battle';
import { boot } from './ko/boot';
import { common } from './ko/common';
import { gacha } from './ko/gacha';
import { hero } from './ko/hero';
import { home } from './ko/home';
import { mission } from './ko/mission';
import { quest } from './ko/quest';
import { settings } from './ko/settings';
import { shop } from './ko/shop';
import { social } from './ko/social';
import { sys } from './ko/sys';
import { transfer } from './ko/transfer';
import { tutorial } from './ko/tutorial';
import { village } from './ko/village';

export const ko: Partial<Messages> = {
  ...alliance,
  ...battle,
  ...boot,
  ...common,
  ...gacha,
  ...hero,
  ...home,
  ...mission,
  ...quest,
  ...settings,
  ...shop,
  ...social,
  ...sys,
  ...transfer,
  ...tutorial,
  ...village,
};
