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
import { t as tl } from '../i18n';

const noLock = { setEnabled: () => {} };

/** 同盟対抗戦: the week's season among alliances of about the same strength (the league): where this 同盟 stands, how its points
 *  were earned, the table, what each place pays - and the previous season's reward, once. */
export class AllianceWarScene extends AllianceScene {
  protected get screenTitle(): string {
    return tl('alliance.war.title');
  }
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
    card.container.add(body(this, x, 34, tl('alliance.war.leagueName', { LEAGUE_LABEL: tl(LEAGUE_LABEL[w.league]) }), { fontSize: '27px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    card.container.add(heading(this, x, 84, tl('alliance.shared.rank', { rank: w.rank }), { fontSize: '50px', color: '#ffffff', stroke: INK, strokeThickness: 8 }).setOrigin(0, 0.5));
    this.line(card, x, 130, tl('alliance.war.points', { fullDigits: fullDigits(w.points) }), '#f5e6c8', 24);
    this.line(card, x, 160, tl('alliance.war.seasonEnds', { timeLeft: timeLeft(w.endsAt, d.now) }), '#cdbb94', 17);
    return card;
  }

  private claimCard(w: WarView): InboxCard {
    const guard = () => this.scroll.isTap();
    const c = w.claimable;
    const card = this.shell(160, true);
    if (!c) return card;
    card.container.add(body(this, PAD + 6, 32, tl('alliance.war.lastSeason', { rank: c.rank }), { fontSize: '26px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 70, c.promoted ? tl('alliance.war.promoted') : c.demoted ? tl('alliance.war.demoted') : tl('alliance.war.stays'), c.promoted ? '#ffd23f' : '#cdbb94', 19);
    this.line(card, PAD + 6, 104, rewardLine(c.reward), '#f5e6c8', 18);
    card.container.add(new Button(this, CARD_WIDTH - PAD - 100, 100, 190, 62, tl('common.claim'), () => void this.claim(), { variant: 'gold', fontSize: '26px', guard }));
    return card;
  }

  private async claim(): Promise<void> {
    await this.run(AllianceService.claim(this.save, 'war'), (reward) => {
      SaveSystem.save(this.save);
      this.modal = showRewardModal(this, noLock, { title: tl('alliance.war.rewardTitle'), tiles: tilesForAllianceReward(reward) });
    });
  }

  private breakdownCard(w: WarView): InboxCard {
    const rows: [string, number][] = [
      [tl('alliance.war.fromRaid'), w.breakdown.raid],
      [tl('alliance.war.fromDonations'), w.breakdown.donation],
      [tl('alliance.war.fromStages'), w.breakdown.stages],
      [tl('alliance.war.fromHelpers'), w.breakdown.helpers],
    ];
    const card = this.shell(70 + rows.length * 40 + 16);
    card.container.add(body(this, PAD + 6, 32, tl('alliance.war.breakdownTitle'), { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
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
    card.container.add(body(this, PAD + 6, 32, tl('alliance.war.tableTitle', { LEAGUE_LABEL: tl(LEAGUE_LABEL[w.league]) }), { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
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
    card.container.add(body(this, PAD + 6, 32, tl('alliance.war.rewardsTitle'), { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    w.rewards.forEach((row, i) => {
      const y = 78 + i * rowH + rowH / 2;
      const label = row.fromRank === row.toRank ? tl('alliance.war.rankSingle', { fromRank: row.fromRank }) : tl('alliance.war.rankRange', { fromRank: row.fromRank, toRank: row.toRank });
      card.container.add(body(this, PAD + 12, y, label, { fontSize: '20px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const t = body(this, CARD_WIDTH - PAD - 10, y, rewardLine(row.reward), { fontSize: '18px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
      if (t.width > 440) t.setScale(440 / t.width);
      card.container.add(t);
    });
    this.line(card, PAD + 12, 70 + w.rewards.length * rowH + 22, tl('alliance.war.leagueNote'), '#9a8a6a', 15);
    return card;
  }

  private guideCard(): InboxCard {
    const text = wrappedText(
      this,
      PAD + 6,
      PAD + 4,
      tl('alliance.war.guide'),
      CARD_WIDTH - PAD * 2 - 12,
      { fontSize: '19px', color: '#cdbb94', lineSpacing: 6 },
    );
    const card = this.shell(text.height + PAD * 2 + 8);
    card.container.add(text);
    return card;
  }
}
