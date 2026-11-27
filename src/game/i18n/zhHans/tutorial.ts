import type { Part } from '../types';

// 简体中文 (Simplified Chinese) messages: tutorial.* — the same keys as ja/tutorial.ts (copy en/tutorial.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const tutorial: Partial<Part<'tutorial'>> = {};
