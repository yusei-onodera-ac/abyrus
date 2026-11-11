import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import { DESCRIPTION_MAX, EMBLEM_COUNT, JOIN_POLICY_LABEL, NAME_MAX, NAME_MIN, type AllianceInvite, type AllianceSummary, type CreateAllianceParams, type JoinPolicy } from '../alliance/AllianceBackend';
import { SaveSystem } from '../systems/SaveSystem';
import { ALLIANCE_CREATE_GEMS } from '../data/alliance';
import type { NavTab } from '../ui/BottomNavBar';
import { Button } from '../ui/Button';
import { wrappedText } from '../ui/CardParts';
import { buildEmblem, policyChip } from '../ui/AllianceParts';
import { openConfirm, openTextPrompt } from '../ui/Dialogs';
import { buildTabStrip } from '../ui/TabStrip';
import { CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { body, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { formatAgo } from '../ui/format';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

type FindTab = 'recommended' | 'search' | 'invites' | 'create';

const CREATE_COST = ALLIANCE_CREATE_GEMS;

/** 同盟を探す: where a player with no 同盟 starts - the ones that suit them, a search by name, the invitations that came
 *  (from friends) and making a new one. A player already in one is sent to its home. */
export class AllianceFindScene extends AllianceScene {
  protected readonly screenTitle = '同盟を探す';
  protected readonly navTab: NavTab = 'friend';
  protected readonly toolbarHeight = 76;
  protected readonly needsAlliance = false;
  protected backTo = 'Friend';

  private tab: FindTab = 'recommended';
  private list?: AllianceSummary[];
  private invites: AllianceInvite[] = [];
  private requested = new Set<string>();
  private searchText = '';
  private joinableOnly = false;
  private form: CreateAllianceParams = { name: '', emblem: 0, description: '', joinPolicy: 'open', minPlayerLevel: 0 };

  constructor() {
    super('AllianceFind');
  }

  init(data?: { tab?: FindTab }): void {
    super.init();
    this.tab = data?.tab ?? 'recommended';
    this.list = undefined;
    this.invites = [];
    this.requested = new Set();
    this.searchText = '';
    this.joinableOnly = false;
    this.form = { name: '', emblem: Math.floor(Math.random() * EMBLEM_COUNT), description: '', joinPolicy: 'open', minPlayerLevel: 0 };
  }

  create(): void {
    super.create();
    void this.loadSide();
    void this.loadTab();
  }

  protected afterLoad(): void {
    // Already in a 同盟 (e.g. an invitation was just accepted): its home is the place to be.
    if (this.detail) this.scene.start('AllianceHome');
  }

  protected buildToolbar(toolbar: Phaser.GameObjects.Container): void {
    const strip = buildTabStrip(
      this,
      [
        { key: 'recommended', label: 'おすすめ' },
        { key: 'search', label: '検索' },
        { key: 'invites', label: '招待', badge: this.invites.length },
        { key: 'create', label: '作成' },
      ],
      this.tab,
      SCREEN_VIEW.w,
      56,
      (key) => {
        this.tab = key as FindTab;
        this.scroll.scrollTo(0);
        void this.loadTab();
        this.queueRender();
      },
    );
    strip.setPosition(0, 10);
    toolbar.add(strip);
  }

  /** My invitations and the 同盟 I have applied to (they change what the cards offer). */
  private async loadSide(): Promise<void> {
    const backend = AllianceService.backend();
    const [invites, mine] = await Promise.all([backend.invites(this.profile), backend.myRequests(this.profile)]);
    if (!this.alive) return;
    if (invites.ok) this.invites = invites.value;
    if (mine.ok) this.requested = new Set(mine.value);
    this.queueRender();
  }

  private async loadTab(): Promise<void> {
    const backend = AllianceService.backend();
    const tab = this.tab;
    if (tab === 'recommended') {
      this.list = undefined;
      const result = await backend.recommended(this.profile);
      if (!this.alive || this.tab !== tab) return;
      this.list = result.ok ? result.value : [];
      this.queueRender();
    } else if (tab === 'search') {
      this.list = undefined;
      const result = await backend.search(this.profile, { text: this.searchText || undefined, joinableOnly: this.joinableOnly, limit: 30 });
      if (!this.alive || this.tab !== tab) return;
      this.list = result.ok ? result.value : [];
      this.queueRender();
    }
  }

  protected cards(): InboxCard[] {
    if (this.tab === 'invites') return this.inviteCards();
    if (this.tab === 'create') return this.createCards();
    const cards: InboxCard[] = [];
    if (this.tab === 'search') cards.push(this.searchCard());
    if (this.list === undefined) {
      cards.push(this.hintCard('探しています…'));
      return cards;
    }
    if (this.list.length === 0) {
      cards.push(this.hintCard(this.tab === 'search' ? '見つかりませんでした。名前の一部だけで探すと、見つかりやすくなります。' : 'いま入れる同盟がありません。「作成」から、自分の同盟を作れます。'));
      return cards;
    }
    for (const summary of this.list) cards.push(this.allianceCard(summary));
    return cards;
  }

  // --- 検索 -------------------------------------------------------------------

  private searchCard(): InboxCard {
    const guard = () => this.scroll.isTap();
    const card = this.shell(164);
    card.container.add(body(this, PAD + 6, 30, '同盟の名前で探す', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    card.container.add(
      new Button(this, CARD_WIDTH / 2, 82, CARD_WIDTH - PAD * 2, 62, this.searchText ? `「${this.searchText}」で検索中（変える）` : '名前を入力して探す', () => this.promptSearch(), { variant: 'gold', fontSize: '24px', guard }),
    );
    const only = this.joinableOnly;
    card.container.add(new Button(this, CARD_WIDTH / 2, 130, CARD_WIDTH - PAD * 2, 36, only ? '✔ 入れる同盟だけ' : '　入れる同盟だけ', () => this.toggleJoinable(), { variant: 'wood', fontSize: '19px', guard }));
    return card;
  }

  private promptSearch(): void {
    this.setModal(
      openTextPrompt(this, this.scroll, {
        title: '同盟を探す',
        label: '同盟名（一部でも可）',
        initial: this.searchText,
        maxLength: NAME_MAX,
        hint: '空にして OK を押すと、すべて出ます',
        onSubmit: (text) => {
          this.searchText = text.trim();
          void this.loadTab();
          this.queueRender();
        },
      }),
    );
  }

  private toggleJoinable(): void {
    this.joinableOnly = !this.joinableOnly;
    void this.loadTab();
    this.queueRender();
  }

  // --- 一覧のカード --------------------------------------------------------------

  /** One 同盟 in a list: emblem, name, numbers, rules and the button that says what can be done. */
  private allianceCard(a: AllianceSummary): InboxCard {
    const guard = () => this.scroll.isTap();
    const card = this.shell(158);
    card.container.add(buildEmblem(this, PAD + 52, 79, 92, a.emblem));
    const x = PAD + 118;
    card.container.add(body(this, x, 30, a.name, { fontSize: '28px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, x, 62, `Lv.${a.level}　${a.memberCount} / ${a.memberMax}人　同盟長 ${a.leaderName}`, '#f5e6c8', 19);
    const chip = policyChip(this, x, 94, a.joinPolicy);
    card.container.add(chip.container);
    this.line(card, x + chip.width + 10, 94, a.minPlayerLevel > 0 ? `プレイヤーLv.${a.minPlayerLevel}以上` : '条件なし', '#cdbb94', 17);
    const desc = wrappedText(this, x, 114, a.description || '（説明はありません）', CARD_WIDTH - x - PAD - 4, { fontSize: '16px', color: '#9a8a6a' });
    if (desc.height > 36) desc.setCrop(0, 0, desc.width, 36);
    card.container.add(desc);

    const mine = this.profile;
    const applied = this.requested.has(a.id);
    const full = a.memberCount >= a.memberMax;
    const low = mine.level < a.minPlayerLevel;
    let label = a.joinPolicy === 'open' ? '参加する' : '申請する';
    let enabled = true;
    if (applied) label = '申請中';
    else if (a.joinPolicy === 'invite') {
      label = '招待のみ';
      enabled = false;
    } else if (full) {
      label = '満員';
      enabled = false;
    } else if (low) {
      label = `Lv.${a.minPlayerLevel}必要`;
      enabled = false;
    }
    const button = new Button(this, CARD_WIDTH - PAD - 80, 44, 150, 60, label, () => (applied ? this.cancelRequest(a) : this.askJoin(a)), {
      variant: applied ? 'wood' : 'gold',
      fontSize: label.length > 4 ? '20px' : '24px',
      guard,
    });
    button.setEnabled(enabled || applied);
    card.container.add(button);
    return card;
  }

  private askJoin(a: AllianceSummary): void {
    this.setModal(
      openConfirm(this, this.scroll, {
        title: a.joinPolicy === 'open' ? '同盟に参加' : '参加を申請',
        message: a.joinPolicy === 'open' ? `「${a.name}」に参加しますか？\n（抜けてから24時間は、別の同盟に入れません）` : `「${a.name}」に参加を申請しますか？\n同盟長や幹部が承認すると参加できます。`,
        confirmLabel: a.joinPolicy === 'open' ? '参加する' : '申請する',
        confirmVariant: 'gold',
        onConfirm: () => void this.join(a),
      }),
    );
  }

  private async join(a: AllianceSummary): Promise<void> {
    await this.run(AllianceService.backend().join(this.profile, a.id), async (outcome) => {
      if (outcome === 'joined') {
        await AllianceService.refresh(this.save);
        showToast(this, `「${a.name}」に参加しました`);
        this.scene.start('AllianceHome');
      } else {
        this.requested.add(a.id);
        showToast(this, '申請しました。承認を待ちましょう');
      }
    });
    this.queueRender();
  }

  private async cancelRequest(a: AllianceSummary): Promise<void> {
    await this.run(AllianceService.backend().cancelRequest(this.profile, a.id), () => {
      this.requested.delete(a.id);
      showToast(this, '申請を取り消しました');
    });
    this.queueRender();
  }

  // --- 招待 ---------------------------------------------------------------------

  private inviteCards(): InboxCard[] {
    const guard = () => this.scroll.isTap();
    if (this.invites.length === 0) return [this.hintCard('招待は届いていません。\nフレンドが同盟に入っていると、招待が届きます。')];
    const now = Date.now();
    return this.invites.map((invite) => {
      const card = this.shell(124, true);
      card.container.add(buildEmblem(this, PAD + 40, 62, 70, invite.emblem));
      const x = PAD + 96;
      card.container.add(body(this, x, 34, invite.allianceName, { fontSize: '26px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      this.line(card, x, 72, `${invite.fromName}さんからの招待　${formatAgo(invite.at, now)}`, '#d8c49a', 17);
      card.container.add(new Button(this, CARD_WIDTH - PAD - 178, 62, 104, 54, '参加', () => void this.answerInvite(invite, true), { variant: 'gold', fontSize: '22px', guard }));
      card.container.add(new Button(this, CARD_WIDTH - PAD - 56, 62, 104, 54, '断る', () => void this.answerInvite(invite, false), { variant: 'wood', fontSize: '22px', guard }));
      return card;
    });
  }

  private async answerInvite(invite: AllianceInvite, accept: boolean): Promise<void> {
    const backend = AllianceService.backend();
    await this.run(accept ? backend.acceptInvite(this.profile, invite.allianceId) : backend.declineInvite(this.profile, invite.allianceId), async () => {
      this.invites = this.invites.filter((i) => i.allianceId !== invite.allianceId);
      if (accept) {
        await AllianceService.refresh(this.save);
        showToast(this, `「${invite.allianceName}」に参加しました`);
        this.scene.start('AllianceHome');
      } else showToast(this, '招待を断りました');
    });
    this.queueRender();
  }

  // --- 作成 ---------------------------------------------------------------------

  private createCards(): InboxCard[] {
    const guard = () => this.scroll.isTap();
    const f = this.form;
    const save = this.save;
    const cards: InboxCard[] = [];

    // 名前と説明
    const text = this.shell(236, true);
    text.container.add(body(this, PAD + 6, 30, '同盟の名前', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    text.container.add(new Button(this, CARD_WIDTH / 2, 82, CARD_WIDTH - PAD * 2, 62, f.name || `名前を決める（${NAME_MIN}〜${NAME_MAX}文字）`, () => this.promptName(), { variant: f.name ? 'wood' : 'gold', fontSize: '26px', guard }));
    text.container.add(body(this, PAD + 6, 138, '同盟の説明', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    text.container.add(new Button(this, CARD_WIDTH / 2, 190, CARD_WIDTH - PAD * 2, 62, f.description || `ひとこと（${DESCRIPTION_MAX}文字まで・なくてもよい）`, () => this.promptDescription(), { variant: 'wood', fontSize: '21px', guard }));
    cards.push(text);

    // 紋章
    const emblemCard = this.shell(96 + Math.ceil(EMBLEM_COUNT / 6) * 100);
    emblemCard.container.add(body(this, PAD + 6, 30, '紋章', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    for (let i = 0; i < EMBLEM_COUNT; i++) {
      const cx = PAD + 56 + (i % 6) * 100;
      const cy = 100 + Math.floor(i / 6) * 100;
      const on = f.emblem === i;
      const frame = this.add.graphics();
      frame.fillStyle(on ? 0x4a3418 : 0x1c1309, 1);
      frame.fillRoundedRect(cx - 44, cy - 44, 88, 88, 12);
      frame.lineStyle(on ? 4 : 2, on ? CHROME.brassBright : CHROME.brassDark, 1);
      frame.strokeRoundedRect(cx - 44, cy - 44, 88, 88, 12);
      emblemCard.container.add(frame);
      emblemCard.container.add(buildEmblem(this, cx, cy, 68, i));
      const hit = this.add.zone(cx, cy, 88, 88).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (!guard()) return;
        f.emblem = i;
        this.queueRender();
      });
      emblemCard.container.add(hit);
    }
    cards.push(emblemCard);

    // 参加方式と条件
    const rules = this.shell(268);
    rules.container.add(body(this, PAD + 6, 30, '参加のしかた', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    (['open', 'approval', 'invite'] as JoinPolicy[]).forEach((policy, i) => {
      const w = (CARD_WIDTH - PAD * 2 - 20) / 3;
      rules.container.add(
        new Button(this, PAD + w / 2 + i * (w + 10), 84, w, 62, JOIN_POLICY_LABEL[policy], () => {
          f.joinPolicy = policy;
          this.queueRender();
        }, { variant: f.joinPolicy === policy ? 'gold' : 'wood', fontSize: '23px', guard }),
      );
    });
    this.line(rules, PAD + 6, 132, f.joinPolicy === 'open' ? 'だれでも、すぐに入れます' : f.joinPolicy === 'approval' ? '申請を、同盟長や幹部が承認します' : '招待したフレンドだけが入れます', '#cdbb94', 18);
    rules.container.add(body(this, PAD + 6, 180, '参加できるプレイヤーLv', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const step = (delta: number, x: number, label: string): void => {
      rules.container.add(
        new Button(this, x, 232, 70, 56, label, () => {
          f.minPlayerLevel = Phaser.Math.Clamp(f.minPlayerLevel + delta, 0, 50);
          this.queueRender();
        }, { variant: 'wood', fontSize: '20px', guard }),
      );
    };
    step(-10, PAD + 50, '-10');
    step(-1, PAD + 130, '-1');
    rules.container.add(body(this, CARD_WIDTH / 2, 232, f.minPlayerLevel > 0 ? `Lv.${f.minPlayerLevel}以上` : '条件なし', { fontSize: '28px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    step(1, CARD_WIDTH - PAD - 130, '+1');
    step(10, CARD_WIDTH - PAD - 50, '+10');
    cards.push(rules);

    // 作成
    const gems = save.gems;
    const valid = Array.from(f.name.trim()).length >= NAME_MIN;
    const make = this.shell(150, true);
    make.container.add(body(this, PAD + 6, 34, `必要な魔晶石　${CREATE_COST.toLocaleString('ja-JP')}個（いま ${gems.toLocaleString('ja-JP')}個）`, { fontSize: '22px', fontStyle: 'bold', color: gems >= CREATE_COST ? '#ffe9b8' : '#ff9a8a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const button = new Button(this, CARD_WIDTH / 2, 98, CARD_WIDTH - PAD * 2, 70, valid ? '同盟を作る' : '名前を決めてください', () => this.askCreate(), { variant: 'gold', fontSize: '30px', guard });
    button.setEnabled(valid && gems >= CREATE_COST);
    make.container.add(button);
    cards.push(make);
    return cards;
  }

  private promptName(): void {
    this.setModal(
      openTextPrompt(this, this.scroll, {
        title: '同盟の名前',
        label: '同盟名',
        initial: this.form.name,
        maxLength: NAME_MAX,
        hint: `${NAME_MIN}〜${NAME_MAX}文字`,
        onSubmit: (text) => {
          this.form.name = text.trim();
          this.queueRender();
        },
      }),
    );
  }

  private promptDescription(): void {
    this.setModal(
      openTextPrompt(this, this.scroll, {
        title: '同盟の説明',
        label: '説明',
        initial: this.form.description,
        maxLength: DESCRIPTION_MAX,
        hint: `${DESCRIPTION_MAX}文字まで。空でもかまいません`,
        onSubmit: (text) => {
          this.form.description = text.trim();
          this.queueRender();
        },
      }),
    );
  }

  private askCreate(): void {
    const f = this.form;
    this.setModal(
      openConfirm(this, this.scroll, {
        title: '同盟を作る',
        message: `「${f.name}」を作ります。\n魔晶石 ${CREATE_COST}個を使います。`,
        confirmLabel: '作る',
        confirmVariant: 'gold',
        onConfirm: () => void this.create2(),
      }),
    );
  }

  private async create2(): Promise<void> {
    const f = this.form;
    await this.run(
      AllianceService.create(this.save, { ...f, name: f.name.trim(), description: f.description.trim() }),
      (summary) => {
        SaveSystem.save(this.save);
        showToast(this, `同盟「${summary.name}」を作りました`);
        this.scene.start('AllianceHome');
      },
      false,
    );
  }
}
