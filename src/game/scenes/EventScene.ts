import Phaser from 'phaser';
import { getVisibleEvents, type EventEntry } from '../data/events';
import { describeCampaign } from '../data/campaigns';
import { CampaignSystem } from '../systems/CampaignSystem';
import { EventSystem } from '../systems/EventSystem';
import { formatDateTime } from '../ui/format';
import { Button } from '../ui/Button';
import { buildCardPanel } from '../ui/CardParts';
import type { SaveData } from '../systems/SaveSystem';
import { applyBackground } from '../ui/Background';
import { BottomNavBar } from '../ui/BottomNavBar';
import { buildEventCard } from '../ui/EventPanels';
import { ResourceBar } from '../ui/ResourceBar';
import { buildFramedScrollView, buildTitlePlate, CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import type { ScrollView } from '../ui/ScrollView';
import { body, caption, heading } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';
import { t } from '../i18n';

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

    buildTitlePlate(this, t('mission.event.title'));
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

    // The year's plan, one tap away; and the boost campaigns that are on.
    const plan = new Button(this, left + CARD_WIDTH / 2, y + 34, CARD_WIDTH, 68, t('mission.event.viewSchedule'), () => this.scene.start('Schedule'), { variant: 'wood', fontSize: '24px', guard });
    rows.push(this.add.container(0, 0, [plan]));
    y += 68 + LIST_GAP;
    const campaigns = CampaignSystem.active();
    if (campaigns.length > 0) {
      const strip = this.campaignStrip(campaigns);
      strip.container.setPosition(left, y);
      rows.push(strip.container);
      y += strip.height + LIST_GAP;
    }

    const save: SaveData = this.game.registry.get('save');
    const events = getVisibleEvents();
    for (const { entry, phase } of events) {
      const def = entry.kind === 'limited' ? EventSystem.get(entry.id) : undefined;
      const card = buildEventCard(this, entry, phase, { onOpen: () => this.open(entry), guard, claimable: !!def && EventSystem.hasClaimable(save, def) });
      card.container.setPosition(left, y);
      rows.push(card.container);
      y += card.height + LIST_GAP;
    }

    if (events.length === 0) {
      this.scroll.content.add(caption(this, SCREEN_VIEW.w / 2, y + 60, t('mission.event.noEvents'), { fontSize: '20px', color: '#9a8a6a' }).setOrigin(0.5));
      y += 120;
    }

    this.scroll.content.add(rows);
    this.scroll.setContentHeight(y - LIST_GAP + left);
    enterStagger(this, rows, { dy: 24, duration: 320, delay: 160, stagger: 70 });
  }

  /** The boost campaigns that are on, one line each ("ゴールド ×2　12/13 23:59まで"). */
  private campaignStrip(campaigns: ReturnType<typeof CampaignSystem.active>): { container: Phaser.GameObjects.Container; height: number } {
    const rowH = 40;
    const height = 62 + campaigns.length * rowH + 8;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, true));
    container.add(heading(this, 18, 30, t('mission.event.boostCampaigns'), { fontSize: '24px', color: '#9fe39f', stroke: '#1c130a', strokeThickness: 4 }).setOrigin(0, 0.5));
    campaigns.forEach((c, i) => {
      const y = 62 + i * rowH + rowH / 2;
      container.add(body(this, 22, y, describeCampaign(c), { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: '#1c130a', strokeThickness: 4 }).setOrigin(0, 0.5));
      container.add(caption(this, CARD_WIDTH - 18, y, t('mission.event.until', { formatDateTime: formatDateTime(new Date(c.endsAt).getTime()) }), { fontSize: '18px', color: '#cdbb94', stroke: '#1c130a', strokeThickness: 3 }).setOrigin(1, 0.5));
    });
    return { container, height };
  }

  private open(entry: EventEntry): void {
    if (entry.kind === 'infinite') this.scene.start('InfiniteMode');
    else if (entry.kind === 'premium') this.scene.start('Premium');
    else if (entry.kind === 'limited') this.scene.start('EventQuest', { eventId: entry.id });
  }
}
