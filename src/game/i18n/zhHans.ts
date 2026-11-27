// 简体中文 (Simplified Chinese) messages: the namespace files under zhHans/ bundled (same shape as en.ts, but not yet complete: Partial).
import type { Messages } from './types';
import { alliance } from './zhHans/alliance';
import { battle } from './zhHans/battle';
import { boot } from './zhHans/boot';
import { common } from './zhHans/common';
import { gacha } from './zhHans/gacha';
import { hero } from './zhHans/hero';
import { home } from './zhHans/home';
import { mission } from './zhHans/mission';
import { quest } from './zhHans/quest';
import { settings } from './zhHans/settings';
import { shop } from './zhHans/shop';
import { social } from './zhHans/social';
import { sys } from './zhHans/sys';
import { transfer } from './zhHans/transfer';
import { tutorial } from './zhHans/tutorial';
import { village } from './zhHans/village';

export const zhHans: Partial<Messages> = {
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
