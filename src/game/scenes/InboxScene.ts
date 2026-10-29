import Phaser from 'phaser';
import type { SaveData } from '../systems/SaveSystem';
import type { ShopFocus } from '../data/shop';
import { ResourceBar } from '../ui/ResourceBar';
import { BottomNavBar, type NavTab } from '../ui/BottomNavBar';
import { BackButton } from '../ui/BackButton';
import { Button, type ButtonVariant } from '../ui/Button';
import type { ScrollView } from '../ui/ScrollView';
import { buildTitlePlate, buildFramedScrollView, CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import type { ModalHandle } from '../ui/Modal';
import { createDivider } from '../ui/Panel';
import { caption, CHROME } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';

export type InboxCard = { container: Phaser.GameObjects.Container; height: number };

export interface ToolbarAction {
  label: string;
  variant: ButtonVariant;
  enabled: boolean;
  onTap: () => void;
}

const CARD_GAP = 12;
const INK = '#1c130a';

/** Shared shell of the three inbox screens (お知らせ / プレゼントBOX /
 *  メールBOX): top bar, title plate, the framed scrolling list, an optional
 *  pinned bar of bulk actions above the list, and the bottom nav. A subclass
 *  says what the cards are; this class owns rebuilding them after every change
 *  (keeping the scroll position) and the plumbing around popups. */
export abstract class InboxScene extends Phaser.Scene {
  protected save!: SaveData;
  protected scroll!: ScrollView;
  protected modal?: ModalHandle;

  private resourceBar!: ResourceBar;
  private toolbar?: Phaser.GameObjects.Container;
  private renderQueued = false;

  protected abstract readonly screenTitle: string;
  /** Shown when there are no cards. May be reassigned per view by a subclass. */
  protected abstract emptyText: string;
  /** The bottom-bar tab this screen belongs to, or null for a screen reached
   *  from Home (which then gets a BackButton instead). */
  protected readonly navTab: NavTab | null = null;
  /** Height of the pinned bulk-action bar; 0 for none. */
  protected readonly toolbarHeight: number = 0;

  /** Cards for the list, top to bottom. */
  protected abstract buildCards(): InboxCard[];
  /** Fill the pinned bar - called again after every change. */
  protected buildToolbar(_toolbar: Phaser.GameObjects.Container): void {}

  init(_data?: unknown): void {
    this.modal = undefined;
    this.renderQueued = false;
    this.toolbar = undefined;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.cameras.main.setBackgroundColor('#10121c');

    this.resourceBar = new ResourceBar(this, 0, 0, 720, { onPlus: (focus) => this.openShop(focus) });
    this.refreshResources();
    enter(this, this.resourceBar, { dy: -20, duration: 280 });

    buildTitlePlate(this, this.screenTitle);
    this.scroll = buildFramedScrollView(this, this.toolbarHeight, this.navTab === null);
    if (this.toolbarHeight > 0) {
      this.toolbar = this.add.container(SCREEN_VIEW.x, SCREEN_VIEW.y);
      const line = createDivider(this, SCREEN_VIEW.x + SCREEN_VIEW.w / 2, SCREEN_VIEW.y + this.toolbarHeight - 2, SCREEN_VIEW.w - 8, CHROME.brass);
      line.setAlpha(0.8);
    }
    this.render(true);
    new BottomNavBar(this, 720, 1280, this.navTab);
    if (this.navTab === null) enter(this, new BackButton(this, () => this.goBack()), { dx: -40, dy: 0, duration: 300, delay: 250 });
  }

  /** Where 戻る goes (a screen without a bottom tab). Home unless a subclass says otherwise. */
  protected goBack(): void {
    this.scene.start('Home');
  }

  /** The top bar's + buttons. The shop itself overrides this to jump within itself. */
  protected openShop(focus: ShopFocus): void {
    this.scene.start('Shop', { focus });
  }

  protected refreshResources(): void {
    this.resourceBar.update(this.save);
  }

  /** Rebuilds the list (and the pinned bar) in place. Called from a tap
   *  handler's own stack it would destroy the very zone that is mid-dispatch,
   *  so taps go through queueRender(). */
  protected render(firstTime = false): void {
    const content = this.scroll.content;
    const scrolled = this.scroll.getScroll();
    this.tweens.killTweensOf(content.list);
    content.removeAll(true);

    const left = (SCREEN_VIEW.w - CARD_WIDTH) / 2;
    const cards = this.buildCards();
    let y = left;
    if (cards.length === 0) {
      content.add(caption(this, SCREEN_VIEW.w / 2, 120, this.emptyText, { fontSize: '24px', color: '#9a8a6a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      y = 240;
    } else {
      for (const card of cards) {
        card.container.setPosition(left, y);
        content.add(card.container);
        y += card.height + CARD_GAP;
      }
      y = y - CARD_GAP + left;
    }
    this.scroll.setContentHeight(y);
    this.scroll.scrollTo(scrolled);
    if (firstTime) enterStagger(this, cards.map((c) => c.container), { dy: 24, duration: 300, delay: 160, stagger: 50 });

    if (this.toolbar) {
      this.toolbar.removeAll(true);
      this.buildToolbar(this.toolbar);
    }
  }

  protected queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    this.time.delayedCall(0, () => {
      this.renderQueued = false;
      this.render();
    });
  }

  /** Lays out the pinned bar: a status line on the left, bulk-action buttons
   *  on the right (rightmost action last). */
  protected layoutToolbar(toolbar: Phaser.GameObjects.Container, info: string, actions: ToolbarAction[]): void {
    const h = this.toolbarHeight;
    toolbar.add(caption(this, 14, h / 2 - 2, info, { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const btnH = 54;
    const gap = 10;
    let right = SCREEN_VIEW.w - 6;
    for (const action of [...actions].reverse()) {
      const btnW = 150;
      const button = new Button(this, right - btnW / 2, h / 2 - 2, btnW, btnH, action.label, action.onTap, { variant: action.variant, fontSize: '22px' });
      button.setEnabled(action.enabled);
      toolbar.add(button);
      right -= btnW + gap;
    }
  }
}
