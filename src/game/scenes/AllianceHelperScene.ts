import { AllianceService } from '../alliance/AllianceService';
import { type AllianceDetail, type AllianceMember } from '../alliance/AllianceBackend';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { fullDigits } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { buildAvatar } from '../ui/CardParts';
import { HeroSlot } from '../ui/HeroSlot';
import { openModal } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { ScrollView } from '../ui/ScrollView';
import { body, heading, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { CLASS_LABELS, type HeroData } from '../types';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

const noLock = { setEnabled: () => {} };

/** 助っ人と支援: the hero the player lends to the 同盟 (borrowed by members in the 出撃 popup and the boss fight), the stamina
 *  that members sent (to take), the stamina the player can send, and the helpers on offer. */
export class AllianceHelperScene extends AllianceScene {
  protected readonly screenTitle = '助っ人と支援';
  protected readonly navTab = null;
  private generator!: CharacterGenerator;

  constructor() {
    super('AllianceHelper');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    return [this.myHelperCard(d), this.receiveCard(d), this.sendCard(d), ...this.helpersCards(d)];
  }

  // --- 自分の助っ人 -----------------------------------------------------------------------

  private myHelperCard(d: AllianceDetail): InboxCard {
    const guard = () => this.scroll.isTap();
    const h = d.me.helper;
    const card = this.shell(178, !h);
    card.container.add(body(this, PAD + 6, 30, 'あなたの助っ人', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    if (h) {
      card.container.add(body(this, PAD + 6, 76, `${h.name}`, { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
      this.line(card, PAD + 6, 116, `${CLASS_LABELS[h.heroClass]}　★${h.rarity}　Lv.${h.level}　フェーズ${h.phase}`, '#f5e6c8', 19);
      this.line(card, PAD + 6, 148, `総合力 ${fullDigits(h.power)}　（借りられるたびに、同盟コイン +5）`, '#9fe39f', 17);
    } else {
      card.container.add(body(this, PAD + 6, 80, '助っ人が、まだ決まっていません', { fontSize: '26px', fontStyle: 'bold', color: '#ff9a8a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      this.line(card, PAD + 6, 124, '自分のキャラを1体、仲間に貸せます', '#cdbb94', 18);
    }
    card.container.add(new Button(this, CARD_WIDTH - PAD - 90, 100, 170, 62, h ? '変える' : '決める', () => this.pickHero(), { variant: 'gold', fontSize: '26px', guard }));
    return card;
  }

  /** A popup of the player's heroes, strongest first, to choose the one to lend. */
  private pickHero(): void {
    const save = this.save;
    const heroes = [...save.heroes].sort((a, b) => ProgressionSystem.computeHeroPower(b).toNumber() - ProgressionSystem.computeHeroPower(a).toNumber());
    const handle = openModal(this, this.scroll, 0.75, true);
    this.setModal(handle);
    const panel = handle.container;
    const w = 640;
    const h = 960;
    const cy = 640;
    const top = cy - h / 2;
    panel.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
    panel.add(this.add.zone(360, cy, w, h).setInteractive());
    panel.add(heading(this, 360, top + 46, '助っ人にするキャラ', { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    const view = new ScrollView(this, 360 - (w - 50) / 2, top + 96, w - 50, h - 96 - 130);
    view.setDepth(201);
    const rowH = 108;
    heroes.forEach((hero: HeroData, i: number) => {
      const row = this.add.container(0, i * (rowH + 8));
      const bg = this.add.graphics();
      bg.fillStyle(0x1c1309, 1);
      bg.fillRoundedRect(0, 0, w - 60, rowH, 12);
      bg.lineStyle(2, CHROME.brassDark, 1);
      bg.strokeRoundedRect(0, 0, w - 60, rowH, 12);
      row.add(bg);
      row.add(new HeroSlot(this, 62, rowH / 2, { hero, generator: this.generator }, 86));
      row.add(body(this, 124, 34, hero.name, { fontSize: '24px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      row.add(body(this, 124, 72, `Lv.${hero.level}　フェーズ${hero.phase}　総合力 ${ProgressionSystem.computeHeroPower(hero).toString()}`, { fontSize: '17px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const hit = this.add.zone((w - 60) / 2, rowH / 2, w - 60, rowH).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (!view.isTap()) return;
        view.destroy();
        handle.close();
        void this.run(AllianceService.setHelper(this.save, hero.id), () => {
          SaveSystem.save(this.save);
          showToast(this, `${hero.name}を助っ人にしました`);
        });
      });
      row.add(hit);
      view.content.add(row);
    });
    view.setContentHeight(heroes.length * (rowH + 8));
    const close = (): void => {
      view.destroy();
      handle.close();
    };
    panel.add(new Button(this, 360 - 140, top + h - 56, 240, 64, '助っ人をやめる', () => {
      close();
      void this.run(AllianceService.setHelper(this.save, null), () => showToast(this, '助っ人をやめました'));
    }, { variant: 'wood', fontSize: '22px' }));
    panel.add(new Button(this, 360 + 140, top + h - 56, 240, 64, '閉じる', close, { variant: 'wood', fontSize: '22px' }));
    this.modal = { container: handle.container, close };
  }

  // --- 支援 -------------------------------------------------------------------------------

  private receiveCard(d: AllianceDetail): InboxCard {
    const guard = () => this.scroll.isTap();
    const s = d.support;
    const card = this.shell(138, s.receivable > 0);
    card.container.add(body(this, PAD + 6, 30, '贈られたスタミナ', { fontSize: '21px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    card.container.add(body(this, PAD + 6, 74, s.receivable > 0 ? `スタミナ ${s.receivable}` : 'まだ届いていません', { fontSize: '30px', fontStyle: 'bold', color: s.receivable > 0 ? '#9fe39f' : '#9a8a6a', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 112, `今日あと${s.receiveLeft}個まで受け取れます`, '#cdbb94', 17);
    const button = new Button(this, CARD_WIDTH - PAD - 90, 80, 170, 62, '受け取る', () => void this.claimStamina(), { variant: 'gold', fontSize: '26px', guard });
    button.setEnabled(s.receivable > 0 && s.receiveLeft > 0);
    card.container.add(button);
    return card;
  }

  private async claimStamina(): Promise<void> {
    await this.run(AllianceService.claimStamina(this.save), (amount) => {
      SaveSystem.save(this.save);
      this.modal = showRewardModal(this, noLock, { title: 'スタミナを受け取りました', tiles: [{ kind: 'stamina', amount: `+${amount}` }] });
    });
  }

  private sendCard(d: AllianceDetail): InboxCard {
    const guard = () => this.scroll.isTap();
    const others = d.members.filter((m) => m.uid !== d.me.uid);
    const rowH = 76;
    const card = this.shell(96 + Math.max(1, others.length) * rowH + 12);
    card.container.add(body(this, PAD + 6, 30, 'スタミナを贈る', { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 62, `今日あと${d.support.sendLeft}人に贈れます（1人に スタミナ10）`, '#cdbb94', 17);
    if (others.length === 0) this.line(card, PAD + 6, 110, '同盟に、ほかのメンバーがいません', '#9a8a6a', 18);
    others.forEach((m: AllianceMember, i: number) => {
      const y = 96 + i * rowH + rowH / 2;
      card.container.add(buildAvatar(this, PAD + 36, y, 26, m.name));
      card.container.add(body(this, PAD + 76, y, m.name, { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const button = new Button(this, CARD_WIDTH - PAD - 60, y, 110, 52, '贈る', () => void this.send(m), { variant: 'wood', fontSize: '22px', guard });
      button.setEnabled(d.support.sendLeft > 0);
      card.container.add(button);
    });
    return card;
  }

  private async send(m: AllianceMember): Promise<void> {
    await this.run(AllianceService.backend().sendStamina(this.profile, m.uid), () => showToast(this, `${m.name}にスタミナを贈りました`));
  }

  // --- 仲間の助っ人 -----------------------------------------------------------------------------

  private helpersCards(d: AllianceDetail): InboxCard[] {
    const list = d.members.filter((m) => m.helper && m.uid !== d.me.uid);
    const rowH = 70;
    const card = this.shell(70 + Math.max(1, list.length) * rowH + 12);
    card.container.add(body(this, PAD + 6, 32, '仲間の助っ人', { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    if (list.length === 0) this.line(card, PAD + 6, 90, 'まだ、助っ人を決めた仲間がいません', '#9a8a6a', 18);
    list.forEach((m, i) => {
      const h = m.helper!;
      const y = 70 + i * rowH + rowH / 2;
      card.container.add(body(this, PAD + 12, y - 14, `${h.name}　Lv.${h.level}　★${h.rarity}`, { fontSize: '21px', fontStyle: 'bold', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.line(card, PAD + 12, y + 16, `${m.name}　総合力 ${fullDigits(h.power)}`, '#cdbb94', 16);
    });
    return [card, this.hintCard('助っ人は、メインステージの「出撃」、曜日ダンジョン、共闘ボスの挑戦で、1体だけ借りられます。')];
  }
}
