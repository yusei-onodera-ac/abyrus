// The English messages. Typed as a complete Messages, and each en/<ns>.ts as Part<ns>: a key missing from (or extra to) the
// Japanese table is a compile error.
import type { Messages } from './types';
import { common } from './en/common';
import { boot } from './en/boot';
import { home } from './en/home';
import { settings } from './en/settings';
import { shop } from './en/shop';
import { gacha } from './en/gacha';
import { quest } from './en/quest';
import { battle } from './en/battle';
import { hero } from './en/hero';
import { mission } from './en/mission';
import { social } from './en/social';
import { alliance } from './en/alliance';
import { tutorial } from './en/tutorial';
import { sys } from './en/sys';
import { transfer } from './en/transfer';

export const en: Messages = {
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
};
