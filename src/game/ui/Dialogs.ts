import Phaser from 'phaser';
import { Button, type ButtonVariant } from './Button';
import { openModal, type ModalHandle } from './Modal';
import { createPanel } from './Panel';
import type { ScrollView } from './ScrollView';
import { body, heading, CHROME } from './theme';

const INK = '#1c130a';

/** Wood/brass popup frame shared by the dialogs: panel, a tap-swallowing
 *  zone, and a title. Returns the panel's top edge. */
function dialogFrame(scene: Phaser.Scene, modal: ModalHandle, cy: number, w: number, h: number, title: string): number {
  const panel = createPanel(scene, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false });
  const block = scene.add.zone(360, cy, w, h).setInteractive();
  modal.container.add([panel, block]);
  const top = cy - h / 2;
  modal.container.add(heading(scene, 360, top + 48, title, { fontSize: '30px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
  return top;
}

export interface TextPromptOptions {
  title: string;
  initial: string;
  maxLength: number;
  /** Heading above the field (デッキ名 unless told otherwise). */
  label?: string;
  /** Small line under the field, e.g. telling the player OK is enough. */
  hint?: string;
  /** Which on-screen keyboard a phone shows ('email', 'url'...). */
  inputMode?: string;
  /** Text in the empty field. */
  placeholder?: string;
  onSubmit: (text: string) => void;
}

/** Popup with a labelled one-line text field, a live character count, and
 *  キャンセル/OK. The field is a real DOM <input> over the canvas (not drawn
 *  text), so native keyboards and Japanese IME - including the half-typed
 *  composition text - work, even inside a mobile WebView. It's pre-filled and
 *  selected, so pressing OK straight away keeps the suggested text. Needs
 *  `dom.createContainer` in the game config, and style.css pinning that
 *  container to the canvas. */
export function openTextPrompt(scene: Phaser.Scene, scroll: ScrollView, opts: TextPromptOptions): ModalHandle {
  const modal = openModal(scene, scroll, 0.75, false);
  // Sits in the upper half so a phone's keyboard doesn't cover it.
  const cy = 470;
  const w = 600;
  const h = 380;
  const top = dialogFrame(scene, modal, cy, w, h, opts.title);
  const fieldW = 500;
  const fieldH = 66;
  const left = 360 - fieldW / 2;
  const right = 360 + fieldW / 2;

  modal.container.add(body(scene, left + 4, top + 108, opts.label ?? 'デッキ名', { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
  const count = body(scene, right - 4, top + 108, '', { fontSize: '20px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
  modal.container.add(count);
  if (opts.hint) modal.container.add(body(scene, 360, top + 238, opts.hint, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));

  // A light field on the dark popup, so it reads as "type here" at a glance.
  const input = scene.add.dom(
    360,
    top + 174,
    'input',
    `width:${fieldW}px;height:${fieldH}px;box-sizing:border-box;padding:0 20px;font:bold 32px Arial,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;` +
      'color:#2a1608;background:#fff4dc;border:3px solid #c9a052;border-radius:12px;outline:none;caret-color:#7a1717;' +
      'box-shadow:inset 0 3px 8px rgba(0,0,0,0.35),0 0 0 5px rgba(255,220,160,0.22);',
  );
  const field = input.node as HTMLInputElement;
  field.type = 'text';
  field.value = opts.initial;
  field.maxLength = opts.maxLength;
  field.placeholder = opts.placeholder ?? 'ここに入力';
  if (opts.inputMode) field.inputMode = opts.inputMode as HTMLInputElement['inputMode'];
  field.autocomplete = 'off';
  field.spellcheck = false;

  const updateCount = (): void => {
    count.setText(`${Array.from(field.value).length} / ${opts.maxLength}`);
  };
  updateCount();
  field.addEventListener('input', updateCount);

  const close = (): void => {
    input.destroy();
    modal.close();
  };
  const submit = (): void => {
    const text = field.value;
    close();
    opts.onSubmit(text);
  };
  field.addEventListener('keydown', (event) => {
    // Enter while composing Japanese confirms the conversion, not the dialog.
    if (event.key === 'Enter' && !event.isComposing) submit();
    else if (event.key === 'Escape') close();
  });
  // Focus straight away so early keystrokes aren't lost, and once more in real
  // time (not game time, which lags on a slow frame) in case the element
  // wasn't attached yet. Selecting makes retyping a name one step.
  const focusField = (): void => {
    field.focus();
    field.select();
  };
  focusField();
  window.setTimeout(focusField, 60);

  const buttonY = top + h - 56;
  modal.container.add(new Button(scene, 360 - 140, buttonY, 230, 68, 'キャンセル', close, { variant: 'wood', fontSize: '24px' }));
  modal.container.add(new Button(scene, 360 + 140, buttonY, 230, 68, 'OK', submit, { variant: 'gold', fontSize: '30px' }));
  return { container: modal.container, close };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Color of the confirm button; red ('danger') unless it isn't a destructive action. */
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
}

/** Popup asking the player to confirm something destructive. */
export function openConfirm(scene: Phaser.Scene, scroll: ScrollView, opts: ConfirmOptions): ModalHandle {
  const modal = openModal(scene, scroll, 0.75, false);
  const cy = 600;
  const w = 600;
  const text = body(scene, 360, 0, opts.message, { fontSize: '24px', color: '#fff4dc', align: 'center', wordWrap: { width: w - 80 }, stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
  // A long message makes the popup taller instead of running into the buttons.
  const h = Math.max(330, Math.round(text.height) + 240);
  const top = dialogFrame(scene, modal, cy, w, h, opts.title);
  text.setY(top + 96 + (h - 96 - 112) / 2);
  modal.container.add(text);
  const buttonY = top + h - 56;
  modal.container.add(new Button(scene, 360 - 140, buttonY, 230, 68, 'キャンセル', () => modal.close(), { variant: 'wood', fontSize: '24px' }));
  modal.container.add(
    new Button(
      scene,
      360 + 140,
      buttonY,
      230,
      68,
      opts.confirmLabel,
      () => {
        modal.close();
        opts.onConfirm();
      },
      { variant: opts.confirmVariant ?? 'danger', fontSize: '24px' },
    ),
  );
  return modal;
}

export interface MessageFormOptions {
  title: string;
  /** Pick-one tags above the message (お問い合わせの種類, 不具合の種類...). */
  categories: string[];
  categoryLabel: string;
  /** Heading above the text box. */
  label: string;
  placeholder: string;
  maxLength: number;
  /** Small line under the box, e.g. what gets attached automatically. */
  note?: string;
  submitLabel: string;
  onSubmit: (category: string, text: string) => void;
}

/** Popup for writing a message to the operator: a row of category tags, a
 *  multi-line text box with a live character count, キャンセル/送信. Like
 *  openTextPrompt the box is a real DOM element (<textarea>) over the canvas, so
 *  keyboards and Japanese IME work. Sends nothing for an empty message. */
export function openMessageForm(scene: Phaser.Scene, scroll: ScrollView, opts: MessageFormOptions): ModalHandle {
  const modal = openModal(scene, scroll, 0.75, false);
  // Sits high so a phone's keyboard doesn't cover the box.
  const cy = 520;
  const w = 620;
  const h = 860;
  const top = dialogFrame(scene, modal, cy, w, h, opts.title);
  const inner = w - 60;
  const left = 360 - inner / 2;

  // Category tags, three to a row.
  modal.container.add(body(scene, left + 4, top + 108, opts.categoryLabel, { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
  let category = opts.categories[0];
  const tags = scene.add.container(0, 0);
  modal.container.add(tags);
  const perRow = 3;
  const tagW = (inner - 16 * (perRow - 1)) / perRow;
  const drawTags = (): void => {
    tags.removeAll(true);
    opts.categories.forEach((name, i) => {
      const cx = left + (i % perRow) * (tagW + 16) + tagW / 2;
      const cyTag = top + 168 + Math.floor(i / perRow) * 64;
      tags.add(
        new Button(
          scene,
          cx,
          cyTag,
          tagW,
          54,
          name,
          () => {
            category = name;
            // Rebuilt after this tap finishes: it would otherwise destroy the button mid-click.
            scene.time.delayedCall(0, drawTags);
          },
          { variant: name === category ? 'gold' : 'wood', fontSize: '19px' },
        ),
      );
    });
  };
  drawTags();

  const boxTop = top + 168 + Math.ceil(opts.categories.length / perRow) * 64 + 44;
  modal.container.add(body(scene, left + 4, boxTop - 18, opts.label, { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
  const count = body(scene, left + inner - 4, boxTop - 18, '', { fontSize: '20px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
  modal.container.add(count);
  const boxH = 290;
  const area = scene.add.dom(
    360,
    boxTop + boxH / 2,
    'textarea',
    `width:${inner}px;height:${boxH}px;box-sizing:border-box;padding:14px 18px;resize:none;font:24px/1.5 Arial,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;` +
      'color:#2a1608;background:#fff4dc;border:3px solid #c9a052;border-radius:12px;outline:none;caret-color:#7a1717;' +
      'box-shadow:inset 0 3px 8px rgba(0,0,0,0.35),0 0 0 5px rgba(255,220,160,0.22);',
  );
  const field = area.node as HTMLTextAreaElement;
  field.maxLength = opts.maxLength;
  field.placeholder = opts.placeholder;
  field.spellcheck = false;

  const hint = body(scene, 360, boxTop + boxH + 34, '', { fontSize: '19px', color: '#ff9a8a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
  modal.container.add(hint);
  if (opts.note) modal.container.add(body(scene, 360, boxTop + boxH + 72, opts.note, { fontSize: '17px', color: '#d8c49a', stroke: INK, strokeThickness: 3, align: 'center', wordWrap: { width: inner } }).setOrigin(0.5, 0));

  const updateCount = (): void => {
    count.setText(`${Array.from(field.value).length} / ${opts.maxLength}`);
    if (field.value.trim()) hint.setText('');
  };
  updateCount();
  field.addEventListener('input', updateCount);

  const close = (): void => {
    area.destroy();
    modal.close();
  };
  const submit = (): void => {
    const text = field.value.trim();
    if (!text) {
      hint.setText('内容を入力してください');
      field.focus();
      return;
    }
    close();
    opts.onSubmit(category, text);
  };
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  const focusField = (): void => field.focus();
  focusField();
  window.setTimeout(focusField, 60);

  const buttonY = top + h - 56;
  modal.container.add(new Button(scene, 360 - 140, buttonY, 230, 68, 'キャンセル', close, { variant: 'wood', fontSize: '24px' }));
  modal.container.add(new Button(scene, 360 + 140, buttonY, 230, 68, opts.submitLabel, submit, { variant: 'gold', fontSize: '28px' }));
  return { container: modal.container, close };
}
