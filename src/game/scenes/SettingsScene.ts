import Phaser from 'phaser';
import { LEGAL_DOCUMENTS, type LegalDocument } from '../data/legal';
import { TRANSFER_TEXT } from '../data/transferText';
import { SaveSystem } from '../systems/SaveSystem';
import {
  APP_VERSION,
  BUG_CATEGORIES,
  BUG_CATEGORY_LABELS,
  INQUIRY_CATEGORIES,
  INQUIRY_CATEGORY_LABELS,
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
import { TransferSystem, formatWhen } from '../systems/TransferSystem';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { openConfirm, openMessageForm, openTextPrompt } from '../ui/Dialogs';
import { openDocument } from '../ui/DocumentViewer';
import { openIssueFlow, openIssued, openRestoreFlow } from '../ui/TransferDialogs';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { copyText } from '../ui/share';
import { body, caption, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';
import { LANGUAGES, getLanguage, setLanguage, t, type Language } from '../i18n';

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
  protected get screenTitle(): string {
    return t('settings.title');
  }
  protected emptyText = '';

  constructor() {
    super('Settings');
  }

  protected buildCards(): InboxCard[] {
    const { settings } = this.save;
    const cards: InboxCard[] = [];
    const guard = () => this.scroll.isTap();

    cards.push(this.languageCard(guard));
    cards.push(this.sectionCard(t('settings.account')));
    cards.push(this.idCard(guard));
    cards.push(
      this.valueCard({
        label: t('settings.playerName'),
        value: this.save.playerName,
        buttons: [{ label: t('common.change'), variant: 'wood', onTap: () => this.askName() }],
        guard,
      }),
    );
    cards.push(
      this.valueCard({
        label: t('settings.email'),
        value: settings.email ? maskEmail(settings.email) : t('settings.notRegistered'),
        muted: !settings.email,
        chip: settings.email ? t('settings.unverified') : undefined,
        note: t('settings.email.note'),
        buttons: settings.email
          ? [
              { label: t('common.change'), variant: 'wood', onTap: () => this.askEmail(settings.email) },
              { label: t('common.release'), variant: 'danger', onTap: () => this.confirmClear('email') },
            ]
          : [{ label: t('common.register'), variant: 'gold', onTap: () => this.askEmail('') }],
        guard,
      }),
    );
    cards.push(
      this.valueCard({
        label: t('settings.x.label'),
        value: settings.twitter ? `@${settings.twitter}` : t('settings.x.notLinked'),
        muted: !settings.twitter,
        chip: settings.twitter ? t('settings.unverified') : undefined,
        note: t('settings.x.note'),
        buttons: settings.twitter
          ? [
              { label: t('common.change'), variant: 'wood', onTap: () => this.askTwitter(settings.twitter) },
              { label: t('common.release'), variant: 'danger', onTap: () => this.confirmClear('twitter') },
            ]
          : [{ label: t('common.register'), variant: 'gold', onTap: () => this.askTwitter('') }],
        guard,
      }),
    );

    cards.push(this.sectionCard(TRANSFER_TEXT.settings.section));
    cards.push(...this.transferCards(guard));

    cards.push(this.sectionCard(t('settings.section.home')));
    cards.push(
      this.valueCard({
        label: t('settings.homeHero.label'),
        value: SaveSystem.getHomeHero(this.save)?.name ?? t('settings.homeHero.notSet'),
        note: t('settings.homeHero.note'),
        buttons: [{ label: t('common.change'), variant: 'wood', onTap: () => this.scene.start('HomeHero', { from: 'Settings' }) }],
        guard,
      }),
    );

    cards.push(this.sectionCard(t('settings.section.sound')));
    cards.push(this.volumeCard('bgm', 'BGM'));
    cards.push(this.volumeCard('se', t('settings.sound.se')));
    cards.push(this.volumeCard('voice', t('settings.sound.voice')));
    cards.push(this.hintCard(t('settings.sound.note')));

    cards.push(this.sectionCard(t('settings.section.notifications')));
    cards.push(this.notificationCard());
    cards.push(this.hintCard(t('settings.notifications.note')));

    cards.push(this.sectionCard(t('settings.section.support')));
    cards.push(this.reportCard('inquiry', t('settings.contact'), t('settings.contact.note')));
    cards.push(this.reportCard('bug', t('settings.bugReport'), t('settings.bugReport.note')));

    cards.push(this.sectionCard(t('settings.section.legal')));
    for (const doc of LEGAL_DOCUMENTS) cards.push(this.linkCard(doc));

    cards.push(this.sectionCard(t('settings.other')));
    cards.push(this.valueCard({ label: t('settings.version'), value: `v${APP_VERSION}`, buttons: [], guard }));
    cards.push(
      this.valueCard({
        label: t('settings.deleteAccount'),
        value: '',
        note: t('settings.deleteAccount.note'),
        buttons: [{ label: t('common.delete'), variant: 'danger', onTap: () => this.confirmDelete() }],
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
    const note = wrappedText(this, PAD + 6, PAD, text, CARD_WIDTH - PAD * 2 - 12, { fontSize: '18px', color: '#cdbb94', lineSpacing: 5 });
    const card = this.shell(note.height + PAD * 2);
    card.container.add(note);
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

  /** 言語 / Language: one button per language, named in its own language (never translated), the one in use lit. Applied at once:
   *  the language is saved, then this screen is rebuilt in it (every other screen is built when it opens). */
  private languageCard(guard: () => boolean): InboxCard {
    const perRow = 3;
    const gap = 10;
    const buttonW = Math.floor((CARD_WIDTH - PAD * 2 - gap * (perRow - 1)) / perRow);
    const rows = Math.ceil(LANGUAGES.length / perRow);
    const height = 58 + rows * 66 + PAD - 6;
    const container = this.add.container(0, 0);
    // i18n-ignore (the language row's label is bilingual on purpose)
    container.add(caption(this, PAD + 4, PAD + 12, '言語 / Language', { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const current = getLanguage();
    LANGUAGES.forEach((lang, i) => {
      const cx = PAD + buttonW / 2 + (i % perRow) * (buttonW + gap);
      const cy = 58 + Math.floor(i / perRow) * 66 + 29 - 6;
      container.add(new Button(this, cx, cy, buttonW, 58, lang.name, () => this.chooseLanguage(lang.code), { variant: lang.code === current ? 'gold' : 'wood', fontSize: '23px', guard }));
    });
    container.addAt(buildCardPanel(this, CARD_WIDTH, height), 0);
    return { container, height };
  }

  private chooseLanguage(code: Language): void {
    if (code === getLanguage()) return;
    this.save.settings.language = code;
    SaveSystem.save(this.save);
    setLanguage(code);
    SoundSystem.play(this, 'confirm');
    this.scene.restart();
  }

  /** データ引き継ぎ: 引き継ぎコードの発行 (発行ずみなら、その日時とコードを見る入口)、と、データを引き継ぐ。 */
  private transferCards(guard: () => boolean): InboxCard[] {
    const T = TRANSFER_TEXT.settings;
    const issued = TransferSystem.lastIssued();
    const cards: InboxCard[] = [
      this.valueCard({
        label: T.issueLabel,
        value: '',
        note: T.issueNote,
        buttons: [{ label: issued ? T.reissueButton : T.issueButton, variant: 'gold', onTap: () => this.issueTransfer() }],
        guard,
      }),
    ];
    if (issued) {
      cards.push(
        this.valueCard({
          label: T.issuedLabel,
          value: T.issued(formatWhen(issued.issuedAt)),
          note: T.issuedNote,
          buttons: [{ label: T.showCodeButton, variant: 'wood', onTap: () => openIssued(this, this.scroll, issued.code, issued.issuedAt, null) }],
          guard,
        }),
      );
    }
    cards.push(
      this.valueCard({
        label: T.restoreLabel,
        value: '',
        note: T.restoreNote,
        buttons: [{ label: T.restoreButton, variant: 'wood', onTap: () => this.restoreTransfer() }],
        guard,
      }),
    );
    return cards;
  }

  /** プレイヤーID: shown big, copyable, never editable. */
  private idCard(guard: () => boolean): InboxCard {
    const card = this.valueCard({
      label: t('settings.playerId'),
      value: formatPlayerId(this.save.social.playerId),
      chip: t('settings.playerId.fixed'),
      buttons: [{ label: t('settings.copy'), variant: 'wood', onTap: () => void this.copyId() }],
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
    container.add(new Button(this, CARD_WIDTH - PAD - offW / 2, rowY, offW, 52, t('settings.mute'), () => this.setVolume(kind, 0), { variant: level === 0 ? 'gold' : 'wood', fontSize: '18px', guard }));
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
      container.add(body(this, PAD + 6, cy, t(NOTIFICATION_LABEL[kind]), { fontSize: '24px', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
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
      const wait = wrappedText(this, PAD + 6, y, t('settings.report.waiting', { waiting }), textW, { fontSize: '16px', color: '#ffb07a' });
      container.add(wait);
      y += wait.height + 4;
    }
    const height = Math.max(96, y + PAD);
    const guard = () => this.scroll.isTap();
    container.add(new Button(this, CARD_WIDTH - PAD - BUTTON_W / 2, height / 2, BUTTON_W, 58, t('settings.write'), () => this.writeReport(kind), { variant: 'gold', fontSize: '23px', guard }));
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
    if (this.scene.isActive()) showToast(this, ok ? t('settings.toast.idCopied') : t('settings.toast.copyFailed'), ok ? '#f0ecff' : '#ff8a8a');
  }

  private issueTransfer(): void {
    this.modal?.close();
    openIssueFlow(this, this.scroll, this.save, () => this.queueRender());
  }

  /** The saved game from another device replaces this one (asked first, since this one has been played). Home reopens with it. */
  private restoreTransfer(): void {
    this.modal?.close();
    openRestoreFlow(this, this.scroll, {
      local: this.save,
      finishTutorial: false,
      onDone: (restored) => {
        this.game.registry.set('save', restored);
        this.scene.start('Home');
      },
    });
  }

  private askName(): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: t('settings.name.title'),
      label: t('settings.playerName'),
      initial: this.save.playerName,
      maxLength: PLAYER_NAME_MAX,
      hint: t('settings.name.hint', { PLAYER_NAME_MAX }),
      onSubmit: (text) => {
        const name = cleanPlayerName(text);
        if (!name) {
          showToast(this, t('settings.name.empty'), '#ff8a8a');
          return;
        }
        this.save.playerName = name;
        this.refreshResources();
        this.store(t('settings.name.changed'));
      },
    });
  }

  private askEmail(initial: string): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: t('settings.email.title'),
      label: t('settings.email'),
      initial,
      maxLength: 100,
      placeholder: 'example@mail.com',
      inputMode: 'email',
      hint: t('settings.email.hint'),
      onSubmit: (text) => {
        const email = text.trim();
        if (!isValidEmail(email)) {
          showToast(this, t('settings.email.invalid'), '#ff8a8a');
          this.time.delayedCall(0, () => this.askEmail(email));
          return;
        }
        this.save.settings.email = email;
        this.store(t('settings.email.registered'));
      },
    });
  }

  private askTwitter(initial: string): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: t('settings.x.title'),
      label: t('settings.x.fieldLabel'),
      initial,
      maxLength: 60,
      placeholder: 'abyrus_game',
      hint: t('settings.x.hint'),
      onSubmit: (text) => {
        const handle = parseTwitterHandle(text);
        if (!handle) {
          showToast(this, t('settings.x.invalid'), '#ff8a8a');
          this.time.delayedCall(0, () => this.askTwitter(text.trim()));
          return;
        }
        this.save.settings.twitter = handle;
        this.store(t('settings.x.registered'));
      },
    });
  }

  private confirmClear(which: 'email' | 'twitter'): void {
    const email = which === 'email';
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: t(email ? 'settings.clear.emailTitle' : 'settings.clear.xTitle'),
      message: t(email ? 'settings.clear.emailMessage' : 'settings.clear.xMessage'),
      confirmLabel: t('settings.clear.confirm'),
      onConfirm: () => {
        this.save.settings[which] = '';
        this.store(t(email ? 'settings.clear.emailDone' : 'settings.clear.xDone'));
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
    // The player picks a translated label; the report stores the matching Japanese category (see SettingsSystem).
    const stored = bug ? BUG_CATEGORIES : INQUIRY_CATEGORIES;
    const labels = (bug ? BUG_CATEGORY_LABELS : INQUIRY_CATEGORY_LABELS).map((key) => t(key));
    this.modal?.close();
    this.modal = openMessageForm(this, this.scroll, {
      title: bug ? t('settings.bugReport') : t('settings.contact'),
      categoryLabel: bug ? t('settings.bugReport.category') : t('settings.contact.category'),
      categories: labels,
      label: bug ? t('settings.bugReport.label') : t('settings.contact.label'),
      placeholder: bug ? t('settings.bugReport.placeholder') : t('settings.contact.placeholder'),
      maxLength: REPORT_MAX,
      note: t(bug ? 'settings.report.noteBug' : 'settings.report.note'),
      submitLabel: t('common.send'),
      onSubmit: (category, text) => {
        if (!SettingsSystem.fileReport(this.save, kind, stored[labels.indexOf(category)] ?? category, text)) return;
        this.store(t(bug ? 'settings.report.bugReceived' : 'settings.report.inquiryReceived'));
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
      title: t('settings.deleteAccount'),
      message: t('settings.deleteAccount.message'),
      confirmLabel: t('common.next'),
      onConfirm: () => this.time.delayedCall(0, () => this.askDeleteWord()),
    });
  }

  /** The last check before everything goes: the player has to type 削除. */
  private askDeleteWord(): void {
    const word = t('settings.delete.word');
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, {
      title: t('settings.delete.areYouSure'),
      label: t('settings.delete.typeToConfirm', { word }),
      initial: '',
      maxLength: Math.max(4, word.length),
      placeholder: word,
      hint: t('settings.delete.hint'),
      onSubmit: (text) => {
        if (text.trim().toUpperCase() !== word.toUpperCase()) {
          showToast(this, t('settings.delete.typeWord', { word }), '#ff8a8a');
          return;
        }
        const fresh = SaveSystem.reset();
        this.game.registry.set('save', fresh);
        this.scene.start('Home');
      },
    });
  }
}
