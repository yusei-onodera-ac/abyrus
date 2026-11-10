import Phaser from 'phaser';
import { BUILD_TABS, VILLAGE_COLS, VILLAGE_ROWS, VILLAGE_MATERIALS, BUILDINGS, WANDERERS, getBuilding, materialName, type BuildTab, type BuildingKind, type BuildingLevel, type MaterialBundle } from '../data/village';
import { VILLAGE_QUESTS } from '../data/villageQuests';
import { IdleSystem } from '../systems/IdleSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem, type PlacedBuilding, type SaveData, type Wanderer } from '../systems/SaveSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
import { VillageSystem, settleChanged, type SettleResult, type WorkKind } from '../systems/VillageSystem';
import { VillageQuests } from '../systems/VillageQuests';
import { builderCount, busyBuilders, castleLevel, effectiveLevel, houseBonus, isMoving, levelValue, movePhase } from '../systems/VillageIncome';
import { BackButton } from '../ui/BackButton';
import { Button } from '../ui/Button';
import { openConfirm } from '../ui/Dialogs';
import { formatSpan, formatSpanExact } from '../ui/format';
import { materialIcon } from '../ui/ItemIcons';
import { openModal, type ModalHandle } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { ResourceBar } from '../ui/ResourceBar';
import { addGoodIcon } from '../ui/RewardIcon';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForVillageClaim, type RewardTile } from '../ui/RewardTiles';
import { showToast } from '../ui/Toast';
import { body, caption, heading, CHROME } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';
import { ISO, VILLAGE_GROUND_KEY, buildingArt, constructionArt, isoGrid, isoPoint, wandererArt, type Art, type Pt } from '../ui/VillageArt';

const INK = '#1c130a';

/** The land the village stands on, in px at 100%. The map's diamond sits in the middle of it. */
const WORLD = { w: 2200, h: 1900 };
const GRID_H = ((VILLAGE_COLS + VILLAGE_ROWS) * ISO.tileH) / 2;
/** Where the map's top corner is in the world. */
const ORIGIN: Pt = { x: WORLD.w / 2 - ((VILLAGE_COLS - VILLAGE_ROWS) * ISO.tileW) / 4, y: (WORLD.h - GRID_H) / 2 };
/** Zoom: never so far out that the screen is not full of land, never closer than MAX_ZOOM. */
const MIN_ZOOM = Math.max(720 / WORLD.w, 1280 / WORLD.h);
const MAX_ZOOM = 1.8;
const START_ZOOM = 0.9;

/** The bar for the selected building / placing, along the bottom (right of the 戻る tab). */
const DOCK = { x: 166, w: 518, h: 196 };
const DOCK_Y = 1280 - 12 - DOCK.h;
/** Rows inside the bar: the name, one line of what it does, two lines of cost (ゴールド and time / 素材), the buttons. */
const ROW = { title: 24, line: 54, cost: 84, materials: 112, buttons: 156 };
/** A press that travels further than this many px is a drag, not a tap. */
const DRAG_PX = 10;

type Mode = 'browse' | 'place';

/** What the picture over a building says while it is worked on. */
const WORK_LABEL: Record<WorkKind, string> = { build: '建築中', upgrade: '強化中', demolish: '解体中', rebuild: '再建築中' };

/** A press on the ghost (the building being placed or moved): dragged, it follows the finger. */
interface Drag {
  sx: number;
  sy: number;
  /** Where the pointer took hold, in tiles from the ghost's top corner. */
  gx: number;
  gy: number;
  dragging: boolean;
}

interface Panning {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  moved: boolean;
  /** A building the press began on: without a drag, it is selected. */
  tap?: string;
  /** A 行商人 / 宝箱 the press began on: without a drag, it is opened. */
  pick?: string;
}

interface Pinch {
  dist: number;
  zoom: number;
  /** The point of the land that stays under the fingers. */
  lx: number;
  ly: number;
}

interface Ghost {
  kind: BuildingKind;
  x: number;
  y: number;
  valid: boolean;
  view: Phaser.GameObjects.Container;
  /** Set when the ghost is an existing building being moved (it keeps its level; nothing is paid). */
  movingId?: string;
}

interface Ticking {
  id: string;
  text: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  cx: number;
  cy: number;
}

const noLock = { setEnabled: () => {} };

/**
 * 村: the player's own village (data/village.ts), seen from above at an angle and filling the screen. The land is
 * bigger than the screen: drag it to look around, pinch (or the wheel) to zoom. Buildings are put on a grid of
 * diamonds. 店 and 市場 are what pay out through 放置報酬; 民家 raise what the shops pay; the 城 sets how many of
 * each may stand, how high they may go and how many builders there are. Building and strengthening cost ゴールド,
 * 素材 (木材・鉄・石, which only this screen shows) and time (a builder is busy until it is done). A building that
 * stands can only be moved by taking it down and putting it up again, which takes time too. Everything that spends
 * something or takes time asks first (so does 撤去, which frees a place and gives back some of the 素材). 装飾 is looks only: it is put
 * up and moved at once, with no builder. 建築 (bottom-left) and 受け取る (bottom-right) sit in the corners; a tapped
 * building gets a label, and a bar along the bottom with what it does and what strengthening it costs.
 */
export class VillageScene extends Phaser.Scene {
  private save!: SaveData;
  private resourceBar!: ResourceBar;
  private mode: Mode = 'browse';
  private selectedId?: string;
  private drag?: Drag;
  private panning?: Panning;
  private pinch?: Pinch;
  private ghost?: Ghost;
  private modal?: ModalHandle;
  private refreshQueued = false;

  private world!: Phaser.GameObjects.Container;
  private zoom = START_ZOOM;
  private buildingLayer!: Phaser.GameObjects.Container;
  private markers!: Phaser.GameObjects.Container;
  private wandererLayer!: Phaser.GameObjects.Container;
  private wandererTweens: Phaser.Tweens.Tween[] = [];
  private raidBanner?: Phaser.GameObjects.Container;
  private raidText?: Phaser.GameObjects.Text;
  private raidKey = '';
  private buildTab: BuildTab = 'trade';
  private selection!: Phaser.GameObjects.Container;
  private ghostLayer!: Phaser.GameObjects.Container;
  private views = new Map<string, Phaser.GameObjects.Container>();
  private ticking: Ticking[] = [];
  private grid!: Phaser.GameObjects.Graphics;
  private footprint!: Phaser.GameObjects.Graphics;
  private dock!: Phaser.GameObjects.Container;
  private dockTick?: () => void;
  private headerTop!: Phaser.GameObjects.Text;
  private headerGold!: Phaser.GameObjects.Text;
  private materialTexts = new Map<string, Phaser.GameObjects.Text>();
  private confirmButton?: Button;
  private placeMessage?: Phaser.GameObjects.Text;

  constructor() {
    super('Village');
  }

  init(): void {
    this.mode = 'browse';
    this.selectedId = undefined;
    this.drag = undefined;
    this.panning = undefined;
    this.pinch = undefined;
    this.ghost = undefined;
    this.modal = undefined;
    this.refreshQueued = false;
    this.zoom = START_ZOOM;
    this.views = new Map();
    this.ticking = [];
    this.dockTick = undefined;
    this.materialTexts = new Map();
    this.confirmButton = undefined;
    this.placeMessage = undefined;
    this.wandererTweens = [];
    this.raidBanner = undefined;
    this.raidText = undefined;
    this.raidKey = '';
  }

  create(): void {
    this.save = this.game.registry.get('save');
    // Work that ran its time while the village was closed is taken in before anything is drawn.
    const done = VillageSystem.settle(this.save);
    VillageQuests.refresh(this.save);
    if (settleChanged(done)) SaveSystem.save(this.save);

    this.cameras.main.setBackgroundColor('#3a6b2f');
    this.input.addPointer(1);

    // Bare ground anywhere on the screen: drag it to look around, tap it to drop the selection.
    const groundZone = this.add.zone(360, 640, 720, 1280).setInteractive().setDepth(1);
    groundZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onGroundDown(p));

    this.world = this.add.container(0, 0).setDepth(2);
    this.buildGround();
    this.grid = this.add.graphics().setVisible(false);
    this.drawGrid();
    this.footprint = this.add.graphics();
    this.buildingLayer = this.add.container(0, 0);
    this.markers = this.add.container(0, 0);
    this.wandererLayer = this.add.container(0, 0);
    this.selection = this.add.container(0, 0);
    this.ghostLayer = this.add.container(0, 0);
    this.world.add([this.grid, this.footprint, this.buildingLayer, this.markers, this.wandererLayer, this.selection, this.ghostLayer]);

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.resourceBar.setDepth(20);
    this.resourceBar.update(this.save);
    enter(this, this.resourceBar, { dy: -20, duration: 280 });
    this.buildHeader();
    this.buildMaterialBar();
    this.dock = this.add.container(0, 0).setDepth(14);

    this.renderBuildings();
    this.renderDock();
    this.refreshHeader();
    this.focusOn(this.save.village.buildings.find((b) => b.kind === 'castle'));

