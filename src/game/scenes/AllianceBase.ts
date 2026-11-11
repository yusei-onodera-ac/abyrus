import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import type { AllianceDetail, Failure, PlayerProfile, Result } from '../alliance/AllianceBackend';
import { buildCardPanel, wrappedText } from '../ui/CardParts';
import type { ModalHandle } from '../ui/Modal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';

export const PAD = 14;
export const INK = '#1c130a';

/**
 * Shared shell of the 同盟 screens: an InboxScene (title, framed scrolling list, back button) that loads the player's
 * alliance through AllianceService and redraws when it arrives or changes. A screen says what its cards are
 * (`cards(detail)`), and, when it must be in an alliance, `needsAlliance` sends a player without one to the search.
 *
 * `detail` is undefined while the first load is under way, null for a player in no alliance.
 */
export abstract class AllianceScene extends InboxScene {
  protected detail: AllianceDetail | null | undefined;
  /** Why the load failed (shown instead of the cards). */
  protected failure?: Failure;
  /** False once the scene is left: a late reply must not touch what is destroyed. */
  protected alive = true;
  private unsubscribe?: () => void;
  private loading = false;

  protected emptyText = '';

  /** Where 戻る goes. */
  protected backTo = 'AllianceHome';
  /** Screens that only make sense in an alliance send the others to 同盟を探す. */
  protected readonly needsAlliance: boolean = true;

  protected get profile(): PlayerProfile {
    return AllianceService.profile(this.save);
  }

  create(): void {
    this.alive = true;
    this.failure = undefined;
    // What was loaded last time is drawn at once; the fresh copy replaces it as soon as it arrives.
    this.detail = AllianceService.cached(this.game.registry.get('save'));
    super.create();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    });
    this.unsubscribe = AllianceService.backend().subscribe(this.profile, () => void this.reload());
    void this.reload();
  }

  protected goBack(): void {
    this.scene.start(this.backTo);
  }

  /** Loads the alliance again and redraws. */
  protected async reload(): Promise<void> {
    if (this.loading || !this.alive) return;
    this.loading = true;
    try {
      const result = await AllianceService.refresh(this.save);
      if (!this.alive) return;
      if (!result.ok) {
        this.failure = result.message ? result : undefined;
        if (this.detail === undefined) this.detail = null;
      } else {
        this.failure = undefined;
        this.detail = result.value;
      }
      if (this.needsAlliance && this.detail === null && !this.failure) {
        this.scene.start('AllianceFind');
        return;
      }
      this.afterLoad();
      this.queueRender();
    } finally {
      this.loading = false;
    }
  }

  /** Called when the alliance has been (re)loaded, before the redraw. */
  protected afterLoad(): void {}

  protected buildCards(): InboxCard[] {
    this.emptyText = '';
    if (this.detail === undefined) return [this.hintCard('読み込み中…')];
    if (this.failure) return [this.hintCard(`読み込めませんでした。\n${this.failure.message}`)];
    return this.cards(this.detail);
  }

  /** The cards of the screen. `detail` is null only for screens that do not need an alliance. */
  protected abstract cards(detail: AllianceDetail | null): InboxCard[];

  // --- card pieces ------------------------------------------------------------

  /** Empty card shell: height known up front, panel behind the content. */
  protected shell(height: number, highlight = false): InboxCard {
    const container = this.add.container(0, 0);
    container.addAt(buildCardPanel(this, CARD_WIDTH, height, highlight), 0);
    return { container, height };
  }

  protected sectionCard(text: string): InboxCard {
    const card = this.shell(54);
    card.container.add(body(this, PAD + 6, 27, text, { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    return card;
  }

  protected hintCard(text: string): InboxCard {
    const t = wrappedText(this, PAD + 6, PAD, text, CARD_WIDTH - PAD * 2 - 12, { fontSize: '20px', color: '#cdbb94', lineSpacing: 6 });
    const card = this.shell(t.height + PAD * 2);
    card.container.add(t);
    return card;
  }

  /** Runs a call to the alliance, showing why it failed; `onOk` runs on success and the screen is loaded again. */
  protected async run<T>(promise: Promise<Result<T>>, onOk?: (value: T) => void | Promise<void>, reloadAfter = true): Promise<void> {
    const result = await promise;
    if (!this.alive) return;
    if (!result.ok) {
      showToast(this, result.message, '#ff8a8a');
      return;
    }
    await onOk?.(result.value);
    if (reloadAfter) await this.reload();
  }

  protected closeModal(): void {
    this.modal?.close();
  }

  protected setModal(handle: ModalHandle): void {
    this.modal?.close();
    this.modal = handle;
  }

  /** A grey caption at the card's left. */
  protected line(card: InboxCard, x: number, y: number, text: string, color = '#d8c49a', size = 19): Phaser.GameObjects.Text {
    const t = caption(this, x, y, text, { fontSize: `${size}px`, color, stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    card.container.add(t);
    return t;
  }
}
