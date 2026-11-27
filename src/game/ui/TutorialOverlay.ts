import Phaser from 'phaser';
import { tutorialGuideName, type TutorialRect, type TutorialStep } from '../data/tutorial';
import { TRANSFER_TEXT } from '../data/transferText';
import { stripForbidden } from '../systems/ChatSystem';
import type { SaveData } from '../systems/SaveSystem';
import { PLAYER_NAME_MAX, cleanPlayerName } from '../systems/SettingsSystem';
import { isTransferAvailable } from '../systems/TransferStore';
import { VoiceSystem } from '../systems/VoiceSystem';
import { Button } from './Button';
import { wrapToWidth, textWrap } from './CardParts';
import { addDomField, focusField } from './DomField';
import { createPanel } from './Panel';
import { addPetFace } from './PetPortrait';
import { body, caption, subheading, CHROME } from './theme';
import { t as tl } from '../i18n';

const INK = '#1c130a';
const DEPTH = 300;
const DIM = 0.74;
const PANEL_W = 690;
const TEXT_X_OFFSET = 150;
const TEXT_W = PANEL_W - TEXT_X_OFFSET - 26;
const TEXT_SIZE = 25;
const MS_PER_CHAR = 30;
const HOLE_PAD = 8;

export interface TutorialHandlers {
  /** The step is done: the player tapped to go on, or pressed the highlighted spot. */
  onAdvance: () => void;
  onSkip: () => void;
  /** The 名前 step: the player gave this name (already cleaned, never empty). */
  onName: (name: string) => void;
  /** The 名前 step: the player chose データを引き継ぐ instead (whoever handles this destroys the overlay). */
  onTransfer: () => void;
}

/** One チュートリアル step on screen: the screen dimmed (with the target lit and, for a
 *  'target' step, left open so pressing it works), the pet's speech bubble with the
 *  text typed out, her voice, and a スキップ button. Everything sits at depth 300, above
 *  the popups of the scene it is on. The 名前 step (advance 'name') is its own layout: her bubble at the top and,
 *  under it, a card to type the name in with 決定, and データを引き継ぐ for someone who has played before; no スキップ. */
export class TutorialOverlay {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private fullText = '';
  private shown = 0;
  private bodyText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private skipArmed = false;
  private done = false;
  private readonly hole?: TutorialRect;
  /** Where the speech bubble is (set when it is built): the スキップ button keeps clear of it and of the lit spot. */
  private bubbleRect: TutorialRect = { x: 0, y: 0, w: 0, h: 0 };
  private pointerListener?: (pointer: Phaser.Input.Pointer) => void;
  /** The 名前 step's text field (a DOM element over the canvas: destroyed with the overlay). */
  private nameDom?: Phaser.GameObjects.DOMElement;

  private readonly scene: Phaser.Scene;
  private readonly step: TutorialStep;
  private readonly handlers: TutorialHandlers;

  constructor(scene: Phaser.Scene, step: TutorialStep, save: SaveData, handlers: TutorialHandlers) {
    this.scene = scene;
    this.step = step;
    this.handlers = handlers;
    if (step.advance === 'name') {
      this.buildNameStep();
      VoiceSystem.play(save, step.id);
      return;
    }
    this.hole = step.target ? { x: step.target.x - HOLE_PAD, y: step.target.y - HOLE_PAD, w: step.target.w + HOLE_PAD * 2, h: step.target.h + HOLE_PAD * 2 } : undefined;
    this.buildDim();
    if (this.hole) this.buildRing(this.hole);
    this.buildBubble();
    this.buildSkip();
    VoiceSystem.play(save, step.id);
  }

