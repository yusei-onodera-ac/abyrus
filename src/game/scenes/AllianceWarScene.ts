import { AllianceService } from '../alliance/AllianceService';
import { LEAGUE_LABEL, type AllianceDetail, type WarView } from '../alliance/AllianceBackend';
import { SaveSystem } from '../systems/SaveSystem';
import { buildEmblem, fullDigits, rewardLine, tilesForAllianceReward, timeLeft } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { wrappedText } from '../ui/CardParts';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, heading } from '../ui/theme';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

const noLock = { setEnabled: () => {} };

/** 同盟対抗戦: the week's season among alliances of about the same strength (the league): where this 同盟 stands, how its points
 *  were earned, the table, what each place pays - and the previous season's reward, once. */
export class AllianceWarScene extends AllianceScene {
  protected readonly screenTitle = '同盟対抗戦';
  protected readonly navTab = null;

  constructor() {
    super('AllianceWar');
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    const w = d.war;
    const cards = [this.headerCard(d, w)];
    if (w.claimable) cards.push(this.claimCard(w));
    cards.push(this.breakdownCard(w), this.tableCard(w), this.rewardsCard(w), this.guideCard());
    return cards;
  }

  private headerCard(d: AllianceDetail, w: WarView): InboxCard {
    const card = this.shell(176, true);
    card.container.add(buildEmblem(this, PAD + 50, 88, 88, d.summary.emblem));
    const x = PAD + 112;
    card.container.add(body(this, x, 34, `${LEAGUE_LABEL[w.league]}リーグ`, { fontSize: '27px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    card.container.add(heading(this, x, 84, `${w.rank}位`, { fontSize: '50px', color: '#ffffff', stroke: INK, strokeThickness: 8 }).setOrigin(0, 0.5));
    this.line(card, x, 130, `${fullDigits(w.points)}ポイント`, '#f5e6c8', 24);
    this.line(card, x, 160, `${timeLeft(w.endsAt, d.now)}でシーズン終了`, '#cdbb94', 17);
    return card;
  }

  private claimCard(w: WarView): InboxCard {
    const guard = () => this.scroll.isTap();
    const c = w.claimable;
    const card = this.shell(160, true);
    if (!c) return card;
    card.container.add(body(this, PAD + 6, 32, `前のシーズン　${c.rank}位`, { fontSize: '26px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 70, c.promoted ? 'リーグが上がります！' : c.demoted ? 'リーグが下がります' : 'リーグはそのままです', c.promoted ? '#ffd23f' : '#cdbb94', 19);
    this.line(card, PAD + 6, 104, rewardLine(c.reward), '#f5e6c8', 18);
    card.container.add(new Button(this, CARD_WIDTH - PAD - 100, 100, 190, 62, '受け取る', () => void this.claim(), { variant: 'gold', fontSize: '26px', guard }));
    return card;
  }

  private async claim(): Promise<void> {
    await this.run(AllianceService.claim(this.save, 'war'), (reward) => {
      SaveSystem.save(this.save);
      this.modal = showRewardModal(this, noLock, { title: '対抗戦の報酬', tiles: tilesForAllianceReward(reward) });
    });
  }

  private breakdownCard(w: WarView): InboxCard {
    const rows: [string, number][] = [
      ['共闘ボスのダメージ', w.breakdown.raid],
      ['寄付', w.breakdown.donation],
      ['メインステージの初クリア', w.breakdown.stages],
      ['助っ人を貸した', w.breakdown.helpers],
    ];
    const card = this.shell(70 + rows.length * 40 + 16);
    card.container.add(body(this, PAD + 6, 32, '今シーズンのポイントの内訳', { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    rows.forEach(([label, points], i) => {
      const y = 78 + i * 40 + 20;
      card.container.add(body(this, PAD + 12, y, label, { fontSize: '20px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      card.container.add(body(this, CARD_WIDTH - PAD - 10, y, fullDigits(points), { fontSize: '22px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    });
    return card;
  }

  private tableCard(w: WarView): InboxCard {
    const rowH = 56;
    const rows = w.table;
    const card = this.shell(70 + Math.max(1, rows.length) * rowH + 16);
    card.container.add(body(this, PAD + 6, 32, `${LEAGUE_LABEL[w.league]}リーグの順位`, { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    rows.forEach((entry, i) => {
      const y = 78 + i * rowH + rowH / 2;
      if (entry.mine) {
        const mark = this.add.graphics();
        mark.fillStyle(0xffd23f, 0.18);
        mark.fillRoundedRect(PAD, y - rowH / 2 + 2, CARD_WIDTH - PAD * 2, rowH - 4, 8);
        card.container.add(mark);
      }
      const promote = entry.rank <= 3;
      card.container.add(body(this, PAD + 12, y, `${entry.rank}`, { fontSize: '24px', fontStyle: 'bold', color: promote ? '#ffd23f' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      card.container.add(buildEmblem(this, PAD + 84, y, 40, entry.emblem));
      const name = body(this, PAD + 118, y, entry.name, { fontSize: '21px', fontStyle: entry.mine ? 'bold' : 'normal', color: entry.mine ? '#fff4dc' : '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
      if (name.width > 250) name.setScale(250 / name.width);
      card.container.add(name);
      const pts = body(this, CARD_WIDTH - PAD - 10, y, fullDigits(entry.points), { fontSize: '21px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
      if (pts.width > 200) pts.setScale(200 / pts.width);
      card.container.add(pts);
    });
    return card;
  }

  private rewardsCard(w: WarView): InboxCard {
    const rowH = 44;
    const card = this.shell(70 + w.rewards.length * rowH + 40);
    card.container.add(body(this, PAD + 6, 32, '順位ごとの報酬', { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    w.rewards.forEach((row, i) => {
      const y = 78 + i * rowH + rowH / 2;
      card.container.add(body(this, PAD + 12, y, row.label, { fontSize: '20px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const t = body(this, CARD_WIDTH - PAD - 10, y, rewardLine(row.reward), { fontSize: '18px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
      if (t.width > 440) t.setScale(440 / t.width);
      card.container.add(t);
    });
    this.line(card, PAD + 12, 70 + w.rewards.length * rowH + 22, '上位3同盟はリーグが上がり、下位3同盟は下がります。上のリーグほど報酬が増えます', '#9a8a6a', 15);
    return card;
  }

  private guideCard(): InboxCard {
    const text = wrappedText(
      this,
      PAD + 6,
      PAD + 4,
      'ポイントのため方\n・共闘ボスにダメージを与える\n・寄付をする\n・メインステージを初めてクリアする（1ステージ20ポイント）\n・自分の助っ人を、仲間が借りる（1回5ポイント）',
      CARD_WIDTH - PAD * 2 - 12,
      { fontSize: '19px', color: '#cdbb94', lineSpacing: 6 },
    );
    const card = this.shell(text.height + PAD * 2 + 8);
    card.container.add(text);
    return card;
  }
}
