import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import { JOIN_POLICY_LABEL, LEAGUE_LABEL, type AllianceDetail, type JoinPolicy } from '../alliance/AllianceBackend';
import type { NavTab } from '../ui/BottomNavBar';
import { Button } from '../ui/Button';
import { buildUnreadDot, wrappedText } from '../ui/CardParts';
import { buildBar, buildEmblem, fullDigits, policyChip, timeLeft } from '../ui/AllianceParts';
import { openConfirm, openTextPrompt } from '../ui/Dialogs';
import { openModal } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, heading, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { DESCRIPTION_MAX } from '../alliance/AllianceBackend';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

/** 同盟ホーム: the alliance at a glance - its level and what that gives, this week's boss, the 対抗戦, the 助っ人, and the
 *  doors to the rest (メンバー / 寄付 / ショップ / チャット / 設定). A red dot marks what is waiting. */
export class AllianceHomeScene extends AllianceScene {
  protected readonly screenTitle = '同盟';
  protected readonly navTab: NavTab = 'friend';
  protected backTo = 'Friend';

  /** Description / rules being edited in the settings popup. */
  private draft?: { description: string; joinPolicy: JoinPolicy; minPlayerLevel: number };

  constructor() {
    super('AllianceHome');
  }

  init(): void {
    super.init();
    this.draft = undefined;
  }

  protected cards(detail: AllianceDetail | null): InboxCard[] {
    if (!detail) return [this.hintCard('同盟に入っていません。')];
    return [this.headerCard(detail), this.raidCard(detail), this.warCard(detail), this.helperCard(detail), this.menuCard(detail)];
  }

  // --- 同盟の顔 ---------------------------------------------------------------------

