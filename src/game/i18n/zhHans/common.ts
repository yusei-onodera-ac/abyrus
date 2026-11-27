import type { Part } from '../types';

// 简体中文 (Simplified Chinese) messages: common.* — the same keys as ja/common.ts (copy en/common.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const common: Partial<Part<'common'>> = {
  'common.close': '关闭',
  'common.claim': '领取',
  'common.claimed': '已领取',
  'common.confirm': '确认',
  'common.back': '返回',
  'common.cancel': '取消',
  'common.delete': '删除',
  'common.change': '修改',
  'common.register': '绑定',
  'common.release': '解绑',
  'common.send': '发送',
  'common.skip': '跳过',
  'common.next': '下一步',
  'common.details': '详情',
  'common.yes': '是',
  'common.no': '否',
  'common.ok': '好的',
};
