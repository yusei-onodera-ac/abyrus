// 한국어 (Korean) text of the game's data (the same shape as en.ts); one file per area, bundled here.
import type { DataTexts } from '../dataTexts';
import { allianceKo } from './allianceKo';
import { heroLinesKo } from './heroLinesKo';
import { heroesKo } from './heroesKo';
import { itemsKo } from './itemsKo';
import { missionsKo } from './missionsKo';
import { scheduleKo } from './scheduleKo';
import { shopKo } from './shopKo';
import { skillsKo } from './skillsKo';
import { storyKo } from './storyKo';
import { tutorialKo } from './tutorialKo';
import { villageKo } from './villageKo';
import { worldKo } from './worldKo';

export const koData: DataTexts = {
  ...allianceKo,
  ...heroLinesKo,
  ...heroesKo,
  ...itemsKo,
  ...missionsKo,
  ...scheduleKo,
  ...shopKo,
  ...skillsKo,
  ...storyKo,
  ...tutorialKo,
  ...villageKo,
  ...worldKo,
};
