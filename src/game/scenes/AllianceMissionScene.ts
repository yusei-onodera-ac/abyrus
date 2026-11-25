import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import type { AllianceDetail, MissionBoardView, MissionView } from '../alliance/AllianceBackend';
import { SaveSystem } from '../systems/SaveSystem';
import { buildBar, fullDigits, rewardLine, tilesForAllianceReward, timeLeft } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { buildUnreadDot, wrappedText } from '../ui/CardParts';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body } from '../ui/theme';
import { t } from '../i18n';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

const noLock = { setEnabled: () => {} };

/** Room for the text on the left of a mission card (the button column is on the right). */
const TEXT_W = 410;

/** 同盟ミッション: today's three goals and this week's big one. Everyone's actions add up; once a goal is met each member who
 *  contributed takes their own reward (shown in the 確認 popup). A member's own share and the top three are shown. */
export class AllianceMissionScene extends AllianceScene {
  protected get screenTitle(): string {
    return t('alliance.mission.title');
  }
  protected readonly navTab = null;

  constructor() {
    super('AllianceMission');
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    const cards: InboxCard[] = [this.introCard()];
    cards.push(this.headingCard(t('alliance.mission.dailyHeading'), d.missions.daily, d.now));
    cards.push(...this.boardCards(d.missions.daily));
    cards.push(this.headingCard(t('alliance.mission.weeklyHeading'), d.missions.weekly, d.now));
    cards.push(...this.boardCards(d.missions.weekly));
    return cards;
  }

  private introCard(): InboxCard {
    const text = wrappedText(this, PAD + 6, PAD + 4, t('alliance.mission.intro'), CARD_WIDTH - PAD * 2 - 12, { fontSize: '19px', color: '#cdbb94', lineSpacing: 6 });
    const card = this.shell(text.height + PAD * 2 + 8);
    card.container.add(text);
    return card;
  }

  /** A heading with the time left in this period on its right. */
  private headingCard(title: string, board: MissionBoardView, now: number): InboxCard {
    const card = this.shell(58, board.missions.some((m) => m.claimable));
    const heading = body(this, PAD + 6, 29, title, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    card.container.add(heading);
    const left = body(this, CARD_WIDTH - PAD - 6, 29, timeLeft(board.endsAt, now), { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
    card.container.add(left);
    return card;
  }

  private boardCards(board: MissionBoardView): InboxCard[] {
    if (board.missions.length === 0) return [this.hintCard(t('alliance.mission.empty'))];
    return board.missions.map((m) => this.missionCard(m));
  }

  /** Shrinks a text that is wider than `max` (so a long English line never runs under the button). */
  private fit<T extends Phaser.GameObjects.Text>(text: T, max: number): T {
    if (text.width > max) text.setScale(max / text.width);
    return text;
  }

  private missionCard(m: MissionView): InboxCard {
    const guard = () => this.scroll.isTap();
    const short = m.done && !m.claimed && !m.claimable ? m.minShare - m.mine : 0;
    const card = this.shell(224, m.claimable);
    const x = PAD + 6;

    card.container.add(this.fit(body(this, x, 30, t(m.title), { fontSize: '26px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5), TEXT_W));
    card.container.add(buildBar(this, x, 62, TEXT_W, 22, m.target > 0 ? m.progress / m.target : 1, m.done ? 0x3f9f58 : 0xe0822a));
    this.fit(this.line(card, x, 106, t('alliance.mission.progress', { progress: fullDigits(m.progress), target: fullDigits(m.target) }), m.done ? '#9fe39f' : '#f5e6c8', 19), TEXT_W);

    const mine = m.mine > 0 ? (m.myRank > 0 ? t('alliance.mission.mineRank', { mine: fullDigits(m.mine), rank: m.myRank }) : t('alliance.mission.mine', { mine: fullDigits(m.mine) })) : t('alliance.mission.mineNone');
    this.fit(this.line(card, x, 138, short > 0 ? t('alliance.mission.shortOfShare', { need: fullDigits(short) }) : mine, short > 0 ? '#ff9a8a' : '#f5e6c8', 19), TEXT_W);

    const top = m.top.map((e) => t('alliance.mission.topEntry', { name: Array.from(e.name).slice(0, 6).join(''), count: fullDigits(e.count) })).join(t('alliance.mission.topSeparator'));
    this.fit(this.line(card, x, 168, top ? t('alliance.mission.top', { names: top }) : '', '#cdbb94', 16), TEXT_W);
    this.fit(this.line(card, x, 198, t('alliance.mission.reward', { reward: rewardLine(m.reward) }), '#9fe39f', 16), TEXT_W);

    const label = m.claimed ? t('common.claimed') : m.done ? t('common.claim') : t('alliance.mission.inProgress');
    const button = new Button(this, CARD_WIDTH - PAD - 90, 112, 170, 66, label, () => void this.claim(m), { variant: 'gold', fontSize: '26px', guard });
    button.setEnabled(m.claimable);
    card.container.add(button);
    if (m.claimable) card.container.add(buildUnreadDot(this, CARD_WIDTH - PAD - 10, 72, 9));
    return card;
  }

  private async claim(m: MissionView): Promise<void> {
    await this.run(AllianceService.claimMission(this.save, m.id), (reward) => {
      SaveSystem.save(this.save);
      this.modal = showRewardModal(this, noLock, { title: t('alliance.mission.claimedTitle'), tiles: tilesForAllianceReward(reward), note: t(m.title) });
    });
  }
}