  private headerCard(d: AllianceDetail): InboxCard {
    const s = d.summary;
    const perks = d.perks;
    const next = d.nextPerks;
    const card = this.shell(300, true);
    card.container.add(buildEmblem(this, PAD + 62, 78, 112, s.emblem));
    const x = PAD + 140;
    card.container.add(heading(this, x, 36, s.name, { fontSize: '34px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    card.container.add(body(this, x, 76, `同盟Lv.${s.level}`, { fontSize: '28px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    const chip = policyChip(this, x, 112, s.joinPolicy);
    card.container.add(chip.container);
    this.line(card, x + chip.width + 10, 112, `${s.memberCount} / ${s.memberMax}人`, '#f5e6c8', 19);

    // EXP
    const barX = PAD + 6;
    const barW = CARD_WIDTH - PAD * 2 - 12;
    const need = d.expToNext;
    card.container.add(buildBar(this, barX, 152, barW, 20, need ? d.exp / need : 1, 0x3a7fd6));
    this.line(card, barX, 190, need ? `同盟EXP ${fullDigits(d.exp)} / ${fullDigits(need)}　（寄付でためる）` : '同盟Lv 最大', '#cdbb94', 18);

    // 恩恵
    const perkLine = (label: string, now: string, then?: string): string => `${label} ${now}${then && then !== now ? `　→ ${then}` : ''}`;
    const pct = (v: number): string => `+${Math.round(v * 100)}%`;
    const lines = [
      perkLine('放置ゴールド', pct(perks.idleGoldBonus), next ? pct(next.idleGoldBonus) : undefined),
      perkLine('経験値素材', pct(perks.expDropBonus), next ? pct(next.expDropBonus) : undefined),
      perkLine('スタミナ上限', `+${perks.staminaMaxBonus}`, next ? `+${next.staminaMaxBonus}` : undefined),
      perkLine('ボス挑戦', `${perks.raidAttemptsPerDay}回/日`, next ? `${next.raidAttemptsPerDay}回/日` : undefined),
    ];
    card.container.add(body(this, PAD + 6, 222, `メンバー全員の恩恵${next ? '（右は次のLv）' : ''}`, { fontSize: '18px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    lines.forEach((text, i) => this.line(card, PAD + 6 + (i % 2) * (barW / 2), 252 + Math.floor(i / 2) * 28, text, '#f5e6c8', 17));
    return card;
  }

  // --- 今週のボス ---------------------------------------------------------------------

  private raidCard(d: AllianceDetail): InboxCard {
    const guard = () => this.scroll.isTap();
    const r = d.raid;
    const hot = r.attemptsLeft > 0 || !!r.claimable;
    const card = this.shell(196, hot);
    card.container.add(body(this, PAD + 6, 28, '今週の共闘ボス', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    card.container.add(body(this, PAD + 6, 66, r.boss.name, { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    const done = r.defeatedAt !== null;
    const ratio = r.maxHp > 0 ? r.hp / r.maxHp : 0;
    card.container.add(buildBar(this, PAD + 6, 96, CARD_WIDTH - PAD * 2 - 12, 22, done ? 0 : ratio, 0xc0392b));
    this.line(card, PAD + 6, 134, done ? '撃破しました！' : `残りHP ${Math.max(1, Math.ceil(ratio * 100))}%　${timeLeft(r.endsAt, d.now)}`, done ? '#9fe39f' : '#f5e6c8', 19);
    this.line(card, PAD + 6, 164, `今日の挑戦 あと${r.attemptsLeft}回　自分のダメージ ${fullDigits(r.myDamage)}`, '#cdbb94', 17);
    const button = new Button(this, CARD_WIDTH - PAD - 90, 150, 170, 62, r.claimable ? '報酬あり' : '挑戦へ', () => this.scene.start('AllianceRaid'), { variant: 'gold', fontSize: '26px', guard });
    card.container.add(button);
    if (hot) card.container.add(buildUnreadDot(this, CARD_WIDTH - PAD - 10, 124, 9));
    return card;
  }

  // --- 対抗戦 ------------------------------------------------------------------------

  private warCard(d: AllianceDetail): InboxCard {
    const guard = () => this.scroll.isTap();
    const w = d.war;
    const card = this.shell(150, !!w.claimable);
    card.container.add(body(this, PAD + 6, 28, `同盟対抗戦　${LEAGUE_LABEL[w.league]}リーグ`, { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    card.container.add(body(this, PAD + 6, 72, `${w.rank}位　${fullDigits(w.points)}ポイント`, { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 116, w.claimable ? '前のシーズンの報酬があります' : `${timeLeft(w.endsAt, d.now)}で、今シーズンが終わります`, w.claimable ? '#9fe39f' : '#cdbb94', 18);
    card.container.add(new Button(this, CARD_WIDTH - PAD - 90, 80, 170, 62, '対抗戦へ', () => this.scene.start('AllianceWar'), { variant: 'wood', fontSize: '24px', guard }));
    if (w.claimable) card.container.add(buildUnreadDot(this, CARD_WIDTH - PAD - 10, 52, 9));
    return card;
  }

  // --- 助っ人 ------------------------------------------------------------------------

  private helperCard(d: AllianceDetail): InboxCard {
    const guard = () => this.scroll.isTap();
    const h = d.me.helper;
    const card = this.shell(150, d.support.receivable > 0);
    card.container.add(body(this, PAD + 6, 28, '助っ人と支援', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    card.container.add(body(this, PAD + 6, 72, h ? `${h.name}　Lv.${h.level}` : '助っ人が、まだ決まっていません', { fontSize: '27px', fontStyle: 'bold', color: h ? '#ffe9b8' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 116, d.support.receivable > 0 ? `贈られたスタミナ ${d.support.receivable}　受け取れます` : '助っ人を決めると、仲間が借りてくれます', d.support.receivable > 0 ? '#9fe39f' : '#cdbb94', 18);
    card.container.add(new Button(this, CARD_WIDTH - PAD - 90, 80, 170, 62, '助っ人へ', () => this.scene.start('AllianceHelper'), { variant: 'wood', fontSize: '24px', guard }));
    if (d.support.receivable > 0) card.container.add(buildUnreadDot(this, CARD_WIDTH - PAD - 10, 52, 9));
    return card;
  }

  // --- メニュー -----------------------------------------------------------------------

  private menuCard(d: AllianceDetail): InboxCard {
    const guard = () => this.scroll.isTap();
    const card = this.shell(236);
    card.container.add(body(this, PAD + 6, 28, 'メニュー', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const items: { label: string; onTap: () => void; dot?: boolean }[] = [
      { label: 'メンバー', onTap: () => this.scene.start('AllianceMembers'), dot: d.requests.length > 0 },
      { label: '寄付', onTap: () => this.scene.start('AllianceDonate') },
      { label: 'ショップ', onTap: () => this.scene.start('AllianceShop') },
      { label: 'チャット', onTap: () => this.scene.start('AllianceChat') },
      { label: '設定', onTap: () => this.openSettings(d) },
    ];
    const cols = 3;
    const w = (CARD_WIDTH - PAD * 2 - 20) / cols;
    items.forEach((item, i) => {
      const cx = PAD + w / 2 + (i % cols) * (w + 10);
      const cy = 88 + Math.floor(i / cols) * 76;
      card.container.add(new Button(this, cx, cy, w, 64, item.label, item.onTap, { variant: 'wood', fontSize: '24px', guard }));
      if (item.dot) card.container.add(buildUnreadDot(this, cx + w / 2 - 8, cy - 26, 9));
    });
    return card;
  }

  // --- 設定 (leader) と 脱退 ---------------------------------------------------------------

  private openSettings(d: AllianceDetail): void {
    const isLeader = d.me.role === 'leader';
    const s = d.summary;
    this.draft = { description: s.description, joinPolicy: s.joinPolicy, minPlayerLevel: s.minPlayerLevel };
    const handle = openModal(this, this.scroll, 0.75, true);
    this.setModal(handle);
    const panel = handle.container;
    const w = 620;
    const h = isLeader ? 760 : 380;
    const cy = 640;
    const top = cy - h / 2;
    panel.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
    panel.add(this.add.zone(360, cy, w, h).setInteractive());
    panel.add(heading(this, 360, top + 46, '同盟の設定', { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));

    let y = top + 100;
    if (isLeader) {
      const draft = this.draft;
      panel.add(body(this, 360 - w / 2 + 40, y, '説明', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const desc = wrappedText(this, 360 - w / 2 + 40, y + 20, draft.description || '（なし）', w - 80, { fontSize: '18px', color: '#f5e6c8' });
      panel.add(desc);
      y += 20 + Math.min(desc.height, 60) + 20;
      panel.add(new Button(this, 360, y + 28, w - 80, 56, '説明を書き換える', () => this.promptDescription(d), { variant: 'wood', fontSize: '22px' }));
      y += 100;
      panel.add(body(this, 360 - w / 2 + 40, y, '参加のしかた', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      y += 46;
      const bw = (w - 80 - 20) / 3;
      (['open', 'approval', 'invite'] as JoinPolicy[]).forEach((policy, i) => {
        panel.add(
          new Button(this, 360 - (w - 80) / 2 + bw / 2 + i * (bw + 10), y + 28, bw, 56, JOIN_POLICY_LABEL[policy], () => {
            draft.joinPolicy = policy;
            this.openSettings(d);
          }, { variant: draft.joinPolicy === policy ? 'gold' : 'wood', fontSize: '21px' }),
        );
      });
      y += 100;
      panel.add(body(this, 360 - w / 2 + 40, y, '参加できるプレイヤーLv', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      y += 52;
      const step = (delta: number, x: number, label: string): void => {
        panel.add(
          new Button(this, x, y + 24, 76, 52, label, () => {
            draft.minPlayerLevel = Phaser.Math.Clamp(draft.minPlayerLevel + delta, 0, 50);
            this.openSettings(d);
          }, { variant: 'wood', fontSize: '20px' }),
        );
      };
      step(-10, 360 - 230, '-10');
      step(-1, 360 - 140, '-1');
      panel.add(body(this, 360, y + 24, draft.minPlayerLevel > 0 ? `Lv.${draft.minPlayerLevel}以上` : '条件なし', { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
      step(1, 360 + 140, '+1');
      step(10, 360 + 230, '+10');
      y += 100;
      panel.add(new Button(this, 360, y + 30, w - 80, 62, '設定を保存', () => void this.saveSettings(), { variant: 'gold', fontSize: '26px' }));
      y += 90;
    }
    const lower = top + h - 52;
    panel.add(new Button(this, 360 - 150, lower - 70, 280, 58, isLeader ? '同盟を解散' : '同盟を抜ける', () => (isLeader ? this.askDisband(d) : this.askLeave(d)), { variant: 'danger', fontSize: '22px' }));
    if (isLeader && d.members.length > 1) panel.add(new Button(this, 360 + 150, lower - 70, 280, 58, '同盟長をゆずる', () => this.scene.start('AllianceMembers'), { variant: 'wood', fontSize: '22px' }));
    panel.add(new Button(this, 360, lower, 240, 60, '閉じる', () => handle.close(), { variant: 'wood', fontSize: '24px' }));
    void y;
  }

  private promptDescription(d: AllianceDetail): void {
    this.setModal(
      openTextPrompt(this, this.scroll, {
        title: '同盟の説明',
        label: '説明',
        initial: this.draft?.description ?? '',
        maxLength: DESCRIPTION_MAX,
        onSubmit: (text) => {
          if (this.draft) this.draft.description = text.trim();
          this.openSettings(d);
        },
      }),
    );
  }

  private async saveSettings(): Promise<void> {
    const draft = this.draft;
    if (!draft) return;
    this.closeModal();
    await this.run(AllianceService.backend().updateSettings(this.profile, { description: draft.description, joinPolicy: draft.joinPolicy, minPlayerLevel: draft.minPlayerLevel }), () => showToast(this, '設定を保存しました'));
  }

  private askLeave(d: AllianceDetail): void {
    this.setModal(
      openConfirm(this, this.scroll, {
        title: '同盟を抜ける',
        message: `「${d.summary.name}」を抜けますか？\n抜けてから24時間は、別の同盟に入れません。`,
        confirmLabel: '抜ける',
        onConfirm: () => void this.leave(),
      }),
    );
  }

  private async leave(): Promise<void> {
    await this.run(AllianceService.backend().leave(this.profile), async () => {
      await AllianceService.refresh(this.save);
      showToast(this, '同盟を抜けました');
      this.scene.start('AllianceFind');
    }, false);
  }

  private askDisband(d: AllianceDetail): void {
    this.setModal(
      openConfirm(this, this.scroll, {
        title: '同盟を解散',
        message: `「${d.summary.name}」を解散しますか？\nメンバー全員が抜けます。元には戻せません。`,
        confirmLabel: '解散する',
        onConfirm: () => void this.disband(),
      }),
    );
  }

  private async disband(): Promise<void> {
    await this.run(AllianceService.backend().disband(this.profile), async () => {
      await AllianceService.refresh(this.save);
      showToast(this, '同盟を解散しました');
      this.scene.start('AllianceFind');
    }, false);
  }
}
