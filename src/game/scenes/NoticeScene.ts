import Phaser from 'phaser';
import { InboxSystem } from '../systems/InboxSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { NOTICES, type NoticeEntry } from '../data/notices';
import { buildLoginBonusCalendarCard } from '../ui/LoginBonusCalendar';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { openModal } from '../ui/Modal';
import { createDivider, createPanel } from '../ui/Panel';
import { ScrollView } from '../ui/ScrollView';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const PAD = 14;
const THUMB_W = 210;
const FALLBACK_ASPECT = 1024 / 572;
const NEW_RED = 0xc23232;

const noticeKey = (id: string) => `notice_${id}`;

/** Queues every notice's image for loading (BootScene.preload). A missing
 *  file is fine - the card shows a "画像準備中" box instead. */
export function preloadNoticeArt(scene: Phaser.Scene): void {
  for (const notice of NOTICES) {
    if (notice.image) scene.load.image(noticeKey(notice.id), `/assets/notices/${notice.image}`);
  }
}

/** お知らせ: the operator's bulletin board. Cards with a thumbnail, tag, title
 *  and date (a red NEW until opened); tapping one opens the full text and
 *  picture. Content comes from data/notices.ts. */
export class NoticeScene extends InboxScene {
  protected readonly screenTitle = 'お知らせ';
  protected readonly emptyText = 'お知らせはありません';

  constructor() {
    super('Notice');
  }

  protected buildCards(): InboxCard[] {
    return [buildLoginBonusCalendarCard(this, this.save), ...NOTICES.map((notice) => this.buildNoticeCard(notice))];
  }

  private buildNoticeCard(notice: NoticeEntry): InboxCard {
    const container = this.add.container(0, 0);
    const w = CARD_WIDTH;
    const unread = !this.save.readNotices.includes(notice.id);

    // Thumbnail (optional).
    let thumbH = 0;
    if (notice.image) {
      const key = noticeKey(notice.id);
      if (this.textures.exists(key)) {
        const frame = this.textures.get(key).getSourceImage();
        thumbH = Math.round((THUMB_W * frame.height) / frame.width);
        container.add(this.add.image(PAD + THUMB_W / 2, PAD + thumbH / 2, key).setDisplaySize(THUMB_W, thumbH));
      } else {
        thumbH = Math.round(THUMB_W / FALLBACK_ASPECT);
        container.add(createPanel(this, PAD + THUMB_W / 2, PAD + thumbH / 2, THUMB_W, thumbH, { fillColor: 0x241810, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, radius: 8, gradient: false }));
        container.add(this.add.text(PAD + THUMB_W / 2, PAD + thumbH / 2, '画像準備中', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#9a8a6a' }).setOrigin(0.5));
      }
      const outline = this.add.graphics();
      outline.lineStyle(2, 0x120a04, 0.9);
      outline.strokeRect(PAD, PAD, THUMB_W, thumbH);
      container.add(outline);
    }

    const textX = PAD + (thumbH > 0 ? THUMB_W + 16 : 0);
    const textW = w - PAD - textX;
    let y = PAD;

    // Tag row.
    const tag = buildChip(this, textX, y + 14, notice.category, { fill: 0x3b2a12, color: '#ffe9b8' });
    container.add(tag.container);
    if (unread) container.add(buildChip(this, textX + tag.width + 8, y + 14, 'NEW', { fill: NEW_RED, color: '#ffffff' }).container);
    y += 36;

    const title = wrappedText(this, textX, y, notice.title, textW, { fontSize: '25px', fontStyle: 'bold', color: unread ? '#ffe9b8' : '#d8cba8', strokeThickness: 4 });
    container.add(title);
    y += title.height + 6;
    const date = wrappedText(this, textX, y, notice.date, textW, { fontSize: '17px', color: '#9a8a6a' });
    container.add(date);
    y += date.height;

    const height = Math.max(y + PAD, PAD * 2 + thumbH, 110);
    container.addAt(buildCardPanel(this, w, height, unread), 0);

    const hit = this.add.zone(w / 2, height / 2, w, height).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.015, duration: 110, ease: 'Sine.easeOut' }));
    hit.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 140, ease: 'Sine.easeOut' }));
    hit.on('pointerup', () => {
      if (this.scroll.isTap()) this.openDetail(notice);
    });
    container.add(hit);
    container.setSize(w, height);
    return { container, height };
  }

  /** Full text and picture in a popup, with its own scrolling for long ones. */
  private openDetail(notice: NoticeEntry): void {
    if (InboxSystem.markNoticeRead(this.save, notice.id)) {
      SaveSystem.save(this.save);
      this.queueRender();
    }
    this.modal?.close();
    const handle = openModal(this, this.scroll, 0.75, false);
    const modal = handle.container;

    const w = 600;
    const h = 900;
    const cy = 640;
    const top = cy - h / 2;
    const inner = w - 60;
    const left = 360 - inner / 2;

    modal.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
    modal.add(this.add.zone(360, cy, w, h).setInteractive());

    const tag = buildChip(this, left, top + 40, notice.category, { fill: 0x3b2a12, color: '#ffe9b8' });
    modal.add(tag.container);
    modal.add(wrappedText(this, left + inner, top + 40, notice.date, inner, { fontSize: '17px', color: '#9a8a6a' }).setOrigin(1, 0.5));
    const title = wrappedText(this, left, top + 72, notice.title, inner, { fontSize: '29px', fontStyle: 'bold', color: '#ffe9b8', strokeThickness: 4 });
    modal.add(title);

    const viewTop = top + 72 + title.height + 18;
    modal.add(createDivider(this, 360, viewTop - 9, inner, CHROME.brassDark));
    const viewH = top + h - 112 - viewTop;
    const view = new ScrollView(this, left, viewTop, inner, viewH);
    view.setDepth(201);

    let y = 0;
    const key = noticeKey(notice.id);
    if (notice.image && this.textures.exists(key)) {
      const frame = this.textures.get(key).getSourceImage();
      const imgH = Math.round((inner * frame.height) / frame.width);
      view.content.add(this.add.image(inner / 2, imgH / 2, key).setDisplaySize(inner, imgH));
      y = imgH + 18;
    }
    const text = wrappedText(this, 0, y, notice.body, inner, { fontSize: '22px', color: '#f5e6c8', lineSpacing: 8 });
    view.content.add(text);
    view.setContentHeight(y + text.height + 8);

    const close = (): void => {
      view.destroy();
      handle.close();
    };
    modal.add(new Button(this, 360, top + h - 56, 240, 68, '閉じる', close, { variant: 'wood', fontSize: '24px' }));
    this.modal = { container: modal, close };
  }
}
