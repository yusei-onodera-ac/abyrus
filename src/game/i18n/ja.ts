// The Japanese messages: the source of truth for every key. One file per namespace under ja/ (so screens can be worked on
// without touching each other); keys start with the file's name (`home.idle.title` lives in ja/home.ts).
import { common } from './ja/common';
import { boot } from './ja/boot';
import { home } from './ja/home';
import { settings } from './ja/settings';
import { shop } from './ja/shop';
import { gacha } from './ja/gacha';
import { quest } from './ja/quest';
import { battle } from './ja/battle';
import { hero } from './ja/hero';
import { mission } from './ja/mission';
import { social } from './ja/social';
import { alliance } from './ja/alliance';
import { tutorial } from './ja/tutorial';
import { sys } from './ja/sys';
import { transfer } from './ja/transfer';
import { village } from './ja/village';

export const ja = {
  ...common,
  ...boot,
  ...home,
  ...settings,
  ...shop,
  ...gacha,
  ...quest,
  ...battle,
  ...hero,
  ...mission,
  ...social,
  ...alliance,
  ...tutorial,
  ...sys,
  ...transfer,
  ...village,
} as const;
