import type { DataTexts } from '../dataTexts';

/** English of the alliance's data: data/alliance.ts (the raid bosses' descriptions - their names come from the regions' -, the donation
 *  kinds, the war's rank bands, the alliance shop, and the made-up alliances, members and chat lines of the offline world) and
 *  data/socialSeed.ts (the placeholder friends and chat lines of a new save). Words: Raid Boss, Alliance War, Helper, Alliance Coins,
 *  Rate-Up ... as in the screens (docs/I18N.md). A made-up alliance's name is "prefix suffix" (`alliance.sim.allianceName`).
 *  A member's name is written the way the Japanese reads (Hepburn without long marks). */
const SIM_ALLIANCE_PREFIX = ['Azure Moon', 'Crimson', 'Platinum', 'Blackiron', 'Golden Lion', 'Stardust', 'Gale', 'Deep Green', 'Thunder', 'Ice Blade', 'Dawn', 'Daybreak', 'Jade Storm', 'Blaze', 'Silver Wolf', 'Skyflight'];
const SIM_ALLIANCE_SUFFIX = ['Alliance', 'Knights', 'Union', 'Society', 'Corps', 'Squad'];
const SIM_NAMES = [
  'Akira', 'Sakuya', 'Leo', 'Misaki', 'Takumi', 'Haruka', 'Yuto', 'Nagi', 'Shion', 'Kanata', 'Ryo', 'Ayane', 'Kei', 'Moe', 'Jin', 'Hinata', 'Sota', 'Mirei', 'Daiki', 'Kokoro',
  'Toya', 'Luna', 'Hayate', 'Iori', 'Mahiro', 'Tsubasa', 'Kaede', 'Riku', 'Sena', 'Yoshino', 'Gaku', 'Nozomi', 'Tetsu', 'Yuzu', 'Shun', 'Akari', 'Ko', 'Mikoto', 'Hikaru', 'Natsuki',
];
const SIM_DESCRIPTIONS = [
  'A laid-back alliance that takes on the boss every day.',
  'Beginners welcome. Donate only what you comfortably can.',
  "We're aiming for the top of Alliance War!",
  "Let's all take down the boss together on weekends.",
  'We help each other by lending and borrowing Helpers.',
  'Relaxed, long-term, and fun.',
  'Strength does not matter. Motivated players are very welcome.',
  'Looking for members who can log in every day.',
];
const SIM_CHAT_LINES = [
  'Nice to meet you all!',
  'How much HP does the boss have left?',
  'Donated~',
  "Going to take on today's boss.",
  'Borrowed your Helper. Thanks!',
  'Good work, everyone!',
  'Alliance War is going well.',
  'I got Phase Material from the Shop!',
  "The boss is almost down! Let's all push!",
  'Got 3 crits in that last boss fight :star:',
];
const SIM_HELP_LINES = ['The Raid Boss is too strong... Please help!', 'Our village is under attack! Help!'];

/** `{ '<kind>.<n>': { text } }` for a list, n counted from 0 as in the Japanese list (data/alliance.ts, `simWords`). */
const listed = (kind: string, list: string[]): Record<string, Record<string, string>> => Object.fromEntries(list.map((text, i) => [`${kind}.${i}`, { text }]));

export const allianceEn: DataTexts = {
  // the weekly boss: the name is the region boss's (worldEn.ts), the description is here
  allianceBoss: {
    raid_forest: { description: 'The crimson-horned stag that rules the Lost Forest. Its charge crushes shield and all.' },
    raid_wasteland: { description: 'The scorpion queen that dwells beneath the dust. Her venomous tail breaks formations.' },
    raid_frostpeak: { description: 'The silver tiger, king of the frozen mountains. Every blow hits hard.' },
    raid_ruins: { description: 'A dragon of bone sleeping in the old ruins. This will be a long fight.' },
    raid_twilight: { description: 'A great wolf running through the dark. Can you keep up with its speed?' },
  },
  allianceDonation: {
    gold: { label: 'Gold' },
    materials: { label: 'Materials' },
    gems: { label: 'Gems' },
  },
  // the rank bands of the war's rewards, by "<from>-<to>"
  allianceWar: {
    '1-1': { label: '1st' },
    '2-2': { label: '2nd' },
    '3-3': { label: '3rd' },
    '4-6': { label: '4th-6th' },
    '7-10': { label: '7th-10th' },
    '11-20': { label: '11th-20th' },
  },
  allianceShop: {
    phase: { name: 'Phase Material ×1' },
    equip: { name: 'Gear Upgrade Material ×100' },
    exp_m: { name: 'EXP Material (M) ×3' },
    exp_l: { name: 'EXP Material (L) ×3' },
    gems: { name: 'Gems ×30' },
  },
  // the offline world's made-up alliances, members and chat
  allianceSim: {
    ...listed('prefix', SIM_ALLIANCE_PREFIX),
    ...listed('suffix', SIM_ALLIANCE_SUFFIX),
    ...listed('name', SIM_NAMES),
    ...listed('description', SIM_DESCRIPTIONS),
    ...listed('chat', SIM_CHAT_LINES),
    ...listed('help', SIM_HELP_LINES),
  },
  // data/socialSeed.ts: the people and chat lines a new save starts with (by friend id; chat lines by position)
  seedFriend: {
    K7M4RN2X: { name: 'Rin' },
    H3QWT9BC: { name: 'Kai' },
    P6ZD8FJY: { name: 'Mio' },
    C2VGX5LE: { name: 'Sora' },
  },
  seedChat: {
    '0': { senderName: 'Staff', text: "Welcome to the global chat! Let's all have fun together :star:" },
    '1': { senderName: 'Staff', text: 'Please refrain from harassment and disruptive behavior.' },
    '2': { senderName: 'Rin', text: 'Thanks for becoming my friend! Looking forward to playing together :smile:' },
  },
};
