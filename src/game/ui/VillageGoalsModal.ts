import Phaser from 'phaser';
import { VILLAGE_MATERIALS, type MaterialBundle } from '../data/village';
import { GOAL_TIERS, VILLAGE_GOALS, goalsOfTier, type VillageGoal } from '../data/villageGoals';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { VillageGoals, type GoalPaid } from '../systems/VillageGoals';
import { Button } from './Button';
import { buildChip } from './CardParts';
import { formatSpan } from './format';
import { materialIcon } from './ItemIcons';
import { openModal, type ModalHandle } from './Modal';
import { createPanel } from './Panel';
import { addGoodIcon } from './RewardIcon';
import { showRewardModal } from './RewardModal';
import type { RewardTile } from './RewardTiles';
import { ScrollView } from './ScrollView';
import { body, caption, heading, CHROME } from './theme';
import { villageThumb } from './VillageFx';

const INK = '#1c130a';
const W = 664;
const H = 1070;
const TOP = (1280 - H) / 2;
const CARD_W = 620;
const GAP = 12;
const ROW_H = 112;

const noLock = { setEnabled: () => {} };

export interface GoalsModalHost {
  scene: Phaser.Scene;
  save: SaveData;
  /** Something was collected: the village scene saves and brings its numbers up to date. */
  onChanged(): void;
  /** 城を見る: the popup closes and the 城 is selected on the map. */
  showCastle(): void;
  /** The popup was closed. */
  onClosed(): void;
}

