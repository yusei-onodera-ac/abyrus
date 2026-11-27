import type { DataTexts } from '../dataTexts';

/** English of data/shop.ts (products), premium.ts and gachaBanners.ts (the four permanent banners; the limited ones come from
 *  data/schedule.ts with the events). */
export const shopEn: DataTexts = {
  shop: {
    'pack-starter': { name: 'Starter Pack', description: 'A one-time bundle that gives your first adventure a big boost.', badge: 'First-Time Only' },
    'pack-limited': { name: 'Deluxe Pack', description: 'An extra-large pack you can buy once a month while it is on sale.', badge: 'Limited Time' },
    'pack-weekly': { name: 'Weekly Pack', description: 'A staple pack for restocking once a week.' },
    'pack-daily': { name: 'Daily Deal Pack', description: 'Gems and Stamina at a nice discount, once a day.' },
    'pack-adventurer': { name: "Adventurer's Support Pack", description: 'A pack you can buy with Gems: Gold, materials and Stamina all in one.', badge: 'Buy with Gems' },
    'gems-50': { name: 'Gems' },
    'gems-160': { name: 'Gems' },
    'gems-330': { name: 'Gems' },
    'gems-850': { name: 'Gems' },
    'gems-1800': { name: 'Gems', badge: 'Recommended' },
    'gems-3800': { name: 'Gems' },
    'gold-1000': { name: 'Gold' },
    'gold-6000': { name: 'Gold' },
    'gold-14000': { name: 'Gold' },
    'gold-80000': { name: 'Gold', badge: 'Recommended' },
    'item-stamina-s': { name: 'Stamina Potion (S)', description: 'Restores 10 Stamina.' },
    'item-stamina-m': { name: 'Stamina Potion (M)', description: 'Restores 30 Stamina.' },
    'item-stamina-l': { name: 'Stamina Potion (L)', description: 'Restores 50 Stamina.' },
    'item-phase-1': { name: 'Phase Material', description: "Raises a hero's Phase by one step." },
    'item-phase-5': { name: 'Phase Material ×5', description: 'Phase Material in bulk.' },
    'item-exp-m': { name: 'EXP Material (M) ×5', description: 'Gives a hero +5,000 EXP.' },
    'item-exp-l': { name: 'EXP Material (L) ×3', description: 'Gives a hero +30,000 EXP.' },
    'item-exp-xl': { name: 'EXP Material (XL)', description: 'Gives a hero +100,000 EXP.' },
    'item-skill-s': { name: 'Skill Essence ×300', description: 'Used to level up skills.' },
    'item-skill-l': { name: 'Skill Essence ×1,000', description: 'Skill Essence in bulk, used to level up skills.' },
    'item-equip-s': { name: 'Gear Upgrade Material ×100', description: 'Used to level up gear.' },
    'item-equip-l': { name: 'Gear Upgrade Material ×500', description: 'Gear Upgrade Material in bulk, used to level up gear.' },
  },
  premium: {
    pass: { name: 'Premium Pass (30 Days)' },
  },
  gachaBanner: {
    special: { title: 'Special Summon', description: 'New ★6 "Aion, the Infinite Emperor" arrives!' },
    first: { title: 'First Summon', description: 'A ★4 or better is guaranteed by the 30th pull!', emblem: '1' },
    'equip-standard': { title: 'Gear Summon', description: 'Get weapons, armor and accessories', emblem: 'G' },
    standard: { title: 'Standard Summon', description: 'All heroes of ★5 and below can appear' },
  },
};
