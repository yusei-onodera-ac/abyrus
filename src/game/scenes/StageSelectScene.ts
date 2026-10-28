import Phaser from 'phaser';
import type { SaveData } from '../systems/SaveSystem';
import { FINAL_STAGE_INDEX, STAGES_PER_REGION, EXTRA_STAGES_PER_REGION, EXTRA_STAGE_COUNT } from '../systems/ProgressionSystem';
import { REGIONS, REGION_COUNT } from '../data/regions';
import { getRegionIntroScript, getFinalIntroScript, getExtraIntroScript } from '../data/storyScript';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { ScrollView } from '../ui/ScrollView';
import { applyBackground } from '../ui/Background';
import { stageNodeIcon, type StageNodeState } from '../ui/Icons';
import { heading, sectionLabel, caption, COLORS } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';

/** 0-4 = a region's 30-stage page (region 4's page also carries the final
 *  battle node); 'extra' = the post-ending Extra page. */
type TabKey = number | 'extra';

const NODE_SIZE = 64;
const FINAL_NODE_SIZE = 100;

/** Full-screen stage/quest picker, split out of HomeScene so the home
 *  screen itself can stay a character-first hub. Rebuilt as a 5-region
 *  map (plus the post-ending Extra page) for the Quest campaign: a tab row
 *  across the top switches pages, each page is a scrollable node grid
 *  (ScrollView - same component the Gacha screen's list uses), and tapping
 *  an unread region's first node (or the final battle / an Extra group's
 *  first node) routes through StoryScene before Battle instead of
 *  straight into it. Switching tabs restarts the scene (`initialTab` comes
 *  back through init()) rather than tearing down/rebuilding a ScrollView
 *  by hand - ScrollView's own cleanup only runs on scene shutdown, so this
 *  sidesteps leaking its content/scrollbar graphics across tab switches. */
export class StageSelectScene extends Phaser.Scene {
  private activeTab: TabKey = 0;

  constructor() {
    super('StageSelect');
  }

  init(data: { initialTab?: TabKey } = {}): void {
    this.activeTab = data.initialTab ?? 0;
  }

  create(): void {
    const save = this.getSave();
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'stage_select');

    const title = heading(this, 360, 56, 'クエスト', { fontSize: '28px' }).setOrigin(0.5);
    enter(this, title, { dy: -14, duration: 340 });

