import type { Part } from '../types';

// English messages: gacha.* (typed against ja/gacha.ts: a missing or extra key is a compile error)
export const gacha: Part<'gacha'> = {
  // GachaDetailScene.ts / GachaPanels.ts (written by hand)
  'gacha.detail.title': 'Summon Details',
  'gacha.detail.periodRange': 'Period: {start} – {end}',
  'gacha.detail.periodEnd': 'Period: until {end}',
  'gacha.detail.heroCount': '{count, plural, one {# Hero} other {# Heroes}}',
  'gacha.detail.gearCount': '{count, plural, one {# Piece} other {# Pieces}}',
  'gacha.detail.rateUpChip': 'RATE-UP',
  'gacha.banner.titleEnds': '{title}  Until {end}',
  // GachaScene.ts
  'gacha.title': 'Summon',
  'gacha.toast.friendSoon': 'Friend Summon: coming soon',
  'gacha.noBanners': 'No banners are active right now',
  'gacha.toast.notEnoughGems': 'Not enough Gems',
  'gacha.gearAddedNote': 'Gear was added to your bag (view and upgrade it on the Gear screen)',
  'gacha.tapHeroHint': 'Tap a Hero to see its details',
  'gacha.tenPullNote': 'At least one of every 10 pulls is ★{tenMin} or higher.',
  // GachaDetailScene.ts
  'gacha.detail.price': '1 pull: {costOf} Gems / 10 pulls: {costOf2} Gems',
  'gacha.detail.rateUpLine': '[Rate-Up] {pickup}',
  'gacha.detail.pickupSeparator': ' / ',
  'gacha.detail.pityRateUp': '[Pity] Pull {at} guarantees one Rate-Up Hero of ★{minRarity} or higher.',
  'gacha.detail.pity': '[Pity] Pull {at} guarantees one Hero of ★{minRarity} or higher.',
  'gacha.detail.pityReset': 'The count resets to 0 when you get ★{minRarity} or higher. ({left, plural, one {# pull} other {# pulls}} until guaranteed)',
  'gacha.detail.noPity': 'This banner has no pity.',
  'gacha.detail.tenGuarantee': '[10-Pull Guarantee] {ten}',
  'gacha.detail.previewHint': 'Tap a Hero to preview it at max Level, Phase and Skills.',
  'gacha.detail.duplicateNote': 'Duplicate Heroes are added to your Collection too. (Only one copy of the same Hero can be placed in a Party.)',
  'gacha.detail.rates': 'Summon Rates',
  // GachaPanels.ts
  'gacha.bannerSoon': 'Banner coming soon',
  'gacha.friendSummon': 'Friend Summon',
  'gacha.banner.pityRateUpNext': 'Rate-Up guaranteed on next pull!',
  'gacha.banner.pityRateUpIn': 'Rate-Up guaranteed in {left, plural, one {# pull} other {# pulls}}',
  'gacha.banner.pityNext': '★{minRarity}+ guaranteed on next pull!',
  'gacha.banner.pityIn': '★{minRarity}+ guaranteed in {left, plural, one {# pull} other {# pulls}}',
  'gacha.banner.single': 'Summon ×1',
  'gacha.banner.cost': '{costOf} Gems',
  'gacha.banner.ten': 'Summon ×10',
};
