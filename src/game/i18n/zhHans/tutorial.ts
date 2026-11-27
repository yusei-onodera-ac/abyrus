import type { Part } from '../types';

// 简体中文 (Simplified Chinese) messages: tutorial.* — the same keys as ja/tutorial.ts (copy en/tutorial.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const tutorial: Partial<Part<'tutorial'>> = {
  // TutorialOverlay.ts
  'tutorial.overlay.tapGlow': '点击发光的地方吧',
  'tutorial.overlay.reallySkip': '真的要跳过吗？',
  // TutorialDirector.ts
  'tutorial.done.village': '村庄教程完成！',
  'tutorial.done.main': '教程完成！',
  'tutorial.done.villageNote': '琉璃：加油建设村庄哦！',
  'tutorial.done.mainNote': '琉璃：辛苦啦！以后也请多多关照哦。',
};
