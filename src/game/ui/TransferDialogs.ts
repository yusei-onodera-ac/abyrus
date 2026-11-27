import Phaser from 'phaser';
import { TRANSFER_TEXT } from '../data/transferText';
import { isAllianceConfigured } from '../systems/firebaseConfig';
import type { SaveData } from '../systems/SaveSystem';
import { getTransferTransport } from '../systems/TransferStore';
import { TransferSystem, formatWhen, isFreshSave, passwordMessage } from '../systems/TransferSystem';
import { formatCode } from '../systems/TransferCrypto';
import { Button } from './Button';
import { wrapToWidth, wrappedText } from './CardParts';
import { addDomField, focusField } from './DomField';
import { openConfirm } from './Dialogs';
import { openModal, type ModalHandle, type ModalLock } from './Modal';
import { createPanel } from './Panel';
import { copyText } from './share';
import { body, heading, CHROME } from './theme';
import { showToast } from './Toast';

import { fontFamily } from '../i18n';
/**
 * データ引き継ぎの画面 (設定 > データ引き継ぎ と、チュートリアルの 名前 step から開く)。
 *   openIssueFlow   パスワードを決める -> 暗号化して預ける -> コードを見せる (確認)
 *   openRestoreFlow コードとパスワードを入れる -> 受け取って開く -> (遊んだあとの端末では) 確認 -> 置きかえる -> 完了 (確認)
 * ことばは、data/transferText.ts。通信と暗号は、systems/TransferSystem.ts。
 */

const INK = '#1c130a';
const W = 640;
const INNER = W - 60;
const LEFT = 360 - INNER / 2;
const WARN = '#ffb07a';
const ERROR = '#ff8a8a';
const WORKING = '#ffd23f';
const TEXT = '#fff4dc';
const SUB = '#d8c49a';

type Kind = 'error' | 'working' | 'info';
const KIND_COLOR: Record<Kind, string> = { error: ERROR, working: WORKING, info: SUB };

function frame(scene: Phaser.Scene, lock: ModalLock, top: number, h: number, title: string): { modal: ModalHandle; top: number } {
  const modal = openModal(scene, lock, 0.8, false);
  const cy = top + h / 2;
  modal.container.add([
    createPanel(scene, 360, cy, W, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 18, rarity: 5, gradient: false }),
    scene.add.zone(360, cy, W, h).setInteractive(),
    heading(scene, 360, top + 50, title, { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5),
  ]);
  return { modal, top };
}

/** A paragraph in the dialog; returns the y just below it. */
function paragraph(scene: Phaser.Scene, modal: ModalHandle, y: number, text: string, opts: { size?: number; color?: string; center?: boolean; bold?: boolean } = {}): number {
  const size = opts.size ?? 22;
  const t = wrappedText(scene, opts.center ? 360 : LEFT, y, text, INNER, { fontSize: `${size}px`, fontStyle: opts.bold ? 'bold' : 'normal', color: opts.color ?? TEXT, lineSpacing: 6, stroke: INK, strokeThickness: 3, align: opts.center ? 'center' : 'left' });
  if (opts.center) t.setOrigin(0.5, 0);
  modal.container.add(t);
  return y + t.height;
}

