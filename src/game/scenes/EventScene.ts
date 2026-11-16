import Phaser from 'phaser';
import { getVisibleEvents, type EventEntry } from '../data/events';
import type { SaveData } from '../systems/SaveSystem';
import { applyBackground } from '../ui/Background';
import { BottomNavBar } from '../ui/BottomNavBar';
import { buildEventCard } from '../ui/EventPanels';
import { ResourceBar } from '../ui/ResourceBar';
import { buildFramedScrollView, buildTitlePlate, CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import type { ScrollView } from '../ui/ScrollView';
import { caption } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';

const LIST_GAP = 14;

/** イベント tab: every event that is running or announced (data/events.ts), as
 *  a scrolling list of cards. Any number can be on at once; each card opens its
 *  own screen. Top/bottom bars are the shared HUD pieces; this scene only owns
 *  what's between them. */
export class EventScene extends Phaser.Scene {
  private scroll!: ScrollView;

  constructor() {
    super('Event');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'event');

    const save: SaveData = this.game.registry.get('save');
    const resourceBar = new ResourceBar(this, 0, 0, 720);
    resourceBar.update(save);
    enter(this, resourceBar, { dy: -20, duration: 280 });

    buildTitlePlate(this, 'イベント');
    this.buildList();
    new BottomNavBar(this, 720, 1280, 'event');
  }

  private buildList(): void {
    // A tab screen: no 戻る button, so nothing to scroll clear of.
    this.scroll = buildFramedScrollView(this, 0, false);
    const guard = () => this.scroll.isTap();
    const left = (SCREEN_VIEW.w - CARD_WIDTH) / 2;
    const rows: Phaser.GameObjects.Container[] = [];
    let y = left;

    const events = getVisibleEvents();
    for (const { entry, phase } of events) {
      const card = buildEventCard(this, entry, phase, { onOpen: () => this.open(entry), guard });
      card.container.setPosition(left, y);
      rows.push(card.container);
      y += card.height + LIST_GAP;
    }

    if (events.length === 0) {
      this.scroll.content.add(caption(this, SCREEN_VIEW.w / 2, y + 60, '開催中のイベントはありません', { fontSize: '20px', color: '#9a8a6a' }).setOrigin(0.5));
      y += 120;
    }

    this.scroll.content.add(rows);
    this.scroll.setContentHeight(y - LIST_GAP + left);
    enterStagger(this, rows, { dy: 24, duration: 320, delay: 160, stagger: 70 });
  }

  private open(entry: EventEntry): void {
    if (entry.kind === 'infinite') this.scene.start('InfiniteMode');
    else if (entry.kind === 'premium') this.scene.start('Premium');
  }
}
