// 简体中文 (Simplified Chinese) text of the game's data (the same shape as en.ts); one file per area, bundled here.
import type { DataTexts } from '../dataTexts';
import { allianceZhHans } from './allianceZhHans';
import { heroLinesZhHans } from './heroLinesZhHans';
import { heroesZhHans } from './heroesZhHans';
import { itemsZhHans } from './itemsZhHans';
import { missionsZhHans } from './missionsZhHans';
import { scheduleZhHans } from './scheduleZhHans';
import { shopZhHans } from './shopZhHans';
import { skillsZhHans } from './skillsZhHans';
import { storyZhHans } from './storyZhHans';
import { tutorialZhHans } from './tutorialZhHans';
import { villageZhHans } from './villageZhHans';
import { worldZhHans } from './worldZhHans';

export const zhHansData: DataTexts = {
  ...allianceZhHans,
  ...heroLinesZhHans,
  ...heroesZhHans,
  ...itemsZhHans,
  ...missionsZhHans,
  ...scheduleZhHans,
  ...shopZhHans,
  ...skillsZhHans,
  ...storyZhHans,
  ...tutorialZhHans,
  ...villageZhHans,
  ...worldZhHans,
};