    this.input.on('pointerdown', () => this.maybeBeginPinch());
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (!this.blocked()) this.zoomAt(p.x, p.y, this.zoom * (dy > 0 ? 0.88 : 1.14));
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });

    enter(this, new BackButton(this, () => this.scene.start('Home'), 1096).setDepth(14), { dx: -40, dy: 0, duration: 300, delay: 250 });

    this.announce(done);
    this.showRaidReport();
  }

  // --------------------------------------------------------- the land --

  /** Where tile (gx, gy)'s top corner is, in the world. */
  private pos(gx: number, gy: number): Pt {
    const p = isoPoint(gx, gy);
    return { x: ORIGIN.x + p.x, y: ORIGIN.y + p.y };
  }

  /** The tile (fractional) under a point on the screen. */
  private gridAt(p: { x: number; y: number }): { gx: number; gy: number } {
    return isoGrid((p.x - this.world.x) / this.zoom - ORIGIN.x, (p.y - this.world.y) / this.zoom - ORIGIN.y);
  }

  /** Grass, the village's own diamond a shade different, trees round it, a beach and the sea along the bottom. */
  private buildGround(): void {
    if (this.textures.exists(VILLAGE_GROUND_KEY)) {
      this.world.add(this.add.image(0, 0, VILLAGE_GROUND_KEY).setOrigin(0).setDisplaySize(WORLD.w, WORLD.h));
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0x4f9a3c, 1);
    g.fillRect(0, 0, WORLD.w, WORLD.h);

    let seed = 11;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    // Patches of darker and lighter grass.
    for (let i = 0; i < 120; i++) {
      g.fillStyle(rand() < 0.5 ? 0x3f8731 : 0x63ad4b, 0.35);
      g.fillEllipse(rand() * WORLD.w, rand() * (WORLD.h - 300), 160 + rand() * 260, 70 + rand() * 120);
    }
    // The sea, and a beach between it and the grass.
    const beachY = WORLD.h - 330;
    g.fillStyle(0xe9d9a0, 1);
    g.fillRect(0, beachY, WORLD.w, 120);
    g.fillStyle(0xf6ecc4, 1);
    g.fillRect(0, beachY + 70, WORLD.w, 50);
    g.fillStyle(0x3fa6cf, 1);
    g.fillRect(0, beachY + 120, WORLD.w, WORLD.h - beachY - 120);
    g.fillStyle(0xffffff, 0.45);
    for (let i = 0; i < 40; i++) g.fillEllipse(rand() * WORLD.w, beachY + 130 + rand() * 60, 90 + rand() * 120, 8);

    // The village's own diamond: two greens, close enough together to read as one lawn.
    for (let gx = 0; gx < VILLAGE_COLS; gx++) {
      for (let gy = 0; gy < VILLAGE_ROWS; gy++) {
        g.fillStyle((gx + gy) % 2 === 0 ? 0x6bb751 : 0x66b14d, 1);
        g.fillPoints([this.pos(gx, gy), this.pos(gx + 1, gy), this.pos(gx + 1, gy + 1), this.pos(gx, gy + 1)], true);
      }
    }
    g.lineStyle(4, 0xffffff, 0.25);
    g.strokePoints([this.pos(0, 0), this.pos(VILLAGE_COLS, 0), this.pos(VILLAGE_COLS, VILLAGE_ROWS), this.pos(0, VILLAGE_ROWS)], true);

    // Trees and bushes on the land round the village, none on it.
    const onVillage = (x: number, y: number): boolean => {
      const t = isoGrid(x - ORIGIN.x, y - ORIGIN.y);
      return t.gx > -1.5 && t.gx < VILLAGE_COLS + 1.5 && t.gy > -1.5 && t.gy < VILLAGE_ROWS + 1.5;
    };
    const trees: Pt[] = [];
    for (let i = 0; i < 420 && trees.length < 150; i++) {
      const p = { x: rand() * WORLD.w, y: 40 + rand() * (beachY - 70) };
      if (!onVillage(p.x, p.y)) trees.push(p);
    }
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) {
      const s = 0.8 + rand() * 0.7;
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(t.x, t.y + 6, 70 * s, 22 * s);
      g.fillStyle(0x6b4a2a, 1);
      g.fillRect(t.x - 5 * s, t.y - 22 * s, 10 * s, 26 * s);
      for (const [dx, dy, r, c] of [[-22, -34, 28, 0x2f7a2a], [22, -34, 28, 0x2f7a2a], [0, -52, 34, 0x3d9234], [-8, -58, 20, 0x56b048]] as [number, number, number, number][]) {
        g.fillStyle(c, 1);
        g.fillCircle(t.x + dx * s, t.y + dy * s, r * s);
      }
    }
    this.world.add(g);
  }

  private drawGrid(): void {
    this.grid.lineStyle(1.5, 0xffffff, 0.3);
    for (let c = 0; c <= VILLAGE_COLS; c++) this.grid.strokePoints([this.pos(c, 0), this.pos(c, VILLAGE_ROWS)], false);
    for (let r = 0; r <= VILLAGE_ROWS; r++) this.grid.strokePoints([this.pos(0, r), this.pos(VILLAGE_COLS, r)], false);
  }

  /** Puts the view where `zoom` and the world's position say, never showing past the edge of the land. */
  private applyView(): void {
    this.zoom = Phaser.Math.Clamp(this.zoom, MIN_ZOOM, MAX_ZOOM);
    this.world.setScale(this.zoom);
    this.world.x = Phaser.Math.Clamp(this.world.x, 720 - WORLD.w * this.zoom, 0);
    this.world.y = Phaser.Math.Clamp(this.world.y, 1280 - WORLD.h * this.zoom, 0);
  }

  /** Zooms about a point on the screen, so what is under the fingers stays there. */
  private zoomAt(sx: number, sy: number, zoom: number): void {
    const lx = (sx - this.world.x) / this.zoom;
    const ly = (sy - this.world.y) / this.zoom;
    this.zoom = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.world.x = sx - lx * this.zoom;
    this.world.y = sy - ly * this.zoom;
    this.applyView();
  }

  private focusOn(b: PlacedBuilding | undefined): void {
    const def = b ? getBuilding(b.kind) : undefined;
    const c = b && def ? this.pos(b.x + def.w / 2, b.y + def.h / 2) : this.pos(VILLAGE_COLS / 2, VILLAGE_ROWS / 2);
    this.world.x = 360 - c.x * this.zoom;
    this.world.y = 600 - c.y * this.zoom;
    this.applyView();
  }

  // ---------------------------------------------------------- chrome --

  /** Top-left under the resource bar: the 城's level, builders at work, and what the shops pay an hour. */
  private buildHeader(): void {
    const w = 270;
    const h = 56;
    const box = this.add.container(14 + w / 2, 142 + h / 2).setDepth(12);
    box.add(createPanel(this, 0, 0, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.92, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 12, gradient: false }));
    this.headerTop = caption(this, -w / 2 + 14, -13, '', { fontSize: '16px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    this.headerGold = body(this, -w / 2 + 14, 12, '', { fontSize: '21px', fontStyle: 'bold', color: '#ffe79a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    box.add([this.headerTop, this.headerGold]);
    enter(this, box, { dx: -30, dy: 0, duration: 320, delay: 140 });
  }

  /** Right of the header: how much 木材・鉄・石 there is. They are shown here and nowhere else. */
  private buildMaterialBar(): void {
    const left = 14 + 270 + 10;
    const w = 720 - 14 - left;
    const h = 56;
    const box = this.add.container(left + w / 2, 142 + h / 2).setDepth(12);
    box.add(createPanel(this, 0, 0, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.92, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 12, gradient: false }));
    const cell = w / VILLAGE_MATERIALS.length;
    VILLAGE_MATERIALS.forEach(({ id, name, color }, i) => {
      const x = -w / 2 + cell * i + 10;
      box.add(this.add.image(x + 17, 0, materialIcon(this, id, 34)));
      box.add(caption(this, x + 40, -12, name, { fontSize: '14px', fontStyle: 'bold', color, stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const amount = body(this, x + 40, 11, '', { fontSize: '20px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
      box.add(amount);
      this.materialTexts.set(id, amount);
    });
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (!this.blocked()) showToast(this, '素材は、ダンジョン・ステージ・放置報酬で手に入ります', '#ffe9b8');
    });
    box.add(hit);
    enter(this, box, { dx: 30, dy: 0, duration: 320, delay: 180 });
  }

  private refreshHeader(): void {
    const now = Date.now();
    this.headerTop.setText(`村Lv${castleLevel(this.save, now)}　建築員 ${busyBuilders(this.save, now)}/${builderCount(this.save, now)}`);
    this.headerGold.setText(`売上 +${IdleSystem.perHour(this.save, now).gold.toString()}/時`);
    this.refreshMaterials();
    this.refreshRaidBanner();
  }

  private refreshMaterials(): void {
    const room = (720 - 14 - (14 + 270 + 10)) / VILLAGE_MATERIALS.length - 46;
    for (const { id } of VILLAGE_MATERIALS) {
      const text = this.materialTexts.get(id);
      if (!text) continue;
      text.setText(SaveSystem.getMaterial(this.save, id).toLocaleString('ja-JP'));
      text.setScale(text.width > room ? room / text.width : 1);
    }
  }

  // ---------------------------------------------------------- buildings --

  /** (Re)draws every building, back to front. */
  private renderBuildings(): void {
    const now = Date.now();
    this.buildingLayer.removeAll(true);
    this.markers.removeAll(true);
    this.views = new Map();
    this.ticking = [];
    const front = (b: PlacedBuilding): number => b.x + getBuilding(b.kind).w + b.y + getBuilding(b.kind).h;
    for (const b of [...this.save.village.buildings].sort((a, c) => front(a) - front(c))) {
      const view = this.buildView(b);
      this.views.set(b.id, view);
      this.buildingLayer.add(view);
      if (movePhase(b, now) === 'demolish') this.addMoveMarker(b);
    }
    this.renderWanderers();
    this.drawSelection();
  }

  /** While a building is being taken down, the place it is going to is marked, and kept for it. */
  private addMoveMarker(b: PlacedBuilding): void {
    const move = b.move;
    if (!move) return;
    const def = getBuilding(b.kind);
    const pts = this.diamond(move.toX, move.toY, def.w, def.h);
    const g = this.add.graphics();
    g.fillStyle(0xffe27a, 0.22);
    g.fillPoints(pts, true);
    g.lineStyle(3, 0xffe27a, 0.9);
    g.strokePoints(pts, true);
    this.markers.add(g);
    this.markers.add(this.plate((pts[0].x + pts[2].x) / 2, (pts[0].y + pts[2].y) / 2, `${def.name}の移転先`, 16));
  }

  /** What a building is called in its label: its level, or what is being done to it that stops it working. */
  private titleOf(b: PlacedBuilding, now: number): string {
    const def = getBuilding(b.kind);
    const level = effectiveLevel(b, now);
    if (level === 0) return `${def.name}（建築中）`;
    if (b.damaged) return `${def.name}（損壊）`;
    if (isMoving(b, now)) return `${def.name}（移転中）`;
    return def.decor ? def.name : `${def.name}　Lv${level}`;
  }

  private buildView(b: PlacedBuilding): Phaser.GameObjects.Container {
    const now = Date.now();
    const def = getBuilding(b.kind);
    const level = effectiveLevel(b, now);
    const work = VillageSystem.work(b, now);
    // A plot being built, or one put up again after a move, shows the scaffolding.
    const scaffold = level === 0 || work?.kind === 'rebuild';
    const origin = this.pos(b.x, b.y);
    const view = this.add.container(origin.x, origin.y);
    // The building being moved is dimmed while its new place is chosen.
    if (this.ghost?.movingId === b.id) view.setAlpha(0.45);

    const art: Art = scaffold ? constructionArt(this, b.kind) : buildingArt(this, b.kind, level);
    view.add(art.container);
    const centre = isoPoint(def.w / 2, def.h / 2);
    const front = isoPoint(def.w, def.h);

    if (!scaffold) {
      // A little plate with the level, just above the front corner.
      if (!def.decor) view.add(this.plate(front.x, front.y - 16, `Lv${level}`, 14));
      if ((b.kind === 'shop' || b.kind === 'market') && !isMoving(b, now) && !b.damaged) view.add(this.salesBubble(b, art.bounds, now));
      if (def.produces && !isMoving(b, now) && !b.damaged) view.add(this.produceBubble(b, def.produces, art.bounds, now));
    }

    if (b.damaged) {
      // Broken by a 襲撃: darkened, with smoke over it, until it is repaired.
      const shade = this.add.graphics();
      shade.fillStyle(0x3a0c0c, 0.42);
      shade.fillPoints([isoPoint(0, 0), isoPoint(def.w, 0), isoPoint(def.w, def.h), isoPoint(0, def.h)], true);
      shade.fillStyle(0x4a4a4a, 0.75);
      for (const [dx, dy, r] of [[-10, 6, 13], [8, -8, 16], [-2, -24, 12]] as [number, number, number][]) shade.fillCircle(art.bounds.centerX + dx, art.bounds.y + 18 + dy, r);
      view.add(shade);
      view.add(this.plate(centre.x, centre.y - 6, '損壊', 17));
    }

    if (work) {
      if (!scaffold) {
        const dim = this.add.graphics();
        dim.fillStyle(0x000000, 0.4);
        dim.fillPoints([isoPoint(0, 0), isoPoint(def.w, 0), isoPoint(def.w, def.h), isoPoint(0, def.h)], true);
        view.add(dim);
      }
      const bar = this.add.graphics();
      const text = caption(this, centre.x, centre.y - 6, '', { fontSize: '19px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
      const label = caption(this, centre.x, centre.y - 28, WORK_LABEL[work.kind], { fontSize: '16px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
      view.add([bar, label, text]);
      const ticking: Ticking = { id: b.id, text, bar, cx: centre.x, cy: centre.y };
      this.ticking.push(ticking);
      this.paintTicking(ticking, b, now);
    }

    const zone = this.add.zone(art.bounds.centerX, art.bounds.centerY, art.bounds.width, art.bounds.height).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onBuildingDown(b, p));
    view.add(zone);
    return view;
  }

  private plate(x: number, y: number, text: string, size: number): Phaser.GameObjects.Container {
    const label = caption(this, 0, 0, text, { fontSize: `${size}px`, fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
    const w = label.width + 16;
    const h = size + 10;
    const bg = this.add.graphics();
    bg.fillStyle(0x1b1209, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 7);
    bg.lineStyle(1.5, CHROME.brass, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 7);
    return this.add.container(x, y, [bg, label]);
  }

  /** The coin bubble over a shop: what that shop pays an hour. */
  private salesBubble(b: PlacedBuilding, bounds: Phaser.Geom.Rectangle, now: number): Phaser.GameObjects.Container {
    const perHour = IdleSystem.baseGoldPerHour(this.save).mul(levelValue(b, now) * (1 + houseBonus(this.save, now)));
    const label = caption(this, 0, 0, `+${perHour.toString()}`, { fontSize: '17px', fontStyle: 'bold', color: '#ffe79a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    const w = label.width + 48;
    const bg = this.add.graphics();
    bg.fillStyle(0xeaf6ff, 0.95);
    bg.fillRoundedRect(-w / 2, -17, w, 34, 17);
    bg.lineStyle(2, 0x6bb7e8, 1);
    bg.strokeRoundedRect(-w / 2, -17, w, 34, 17);
    bg.fillStyle(0x2c4a63, 0.92);
    bg.fillRoundedRect(-w / 2 + 28, -14, w - 32, 28, 14);
    label.setX(-w / 2 + 38);
    const coin = addGoodIcon(this, 'gold', -w / 2 + 16, 0, 26);
    return this.add.container(bounds.centerX, bounds.y + 2, [bg, coin, label]);
  }

  /** The bubble over a 採集施設: which material it gathers and how much an hour. */
  private produceBubble(b: PlacedBuilding, material: 'wood' | 'iron' | 'stone', bounds: Phaser.Geom.Rectangle, now: number): Phaser.GameObjects.Container {
    const label = caption(this, 0, 0, `+${levelValue(b, now).toLocaleString('ja-JP')}/時`, { fontSize: '17px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    const w = label.width + 48;
    const bg = this.add.graphics();
    bg.fillStyle(0xeaf6ff, 0.95);
    bg.fillRoundedRect(-w / 2, -17, w, 34, 17);
    bg.lineStyle(2, 0x6bb7e8, 1);
    bg.strokeRoundedRect(-w / 2, -17, w, 34, 17);
    bg.fillStyle(0x2c4a63, 0.92);
    bg.fillRoundedRect(-w / 2 + 28, -14, w - 32, 28, 14);
    label.setX(-w / 2 + 38);
    const icon = this.add.image(-w / 2 + 16, 0, materialIcon(this, material, 26));
    return this.add.container(bounds.centerX, bounds.y + 2, [bg, icon, label]);
  }

  /** Counts down the work on one building: its time and a bar under it. */
  private paintTicking(t: Ticking, b: PlacedBuilding, now: number): void {
    const work = VillageSystem.work(b, now);
    t.text.setText(work ? StaminaSystem.formatDuration(work.left) : '');
    t.bar.clear();
    t.bar.fillStyle(0x0d0905, 0.9);
    t.bar.fillRoundedRect(t.cx - 44, t.cy + 12, 88, 9, 4);
    t.bar.fillStyle(0xe0822a, 1);
    t.bar.fillRoundedRect(t.cx - 44, t.cy + 12, Math.max(9, 88 * (work?.progress ?? 1)), 9, 4);
  }

  /** The diamond a building (or ghost) covers, as four corners in the world. */
  private diamond(x: number, y: number, w: number, h: number): Pt[] {
    return [this.pos(x, y), this.pos(x + w, y), this.pos(x + w, y + h), this.pos(x, y + h)];
  }

  /** The selected building: a gold outline, arrows at its corners and its name and level under it. */
  private drawSelection(): void {
    this.selection.removeAll(true);
    const b = this.selectedId ? VillageSystem.get(this.save, this.selectedId) : undefined;
    if (!b || this.mode !== 'browse') return;
    const def = getBuilding(b.kind);
    const corners = this.diamond(b.x, b.y, def.w, def.h);
    const c = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };
    const g = this.add.graphics();
    g.lineStyle(4, 0xffe27a, 1);
    g.strokePoints(corners, true);
    g.fillStyle(0xffe27a, 1);
    for (const p of corners) {
      const len = Math.hypot(c.x - p.x, c.y - p.y) || 1;
      const ux = (c.x - p.x) / len;
      const uy = (c.y - p.y) / len;
      // An arrow just outside the corner, pointing at it.
      const tip = { x: p.x - ux * 6, y: p.y - uy * 6 };
      const base = { x: p.x - ux * 30, y: p.y - uy * 30 };
      g.fillTriangle(tip.x, tip.y, base.x - uy * 12, base.y + ux * 12, base.x + uy * 12, base.y - ux * 12);
    }
    this.selection.add(g);
    this.selection.add(this.plate(corners[2].x, corners[2].y + 34, this.titleOf(b, Date.now()), 24));
  }

  private paintFootprint(kind: BuildingKind, x: number, y: number, valid: boolean): void {
    const def = getBuilding(kind);
    const pts = this.diamond(x, y, def.w, def.h);
    this.footprint.clear();
    this.footprint.fillStyle(valid ? 0x7dff7d : 0xff5a5a, 0.45);
    this.footprint.fillPoints(pts, true);
    this.footprint.lineStyle(4, valid ? 0xc8ffc8 : 0xffc0c0, 1);
    this.footprint.strokePoints(pts, true);
  }

  // -------------------------------------------------------------- input --

  private blocked(): boolean {
    return !!this.modal?.container.active;
  }

  private onBuildingDown(b: PlacedBuilding, p: Phaser.Input.Pointer): void {
    if (this.blocked()) return;
    if (this.mode === 'place') {
      // While placing, a building is just ground: a drag looks around, a tap moves what is being placed.
      this.onGroundDown(p);
      return;
    }
    // A building is part of the land: a drag looks around, a tap selects it. (To move one, select it and press 移動.)
    this.panning = { sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: false, tap: b.id };
  }

  private onWandererDown(w: Wanderer, p: Phaser.Input.Pointer): void {
    if (this.blocked()) return;
    if (this.mode === 'place') {
      this.onGroundDown(p);
      return;
    }
    this.panning = { sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: false, pick: w.id };
  }

  private onGhostDown(p: Phaser.Input.Pointer): void {
    const ghost = this.ghost;
    if (!ghost || this.blocked()) return;
    const g = this.gridAt(p);
    this.drag = { sx: p.x, sy: p.y, gx: g.gx - ghost.x, gy: g.gy - ghost.y, dragging: false };
  }

  private onGroundDown(p: Phaser.Input.Pointer): void {
    if (this.blocked()) return;
    this.panning = { sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: false };
  }

  private maybeBeginPinch(): void {
    if (this.blocked() || !(this.input.pointer1.isDown && this.input.pointer2.isDown)) return;
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    this.drag = undefined;
    this.panning = undefined;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    this.pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom, lx: (mx - this.world.x) / this.zoom, ly: (my - this.world.y) / this.zoom };
  }

  private updatePinch(): void {
    const pinch = this.pinch;
    if (!pinch) return;
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    this.zoom = Phaser.Math.Clamp(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), MIN_ZOOM, MAX_ZOOM);
    this.world.x = mx - pinch.lx * this.zoom;
    this.world.y = my - pinch.ly * this.zoom;
    this.applyView();
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.blocked()) return;
    if (this.pinch) {
      this.updatePinch();
      return;
    }
    if (!p.isDown) return;

    const drag = this.drag;
    if (drag) {
      if (!drag.dragging) {
        if (Math.hypot(p.x - drag.sx, p.y - drag.sy) < DRAG_PX) return;
        drag.dragging = true;
      }
      const ghost = this.ghost;
      if (!ghost) return;
      const g = this.gridAt(p);
      const def = getBuilding(ghost.kind);
      ghost.x = Phaser.Math.Clamp(Math.round(g.gx - drag.gx), 0, VILLAGE_COLS - def.w);
      ghost.y = Phaser.Math.Clamp(Math.round(g.gy - drag.gy), 0, VILLAGE_ROWS - def.h);
      this.placeGhost();
      return;
    }

    const pan = this.panning;
    if (pan) {
      if (!pan.moved && Math.hypot(p.x - pan.sx, p.y - pan.sy) < DRAG_PX) return;
      pan.moved = true;
      this.world.x = pan.wx + (p.x - pan.sx);
      this.world.y = pan.wy + (p.y - pan.sy);
      this.applyView();
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (!(this.input.pointer1.isDown && this.input.pointer2.isDown)) this.pinch = undefined;
      return;
    }
    const pan = this.panning;
    this.panning = undefined;
    this.drag = undefined;

    if (pan && !pan.moved && !this.blocked()) {
      // A tap on a building selects it; on bare ground, placing, it puts the new building there, otherwise it drops the selection.
      if (pan.tap) {
        this.select(pan.tap);
      } else if (pan.pick) {
        this.collectWanderer(pan.pick);
      } else if (this.mode === 'place' && this.ghost) {
        const def = getBuilding(this.ghost.kind);
        const g = this.gridAt(p);
        this.ghost.x = Phaser.Math.Clamp(Math.round(g.gx - def.w / 2), 0, VILLAGE_COLS - def.w);
        this.ghost.y = Phaser.Math.Clamp(Math.round(g.gy - def.h / 2), 0, VILLAGE_ROWS - def.h);
        this.placeGhost();
      } else if (this.selectedId) {
        this.select(undefined);
      }
      return;
    }
    if (this.refreshQueued) this.flushRefresh();
  }

  // ---------------------------------------------------------------- tick --

  /** Once a second: takes in finished work, runs the countdowns, and brings the numbers up to date. */
  private tick(): void {
    const now = Date.now();
    const done = VillageSystem.settle(this.save, now);
    if (settleChanged(done)) {
      SaveSystem.save(this.save);
      this.announce(done);
      this.flushRefresh();
    }
    if (this.save.village.raid.report && !this.blocked() && this.mode === 'browse') this.showRaidReport();
    for (const t of this.ticking) {
      const b = VillageSystem.get(this.save, t.id);
      if (b) this.paintTicking(t, b, now);
    }
    this.refreshHeader();
    this.dockTick?.();
  }

  /** A note for what happened: buildings finished, moves over, a 襲撃 that has come, a visitor on the map. The last one wins
   *  the toast (a new toast replaces the one on screen). */
  private announce(done: SettleResult): void {
    const names = (list: PlacedBuilding[]): string => list.map((b) => getBuilding(b.kind).name).join('・');
    const notes: { text: string; color: string }[] = [];
    if (done.finished.length > 0) notes.push({ text: `${names(done.finished)}が完成しました`, color: '#9fe39f' });
    if (done.rebuilt.length > 0) notes.push({ text: `${names(done.rebuilt)}の移転が終わりました`, color: '#9fe39f' });
    if (done.spawned.length > 0) notes.push({ text: `${done.spawned.map((w) => WANDERERS[w.kind].name).join('・')}が来ました`, color: '#ffe9b8' });
    if (done.raidArrived && this.save.village.raid.pending) notes.push({ text: '襲撃！ 獣の群れが近づいています', color: '#ff9a8a' });
    notes.forEach((note, i) => {
      if (i === 0) showToast(this, note.text, note.color);
      else this.time.delayedCall(1500 * i, () => showToast(this, note.text, note.color));
    });
  }

  /** Redraws the map and the bar after something changed (held back while a drag is going on). */
  private flushRefresh(): void {
    if (this.drag?.dragging || this.pinch) {
      this.refreshQueued = true;
      return;
    }
    this.renderBuildings();
    this.renderDock();
    this.refreshHeader();
    this.resourceBar.update(this.save);
    this.refreshQueued = false;
  }

  // --------------------------------------------------------------- dock --

  private renderDock(): void {
    this.dock.removeAll(true);
    this.dockTick = undefined;
    this.confirmButton = undefined;
    this.placeMessage = undefined;
    if (this.mode === 'place' && this.ghost) {
      this.panelDock();
      this.renderPlaceDock(this.ghost);
      return;
    }
    const b = this.selectedId ? VillageSystem.get(this.save, this.selectedId) : undefined;
    if (b) {
      this.panelDock();
      this.renderSelectedDock(b);
    } else {
      this.renderCorners();
    }
  }

  /** The bar along the bottom that the selected building / placing uses (positions below are inside it). */
  private panelDock(): void {
    this.dock.setPosition(DOCK.x, DOCK_Y);
    this.dock.add(createPanel(this, DOCK.w / 2, DOCK.h / 2, DOCK.w, DOCK.h, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 14, gradient: false }));
  }

  /** Nothing selected: 建築 big in the bottom-left corner, 受け取る (with what has piled up) in the bottom-right. */
  private renderCorners(): void {
    this.dock.setPosition(0, 0);
    this.dock.add(new Button(this, 104, 1218, 200, 112, '建築', () => this.openBuildMenu(), { variant: 'gold', fontSize: '40px' }));

    const claim = new Button(this, 720 - 104, 1218, 200, 112, '受け取る', () => this.claim(), { variant: 'wood', fontSize: '30px' });
    this.dock.add(claim);
    // 依頼 between the two, with a red dot when a chore's pay is waiting.
    this.dock.add(new Button(this, 360, 1226, 150, 88, '依頼', () => this.openQuests(), { variant: 'wood', fontSize: '28px' }));
    if (VillageQuests.claimable(this.save).length > 0) {
      const dot = this.add.graphics();
      dot.fillStyle(0xe03a2a, 1);
      dot.fillCircle(360 + 62, 1226 - 36, 12);
      dot.lineStyle(3, 0xffffff, 1);
      dot.strokeCircle(360 + 62, 1226 - 36, 12);
      this.dock.add(dot);
    }
    const pillW = 270;
    const pill = this.add.container(720 - 14 - pillW / 2, 1136);
    pill.add(createPanel(this, 0, 0, pillW, 44, { fillColor: CHROME.woodFill, fillAlpha: 0.92, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 12, gradient: false }));
    pill.add(addGoodIcon(this, 'gold', -pillW / 2 + 22, 0, 28));
    const amount = body(this, -pillW / 2 + 42, 0, '', { fontSize: '21px', fontStyle: 'bold', color: '#ffe79a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    pill.add(amount);
    this.dock.add(pill);
    const update = () => {
      const preview = IdleSystem.preview(this.save);
      amount.setText(`+${preview.gold.toString()}`);
      claim.setEnabled(preview.hours >= 1 / 60);
    };
    update();
    this.dockTick = update;
  }

  private claim(): void {
    if (this.blocked()) return;
    const result = IdleSystem.claim(this.save);
    SaveSystem.save(this.save);
    this.resourceBar.update(this.save);
    this.refreshMaterials();
    this.modal = showRewardModal(this, noLock, { title: '放置報酬を受け取りました', tiles: tilesForVillageClaim(result.preview, result.equipment) });
    this.renderDock();
  }

  /** Adds 素材 (icon and amount, red when there is not enough) from x along a line, returning where they end. */
  private materialChips(parent: Phaser.GameObjects.Container, x: number, y: number, bundle: MaterialBundle, size = 24, fontSize = 18, checkStock = true): number {
    let cx = x;
    for (const { id } of VILLAGE_MATERIALS) {
      const need = bundle[id] ?? 0;
      if (need <= 0) continue;
      const enough = !checkStock || SaveSystem.getMaterial(this.save, id) >= need;
      parent.add(this.add.image(cx + size / 2, y, materialIcon(this, id, size)));
      const text = body(this, cx + size + 4, y, need.toLocaleString('ja-JP'), { fontSize: `${fontSize}px`, fontStyle: 'bold', color: enough ? '#fff4dc' : '#ff9a8a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
      parent.add(text);
      cx = text.x + text.width + 16;
    }
    return cx;
  }

  /** The cost of reaching `level` as two lines in a bar or row: ゴールド with the time it takes, then 素材. */
  private costLines(parent: Phaser.GameObjects.Container, x: number, yGold: number, yMaterials: number, level: BuildingLevel, size = 24, fontSize = 19): void {
    const cost = VillageSystem.cost(this.save, level);
    const affordable = SaveSystem.getGold(this.save).gte(cost);
    parent.add(addGoodIcon(this, 'gold', x + size / 2, yGold, size));
    const costText = body(this, x + size + 6, yGold, cost.toString(), { fontSize: `${fontSize}px`, fontStyle: 'bold', color: affordable ? '#ffe79a' : '#ff9a8a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    parent.add(costText);
    parent.add(caption(this, costText.x + costText.width + 14, yGold, level.seconds > 0 ? `所要 ${formatSpan(level.seconds)}` : 'すぐ完成', { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    this.materialChips(parent, x, yMaterials, VillageSystem.materialCost(level), size, fontSize - 1);
  }

  /** The cost of reaching `level` as lines of text, for a question that asks before it is paid. */
  private costText(level: BuildingLevel): string {
    const lines = [`ゴールド　${VillageSystem.cost(this.save, level).toString()}`];
    const bundle = VillageSystem.materialCost(level);
    const materials = VILLAGE_MATERIALS.filter(({ id }) => (bundle[id] ?? 0) > 0).map(({ id, name }) => `${name} ${(bundle[id] ?? 0).toLocaleString('ja-JP')}`);
    if (materials.length > 0) lines.push(materials.join('　'));
    lines.push(level.seconds > 0 ? `所要時間　${formatSpan(level.seconds)}` : 'すぐに完成します');
    return lines.join('\n');
  }

  /** "木材 50　鉄 15" - a bundle of 素材 as text, for a question that asks before it is paid. */
  private bundleText(bundle: MaterialBundle): string {
    return VILLAGE_MATERIALS.filter(({ id }) => (bundle[id] ?? 0) > 0)
      .map(({ id, name }) => `${name} ${(bundle[id] ?? 0).toLocaleString('ja-JP')}`)
      .join('　');
  }

  private addCloseButton(width = 110): void {
    this.dock.add(new Button(this, DOCK.w - 18 - width / 2, ROW.buttons, width, 52, '閉じる', () => this.select(undefined), { variant: 'wood', fontSize: '22px' }));
  }

  /** What strengthening `b` would change, as a short line for the right of the 素材 row ('' when nothing shows). */
  private gainText(b: PlacedBuilding, level: number, now: number): string {
    const def = getBuilding(b.kind);
    const next = def.levels[level];
    if (!next) return '';
    if (def.produces) return `+${levelValue(b, now)} → +${next.value}/時`;
    if (def.defense) return `防衛 ${levelValue(b, now)} → ${next.value}`;
    const gain = VillageSystem.incomeAfter(this.save, b, now);
    return gain.after > gain.now + 1e-9 ? `売上 ×${gain.now.toFixed(2)} → ×${gain.after.toFixed(2)}` : '';
  }

  /** The selected building: what it does, what strengthening it costs and gives, and the buttons for that and for moving it.
   *  A broken one offers the repair; one that is being worked on offers to finish at once for 魔晶石. */
  private renderSelectedDock(b: PlacedBuilding): void {
    const now = Date.now();
    const def = getBuilding(b.kind);
    const level = effectiveLevel(b, now);
    const work = VillageSystem.work(b, now);
    const w = DOCK.w;
    const closeW = 110;
    const gap = 10;
    const mainW = w - 36 - closeW - gap;

    this.dock.add(heading(this, 18, ROW.title, this.titleOf(b, now), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.dock.add(caption(this, 18, ROW.line, this.statText(b, level, now), { fontSize: '18px', fontStyle: 'bold', color: b.damaged ? '#ffb07a' : '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    // 撤去: anything that stands and is not being worked on (a broken one too); the 城 stays.
    if (!work && level > 0 && def.removable !== false) this.addRemoveButton(b);

    if (b.damaged) {
      this.dock.add(caption(this, 18, ROW.cost, '直すのに必要な素材（ゴールドも時間もいりません）', { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.materialChips(this.dock, 18, ROW.materials, VillageSystem.repairCost(b, now), 24, 18);
      const reason = VillageSystem.checkRepair(this.save, b, now);
      const fix = new Button(this, 18 + mainW / 2, ROW.buttons, mainW, 52, reason ? '素材が不足しています' : '修理する', () => this.askRepair(b), { variant: reason ? 'wood' : 'gold', fontSize: reason ? '18px' : '26px' });
      fix.setEnabled(!reason);
      this.dock.add(fix);
      this.addCloseButton(closeW);
      return;
    }

    if (work) {
      const left = caption(this, 18, ROW.cost, '', { fontSize: '19px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
      this.dock.add(left);
      if (work.kind === 'demolish' && b.move) {
        this.dock.add(caption(this, 18, ROW.materials, `このあと 再建築 ${formatSpanExact(b.move.rebuild)}`, { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      }
      const head = work.kind === 'build' ? '完成まで' : work.kind === 'upgrade' ? '強化完了まで' : work.kind === 'demolish' ? '解体まで' : '再建築まで';
      const update = () => {
        const current = VillageSystem.work(b, Date.now());
        left.setText(`${head} あと ${current ? StaminaSystem.formatDuration(current.left) : ''}`);
      };
      update();
      this.dockTick = update;
      // Hurry it with 魔晶石.
      const gems = VillageSystem.finishCost(b, now);
      const enough = VillageSystem.checkFinish(this.save, b, now) === null;
      const hurry = new Button(this, 18 + mainW / 2, ROW.buttons, mainW, 52, enough ? `すぐ完成　魔晶石 ${gems}` : `魔晶石が足りません（${gems}）`, () => this.askFinish(b), { variant: enough ? 'gold' : 'wood', fontSize: enough ? '22px' : '17px' });
      hurry.setEnabled(enough);
      this.dock.add(hurry);
      this.addCloseButton(closeW);
      return;
    }

    if (def.decor) {
      this.dock.add(caption(this, 18, ROW.cost, def.description, { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.dock.add(caption(this, 18, ROW.materials, '移動はすぐ終わり、費用もかかりません', { fontSize: '15px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.dock.add(new Button(this, 18 + mainW / 2, ROW.buttons, mainW, 52, '移動', () => this.startMoving(b), { variant: 'gold', fontSize: '26px' }));
      this.addCloseButton(closeW);
      return;
    }

    const next = def.levels[level];
    const reason = VillageSystem.checkUpgrade(this.save, b, now);
    let label = '作業中';
    if (next) {
      this.costLines(this.dock, 18, ROW.cost, ROW.materials, next);
      const gain = this.gainText(b, level, now);
      if (gain) this.dock.add(caption(this, w - 18, ROW.materials, gain, { fontSize: '15px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
      label = `強化 → Lv${level + 1}`;
    } else {
      this.dock.add(caption(this, 18, ROW.cost, 'このレベルが上限です', { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      label = '最大レベル';
    }

    // Buttons: 移動 (not for the 城), the one that strengthens, 閉じる.
    const moveW = def.movable ? 120 : 0;
    let x = 18;
    if (moveW > 0) {
      this.dock.add(new Button(this, x + moveW / 2, ROW.buttons, moveW, 52, '移動', () => this.startMoving(b), { variant: 'wood', fontSize: '22px' }));
      x += moveW + gap;
    }
    const upW = w - 18 - closeW - gap - x;
    const canUpgrade = !reason;
    const shown = canUpgrade || !next ? label : (reason ?? label);
    const size = canUpgrade ? 24 : shown.length > 14 ? 14 : shown.length > 9 ? 16 : 20;
    const upgrade = new Button(this, x + upW / 2, ROW.buttons, upW, 52, shown, () => this.askUpgrade(b), { variant: canUpgrade ? 'gold' : 'wood', fontSize: `${size}px` });
    upgrade.setEnabled(canUpgrade);
    this.dock.add(upgrade);
    this.addCloseButton(closeW);
  }

  /** The one line saying what a building does for the village. */
  private statText(b: PlacedBuilding, level: number, now: number): string {
    const phase = movePhase(b, now);
    const def = getBuilding(b.kind);
    if (phase === 'demolish') return '解体中。終わると、新しい場所で再建築します';
    if (phase === 'rebuild') return '再建築中。終わると、また働きます';
    if (b.damaged) return '壊れています。直すまで働きません';
    if (def.decor) return '見た目だけの飾りです（効果はありません）';
    if (level === 0) return 'できあがると、村が少し豊かになります';
    if (def.produces) return `${materialName(def.produces)} +${levelValue(b, now)}/時（放置報酬に足されます）`;
    if (def.defense) return `防衛 ${levelValue(b, now)}　村全体 ${VillageSystem.defense(this.save, now)}／襲撃 ${VillageSystem.raidPower(this.save)}`;
    if (b.kind === 'shop' || b.kind === 'market') {
      const perHour = IdleSystem.baseGoldPerHour(this.save).mul(levelValue(b, now) * (1 + houseBonus(this.save, now)));
      return `売上 +${perHour.toString()}/時`;
    }
    if (b.kind === 'house') return `村じゅうの店の売上 +${Math.round(levelValue(b, now) * 1000) / 10}%`;
    return `建築員 ${builderCount(this.save, now)}人　建てられる数と最大レベルが増える`;
  }

  private select(id: string | undefined): void {
    this.selectedId = id;
    this.drawSelection();
    this.renderDock();
  }

  /** 撤去, small at the top right of the bar. */
  private addRemoveButton(b: PlacedBuilding): void {
    this.dock.add(new Button(this, DOCK.w - 18 - 50, ROW.title, 100, 38, '撤去', () => this.askRemove(b), { variant: 'wood', fontSize: '19px' }));
  }

  /** 撤去: asks first, with what comes back (the ゴールド does not). */
  private askRemove(b: PlacedBuilding): void {
    if (this.blocked()) return;
    const now = Date.now();
    const reason = VillageSystem.checkRemove(this.save, b, now);
    if (reason) {
      showToast(this, reason, '#ffb0a0');
      return;
    }
    const def = getBuilding(b.kind);
    const back = this.bundleText(VillageSystem.removeRefund(b, now));
    const name = def.decor ? def.name : `${def.name}（Lv${effectiveLevel(b, now)}）`;
    this.modal = openConfirm(this, noLock, {
      title: '撤去の確認',
      message: `${name}を撤去しますか？\n\n戻る素材　${back || 'なし'}\n（ゴールドは戻りません）${def.decor ? '' : '\nこの建物の働きもなくなります。'}\n\n元には戻せません。`,
      confirmLabel: '撤去する',
      onConfirm: () => this.doRemove(b),
    });
  }

  private doRemove(b: PlacedBuilding): void {
    const now = Date.now();
    const name = getBuilding(b.kind).name;
    const refund = VillageSystem.remove(this.save, b, now);
    if (!refund) {
      showToast(this, VillageSystem.checkRemove(this.save, b, now) ?? '撤去できません', '#ffb0a0');
      return;
    }
    SaveSystem.save(this.save);
    this.selectedId = undefined;
    this.refreshMaterials();
    this.flushRefresh();
    const tiles = VILLAGE_MATERIALS.filter(({ id }) => (refund[id] ?? 0) > 0).map(({ id }): RewardTile => ({ kind: 'material', material: id, amount: `+${(refund[id] ?? 0).toLocaleString('ja-JP')}` }));
    if (tiles.length > 0) this.modal = showRewardModal(this, noLock, { title: `${name}を撤去しました`, tiles });
    else showToast(this, `${name}を撤去しました`, '#ffe9b8');
  }

  /** 強化: asks first, with what it will cost and give. */
  private askUpgrade(b: PlacedBuilding): void {
    if (this.blocked()) return;
    const now = Date.now();
    const reason = VillageSystem.checkUpgrade(this.save, b, now);
    if (reason) {
      showToast(this, reason, '#ffb0a0');
      return;
    }
    const def = getBuilding(b.kind);
    const level = effectiveLevel(b, now);
    const gain = VillageSystem.incomeAfter(this.save, b, now);
    const gainLine = gain.after > gain.now + 1e-9 ? `\n売上　×${gain.now.toFixed(2)} → ×${gain.after.toFixed(2)}` : '';
    this.modal = openConfirm(this, noLock, {
      title: '強化の確認',
      message: `${def.name}を Lv${level + 1} に強化しますか？\n\n${this.costText(def.levels[level])}${gainLine}\n\n終わるまで建築員を1人使います。`,
      confirmLabel: '強化する',
      confirmVariant: 'gold',
      onConfirm: () => this.upgrade(b),
    });
  }

  private upgrade(b: PlacedBuilding): void {
    const now = Date.now();
    if (!VillageSystem.upgrade(this.save, b, now)) {
      showToast(this, VillageSystem.checkUpgrade(this.save, b, now) ?? '強くできません', '#ffb0a0');
      return;
    }
    SaveSystem.save(this.save);
    showToast(this, `${getBuilding(b.kind).name}の強化を始めました`, '#ffe9b8');
    this.flushRefresh();
  }

  // ---------------------------------------------------- build / placing --

  private openBuildMenu(): void {
    if (this.blocked()) return;
    const modal = openModal(this, noLock, 0.75, true);
    this.modal = modal;
    // The menu's own contents live in one container, so a tab change can redraw them without touching the dim layer.
    const content = this.add.container(0, 0);
    modal.container.add(content);
    this.drawBuildMenu(modal, content);
  }

  private drawBuildMenu(modal: ModalHandle, content: Phaser.GameObjects.Container): void {
    if (!content.active) return;
    content.removeAll(true);
    const kindsOf = (tab: BuildTab): typeof BUILDINGS => BUILDINGS.filter((d) => d.buildable && (d.tab ?? 'trade') === tab);
    const kinds = kindsOf(this.buildTab);
    const rowH = 176;
    const w = 640;
    // The top stays where it is on every tab (the longest tab sets it); a tab with fewer rows is just shorter (at least three).
    const longest = Math.max(3, ...BUILD_TABS.map((tab) => kindsOf(tab.id).length));
    const top = 640 - (196 + longest * rowH + 76) / 2;
    const h = 196 + Math.max(3, kinds.length) * rowH + 76;
    const cy = top + h / 2;
    const left0 = 360 - w / 2 + 24;
    content.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 18, rarity: 5, gradient: false }));
    content.add(this.add.zone(360, cy, w, h).setInteractive());
    content.add(heading(this, 360, top + 48, '建築', { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    const now = Date.now();
    content.add(caption(this, left0 + 4, top + 96, `建築員 ${busyBuilders(this.save, now)}/${builderCount(this.save, now)}`, { fontSize: '18px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const gems = VillageSystem.nextBuilderGems(this.save);
    if (gems !== null) {
      const enough = this.save.gems >= gems;
      const buy = new Button(this, 360 + w / 2 - 24 - 118, top + 96, 236, 40, `建築員を増やす　魔晶石 ${gems}`, () => this.askBuyBuilder(modal, content), { variant: enough ? 'gold' : 'wood', fontSize: '16px' });
      buy.setEnabled(enough);
      content.add(buy);
    }

    // Tabs: 商い / 採集 / 防衛 / 装飾.
    const tabW = (w - 48 - 8 * (BUILD_TABS.length - 1)) / BUILD_TABS.length;
    BUILD_TABS.forEach((tab, i) => {
      const x = left0 + i * (tabW + 8) + tabW / 2;
      content.add(
        new Button(this, x, top + 150, tabW, 46, tab.name, () => {
          this.buildTab = tab.id;
          // Redrawn after this tap finishes: it would otherwise destroy the button mid-click.
          this.time.delayedCall(0, () => this.drawBuildMenu(modal, content));
        }, { variant: tab.id === this.buildTab ? 'gold' : 'wood', fontSize: '22px' }),
      );
    });

    kinds.forEach((def, i) => {
      const y = top + 188 + i * rowH;
      const left = left0;
      content.add(createPanel(this, 360, y + rowH / 2 - 6, w - 36, rowH - 12, { fillColor: 0x241810, fillAlpha: 1, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, radius: 12, gradient: false }));

      const art = buildingArt(this, def.kind, 1);
      const scale = Math.min(104 / art.bounds.width, 104 / art.bounds.height);
      art.container.setScale(scale).setPosition(left + 60 - art.bounds.centerX * scale, y + 68 - art.bounds.centerY * scale);
      content.add(art.container);

      const have = VillageSystem.count(this.save, def.kind);
      const max = VillageSystem.maxCount(this.save, def.kind, now);
      content.add(heading(this, left + 130, y + 26, def.name, { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      content.add(caption(this, left + 130 + 100, y + 28, `${have}/${max}　${def.w}×${def.h}マス`, { fontSize: '16px', fontStyle: 'bold', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      content.add(caption(this, left + 130, y + 62, def.description, { fontSize: '15px', color: '#d8c49a', stroke: INK, strokeThickness: 2, wordWrap: { width: 330, useAdvancedWrap: true } }).setOrigin(0, 0));

      this.costLines(content, left + 130, y + 120, y + 150, def.levels[0], 22, 17);

      const reason = VillageSystem.checkStart(this.save, def.kind, now);
      const need = VillageSystem.castleNeededForNext(this.save, def.kind);
      const locked = have >= max;
      const short = reason?.includes('建築員') ? '建築員が不足' : reason?.includes('ゴールド') ? '資金不足' : '素材が不足';
      const text = locked ? (need ? `城Lv${need}で解放` : '上限です') : reason ? short : '選ぶ';
      const pick = new Button(this, left + w - 36 - 70, y + 56, 140, 56, text, () => {
        modal.close();
        this.modal = undefined;
        this.startPlacing(def.kind);
      }, { variant: reason ? 'wood' : 'gold', fontSize: reason ? '16px' : '26px' });
      pick.setEnabled(!reason);
      content.add(pick);
    });

    content.add(
      new Button(this, 360, top + h - 42, 200, 52, '閉じる', () => {
        modal.close();
        this.modal = undefined;
      }, { variant: 'wood', fontSize: '24px' }),
    );
  }

  /** Puts a new building on the map as a ghost to drag to where it should go; 建てる starts the work. */
  private startPlacing(kind: BuildingKind): void {
    const def = getBuilding(kind);
    // Nearest the middle of what is on screen.
    const mid = this.gridAt({ x: 360, y: 560 });
    const spot = VillageSystem.findSpot(this.save, kind, Math.round(mid.gx - def.w / 2), Math.round(mid.gy - def.h / 2));
    if (!spot) {
      showToast(this, '村に空き地がありません', '#ffb0a0');
      return;
    }
    this.selectedId = undefined;
    this.beginGhost(kind, 1, spot.x, spot.y);
  }

  /** 移動: takes the selected building as a ghost to drag to its new place (it stays where it is until that is confirmed). */
  private startMoving(b: PlacedBuilding): void {
    if (this.blocked()) return;
    const now = Date.now();
    const reason = VillageSystem.checkMoveStart(this.save, b, now);
    if (reason) {
      showToast(this, reason, '#ffb0a0');
      return;
    }
    this.beginGhost(b.kind, effectiveLevel(b, now), b.x, b.y, b.id);
  }

  private beginGhost(kind: BuildingKind, level: number, x: number, y: number, movingId?: string): void {
    this.mode = 'place';
    this.drawSelection();
    this.grid.setVisible(true);

    const art = buildingArt(this, kind, level);
    art.container.setAlpha(0.88);
    const zone = this.add.zone(art.bounds.centerX, art.bounds.centerY, art.bounds.width, art.bounds.height).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onGhostDown(p));
    const view = this.add.container(0, 0, [art.container, zone]);
    // Not in buildingLayer: that is rebuilt whenever the map is redrawn, which would take the ghost with it.
    this.ghostLayer.add(view);
    this.ghost = { kind, x, y, valid: true, view, movingId };
    if (movingId) this.views.get(movingId)?.setAlpha(0.45);
    this.renderDock();
  }

  /** Puts the ghost at its tile, coloured by whether it fits, and keeps the confirm button and its note in step. */
  private placeGhost(): void {
    const ghost = this.ghost;
    if (!ghost) return;
    const o = this.pos(ghost.x, ghost.y);
    ghost.view.setPosition(o.x, o.y);
    const moving = ghost.movingId ? VillageSystem.get(this.save, ghost.movingId) : undefined;
    const home = !!moving && ghost.x === moving.x && ghost.y === moving.y;
    let reason: string | null = null;
    if (ghost.movingId) reason = moving ? VillageSystem.checkMove(this.save, moving, ghost.x, ghost.y) : '移せません';
    else if (!VillageSystem.canPlace(this.save, ghost.kind, ghost.x, ghost.y)) reason = 'ここには置けません';
    ghost.valid = reason === null;
    this.paintFootprint(ghost.kind, ghost.x, ghost.y, ghost.valid || home);
    this.confirmButton?.setEnabled(ghost.valid);
    const hint = ghost.movingId ? '建物をドラッグ、または地面をタップして、移す場所を決めます' : '建物をドラッグ、または地面をタップして場所を決めます';
    const text = ghost.valid ? hint : home ? '移す場所を選んでください' : (reason ?? '');
    this.placeMessage?.setText(text).setColor(ghost.valid || home ? '#9fe39f' : '#ff9a8a');
  }

  private renderPlaceDock(ghost: Ghost): void {
    const def = getBuilding(ghost.kind);
    const w = DOCK.w;
    const moving = ghost.movingId ? VillageSystem.get(this.save, ghost.movingId) : undefined;
    this.dock.add(heading(this, 18, ROW.title, moving ? `${def.name}を移す` : def.decor ? `${def.name}を置く` : `${def.name}を建てる`, { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.placeMessage = caption(this, 18, ROW.line, '', { fontSize: '16px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    this.dock.add(this.placeMessage);
    if (moving && def.decor) {
      this.dock.add(body(this, 18, ROW.cost, 'すぐに移せます', { fontSize: '20px', fontStyle: 'bold', color: '#ffe79a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.dock.add(caption(this, 18, ROW.materials, '費用も建築員もいりません', { fontSize: '15px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    } else if (moving) {
      const times = VillageSystem.moveTimes(moving);
      this.dock.add(body(this, 18, ROW.cost, `解体 ${formatSpanExact(times.demolish)}　→　再建築 ${formatSpanExact(times.rebuild)}`, { fontSize: '20px', fontStyle: 'bold', color: '#ffe79a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.dock.add(caption(this, 18, ROW.materials, 'レベルそのまま・費用なし。終わるまで売上などは止まります', { fontSize: '15px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    } else {
      this.costLines(this.dock, 18, ROW.cost, ROW.materials, def.levels[0]);
    }

    this.dock.add(new Button(this, 18 + 70, ROW.buttons, 140, 52, 'やめる', () => this.cancelPlacing(), { variant: 'wood', fontSize: '22px' }));
    this.confirmButton = new Button(this, w - 18 - 165, ROW.buttons, 330, 52, moving ? 'ここに移す' : def.decor ? 'ここに置く' : 'ここに建てる', () => this.confirmPlacing(), { variant: 'gold', fontSize: '26px' });
    this.dock.add(this.confirmButton);
    this.placeGhost();
  }

  private endPlacing(): void {
    const movingId = this.ghost?.movingId;
    this.mode = 'browse';
    this.drag = undefined;
    this.ghost?.view.destroy();
    this.ghost = undefined;
    this.grid.setVisible(false);
    this.footprint.clear();
    if (movingId) this.views.get(movingId)?.setAlpha(1);
  }

  private cancelPlacing(): void {
    const movingId = this.ghost?.movingId;
    this.endPlacing();
    if (movingId) this.selectedId = movingId;
    this.drawSelection();
    this.renderDock();
  }

  /** ここに建てる / ここに移す: asks first, with what it will cost and take. */
  private confirmPlacing(): void {
    const ghost = this.ghost;
    if (!ghost || this.blocked()) return;
    const now = Date.now();
    const def = getBuilding(ghost.kind);
    const { x, y } = ghost;

    if (ghost.movingId) {
      const moving = VillageSystem.get(this.save, ghost.movingId);
      const reason = moving ? VillageSystem.checkMove(this.save, moving, x, y, now) : '移せません';
      if (!moving || reason) {
        showToast(this, reason ?? '移せません', '#ffb0a0');
        return;
      }
      if (def.decor) {
        this.modal = openConfirm(this, noLock, {
          title: '移動の確認',
          message: `${def.name}を、ここに移しますか？\n\nすぐに移せます。費用も建築員もいりません。`,
          confirmLabel: '移す',
          confirmVariant: 'gold',
          onConfirm: () => this.doMove(moving.id, x, y),
        });
        return;
      }
      const times = VillageSystem.moveTimes(moving, now);
      this.modal = openConfirm(this, noLock, {
        title: '移動の確認',
        message:
          `${def.name}を、ここに移しますか？\n\n解体　${formatSpanExact(times.demolish)}\n再建築　${formatSpanExact(times.rebuild)}\n合計　${formatSpanExact(times.demolish + times.rebuild)}\n\n` +
          'レベルはそのまま、費用はかかりません。\n終わるまで建築員を1人使い、\nこの建物の効果は止まります。',
        confirmLabel: '移す',
        confirmVariant: 'gold',
        onConfirm: () => this.doMove(moving.id, x, y),
      });
      return;
    }

    const reason = VillageSystem.checkBuild(this.save, ghost.kind, x, y, now);
    if (reason) {
      showToast(this, reason, '#ffb0a0');
      return;
    }
    this.modal = openConfirm(this, noLock, {
      title: def.decor ? '設置の確認' : '建築の確認',
      message: `${def.name}を、ここに${def.decor ? '置' : '建て'}ますか？\n\n${this.costText(def.levels[0])}\n\n${def.decor ? '建築員はいりません。' : '終わるまで建築員を1人使います。'}`,
      confirmLabel: def.decor ? '置く' : '建てる',
      confirmVariant: 'gold',
      onConfirm: () => this.doBuild(ghost.kind, x, y),
    });
  }

  private doBuild(kind: BuildingKind, x: number, y: number): void {
    const now = Date.now();
    const building = VillageSystem.build(this.save, kind, x, y, now);
    if (!building) {
      showToast(this, VillageSystem.checkBuild(this.save, kind, x, y, now) ?? '建てられません', '#ffb0a0');
      return;
    }
    SaveSystem.save(this.save);
    this.endPlacing();
    this.selectedId = building.id;
    this.flushRefresh();
    const view = this.views.get(building.id);
    if (view) popIn(this, view, { duration: 260 });
    const built = getBuilding(building.kind);
    showToast(this, built.decor ? `${built.name}を置きました` : `${built.name}の建築を始めました`, '#ffe9b8');
  }

  // ------------------------------------- repair, hurry, builders (each asks first)

  private askRepair(b: PlacedBuilding): void {
    if (this.blocked()) return;
    const now = Date.now();
    const reason = VillageSystem.checkRepair(this.save, b, now);
    if (reason) {
      showToast(this, reason, '#ffb0a0');
      return;
    }
    this.modal = openConfirm(this, noLock, {
      title: '修理の確認',
      message: `${getBuilding(b.kind).name}を直しますか？\n\n素材　${this.bundleText(VillageSystem.repairCost(b, now))}\n\nすぐに直ります。建築員はいりません。`,
      confirmLabel: '直す',
      confirmVariant: 'gold',
      onConfirm: () => {
        if (!VillageSystem.repair(this.save, b)) {
          showToast(this, VillageSystem.checkRepair(this.save, b) ?? '直せません', '#ffb0a0');
          return;
        }
        SaveSystem.save(this.save);
        showToast(this, `${getBuilding(b.kind).name}を直しました`, '#9fe39f');
        this.flushRefresh();
      },
    });
  }

  private askFinish(b: PlacedBuilding): void {
    if (this.blocked()) return;
    const now = Date.now();
    const reason = VillageSystem.checkFinish(this.save, b, now);
    if (reason) {
      showToast(this, reason, '#ffb0a0');
      return;
    }
    const cost = VillageSystem.finishCost(b, now);
    const work = VillageSystem.work(b, now);
    this.modal = openConfirm(this, noLock, {
      title: 'すぐ完成の確認',
      message: `${getBuilding(b.kind).name}の作業を、今すぐ終わらせますか？\n（あと ${formatSpanExact(work?.totalLeft ?? 0)}）\n\n魔晶石 ${cost} を使います。\n（今 ${this.save.gems.toLocaleString('ja-JP')} → ${(this.save.gems - cost).toLocaleString('ja-JP')}）`,
      confirmLabel: '完成させる',
      confirmVariant: 'gold',
      onConfirm: () => {
        if (!VillageSystem.finishNow(this.save, b)) {
          showToast(this, VillageSystem.checkFinish(this.save, b) ?? '終わらせられません', '#ffb0a0');
          return;
        }
        SaveSystem.save(this.save);
        showToast(this, `${getBuilding(b.kind).name}が完成しました`, '#9fe39f');
        this.flushRefresh();
      },
    });
  }

  private askBuyBuilder(menu: ModalHandle, content: Phaser.GameObjects.Container): void {
    const cost = VillageSystem.nextBuilderGems(this.save);
    const reason = VillageSystem.checkBuyBuilder(this.save);
    if (reason || cost === null) {
      showToast(this, reason ?? 'これ以上は増やせません', '#ffb0a0');
      return;
    }
    this.modal = openConfirm(this, noLock, {
      title: '建築員の追加',
      message: `建築員を1人増やしますか？\n（今 ${builderCount(this.save)}人 → ${builderCount(this.save) + 1}人）\n\n魔晶石 ${cost} を使います。\n（今 ${this.save.gems.toLocaleString('ja-JP')} → ${(this.save.gems - cost).toLocaleString('ja-JP')}）`,
      confirmLabel: '増やす',
      confirmVariant: 'gold',
      onConfirm: () => {
        this.modal = menu;
        if (!VillageSystem.buyBuilder(this.save)) {
          showToast(this, VillageSystem.checkBuyBuilder(this.save) ?? '増やせません', '#ffb0a0');
          return;
        }
        SaveSystem.save(this.save);
        this.resourceBar.update(this.save);
        this.refreshHeader();
        showToast(this, '建築員が1人増えました', '#9fe39f');
        this.drawBuildMenu(menu, content);
      },
    });
  }

  // ---------------------------------------------------------------- 依頼

  private openQuests(): void {
    if (this.blocked()) return;
    const modal = openModal(this, noLock, 0.75, true);
    this.modal = modal;
    const content = this.add.container(0, 0);
    modal.container.add(content);
    this.drawQuests(modal, content);
  }

  private drawQuests(modal: ModalHandle, content: Phaser.GameObjects.Container): void {
    if (!content.active) return;
    content.removeAll(true);
    const now = Date.now();
    const rowH = 104;
    const w = 640;
    const h = 130 + VILLAGE_QUESTS.length * rowH + 76;
    const cy = 640;
    const top = cy - h / 2;
    const left = 360 - w / 2 + 24;
    content.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 18, rarity: 5, gradient: false }));
    content.add(this.add.zone(360, cy, w, h).setInteractive());
    content.add(heading(this, 360, top + 48, '村の依頼', { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    content.add(caption(this, 360, top + 92, '毎日、午前0時に新しくなります。報酬は素材です。', { fontSize: '17px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));

    VILLAGE_QUESTS.forEach((quest, i) => {
      const y = top + 118 + i * rowH;
      const done = VillageQuests.isDone(this.save, quest, now);
      const claimed = VillageQuests.isClaimed(this.save, quest, now);
      content.add(createPanel(this, 360, y + rowH / 2 - 6, w - 36, rowH - 12, { fillColor: 0x241810, fillAlpha: 1, borderColor: done && !claimed ? CHROME.brassBright : CHROME.brassDark, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
      content.add(body(this, left + 10, y + 24, quest.text, { fontSize: '21px', fontStyle: 'bold', color: claimed ? '#a89a78' : '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      content.add(caption(this, left + 10, y + 62, `${VillageQuests.count(this.save, quest, now)}/${quest.target}`, { fontSize: '19px', fontStyle: 'bold', color: done ? '#9fe39f' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.materialChips(content, left + 80, y + 62, VillageQuests.reward(this.save, quest), 24, 18, false);
      const text = claimed ? '受け取り済み' : done ? '受け取る' : '未達成';
      const button = new Button(this, left + w - 36 - 66, y + 46, 132, 56, text, () => this.claimQuest(quest.id, modal, content), { variant: done && !claimed ? 'gold' : 'wood', fontSize: done && !claimed ? '24px' : '17px' });
      button.setEnabled(done && !claimed);
      content.add(button);
    });

    content.add(
      new Button(this, 360, top + h - 42, 200, 52, '閉じる', () => {
        modal.close();
        this.modal = undefined;
        this.renderDock();
      }, { variant: 'wood', fontSize: '24px' }),
    );
  }

  private claimQuest(id: string, modal: ModalHandle, content: Phaser.GameObjects.Container): void {
    const reward = VillageQuests.claim(this.save, id);
    if (!reward) return;
    SaveSystem.save(this.save);
    this.refreshMaterials();
    showToast(this, `素材を受け取りました　${this.bundleText(reward)}`, '#ffe9b8');
    // Redrawn after this tap finishes: it would otherwise destroy the button mid-click.
    this.time.delayedCall(0, () => this.drawQuests(modal, content));
  }

  // --------------------------------------------------------------- 襲撃

  /** Keeps the banner for a waiting 襲撃 (top of the screen) in step with the save: made when one comes, counting down
   *  meanwhile, gone when it is beaten or gives up waiting. */
  private refreshRaidBanner(): void {
    const now = Date.now();
    const pending = this.save.village.raid.pending;
    const live = pending && now < pending.expiresAt ? pending : null;
    const key = live ? String(live.arrivedAt) : '';
    if (key !== this.raidKey) {
      this.raidBanner?.destroy();
      this.raidBanner = undefined;
      this.raidText = undefined;
      this.raidKey = key;
      if (live) this.buildRaidBanner();
    }
    if (live && this.raidText) {
      const defense = VillageSystem.defense(this.save, now);
      const holds = defense >= live.power;
      this.raidText.setText(`防衛 ${defense} / 敵 ${live.power}　あと ${StaminaSystem.formatDuration(VillageSystem.raidSecondsLeft(this.save, now))}${holds ? '　壁で防げます' : ''}`);
      this.raidText.setColor(holds ? '#9fe39f' : '#ffe0c8');
    }
  }

  private buildRaidBanner(): void {
    const w = 692;
    const h = 78;
    const box = this.add.container(360, 246).setDepth(12);
    box.add(createPanel(this, 0, 0, w, h, { fillColor: 0x3a1410, fillAlpha: 0.95, borderColor: 0xd0583a, glowColor: 0xff8a60, radius: 14, gradient: false }));
    box.add(heading(this, -w / 2 + 18, -17, '襲撃！ 獣の群れが近づいています', { fontSize: '22px', color: '#ffb09a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.raidText = caption(this, -w / 2 + 18, 15, '', { fontSize: '17px', fontStyle: 'bold', color: '#ffe0c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    box.add(this.raidText);
    box.add(new Button(this, w / 2 - 92, 0, 164, 56, '迎え撃つ', () => this.askRaid(), { variant: 'gold', fontSize: '26px' }));
    this.raidBanner = box;
  }

  /** 迎え撃つ: asks first, with what the beasts are and what winning pays; then it is an ordinary fight. */
  private askRaid(): void {
    if (this.blocked()) return;
    const battle = VillageSystem.raidBattle(this.save);
    const reward = VillageSystem.raidReward(this.save);
    if (!battle || !reward || VillageSystem.raidSecondsLeft(this.save) <= 0) {
      showToast(this, '襲撃は去っていきました', '#ffb0a0');
      this.flushRefresh();
      return;
    }
    const party = SaveSystem.getPartyHeroes(this.save);
    if (party.front.length + party.back.length === 0) {
      this.modal = openConfirm(this, noLock, { title: '編成が空です', message: 'パーティが空のため出撃できません。\n名鑑で編成しますか？', confirmLabel: '名鑑へ', confirmVariant: 'gold', onConfirm: () => this.scene.start('Roster') });
      return;
    }
    const stage = ProgressionSystem.getRaidStage(battle.stageIndex, battle.seed);
    this.modal = openConfirm(this, noLock, {
      title: '襲撃を迎え撃つ',
      message: `獣の群れ（${stage.enemies.length}体）と戦います。\n\n勝つと\n${this.bundleText(reward.materials)}\nゴールド ${reward.gold.toString()}\n\nスタミナは使いません。\n負けても、時間内ならやり直せます。`,
      confirmLabel: '出撃',
      confirmVariant: 'gold',
      onConfirm: () => {
        SaveSystem.save(this.save);
        this.scene.start('Battle', battle);
      },
    });
  }

  /** What happened to a 襲撃 nobody answered, told once. */
  private showRaidReport(): void {
    if (this.blocked() || !this.save.village.raid.report) return;
    const report = VillageSystem.takeRaidReport(this.save);
    if (!report) return;
    SaveSystem.save(this.save);
    const message =
      report.outcome === 'repelled'
        ? '襲撃がありましたが、柵と門が追い返しました。\n被害はありません。'
        : `襲撃で、${report.damaged.join('・')}が壊されました。\n建物を選んで、素材で直しましょう。\n（柵と門を強くすると、防げます）`;
    this.modal = openConfirm(this, noLock, { title: '襲撃の報告', message, confirmLabel: '確認', confirmVariant: 'gold', onConfirm: () => {} });
    this.flushRefresh();
  }

  // ------------------------------------------------------ 行商人 and 宝箱

  /** (Re)draws the 行商人 and 宝箱 on the map: each bobs a little, and a tap opens it. */
  private renderWanderers(): void {
    for (const tween of this.wandererTweens) tween.stop();
    this.wandererTweens = [];
    this.wandererLayer.removeAll(true);
    const now = Date.now();
    for (const w of this.save.village.wanderers.items) {
      if (now >= w.expiresAt) continue;
      const art = wandererArt(this, w.kind);
      const origin = this.pos(w.x, w.y);
      const view = this.add.container(origin.x, origin.y, [art.container]);
      view.add(this.plate(art.bounds.centerX, art.bounds.y - 4, WANDERERS[w.kind].name, 15));
      const zone = this.add.zone(art.bounds.centerX, art.bounds.centerY, art.bounds.width, art.bounds.height).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onWandererDown(w, p));
      view.add(zone);
      this.wandererTweens.push(this.tweens.add({ targets: art.container, y: -6, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
      this.wandererLayer.add(view);
    }
  }

  private collectWanderer(id: string): void {
    const got = VillageSystem.collect(this.save, id);
    if (!got) {
      showToast(this, 'もう行ってしまいました', '#ffb0a0');
      this.flushRefresh();
      return;
    }
    SaveSystem.save(this.save);
    this.resourceBar.update(this.save);
    this.refreshMaterials();
    const tiles: RewardTile[] = VILLAGE_MATERIALS.filter(({ id: m }) => (got.wanderer.materials[m] ?? 0) > 0).map(({ id: m }): RewardTile => ({ kind: 'material', material: m, amount: `+${(got.wanderer.materials[m] ?? 0).toLocaleString('ja-JP')}` }));
    if (!got.gold.isZero()) tiles.unshift({ kind: 'gold', amount: `+${got.gold.toString()}` });
    this.modal = showRewardModal(this, noLock, { title: `${WANDERERS[got.wanderer.kind].name}を開けました`, tiles });
    this.flushRefresh();
  }

  private doMove(id: string, x: number, y: number): void {
    const b = VillageSystem.get(this.save, id);
    if (!b) return;
    const now = Date.now();
    if (!VillageSystem.startMove(this.save, b, x, y, now)) {
      showToast(this, VillageSystem.checkMove(this.save, b, x, y, now) ?? '移せません', '#ffb0a0');
      return;
    }
    SaveSystem.save(this.save);
    this.endPlacing();
    this.selectedId = b.id;
    this.flushRefresh();
    const def = getBuilding(b.kind);
    showToast(this, def.decor ? `${def.name}を移しました` : `${def.name}の移転を始めました（解体 → 再建築）`, '#ffe9b8');
  }
}
