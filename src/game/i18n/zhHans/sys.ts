import type { Part } from '../types';

// 简体中文 (Simplified Chinese) messages: sys.* — the same keys as ja/sys.ts (copy en/sys.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const sys: Partial<Part<'sys'>> = {
  // Dialogs.ts
  'sys.dialog.deckName': '队伍名称',
  'sys.dialog.typeHere': '在此输入',
  'sys.dialog.enterText': '请输入内容',
  // RewardTiles.ts
  'sys.reward.gearStars': '装备★{rarity}',
  // MovieOverlay.ts
  'sys.movie.tapToSkip': '点击跳过',
  // SaveSystem.ts
  'sys.deck.name': '队伍{i}',
  'sys.deck.first': '队伍1',
  'sys.defaultPlayerName': '玩家',
  // manual (label tables that are read where they are drawn)
  'sys.class.warrior': '战士',
  'sys.class.mage': '法师',
  'sys.class.archer': '弓箭手',
  'sys.class.tank': '守护者',
  'sys.class.healer': '治疗师',
  'sys.slot.weapon': '武器',
  'sys.slot.armor': '护甲',
  'sys.slot.accessory': '饰品',
  'sys.good.gems': '魔晶石',
  'sys.good.gold': '金币',
  'sys.good.stamina': '体力',
  'sys.good.phaseMaterials': '阶段素材',
  'sys.good.skillEssence': '技能精华',
  'sys.badge.allianceCoin': '同盟币',
  'sys.badge.allianceCoinGlyph': '盟',
  'sys.badge.player': '玩家',
  'sys.badge.expGlyph': '经',
  'sys.badge.essenceGlyph': '技',
  // ui/format.ts
  'sys.time.justNow': '刚刚',
  'sys.time.minutesAgo': '{n}分钟前',
  'sys.time.hoursAgo': '{n}小时前',
  'sys.time.daysAgo': '{n}天前',
  'sys.time.daysLeft': '剩余{n}天',
  'sys.time.hoursLeft': '剩余{n}小时',
  'sys.time.minutesLeft': '剩余{n}分钟',
  'sys.time.days': '{n}天',
  'sys.time.hours': '{n}小时',
  'sys.time.hoursMinutes': '{h}小时{m}分钟',
  'sys.time.minutes': '{n}分钟',
  'sys.time.seconds': '{n}秒',
  'sys.time.minutesSeconds': '{m}分{s}秒',
  // data/events.ts, data/campaigns.ts
  'sys.event.range': '{from} ~ {to}',
  'sys.event.from': '{from} ~',
  'sys.event.until': '截至{to}',
  'sys.event.always': '常驻开放',
  'sys.campaign.gold': '金币',
  'sys.campaign.exp': '经验值',
  'sys.campaign.drop': '素材掉落',
  'sys.campaign.stamina': '体力消耗',
  'sys.campaign.idle': '挂机奖励',
  'sys.campaign.half': '{name}减半',
  'sys.campaign.times': '{name} ×{mul}',
};