function label(scene: Phaser.Scene, modal: ModalHandle, y: number, text: string): void {
  modal.container.add(body(scene, LEFT + 4, y, text, { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
}

interface Status {
  show(text: string, kind: Kind): void;
}

/** A line (two at most) of feedback at a fixed place, so the buttons below do not jump about. */
function statusLine(scene: Phaser.Scene, modal: ModalHandle, y: number): Status {
  const t = scene.add.text(360, y, '', { fontFamily: fontFamily('sans'), fontSize: '21px', fontStyle: 'bold', color: ERROR, stroke: INK, strokeThickness: 3, align: 'center', lineSpacing: 5 }).setOrigin(0.5, 0);
  modal.container.add(t);
  return {
    show: (text, kind) => {
      t.setText(wrapToWidth(text, INNER, 21, 3, 'bold'));
      t.setColor(KIND_COLOR[kind]);
    },
  };
}

/** The 表示 / 隠す switch that shows what is typed in password fields. */
function addRevealButton(scene: Phaser.Scene, modal: ModalHandle, y: number, fields: HTMLInputElement[]): void {
  let shown = false;
  const holder = scene.add.container(0, 0);
  modal.container.add(holder);
  const draw = (): void => {
    holder.removeAll(true);
    holder.add(
      new Button(
        scene,
        LEFT + INNER - 60,
        y,
        120,
        46,
        shown ? TRANSFER_TEXT.issue.hide : TRANSFER_TEXT.issue.show,
        () => {
          shown = !shown;
          for (const f of fields) f.type = shown ? 'text' : 'password';
          // Rebuilt after this tap finishes: it would otherwise destroy the button mid-click.
          scene.time.delayedCall(0, draw);
        },
        { variant: 'wood', fontSize: '20px' },
      ),
    );
  };
  draw();
}

/** A popup with a message and a 確認 button (what is shown when something has been received, or could not be). */
function openNotice(scene: Phaser.Scene, lock: ModalLock, title: string, lines: { text: string; color?: string; bold?: boolean }[], onClose?: () => void): ModalHandle {
  const measure = lines.map((l) => wrappedText(scene, 0, 0, l.text, INNER, { fontSize: '23px', fontStyle: l.bold ? 'bold' : 'normal', lineSpacing: 6 }));
  const textH = measure.reduce((sum, t) => sum + t.height + 18, 0);
  measure.forEach((t) => t.destroy());
  const h = 100 + textH + 40 + 96;
  const top = 640 - h / 2;
  const { modal } = frame(scene, lock, top, h, title);
  let y = top + 100;
  for (const l of lines) y = paragraph(scene, modal, y, l.text, { size: 23, color: l.color, bold: l.bold, center: true }) + 18;
  modal.container.add(
    new Button(
      scene,
      360,
      top + h - 56,
      260,
      70,
      TRANSFER_TEXT.restore.ok,
      () => {
        modal.close();
        onClose?.();
      },
      { variant: 'gold', fontSize: '30px' },
    ),
  );
  return modal;
}

// ---------------------------------------------------------------------------------------------- 発行

/** 設定の「発行」: パスワードを決めて、いまのセーブを預け、コードを見せる。`onClosed` は、コードの画面を閉じたとき。 */
export function openIssueFlow(scene: Phaser.Scene, lock: ModalLock, save: SaveData, onClosed?: () => void): void {
  const transport = getTransferTransport();
  const T = TRANSFER_TEXT.issue;
  if (!transport) {
    showToast(scene, TRANSFER_TEXT.errors.notConfigured, '#ff8a8a');
    return;
  }
  const inAlliance = save.alliance.allianceId !== null;
  // Sits high, so a phone's keyboard does not cover the fields.
  const top = 56;
  const h = inAlliance ? 880 : 740;
  const { modal } = frame(scene, lock, top, h, T.title);
  let closed = false;
  let busy = false;
  const dom: Phaser.GameObjects.DOMElement[] = [];
  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const d of dom) d.destroy();
    modal.close();
  };

  let y = paragraph(scene, modal, top + 98, T.intro) + 30;
  const firstLabelY = y;
  label(scene, modal, y, T.passwordLabel);
  y += 44;
  const pw = addDomField(scene, 360, y + 33, INNER, 66, { maxLength: 64, type: 'password', placeholder: T.passwordPlaceholder });
  dom.push(pw.dom);
  y += 66 + 46;
  label(scene, modal, y, T.confirmLabel);
  y += 44;
  const pw2 = addDomField(scene, 360, y + 33, INNER, 66, { maxLength: 64, type: 'password', placeholder: T.confirmPlaceholder });
  dom.push(pw2.dom);
  addRevealButton(scene, modal, firstLabelY, [pw.field, pw2.field]);
  y += 66 + 14;
  const status = statusLine(scene, modal, y);
  y += 62;
  y = paragraph(scene, modal, y, T.warn, { size: 20, color: WARN }) + 12;
  if (inAlliance) y = paragraph(scene, modal, y, T.allianceWarn, { size: 20, color: WARN }) + 12;

  const buttonY = top + h - 56;
  const cancel = new Button(scene, 360 - 140, buttonY, 250, 72, T.cancel, close, { variant: 'wood', fontSize: '26px' });
  const submitButton = new Button(scene, 360 + 140, buttonY, 250, 72, T.submit, () => void submit(), { variant: 'gold', fontSize: '28px' });
  modal.container.add([cancel, submitButton]);

  const setBusy = (on: boolean): void => {
    busy = on;
    pw.field.disabled = on;
    pw2.field.disabled = on;
    cancel.setEnabled(!on);
    submitButton.setEnabled(!on);
  };

  async function submit(): Promise<void> {
    if (busy || closed) return;
    const bad = passwordMessage(pw.field.value);
    if (bad) {
      status.show(bad, 'error');
      pw.field.focus();
      return;
    }
    if (pw.field.value !== pw2.field.value) {
      status.show(TRANSFER_TEXT.errors.passwordMismatch, 'error');
      pw2.field.focus();
      return;
    }
    setBusy(true);
    status.show(T.working, 'working');
    const result = await TransferSystem.issue(save, pw.field.value, transport);
    if (closed) return;
    setBusy(false);
    if (!result.ok) {
      status.show(result.message, 'error');
      return;
    }
    close();
    openIssued(scene, lock, result.code, result.issuedAt, result.replaced, onClosed);
  }

  for (const f of [pw.field, pw2.field]) {
    f.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) void submit();
      else if (event.key === 'Escape' && !busy) close();
    });
  }
  focusField(pw.field);
}

