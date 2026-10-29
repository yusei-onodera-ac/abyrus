import Phaser from 'phaser';
import { InboxSystem } from '../systems/InboxSystem';
import { SaveSystem, type Mail } from '../systems/SaveSystem';
import { Button } from '../ui/Button';
import { buildCardPanel, buildUnreadDot, wrappedText } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { formatDate } from '../ui/format';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';

const PAD = 14;
const BUTTON_W = 132;

/** メールBOX: each mail's text on the card with a 既読 button; a read mail can
 *  then be deleted. 一括既読 and 一括削除 (read mails only) sit in the pinned bar. */
export class MailScene extends InboxScene {
  protected readonly screenTitle = 'メールBOX';
  protected readonly emptyText = 'メールはありません';
  protected readonly toolbarHeight = 76;

  constructor() {
    super('Mail');
  }

  protected buildCards(): InboxCard[] {
    return InboxSystem.sortedMails(this.save).map((mail) => this.buildMailCard(mail));
  }

  protected buildToolbar(toolbar: Phaser.GameObjects.Container): void {
    const unread = this.save.mails.filter((m) => !m.read).length;
    const read = this.save.mails.length - unread;
    this.layoutToolbar(toolbar, unread > 0 ? `未読 ${unread}件` : '未読なし', [
      { label: '一括既読', variant: 'gold', enabled: unread > 0, onTap: () => this.markAllRead() },
      { label: '一括削除', variant: 'danger', enabled: read > 0, onTap: () => this.confirmDeleteRead(read) },
    ]);
  }

  private buildMailCard(mail: Mail): InboxCard {
    const container = this.add.container(0, 0);
    const w = CARD_WIDTH;
    const guard = () => this.scroll.isTap();
    const unread = !mail.read;

    const textX = PAD + 22;
    const textW = w - PAD - BUTTON_W - 14 - textX;
    let y = PAD;
    const place = (text: Phaser.GameObjects.Text, gap: number): void => {
      container.add(text);
      y += text.height + gap;
    };

    if (unread) container.add(buildUnreadDot(this, PAD + 8, PAD + 16));
    place(wrappedText(this, textX, y, mail.title, textW, { fontSize: '25px', fontStyle: 'bold', color: unread ? '#ffe9b8' : '#cdbb94', strokeThickness: 4 }), 4);
    place(wrappedText(this, textX, y, formatDate(mail.sentAt), textW, { fontSize: '16px', color: '#9a8a6a' }), 12);
    place(wrappedText(this, textX, y, mail.body, textW, { fontSize: '20px', color: unread ? '#fff4dc' : '#cbbf9f', lineSpacing: 6 }), 0);

    const btnX = w - PAD - BUTTON_W / 2;
    const readBtn = new Button(this, btnX, PAD + 28, BUTTON_W, 56, unread ? '既読' : '既読済', () => this.markRead(mail.id), { variant: 'gold', fontSize: '25px', guard });
    readBtn.setEnabled(unread);
    const remove = new Button(this, btnX, PAD + 56 + 10 + 24, BUTTON_W, 48, '削除', () => this.remove(mail.id), { variant: 'danger', fontSize: '22px', guard });
    remove.setEnabled(!unread);
    container.add([readBtn, remove]);

    const height = Math.max(y + PAD, PAD * 2 + 56 + 10 + 48);
    container.addAt(buildCardPanel(this, w, height, unread), 0);
    return { container, height };
  }

  private markRead(id: string): void {
    if (!InboxSystem.markMailRead(this.save, id)) return;
    SaveSystem.save(this.save);
    this.queueRender();
  }

  private markAllRead(): void {
    const count = InboxSystem.markAllMailsRead(this.save);
    if (count === 0) return;
    SaveSystem.save(this.save);
    showToast(this, `${count}件を既読にしました`);
    this.queueRender();
  }

  private remove(id: string): void {
    if (!InboxSystem.deleteMail(this.save, id)) return;
    SaveSystem.save(this.save);
    showToast(this, 'メールを削除しました');
    this.queueRender();
  }

  private confirmDeleteRead(count: number): void {
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '一括削除',
      message: `既読のメール${count}件を削除しますか？\n（未読のものは削除されません）`,
      confirmLabel: '削除する',
      onConfirm: () => {
        const removed = InboxSystem.deleteReadMails(this.save);
        SaveSystem.save(this.save);
        showToast(this, `${removed}件削除しました`);
        this.queueRender();
      },
    });
  }
}
