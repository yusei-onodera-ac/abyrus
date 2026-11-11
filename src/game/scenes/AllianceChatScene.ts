import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import type { AllianceChatMessage } from '../alliance/AllianceBackend';
import { GAME_EMOJI_IDS, type EmojiId } from '../data/emoji';
import { MAX_TEXT, stripForbidden } from '../systems/ChatSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { applyBackground } from '../ui/Background';
import { BottomNavBar } from '../ui/BottomNavBar';
import { Button } from '../ui/Button';
import { buildChip } from '../ui/CardParts';
import { emojiTexture } from '../ui/EmojiIcons';
import { formatChatTime } from '../ui/format';
import { createPanel } from '../ui/Panel';
import { ResourceBar } from '../ui/ResourceBar';
import { buildRichText } from '../ui/RichText';
import { buildFrame, buildTitlePlate, SCREEN_VIEW } from '../ui/ScreenFrame';
import { ScrollView } from '../ui/ScrollView';
import { body, caption, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { enter } from '../ui/Transitions';

const INK = '#1c130a';
const VIEW_TOP = 218;
const VIEW_BOTTOM = 1134;
const COMPOSER_H = 92;
const BUBBLE_TEXT_W = 380;
const HEAD_H = 60;

/** 同盟チャット: the chat of the alliance's members. A message is text plus the game's own emoji. The 同盟's own news (a donation,
 *  the boss falling, a league change, someone joining) comes into the same stream, and a 救援要請 shows as a card that can be
 *  answered with a tap. */
export class AllianceChatScene extends Phaser.Scene {
  private save!: SaveData;
  private messages: AllianceChatMessage[] = [];
  private alive = true;
  private unsubscribe?: () => void;
  private loading = false;

  private scroll?: ScrollView;
  private chatField?: Phaser.GameObjects.DOMElement;
  private picker?: Phaser.GameObjects.Container;
  private firstLoad = true;
  /** True after the player sent something: the log goes to the newest line. */
  private stickToEnd = false;

  constructor() {
    super('AllianceChat');
  }

  init(): void {
    this.alive = true;
    this.messages = [];
    this.scroll = undefined;
    this.chatField = undefined;
    this.picker = undefined;
    this.firstLoad = true;
    this.loading = false;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'message');
    const bar = new ResourceBar(this, 0, 0, 720);
    bar.update(this.save);
    enter(this, bar, { dy: -20, duration: 280 });
    buildTitlePlate(this, '同盟チャット');
    buildFrame(this);
    new BottomNavBar(this, 720, 1280, null);
    this.buildHeader();
    this.scroll = new ScrollView(this, SCREEN_VIEW.x, VIEW_TOP + HEAD_H, SCREEN_VIEW.w, VIEW_BOTTOM - COMPOSER_H - 8 - (VIEW_TOP + HEAD_H));
    this.buildComposer(VIEW_BOTTOM - COMPOSER_H);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.unsubscribe?.();
    });
    const profile = AllianceService.profile(this.save);
    this.unsubscribe = AllianceService.backend().subscribe(profile, () => void this.reload());
    void this.reload();
  }

  private buildHeader(): void {
    this.add.existing(new Button(this, SCREEN_VIEW.x + 70, VIEW_TOP + 26, 140, 48, '◀ 同盟', () => this.scene.start('AllianceHome'), { variant: 'wood', fontSize: '21px' }));
    this.add.existing(new Button(this, SCREEN_VIEW.x + SCREEN_VIEW.w - 90, VIEW_TOP + 26, 170, 48, '救援を求める', () => this.openHelpMenu(), { variant: 'wood', fontSize: '20px' }));
  }

  private async reload(): Promise<void> {
    if (this.loading || !this.alive) return;
    this.loading = true;
    try {
      const profile = AllianceService.profile(this.save);
      const [detail, chat] = await Promise.all([AllianceService.refresh(this.save), AllianceService.backend().chat(profile, 80)]);
      if (!this.alive) return;
      if (detail.ok && detail.value === null) {
        this.scene.start('AllianceFind');
        return;
      }
      if (chat.ok) this.messages = chat.value;
      this.renderLog();
    } finally {
      this.loading = false;
    }
  }

  // --- log --------------------------------------------------------------------------

  private renderLog(): void {
    const scroll = this.scroll;
    if (!scroll) return;
    const keep = scroll.getScroll();
    const toEnd = this.firstLoad || this.stickToEnd;
    scroll.content.removeAll(true);
    const now = Date.now();
    let y = 10;
    if (this.messages.length === 0) {
      scroll.content.add(caption(this, SCREEN_VIEW.w / 2, y + 90, 'まだメッセージがありません\n最初のひと言をどうぞ', { fontSize: '22px', color: '#9a8a6a', align: 'center' }).setOrigin(0.5));
      y += 170;
    }
    for (const message of this.messages) y += this.addMessage(scroll.content, message, y, now) + 14;
    scroll.setContentHeight(y + 6);
    if (toEnd) scroll.scrollToEnd();
    else scroll.scrollTo(keep);
    this.firstLoad = false;
    this.stickToEnd = false;
  }

  private addMessage(parent: Phaser.GameObjects.Container, m: AllianceChatMessage, y: number, now: number): number {
    if (m.kind === 'system') return this.addSystem(parent, m, y);
    if (m.kind === 'help') return this.addHelp(parent, m, y, now);
    return this.addBubble(parent, m, y, now);
  }

  private addSystem(parent: Phaser.GameObjects.Container, m: AllianceChatMessage, y: number): number {
    const t = body(this, SCREEN_VIEW.w / 2, y + 16, m.text, { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 3, align: 'center', wordWrap: { width: SCREEN_VIEW.w - 80 } }).setOrigin(0.5, 0);
    parent.add(t);
    return t.height + 22;
  }

  /** A 救援要請: a card with who asked, for what, who has helped - and 手伝う while it is open. */
  private addHelp(parent: Phaser.GameObjects.Container, m: AllianceChatMessage, y: number, now: number): number {
    const mine = m.senderUid === AllianceService.profile(this.save).uid;
    const help = m.help;
    const open = !!help?.open;
    const h = 128;
    const x = 16;
    const w = SCREEN_VIEW.w - 32;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x, y + 3, w, h, 14);
    g.fillStyle(0x3d1c1c, 1);
    g.fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(3, open ? CHROME.brassBright : CHROME.brassDark, 1);
    g.strokeRoundedRect(x, y, w, h, 14);
    parent.add(g);
    parent.add(buildChip(this, x + 14, y + 24, '救援要請', { fill: 0xb8472a, color: '#fff4dc', fontSize: 16 }).container);
    parent.add(body(this, x + 120, y + 24, `${m.senderName}　${formatChatTime(m.sentAt, now)}`, { fontSize: '18px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    parent.add(body(this, x + 14, y + 62, help?.what === 'village' ? '村に襲撃が来ています。助けて！' : '共闘ボスが強くて…手伝ってください！', { fontSize: '21px', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    parent.add(body(this, x + 14, y + 100, `助けてくれた人 ${help?.helpers.length ?? 0}人`, { fontSize: '17px', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const meHelped = !!help?.helpers.includes(AllianceService.profile(this.save).uid);
    const button = new Button(this, x + w - 92, y + 92, 160, 56, mine ? '要請中' : meHelped ? '手伝った' : open ? '手伝う' : '終了', () => void this.answer(m), { variant: 'gold', fontSize: '22px' });
    button.setEnabled(open && !mine && !meHelped);
    parent.add(button);
    return h;
  }

  private addBubble(parent: Phaser.GameObjects.Container, m: AllianceChatMessage, y: number, now: number): number {
    const mine = m.senderUid === AllianceService.profile(this.save).uid;
    const rich = buildRichText(this, m.text, BUBBLE_TEXT_W, { fontSize: 22, color: mine ? '#fff6e0' : '#f5e6c8', stroke: INK, strokeThickness: 2 });
    const bw = Math.max(64, rich.width + 36);
    const bh = rich.height + 22;
    const nameH = mine ? 0 : 28;
    const bx = mine ? SCREEN_VIEW.w - 16 - bw : 16;
    const by = y + nameH;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(bx, by + 3, bw, bh, 16);
    g.fillStyle(mine ? 0x6b4316 : 0x2a1b0e, 1);
    g.fillRoundedRect(bx, by, bw, bh, 16);
    g.lineStyle(2, mine ? CHROME.brassBright : CHROME.brassDark, 0.95);
    g.strokeRoundedRect(bx, by, bw, bh, 16);
    parent.add(g);
    rich.container.setPosition(bx + 18, by + 11);
    parent.add(rich.container);
    if (!mine) parent.add(body(this, bx + 6, y + 12, m.senderName, { fontSize: '18px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const time = body(this, mine ? bx - 8 : bx + bw + 8, by + bh, formatChatTime(m.sentAt, now), { fontSize: '15px', color: '#8d7d5e', stroke: INK, strokeThickness: 2 });
    time.setOrigin(mine ? 1 : 0, 1);
    parent.add(time);
    return nameH + bh;
  }

  // --- actions ----------------------------------------------------------------------

  private async answer(m: AllianceChatMessage): Promise<void> {
    const result = await AllianceService.backend().answerHelp(AllianceService.profile(this.save), m.id);
    if (!this.alive) return;
    if (!result.ok) {
      showToast(this, result.message, '#ff8a8a');
      return;
    }
    showToast(this, `${m.senderName}を手伝いました（貢献 +5）`);
    SaveSystem.save(this.save);
    await this.reload();
  }

  private openHelpMenu(): void {
    const profile = AllianceService.profile(this.save);
    const picker = this.add.container(0, 0).setDepth(70);
    const dim = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.6).setInteractive();
    picker.add(dim);
    const panel = createPanel(this, 360, 640, 560, 380, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, gradient: false });
    picker.add(panel);
    picker.add(this.add.zone(360, 640, 560, 380).setInteractive());
    picker.add(body(this, 360, 500, '救援を求める', { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    const send = async (what: 'raid' | 'village'): Promise<void> => {
      picker.destroy();
      const result = await AllianceService.backend().requestHelp(profile, what);
      if (!this.alive) return;
      showToast(this, result.ok ? '救援を求めました' : result.message, result.ok ? undefined : '#ff8a8a');
      if (result.ok) await this.reload();
    };
    picker.add(new Button(this, 360, 580, 460, 66, 'ボスが強い！（共闘ボス）', () => void send('raid'), { variant: 'gold', fontSize: '24px' }));
    picker.add(new Button(this, 360, 662, 460, 66, '村に襲撃が来た！', () => void send('village'), { variant: 'gold', fontSize: '24px' }));
    picker.add(new Button(this, 360, 750, 240, 58, 'やめる', () => picker.destroy(), { variant: 'wood', fontSize: '22px' }));
  }

  // --- composer ----------------------------------------------------------------------

  private buildComposer(composerTop: number): void {
    const x0 = SCREEN_VIEW.x;
    const w = SCREEN_VIEW.w;
    const cy = composerTop + COMPOSER_H / 2;
    createPanel(this, x0 + w / 2, cy, w, COMPOSER_H, { fillColor: 0x1c1309, fillAlpha: 1, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false });
    const emojiBtn = new Button(this, x0 + 12 + 36, cy, 72, 68, '', () => this.togglePicker(composerTop), { variant: 'wood' });
    emojiBtn.add(this.add.image(0, 0, emojiTexture(this, 'smile')).setDisplaySize(44, 44));
    const sendW = 118;
    new Button(this, x0 + w - 12 - sendW / 2, cy, sendW, 68, '送信', () => void this.send(), { variant: 'gold', fontSize: '26px' });
    const inputW = w - 12 - 72 - 10 - 10 - sendW - 12;
    const inputX = x0 + 12 + 72 + 10 + inputW / 2;
    this.chatField = this.add.dom(
      inputX,
      cy,
      'input',
      `width:${inputW}px;height:68px;box-sizing:border-box;padding:0 18px;font:bold 26px Arial,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;` +
        'color:#2a1608;background:#fff4dc;border:3px solid #c9a052;border-radius:12px;outline:none;caret-color:#7a1717;' +
        'box-shadow:inset 0 3px 8px rgba(0,0,0,0.35);',
    );
    const field = this.chatField.node as HTMLInputElement;
    field.type = 'text';
    field.maxLength = MAX_TEXT;
    field.placeholder = 'メッセージを入力';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.addEventListener('input', (event) => {
      if ((event as InputEvent).isComposing) return;
      const clean = stripForbidden(field.value);
      if (clean !== field.value) field.value = clean;
    });
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) void this.send();
    });
  }

  private async send(): Promise<void> {
    const field = this.chatField?.node as HTMLInputElement | undefined;
    if (!field) return;
    const text = field.value;
    const result = await AllianceService.backend().sendChat(AllianceService.profile(this.save), text);
    if (!this.alive) return;
    if (!result.ok) {
      showToast(this, result.message || '文字か絵文字を入力してください', '#ff8a8a');
      return;
    }
    field.value = '';
    this.closePicker();
    this.stickToEnd = true;
    await this.reload();
    field.focus();
  }

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

  private insertEmoji(id: EmojiId): void {
    const field = this.chatField?.node as HTMLInputElement | undefined;
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