/** The code, big, with the warnings; shown once it has been issued (and again from 設定 > コード, where `replaced` is null: nothing is said about the old code). */
export function openIssued(scene: Phaser.Scene, lock: ModalLock, code: string, issuedAt: number, replaced: boolean | null, onClosed?: () => void): ModalHandle {
  const T = TRANSFER_TEXT.issue;
  const h = 760;
  const top = 640 - h / 2;
  const { modal } = frame(scene, lock, top, h, T.resultTitle);
  let y = top + 104;
  label(scene, modal, y, T.codeLabel);
  y += 28;
  const boxH = 104;
  modal.container.add(createPanel(scene, 360, y + boxH / 2, INNER, boxH, { fillColor: CHROME.woodGrain, fillAlpha: 1, borderColor: CHROME.brassBright, glowColor: CHROME.brassBright, radius: 14, gradient: false }));
  modal.container.add(
    scene.add
      .text(360, y + boxH / 2, formatCode(code), { fontFamily: '"Courier New", Menlo, Consolas, monospace', fontSize: '38px', fontStyle: 'bold', color: '#fff0cc', stroke: INK, strokeThickness: 4 })
      .setOrigin(0.5),
  );
  y += boxH + 22;
  modal.container.add(
    new Button(
      scene,
      360,
      y + 34,
      300,
      68,
      T.copy,
      () => {
        void copyText(formatCode(code)).then((ok) => {
          if (!modal.container.active) return;
          showToast(scene, ok ? T.copied : T.copyFailed, ok ? '#f0ecff' : '#ff8a8a');
        });
      },
      { variant: 'wood', fontSize: '26px' },
    ),
  );
  y += 68 + 30;
  y = paragraph(scene, modal, y, T.issuedAt(formatWhen(issuedAt)), { size: 22, color: SUB, center: true }) + 22;
  y = paragraph(scene, modal, y, T.secret, { size: 24, color: WARN, bold: true }) + 16;
  y = paragraph(scene, modal, y, T.onlyThisData, { size: 20, color: TEXT }) + 14;
  if (replaced !== null) paragraph(scene, modal, y, replaced ? T.replaced : T.notReplaced, { size: 19, color: SUB });
  modal.container.add(
    new Button(
      scene,
      360,
      top + h - 56,
      260,
      70,
      T.ok,
      () => {
        modal.close();
        onClosed?.();
      },
      { variant: 'gold', fontSize: '30px' },
    ),
  );
  return modal;
}

// ---------------------------------------------------------------------------------------------- 引き継ぎ

export interface RestoreOptions {
  /** The save on this device now: replaced when the restore goes through (after asking, if it has been played). */
  local: SaveData;
  /** The restored save counts as having been through the チュートリアル (the 名前 step's 引き継ぎ). */
  finishTutorial: boolean;
  /** Closed without restoring anything. */
  onCancel?: () => void;
  /** After the 確認 of the 完了 popup: the new save, already stored in the browser. The caller puts it in the game's registry and shows it. */
  onDone: (save: SaveData) => void;
}