    this.buildBackButton();
    this.buildTabs(save);
    this.buildHeaderInfo(save);
    this.buildNodeGrid(save);
  }

  private getSave(): SaveData {
    return this.game.registry.get('save');
  }

  private buildBackButton(): void {
    const btn = new Button(this, 115, 56, 190, 60, '戻る', () => this.scene.start('Home'), { variant: 'ghost', fontSize: '15px' });
    enter(this, btn, { duration: 260 });
  }

  // --------------------------------------------------------------- tabs --

  private isRegionUnlocked(regionIndex: number, save: SaveData): boolean {
    return regionIndex === 0 || save.stageProgress >= regionIndex * STAGES_PER_REGION;
  }

  private isExtraUnlocked(save: SaveData): boolean {
    return save.storyFlags.ending;
  }

  private buildTabs(save: SaveData): void {
    const keys: TabKey[] = [0, 1, 2, 3, 4, 'extra'];
    const tabWidth = 104;
    const totalWidth = tabWidth * keys.length;
    const startX = 360 - totalWidth / 2 + tabWidth / 2;
    const y = 118;

    const containers = keys.map((key, i) => {
      const x = startX + i * tabWidth;
      const unlocked = key === 'extra' ? this.isExtraUnlocked(save) : this.isRegionUnlocked(key, save);
      const active = key === this.activeTab;
      const accent = key === 'extra' ? COLORS.gold : REGIONS[key].themeColor;

      const container = this.add.container(x, y);
      const panel = createPanel(this, 0, 0, tabWidth - 8, 56, {
        fillColor: active ? 0x2a2c3d : unlocked ? COLORS.panelFill : 0x14151e,
        fillAlpha: unlocked ? (active ? 1 : 0.85) : 0.55,
        borderColor: unlocked ? accent : COLORS.border,
        glowColor: unlocked ? accent : COLORS.border,
        borderWidth: active ? 3 : 2,
        radius: 10,
        gradient: false,
      });
      container.add(panel);

      const label = key === 'extra' ? 'EX' : REGIONS[key].name;
      const text = caption(this, 0, 0, unlocked ? label : 'ロック', {
        fontSize: key === 'extra' ? '15px' : '12px',
        color: unlocked ? (active ? '#ffe9b8' : '#f0ecff') : '#60627a',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: tabWidth - 16, useAdvancedWrap: true },
      }).setOrigin(0.5);
      container.add(text);

      const hitZone = this.add.zone(0, 0, tabWidth - 8, 56).setOrigin(0.5);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.on('pointerup', () => {
        if (!unlocked) {
          this.showToast(key === 'extra' ? 'エンディング後に解放されます' : '前の地方をクリアすると解放されます');
          return;
        }
        if (key !== this.activeTab) this.scene.restart({ initialTab: key });
      });
      container.add(hitZone);

      return container;
    });

    enterStagger(this, containers, { dy: -10, duration: 260, delay: 80, stagger: 40 });
  }

  // ------------------------------------------------------------- header --

  private buildHeaderInfo(save: SaveData): void {
    if (this.activeTab === 'extra') {
      const label = sectionLabel(this, 40, 188, 'エクストラ: 野に放たれた狂獣');
      const desc = caption(this, 40, 210, 'エンディング後に挑戦できる、各地方の後日談。', { fontSize: '12px', color: '#9a93b8' });
      const progress = caption(this, 680, 190, `${save.extraProgress}/${EXTRA_STAGE_COUNT}`, { fontSize: '13px' }).setOrigin(1, 0);
      [label, desc, progress].forEach((t) => enter(this, t, { duration: 260 }));
      return;
    }

    const region = REGIONS[this.activeTab];
    const cleared = Math.max(0, Math.min(STAGES_PER_REGION, save.stageProgress - this.activeTab * STAGES_PER_REGION));
    const label = sectionLabel(this, 40, 188, region.name);
    const desc = caption(this, 40, 210, region.mapDescription, { fontSize: '12px', color: '#9a93b8', wordWrap: { width: 560, useAdvancedWrap: true } });
    const progress = caption(this, 680, 190, `${cleared}/${STAGES_PER_REGION}`, { fontSize: '13px' }).setOrigin(1, 0);
    [label, desc, progress].forEach((t) => enter(this, t, { duration: 260 }));
  }

  // --------------------------------------------------------------- grid --

  private buildNodeGrid(save: SaveData): void {
    const viewTop = 244;
    const viewHeight = 1280 - viewTop - 36;
    const view = new ScrollView(this, 30, viewTop, 660, viewHeight);

    if (this.activeTab === 'extra') this.buildExtraNodes(view, save);
    else this.buildRegionNodes(view, this.activeTab, save);
  }

  private makeNode(size: number, state: StageNodeState, label: string, onTap: () => void): Phaser.GameObjects.Container {
    const node = this.add.container(0, 0);
    const icon = this.add.image(0, 0, stageNodeIcon(this, state, size));
    const text = this.add.text(0, 0, label, { fontSize: size >= 90 ? '16px' : '15px', color: state === 'locked' ? '#60627a' : '#ffffff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
    node.add([icon, text]);
    node.setSize(size, size);

    if (state !== 'locked') {
      // See the hit-area note in the original stage grid: Container
      // hit-testing adds displayOriginX/Y (half width/height) before
      // testing the hit area shape, so the circle must be centered at
      // (halfSize, halfSize) rather than the container's own local (0, 0).
      const half = size / 2;
      node.setInteractive(new Phaser.Geom.Circle(half, half, half), Phaser.Geom.Circle.Contains);
      if (node.input) node.input.cursor = 'pointer';
      node.on('pointerover', () => this.tweens.add({ targets: node, scale: 1.08, duration: 100 }));
      node.on('pointerout', () => this.tweens.add({ targets: node, scale: 1, duration: 120 }));
      node.on('pointerdown', () => this.tweens.add({ targets: node, scale: 0.92, duration: 60 }));
      node.on('pointerup', onTap);
    }
    return node;
  }

  private buildRegionNodes(view: ScrollView, regionIndex: number, save: SaveData): void {
    const perRow = 5;
    const spacingX = 660 / perRow;
    const spacingY = 128;
    const nodes: Phaser.GameObjects.Container[] = [];
    const linkLine = this.add.graphics();
    view.content.add(linkLine);

    const posFor = (local: number) => {
      const col = local % perRow;
      const row = Math.floor(local / perRow);
      return { x: col * spacingX + spacingX / 2, y: row * spacingY + 70 };
    };

    for (let local = 0; local < STAGES_PER_REGION; local++) {
      const globalIndex = regionIndex * STAGES_PER_REGION + local;
      const { x, y } = posFor(local);
      const unlocked = globalIndex <= save.stageProgress;
      const cleared = globalIndex < save.stageProgress;
      const state: StageNodeState = cleared ? 'cleared' : unlocked ? 'unlocked' : 'locked';

      if (local > 0) {
        const prev = posFor(local - 1);
        linkLine.lineStyle(3, unlocked ? REGIONS[regionIndex].themeColor : COLORS.border, unlocked ? 0.6 : 0.4);
        linkLine.beginPath();
        linkLine.moveTo(prev.x, prev.y);
        linkLine.lineTo(x, y);
        linkLine.strokePath();
      }

      const node = this.makeNode(NODE_SIZE, state, `${local + 1}`, () => this.enterMainStage(globalIndex, regionIndex, local));
      node.setPosition(x, y);
      view.content.add(node);
      nodes.push(node);
    }

    let contentHeight = Math.ceil(STAGES_PER_REGION / perRow) * spacingY + 40;

    if (regionIndex === REGION_COUNT - 1) {
      const finalRow = Math.ceil(STAGES_PER_REGION / perRow);
      const fx = 330;
      const fy = finalRow * spacingY + 90;
      const unlocked = save.stageProgress >= FINAL_STAGE_INDEX;
      const cleared = save.stageProgress > FINAL_STAGE_INDEX;
      const state: StageNodeState = cleared ? 'cleared' : unlocked ? 'unlocked' : 'locked';

      const lastMain = posFor(STAGES_PER_REGION - 1);
      linkLine.lineStyle(3, unlocked ? COLORS.gold : COLORS.border, unlocked ? 0.7 : 0.4);
      linkLine.beginPath();
      linkLine.moveTo(lastMain.x, lastMain.y);
      linkLine.lineTo(fx, fy);
      linkLine.strokePath();

      const finalNode = this.makeNode(FINAL_NODE_SIZE, state, '最終決戦', () => this.enterFinalStage());
      finalNode.setPosition(fx, fy);
      view.content.add(finalNode);
      nodes.push(finalNode);
      contentHeight = fy + FINAL_NODE_SIZE / 2 + 40;
    }

    view.setContentHeight(contentHeight);
    enterStagger(this, nodes, { dy: 14, duration: 280, delay: 100, stagger: 14 });
  }

  private buildExtraNodes(view: ScrollView, save: SaveData): void {
    const nodeSpacingX = 100;
    const groupHeight = 128;
    const nodes: Phaser.GameObjects.Container[] = [];
    let y = 26;

    for (let r = 0; r < REGION_COUNT; r++) {
      const region = REGIONS[r];
      const label = sectionLabel(this, 10, y, region.name, { fontSize: '13px' });
      view.content.add(label);
      const rowY = y + 48;

      for (let c = 0; c < EXTRA_STAGES_PER_REGION; c++) {
        const idx = r * EXTRA_STAGES_PER_REGION + c;
        const isBoss = c === EXTRA_STAGES_PER_REGION - 1;
        const unlocked = idx <= save.extraProgress;
        const cleared = idx < save.extraProgress;
        const state: StageNodeState = cleared ? 'cleared' : unlocked ? 'unlocked' : 'locked';
        const size = isBoss ? 76 : NODE_SIZE;

        const node = this.makeNode(size, state, isBoss ? '★' : `${c + 1}`, () => this.enterExtraStage(idx, r));
        node.setPosition(30 + c * nodeSpacingX, rowY);
        view.content.add(node);
        nodes.push(node);
      }
      y += groupHeight;
    }

    view.setContentHeight(y + 20);
    enterStagger(this, nodes, { dy: 14, duration: 280, delay: 100, stagger: 10 });
  }

  // ------------------------------------------------------------- routes --

  private enterMainStage(globalIndex: number, regionIndex: number, stageInRegion: number): void {
    const save = this.getSave();
    if (stageInRegion === 0 && !save.storyFlags.regionIntro[regionIndex]) {
      this.scene.start('Story', {
        lines: getRegionIntroScript(regionIndex).lines,
        next: { scene: 'Battle', data: { stageIndex: globalIndex } },
        markSeen: { kind: 'regionIntro', regionIndex },
      });
      return;
    }
    this.scene.start('Battle', { stageIndex: globalIndex });
  }

  private enterFinalStage(): void {
    const save = this.getSave();
    if (!save.storyFlags.finalIntro) {
      this.scene.start('Story', {
        lines: getFinalIntroScript().lines,
        next: { scene: 'Battle', data: { stageIndex: FINAL_STAGE_INDEX, mode: 'final' } },
        markSeen: { kind: 'finalIntro' },
      });
      return;
    }
    this.scene.start('Battle', { stageIndex: FINAL_STAGE_INDEX, mode: 'final' });
  }

  private enterExtraStage(extraIndex: number, regionIndex: number): void {
    const isGroupStart = extraIndex % EXTRA_STAGES_PER_REGION === 0;
    if (isGroupStart) {
      this.scene.start('Story', {
        lines: getExtraIntroScript(regionIndex).lines,
        next: { scene: 'Battle', data: { stageIndex: extraIndex, mode: 'extra' } },
      });
      return;
    }
    this.scene.start('Battle', { stageIndex: extraIndex, mode: 'extra' });
  }

  private showToast(text: string): void {
    const msg = caption(this, 360, 150, text, { fontSize: '14px', color: '#f0ecff' }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: msg, alpha: 0, delay: 1100, duration: 400, onComplete: () => msg.destroy() });
  }
}
