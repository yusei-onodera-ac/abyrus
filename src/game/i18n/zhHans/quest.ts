import type { Part } from '../types';

// 简体中文 (Simplified Chinese) messages: quest.* — the same keys as ja/quest.ts (copy en/quest.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const quest: Partial<Part<'quest'>> = {};
