import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { FINAL_STAGE_INDEX, STAGES_PER_REGION, EXTRA_STAGES_PER_REGION, EXTRA_STAGE_COUNT } from '../systems/ProgressionSystem';
import { StaminaSystem, stageStaminaCost } from '../systems/StaminaSystem';
import { questRoute, questStageName, type QuestStage } from '../systems/QuestRoute';
import { REGIONS, REGION_COUNT, type RegionDef } from '../data/regions';
import { BackButton } from '../ui/BackButton';
import { BottomNavBar } from '../ui/BottomNavBar';
import { openConfirm, type ConfirmOptions } from '../ui/Dialogs';
import type { ModalHandle } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { ResourceBar } from '../ui/ResourceBar';
import type { ScrollView } from '../ui/ScrollView';
import { buildFramedScrollView, buildTitlePlate, SCREEN_VIEW } from '../ui/ScreenFrame';
import { applyBackground } from '../ui/Background';
import type { StageNodeState } from '../ui/Icons';
import { buildRegionBackdrop, drawPadlock, drawRoad, mixColor, stageMedallion, type MedallionKind, type RoadPoint } from '../ui/StageMap';
import { showToast } from '../ui/Toast';
import { body, caption, heading, CHROME, COLORS } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';

/** 0-4 = a region's 30-stage page (region 4's page also carries the final
 *  battle node); 'extra' = the post-ending Extra page. */
type TabKey = number | 'extra';

/** Height of the pinned tab row at the top of the map frame, and the gap under it. */
const TAB_H = 64;
const TAB_GAP = 10;
const INK = '#1c130a';

/** Where the map's nodes sit (content coordinates, relative to the scroll view). */
const HEADER_H = 132;
const MAP_TOP = 190;
const COLS = 5;
const ROW_H = 150;
const MARGIN_X = 72;

const SIZE = { normal: 64, goal: 76, boss: 84, final: 104 } as const;

/** Full-screen quest map, split out of HomeScene so the home screen itself can
 *  stay a character-first hub. A tab row across the top (the five regions, then
 *  the post-ending Extra) switches pages; a region's page is one winding road of
 *  30 stages over that region's scenery (RegionDef.look, or its own artwork),
 *  scrolled to the stage to play next. Tapping an unread region's first node
 *  (or the final battle / an Extra group's first node) routes through
 *  StoryScene before Battle instead of straight into it. Switching tabs
 *  restarts the scene (`initialTab` comes back through init()) rather than
 *  tearing down/rebuilding a ScrollView by hand - ScrollView's own cleanup only
 *  runs on scene shutdown, so this sidesteps leaking its content/scrollbar
 *  graphics across tab switches. */
export class StageSelectScene extends Phaser.Scene {
  private activeTab: TabKey = 0;
  private view!: ScrollView;
  private modal?: ModalHandle;

  constructor() {
    super('StageSelect');
  }

  init(data: { initialTab?: TabKey } = {}): void {
    // Without a tab asked for, open the region the next stage to play is in.
    const save: SaveData = this.game.registry.get('save');
    this.activeTab = data.initialTab ?? Math.min(REGION_COUNT - 1, Math.floor(save.stageProgress / STAGES_PER_REGION));
    this.modal = undefined;
  }

  create(): void {
    const save = this.getSave();
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'stage_select');

    const resourceBar = new ResourceBar(this, 0, 0, 720);
    resourceBar.update(save);
    enter(this, resourceBar, { dy: -20, duration: 280 });

    buildTitlePlate(this, 'クエスト');
    this.view = buildFramedScrollView(this, TAB_H + TAB_GAP);
    this.buildTabs(save);
    if (this.activeTab === 'extra') this.buildExtraPage(save);
    else this.buildRegionPage(this.activeTab, save);

    new BottomNavBar(this, 720, 1280, null);
    enter(this, new BackButton(this, () => this.scene.start('Home')), { dx: -40, dy: 0, duration: 300, delay: 250 });
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  // --------------------------------------------------------------- tabs --

  private isRegionUnlocked(regionIndex: number, save: SaveData): boolean {
    return regionIndex === 0 || save.stageProgress >= regionIndex * STAGES_PER_REGION;
  }

  private isExtraUnlocked(save: SaveData): boolean {
    return save.storyFlags.ending;
  }

  /** Stages of region `r` cleared so far (0..30). */
  private clearedIn(r: number, save: SaveData): number {
    return Math.max(0, Math.min(STAGES_PER_REGION, save.stageProgress - r * STAGES_PER_REGION));
  }