/** コードとパスワードで、預けたセーブを受け取る。どこで失敗しても、この端末のセーブは、そのまま。 */
export function openRestoreFlow(scene: Phaser.Scene, lock: ModalLock, opts: RestoreOptions): void {
  const transport = getTransferTransport();
  const T = TRANSFER_TEXT.restore;
  if (!transport) {
    showToast(scene, TRANSFER_TEXT.errors.notConfigured, '#ff8a8a');
    opts.onCancel?.();
    return;
  }
  const top = 90;
  const h = 690;
  const { modal } = frame(scene, lock, top, h, T.title);
  let closed = false;
  let busy = false;
  const dom: Phaser.GameObjects.DOMElement[] = [];
  const close = (): void => {
    if (closed) return;
    closed = true;
    for (const d of dom) d.destroy();
    modal.close();
  };

  let y = paragraph(scene, modal, top + 98, T.intro) + 28;
  label(scene, modal, y, T.codeLabel);
  y += 44;
  const code = addDomField(scene, 360, y + 33, INNER, 66, { maxLength: 40, placeholder: T.codePlaceholder, inputMode: 'text', fontSize: 28 });
  dom.push(code.dom);
  y += 66 + 46;
  label(scene, modal, y, T.passwordLabel);
  y += 44;
  const pw = addDomField(scene, 360, y + 33, INNER, 66, { maxLength: 64, type: 'password', placeholder: T.passwordPlaceholder });
  dom.push(pw.dom);
  addRevealButton(scene, modal, y - 44, [pw.field]);
  y += 66 + 14;
  const status = statusLine(scene, modal, y);

  const buttonY = top + h - 56;
  const cancel = new Button(
    scene,
    360 - 140,
    buttonY,
    250,
    72,
    T.cancel,
    () => {
      close();
      opts.onCancel?.();
    },
    { variant: 'wood', fontSize: '26px' },
  );
  const submitButton = new Button(scene, 360 + 140, buttonY, 250, 72, T.submit, () => void submit(), { variant: 'gold', fontSize: '28px' });
  modal.container.add([cancel, submitButton]);

  const setBusy = (on: boolean): void => {
    busy = on;
    code.field.disabled = on;
    pw.field.disabled = on;
    cancel.setEnabled(!on);
    submitButton.setEnabled(!on);
  };

  async function submit(): Promise<void> {
    if (busy || closed) return;
    setBusy(true);
    status.show(T.working, 'working');
    const result = await TransferSystem.open(code.field.value, pw.field.value, transport);
    if (closed) return;
    setBusy(false);
    if (!result.ok) {
      status.show(result.message, 'error');
      (result.reason === 'bad_code' || result.reason === 'not_found' ? code : pw).field.focus();
      return;
    }
    const incoming = result.save;
    const savedAt = result.savedAt;
    close();
    // A device that has been played on is asked first - with a look at what is coming in; a brand-new one has nothing to lose.
    if (isFreshSave(opts.local)) {
      apply(incoming);
      return;
    }
    openConfirm(scene, lock, {
      title: T.confirmTitle,
      message: T.confirmBody(incoming.playerName, incoming.playerLevel, incoming.stageProgress, formatWhen(savedAt)),
      confirmLabel: T.confirmButton,
      onConfirm: () => scene.time.delayedCall(0, () => apply(incoming)),
    });
  }

  /** Puts the received save in place of this device's: its identity set to this device's, stored, then the 完了 popup. */
  function apply(incoming: SaveData): void {
    const rejoin = isAllianceConfigured() && incoming.alliance.allianceId !== null;
    const stored = TransferSystem.apply(opts.local, incoming, { online: isAllianceConfigured(), finishTutorial: opts.finishTutorial });
    if (!stored.ok) {
      openNotice(scene, lock, T.title, [{ text: stored.message, color: ERROR, bold: true }], opts.onCancel);
      return;
    }
    const lines: { text: string; color?: string; bold?: boolean }[] = [
      { text: T.doneBody(stored.save.playerName, stored.save.playerLevel), bold: true },
      { text: T.doneNote, color: SUB },
    ];
    if (rejoin) lines.push({ text: T.doneAlliance, color: WARN, bold: true });
    openNotice(scene, lock, T.doneTitle, lines, () => opts.onDone(stored.save));
  }

  for (const f of [code.field, pw.field]) {
    f.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) void submit();
      else if (event.key === 'Escape' && !busy) {
        close();
        opts.onCancel?.();
      }
    });
  }
  focusField(code.field);
}
