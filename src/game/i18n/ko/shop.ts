import type { Part } from '../types';

// 한국어 (Korean) messages: shop.* — the same keys as ja/shop.ts (copy en/shop.ts and translate; keep every {placeholder}).
// Typed Partial: a typo or an extra key is a compile error, a key not written yet shows in English. See docs/I18N.md.
export const shop: Partial<Part<'shop'>> = {};
