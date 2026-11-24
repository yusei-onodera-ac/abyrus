import Phaser from 'phaser';
import { KIND_NAME, SCHEDULE_NEXT, formatSpan, groupByMonth, itemStatus, monthKeyOf, scheduleItems, type ScheduleItem, type ScheduleKind, type ScheduleMonth, type ScheduleStatus } from '../systems/ScheduleView';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip } from '../ui/CardParts';
import { CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { body, caption, heading } from '../ui/theme';
import { formatDate } from '../ui/format';
import { InboxScene, type InboxCard } from './InboxScene';
import { t, type PlainKey } from '../i18n';

const INK = '#1c130a';
const PAD = 14;
const ROW_H = 92;
const CARD_GAP = 12;

type Filter = 'all' | ScheduleKind;
const FILTERS: { id: Filter; name: PlainKey }[] = [
  { id: 'all', name: 'mission.schedule.all' },
  { id: 'event', name: 'mission.schedule.kindEvent' },
  { id: 'gacha', name: 'mission.schedule.kindGacha' },
  { id: 'campaign', name: 'mission.schedule.kindCampaign' },
];
const KIND_FILL: Record<ScheduleKind, number> = { event: 0x8a5a1c, gacha: 0x6a3aa8, campaign: 0x2f7a3a };
const STATUS_CHIP: Record<ScheduleStatus, { text: PlainKey; fill: number; color: string }> = {
  live: { text: 'mission.phase.live', fill: 0x2f7a3a, color: '#e6ffe0' },
  upcoming: { text: 'mission.phase.upcoming', fill: 0x3a4f7a, color: '#e0ecff' },
  ended: { text: 'mission.phase.ended', fill: 0x4a3a3a, color: '#d8c8c8' },
};

/**
 * 年間予定: the year of 期間限定イベント, ピックアップガチャ and ブーストキャンペーン (data/schedule.ts), month by month, with what is on now marked.
 * Reached from the Event tab. It opens scrolled to this month.
 */
export class ScheduleScene extends InboxScene {
  protected get screenTitle(): string {
    return t('mission.schedule.title');
  }
  protected get emptyText(): string {
    return t('mission.schedule.empty');
  }
  private filter: Filter = 'all';
  /** Where the list was last built the current month's card sits (the screen opens scrolled to it). */
  private focusY = 0;
  private firstBuild = true;

  constructor() {
    super('Schedule');
  }

  init(data?: { filter?: Filter }): void {
    super.init(data);
    this.filter = data?.filter ?? 'all';
    this.firstBuild = true;
  }

  protected goBack(): void {
    this.scene.start('Event');
  }

  create(): void {
    super.create();
    if (this.focusY > 0) this.scroll.scrollTo(this.focusY);
  }

  protected buildCards(): InboxCard[] {
    const now = Date.now();
    const items = scheduleItems().filter((i) => this.filter === 'all' || i.kind === this.filter);
    const months = groupByMonth(items);
    const cards: InboxCard[] = [this.tabsCard(), this.noteCard()];
    const current = monthKeyOf(now);
    // The first month that is this one or later: the screen opens there.
    const focusMonth = months.find((m) => m.key >= current)?.key;
    const left = (SCREEN_VIEW.w - CARD_WIDTH) / 2;
    let y = left;
    for (const card of cards) y += card.height + CARD_GAP;
    this.focusY = 0;
    for (const month of months) {
      const card = this.monthCard(month, now, month.key === current);
      if (this.firstBuild && month.key === focusMonth) this.focusY = Math.max(0, y - left);
      cards.push(card);
      y += card.height + CARD_GAP;
    }
    cards.push(this.nextCard());
    this.firstBuild = false;
    return cards;
  }

  private tabsCard(): InboxCard {
    const guard = () => this.scroll.isTap();
    const height = 96;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    const gap = 8;
    const w = (CARD_WIDTH - PAD * 2 - gap * (FILTERS.length - 1)) / FILTERS.length;
    FILTERS.forEach((f, i) => {
      const x = PAD + w / 2 + i * (w + gap);
      const label = t(f.name);
      container.add(new Button(this, x, height / 2, w, 68, label, () => this.pick(f.id), { variant: f.id === this.filter ? 'gold' : 'wood', fontSize: label.length > 4 ? '19px' : '23px', guard }));
    });
    return { container, height };
  }

  private pick(filter: Filter): void {
    if (filter === this.filter) return;
    this.filter = filter;
    this.scroll.scrollTo(0);
    this.queueRender();
  }

  private noteCard(): InboxCard {
    const height = 62;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(caption(this, PAD + 6, height / 2, t('mission.schedule.mayChange'), { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    return { container, height };
  }

  private monthCard(month: ScheduleMonth, now: number, isCurrent: boolean): InboxCard {
    const height = 62 + month.items.length * ROW_H + 8;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, isCurrent));
    container.add(heading(this, PAD + 6, 32, month.label, { fontSize: '28px', color: isCurrent ? '#ffd23f' : '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    if (isCurrent) {
      const chip = buildChip(this, 0, 32, t('mission.schedule.thisMonth'), { fill: 0xb8472a, color: '#fff0d0', fontSize: 18 });
      chip.container.setX(CARD_WIDTH - PAD - chip.width);
      container.add(chip.container);
    }
    month.items.forEach((item, i) => this.addRow(container, item, 62 + i * ROW_H, itemStatus(item, now)));
    return { container, height };
  }

  private addRow(container: Phaser.GameObjects.Container, item: ScheduleItem, top: number, status: ScheduleStatus): void {
    const w = CARD_WIDTH - PAD * 2;
    const row = this.add.container(PAD, top);
    const bg = this.add.graphics();
    bg.fillStyle(status === 'live' ? 0x2a2112 : 0x150e07, 1);
    bg.fillRoundedRect(0, 2, w, ROW_H - 6, 10);
    bg.lineStyle(status === 'live' ? 2 : 1, status === 'live' ? 0xffd23f : 0x6a5530, 1);
    bg.strokeRoundedRect(0, 2, w, ROW_H - 6, 10);
    bg.fillStyle(item.accent, 1);
    bg.fillRoundedRect(6, 12, 8, ROW_H - 26, 4);
    row.add(bg);

    const status2 = STATUS_CHIP[status];
    const chip = buildChip(this, 0, 24, t(status2.text), { fill: status2.fill, color: status2.color, fontSize: 16 });
    chip.container.setX(w - 10 - chip.width);
    row.add(chip.container);
    const title = body(this, 26, 24, item.title, { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    const maxTitle = w - 26 - chip.width - 24;
    if (title.width > maxTitle) title.setScale(maxTitle / title.width);
    row.add(title);

    const kind = buildChip(this, 26, 52, KIND_NAME[item.kind], { fill: KIND_FILL[item.kind], color: '#ffffff', fontSize: 15 });
    row.add(kind.container);
    row.add(caption(this, 26 + kind.width + 10, 52, formatSpan(item), { fontSize: '19px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const detail = caption(this, 26, 76, item.detail, { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    if (detail.width > w - 40) detail.setScale((w - 40) / detail.width);
    row.add(detail);
    if (status === 'ended') row.setAlpha(0.5);
    container.add(row);
  }

  private nextCard(): InboxCard {
    const height = 84;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 30, t('mission.schedule.nextEntry', { formatDate: formatDate(new Date(SCHEDULE_NEXT.at).getTime()), title: SCHEDULE_NEXT.title }), { fontSize: '24px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 62, t('mission.schedule.moreComing'), { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    return { container, height };
  }
}
