import Phaser from 'phaser';
import { hex, type Rarity } from '../types';

/** Shared color palette. Every screen pulls from this instead of inlining
 *  hex literals, so the whole game can be re-tuned from one place. */
export const COLORS = {
  bgDeep: 0x0a0b12,
  panelFill: 0x1b1d29,
  panelFillLight: 0x242740,
  border: 0x3a3d52,
  borderLight: 0x4a4d66,
  accent: 0x8a6fd6,
  accentBright: 0xb79bff,
  gold: 0xffd23f,
  gem: 0x7cd6ff,
  hp: 0x4caf50,
  hpWarn: 0xe0c653,
  hpCrit: 0xe05353,
  heal: 0x7cfc9a,
  danger: 0xff6b6b,
  textPrimary: 0xf0ecff,
  textSecondary: 0x9a93b8,
  textMuted: 0x60627a,
  white: 0xffffff,
  black: 0x000000,
};

/** Soft glow tint used behind rarity-decorated panels/cards, keyed the same
 *  as RARITY_COLORS in types.ts but intentionally separate so UI chrome can
 *  diverge from gameplay rarity colors later without touching game data. */
export const RARITY_GLOW: Record<Rarity, number> = {
  1: 0x9aa0a6,
  2: 0x4caf50,
  3: 0x2196f3,
  4: 0xab47bc,
  5: 0xffb300,
};

const FONT_SANS = 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const FONT_SERIF = 'Georgia, "Hiragino Mincho ProN", "Noto Serif JP", serif';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

const BASE: TextStyle = { fontFamily: FONT_SANS };

/** The game's full typographic hierarchy. Every piece of on-screen text
 *  should come from one of these presets (via the helper functions below)
 *  rather than an ad-hoc fontSize/color pair, so size/weight/spacing stay
 *  consistent across every scene. */
export const TEXT_STYLES = {
  /** Screen-level title, e.g. "ABYRUS", "召喚の間". */
  heading: { ...BASE, fontFamily: FONT_SERIF, fontSize: '32px', color: hex(COLORS.textPrimary), letterSpacing: 2 } as TextStyle,
  /** Secondary title under a heading, e.g. hero name on the detail screen. */
  subheading: { ...BASE, fontFamily: FONT_SERIF, fontSize: '22px', color: hex(COLORS.textPrimary), letterSpacing: 1 } as TextStyle,
  /** Small all-caps-ish section divider label, e.g. "ステージ進行". */
  sectionLabel: { ...BASE, fontSize: '14px', color: hex(COLORS.textSecondary), fontStyle: 'bold', letterSpacing: 2 } as TextStyle,
  /** Normal UI copy. */
  body: { ...BASE, fontSize: '15px', color: hex(COLORS.textPrimary) } as TextStyle,
  /** De-emphasized helper text, hints, flavor lines. */
  caption: { ...BASE, fontSize: '12px', color: hex(COLORS.textMuted) } as TextStyle,
  /** Stat label sitting beside a numeric value (left column of a stat row). */
  statLabel: { ...BASE, fontSize: '15px', color: hex(COLORS.textSecondary) } as TextStyle,
  /** Emphasized numeric readout: currency, stat values, EXP counters. */
  numeric: { ...BASE, fontSize: '19px', color: hex(COLORS.textPrimary), fontStyle: 'bold' } as TextStyle,
  /** Larger numeric emphasis for headline currency figures. */
  numericLarge: {
    ...BASE,
    fontSize: '24px',
    color: hex(COLORS.gold),
    fontStyle: 'bold',
    shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 4, fill: true },
  } as TextStyle,
  /** Floating damage number. */
  damage: {
    ...BASE,
    fontFamily: 'Arial Black, sans-serif',
    fontSize: '26px',
    color: hex(COLORS.white),
    stroke: '#000000',
    strokeThickness: 5,
  } as TextStyle,
  /** Floating crit damage number. */
  damageCrit: {
    ...BASE,
    fontFamily: 'Arial Black, sans-serif',
    fontSize: '26px',
    color: hex(COLORS.gold),
    stroke: '#000000',
    strokeThickness: 6,
  } as TextStyle,
  /** Label drawn on interactive buttons. */
  button: { ...BASE, fontSize: '19px', color: hex(COLORS.textPrimary), fontStyle: 'bold', letterSpacing: 1 } as TextStyle,
  /** Smaller caption drawn under a button label (e.g. its cost). */
  buttonSub: { ...BASE, fontSize: '13px', color: hex(COLORS.accentBright) } as TextStyle,
};

function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: TextStyle,
  opts?: Partial<TextStyle>,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, opts ? { ...style, ...opts } : style);
}

export const heading = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.heading, opts);

export const subheading = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.subheading, opts);

export const sectionLabel = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.sectionLabel, opts);

export const body = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.body, opts);

export const caption = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.caption, opts);

export const statLabel = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.statLabel, opts);

export const numeric = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.numeric, opts);

export const numericLarge = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.numericLarge, opts);

export const buttonLabel = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.button, opts);

export const buttonSubLabel = (scene: Phaser.Scene, x: number, y: number, text: string, opts?: Partial<TextStyle>) =>
  makeText(scene, x, y, text, TEXT_STYLES.buttonSub, opts);
