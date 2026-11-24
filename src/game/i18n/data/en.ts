import type { DataTexts } from '../dataTexts';
import { tutorialEn } from './tutorialEn';
import { villageEn } from './villageEn';
import { missionsEn } from './missionsEn';
import { shopEn } from './shopEn';
import { worldEn } from './worldEn';

/** English text of the game's data (heroes, skills, enemies, stages, story, items ...): see docs/I18N.md. Anything not listed here
 *  is shown in Japanese by `tr()`. Shape: `{ <table>: { <id>: { <field>: 'text' } } }`. Phase 1 has the materials (data/items.ts);
 *  the rest is phase 2 (split this into one file per table when it grows). */
export const enData: DataTexts = {
  ...villageEn,
  ...missionsEn,
  ...shopEn,
  ...worldEn,
  tutorial: tutorialEn,
  item: {
    exp_s: { name: 'EXP Material (S)', short: 'EXP (S)', description: 'Gives a hero +100 EXP.' },
    exp_m: { name: 'EXP Material (M)', short: 'EXP (M)', description: 'Gives a hero +1,000 EXP.' },
    exp_l: { name: 'EXP Material (L)', short: 'EXP (L)', description: 'Gives a hero +10,000 EXP.' },
    exp_xl: { name: 'EXP Material (XL)', short: 'EXP (XL)', description: 'Gives a hero +100,000 EXP.' },
    equip_essence: { name: 'Gear Upgrade Material', short: 'Upgrade Mat.', description: 'Used to level up gear. Get it by dismantling gear.' },
  },
};
