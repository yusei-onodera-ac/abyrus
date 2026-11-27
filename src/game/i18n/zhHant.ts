// 生成: 直接編集しない。直すときは tools/i18n/zh-hant-overrides.json に書く (tools/i18n/zh-hant.mjs が、簡体字の表 (zhHans) から作る)。
import type { Messages } from './types';
import { alliance } from './zhHant/alliance';
import { battle } from './zhHant/battle';
import { boot } from './zhHant/boot';
import { common } from './zhHant/common';
import { gacha } from './zhHant/gacha';
import { hero } from './zhHant/hero';
import { home } from './zhHant/home';
import { mission } from './zhHant/mission';
import { quest } from './zhHant/quest';
import { settings } from './zhHant/settings';
import { shop } from './zhHant/shop';
import { social } from './zhHant/social';
import { sys } from './zhHant/sys';
import { transfer } from './zhHant/transfer';
import { tutorial } from './zhHant/tutorial';
import { village } from './zhHant/village';

export const zhHant: Partial<Messages> = {
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
