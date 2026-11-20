import type { Part } from '../types';

// English messages: sys.* (typed against ja/sys.ts: a missing or extra key is a compile error)
export const sys: Part<'sys'> = {
  // Dialogs.ts
  'sys.dialog.deckName': 'Deck Name',
  'sys.dialog.typeHere': 'Type here',
  'sys.dialog.enterText': 'Please enter some text',
  // RewardTiles.ts
  'sys.reward.gearStars': 'Gear ★{rarity}',
  // MovieOverlay.ts
  'sys.movie.tapToSkip': 'Tap to skip',
  // SaveSystem.ts
  'sys.deck.name': 'Deck {i}',
  'sys.deck.first': 'Deck 1',
  'sys.defaultPlayerName': 'Player',
  // manual (label tables that are read where they are drawn)
  'sys.class.warrior': 'Warrior',
  'sys.class.mage': 'Mage',
  'sys.class.archer': 'Archer',
  'sys.class.tank': 'Guardian',
  'sys.class.healer': 'Healer',
  'sys.slot.weapon': 'Weapon',
  'sys.slot.armor': 'Armor',
  'sys.slot.accessory': 'Accessory',
  'sys.good.gems': 'Gems',
  'sys.good.gold': 'Gold',
  'sys.good.stamina': 'Stamina',
  'sys.good.phaseMaterials': 'Phase Material',
  'sys.good.skillEssence': 'Skill Essence',
  'sys.badge.allianceCoin': 'Alliance Coin',
  'sys.badge.allianceCoinGlyph': 'A',
  'sys.badge.player': 'Player',
  'sys.badge.expGlyph': 'XP',
  'sys.badge.essenceGlyph': 'S',
  // ui/format.ts
  'sys.time.justNow': 'Just now',
  'sys.time.minutesAgo': '{n}m ago',
  'sys.time.hoursAgo': '{n}h ago',
  'sys.time.daysAgo': '{n}d ago',
  'sys.time.daysLeft': '{n}d left',
  'sys.time.hoursLeft': '{n}h left',
  'sys.time.minutesLeft': '{n}m left',
  'sys.time.days': '{n}d',
  'sys.time.hours': '{n}h',
  'sys.time.hoursMinutes': '{h}h {m}m',
  'sys.time.minutes': '{n}m',
  'sys.time.seconds': '{n}s',
  'sys.time.minutesSeconds': '{m}m {s}s',
  // data/events.ts, data/campaigns.ts
  'sys.event.range': '{from} – {to}',
  'sys.event.from': 'From {from}',
  'sys.event.until': 'Until {to}',
  'sys.event.always': 'Always Available',
  'sys.campaign.gold': 'Gold',
  'sys.campaign.exp': 'EXP',
  'sys.campaign.drop': 'Material Drops',
  'sys.campaign.stamina': 'Stamina Cost',
  'sys.campaign.idle': 'Idle Rewards',
  'sys.campaign.half': '{name} Half',
  'sys.campaign.times': '{name} ×{mul}',
};
