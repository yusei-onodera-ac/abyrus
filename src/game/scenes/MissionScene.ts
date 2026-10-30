import { MISSION_BONUS } from '../data/missions';
import { MissionSystem, type MissionStatus } from '../systems/MissionSystem';
import { SaveSystem } from '../systems/SaveSystem';
import type { GrantedReward } from '../systems/RewardSystem';
import { Button } from '../ui/Button';
import { buildCardPanel } from '../ui/CardParts';
import { addTileIcon, buildRewardGrid, tileForReward, tilesForGranted } from '../ui/RewardTiles';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading, CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 14;
const ROW_H = 112;

/** デイリーミッション: today's list with progress bars and 受け取る buttons, a まとめて受け取る
 *  for everything finished, and the bonus for taking them all. The list starts over each
 *  local day. */
export class MissionScene extends InboxScene {
  protected readonly screenTitle = 'デイリーミッション';
  protected emptyText = '';

  constructor() {
    super('Mission');
  }

  protected buildCards(): InboxCard[] {
    const missions = MissionSystem.list(this.save);
    const cards: InboxCard[] = [this.headerCard(missions)];
    for (const m of missions) cards.push(this.missionRow(m));
    cards.push(this.bonusCard(missions));
    return cards;
  }

  private headerCard(missions: MissionStatus[]): InboxCard {
    const guard = () => this.scroll.isTap();
    const taken = missions.filter((m) => m.claimed).length;
    const ready = MissionSystem.claimable(this.save).length;
    const height = 132;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    const now = new Date();
    container.add(heading(this, PAD + 6, 34, `${now.getMonth() + 1}月${now.getDate()}日のミッション`, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 78, `達成 ${taken} / ${missions.length}　（毎日0時にリセット）`, { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const all = new Button(this, CARD_WIDTH - PAD - 100, height / 2, 200, 80, 'まとめて受け取る', () => this.claimAll(), { variant: 'gold', fontSize: '19px', subLabel: ready > 0 ? `${ready}件` : undefined, guard });
    all.setEnabled(ready > 0);
    container.add(all);
    return { container, height };
  }

  private missionRow(m: MissionStatus): InboxCard {
    const guard = () => this.scroll.isTap();
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, ROW_H, m.done && !m.claimed));
    container.add(body(this, PAD + 6, 28, m.def.title, { fontSize: '24px', fontStyle: 'bold', color: m.claimed ? '#8a7a5a' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));

    const barX = PAD + 6;
    const barW = 330;
    const ratio = m.progress / m.def.target;
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(barX, 56, barW, 16, 8);
    if (ratio > 0) {
      bar.fillStyle(m.done ? 0x4fc07a : 0xe0822a, 1);
      bar.fillRoundedRect(barX, 56, Math.max(16, barW * ratio), 16, 8);
    }
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(barX, 56, barW, 16, 8);
    container.add(bar);
    container.add(caption(this, barX + barW + 12, 64, `${m.progress.toLocaleString('ja-JP')} / ${m.def.target.toLocaleString('ja-JP')}`, { fontSize: '19px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    // The reward: its icon and amount.
    const tile = tileForReward(m.def.reward);
    const rewardBox = this.add.container(0, 0);
    addTileIcon(this, rewardBox, tile, PAD + 36, 92, 30);
    rewardBox.add(body(this, PAD + 62, 92, tile.amount, { fontSize: '20px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    rewardBox.setAlpha(m.claimed ? 0.4 : 1);
    container.add(rewardBox);

    const label = m.claimed ? '受け取り済み' : m.done ? '受け取る' : '未達成';
    const button = new Button(this, CARD_WIDTH - PAD - 90, ROW_H / 2, 180, 70, label, () => this.claim(m.def.id), { variant: m.done && !m.claimed ? 'gold' : 'wood', fontSize: '24px', guard });
    button.setEnabled(m.done && !m.claimed);
    container.add(button);
    return { container, height: ROW_H };
  }

  private bonusCard(missions: MissionStatus[]): InboxCard {
    const guard = () => this.scroll.isTap();
    const grid = buildRewardGrid(this, MISSION_BONUS.map(tileForReward), CARD_WIDTH - 220);
    const height = Math.max(150, 64 + grid.height + PAD);
    const container = this.add.container(0, 0);
    const claimable = MissionSystem.bonusClaimable(this.save);
    const claimed = this.save.missions.bonusClaimed;
    container.add(buildCardPanel(this, CARD_WIDTH, height, claimable));
    container.add(heading(this, PAD + 6, 32, '全部達成ボーナス', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    grid.container.setPosition(PAD, 58);
    container.add(grid.container);
    const allTaken = missions.every((m) => m.claimed);
    const label = claimed ? '受け取り済み' : allTaken ? '受け取る' : '全部受け取ると解放';
    const button = new Button(this, CARD_WIDTH - PAD - 92, height / 2, 184, 80, label, () => this.claimBonus(), { variant: claimable ? 'gold' : 'wood', fontSize: label.length > 6 ? '17px' : '24px', guard });
    button.setEnabled(claimable);
    container.add(button);
    return { container, height };
  }

  private claim(id: string): void {
    const granted = MissionSystem.claim(this.save, id);
    if (granted) this.reward('ミッション達成！', [granted]);
  }

  private claimAll(): void {
    const granted = MissionSystem.claimAll(this.save);
    if (granted.length > 0) this.reward('ミッション達成！', granted);
  }

  private claimBonus(): void {
    const granted = MissionSystem.claimBonus(this.save);
    if (granted.length > 0) this.reward('全部達成ボーナス！', granted);
  }

  private reward(title: string, granted: GrantedReward[]): void {
    SaveSystem.save(this.save);
    this.refreshResources();
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title, tiles: tilesForGranted(granted), onClose: () => this.queueRender() });
  }
}
