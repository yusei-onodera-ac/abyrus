import Phaser from 'phaser';
import { GAME_EMOJI_IDS, type EmojiId } from '../data/emoji';
import { ChatSystem, GLOBAL_CHANNEL, MAX_TEXT, SELF_ID, SYSTEM_ID, dmChannel, groupChannel, plainPreview, stripForbidden } from '../systems/ChatSystem';
import { SaveSystem, type ChatMessage, type SaveData } from '../systems/SaveSystem';
import { applyBackground } from '../ui/Background';
import { BottomNavBar } from '../ui/BottomNavBar';
import { Button } from '../ui/Button';
import { buildAvatar, buildChip } from '../ui/CardParts';
import { emojiTexture } from '../ui/EmojiIcons';
import { formatChatTime } from '../ui/format';
import { createPanel } from '../ui/Panel';
import { ResourceBar } from '../ui/ResourceBar';
import { buildRichText } from '../ui/RichText';
import { buildFrame, buildTitlePlate, SCREEN_VIEW } from '../ui/ScreenFrame';
import { ScrollView } from '../ui/ScrollView';
import { buildTabStrip } from '../ui/TabStrip';
import { body, caption, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { enter } from '../ui/Transitions';

type MessageTab = 'global' | 'groups' | 'friends';

interface MessageSceneData {
  tab?: MessageTab;
  /** Open this 軍団's chat straight away. */
  groupId?: string;
  /** Open this friend's DM straight away. */
  friendId?: string;
}

const INK = '#1c130a';
const VIEW_TOP = 218;
const VIEW_BOTTOM = 1134;
const TAB_H = 56;
const COMPOSER_H = 92;
const BUBBLE_TEXT_W = 380;
const ROW_H = 96;

/** メッセージ: 全体チャット, 軍団 (the chat groups made on the Friend screen)
 *  and DMs to friends. A message is text plus in-game emoji only - the box
 *  strips OS emoji, and the picker offers the in-game set.
 *
 *  There is no server yet: messages are kept in the save and only the
 *  placeholder lines in data/socialSeed.ts come from "other people". */
export class MessageScene extends Phaser.Scene {
  private save!: SaveData;
  private tab: MessageTab = 'global';
  private openGroupId: string | null = null;
  private openFriendId: string | null = null;
  private channel: string | null = null;

  /** Static pieces of the current view (tab strip, headers, composer chrome). */
  private view?: Phaser.GameObjects.Container;
  private scroll?: ScrollView;
  private chatInput?: Phaser.GameObjects.DOMElement;
  private picker?: Phaser.GameObjects.Container;

  constructor() {
    super('Message');
  }

  init(data: MessageSceneData): void {
    this.tab = data?.tab ?? 'global';
    this.openGroupId = data?.groupId ?? null;
    this.openFriendId = data?.friendId ?? null;
    this.channel = null;
    this.view = undefined;
    this.scroll = undefined;
    this.chatInput = undefined;
    this.picker = undefined;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'message');

    const bar = new ResourceBar(this, 0, 0, 720);
    bar.update(this.save);
    enter(this, bar, { dy: -20, duration: 280 });

    buildTitlePlate(this, 'メッセージ');
    buildFrame(this);
    this.show();
    // No longer a tab of its own: reached from the Home screen's message box and the Friend screen.
    new BottomNavBar(this, 720, 1280, null);
  }

  // --- view switching ------------------------------------------------------

  private teardown(): void {
    this.picker?.destroy();
    this.picker = undefined;
    this.chatInput?.destroy();
    this.chatInput = undefined;
    this.scroll?.destroy();
    this.scroll = undefined;
    this.view?.destroy(true);
    this.view = undefined;
  }

  /** Rebuilds whatever the current tab/thread shows. Taps go through
   *  queueShow(): rebuilding inside a tap handler would destroy its own zone. */
  private show(): void {
    this.teardown();
    const view = this.add.container(0, 0);
    this.view = view;

    const { groups, friends } = this.save.social;
    const strip = buildTabStrip(
      this,
      [
        { key: 'global', label: '全体' },
        { key: 'groups', label: '軍団' },
        { key: 'friends', label: 'フレンド' },
      ],
      this.tab,
      SCREEN_VIEW.w,
      TAB_H,
      (key) => {
        this.tab = key as MessageTab;
        this.openGroupId = null;
        this.openFriendId = null;
        this.queueShow();
      },
    );
    strip.setPosition(SCREEN_VIEW.x, VIEW_TOP);
    view.add(strip);

    const top = VIEW_TOP + TAB_H + 10;
    if (this.tab === 'global') {
      this.buildThread(GLOBAL_CHANNEL, top, null);
    } else if (this.tab === 'groups') {
      const group = groups.find((g) => g.id === this.openGroupId);
      if (group) this.buildThread(groupChannel(group.id), top, { title: `${group.name}（${group.memberIds.length + 1}人）` });
      else this.buildGroupList(top);
    } else {
      const friend = friends.find((f) => f.id === this.openFriendId);
      if (friend) this.buildThread(dmChannel(friend.id), top, { title: friend.name });
      else this.buildFriendList(top);
    }
  }

  private queueShow(): void {
    this.time.delayedCall(0, () => this.show());
  }

  // --- lists of 軍団 / friends -----------------------------------------------

  private buildGroupList(top: number): void {
    const { groups } = this.save.social;
    this.channel = null;
    if (groups.length === 0) {
      this.emptyState(top, '軍団がありません', '「フレンド」画面の「軍団」タブで作成できます', '軍団を作る', () => this.scene.start('Friend', { tab: 'groups' }));
      return;
    }
    const rows = groups.map((group) => ({
      name: group.name,
      sub: `${group.memberIds.length + 1}人`,
      last: ChatSystem.lastMessage(this.save, groupChannel(group.id)),
      open: () => {
        this.openGroupId = group.id;
        this.queueShow();
      },
    }));
    this.buildRows(top, rows);
  }

  private buildFriendList(top: number): void {
    const { friends } = this.save.social;
    this.channel = null;
    if (friends.length === 0) {
      this.emptyState(top, 'フレンドがいません', '「フレンド」画面で、IDや共有リンクから申請できます', 'フレンドを追加', () => this.scene.start('Friend', { tab: 'add' }));
      return;
    }
    const rows = friends.map((friend) => ({
      name: friend.name,
      sub: `Lv.${friend.level}`,
      last: ChatSystem.lastMessage(this.save, dmChannel(friend.id)),
      open: () => {
        this.openFriendId = friend.id;
        this.queueShow();
      },
    }));
    this.buildRows(top, rows);
  }

  private buildRows(top: number, rows: { name: string; sub: string; last?: ChatMessage; open: () => void }[]): void {
    const scroll = new ScrollView(this, SCREEN_VIEW.x, top, SCREEN_VIEW.w, VIEW_BOTTOM - top);
    this.scroll = scroll;
    const left = (SCREEN_VIEW.w - 640) / 2;
    rows.forEach((row, i) => {
      const y = left + i * (ROW_H + 10);
      const card = this.add.container(left, y);
      card.add(createPanel(this, 320, ROW_H / 2, 640, ROW_H, { fillColor: CHROME.woodFill, fillAlpha: 0.97, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false }));
      card.add(buildAvatar(this, 52, ROW_H / 2, 30, row.name));
      card.add(body(this, 100, 28, row.name, { fontSize: '26px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      card.add(body(this, 624, 28, row.sub, { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 2 }).setOrigin(1, 0.5));
      const preview = row.last ? Array.from(plainPreview(row.last.text)).slice(0, 26).join('') : 'まだメッセージがありません';
      card.add(body(this, 100, 66, preview, { fontSize: '19px', color: row.last ? '#f5e6c8' : '#8d7d5e', stroke: INK, strokeThickness: 2 }).setOrigin(0, 0.5));
      const hit = this.add.zone(320, ROW_H / 2, 640, ROW_H).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (scroll.isTap()) row.open();
      });
      card.add(hit);
      scroll.content.add(card);
    });
    scroll.setContentHeight(left * 2 + rows.length * (ROW_H + 10) - 10);
  }

  private emptyState(top: number, title: string, hint: string, actionLabel: string, action: () => void): void {
    const view = this.view!;
    view.add(caption(this, 360, top + 150, title, { fontSize: '28px', fontStyle: 'bold', color: '#cdbb94', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    view.add(caption(this, 360, top + 200, hint, { fontSize: '20px', color: '#9a8a6a' }).setOrigin(0.5));
    view.add(new Button(this, 360, top + 290, 340, 72, actionLabel, action, { variant: 'gold', fontSize: '26px' }));
  }

  // --- a chat thread ---------------------------------------------------------

  private buildThread(channel: string, top: number, header: { title: string } | null): void {
    this.channel = channel;
    const view = this.view!;
    let y = top;
    if (header) {
      view.add(new Button(this, SCREEN_VIEW.x + 70, y + 24, 140, 48, '◀ 一覧', () => {
        this.openGroupId = null;
        this.openFriendId = null;
        this.queueShow();
      }, { variant: 'wood', fontSize: '21px' }));
      view.add(body(this, SCREEN_VIEW.x + 166, y + 24, header.title, { fontSize: '27px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      y += 60;
    }
    const composerTop = VIEW_BOTTOM - COMPOSER_H;
    this.scroll = new ScrollView(this, SCREEN_VIEW.x, y, SCREEN_VIEW.w, composerTop - 8 - y);
    this.renderLog();
    this.buildComposer(composerTop);
  }

  /** Redraws every message of the open thread and scrolls to the newest. */
  private renderLog(): void {
    const scroll = this.scroll;
    if (!scroll || !this.channel) return;
    scroll.content.removeAll(true);
    const now = Date.now();
    let y = 10;
    scroll.content.add(caption(this, SCREEN_VIEW.w / 2, y + 8, '※サーバー未接続：メッセージはこの端末内にのみ保存されます', { fontSize: '16px', color: '#8d7d5e' }).setOrigin(0.5));
    y += 38;
    const messages = ChatSystem.messagesOf(this.save, this.channel);
    if (messages.length === 0) {
      scroll.content.add(caption(this, SCREEN_VIEW.w / 2, y + 60, 'まだメッセージがありません\n最初のひと言をどうぞ', { fontSize: '22px', color: '#9a8a6a', align: 'center' }).setOrigin(0.5));
      y += 140;
    }
    for (const message of messages) y += this.addBubble(scroll.content, message, y, now) + 14;
    scroll.setContentHeight(y + 6);
    scroll.scrollToEnd();
  }

  /** One chat bubble at row `y`; returns the height the row used. */
  private addBubble(parent: Phaser.GameObjects.Container, message: ChatMessage, y: number, now: number): number {
    const mine = message.senderId === SELF_ID;
    const system = message.senderId === SYSTEM_ID;
    const rich = buildRichText(this, message.text, BUBBLE_TEXT_W, { fontSize: 22, color: mine ? '#fff6e0' : '#f5e6c8', stroke: INK, strokeThickness: 2 });
    const bw = Math.max(64, rich.width + 36);
    const bh = rich.height + 22;
    const nameH = mine ? 0 : 28;
    const bx = mine ? SCREEN_VIEW.w - 16 - bw : 16;
    const by = y + nameH;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(bx, by + 3, bw, bh, 16);
    g.fillStyle(mine ? 0x6b4316 : system ? 0x3d1c1c : 0x2a1b0e, 1);
    g.fillRoundedRect(bx, by, bw, bh, 16);
    g.lineStyle(2, mine ? CHROME.brassBright : system ? CHROME.brass : CHROME.brassDark, 0.95);
    g.strokeRoundedRect(bx, by, bw, bh, 16);
    parent.add(g);
    rich.container.setPosition(bx + 18, by + 11);
    parent.add(rich.container);

    if (!mine) {
      let nx = bx + 6;
      if (system) {
        const chip = buildChip(this, nx, y + 12, '運営', { fill: 0x8c1d1d, color: '#ffffff', fontSize: 15 });
        parent.add(chip.container);
        nx += chip.width + 8;
      }
      parent.add(body(this, nx, y + 12, message.senderName, { fontSize: '18px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    }
    const time = body(this, mine ? bx - 8 : bx + bw + 8, by + bh, formatChatTime(message.sentAt, now), { fontSize: '15px', color: '#8d7d5e', stroke: INK, strokeThickness: 2 });
    time.setOrigin(mine ? 1 : 0, 1);
    parent.add(time);
    return nameH + bh;
  }

  // --- composer ----------------------------------------------------------------

  private buildComposer(composerTop: number): void {
    const view = this.view!;
    const x0 = SCREEN_VIEW.x;
    const w = SCREEN_VIEW.w;
    const cy = composerTop + COMPOSER_H / 2;
    view.add(createPanel(this, x0 + w / 2, cy, w, COMPOSER_H, { fillColor: 0x1c1309, fillAlpha: 1, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false }));

    const emojiBtn = new Button(this, x0 + 12 + 36, cy, 72, 68, '', () => this.togglePicker(composerTop), { variant: 'wood' });
    emojiBtn.add(this.add.image(0, 0, emojiTexture(this, 'smile')).setDisplaySize(44, 44));
    view.add(emojiBtn);

    const sendW = 118;
    view.add(new Button(this, x0 + w - 12 - sendW / 2, cy, sendW, 68, '送信', () => this.send(), { variant: 'gold', fontSize: '26px' }));

    const inputW = w - 12 - 72 - 10 - 10 - sendW - 12;
    const inputX = x0 + 12 + 72 + 10 + inputW / 2;
    this.chatInput = this.add.dom(
      inputX,
      cy,
      'input',
      `width:${inputW}px;height:68px;box-sizing:border-box;padding:0 18px;font:bold 26px Arial,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;` +
        'color:#2a1608;background:#fff4dc;border:3px solid #c9a052;border-radius:12px;outline:none;caret-color:#7a1717;' +
        'box-shadow:inset 0 3px 8px rgba(0,0,0,0.35);',
    );
    const field = this.chatInput.node as HTMLInputElement;
    field.type = 'text';
    field.maxLength = MAX_TEXT;
    field.placeholder = 'メッセージを入力';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.addEventListener('input', (event) => {
      // Drop OS emoji as they're typed - but never mid-composition, which would eat the IME's text.
      if ((event as InputEvent).isComposing) return;
      const clean = stripForbidden(field.value);
      if (clean !== field.value) field.value = clean;
    });
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) this.send();
    });
  }

  private send(): void {
    const field = this.chatInput?.node as HTMLInputElement | undefined;
    if (!field || !this.channel) return;
    if (!ChatSystem.send(this.save, this.channel, field.value)) {
      showToast(this, '文字か絵文字を入力してください', '#ff8a8a');
      return;
    }
    SaveSystem.save(this.save);
    field.value = '';
    this.closePicker();
    this.renderLog();
    field.focus();
  }

  // --- in-game emoji picker ----------------------------------------------------

  private closePicker(): void {
    this.picker?.destroy();
    this.picker = undefined;
    this.scroll?.setEnabled(true);
  }

  private togglePicker(composerTop: number): void {
    if (this.picker) {
      this.closePicker();
      return;
    }
    const cols = 8;
    const cell = 74;
    const rows = Math.ceil(GAME_EMOJI_IDS.length / cols);
    const w = cols * cell + 24;
    const h = rows * cell + 24;
    const cx = SCREEN_VIEW.x + SCREEN_VIEW.w / 2;
    const cy = composerTop - 12 - h / 2;

    const picker = this.add.container(0, 0).setDepth(60);
    this.picker = picker;
    // The log underneath mustn't scroll while the player is picking.
    this.scroll?.setEnabled(false);
    picker.add(createPanel(this, cx, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 14, gradient: false }));
    picker.add(this.add.zone(cx, cy, w, h).setInteractive());
    GAME_EMOJI_IDS.forEach((id, i) => {
      const x = cx - w / 2 + 12 + (i % cols) * cell + cell / 2;
      const y = cy - h / 2 + 12 + Math.floor(i / cols) * cell + cell / 2;
      const slot = this.add.graphics();
      slot.fillStyle(0x1c1309, 1);
      slot.fillRoundedRect(x - cell / 2 + 4, y - cell / 2 + 4, cell - 8, cell - 8, 10);
      picker.add(slot);
      picker.add(this.add.image(x, y, emojiTexture(this, id)).setDisplaySize(48, 48));
      const hit = this.add.zone(x, y, cell, cell).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.insertEmoji(id));
      picker.add(hit);
    });
  }

  /** Writes `:id:` into the box at the caret; the log draws it as the emoji. */
  private insertEmoji(id: EmojiId): void {
    const field = this.chatInput?.node as HTMLInputElement | undefined;
    if (!field) return;
    const token = `:${id}:`;
    if (Array.from(field.value).length + token.length > MAX_TEXT) {
      showToast(this, 'これ以上入力できません', '#ff8a8a');
      return;
    }
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.setRangeText(token, start, end, 'end');
    this.closePicker();
    field.focus();
  }
}
