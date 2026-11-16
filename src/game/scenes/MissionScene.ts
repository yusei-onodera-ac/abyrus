import { MISSION_GROUPS, getMissionGroup, type MissionGroup } from '../data/missions';
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

/** ミッション: three tabs - デイリー (starts over every day), ウィークリー (every Monday) and
 *  実績 (never; each taken once) - each with its list, progress bars and 受け取る buttons, a
 *  まとめて受け取る for everything met, and (daily / weekly) the bonus for taking them all. */
export class MissionScene extends InboxScene {
  protected readonly screenTitle = 'ミッション';
  protected emptyText = '';
  private group: MissionGroup = 'daily';

  constructor() {
    super('Mission');
  }

  init(data?: { group?: MissionGroup }): void {
    super.init(data);
    this.group = data?.group ?? 'daily';
  }

  protected buildCards(): InboxCard[] {
    const missions = MissionSystem.list(this.save, this.group);
    const cards: InboxCard[] = [this.tabsCard(), this.headerCard(missions)];
    for (const m of this.ordered(missions)) cards.push(this.missionRow(m));
    if (MissionSystem.hasBonus(this.group)) cards.push(this.bonusCard(missions));
    return cards;
  }

  /** 実績 is long: what can be taken first, then what is still open, then what is done. */
  private ordered(missions: MissionStatus[]): MissionStatus[] {
    if (this.group !== 'total') return missions;
    const rank = (m: MissionStatus): number => (m.claimed ? 2 : m.done ? 0 : 1);
    return [...missions].sort((a, b) => rank(a) - rank(b));
  }

  private tabsCard(): InboxCard {
    const guard = () => this.scroll.isTap();
    const height = 96;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    const gap = 10;
    const w = (CARD_WIDTH - PAD * 2 - gap * (MISSION_GROUPS.length - 1)) / MISSION_GROUPS.length;
    MISSION_GROUPS.forEach((g, i) => {
      const x = PAD + w / 2 + i * (w + gap);
      const selected = g.id === this.group;
      container.add(new Button(this, x, height / 2, w, 68, g.short, () => this.pick(g.id), { variant: selected ? 'gold' : 'wood', fontSize: g.short.length > 5 ? '23px' : '28px', guard }));
      if (MissionSystem.groupHasReward(this.save, g.id)) {
        const dot = this.add.graphics();
        dot.fillStyle(0x1b1d29, 1);
        dot.fillCircle(x + w / 2 - 10, 16, 11);
        dot.fillStyle(0xff4d4d, 1);
        dot.fillCircle(x + w / 2 - 10, 16, 8);
        container.add(dot);
      }
    });
    return { container, height };
  }

  private pick(group: MissionGroup): void {
    if (group === this.group) return;
    this.group = group;
    this.scroll.scrollTo(0);
    this.queueRender();
  }

  private headerCard(missions: MissionStatus[]): InboxCard {
    const guard = () => this.scroll.isTap();
    const def = getMissionGroup(this.group);
    const met = missions.filter((m) => m.done).length;
    const ready = MissionSystem.claimable(this.save, this.group).length;
    const height = 132;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 34, def.name, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 74, `達成 ${met} / ${missions.length}`, { fontSize: '21px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 102, def.resetNote, { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
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
    const barW = 296;
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
    const bonus = getMissionGroup(this.group).bonus ?? [];
    const grid = buildRewardGrid(this, bonus.map(tileForReward), CARD_WIDTH - 220);
    const height = Math.max(150, 64 + grid.height + PAD);
    const container = this.add.container(0, 0);
    const claimable = MissionSystem.bonusClaimable(this.save, this.group);
    const claimed = MissionSystem.bonusClaimed(this.save, this.group);
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
    const granted = MissionSystem.claim(this.save, this.group, id);
    if (granted) this.reward('ミッション達成！', [granted]);
  }

  private claimAll(): void {
    const granted = MissionSystem.claimAll(this.save, this.group);
    if (granted.length > 0) this.reward('ミッション達成！', granted);
  }

  private claimBonus(): void {
    const granted = MissionSystem.claimBonus(this.save, this.group);
    if (granted.length > 0) this.reward('全部達成ボーナス！', granted);
  }

  private reward(title: string, granted: GrantedReward[]): void {
    SaveSystem.save(this.save);
    this.refreshResources();
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title, tiles: tilesForGranted(granted), onClose: () => this.queueRender() });
  }
}