  destroy(): void {
    if (this.done) return;
    this.done = true;
    VoiceSystem.stop();
    this.nameDom?.destroy();
    for (const t of this.timers) t.remove();
    if (this.pointerListener) this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerListener);
    for (const o of this.objects) if (o.active) o.destroy();
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH);
    return o;
  }

  // --- the dim layer ---------------------------------------------------------------

  private rect(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle | null {
    if (w <= 0 || h <= 0) return null;
    return this.add(this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, DIM));
  }

  /** Darkens everything except the target. A 'tap' step swallows every tap (target
   *  included); a 'target' step only swallows the dark parts, so the lit spot is a real,
   *  working button - and pressing it moves the tutorial on. */
  private buildDim(): void {
    const hole = this.hole;
    const target = this.step.advance === 'target';
    if (!hole) {
      const full = this.rect(0, 0, 720, 1280);
      full?.setInteractive();
      if (!target) full?.on('pointerup', () => this.tap());
      return;
    }
    const pieces = [
      this.rect(0, 0, 720, hole.y),
      this.rect(0, hole.y + hole.h, 720, 1280 - (hole.y + hole.h)),
      this.rect(0, hole.y, hole.x, hole.h),
      this.rect(hole.x + hole.w, hole.y, 720 - (hole.x + hole.w), hole.h),
    ];
    for (const piece of pieces) {
      if (!piece) continue;
      piece.setInteractive();
      if (!target) piece.on('pointerup', () => this.tap());
    }
    if (!target) {
      // The lit spot itself is covered too, so it can't be pressed by accident.
      const cover = this.add(this.scene.add.zone(hole.x + hole.w / 2, hole.y + hole.h / 2, hole.w, hole.h));
      (cover as Phaser.GameObjects.Zone).setInteractive();
      cover.on('pointerup', () => this.tap());
      return;
    }
    // Pressing the lit spot finishes the step; the button under it still gets the press.
    this.pointerListener = (pointer: Phaser.Input.Pointer) => {
      if (pointer.x >= hole.x && pointer.x <= hole.x + hole.w && pointer.y >= hole.y && pointer.y <= hole.y + hole.h) {
        // Right now, not on a timer: the press that follows switches screens, which would drop a timer.
        this.finishStep();
      }
    };
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerListener);
  }

  private buildRing(hole: TutorialRect): void {
    const g = this.add(this.scene.add.graphics()) as Phaser.GameObjects.Graphics;
    g.lineStyle(5, CHROME.brassBright, 1);
    g.strokeRoundedRect(hole.x, hole.y, hole.w, hole.h, 22);
    g.lineStyle(10, CHROME.brassBright, 0.25);
    g.strokeRoundedRect(hole.x - 4, hole.y - 4, hole.w + 8, hole.h + 8, 26);
    this.scene.tweens.add({ targets: g, alpha: { from: 1, to: 0.35 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // A bobbing arrow on the side away from the bubble, pointing at it.
    if (this.step.advance !== 'target') return;
    const cx = hole.x + hole.w / 2;
    const below = this.bubbleAtTop();
    const arrow = this.add(this.scene.add.graphics()) as Phaser.GameObjects.Graphics;
    const dir = below ? 1 : -1;
    const y = below ? hole.y + hole.h + 12 : hole.y - 12;
    arrow.fillStyle(CHROME.brassBright, 1);
    arrow.lineStyle(3, 0x2a1a0c, 1);
    arrow.fillTriangle(cx - 16, y + dir * 26, cx + 16, y + dir * 26, cx, y);
    arrow.strokeTriangle(cx - 16, y + dir * 26, cx + 16, y + dir * 26, cx, y);
    this.scene.tweens.add({ targets: arrow, y: dir * 10, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // --- the pet's speech bubble -------------------------------------------------------

  /** The bubble goes on the half of the screen the lit spot is not in. */
  private bubbleAtTop(): boolean {
    if (this.step.advance === 'name') return true;
    const t = this.step.target;
    return !!t && t.y + t.h / 2 > 640;
  }

  private buildBubble(): void {
    const lines = this.step.lines.map((line) => wrapToWidth(line, TEXT_W, TEXT_SIZE, 4, 'bold'));
    this.fullText = lines.join('\n\n');
    const probe = body(this.scene, 0, 0, this.fullText, { fontSize: `${TEXT_SIZE}px`, fontStyle: 'bold', lineSpacing: 10 }).setVisible(false);
    const textH = probe.height;
    probe.destroy();

    const h = Math.max(220, 52 + textH + 56);
    const cy = this.bubbleAtTop() ? 150 + h / 2 : 1090 - h / 2;
    const left = 360 - PANEL_W / 2;
    const top = cy - h / 2;
    this.bubbleRect = { x: left, y: top, w: PANEL_W, h };

    this.add(createPanel(this.scene, 360, cy, PANEL_W, h, { fillColor: CHROME.woodFill, fillAlpha: 0.98, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 18, rarity: 4, gradient: false }));
    this.add(addPetFace(this.scene, left + 76, top + 96, 112, this.step.mood));
    const plate = this.add(createPanel(this.scene, left + 76, top + 168, 110, 38, { fillColor: CHROME.woodGrain, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 10, gradient: false }));
    void plate;
    this.add(subheading(this.scene, left + 76, top + 168, tutorialGuideName(), { fontSize: '22px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));

    this.bodyText = this.add(body(this.scene, left + TEXT_X_OFFSET, top + 26, '', { fontSize: `${TEXT_SIZE}px`, fontStyle: 'bold', color: '#fff0cc', stroke: INK, strokeThickness: 4, lineSpacing: 10 }));
    const tapStep = this.step.advance === 'tap';
    this.hint = this.add(
      this.step.advance === 'name'
        ? caption(this.scene, left + PANEL_W - 34, top + h - 30, '', { fontSize: '26px' })
        : tapStep
        ? caption(this.scene, left + PANEL_W - 34, top + h - 30, '▼', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0.5)
        : caption(this.scene, left + TEXT_X_OFFSET, top + h - 28, tl('tutorial.overlay.tapGlow'), { fontSize: '19px', color: '#ffd23f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5),
    ) as Phaser.GameObjects.Text;
    this.hint.setVisible(false);
    this.scene.tweens.add({ targets: this.hint, y: this.hint.y + 5, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Typed out a character at a time; tapping the bubble shows the rest.
    const bubbleHit = this.add(this.scene.add.zone(360, cy, PANEL_W, h));
    (bubbleHit as Phaser.GameObjects.Zone).setInteractive();
    bubbleHit.on('pointerup', () => {
      if (this.shown < this.fullText.length) this.reveal(this.fullText.length);
      else if (tapStep) this.finishStep();
    });
    this.timers.push(this.scene.time.addEvent({ delay: MS_PER_CHAR, loop: true, callback: () => this.reveal(this.shown + 1) }));
  }

  private reveal(count: number): void {
    this.shown = Math.min(this.fullText.length, count);
    this.bodyText.setText(this.fullText.slice(0, this.shown));
    if (this.shown >= this.fullText.length) this.hint.setVisible(true);
  }

  // --- the 名前 step -------------------------------------------------------------------

  private buildNameStep(): void {
    const T = TRANSFER_TEXT.nameStep;
    // Nothing here goes on by tapping: the dark layer only keeps the screen underneath from being pressed.
    this.rect(0, 0, 720, 1280)?.setInteractive();
    this.buildBubble();

    const cardW = PANEL_W;
    const cardH = 462;
    const top = this.bubbleRect.y + this.bubbleRect.h + 24;
    const left = 360 - cardW / 2;
    const innerW = cardW - 56;
    this.add(createPanel(this.scene, 360, top + cardH / 2, cardW, cardH, { fillColor: CHROME.woodFill, fillAlpha: 0.98, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 18, rarity: 4, gradient: false }));
    this.add(this.scene.add.zone(360, top + cardH / 2, cardW, cardH).setInteractive());

    this.add(body(this.scene, left + 28, top + 40, T.label, { fontSize: '24px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const count = this.add(body(this.scene, left + cardW - 28, top + 40, '', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));

    const { dom, field } = addDomField(this.scene, 360, top + 108, innerW, 72, { maxLength: PLAYER_NAME_MAX * 2, placeholder: T.placeholder, fontSize: 34 });
    this.nameDom = dom;
    const hint = this.add(
      body(this.scene, 360, top + 176, T.hint(PLAYER_NAME_MAX), { fontSize: '20px', color: '#d8c49a', stroke: INK, strokeThickness: 3, align: 'center', wordWrap: textWrap(innerW) }).setOrigin(0.5, 0),
    );
    const say = (text: string, error: boolean): void => {
      hint.setText(text);
      hint.setColor(error ? '#ff9a8a' : '#d8c49a');
    };

    const refresh = (): void => {
      count.setText(`${Array.from(field.value).length} / ${PLAYER_NAME_MAX}`);
    };
    refresh();
    field.addEventListener('input', (event) => {
      // Emoji and the like are taken out as it is typed (not in the middle of an IME conversion, which would break it).
      if (!(event as InputEvent).isComposing) {
        const cleaned = stripForbidden(field.value);
        if (cleaned !== field.value) {
          field.value = cleaned;
          say(T.stripped, true);
        } else if (cleaned.trim()) {
          say(T.hint(PLAYER_NAME_MAX), false);
        }
      }
      refresh();
    });

    const submit = (): void => {
      if (this.done) return;
      const name = cleanPlayerName(field.value);
      if (!name) {
        say(T.empty, true);
        field.focus();
        return;
      }
      this.handlers.onName(name);
    };
    field.addEventListener('keydown', (event) => {
      // Enter while composing Japanese confirms the conversion, not the name.
      if (event.key === 'Enter' && !event.isComposing) submit();
    });
    this.add(new Button(this.scene, 360, top + 262, 340, 80, T.submit, submit, { variant: 'gold', fontSize: '34px' }));

    const line = this.add(this.scene.add.graphics()) as Phaser.GameObjects.Graphics;
    line.lineStyle(2, CHROME.brassDark, 0.7);
    line.lineBetween(left + 40, top + 328, left + cardW - 40, top + 328);
    this.add(body(this.scene, 360, top + 356, T.restoreCaption, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3, align: 'center', wordWrap: textWrap(innerW) }).setOrigin(0.5, 0.5));
    this.add(
      new Button(
        this.scene,
        360,
        top + 410,
        470,
        68,
        T.restore,
        () => {
          if (this.done) return;
          // Without a server to ask there is nothing to carry over: said here, since a toast would sit under this layer.
          if (!isTransferAvailable()) {
            say(TRANSFER_TEXT.settings.unavailable, true);
            return;
          }
          this.handlers.onTransfer();
        },
        { variant: 'wood', fontSize: '26px' },
      ),
    );
    focusField(field);
  }

  // --- skip ----------------------------------------------------------------------------

  private buildSkip(): void {
    // Opposite the bubble, so they never overlap; at the top it keeps to the left, clear of the fight's controls down the right edge.
    // (If the lit spot is where it would go, it moves to the next place that is free.)
    const atTop = this.bubbleAtTop();
    const candidates: [number, number][] = atTop
      ? [[640, 1214], [360, 1236], [100, 1214]]
      : [[100, 168], [360, 1236], [640, 1214], [360, 168]];
    const clash = (x: number, y: number, r: TutorialRect | undefined): boolean => !!r && x + 80 > r.x && x - 80 < r.x + r.w && y + 30 > r.y && y - 30 < r.y + r.h;
    const [x, y] = candidates.find(([cx, cy]) => !clash(cx, cy, this.hole) && !clash(cx, cy, this.bubbleRect)) ?? candidates[0];
    const label = this.add(body(this.scene, x, y, tl('common.skip'), { fontSize: '22px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 4 }).setOrigin(0.5)) as Phaser.GameObjects.Text;
    const hit = this.add(this.scene.add.zone(x, y, 150, 56));
    (hit as Phaser.GameObjects.Zone).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (!this.skipArmed) {
        this.skipArmed = true;
        label.setText(tl('tutorial.overlay.reallySkip')).setColor('#ff9a8a');
        this.timers.push(
          this.scene.time.delayedCall(2800, () => {
            this.skipArmed = false;
            if (label.active) label.setText(tl('common.skip')).setColor('#d8c49a');
          }),
        );
        return;
      }
      this.handlers.onSkip();
    });
  }

  // --- finishing -------------------------------------------------------------------------

  /** A tap on the dim layer: shows the rest of the line, or - once it is all there - moves on. */
  private tap(): void {
    if (this.shown < this.fullText.length) this.reveal(this.fullText.length);
    else this.finishStep();
  }

  private finishStep(): void {
    if (this.done) return;
    this.handlers.onAdvance();
  }
}
