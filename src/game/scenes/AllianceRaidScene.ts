import { AllianceService } from '../alliance/AllianceService';
import type { AllianceDetail, HelperHero, RaidView } from '../alliance/AllianceBackend';
import { enemyArtKey } from '../characters/EnemyArt';
import { SaveSystem } from '../systems/SaveSystem';
import { buildBar, fullDigits, rewardLine, tilesForAllianceReward, timeLeft } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { wrappedText } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { openModal } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { ScrollView } from '../ui/ScrollView';
import { body, heading, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

const noLock = { setEnabled: () => {} };

/** 共闘ボス: this week's boss of the 同盟 - its HP (every member's damage lowers it), the time left, the player's attempts and
 *  damage, the top ten, and 挑戦 (a 60-second fight, see AllianceRaidBattleScene). Optionally with a borrowed 助っ人. */
export class AllianceRaidScene extends AllianceScene {
  protected readonly screenTitle = '共闘ボス';
  protected readonly navTab = null;

  /** A 助っ人 chosen to take along (borrowed when the fight starts). */
  private helperChoice: HelperHero | null = null;
  private starting = false;

  constructor() {
    super('AllianceRaid');
  }

  init(): void {
    super.init();
    this.helperChoice = null;
    this.starting = false;
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    const r = d.raid;
    const cards = [this.bossCard(d, r), this.fightCard(d, r)];
    if (r.claimable) cards.push(this.claimCard(r));
    cards.push(this.rankingCard(d, r));
    return cards;
  }

  // --- ボス ---------------------------------------------------------------------------

  private bossCard(d: AllianceDetail, r: RaidView): InboxCard {
    const done = r.defeatedAt !== null;
    const card = this.shell(340, true);
    const key = r.boss.art ? enemyArtKey(r.boss.art) : '';
    if (key && this.textures.exists(key)) {
      const frame = this.textures.getFrame(key);
      const scale = Math.min(250 / frame.width, 170 / frame.height);
      card.container.add(this.add.image(PAD + 132, 100, key).setDisplaySize(frame.width * scale, frame.height * scale));
    }
    const x = PAD + 270;
    const name = heading(this, x, 36, r.boss.name, { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5);
    if (name.width > CARD_WIDTH - x - PAD) name.setScale((CARD_WIDTH - x - PAD) / name.width);
    card.container.add(name);
    const desc = wrappedText(this, x, 66, r.boss.description, CARD_WIDTH - x - PAD, { fontSize: '18px', color: '#d8c49a' });
    card.container.add(desc);
    const ratio = r.maxHp > 0 ? r.hp / r.maxHp : 0;
    card.container.add(buildBar(this, PAD + 6, 206, CARD_WIDTH - PAD * 2 - 12, 26, done ? 0 : ratio, 0xc0392b));
    this.line(card, PAD + 6, 252, done ? '撃破しました！' : `残りHP ${fullDigits(r.hp)}`, done ? '#9fe39f' : '#fff4dc', 21);
    this.line(card, PAD + 6, 284, `最大HP ${fullDigits(r.maxHp)}　（みんなのダメージで減ります）`, '#cdbb94', 16);
    this.line(card, PAD + 6, 314, `${timeLeft(r.endsAt, d.now)}で、ボスが入れ替わります`, '#cdbb94', 17);
    return card;
  }

  // --- 挑戦 ---------------------------------------------------------------------------

  private fightCard(d: AllianceDetail, r: RaidView): InboxCard {
    const guard = () => this.scroll.isTap();
    const over = r.defeatedAt !== null;
    const card = this.shell(214, r.attemptsLeft > 0 && !over);
    card.container.add(body(this, PAD + 6, 30, `今日の挑戦　あと ${r.attemptsLeft}回`, { fontSize: '26px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 66, `今週の自分のダメージ ${fullDigits(r.myDamage)}`, '#f5e6c8', 19);
    this.line(card, PAD + 6, 96, '60秒でできるだけダメージを与えます（スタミナは使いません）', '#cdbb94', 16);
    const hasHelpers = d.members.some((m) => m.helper && m.uid !== d.me.uid);
    const pick = new Button(this, PAD + 6 + 190, 142, 380, 52, this.helperChoice ? `助っ人：${this.helperChoice.name}（${this.helperChoice.ownerName}）` : '助っ人を借りる（なし）', () => this.pickHelper(d), { variant: 'wood', fontSize: '19px', guard });
    pick.setEnabled(hasHelpers);
    card.container.add(pick);
    const can = r.attemptsLeft > 0 && !over;
    const fight = new Button(this, CARD_WIDTH - PAD - 100, 142, 190, 68, over ? '撃破済み' : r.attemptsLeft > 0 ? '挑戦する' : '回数なし', () => this.askFight(), { variant: 'gold', fontSize: '28px', guard });
    fight.setEnabled(can && !this.starting);
    card.container.add(fight);
    this.line(card, PAD + 6, 190, over ? 'このボスは倒されました。次のボスを待ちましょう' : `1回の最大ダメージ ${fullDigits(r.maxDamagePerAttempt)}`, '#9a8a6a', 15);
    return card;
  }

  private pickHelper(d: AllianceDetail): void {
    const helpers = d.members.filter((m) => m.helper && m.uid !== d.me.uid).map((m) => m.helper as HelperHero);
    if (helpers.length === 0) {
      showToast(this, '借りられる助っ人がいません');
      return;
    }
    const handle = openModal(this, this.scroll, 0.75, true);
    this.setModal(handle);
    const panel = handle.container;
    const w = 600;
    const h = 860;
    const cy = 640;
    const top = cy - h / 2;
    panel.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
    panel.add(this.add.zone(360, cy, w, h).setInteractive());
    panel.add(heading(this, 360, top + 46, '助っ人を借りる', { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    const view = new ScrollView(this, 360 - (w - 60) / 2, top + 96, w - 60, h - 96 - 150);
    view.setDepth(201);
    const rowH = 92;
    helpers.forEach((helper, i) => {
      const row = this.add.container(0, i * (rowH + 8));
      const on = this.helperChoice?.ownerUid === helper.ownerUid;
      const bg = this.add.graphics();
      bg.fillStyle(on ? 0x4a3418 : 0x1c1309, 1);
      bg.fillRoundedRect(0, 0, w - 70, rowH, 12);
      bg.lineStyle(2, on ? CHROME.brassBright : CHROME.brassDark, 1);
      bg.strokeRoundedRect(0, 0, w - 70, rowH, 12);
      row.add(bg);
      row.add(body(this, 20, 30, `${helper.name}　Lv.${helper.level}`, { fontSize: '24px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      row.add(body(this, 20, 66, `${helper.ownerName}　総合力 ${fullDigits(helper.power)}`, { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const hit = this.add.zone((w - 70) / 2, rowH / 2, w - 70, rowH).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (!view.isTap()) return;
        this.helperChoice = on ? null : helper;
        view.destroy();
        handle.close();
        this.queueRender();
      });
      row.add(hit);
      view.content.add(row);
    });
    view.setContentHeight(helpers.length * (rowH + 8));
    panel.add(
      new Button(this, 360 - 140, top + h - 60, 230, 64, 'なしにする', () => {
        this.helperChoice = null;
        view.destroy();
        handle.close();
        this.queueRender();
      }, { variant: 'wood', fontSize: '22px' }),
    );
    panel.add(new Button(this, 360 + 140, top + h - 60, 230, 64, '閉じる', () => {
      view.destroy();
      handle.close();
    }, { variant: 'wood', fontSize: '22px' }));
    this.modal = { container: handle.container, close: () => {
      view.destroy();
      handle.close();
    } };
  }

  private askFight(): void {
    this.setModal(
      openConfirm(this, this.scroll, {
        title: '共闘ボスに挑戦',
        message: `今日の挑戦を1回使って、60秒の戦闘に出ます。\n${this.helperChoice ? `助っ人：${this.helperChoice.name}（${this.helperChoice.ownerName}）` : '助っ人はなしです。'}`,
        confirmLabel: '挑戦する',
        confirmVariant: 'gold',
        onConfirm: () => void this.fight(),
      }),
    );
  }

  private async fight(): Promise<void> {
    if (this.starting) return;
    const party = SaveSystem.getPartyHeroes(this.save);
    if (party.front.length + party.back.length === 0) {
      showToast(this, '編成が空です。名鑑でパーティを組みましょう', '#ff8a8a');
      return;
    }
    this.starting = true;
    const ticket = await AllianceService.beginRaid(this.save);
    if (!this.alive) return;
    if (!ticket.ok) {
      this.starting = false;
      showToast(this, ticket.message, '#ff8a8a');
      return;
    }
    let helper: HelperHero | null = null;
    if (this.helperChoice) {
      const borrowed = await AllianceService.borrowHelper(this.save, this.helperChoice.ownerUid);
      if (!this.alive) return;
      if (borrowed.ok) helper = borrowed.value;
      else showToast(this, `助っ人を借りられませんでした：${borrowed.message}`, '#ffb0a0');
    }
    SaveSystem.save(this.save);
    this.scene.start('AllianceRaidBattle', { ticket: ticket.value, helper });
  }

  // --- 報酬 ---------------------------------------------------------------------------

  private claimCard(r: RaidView): InboxCard {
    const guard = () => this.scroll.isTap();
    const claim = r.claimable;
    const card = this.shell(138, true);
    card.container.add(body(this, PAD + 6, 32, claim?.label ?? '報酬', { fontSize: '26px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 72, claim ? rewardLine(claim.reward) : '', '#f5e6c8', 19);
    card.container.add(new Button(this, CARD_WIDTH - PAD - 100, 94, 190, 62, '受け取る', () => void this.claim(), { variant: 'gold', fontSize: '26px', guard }));
    return card;
  }

  private async claim(): Promise<void> {
    await this.run(AllianceService.claim(this.save, 'raid'), (reward) => {
      SaveSystem.save(this.save);
      this.modal = showRewardModal(this, noLock, { title: '共闘ボスの報酬', tiles: tilesForAllianceReward(reward) });
    });
  }

  // --- 順位 ---------------------------------------------------------------------------

  private rankingCard(d: AllianceDetail, r: RaidView): InboxCard {
    const rowH = 44;
    const rows = r.ranking.slice(0, 10);
    const card = this.shell(70 + Math.max(1, rows.length) * rowH + 16);
    card.container.add(body(this, PAD + 6, 32, '今週のダメージ順位', { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    if (rows.length === 0) this.line(card, PAD + 6, 90, 'まだ、だれもダメージを与えていません', '#9a8a6a', 18);
    rows.forEach((entry, i) => {
      const y = 78 + i * rowH + rowH / 2;
      const mine = entry.uid === d.me.uid;
      if (mine) {
        const mark = this.add.graphics();
        mark.fillStyle(0xffd23f, 0.16);
        mark.fillRoundedRect(PAD, y - rowH / 2 + 2, CARD_WIDTH - PAD * 2, rowH - 4, 8);
        card.container.add(mark);
      }
      card.container.add(body(this, PAD + 12, y, `${entry.rank}位`, { fontSize: '22px', fontStyle: 'bold', color: entry.rank <= 3 ? '#ffd23f' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      card.container.add(body(this, PAD + 92, y, entry.name, { fontSize: '21px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const dmg = body(this, CARD_WIDTH - PAD - 10, y, fullDigits(entry.damage), { fontSize: '20px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
      if (dmg.width > 300) dmg.setScale(300 / dmg.width);
      card.container.add(dmg);
    });
    return card;
  }
}
