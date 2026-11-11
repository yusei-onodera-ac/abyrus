import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import { ALLIANCE_ROLE_LABEL, type AllianceDetail, type AllianceMember, type AllianceRequest, type AllianceRole } from '../alliance/AllianceBackend';
import { SaveSystem } from '../systems/SaveSystem';
import { SocialSystem } from '../systems/SocialSystem';
import { Button } from '../ui/Button';
import { buildAvatar } from '../ui/CardParts';
import { fullDigits, roleChip } from '../ui/AllianceParts';
import { openConfirm } from '../ui/Dialogs';
import { openModal } from '../ui/Modal';
import { createDivider, createPanel } from '../ui/Panel';
import { CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { buildTabStrip } from '../ui/TabStrip';
import { body, heading, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { formatAgo } from '../ui/format';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

type MembersTab = 'members' | 'requests' | 'invite';

const ROLE_ORDER: Record<AllianceRole, number> = { leader: 0, officer: 1, member: 2 };

/** メンバー: who is in the 同盟 (role, Lv, power, this week's part), with what the player may do to each; the 申請 waiting for an
 *  answer (幹部以上) and the フレンド to 招待. */
export class AllianceMembersScene extends AllianceScene {
  protected readonly screenTitle = '同盟メンバー';
  protected readonly navTab = null;
  protected readonly toolbarHeight = 76;

  private tab: MembersTab = 'members';
  private invited = new Set<string>();

  constructor() {
    super('AllianceMembers');
  }

  init(data?: { tab?: MembersTab }): void {
    super.init();
    this.tab = data?.tab ?? 'members';
    this.invited = new Set();
  }

  protected buildToolbar(toolbar: Phaser.GameObjects.Container): void {
    const d = this.detail;
    const manage = !!d && d.me.role !== 'member';
    const tabs = [{ key: 'members', label: 'メンバー' }];
    if (manage) tabs.push({ key: 'requests', label: `申請`, badge: d.requests.length } as { key: string; label: string; badge?: number });
    if (manage) tabs.push({ key: 'invite', label: '招待' });
    if (tabs.length === 1) return;
    const strip = buildTabStrip(this, tabs, this.tab, SCREEN_VIEW.w, 56, (key) => {
      this.tab = key as MembersTab;
      this.scroll.scrollTo(0);
      this.queueRender();
    });
    strip.setPosition(0, 10);
    toolbar.add(strip);
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    if (this.tab === 'requests' && d.me.role !== 'member') return this.requestCards(d);
    if (this.tab === 'invite' && d.me.role !== 'member') return this.inviteCards(d);
    const sorted = [...d.members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.weekContribution - a.weekContribution);
    return [this.sectionCard(`メンバー　${d.members.length} / ${d.summary.memberMax}人`), ...sorted.map((m) => this.memberCard(d, m))];
  }

  // --- メンバー -------------------------------------------------------------------

  private memberCard(d: AllianceDetail, m: AllianceMember): InboxCard {
    const mine = m.uid === d.me.uid;
    const card = this.shell(122, mine);
    card.container.add(buildAvatar(this, PAD + 36, 61, 32, m.name));
    const x = PAD + 86;
    const name = body(this, x, 30, m.name, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    card.container.add(name);
    card.container.add(roleChip(this, x + name.width + 10, 30, m.role).container);
    this.line(card, x, 62, `Lv.${m.level}　総合力 ${fullDigits(m.power)}`, '#f5e6c8', 18);
    this.line(card, x, 92, `今週の貢献 ${fullDigits(m.weekContribution)}　${mine ? 'いま' : formatAgo(m.lastActiveAt)}`, '#cdbb94', 16);
    const guard = () => this.scroll.isTap();
    const hit = this.add.zone(CARD_WIDTH / 2, 61, CARD_WIDTH, 122).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (guard()) this.openMember(d, m);
    });
    card.container.add(hit);
    return card;
  }

  /** What the viewer may do to `m` (leader: everything; 幹部: remove plain members). */
  private openMember(d: AllianceDetail, m: AllianceMember): void {
    const mine = m.uid === d.me.uid;
    const myRole = d.me.role;
    const handle = openModal(this, this.scroll, 0.75, true);
    this.setModal(handle);
    const panel = handle.container;
    const w = 600;
    const actions: { label: string; variant: 'gold' | 'wood' | 'danger'; onTap: () => void }[] = [];
    if (!mine) {
      const friend = this.save.social.friends.some((f) => f.id === m.uid);
      if (!friend) actions.push({ label: 'フレンド申請', variant: 'wood', onTap: () => this.requestFriend(m) });
      if (myRole === 'leader') {
        actions.push({ label: m.role === 'officer' ? '幹部をやめさせる' : '幹部にする', variant: 'wood', onTap: () => void this.setRole(m, m.role === 'officer' ? 'member' : 'officer') });
        actions.push({ label: '同盟長をゆずる', variant: 'wood', onTap: () => this.askTransfer(m) });
      }
      if ((myRole === 'leader' && m.role !== 'leader') || (myRole === 'officer' && m.role === 'member')) actions.push({ label: '除名する', variant: 'danger', onTap: () => this.askKick(m) });
    }
    const h = 330 + actions.length * 76;
    const cy = 640;
    const top = cy - h / 2;
    panel.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
    panel.add(this.add.zone(360, cy, w, h).setInteractive());
    panel.add(buildAvatar(this, 360, top + 70, 44, m.name));
    panel.add(heading(this, 360, top + 140, m.name, { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    const rows: [string, string][] = [
      ['役職', ALLIANCE_ROLE_LABEL[m.role]],
      ['レベル / 総合力', `Lv.${m.level}　${fullDigits(m.power)}`],
      ['今週のボスダメージ', fullDigits(m.weekDamage)],
      ['これまでの貢献', fullDigits(m.contribution)],
    ];
    rows.forEach(([label, value], i) => {
      const y = top + 190 + i * 38;
      if (i > 0) panel.add(createDivider(this, 360, y - 19, w - 70, CHROME.brassDark));
      panel.add(body(this, 360 - w / 2 + 40, y, label, { fontSize: '19px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      panel.add(body(this, 360 + w / 2 - 40, y, value, { fontSize: '21px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    });
    let y = top + 190 + rows.length * 38 + 30;
    for (const action of actions) {
      panel.add(
        new Button(this, 360, y + 30, w - 100, 62, action.label, () => {
          handle.close();
          action.onTap();
        }, { variant: action.variant, fontSize: '23px' }),
      );
      y += 76;
    }
    panel.add(new Button(this, 360, top + h - 44, 220, 56, '閉じる', () => handle.close(), { variant: 'wood', fontSize: '22px' }));
  }

  private requestFriend(m: AllianceMember): void {
    const result = SocialSystem.sendRequest(this.save.social, m.uid);
    if (!result.ok) {
      const reasons: Record<string, string> = { invalid: 'IDが正しくありません', self: '自分には申請できません', already_friend: 'すでにフレンドです', already_requested: 'すでに申請済みです', friends_full: 'フレンドが上限です', too_many_requests: '申請中の数が上限です' };
      showToast(this, reasons[result.reason] ?? '申請できませんでした', '#ff8a8a');
      return;
    }
    SaveSystem.save(this.save);
    showToast(this, `${m.name}にフレンド申請しました`);
  }

  private async setRole(m: AllianceMember, role: 'officer' | 'member'): Promise<void> {
    await this.run(AllianceService.backend().setRole(this.profile, m.uid, role), () => showToast(this, role === 'officer' ? `${m.name}を幹部にしました` : `${m.name}を幹部から外しました`));
  }

  private askTransfer(m: AllianceMember): void {
    this.setModal(
      openConfirm(this, this.scroll, {
        title: '同盟長をゆずる',
        message: `${m.name}に、同盟長をゆずりますか？\nあなたは幹部になります。`,
        confirmLabel: 'ゆずる',
        confirmVariant: 'gold',
        onConfirm: () => void this.run(AllianceService.backend().transferLeader(this.profile, m.uid), () => showToast(this, `${m.name}が同盟長になりました`)),
      }),
    );
  }

  private askKick(m: AllianceMember): void {
    this.setModal(
      openConfirm(this, this.scroll, {
        title: '除名',
        message: `${m.name}を同盟から外しますか？`,
        confirmLabel: '除名する',
        onConfirm: () => void this.run(AllianceService.backend().kick(this.profile, m.uid), () => showToast(this, `${m.name}を除名しました`)),
      }),
    );
  }

  // --- 申請 -------------------------------------------------------------------------

  private requestCards(d: AllianceDetail): InboxCard[] {
    if (d.requests.length === 0) return [this.hintCard('参加の申請は、来ていません。')];
    const now = Date.now();
    const guard = () => this.scroll.isTap();
    return d.requests.map((r: AllianceRequest) => {
      const card = this.shell(118, true);
      card.container.add(buildAvatar(this, PAD + 34, 59, 30, r.name));
      const x = PAD + 80;
      card.container.add(body(this, x, 34, r.name, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      this.line(card, x, 72, `Lv.${r.level}　総合力 ${fullDigits(r.power)}　${formatAgo(r.at, now)}`, '#d8c49a', 17);
      card.container.add(new Button(this, CARD_WIDTH - PAD - 178, 59, 104, 54, '承認', () => void this.resolve(r, true), { variant: 'gold', fontSize: '22px', guard }));
      card.container.add(new Button(this, CARD_WIDTH - PAD - 56, 59, 104, 54, '却下', () => void this.resolve(r, false), { variant: 'wood', fontSize: '22px', guard }));
      return card;
    });
  }

  private async resolve(r: AllianceRequest, accept: boolean): Promise<void> {
    await this.run(AllianceService.backend().resolveRequest(this.profile, r.uid, accept), () => showToast(this, accept ? `${r.name}を迎えました` : `${r.name}の申請を断りました`));
  }

  // --- 招待 -------------------------------------------------------------------------

  private inviteCards(d: AllianceDetail): InboxCard[] {
    const friends = SocialSystem.sortedFriends(this.save.social).filter((f) => !d.members.some((m) => m.uid === f.id));
    const cards: InboxCard[] = [this.hintCard('フレンドを同盟に招待できます。招待は、相手のフレンドごとに1日1回です。')];
    if (friends.length === 0) {
      cards.push(this.hintCard('招待できるフレンドがいません。'));
      return cards;
    }
    const guard = () => this.scroll.isTap();
    for (const f of friends) {
      const card = this.shell(104);
      card.container.add(buildAvatar(this, PAD + 34, 52, 30, f.name));
      card.container.add(body(this, PAD + 80, 34, f.name, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      this.line(card, PAD + 80, 70, `Lv.${f.level}　${formatAgo(f.lastLoginAt)}`, '#d8c49a', 17);
      const sent = this.invited.has(f.id);
      const button = new Button(this, CARD_WIDTH - PAD - 70, 52, 130, 54, sent ? '招待済み' : '招待する', () => void this.invite(f.id, f.name), { variant: sent ? 'wood' : 'gold', fontSize: '21px', guard });
      button.setEnabled(!sent);
      card.container.add(button);
      cards.push(card);
    }
    return cards;
  }

  private async invite(uid: string, name: string): Promise<void> {
    await this.run(AllianceService.backend().invite(this.profile, uid), () => {
      this.invited.add(uid);
      showToast(this, `${name}を招待しました`);
    });
  }
}