/** Reward chips (魔晶石, ゴールド, 木材・鉄・石) in a row from `x`; returns where they end. */
function rewardChips(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, paid: GoalPaid, size = 24, fontSize = 18): number {
  let cx = x;
  const add = (icon: Phaser.GameObjects.Image, text: string): void => {
    parent.add(icon.setPosition(cx + size / 2, y));
    const label = body(scene, cx + size + 4, y, text, { fontSize: `${fontSize}px`, fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    parent.add(label);
    cx += size + 4 + label.width + 14;
  };
  if (paid.gems > 0) add(addGoodIcon(scene, 'gems', 0, 0, size), `+${paid.gems}`);
  if (!paid.gold.isZero()) add(addGoodIcon(scene, 'gold', 0, 0, size), `+${paid.gold.toString()}`);
  for (const { id } of VILLAGE_MATERIALS) {
    const amount = paid.materials[id] ?? 0;
    if (amount > 0) add(scene.add.image(0, 0, materialIcon(scene, id, size)), `+${amount.toLocaleString('ja-JP')}`);
  }
  return cx;
}

function tilesOf(paid: GoalPaid): RewardTile[] {
  const tiles: RewardTile[] = [];
  if (paid.gems > 0) tiles.push({ kind: 'gems', amount: `+${paid.gems.toLocaleString('ja-JP')}` });
  if (!paid.gold.isZero()) tiles.push({ kind: 'gold', amount: `+${paid.gold.toString()}` });
  for (const { id } of VILLAGE_MATERIALS) {
    const amount = paid.materials[id] ?? 0;
    if (amount > 0) tiles.push({ kind: 'material', material: id, amount: `+${amount.toLocaleString('ja-JP')}` });
  }
  return tiles;
}

/** Adds up what a list of goals pays (for the teaser rows of tiers that are still far off). */
function totalGems(goals: VillageGoal[]): number {
  return goals.reduce((sum, g) => sum + (g.reward.gems ?? 0), 0);
}

/**
 * 村の目標: a popup over the village. On top the 村の発展 card - this 城 and the next side by side, what the next one asks for and
 * what it unlocks - and below it the goals, by 城 level: the level being worked on in full, the next one dimmed (it can be
 * seen and, if already met, collected), levels that are over reduced to what is left, and the far ones as a single teaser row.
 */
export function openVillageGoals(host: GoalsModalHost): ModalHandle {
  const { scene, save } = host;
  const modal = openModal(scene, noLock, 0.78, false);
  const root = modal.container;
  root.add(createPanel(scene, 360, 640, W, H, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 20, rarity: 5, gradient: false }));
  root.add(scene.add.zone(360, 640, W, H).setInteractive());
  root.add(heading(scene, 360, TOP + 46, '村の目標', { fontSize: '36px', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
  const summary = caption(scene, 360, TOP + 90, '', { fontSize: '19px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
  root.add(summary);

  const viewTop = TOP + 114;
  const viewH = H - 114 - 96;
  const scroll = new ScrollView(scene, 360 - CARD_W / 2, viewTop, CARD_W, viewH);
  // Under the popups of its own (a receipt is shown at 200), over the village.
  root.setDepth(190);
  scroll.setDepth(191);

  const guard = (): boolean => scroll.isTap() && scroll.contains(scene.input.activePointer);
  let closed = false;
  let rebuildQueued = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    scroll.destroy();
    modal.close();
    host.onClosed();
  };
  root.add(new Button(scene, 360, TOP + H - 46, 220, 58, '閉じる', close, { variant: 'wood', fontSize: '26px' }));

  /** A tall card in the list: its container goes at the running y. */
  let y = 0;
  const stack = (card: { container: Phaser.GameObjects.Container; height: number }): void => {
    card.container.setPosition(0, y);
    scroll.content.add(card.container);
    y += card.height + GAP;
  };

  // ------------------------------------------------------------ 村の発展
  const growthCard = (): { container: Phaser.GameObjects.Container; height: number } => {
    const now = Date.now();
    const next = VillageGoals.nextCastle(save, now);
    const level = VillageGoals.currentTier(save, now);
    const c = scene.add.container(0, 0);
    const panel = (height: number): void => {
      c.addAt(createPanel(scene, CARD_W / 2, height / 2, CARD_W, height, { fillColor: 0x241810, fillAlpha: 1, borderColor: CHROME.brassBright, glowColor: CHROME.brass, radius: 14, gradient: false }), 0);
    };
    c.add(heading(scene, 18, 32, '村の発展', { fontSize: '27px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    const tag = buildChip(scene, 0, 32, `村Lv.${level}`, { fill: 0xc7701c, color: '#fff4dc', fontSize: 20 });
    tag.container.setX(CARD_W - 18 - tag.width);
    c.add(tag.container);

    if (!next) {
      c.add(villageThumb(scene, 'castle', level, 200).setPosition(CARD_W / 2, 150));
      c.add(heading(scene, CARD_W / 2, 262, '村は最大レベルです', { fontSize: '27px', color: '#ffd23f', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
      panel(300);
      return { container: c, height: 300 };
    }

    // This 城, an arrow, the next one.
    c.add(scene.add.circle(CARD_W - 140, 150, 96, 0xffd23f, 0.16).setBlendMode(Phaser.BlendModes.ADD));
    c.add(villageThumb(scene, 'castle', level, 190).setPosition(140, 150));
    c.add(villageThumb(scene, 'castle', next.level, 200).setPosition(CARD_W - 140, 150));
    const arrow = scene.add.graphics();
    arrow.fillStyle(0xffd23f, 1);
    arrow.lineStyle(3, 0x4a2406, 1);
    arrow.fillTriangle(CARD_W / 2 + 22, 150, CARD_W / 2 - 14, 126, CARD_W / 2 - 14, 174);
    arrow.strokeTriangle(CARD_W / 2 + 22, 150, CARD_W / 2 - 14, 126, CARD_W / 2 - 14, 174);
    c.add(arrow);
    c.add(caption(scene, 140, 252, `Lv.${level}`, { fontSize: '22px', fontStyle: 'bold', color: '#cdbb94', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    c.add(caption(scene, CARD_W - 140, 252, `Lv.${next.level}`, { fontSize: '24px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));

    // What it takes: ゴールド and time, then the 素材 (red where there is not enough).
    const haveGold = SaveSystem.getGold(save).gte(next.gold);
    c.add(caption(scene, 18, 292, `Lv.${next.level} にするには`, { fontSize: '17px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    c.add(addGoodIcon(scene, 'gold', 32, 326, 28));
    c.add(body(scene, 54, 326, next.gold.toString(), { fontSize: '21px', fontStyle: 'bold', color: haveGold ? '#fff4dc' : '#ff9a8a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    c.add(caption(scene, CARD_W - 18, 326, `所要 ${formatSpan(next.seconds)}`, { fontSize: '19px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    let mx = 18;
    for (const { id } of VILLAGE_MATERIALS) {
      const need = (next.materials as MaterialBundle)[id] ?? 0;
      if (need <= 0) continue;
      const enough = SaveSystem.getMaterial(save, id) >= need;
      c.add(scene.add.image(mx + 14, 364, materialIcon(scene, id, 28)));
      const t = body(scene, mx + 34, 364, need.toLocaleString('ja-JP'), { fontSize: '20px', fontStyle: 'bold', color: enough ? '#fff4dc' : '#ff9a8a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
      c.add(t);
      mx += 34 + t.width + 18;
    }

    let ly = 410;
    const lines = next.unlocks.slice(0, 6);
    if (lines.length > 0) {
      c.add(heading(scene, 18, ly, `Lv.${next.level} で解放`, { fontSize: '22px', color: '#9fe39f', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      ly += 36;
      for (const line of lines) {
        c.add(caption(scene, 34, ly, `・${line.text}`, { fontSize: '19px', fontStyle: 'bold', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
        ly += 30;
      }
    }
    if (next.blocker) {
      c.add(caption(scene, CARD_W / 2, ly + 8, next.blocker, { fontSize: '17px', color: '#ffb59a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      ly += 30;
    }
    c.add(
      new Button(
        scene,
        CARD_W / 2,
        ly + 34,
        CARD_W - 36,
        46,
        '城を見る',
        () => {
          close();
          host.showCastle();
        },
        { variant: 'wood', fontSize: '20px', guard },
      ),
    );
    const height = ly + 34 + 23 + 14;
    panel(height);
    return { container: c, height };
  };

  // -------------------------------------------------------------- goals
  const goalRow = (goal: VillageGoal, dim: boolean): { container: Phaser.GameObjects.Container; height: number } => {
    const now = Date.now();
    const progress = VillageGoals.progress(save, goal, now);
    const claimed = VillageGoals.isClaimed(save, goal);
    const c = scene.add.container(0, 0);
    const lit = progress.done && !claimed;
    c.add(createPanel(scene, CARD_W / 2, ROW_H / 2, CARD_W, ROW_H - 8, { fillColor: 0x241810, fillAlpha: 1, borderColor: lit ? CHROME.brassBright : CHROME.brassDark, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
    const textColor = claimed ? '#a89a78' : dim && !progress.done ? '#c8b894' : '#fff4dc';
    c.add(body(scene, 16, 24, goal.text, { fontSize: '21px', fontStyle: 'bold', color: textColor, stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    const barW = 320;
    const bar = scene.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(16, 46, barW, 14, 7);
    bar.fillStyle(claimed ? 0x7a6a48 : progress.done ? 0x6fd36f : 0xe0822a, 1);
    if (progress.ratio > 0) bar.fillRoundedRect(16, 46, Math.max(10, barW * progress.ratio), 14, 7);
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(16, 46, barW, 14, 7);
    c.add(bar);
    const shown = VillageGoals.format(goal, claimed ? goal.target : progress.value);
    c.add(caption(scene, 16 + barW + 12, 53, `${shown} / ${VillageGoals.formatTarget(goal)}`, { fontSize: '17px', fontStyle: 'bold', color: progress.done ? '#9fe39f' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    rewardChips(scene, c, 16, 84, VillageGoals.reward(save, goal));

    const text = claimed ? '受け取り済み' : progress.done ? '受け取る' : '未達成';
    const button = new Button(scene, CARD_W - 16 - 66, 46, 132, 58, text, () => claim(goal.id), { variant: lit ? 'gold' : 'wood', fontSize: lit ? '24px' : '16px', guard });
    button.setEnabled(lit);
    c.add(button);
    if (dim) c.setAlpha(0.8);
    return { container: c, height: ROW_H };
  };

  const tierHeader = (tier: number, note: string, color: number, claimedAll = false): { container: Phaser.GameObjects.Container; height: number } => {
    const c = scene.add.container(0, 0);
    const s = VillageGoals.tierSummary(save, tier);
    c.add(createPanel(scene, CARD_W / 2, 26, CARD_W, 50, { fillColor: color, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
    c.add(heading(scene, 16, 26, `城Lv.${tier} の目標`, { fontSize: '23px', color: '#fff4dc', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    c.add(caption(scene, CARD_W - 16, 26, claimedAll ? 'すべて達成' : `${s.claimed}/${s.total} 達成${s.waiting > 0 ? `　受け取れる ${s.waiting}` : ''}${note ? `　${note}` : ''}`, { fontSize: '17px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    return { container: c, height: 56 };
  };

  const teaser = (tier: number): { container: Phaser.GameObjects.Container; height: number } => {
    const goals = goalsOfTier(tier);
    const c = scene.add.container(0, 0);
    c.add(createPanel(scene, CARD_W / 2, 36, CARD_W, 72, { fillColor: 0x1a120b, fillAlpha: 1, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
    c.add(heading(scene, 16, 26, `城Lv.${tier} の目標`, { fontSize: '21px', color: '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    c.add(caption(scene, 16, 54, `${goals.length}個　報酬 魔晶石 合計 ${totalGems(goals)} ほか`, { fontSize: '16px', color: '#8a7a5a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    c.add(caption(scene, CARD_W - 16, 36, `城Lv.${tier} で解放`, { fontSize: '17px', fontStyle: 'bold', color: '#9a8a6a', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    return { container: c, height: 76 };
  };

  const build = (): void => {
    const keep = scroll.getScroll();
    scroll.content.removeAll(true);
    y = 0;
    const now = Date.now();
    const current = VillageGoals.currentTier(save, now);
    const waiting = VillageGoals.claimable(save, now).length;
    const claimedTotal = VILLAGE_GOALS.filter((g) => VillageGoals.isClaimed(save, g)).length;
    summary.setText(`達成 ${claimedTotal} / ${VILLAGE_GOALS.length}${waiting > 0 ? `　受け取れる ${waiting}` : ''}`);
    summary.setColor(waiting > 0 ? '#ffd23f' : '#d8c49a');

    stack(growthCard());
    for (let tier = 1; tier <= GOAL_TIERS; tier++) {
      const goals = goalsOfTier(tier);
      const left = goals.filter((g) => !VillageGoals.isClaimed(save, g));
      if (tier < current) {
        // A level that is over: only what is left (or a note that it is all done).
        if (left.length === 0) {
          stack(tierHeader(tier, '', 0x3a2f1a, true));
          continue;
        }
        stack(tierHeader(tier, '', 0x4a3a1c));
        for (const g of left) stack(goalRow(g, false));
      } else if (tier === current) {
        stack(tierHeader(tier, 'いまここ', 0xc7701c));
        // Collected goals sink to the bottom of their level.
        for (const g of [...goals.filter((x) => !VillageGoals.isClaimed(save, x)), ...goals.filter((x) => VillageGoals.isClaimed(save, x))]) stack(goalRow(g, false));
      } else if (tier === current + 1) {
        stack(tierHeader(tier, '次の目標', 0x3a4f7a));
        for (const g of goals) stack(goalRow(g, true));
      } else {
        stack(teaser(tier));
      }
    }
    scroll.setContentHeight(Math.max(1, y - GAP));
    scroll.scrollTo(keep);
  };

  const claim = (id: string): void => {
    if (closed) return;
    const paid = VillageGoals.claim(save, id);
    if (!paid) return;
    host.onChanged();
    // The list is redrawn when the receipt is closed (and not from this tap: it would destroy the button mid-click).
    showRewardModal(scene, scroll, { title: '目標を達成しました', tiles: tilesOf(paid), onClose: () => queueRebuild() });
  };
  const queueRebuild = (): void => {
    if (closed || rebuildQueued) return;
    rebuildQueued = true;
    scene.time.delayedCall(0, () => {
      rebuildQueued = false;
      if (!closed) build();
    });
  };

  build();
  return { container: root, close };
}
