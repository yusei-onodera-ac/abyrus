import Phaser from 'phaser';
import { LoginBonusSystem } from '../systems/LoginBonusSystem';
import type { SaveData } from '../systems/SaveSystem';
import type { InboxCard } from '../scenes/InboxScene';
import { buildCardPanel } from './CardParts';
import { createPanel } from './Panel';
import { addTileIcon, tileForReward } from './RewardTiles';
import { CARD_WIDTH } from './ScreenFrame';
import { body, caption, heading, CHROME } from './theme';

const INK = '#1c130a';
const PAD = 14;
const COLS = 7;
const CELL_H = 112;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAY_COLOR = ['#ff9a8a', '#d8c49a', '#d8c49a', '#d8c49a', '#d8c49a', '#d8c49a', '#9fc4ff'];

/** ログインボーナス is now handed over automatically (see HomeScene) and never
 *  shown as a popup to claim - this read-only calendar (何日に何がもらえるか)
 *  is the only place it's still visible, inside お知らせ. */
export function buildLoginBonusCalendarCard(scene: Phaser.Scene, save: SaveData): InboxCard {
  const now = Date.now();
  const date = new Date(now);
  const today = LoginBonusSystem.dayOfMonth(now);
  const days = LoginBonusSystem.daysInMonth(now);
  const claimed = new Set(LoginBonusSystem.claimedDays(save, now));
  const firstWeekday = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const rows = Math.ceil((firstWeekday + days) / COLS);
  const cellW = (CARD_WIDTH - PAD * 2) / COLS;
  const top = 92;
  const height = top + rows * CELL_H + PAD;

  const container = scene.add.container(0, 0);
  container.add(buildCardPanel(scene, CARD_WIDTH, height));
  container.add(heading(scene, CARD_WIDTH / 2, 38, `${date.getFullYear()}年${date.getMonth() + 1}月のログインボーナス`, { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
  WEEKDAYS.forEach((label, i) => {
    container.add(caption(scene, PAD + cellW * i + cellW / 2, 76, label, { fontSize: '18px', fontStyle: 'bold', color: WEEKDAY_COLOR[i], stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
  });

  for (let day = 1; day <= days; day++) {
    const slot = firstWeekday + day - 1;
    const x = PAD + (slot % COLS) * cellW + cellW / 2;
    const y = top + Math.floor(slot / COLS) * CELL_H + CELL_H / 2;
    addCell(scene, container, day, x, y, cellW - 6, CELL_H - 6, { isToday: day === today, taken: claimed.has(day), past: day < today });
  }
  return { container, height };
}

function addCell(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  day: number,
  x: number,
  y: number,
  w: number,
  h: number,
  state: { isToday: boolean; taken: boolean; past: boolean },
): void {
  const reward = LoginBonusSystem.rewardFor(day);
  const tile = tileForReward(reward);
  const dim = state.taken || state.past;
  container.add(
    createPanel(scene, x, y, w, h, {
      fillColor: state.isToday ? 0x3a2a12 : 0x150e07,
      borderColor: state.isToday ? CHROME.brassBright : CHROME.brassDark,
      glowColor: state.isToday ? CHROME.brassBright : CHROME.brassDark,
      borderWidth: state.isToday ? 3 : 1.5,
      radius: 8,
      gradient: false,
    }),
  );
  container.add(caption(scene, x - w / 2 + 6, y - h / 2 + 13, `${day}`, { fontSize: '17px', fontStyle: 'bold', color: state.isToday ? '#ffe9b8' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

  const content = scene.add.container(0, 0);
  addTileIcon(scene, content, tile, x, y - 6, 42);
  const amount = body(scene, x, y + h / 2 - 20, tile.amount, { fontSize: '19px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
  if (amount.width > w - 6) amount.setScale((w - 6) / amount.width);
  content.add(amount);
  content.setAlpha(dim ? 0.38 : 1);
  container.add(content);

  if (state.taken) {
    const g = scene.add.graphics();
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
    const tag = caption(scene, x + w / 2 - 6, y - h / 2 + 13, 'TODAY', { fontSize: '13px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
    container.add(tag);
    scene.tweens.add({ targets: tag, alpha: { from: 1, to: 0.35 }, duration: 640, yoyo: true, repeat: -1 });
  }
}
