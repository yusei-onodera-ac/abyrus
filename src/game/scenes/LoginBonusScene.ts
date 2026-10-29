import Phaser from 'phaser';
import { LoginBonusSystem } from '../systems/LoginBonusSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { Button } from '../ui/Button';
import { buildCardPanel } from '../ui/CardParts';
import { createPanel } from '../ui/Panel';
import { showRewardModal } from '../ui/RewardModal';
import { addTileIcon, tileForReward, tilesForGranted } from '../ui/RewardTiles';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading, CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 14;
const COLS = 7;
const CELL_H = 112;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAY_COLOR = ['#ff9a8a', '#d8c49a', '#d8c49a', '#d8c49a', '#d8c49a', '#d8c49a', '#9fc4ff'];

/** ログインボーナス: the month as a calendar, a different reward on every day. Today's
 *  is taken with the button below it; days gone by stay as they were (taken or
 *  missed) and days to come show what is waiting. A new month starts a new calendar. */
export class LoginBonusScene extends InboxScene {
  protected readonly screenTitle = 'ログインボーナス';
  protected emptyText = '';

  constructor() {
    super('LoginBonus');
  }

  protected buildCards(): InboxCard[] {
    return [this.calendarCard(), this.claimCard()];
  }

  private calendarCard(): InboxCard {
    const now = Date.now();
    const date = new Date(now);
    const today = LoginBonusSystem.dayOfMonth(now);
    const days = LoginBonusSystem.daysInMonth(now);
    const claimed = new Set(LoginBonusSystem.claimedDays(this.save, now));
    const firstWeekday = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const rows = Math.ceil((firstWeekday + days) / COLS);
    const cellW = (CARD_WIDTH - PAD * 2) / COLS;
    const top = 92;
    const height = top + rows * CELL_H + PAD;

    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, CARD_WIDTH / 2, 38, `${date.getFullYear()}年${date.getMonth() + 1}月`, { fontSize: '34px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    WEEKDAYS.forEach((label, i) => {
      container.add(caption(this, PAD + cellW * i + cellW / 2, 76, label, { fontSize: '18px', fontStyle: 'bold', color: WEEKDAY_COLOR[i], stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    });

    for (let day = 1; day <= days; day++) {
      const slot = firstWeekday + day - 1;
      const x = PAD + (slot % COLS) * cellW + cellW / 2;
      const y = top + Math.floor(slot / COLS) * CELL_H + CELL_H / 2;
      this.addCell(container, day, x, y, cellW - 6, CELL_H - 6, { isToday: day === today, taken: claimed.has(day), past: day < today });
    }
    return { container, height };
  }

  private addCell(container: Phaser.GameObjects.Container, day: number, x: number, y: number, w: number, h: number, state: { isToday: boolean; taken: boolean; past: boolean }): void {
    const reward = LoginBonusSystem.rewardFor(day);
    const tile = tileForReward(reward);
    const dim = state.taken || state.past;
    container.add(
      createPanel(this, x, y, w, h, {
        fillColor: state.isToday ? 0x3a2a12 : 0x150e07,
        borderColor: state.isToday ? CHROME.brassBright : CHROME.brassDark,
        glowColor: state.isToday ? CHROME.brassBright : CHROME.brassDark,
        borderWidth: state.isToday ? 3 : 1.5,
        radius: 8,
        gradient: false,
      }),
    );
    container.add(caption(this, x - w / 2 + 6, y - h / 2 + 13, `${day}`, { fontSize: '17px', fontStyle: 'bold', color: state.isToday ? '#ffe9b8' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    // The icon and amount sit in their own container so the whole thing can be dimmed.
    const content = this.add.container(0, 0);
    addTileIcon(this, content, tile, x, y - 6, 42);
    const amount = body(this, x, y + h / 2 - 20, tile.amount, { fontSize: '19px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
    if (amount.width > w - 6) amount.setScale((w - 6) / amount.width);
    content.add(amount);
    content.setAlpha(dim ? 0.38 : 1);
    container.add(content);

    if (state.taken) {
      const g = this.add.graphics();
      g.fillStyle(0x2f9a4a, 1);
      g.fillCircle(x + w / 2 - 14, y - h / 2 + 15, 12);
      g.lineStyle(3, 0xffffff, 1);
      g.beginPath();
      g.moveTo(x + w / 2 - 20, y - h / 2 + 15);
      g.lineTo(x + w / 2 - 15, y - h / 2 + 20);
      g.lineTo(x + w / 2 - 8, y - h / 2 + 10);
      g.strokePath();
      container.add(g);
    }
    if (state.isToday && !state.taken) {
      const tag = caption(this, x + w / 2 - 6, y - h / 2 + 13, 'TODAY', { fontSize: '13px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
      container.add(tag);
      this.tweens.add({ targets: tag, alpha: { from: 1, to: 0.35 }, duration: 640, yoyo: true, repeat: -1 });
    }
  }

  private claimCard(): InboxCard {
    const canClaim = LoginBonusSystem.canClaim(this.save);
    const height = 120;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    const button = new Button(this, CARD_WIDTH / 2, height / 2, CARD_WIDTH - PAD * 2, 90, canClaim ? '今日のボーナスを受け取る' : '今日のボーナスは受け取り済みです', () => this.claim(), {
      variant: 'gold',
      fontSize: '30px',
      guard: () => this.scroll.isTap(),
    });
    button.setEnabled(canClaim);
    container.add(button);
    return { container, height };
  }

  private claim(): void {
    const granted = LoginBonusSystem.claim(this.save);
    if (!granted) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title: 'ログインボーナス', tiles: tilesForGranted([granted]), onClose: () => this.queueRender() });
  }
}
