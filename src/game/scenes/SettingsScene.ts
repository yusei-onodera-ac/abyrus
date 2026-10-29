import Phaser from 'phaser';
import { LEGAL_DOCUMENTS, type LegalDocument } from '../data/legal';
import { SaveSystem } from '../systems/SaveSystem';
import {
  APP_VERSION,
  BUG_CATEGORIES,
  INQUIRY_CATEGORIES,
  NOTIFICATION_LABEL,
  PLAYER_NAME_MAX,
  REPORT_MAX,
  SettingsSystem,
  VOLUME_STEPS,
  cleanPlayerName,
  isValidEmail,
  maskEmail,
  parseTwitterHandle,
  type NotificationKind,
  type ReportKind,
  type VolumeKind,
} from '../systems/SettingsSystem';
import { formatPlayerId } from '../systems/SocialSystem';
import { SoundSystem } from '../systems/SoundSystem';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { openConfirm, openMessageForm, openTextPrompt } from '../ui/Dialogs';
import { openDocument } from '../ui/DocumentViewer';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { copyText } from '../ui/share';
import { body, caption, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';

const PAD = 14;
const INK = '#1c130a';
const BUTTON_W = 150;

/** 設定: account (ID, name, email, X), sound, notifications, support, the
 *  legal documents, version and account deletion. Reached from the Home
 *  screen's corner button, so it has a 戻る button rather than a bottom tab.
 *
 *  Nothing here talks to a server yet: the email and X handle are kept as typed
 *  (marked 未確認), reports wait on the device, and deleting the account wipes
 *  this device's save. The sound sliders are stored for the audio the game
 *  doesn't have yet. */
export class SettingsScene extends InboxScene {
  protected readonly screenTitle = '設定';
  protected emptyText = '';

  constructor() {
    super('Settings');
  }

  protected buildCards(): InboxCard[] {
    const { settings } = this.save;
    const cards: InboxCard[] = [];
    const guard = () => this.scroll.isTap();

    cards.push(this.sectionCard('アカウント'));
    cards.push(this.idCard(guard));
    cards.push(
      this.valueCard({
        label: 'プレイヤー名',
        value: this.save.playerName,
        buttons: [{ label: '変更', variant: 'wood', onTap: () => this.askName() }],
        guard,
      }),
    );
    cards.push(
      this.valueCard({
        label: 'メールアドレス',
        value: settings.email ? maskEmail(settings.email) : '未登録',
        muted: !settings.email,
        chip: settings.email ? '未確認' : undefined,
        note: 'データの引き継ぎやお知らせに使います。確認メールは、通信機能の追加後に届きます。',
        buttons: settings.email
          ? [
              { label: '変更', variant: 'wood', onTap: () => this.askEmail(settings.email) },
              { label: '解除', variant: 'danger', onTap: () => this.confirmClear('email') },
            ]
          : [{ label: '登録', variant: 'gold', onTap: () => this.askEmail('') }],
        guard,
      }),
    );
    cards.push(
      this.valueCard({
        label: 'X（旧Twitter）',
        value: settings.twitter ? `@${settings.twitter}` : '未連携',
        muted: !settings.twitter,
        chip: settings.twitter ? '未確認' : undefined,
        note: 'ユーザー名を登録します。連携の確認は、通信機能の追加後に行われます。',
        buttons: settings.twitter
          ? [
              { label: '変更', variant: 'wood', onTap: () => this.askTwitter(settings.twitter) },
              { label: '解除', variant: 'danger', onTap: () => this.confirmClear('twitter') },
            ]
          : [{ label: '登録', variant: 'gold', onTap: () => this.askTwitter('') }],
        guard,
      }),
    );

    cards.push(this.sectionCard('サウンド'));
    cards.push(this.volumeCard('bgm', 'BGM'));
    cards.push(this.volumeCard('se', '効果音'));
    cards.push(this.hintCard('※ サウンドは今後追加予定です。設定は保存され、追加されたときに反映されます。'));

    cards.push(this.sectionCard('通知'));
    cards.push(this.notificationCard());
    cards.push(this.hintCard('※ 通知は今後追加予定です。設定は保存され、追加されたときに反映されます。'));

    cards.push(this.sectionCard('サポート'));
    cards.push(this.reportCard('inquiry', 'お問い合わせ', 'ゲームやお支払いについてのご質問・ご要望'));
    cards.push(this.reportCard('bug', 'バグ報告', '不具合を見つけたら教えてください'));

    cards.push(this.sectionCard('規約・表記'));
    for (const doc of LEGAL_DOCUMENTS) cards.push(this.linkCard(doc));

    cards.push(this.sectionCard('その他'));
    cards.push(this.valueCard({ label: 'バージョン', value: `v${APP_VERSION}`, buttons: [], guard }));
    cards.push(
      this.valueCard({
        label: 'アカウント削除',
        value: '',
        note: 'この端末のデータをすべて削除して、最初からにします。元に戻せません。',
        buttons: [{ label: '削除', variant: 'danger', onTap: () => this.confirmDelete() }],
        guard,
      }),
    );
    return cards;
  }

  // --- card pieces ------------------------------------------------------

  private shell(height: number, highlight = false): InboxCard {
    const container = this.add.container(0, 0);
    container.addAt(buildCardPanel(this, CARD_WIDTH, height, highlight), 0);
    return { container, height };
  }

  private sectionCard(text: string): InboxCard {
    const card = this.shell(54);
    card.container.add(body(this, PAD + 6, 27, text, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    return card;
  }

  private hintCard(text: string): InboxCard {
    const t = wrappedText(this, PAD + 6, PAD, text, CARD_WIDTH - PAD * 2 - 12, { fontSize: '18px', color: '#cdbb94', lineSpacing: 5 });
    const card = this.shell(t.height + PAD * 2);
    card.container.add(t);
    return card;
  }

  /** The workhorse row: a label, its value, an optional status tag and note, and
   *  up to two buttons on the right. */
  private valueCard(opts: {
    label: string;
    value: string;
    muted?: boolean;
    chip?: string;
    note?: string;
    buttons: { label: string; variant: 'gold' | 'wood' | 'danger'; onTap: () => void }[];
    guard: () => boolean;
  }): InboxCard {
    const container = this.add.container(0, 0);
    const buttonsW = opts.buttons.length > 0 ? opts.buttons.length * BUTTON_W + (opts.buttons.length - 1) * 10 : 0;
    const textW = CARD_WIDTH - PAD * 2 - buttonsW - (buttonsW > 0 ? 14 : 0);
    let y = PAD;
    const label = caption(this, PAD + 4, y + 12, opts.label, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    container.add(label);
    if (opts.chip) container.add(buildChip(this, PAD + 4 + label.width + 12, y + 12, opts.chip, { fill: 0x7a4a14, color: '#ffe9b8', fontSize: 15 }).container);
    y += 30;
    if (opts.value) {
      const value = body(this, PAD + 4, y + 18, opts.value, { fontSize: '30px', fontStyle: 'bold', color: opts.muted ? '#9a8a6a' : '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
      container.add(value);
      y += 40;
    }
    if (opts.note) {
      const note = wrappedText(this, PAD + 4, y + 2, opts.note, textW - 4, { fontSize: '16px', color: '#a89a78', lineSpacing: 3 });
      container.add(note);
      y += note.height + 6;
    }
    const height = Math.max(y + PAD, opts.value || opts.note ? 96 : 76);
    opts.buttons.forEach((b, i) => {
      const cx = CARD_WIDTH - PAD - BUTTON_W / 2 - (opts.buttons.length - 1 - i) * (BUTTON_W + 10);
      container.add(new Button(this, cx, height / 2, BUTTON_W, 58, b.label, b.onTap, { variant: b.variant, fontSize: '23px', guard: opts.guard }));
    });
    container.addAt(buildCardPanel(this, CARD_WIDTH, height), 0);
    return { container, height };
  }

  /** プレイヤーID: shown big, copyable, never editable. */
  private idCard(guard: () => boolean): InboxCard {
    const card = this.valueCard({
      label: 'プレイヤーID',
      value: formatPlayerId(this.save.social.playerId),
      chip: '変更不可',
      buttons: [{ label: 'コピー', variant: 'wood', onTap: () => void this.copyId() }],
      guard,
    });
    return card;
  }

  /** BGM / 効果音: ten tappable bars (tap one to set the level) and a ミュート button. */
  private volumeCard(kind: VolumeKind, name: string): InboxCard {
    const height = 124;
    const container = this.add.container(0, 0);
    const level = this.save.settings.audio[kind];
    container.add(caption(this, PAD + 4, PAD + 12, name, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(
      body(this, CARD_WIDTH - PAD - 4, PAD + 12, level === 0 ? 'OFF' : `${level * (100 / VOLUME_STEPS)}%`, { fontSize: '24px', fontStyle: 'bold', color: level === 0 ? '#9a8a6a' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5),
    );

    const guard = () => this.scroll.isTap();
    const offW = 104;
    const gap = 4;
    const barsW = CARD_WIDTH - PAD * 2 - offW - 14;
    const segW = (barsW - gap * (VOLUME_STEPS - 1)) / VOLUME_STEPS;
    const rowY = height - PAD - 30;
    for (let i = 1; i <= VOLUME_STEPS; i++) {
      const x = PAD + (i - 1) * (segW + gap);
      const filled = i <= level;
      const seg = this.add.graphics();
      seg.fillStyle(filled ? 0xe0822a : 0x1d130a, 1);
      seg.fillRoundedRect(x, rowY - 24, segW, 48, 7);
      seg.lineStyle(2, filled ? CHROME.brassBright : CHROME.brassDark, filled ? 1 : 0.8);
      seg.strokeRoundedRect(x, rowY - 24, segW, 48, 7);
      if (filled) {
        seg.fillStyle(0xffffff, 0.2);
        seg.fillRoundedRect(x + 3, rowY - 21, segW - 6, 18, { tl: 5, tr: 5, bl: 1, br: 1 });
      }
      container.add(seg);
      const hit = this.add.zone(x + segW / 2, rowY, segW + gap, 56).setOrigin(0.5).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (guard()) this.setVolume(kind, i);
      });
      container.add(hit);
    }
    container.add(new Button(this, CARD_WIDTH - PAD - offW / 2, rowY, offW, 52, 'ミュート', () => this.setVolume(kind, 0), { variant: level === 0 ? 'gold' : 'wood', fontSize: '18px', guard }));
    container.addAt(buildCardPanel(this, CARD_WIDTH, height), 0);
    return { container, height };
  }

  /** The three notification switches in one card. */
  private notificationCard(): InboxCard {
    const kinds = Object.keys(NOTIFICATION_LABEL) as NotificationKind[];
    const rowH = 70;
    const height = PAD * 2 + kinds.length * rowH - 6;
    const container = this.add.container(0, 0);
    const guard = () => this.scroll.isTap();
    kinds.forEach((kind, i) => {
      const cy = PAD + i * rowH + rowH / 2 - 3;
      const on = this.save.settings.notifications[kind];
      container.add(body(this, PAD + 6, cy, NOTIFICATION_LABEL[kind], { fontSize: '24px', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      container.add(this.switchControl(CARD_WIDTH - PAD - 54, cy, on, () => this.toggleNotification(kind), guard));
    });
    container.addAt(buildCardPanel(this, CARD_WIDTH, height), 0);
    return { container, height };
  }

  /** A pill switch, ON (orange, knob right) or OFF (dark, knob left). */
  private switchControl(cx: number, cy: number, on: boolean, onTap: () => void, guard: () => boolean): Phaser.GameObjects.Container {
    const w = 104;
    const h = 46;
    const g = this.add.graphics();
    g.fillStyle(on ? 0xe0822a : 0x1d130a, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(2, on ? CHROME.brassBright : CHROME.brassDark, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    const knobX = on ? w / 2 - h / 2 : -w / 2 + h / 2;
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(knobX, 2, h / 2 - 5);
    g.fillStyle(on ? 0xfff4dc : 0xa89a78, 1);
    g.fillCircle(knobX, 0, h / 2 - 5);
    const label = this.add
      .text(on ? -12 : 12, 0, on ? 'ON' : 'OFF', { fontFamily: 'Arial, sans-serif', fontSize: '17px', fontStyle: 'bold', color: on ? '#ffffff' : '#7a6c4e', stroke: on ? '#4a2406' : '#000000', strokeThickness: 3 })
      .setOrigin(0.5);
    const hit = this.add.zone(0, 0, w + 20, h + 20).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (guard()) onTap();
    });
    return this.add.container(cx, cy, [g, label, hit]);
  }

  /** お問い合わせ / バグ報告: what it's for, how many are waiting to be sent, and a button. */
  private reportCard(kind: ReportKind, name: string, description: string): InboxCard {
    const waiting = SettingsSystem.unsentReports(this.save, kind);
    const container = this.add.container(0, 0);
    container.add(body(this, PAD + 6, PAD + 20, name, { fontSize: '27px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const textW = CARD_WIDTH - PAD * 2 - BUTTON_W - 14;
    const desc = wrappedText(this, PAD + 6, PAD + 46, description, textW, { fontSize: '17px', color: '#d8c49a' });
    container.add(desc);
    let y = PAD + 46 + desc.height + 4;
    if (waiting > 0) {
      const wait = wrappedText(this, PAD + 6, y, `送信待ち ${waiting}件（通信機能の追加後に送信されます）`, textW, { fontSize: '16px', color: '#ffb07a' });
      container.add(wait);
      y += wait.height + 4;
    }
    const height = Math.max(96, y + PAD);
    const guard = () => this.scroll.isTap();
    container.add(new Button(this, CARD_WIDTH - PAD - BUTTON_W / 2, height / 2, BUTTON_W, 58, '書く', () => this.writeReport(kind), { variant: 'gold', fontSize: '23px', guard }));
    container.addAt(buildCardPanel(this, CARD_WIDTH, height), 0);
    return { container, height };
  }

  /** A whole-card tap target that opens a legal document. */
  private linkCard(doc: LegalDocument): InboxCard {
    const height = 74;
    const card = this.shell(height);
    card.container.add(body(this, PAD + 6, height / 2, doc.title, { fontSize: '24px', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const chevron = this.add.graphics();
    chevron.lineStyle(5, CHROME.brass, 1);
    chevron.beginPath();
    chevron.moveTo(CARD_WIDTH - PAD - 24, height / 2 - 12);
    chevron.lineTo(CARD_WIDTH - PAD - 10, height / 2);
    chevron.lineTo(CARD_WIDTH - PAD - 24, height / 2 + 12);
    chevron.strokePath();
    card.container.add(chevron);
    const hit = this.add.zone(CARD_WIDTH / 2, height / 2, CARD_WIDTH, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => this.tweens.add({ targets: card.container, scale: 1.015, duration: 110, ease: 'Sine.easeOut' }));
    hit.on('pointerout', () => this.tweens.add({ targets: card.container, scale: 1, duration: 140, ease: 'Sine.easeOut' }));
    hit.on('pointerup', () => {
      if (this.scroll.isTap()) this.openLegal(doc);
    });
    card.container.add(hit);
    card.container.setSize(CARD_WIDTH, height);
    return card;
  }

  // --- actions ----------------------------------------------------------

  private store(message?: string): void {
    SaveSystem.save(this.save);
    if (message) showToast(this, message);
    this.queueRender();
  }

  private async copyId(): Promise<void> {
    const ok = await copyText(this.save.social.playerId);
    if (this.scene.isActive()) showToast(this, ok ? 'プレイヤーIDをコピーしました' : 'コピーできませんでした', ok ? '#f0ecff' : '#ff8a8a');
  }

  private askName(): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: 'プレイヤー名の変更',
      label: 'プレイヤー名',
      initial: this.save.playerName,
      maxLength: PLAYER_NAME_MAX,
      hint: `${PLAYER_NAME_MAX}文字までです。フレンドにも表示されます。`,
      onSubmit: (text) => {
        const name = cleanPlayerName(text);
        if (!name) {
          showToast(this, '名前を入力してください', '#ff8a8a');
          return;
        }
        this.save.playerName = name;
        this.refreshResources();
        this.store('プレイヤー名を変更しました');
      },
    });
  }

  private askEmail(initial: string): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: 'メールアドレスの登録',
      label: 'メールアドレス',
      initial,
      maxLength: 100,
      placeholder: 'example@mail.com',
      inputMode: 'email',
      hint: '入力したアドレスにお知らせや引き継ぎ情報を送ります。',
      onSubmit: (text) => {
        const email = text.trim();
        if (!isValidEmail(email)) {
          showToast(this, 'メールアドレスの形式が正しくありません', '#ff8a8a');
          this.time.delayedCall(0, () => this.askEmail(email));
          return;
        }
        this.save.settings.email = email;
        this.store('メールアドレスを登録しました');
      },
    });
  }

  private askTwitter(initial: string): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: 'Xアカウントの登録',
      label: 'ユーザー名（@は不要）',
      initial,
      maxLength: 60,
      placeholder: 'abyrus_game',
      hint: 'プロフィールのURLを貼り付けてもかまいません。',
      onSubmit: (text) => {
        const handle = parseTwitterHandle(text);
        if (!handle) {
          showToast(this, 'ユーザー名の形式が正しくありません', '#ff8a8a');
          this.time.delayedCall(0, () => this.askTwitter(text.trim()));
          return;
        }
        this.save.settings.twitter = handle;
        this.store('Xアカウントを登録しました');
      },
    });
  }

  private confirmClear(which: 'email' | 'twitter'): void {
    const name = which === 'email' ? 'メールアドレス' : 'Xアカウント';
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: `${name}の解除`,
      message: `登録した${name}を解除しますか？`,
      confirmLabel: '解除する',
      onConfirm: () => {
        this.save.settings[which] = '';
        this.store(`${name}を解除しました`);
      },
    });
  }

  private setVolume(kind: VolumeKind, steps: number): void {
    SettingsSystem.setVolume(this.save, kind, steps);
    this.store();
    if (kind === 'se') SoundSystem.play(this, 'confirm');
  }

  private toggleNotification(kind: NotificationKind): void {
    this.save.settings.notifications[kind] = !this.save.settings.notifications[kind];
    this.store();
  }

  private writeReport(kind: ReportKind): void {
    const bug = kind === 'bug';
    this.modal?.close();
    this.modal = openMessageForm(this, this.scroll, {
      title: bug ? 'バグ報告' : 'お問い合わせ',
      categoryLabel: bug ? '不具合の種類' : 'お問い合わせの種類',
      categories: bug ? BUG_CATEGORIES : INQUIRY_CATEGORIES,
      label: bug ? '状況（何をしたら、どうなりましたか）' : 'お問い合わせ内容',
      placeholder: bug ? '例）ガチャを10連で引いたあと、画面が止まった' : 'ここに入力してください',
      maxLength: REPORT_MAX,
      note: `${bug ? 'バージョン・端末・画面サイズ・プレイヤーIDを自動でつけます。\n' : ''}※ 通信機能の追加前のため、内容はこの端末に保存され、追加後に送信されます。`,
      submitLabel: '送信',
      onSubmit: (category, text) => {
        if (!SettingsSystem.fileReport(this.save, kind, category, text)) return;
        this.store(`${bug ? 'バグ報告' : 'お問い合わせ'}を受け付けました`);
      },
    });
  }

  private openLegal(doc: LegalDocument): void {
    this.modal?.close();
    this.modal = openDocument(this, this.scroll, doc);
  }

  private confirmDelete(): void {
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: 'アカウント削除',
      message: 'この端末のデータ（英雄・所持品・フレンド・設定など）をすべて削除し、最初からにします。\nこの操作は元に戻せません。',
      confirmLabel: '次へ',
      onConfirm: () => this.time.delayedCall(0, () => this.askDeleteWord()),
    });
  }

  /** The last check before everything goes: the player has to type 削除. */
  private askDeleteWord(): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: '本当に削除しますか？',
      label: '確認のため「削除」と入力',
      initial: '',
      maxLength: 4,
      placeholder: '削除',
      hint: '削除すると元には戻せません。',
      onSubmit: (text) => {
        if (text.trim() !== '削除') {
          showToast(this, '「削除」と入力してください', '#ff8a8a');
          return;
        }
        const fresh = SaveSystem.reset();
        this.game.registry.set('save', fresh);
        this.scene.start('Home');
      },
    });
  }
}
