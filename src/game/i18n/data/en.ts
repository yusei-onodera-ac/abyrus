import type { DataTexts } from '../dataTexts';
import { tutorialEn } from './tutorialEn';
import { villageEn } from './villageEn';
import { missionsEn } from './missionsEn';
import { shopEn } from './shopEn';
import { skillsEn } from './skillsEn';
import { worldEn } from './worldEn';
import { heroesEn } from './heroesEn';
import { heroLinesEn } from './heroLinesEn';
import { storyEn } from './storyEn';
import { scheduleEn } from './scheduleEn';
import { allianceEn } from './allianceEn';
import { itemsEn } from './itemsEn';

/** English text of the game's data (heroes, skills, enemies, stages, story, items ...): see docs/I18N.md. Anything not listed here
 *  is shown in Japanese by `tr()`. Shape: `{ <table>: { <id>: { <field>: 'text' } } }`. One file per area: villageEn (the village), missionsEn
 *  (missions, gifts, mails, notices, supply), shopEn (shop, premium, summon banners), worldEn (regions, dungeons, expeditions, gear),
 *  tutorialEn, itemsEn (the materials), skillsEn, heroesEn, heroLinesEn, storyEn, scheduleEn, allianceEn. Legal text is not translated yet. */
export const enData: DataTexts = {
  ...villageEn,
  ...missionsEn,
  ...shopEn,
  ...skillsEn,
  ...worldEn,
  ...heroesEn,
  ...heroLinesEn,
  ...storyEn,
  ...scheduleEn,
  ...allianceEn,
  tutorial: tutorialEn,
  ...itemsEn,
};
