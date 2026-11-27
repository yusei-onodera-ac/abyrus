import type { Part } from '../types';

// 简体中文 (Simplified Chinese) messages: mission.* — the same keys as ja/mission.ts (copy en/mission.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const mission: Partial<Part<'mission'>> = {};
