import type { DataTexts } from '../dataTexts';
import { tutorialEn } from './tutorialEn';
import { villageEn } from './villageEn';
import { missionsEn } from './missionsEn';
import { shopEn } from './shopEn';
import { worldEn } from './worldEn';
import { heroesEn } from './heroesEn';
import { heroLinesEn } from './heroLinesEn';
import { storyEn } from './storyEn';

/** English text of the game's data (heroes, skills, enemies, stages, story, items ...): see docs/I18N.md. Anything not listed here
 *  is shown in Japanese by `tr()`. Shape: `{ <table>: { <id>: { <field>: 'text' } } }`. One file per area: villageEn (the village), missionsEn
 *  (missions, gifts, mails, notices, supply), shopEn (shop, premium, summon banners), worldEn (regions, dungeons, expeditions, gear),
 *  tutorialEn; the materials (data/items.ts) are below. Skills, hero names and lines, story, legal text and the yearly schedule are the
 *  next phase. */
export const enData: DataTexts = {
  ...villageEn,
  ...missionsEn,
  ...shopEn,
  ...worldEn,
  ...heroesEn,
  ...heroLinesEn,
  ...storyEn,
  tutorial: tutorialEn,
  item: {
    exp_s: { name: 'EXP Material (S)', short: 'EXP (S)', description: 'Gives a hero +100 EXP.' },
    exp_m: { name: 'EXP Material (M)', short: 'EXP (M)', description: 'Gives a hero +1,000 EXP.' },
    exp_l: { name: 'EXP Material (L)', short: 'EXP (L)', description: 'Gives a hero +10,000 EXP.' },
    exp_xl: { name: 'EXP Material (XL)', short: 'EXP (XL)', description: 'Gives a hero +100,000 EXP.' },
    equip_essence: { name: 'Gear Upgrade Material', short: 'Upgrade Mat.', description: 'Used to level up gear. Get it by dismantling gear.' },
  },
};
