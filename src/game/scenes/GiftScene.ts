import Phaser from 'phaser';
import { InboxSystem } from '../systems/InboxSystem';
import { SaveSystem, type Gift } from '../systems/SaveSystem';
import { Button } from '../ui/Button';
import { buildCardPanel, wrappedText } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { formatDateTime, formatRemaining } from '../ui/format';
import { addRewardIcon, REWARD_COLOR, REWARD_LABEL } from '../ui/RewardIcon';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { createPanel } from '../ui/Panel';
import { body, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';

const PAD = 14;
const SLOT = 108;
const BUTTON_W = 132;
const INK = '#1c130a';
/** Under this long left, the deadline is shown as a warning. */
const URGENT_MS = 3 * 86_400_000;

/** プレゼントBOX: gifts with their reward illustration, message, deadline and
 *  a 受取 button. A claimed or expired gift can then be deleted; 一括受取 and
 *  一括削除 sit in the pinned bar. */
export class GiftScene extends InboxScene {
  protected readonly screenTitle = 'プレゼントBOX';
  protected readonly emptyText = 'プレゼントはありません';
  protected readonly toolbarHeight = 76;

  constructor() {
    super('Gift');
  }

  protected buildCards(): InboxCard[] {
    const now = Date.now();
    return InboxSystem.sortedGifts(this.save, now).map((gift) => this.buildGiftCard(gift, now));
  }

  protected buildToolbar(toolbar: Phaser.GameObjects.Container): void {
    const now = Date.now();
    const claimable = this.save.gifts.filter((g) => InboxSystem.canClaim(g, now)).length;
    const deletable = this.save.gifts.filter((g) => InboxSystem.canDeleteGift(g, now)).length;
    this.layoutToolbar(toolbar, claimable > 0 ? `未受取 ${claimable}件` : '未受取なし', [
      { label: '一括受取', variant: 'gold', enabled: claimable > 0, onTap: () => this.claimAll() },
      { label: '一括削除', variant: 'danger', enabled: deletable > 0, onTap: () => this.confirmDeleteAll(deletable) },
    ]);
  }

  private buildGiftCard(gift: Gift, now: number): InboxCard {
    const container = this.add.container(0, 0);
    const w = CARD_WIDTH;
    const claimable = InboxSystem.canClaim(gift, now);
    const expired = InboxSystem.isExpired(gift, now);
    const guard = () => this.scroll.isTap();
    const color = REWARD_COLOR[gift.reward.type];

    // Illustration slot with the amount over its bottom edge.
    const slotCx = PAD + SLOT / 2;
    const slotCy = PAD + SLOT / 2;
    container.add(createPanel(this, slotCx, slotCy, SLOT, SLOT, { fillColor: 0x150e07, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
    const icon = addRewardIcon(this, gift.reward.type, slotCx, slotCy - 8, 74);
    if (!claimable) icon.setAlpha(0.45);
    container.add(icon);
    container.add(
      body(this, slotCx, slotCy + SLOT / 2 - 16, `×${gift.reward.amount.toLocaleString('ja-JP')}`, { fontSize: '22px', fontStyle: 'bold', color, stroke: INK, strokeThickness: 4 }).setOrigin(0.5),
    );

    // Text column.
    const textX = PAD + SLOT + 16;
    const textW = w - PAD - BUTTON_W - 12 - textX;
    let y = PAD;
    const place = (text: Phaser.GameObjects.Text, gap: number): void => {
      container.add(text);
      y += text.height + gap;
    };
    place(wrappedText(this, textX, y, gift.title, textW, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', strokeThickness: 4 }), 6);
    place(wrappedText(this, textX, y, gift.message, textW, { fontSize: '18px', color: '#f5e6c8', lineSpacing: 4 }), 8);
    place(wrappedText(this, textX, y, `${REWARD_LABEL[gift.reward.type]} ×${gift.reward.amount.toLocaleString('ja-JP')}`, textW, { fontSize: '22px', fontStyle: 'bold', color, strokeThickness: 3 }), 6);

    let deadline: string;
    let deadlineColor = '#d8c49a';
    if (gift.claimed) {
      deadline = '受取済み';
      deadlineColor = '#9fd4a0';
    } else if (expired) {
      deadline = '期限切れ';
      deadlineColor = '#ff8a8a';
    } else {
      deadline = `期限：${formatDateTime(gift.expiresAt)}まで（${formatRemaining(gift.expiresAt - now)}）`;
      if (gift.expiresAt - now < URGENT_MS) deadlineColor = '#ffb07a';
    }
    place(wrappedText(this, textX, y, deadline, textW, { fontSize: '17px', color: deadlineColor }), 0);

    // Buttons: 受取 on top, 削除 under it.
    const btnX = w - PAD - BUTTON_W / 2;
    const claimLabel = gift.claimed ? '受取済' : expired ? '期限切れ' : '受取';
    const claim = new Button(this, btnX, PAD + 28, BUTTON_W, 56, claimLabel, () => this.claim(gift.id), { variant: 'gold', fontSize: '25px', guard });
    claim.setEnabled(claimable);
    const remove = new Button(this, btnX, PAD + 56 + 10 + 24, BUTTON_W, 48, '削除', () => this.remove(gift.id), { variant: 'danger', fontSize: '22px', guard });
    remove.setEnabled(InboxSystem.canDeleteGift(gift, now));
    container.add([claim, remove]);

    const height = Math.max(PAD * 2 + SLOT + 4, y + PAD, PAD * 2 + 56 + 10 + 48);
    container.addAt(buildCardPanel(this, w, height, claimable), 0);
    return { container, height };
  }

  private claim(id: string): void {
    const reward = InboxSystem.claimGift(this.save, id);
    if (!reward) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    showToast(this, `${REWARD_LABEL[reward.type]} +${reward.amount.toLocaleString('ja-JP')} を受け取りました`);
    this.queueRender();
  }

  private claimAll(): void {
    const summary = InboxSystem.claimAllGifts(this.save);
    if (summary.count === 0) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    const parts: string[] = [];
    if (summary.gems > 0) parts.push(`魔晶石 +${summary.gems.toLocaleString('ja-JP')}`);
    if (summary.gold > 0) parts.push(`ゴールド +${summary.gold.toLocaleString('ja-JP')}`);
    showToast(this, `${parts.join('　')}（${summary.count}件）を受け取りました`);
    this.queueRender();
  }

  private remove(id: string): void {
    if (!InboxSystem.deleteGift(this.save, id)) return;
    SaveSystem.save(this.save);
    showToast(this, 'プレゼントを削除しました');
    this.queueRender();
  }

  private confirmDeleteAll(count: number): void {
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '一括削除',
      message: `受取済み・期限切れのプレゼント\n${count}件を削除しますか？\n（未受取のものは削除されません）`,
      confirmLabel: '削除する',
      onConfirm: () => {
        const removed = InboxSystem.deleteSettledGifts(this.save);
        SaveSystem.save(this.save);
        showToast(this, `${removed}件削除しました`);
        this.queueRender();
      },
    });
  }
}
