import type { DataTexts } from '../dataTexts';

/** English of data/missions.ts (the titles; the tab names are in the translation tables), gifts.ts, mails.ts, notices.ts (the two written
 *  notices; the ones the year's calendar makes are phase 3 with the events) and supply.ts. A gift or mail is copied into the save when
 *  it is delivered, so it keeps the language of that moment (docs/I18N.md). */
export const missionsEn: DataTexts = {
  mission: {
    // daily
    quest3: { title: 'Clear 3 Quests' },
    quest10: { title: 'Clear 10 Quests' },
    stamina50: { title: 'Use 50 Stamina' },
    gacha1: { title: 'Summon once' },
    hero1: { title: 'Enhance a Hero' },
    equip1: { title: 'Upgrade Gear' },
    idle1: { title: 'Claim Idle Rewards' },
    infinite1: { title: 'Play Infinite Mode' },
    expedition2: { title: 'Complete 2 Expeditions' },
    village1: { title: 'Village: Build or upgrade ×1' },
    supply2: { title: 'Claim Supplies 2 times' },
    // weekly
    w_quest30: { title: 'Clear 30 Quests' },
    w_quest80: { title: 'Clear 80 Quests' },
    w_stamina400: { title: 'Use 400 Stamina' },
    w_gacha10: { title: 'Summon 10 times' },
    w_hero10: { title: 'Enhance Heroes 10 times' },
    w_equip10: { title: 'Upgrade Gear 10 times' },
    w_idle5: { title: 'Claim Idle Rewards 5 times' },
    w_infinite5: { title: 'Play Infinite Mode 5 times' },
    w_expedition10: { title: 'Complete 10 Expeditions' },
    w_village5: { title: 'Village: Build or upgrade ×5' },
    w_supply10: { title: 'Claim Supplies 10 times' },
    // achievements
    t_stage10: { title: 'Reach Main Stage 10' },
    t_stage30: { title: 'Reach Main Stage 30' },
    t_stage60: { title: 'Reach Main Stage 60' },
    t_stage100: { title: 'Reach Main Stage 100' },
    t_stage150: { title: 'Clear all Main Stages' },
    t_quest10: { title: 'Clear 10 Quests in total' },
    t_quest50: { title: 'Clear 50 Quests in total' },
    t_quest150: { title: 'Clear 150 Quests in total' },
    t_quest500: { title: 'Clear 500 Quests in total' },
    t_level5: { title: 'Reach Player Lv.5' },
    t_level10: { title: 'Reach Player Lv.10' },
    t_level25: { title: 'Reach Player Lv.25' },
    t_level50: { title: 'Reach Player Lv.50' },
    t_gacha10: { title: 'Summon 10 times in total' },
    t_gacha50: { title: 'Summon 50 times in total' },
    t_gacha100: { title: 'Summon 100 times in total' },
    t_heroes5: { title: 'Collect 5 different Heroes' },
    t_heroes15: { title: 'Collect 15 different Heroes' },
    t_heroes30: { title: 'Collect 30 different Heroes' },
    t_hero10: { title: 'Enhance Heroes ×10 in total' },
    t_hero50: { title: 'Enhance Heroes ×50 in total' },
    t_equip10: { title: 'Upgrade Gear 10 times in total' },
    t_equip50: { title: 'Upgrade Gear 50 times in total' },
    t_infinite1: { title: 'First Infinite Mode run' },
    t_infinite10: { title: 'Infinite Mode ×10 in total' },
    t_idle7: { title: 'Claim Idle Rewards ×7 in total' },
    t_idle30: { title: 'Claim Idle Rewards ×30 in total' },
    t_expedition1: { title: 'Complete your first Expedition' },
    t_expedition20: { title: 'Expeditions completed ×20' },
    t_expedition100: { title: 'Expeditions completed ×100' },
    t_supply30: { title: 'Claim Supplies ×30 in total' },
    t_village1: { title: 'Village: First building' },
    t_village30: { title: 'Village: Build or upgrade ×30' },
    t_village150: { title: 'Village: Build or upgrade ×150' },
  },
  gift: {
    'welcome-gems': { title: 'Welcome Gift', message: 'Welcome to ABYRUS! Gather allies with Summons.' },
    'welcome-gold': { title: 'Adventure Fund', message: 'Use it for gear and growth.' },
    'thanks-gems': { title: 'Thank You for Playing', message: 'A little something to say thanks.' },
  },
  mail: {
    'welcome-mail': {
      title: 'Greetings from ABYRUS',
      body: "Nice to meet you. This is the ABYRUS Staff.\nThank you for signing up.\n\nWe've left a welcome gift for you in your Gifts. Please be sure to claim it.",
    },
    'tips-mail': {
      title: 'For First-Time Players',
      body: 'On the Party screen, you can create up to 5 decks.\nUse "Auto Party" to line up your strongest heroes automatically.\n\nThe deck in use heads out in Quests and Infinite Mode.',
    },
  },
  notice: {
    'new-gacha': {
      title: 'New Summon Now Available',
      body: "A new Summon is now live.\nCheck the active Summons and their rates on the Summon screen.\n\n*The period is shown in each Summon's heading.",
    },
    welcome: {
      title: 'Welcome to ABYRUS',
      body: "Thank you for playing ABYRUS.\n\nEarn EXP and Gold in Quests, add allies through Summons, and build a party that's yours alone.\n\nYou can check Notices, Gifts and Mail anytime with the buttons at the top right of the Home screen.",
    },
  },
  supply: {
    morning: { name: 'Morning Supply' },
    evening: { name: 'Evening Supply' },
  },
};
