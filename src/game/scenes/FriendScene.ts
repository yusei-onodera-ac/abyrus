import Phaser from 'phaser';
import type { Friend, FriendRequest, Group } from '../systems/SaveSystem';
import { SaveSystem } from '../systems/SaveSystem';
import {
  FRIEND_GIFT,
  GROUP_NAME_MAX,
  MAX_FRIENDS,
  MAX_GROUPS,
  MAX_GROUP_FRIENDS,
  SocialSystem,
  formatPlayerId,
  shareLink,
} from '../systems/SocialSystem';
import type { NavTab } from '../ui/BottomNavBar';
import { Button } from '../ui/Button';
import { buildAvatar, buildCardPanel, wrappedText } from '../ui/CardParts';
import { openConfirm, openTextPrompt } from '../ui/Dialogs';
import { formatAgo, formatDate } from '../ui/format';
import { openModal, type ModalHandle } from '../ui/Modal';
import { createDivider, createPanel } from '../ui/Panel';
import { ScrollView } from '../ui/ScrollView';
import { CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { copyText, shareLinkNatively } from '../ui/share';
import { buildTabStrip } from '../ui/TabStrip';
import { body, caption, heading, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';

export type FriendTab = 'friends' | 'requests' | 'groups' | 'add';

interface FriendSceneData {
  tab?: FriendTab;
  /** A friend ID to drop into the 追加 tab's box, e.g. from a share link. */
  prefill?: string;
}

const PAD = 14;
const AVATAR_R = 34;
const INK = '#1c130a';
const ID_FIELD_Y = 110; // local to the IDで申請 card
const CARD_H_ADD = 232;

/** フレンド: friends, the requests waiting on an answer, 軍団 (chat groups the
 *  player builds from their friends), and the 追加 tab with the player's own
 *  ID and share link plus a box to request someone else's.
 *
 *  There is no server yet, so nothing here reaches another player: requests
 *  queue up, presents are only recorded. The data is real and ready for one. */
export class FriendScene extends InboxScene {
  protected readonly screenTitle = 'フレンド';
  protected emptyText = '';
  protected readonly navTab: NavTab = 'friend';
  protected readonly toolbarHeight = 76;

  private tab: FriendTab = 'friends';
  private prefill?: string;
  private idInput?: Phaser.GameObjects.DOMElement;
  private inputCard?: Phaser.GameObjects.Container;

  constructor() {
    super('Friend');
  }

  init(data: FriendSceneData): void {
    super.init();
    this.tab = data?.tab ?? 'friends';
    this.prefill = data?.prefill;
    this.idInput = undefined;
    this.inputCard = undefined;
  }

  // --- shell hooks ------------------------------------------------------

  protected buildToolbar(toolbar: Phaser.GameObjects.Container): void {
    const { incoming } = this.save.social;
    const strip = buildTabStrip(
      this,
      [
        { key: 'friends', label: 'フレンド' },
        { key: 'requests', label: '申請', badge: incoming.length },
        { key: 'groups', label: '軍団' },
        { key: 'add', label: '追加' },
      ],
      this.tab,
      SCREEN_VIEW.w,
      56,
      (key) => {
        this.tab = key as FriendTab;
        this.scroll.scrollTo(0);
        this.queueRender();
      },
    );
    strip.setPosition(0, 10);
    toolbar.add(strip);
  }

  protected buildCards(): InboxCard[] {
    this.emptyText = '';
    if (this.tab === 'requests') return this.requestCards();
    if (this.tab === 'groups') return this.groupCards();
    if (this.tab === 'add') return this.addCards();
    return this.friendCards();
  }

  /** The DOM text box can't live in the scrolling content, so it's recreated
   *  over its card after every rebuild (the 追加 tab is short enough not to scroll). */
  protected render(firstTime = false): void {
    this.idInput?.destroy();
    this.idInput = undefined;
    this.inputCard = undefined;
    super.render(firstTime);
    const card = this.inputCard;
    if (this.tab !== 'add' || !card) return;
    // On first build the cards are still sliding in; wait for them to settle.
    if (firstTime) this.time.delayedCall(700, () => this.mountIdInput(card));
    else this.mountIdInput(card);
  }

  // --- shared card pieces -----------------------------------------------

  /** Empty card shell: height known up front, panel added behind the content. */
  private shell(height: number, highlight = false): InboxCard {
    const container = this.add.container(0, 0);
    container.addAt(buildCardPanel(this, CARD_WIDTH, height, highlight), 0);
    return { container, height };
  }

  private sectionCard(text: string): InboxCard {
    const card = this.shell(54);
    card.container.add(body(this, PAD + 6, 27, text, { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    return card;
  }

  private hintCard(text: string): InboxCard {
    const text0 = wrappedText(this, PAD + 6, PAD, text, CARD_WIDTH - PAD * 2 - 12, { fontSize: '20px', color: '#cdbb94', lineSpacing: 6 });
    const card = this.shell(text0.height + PAD * 2);
    card.container.add(text0);
    return card;
  }

  private personCard(person: Friend | FriendRequest, sub: string, highlight = false): InboxCard {
    const card = this.shell(104, highlight);
    const name = SocialSystem.displayName(person);
    card.container.add(buildAvatar(this, PAD + AVATAR_R, 52, AVATAR_R, person.name || '?'));
    const x = PAD + AVATAR_R * 2 + 18;
    const favorite = 'favorite' in person && person.favorite ? '★ ' : '';
    card.container.add(body(this, x, 34, `${favorite}${name}`, { fontSize: '26px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    card.container.add(body(this, x, 72, sub, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 2 }).setOrigin(0, 0.5));
    return card;
  }

  // --- フレンド tab ------------------------------------------------------

  private friendCards(): InboxCard[] {
    const social = this.save.social;
    const now = Date.now();
    const friends = SocialSystem.sortedFriends(social);
    const cards: InboxCard[] = [this.sectionCard(`フレンド　${friends.length} / ${MAX_FRIENDS}`)];
    if (friends.length === 0) {
      cards.push(this.hintCard('フレンドがいません。「追加」タブから、IDや共有リンクで申請しましょう。'));
      return cards;
    }
    for (const friend of friends) {
      const card = this.personCard(friend, `Lv.${friend.level}　ログイン ${formatAgo(friend.lastLoginAt, now)}`);
      const guard = () => this.scroll.isTap();
      // Whole card opens the detail popup; the present button sits above it.
      const hit = this.add.zone(CARD_WIDTH / 2, 52, CARD_WIDTH, 104).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (guard()) this.openFriendDetail(friend);
      });
      card.container.add(hit);
      const sent = !SocialSystem.canSendGift(social, friend.id, now);
      const gift = new Button(this, CARD_WIDTH - PAD - 84, 52, 168, 56, sent ? '送信済' : 'プレゼント', () => this.confirmGift(friend), { variant: sent ? 'wood' : 'gold', fontSize: '22px', guard });
      gift.setEnabled(!sent);
      card.container.add(gift);
      cards.push(card);
    }
    return cards;
  }

  // --- 申請 tab ----------------------------------------------------------

  private requestCards(): InboxCard[] {
    const { incoming, outgoing } = this.save.social;
    const now = Date.now();
    const guard = () => this.scroll.isTap();
    const cards: InboxCard[] = [];
    if (incoming.length > 0) {
      cards.push(this.sectionCard(`届いた申請　${incoming.length}`));
      for (const request of incoming) {
        const card = this.personCard(request, `Lv.${request.level}　${formatAgo(request.sentAt, now)}`, true);
        card.container.add(new Button(this, CARD_WIDTH - PAD - 178, 52, 104, 54, '承認', () => this.accept(request), { variant: 'gold', fontSize: '22px', guard }));
        card.container.add(new Button(this, CARD_WIDTH - PAD - 56, 52, 104, 54, '拒否', () => this.decline(request), { variant: 'wood', fontSize: '22px', guard }));
        cards.push(card);
      }
    }
    if (outgoing.length > 0) {
      cards.push(this.sectionCard(`送信した申請　${outgoing.length}`));
      for (const request of outgoing) {
        const card = this.personCard(request, `返事待ち　${formatAgo(request.sentAt, now)}`);
        card.container.add(new Button(this, CARD_WIDTH - PAD - 60, 52, 108, 54, '取消', () => this.cancel(request), { variant: 'wood', fontSize: '22px', guard }));
        cards.push(card);
      }
    }
    if (cards.length === 0) this.emptyText = '申請はありません';
    return cards;
  }

  private accept(request: FriendRequest): void {
    if (!SocialSystem.acceptRequest(this.save.social, request.id)) {
      showToast(this, `フレンドが上限（${MAX_FRIENDS}人）です`, '#ff8a8a');
      return;
    }
    SaveSystem.save(this.save);
    showToast(this, `${SocialSystem.displayName(request)}とフレンドになりました`);
    this.queueRender();
  }

  private decline(request: FriendRequest): void {
    SocialSystem.declineRequest(this.save.social, request.id);
    SaveSystem.save(this.save);
    showToast(this, '申請を断りました');
    this.queueRender();
  }

  private cancel(request: FriendRequest): void {
    SocialSystem.cancelRequest(this.save.social, request.id);
    SaveSystem.save(this.save);
    showToast(this, '申請を取り消しました');
    this.queueRender();
  }

  // --- 軍団 tab ------------------------------------------------------------

  private groupCards(): InboxCard[] {
    const social = this.save.social;
    const guard = () => this.scroll.isTap();
    const full = social.groups.length >= MAX_GROUPS;

    const create = this.shell(92);
    const createButton = new Button(this, CARD_WIDTH / 2, 46, CARD_WIDTH - PAD * 2, 64, full ? `軍団は最大${MAX_GROUPS}つまで` : `＋ 軍団を作成　${social.groups.length} / ${MAX_GROUPS}`, () => this.startGroupCreate(), {
      variant: 'wood',
      fontSize: '26px',
      guard,
    });
    if (full) createButton.setEnabled(false);
    create.container.add(createButton);
    const cards: InboxCard[] = [create];

    if (social.groups.length === 0) {
      cards.push(this.hintCard('軍団は、フレンドを集めたグループチャットです。名前を付けて、メンバーを選ぶと作れます。'));
      return cards;
    }
    for (const group of social.groups) cards.push(this.groupCard(group));
    return cards;
  }

  private groupCard(group: Group): InboxCard {
    const guard = () => this.scroll.isTap();
    const names = group.memberIds.map((id) => this.save.social.friends.find((f) => f.id === id)?.name ?? '？').join('、');
    const textX = PAD + 6;
    const textW = CARD_WIDTH - PAD * 2 - 150 - 14;
    const title = body(this, textX, PAD + 4, group.name, { fontSize: '27px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0);
    const count = body(this, textX, PAD + 42, `メンバー ${group.memberIds.length + 1}人（あなた＋${group.memberIds.length}人）`, { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 2 }).setOrigin(0, 0);
    const members = wrappedText(this, textX, PAD + 70, names, textW, { fontSize: '19px', color: '#f5e6c8', lineSpacing: 4 });
    const height = Math.max(PAD * 2 + 70 + members.height, 150);
    const card = this.shell(height);
    card.container.add([title, count, members]);
    const bx = CARD_WIDTH - PAD - 75;
    card.container.add(new Button(this, bx, PAD + 28, 150, 56, 'メッセージ', () => this.scene.start('Message', { tab: 'groups', groupId: group.id }), { variant: 'gold', fontSize: '21px', guard }));
    card.container.add(new Button(this, bx, PAD + 28 + 56 / 2 + 10 + 24, 150, 48, '解散', () => this.confirmDissolve(group), { variant: 'danger', fontSize: '21px', guard }));
    return card;
  }

  private startGroupCreate(): void {
    const social = this.save.social;
    if (social.friends.length === 0) {
      showToast(this, '先にフレンドを追加してください', '#ff8a8a');
      return;
    }
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: '軍団を作成',
      label: '軍団名',
      initial: SocialSystem.defaultGroupName(social.groups),
      maxLength: GROUP_NAME_MAX,
      hint: 'このままOKを押すと、メンバー選びへ進みます',
      onSubmit: (name) => this.openMemberPicker(name),
    });
  }

  private confirmDissolve(group: Group): void {
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '軍団を解散',
      message: `「${group.name}」を解散しますか？\nチャット履歴も削除されます`,
      confirmLabel: '解散する',
      onConfirm: () => {
        SocialSystem.deleteGroup(this.save, group.id);
        SaveSystem.save(this.save);
        showToast(this, `「${group.name}」を解散しました`);
        this.queueRender();
      },
    });
  }

  /** Popup of the player's friends with checkboxes; 作成 makes the 軍団. */
  private openMemberPicker(name: string): void {
    const { handle, panel, top } = this.openPanel(600, 900, 640);
    const friends = SocialSystem.sortedFriends(this.save.social);
    const chosen = new Set<string>();

    panel.add(heading(this, 360, top + 48, `「${name}」のメンバー`, { fontSize: '29px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    const counter = caption(this, 360, top + 94, '', { fontSize: '19px', color: '#d8c49a' }).setOrigin(0.5);
    panel.add(counter);

    const view = new ScrollView(this, 90, top + 124, 540, 900 - 124 - 112);
    view.setDepth(201);
    const rowH = 76;
    const render = (): void => {
      counter.setText(`${chosen.size} / ${MAX_GROUP_FRIENDS} 人を選択中`);
      view.content.removeAll(true);
      friends.forEach((friend, i) => {
        const y = i * (rowH + 8);
        const on = chosen.has(friend.id);
        const row = this.add.container(0, y);
        const bg = this.add.graphics();
        bg.fillStyle(on ? 0x4a3418 : 0x1c1309, 1);
        bg.fillRoundedRect(0, 0, 524, rowH, 12);
        bg.lineStyle(2, on ? CHROME.brassBright : CHROME.brassDark, 1);
        bg.strokeRoundedRect(0, 0, 524, rowH, 12);
        row.add(bg);
        row.add(buildAvatar(this, 46, rowH / 2, 25, friend.name));
        row.add(body(this, 92, rowH / 2, friend.name, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
        const box = this.add.graphics();
        box.lineStyle(3, CHROME.brassBright, 1);
        box.strokeRoundedRect(524 - 62, rowH / 2 - 20, 40, 40, 8);
        if (on) {
          box.fillStyle(CHROME.brassBright, 1);
          box.fillRoundedRect(524 - 62 + 5, rowH / 2 - 15, 30, 30, 5);
        }
        row.add(box);
        const hit = this.add.zone(262, rowH / 2, 524, rowH).setOrigin(0.5);
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          if (!view.isTap()) return;
          if (!on && chosen.size >= MAX_GROUP_FRIENDS) {
            showToast(this, `メンバーは最大${MAX_GROUP_FRIENDS}人までです`, '#ff8a8a');
            return;
          }
          if (on) chosen.delete(friend.id);
          else chosen.add(friend.id);
          // The tapped row is destroyed by the redraw, so let this event finish first.
          this.time.delayedCall(0, render);
        });
        row.add(hit);
        view.content.add(row);
      });
      view.setContentHeight(friends.length * (rowH + 8));
    };
    render();

    const close = (): void => {
      view.destroy();
      handle.close();
    };
    const buttonY = top + 900 - 56;
    panel.add(new Button(this, 360 - 140, buttonY, 230, 68, 'キャンセル', close, { variant: 'wood', fontSize: '24px' }));
    panel.add(
      new Button(
        this,
        360 + 140,
        buttonY,
        230,
        68,
        '作成',
        () => {
          const result = SocialSystem.createGroup(this.save, name, [...chosen]);
          if (!result.ok) {
            const reasons = { no_members: 'メンバーを1人以上選んでください', too_many_members: `メンバーは最大${MAX_GROUP_FRIENDS}人までです`, too_many_groups: `軍団は最大${MAX_GROUPS}つまでです` };
            showToast(this, reasons[result.reason], '#ff8a8a');
            return;
          }
          SaveSystem.save(this.save);
          close();
          showToast(this, `軍団「${result.group.name}」を作成しました`);
          this.queueRender();
        },
        { variant: 'gold', fontSize: '26px' },
      ),
    );
    this.modal = { container: handle.container, close };
  }

  // --- 追加 tab -------------------------------------------------------------

  private addCards(): InboxCard[] {
    const social = this.save.social;
    const guard = () => this.scroll.isTap();
    const link = shareLink(social.playerId);

    // Your ID.
    const mine = this.shell(150, true);
    mine.container.add(body(this, PAD + 6, 30, 'あなたのID', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    mine.container.add(body(this, PAD + 6, 90, formatPlayerId(social.playerId), { fontSize: '50px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0, 0.5));
    mine.container.add(new Button(this, CARD_WIDTH - PAD - 100, 90, 200, 62, 'IDをコピー', () => this.copy(formatPlayerId(social.playerId), 'IDをコピーしました'), { variant: 'wood', fontSize: '22px', guard }));

    // Share link.
    const linkText = wrappedText(this, PAD + 6, 62, link, CARD_WIDTH - PAD * 2 - 12, { fontSize: '17px', color: '#9fb8d8', lineSpacing: 4 });
    const shareH = 62 + linkText.height + 18 + 60 + PAD;
    const share = this.shell(shareH);
    share.container.add(body(this, PAD + 6, 30, '共有リンク', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    share.container.add(linkText);
    const by = 62 + linkText.height + 18 + 30;
    share.container.add(new Button(this, PAD + 6 + 130, by, 260, 60, 'リンクをコピー', () => this.copy(link, 'リンクをコピーしました'), { variant: 'wood', fontSize: '22px', guard }));
    share.container.add(new Button(this, CARD_WIDTH - PAD - 6 - 130, by, 260, 60, '共有する', () => this.shareLink(link), { variant: 'gold', fontSize: '22px', guard }));

    // Request by ID.
    const request = this.shell(CARD_H_ADD);
    request.container.add(body(this, PAD + 6, 30, 'IDで申請', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    request.container.add(caption(this, PAD + 6, 62, '相手のID、または共有リンクを貼り付けてください', { fontSize: '17px', color: '#cdbb94' }).setOrigin(0, 0.5));
    request.container.add(new Button(this, CARD_WIDTH / 2, CARD_H_ADD - PAD - 32, CARD_WIDTH - PAD * 2 - 12, 62, '申請する', () => this.submitRequest(), { variant: 'gold', fontSize: '26px', guard }));
    this.inputCard = request.container;

    const note = this.hintCard('※現在はサーバー未接続のため、申請・プレゼント・メッセージは相手に届きません（この端末内に保存されるだけです）。');
    return [mine, share, request, note];
  }

  /** Puts the real <input> over the 申請 card's field slot. */
  private mountIdInput(card: Phaser.GameObjects.Container): void {
    if (this.tab !== 'add' || this.idInput) return;
    const x = this.scroll.content.x + card.x + CARD_WIDTH / 2;
    const y = this.scroll.content.y + card.y + ID_FIELD_Y;
    this.idInput = this.add.dom(
      x,
      y,
      'input',
      `width:${CARD_WIDTH - PAD * 2 - 12}px;height:62px;box-sizing:border-box;padding:0 18px;font:bold 28px Arial,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;` +
        'color:#2a1608;background:#fff4dc;border:3px solid #c9a052;border-radius:12px;outline:none;caret-color:#7a1717;' +
        'box-shadow:inset 0 3px 8px rgba(0,0,0,0.35);',
    );
    const field = this.idInput.node as HTMLInputElement;
    field.type = 'text';
    field.maxLength = 200;
    field.placeholder = '例：K7M4-RN2X';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) this.submitRequest();
    });
    if (this.prefill) {
      field.value = formatPlayerId(this.prefill);
      this.prefill = undefined;
      showToast(this, '共有リンクから開きました。内容を確認して申請してください');
    }
  }

  private submitRequest(): void {
    const field = this.idInput?.node as HTMLInputElement | undefined;
    if (!field) return;
    const result = SocialSystem.sendRequest(this.save.social, field.value);
    if (!result.ok) {
      const reasons = {
        invalid: 'IDの形式が正しくありません',
        self: '自分には申請できません',
        already_friend: 'すでにフレンドです',
        already_requested: 'すでに申請済みです',
        friends_full: `フレンドが上限（${MAX_FRIENDS}人）です`,
        too_many_requests: '申請中の数が上限です',
      };
      showToast(this, reasons[result.reason], '#ff8a8a');
      return;
    }
    SaveSystem.save(this.save);
    field.value = '';
    showToast(this, result.accepted ? 'フレンドになりました' : '申請を保存しました（サーバー接続後に届きます）');
    this.queueRender();
  }

  private async copy(text: string, done: string): Promise<void> {
    const ok = await copyText(text);
    showToast(this, ok ? done : 'コピーできませんでした', ok ? undefined : '#ff8a8a');
  }

  private async shareLink(link: string): Promise<void> {
    const outcome = await shareLinkNatively('ABYRUS', 'ABYRUSでフレンドになろう！', link);
    if (outcome === 'unavailable') await this.copy(link, 'この端末は共有に非対応のため、リンクをコピーしました');
  }

  // --- friend detail ---------------------------------------------------------

  /** A modal panel with the shared chrome; returns the container to fill and the panel's top edge. */
  private openPanel(w: number, h: number, cy: number, dismissOnDimTap = false): { handle: ModalHandle; panel: Phaser.GameObjects.Container; top: number } {
    this.modal?.close();
    const handle = openModal(this, this.scroll, 0.75, dismissOnDimTap);
    this.modal = handle;
    const panel = handle.container;
    panel.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
    panel.add(this.add.zone(360, cy, w, h).setInteractive());
    return { handle, panel, top: cy - h / 2 };
  }

  private openFriendDetail(friend: Friend): void {
    const social = this.save.social;
    const now = Date.now();
    const w = 600;
    const h = 800;
    const { handle, panel, top } = this.openPanel(w, h, 640, true);
    const close = (): void => handle.close();

    panel.add(buildAvatar(this, 360, top + 96, 58, friend.name));
    panel.add(body(this, 360, top + 190, `${friend.favorite ? '★ ' : ''}${friend.name}`, { fontSize: '36px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));

    const rows: [string, string][] = [
      ['レベル', `Lv.${friend.level}`],
      ['フレンドID', formatPlayerId(friend.id)],
      ['最終ログイン', formatAgo(friend.lastLoginAt, now)],
      ['フレンド登録日', formatDate(friend.addedAt)],
      ['今日のプレゼント', SocialSystem.canSendGift(social, friend.id, now) ? '未送信' : '送信済み'],
    ];
    const left = 360 - w / 2 + 50;
    const right = 360 + w / 2 - 50;
    rows.forEach(([label, value], i) => {
      const y = top + 250 + i * 54;
      if (i > 0) panel.add(createDivider(this, 360, y - 27, w - 70, CHROME.brassDark));
      panel.add(body(this, left, y, label, { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      panel.add(body(this, right, y, value, { fontSize: '24px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    });

    const gridTop = top + 250 + rows.length * 54 + 34;
    const bw = 258;
    const bh = 64;
    const canGift = SocialSystem.canSendGift(social, friend.id, now);
    const gift = new Button(this, 360 - 141, gridTop, bw, bh, canGift ? 'プレゼント' : '送信済み', () => {
      close();
      this.confirmGift(friend);
    }, { variant: 'gold', fontSize: '24px' });
    gift.setEnabled(canGift);
    panel.add(gift);
    panel.add(new Button(this, 360 + 141, gridTop, bw, bh, 'メッセージ', () => this.scene.start('Message', { tab: 'friends', friendId: friend.id }), { variant: 'wood', fontSize: '24px' }));
    panel.add(
      new Button(this, 360 - 141, gridTop + bh + 16, bw, bh, friend.favorite ? '★ お気に入り解除' : '☆ お気に入り', () => {
        const on = SocialSystem.toggleFavorite(social, friend.id);
        SaveSystem.save(this.save);
        close();
        showToast(this, on ? 'お気に入りにしました' : 'お気に入りを解除しました');
        this.queueRender();
      }, { variant: 'wood', fontSize: '22px' }),
    );
    panel.add(new Button(this, 360 + 141, gridTop + bh + 16, bw, bh, 'フレンド解除', () => {
      close();
      this.confirmRemove(friend);
    }, { variant: 'danger', fontSize: '24px' }));
    panel.add(new Button(this, 360, top + h - 52, 240, 64, '閉じる', close, { variant: 'wood', fontSize: '24px' }));
  }

  private confirmGift(friend: Friend): void {
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: 'プレゼントを送る',
      message: `${friend.name}に\n${FRIEND_GIFT.label} を送ります\n（1日1回・無料）`,
      confirmLabel: '送る',
      confirmVariant: 'gold',
      onConfirm: () => {
        if (!SocialSystem.sendGift(this.save.social, friend.id)) return;
        SaveSystem.save(this.save);
        showToast(this, `${friend.name}にプレゼントを送りました`);
        this.queueRender();
      },
    });
  }

  private confirmRemove(friend: Friend): void {
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: 'フレンド解除',
      message: `${friend.name}をフレンドから外しますか？\nチャット履歴も削除されます`,
      confirmLabel: '解除する',
      onConfirm: () => {
        SocialSystem.removeFriend(this.save, friend.id);
        SaveSystem.save(this.save);
        showToast(this, `${friend.name}をフレンドから外しました`);
        this.queueRender();
      },
    });
  }
}
