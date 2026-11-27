import type { Part } from '../types';

// 简体中文 (Simplified Chinese) messages: gacha.* — the same keys as ja/gacha.ts (copy en/gacha.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const gacha: Partial<Part<'gacha'>> = {
  // GachaDetailScene.ts / GachaPanels.ts (written by hand)
  'gacha.detail.title': '召唤详情',
  'gacha.detail.periodRange': '活动时间：{start} ~ {end}',
  'gacha.detail.periodEnd': '活动时间：截至{end}',
  'gacha.detail.heroCount': '{count}名',
  'gacha.detail.gearCount': '{count}件',
  'gacha.detail.rateUpChip': '概率UP',
  'gacha.banner.titleEnds': '{title}　截至{end}',
  // GachaScene.ts
  'gacha.title': '召唤',
  'gacha.toast.friendSoon': '好友召唤：准备中',
  'gacha.noBanners': '当前没有进行中的召唤',
  'gacha.toast.notEnoughGems': '魔晶石不足',
  'gacha.gearAddedNote': '装备已放入背包（可在装备界面查看和强化）',
  'gacha.tapHeroHint': '点击英雄可查看详情',
  'gacha.tenPullNote': '10连召唤必定包含1名★{tenMin}以上的英雄。',
  // GachaDetailScene.ts
  'gacha.detail.price': '单次 {costOf} 魔晶石　／　10连 {costOf2} 魔晶石',
  'gacha.detail.rateUpLine': '【概率UP】{pickup}',
  'gacha.detail.pickupSeparator': '、',
  'gacha.detail.pityRateUp': '【保底】第{at}次召唤必定获得1名★{minRarity}以上的概率UP英雄。',
  'gacha.detail.pity': '【保底】第{at}次召唤必定获得1名★{minRarity}以上的英雄。',
  'gacha.detail.pityReset': '获得★{minRarity}以上后，次数重置为0。（当前再召唤{left}次必得）',
  'gacha.detail.noPity': '此召唤没有保底。',
  'gacha.detail.tenGuarantee': '【10连保底】{ten}',
  'gacha.detail.previewHint': '点击英雄，可查看等级、阶段、技能全部满级时的样子。',
  'gacha.detail.duplicateNote': '已拥有的英雄也会增加到图鉴中。（编队中同一英雄只能放入1名）',
  'gacha.detail.rates': '召唤概率',
  // GachaPanels.ts
  'gacha.bannerSoon': '卡池准备中',
  'gacha.friendSummon': '好友召唤',
  'gacha.banner.pityRateUpNext': '下次召唤必得概率UP英雄！',
  'gacha.banner.pityRateUpIn': '再召唤{left}次必得概率UP英雄',
  'gacha.banner.pityNext': '下次召唤必得★{minRarity}以上！',
  'gacha.banner.pityIn': '再召唤{left}次必得★{minRarity}以上',
  'gacha.banner.single': '单次召唤',
  'gacha.banner.cost': '{costOf} 魔晶石',
  'gacha.banner.ten': '10连召唤',
};
