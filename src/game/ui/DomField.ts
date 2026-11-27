import Phaser from 'phaser';
import { fontFamily } from '../i18n';

export interface DomFieldOptions {
  maxLength: number;
  placeholder?: string;
  /** 'password' hides what is typed (the 引き継ぎ screens). */
  type?: 'text' | 'password';
  /** Which on-screen keyboard a phone shows. */
  inputMode?: string;
  /** px (default 30). */
  fontSize?: number;
}

/** A one-line text field laid over the canvas, in the same light-on-dark look as Dialogs.openTextPrompt (a real DOM <input>,
 *  so native keyboards and Japanese IME work). Centred at (x, y). The caller destroys it with the screen it belongs to
 *  (DOM elements are not part of any container). Needs `dom.createContainer` in the game config, like openTextPrompt. */
export function addDomField(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: DomFieldOptions): { dom: Phaser.GameObjects.DOMElement; field: HTMLInputElement } {
  const size = opts.fontSize ?? 30;
  const dom = scene.add.dom(
    x,
    y,
    'input',
    `width:${w}px;height:${h}px;box-sizing:border-box;padding:0 20px;font:bold ${size}px ${fontFamily('sans')};` +
      'color:#2a1608;background:#fff4dc;border:3px solid #c9a052;border-radius:12px;outline:none;caret-color:#7a1717;' +
      'box-shadow:inset 0 3px 8px rgba(0,0,0,0.35),0 0 0 5px rgba(255,220,160,0.22);',
  );
  const field = dom.node as HTMLInputElement;
  field.type = opts.type ?? 'text';
  field.maxLength = opts.maxLength;
  field.placeholder = opts.placeholder ?? '';
  if (opts.inputMode) field.inputMode = opts.inputMode as HTMLInputElement['inputMode'];
  // (not 'new-password': a phone would offer to make up a password, which nobody would be able to type into the other device)
  field.autocomplete = 'off';
  field.autocapitalize = 'off';
  field.spellcheck = false;
  return { dom, field };
}

/** Puts the cursor in `field` (once now, once a moment later in case it was not attached yet) - but not on a phone, where that
 *  would pop the keyboard up over the screen before the player has read it. */
export function focusField(field: HTMLInputElement): void {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return;
  field.focus();
  window.setTimeout(() => field.focus(), 60);
}