  private buildTabs(save: SaveData): void {
    const keys: TabKey[] = [0, 1, 2, 3, 4, 'extra'];
    const gap = 6;
    const w = (SCREEN_VIEW.w - gap * (keys.length - 1)) / keys.length;

    const tabs = keys.map((key, i) => {
      const unlocked = key === 'extra' ? this.isExtraUnlocked(save) : this.isRegionUnlocked(key, save);
      const active = key === this.activeTab;
      const accent = key === 'extra' ? COLORS.gold : REGIONS[key].themeColor;
      const container = this.add.container(SCREEN_VIEW.x + i * (w + gap) + w / 2, SCREEN_VIEW.y + TAB_H / 2);

      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(-w / 2, -TAB_H / 2 + 3, w, TAB_H, 10);
      g.fillStyle(active ? mixColor(CHROME.woodFill, accent, 0.4) : unlocked ? CHROME.woodFill : CHROME.woodGrain, 1);
      g.fillRoundedRect(-w / 2, -TAB_H / 2, w, TAB_H, 10);
      g.fillStyle(accent, unlocked ? 1 : 0.25);
      g.fillRoundedRect(-w / 2 + 8, TAB_H / 2 - 9, w - 16, 5, 2);
      g.lineStyle(active ? 3 : 2, unlocked ? (active ? CHROME.brassBright : CHROME.brass) : CHROME.brassDark, unlocked ? 1 : 0.5);
      g.strokeRoundedRect(-w / 2, -TAB_H / 2, w, TAB_H, 10);
      if (!unlocked) drawPadlock(g, w / 2 - 15, -TAB_H / 2 + 15, 0.9, CHROME.brassDark);
      container.add(g);

      const name = key === 'extra' ? 'EX' : REGIONS[key].name;
      const count = key === 'extra' ? `${save.extraProgress}/${EXTRA_STAGE_COUNT}` : `${this.clearedIn(key, save)}/${STAGES_PER_REGION}`;
      const labelColor = unlocked ? (active ? '#ffe9b8' : '#e8dcc0') : '#7a6a4a';
      container.add(body(this, 0, unlocked ? -9 : -2, name, { fontSize: key === 'extra' ? '24px' : '18px', fontStyle: 'bold', color: labelColor, stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      if (unlocked) container.add(caption(this, 0, 13, count, { fontSize: '15px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));

      const hit = this.add.zone(0, 0, w, TAB_H).setOrigin(0.5);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (!unlocked) {
          showToast(this, key === 'extra' ? 'エンディング後に解放されます' : '前の地方をクリアすると解放されます', '#ffd9a0');
          return;
        }
        if (key !== this.activeTab) this.scene.restart({ initialTab: key });
      });
      container.add(hit);
      return container;
    });

    enterStagger(this, tabs, { dy: -10, duration: 260, delay: 80, stagger: 40 });
  }

  // --------------------------------------------------------------- pages --

  /** Name plate across the top of a page: title, how far along, and a line of flavor. */
  private buildHeaderCard(title: string, description: string, done: number, total: number, accent: number): Phaser.GameObjects.GameObject[] {
    const w = SCREEN_VIEW.w;
    const top = 8;
    const h = HEADER_H - 16;
    const panel = createPanel(this, w / 2, top + h / 2, w - 16, h, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false });
    const name = heading(this, 28, top + 28, title, { fontSize: '30px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5);
    const progress = body(this, w - 28, top + 28, `${done} / ${total}`, { fontSize: '24px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5);
    const desc = caption(this, 28, top + 62, description, { fontSize: '17px', color: '#d8c49a', stroke: INK, strokeThickness: 3, wordWrap: { width: w - 72, useAdvancedWrap: true } }).setOrigin(0, 0.5);

    const barX = 28;
    const barW = w - 56;
    const barY = top + h - 22;
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(barX, barY, barW, 12, 6);
    if (done > 0) {
      bar.fillStyle(accent, 1);
      bar.fillRoundedRect(barX, barY, Math.max(12, barW * Math.min(1, done / total)), 12, 6);
    }
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(barX, barY, barW, 12, 6);
    return [panel, name, progress, desc, bar];
  }

  private nodeState(index: number, progress: number): StageNodeState {
    return index < progress ? 'cleared' : index === progress ? 'unlocked' : 'locked';
  }

  /** One region: header, then a serpentine road of its 30 stages (plus the final
   *  battle at the end of the last region), rows of five, over the region's scenery. */
  private buildRegionPage(regionIndex: number, save: SaveData): void {
    const region = REGIONS[regionIndex];
    const view = this.view;
    const w = SCREEN_VIEW.w;
    const base = regionIndex * STAGES_PER_REGION;
    const hasFinal = regionIndex === REGION_COUNT - 1;
    const count = STAGES_PER_REGION + (hasFinal ? 1 : 0);
    const rows = STAGES_PER_REGION / COLS;
    const step = (w - MARGIN_X * 2) / (COLS - 1);

    const points: RoadPoint[] = [];
    for (let local = 0; local < count; local++) {
      if (local === STAGES_PER_REGION) {
        points.push({ x: w / 2, y: MAP_TOP + rows * ROW_H });
        continue;
      }
      const row = Math.floor(local / COLS);
      const i = local % COLS;
      const col = row % 2 === 0 ? i : COLS - 1 - i;
      points.push({ x: MARGIN_X + col * step, y: MAP_TOP + row * ROW_H + Math.sin(local * 0.8) * 12 });
    }
    const contentHeight = points[count - 1].y + (hasFinal ? 100 : 90);

    const progress = save.stageProgress - base;
    const litUpTo = Math.max(0, Math.min(count - 1, progress));
    const content = view.content;
    // The scenery runs on under the 戻る button's room too, so scrolling to the end shows no bare strip.
    content.add(buildRegionBackdrop(this, region, w, contentHeight + BackButton.ROOM));
    content.add(drawRoad(this, points, region.themeColor, litUpTo));
    content.add(this.buildHeaderCard(region.name, region.mapDescription, this.clearedIn(regionIndex, save), STAGES_PER_REGION, region.themeColor));

    const nodes: Phaser.GameObjects.Container[] = [];
    points.forEach((p, local) => {
      const globalIndex = base + local;
      const isFinal = local === STAGES_PER_REGION;
      const kind: MedallionKind = isFinal ? 'final' : local === STAGES_PER_REGION - 1 ? 'goal' : 'normal';
      const node = stageMedallion(this, {
        state: this.nodeState(globalIndex, save.stageProgress),
        size: SIZE[kind],
        accent: isFinal ? COLORS.gold : region.themeColor,
        kind,
        label: isFinal ? '最終\n決戦' : `${local + 1}`,
        guard: () => view.isTap(),
        onTap: isFinal
          ? () => this.askToEnter({ kind: 'final', index: FINAL_STAGE_INDEX })
          : () => this.askToEnter({ kind: 'main', index: globalIndex }),
      });
      node.setPosition(p.x, p.y);
      content.add(node);
      nodes.push(node);
    });

    view.setContentHeight(contentHeight);
    // Open on the stage to play next (a region already finished opens at its top).
    if (progress >= 0 && progress < count) view.scrollTo(points[progress].y - 300);
    enterStagger(this, nodes, { dy: 14, duration: 280, delay: 100, stagger: 14 });
  }

  /** Extra: the five regions' six-stage after-stories, one road each, the sixth a boss. */
  private buildExtraPage(save: SaveData): void {
    const view = this.view;
    const w = SCREEN_VIEW.w;
    const bannerH = 50;
    const groupH = 230;
    const top = HEADER_H;
    const content = view.content;
    const contentHeight = top + REGION_COUNT * groupH + 10;

    const base = this.add.graphics();
    base.fillGradientStyle(0x120a1c, 0x120a1c, 0x2a1030, 0x2a1030, 1);
    base.fillRect(0, 0, w, contentHeight + BackButton.ROOM);
    content.add(base);
    content.add(this.buildHeaderCard('エクストラ: 野に放たれた狂獣', 'エンディング後に挑戦できる、各地方の後日談。', save.extraProgress, EXTRA_STAGE_COUNT, COLORS.gold));

    const nodes: Phaser.GameObjects.Container[] = [];
    REGIONS.forEach((region: RegionDef, r) => {
      const groupTop = top + r * groupH;
      const backdrop = buildRegionBackdrop(this, region, w, groupH - 10, false);
      backdrop.setPosition(0, groupTop + 5);
      content.add(backdrop);
      const dim = this.add.graphics();
      dim.fillStyle(0x000000, 0.32);
      dim.fillRect(0, groupTop + 5, w, groupH - 10);
      content.add(dim);

      const banner = this.add.graphics();
      banner.fillStyle(CHROME.woodFill, 0.95);
      banner.fillRect(0, groupTop + 5, w, bannerH);
      banner.fillStyle(region.themeColor, 1);
      banner.fillRect(0, groupTop + 5, 8, bannerH);
      banner.lineStyle(2, CHROME.brassDark, 1);
      banner.lineBetween(0, groupTop + 5 + bannerH, w, groupTop + 5 + bannerH);
      content.add(banner);
      content.add(body(this, 24, groupTop + 5 + bannerH / 2, `${region.name}（特別）`, { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      const done = Math.max(0, Math.min(EXTRA_STAGES_PER_REGION, save.extraProgress - r * EXTRA_STAGES_PER_REGION));
      content.add(body(this, w - 20, groupTop + 5 + bannerH / 2, `${done} / ${EXTRA_STAGES_PER_REGION}`, { fontSize: '20px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));

      const step = (w - 64 * 2) / (EXTRA_STAGES_PER_REGION - 1);
      const points: RoadPoint[] = Array.from({ length: EXTRA_STAGES_PER_REGION }, (_, c) => ({ x: 64 + c * step, y: groupTop + bannerH + 105 + Math.sin(c * 1.3 + r) * 12 }));
      content.add(drawRoad(this, points, region.themeColor, done));

      points.forEach((p, c) => {
        const idx = r * EXTRA_STAGES_PER_REGION + c;
        const isBoss = c === EXTRA_STAGES_PER_REGION - 1;
        const node = stageMedallion(this, {
          state: this.nodeState(idx, save.extraProgress),
          size: isBoss ? SIZE.boss : SIZE.normal,
          accent: region.themeColor,
          kind: isBoss ? 'boss' : 'normal',
          label: isBoss ? '★' : `${c + 1}`,
          guard: () => view.isTap(),
          onTap: () => this.askToEnter({ kind: 'extra', index: idx }),
        });
        node.setPosition(p.x, p.y);
        content.add(node);
        nodes.push(node);
      });
    });

    view.setContentHeight(contentHeight);
    // Open on the group holding the stage to play next (all cleared: at the top).
    const nextGroup = Math.floor(save.extraProgress / EXTRA_STAGES_PER_REGION);
    view.scrollTo(nextGroup === 0 || nextGroup >= REGION_COUNT ? 0 : top + nextGroup * groupH - 40);
    enterStagger(this, nodes, { dy: 14, duration: 280, delay: 100, stagger: 10 });
  }

  // ------------------------------------------------------------- routes --

  /** Tapping a stage never spends anything by itself: it opens a popup showing
   *  the stamina cost, and only 出撃 takes it and then goes on (to the story
   *  scene or the battle, see questRoute). Without enough stamina (or a formation) it says so
   *  and points at where to fix that instead. */
  private askToEnter(stage: QuestStage): void {
    if (this.modal?.container.active) return;
    const save = this.getSave();
    const cost = stageStaminaCost(stage.kind, stage.index);

    const party = SaveSystem.getPartyHeroes(save);
    if (party.front.length + party.back.length === 0) {
      this.openDialog({
        title: '編成が空です',
        message: 'パーティが空のため出撃できません。\n名鑑で編成しますか？',
        confirmLabel: '名鑑へ',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Roster'),
      });
      return;
    }

    const name = questStageName(stage);
    if (!StaminaSystem.canAfford(save, cost)) {
      const wait = StaminaSystem.formatDuration(StaminaSystem.secondsUntil(save, cost));
      this.openDialog({
        title: 'スタミナが足りません',
        message: `${name}はスタミナ ${cost} 必要です。（現在 ${save.stamina[0]}）\n回復まで あと ${wait}\nショップでスタミナを回復しますか？`,
        confirmLabel: 'ショップへ',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Shop', { focus: 'stamina' }),
      });
      return;
    }

    const have = save.stamina[0];
    this.openDialog({
      title: name,
      message: `スタミナ ${cost} を消費して出撃します。\n（現在 ${have} → ${have - cost}）`,
      confirmLabel: '出撃',
      confirmVariant: 'gold',
      onConfirm: () => {
        if (!StaminaSystem.spend(save, cost)) return;
        SaveSystem.save(save);
        const route = questRoute(save, stage);
        this.scene.start(route.scene, route.data);
      },
    });
  }

  private openDialog(opts: ConfirmOptions): void {
    this.modal = openConfirm(this, this.view, opts);
  }
}
