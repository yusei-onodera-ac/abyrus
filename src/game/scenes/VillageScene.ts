import Phaser from 'phaser';
import { BUILD_TABS, VILLAGE_COLS, VILLAGE_ROWS, VILLAGE_MATERIALS, VILLAGE_START, BUILDINGS, WANDERERS, getBuilding, materialName, type BuildTab, type BuildingKind, type BuildingLevel, type MaterialBundle } from '../data/village';
import { VILLAGE_QUESTS } from '../data/villageQuests';
import { IdleSystem } from '../systems/IdleSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem, type PlacedBuilding, type SaveData, type Wanderer } from '../systems/SaveSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
import { VillageSystem, settleChanged, type SettleResult, type WorkKind } from '../systems/VillageSystem';
import { VillageQuests } from '../systems/VillageQuests';
import { builderCount, busyBuilders, castleLevel, effectiveLevel, footprints, houseBonus, isMoving, levelValue, movePhase } from '../systems/VillageIncome';
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
import { ISO, ROAD_E, ROAD_N, ROAD_S, ROAD_W, VILLAGE_GROUND_KEY, VILLAGE_PLOT_TIERS, buildingArt, roadTile, constructionArt, isoGrid, isoPoint, villagePlotKey, villagePlotTier, wandererArt, type Art, type Pt } from '../ui/VillageArt';
import { VillageLife } from '../ui/VillageLife';
import { VillageFx, villageThumb } from '../ui/VillageFx';
import { openVillageGoals } from '../ui/VillageGoalsModal';
import { VillageGoals } from '../systems/VillageGoals';

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
/** Rows inside the bar: the name, one line of what it does, two lines of cost (ゴールド and time / 素材), the buttons. */
const ROW = { title: 24, line: 54, cost: 84, materials: 112, buttons: 156 };
/** A press that travels further than this many px is a drag, not a tap. */
const DRAG_PX = 10;
/** Holding a press this long on a 装飾 lifts it, to be dragged to a new place. */
const HOLD_MS = 250;
/** Two taps on bare ground this close in time (ms) and place (px) zoom the map in or out. */
const DOUBLE_TAP_MS = 420;
const DOUBLE_TAP_PX = 44;
/** The shorter bar along the bottom for the selected building / placing (the buttons float on the map). */
const COMPACT = { h: 100, placeH: 146 };

type Mode = 'browse' | 'place' | 'road';

/** 道づくり: what the finger does (敷く lays paving, 消す takes it up, 動かす looks around). */
type RoadTool = 'draw' | 'erase' | 'pan';

/** A stroke of the finger over the ground in road mode. */
interface RoadStroke {
  last?: { x: number; y: number };
  laid: number;
  erased: number;
  /** Why nothing more could be laid (said once). */
  stopped?: string;
}

/** One round button on the map (the ones floating round the selected building, or the ✓ / ✗ by the ghost). */
interface RoundSpec {
  glyph: 'up' | 'move' | 'trash' | 'info' | 'wrench' | 'bolt' | 'check' | 'cross' | 'castle';
  label: string;
  tone: 'gold' | 'wood' | 'red' | 'green';
  /** A small line under the label (a price, or why it cannot be pressed). */
  sub?: string;
  subColor?: string;
  /** False: drawn dimmed (a tap still runs `onTap`, which says why it cannot). */
  enabled: boolean;
  radius?: number;
  onTap: () => void;
}

/** A 装飾 held down and dragged: it follows the finger, and where it is let go it is put down (or goes back). */
interface Lift {
  id: string;
  /** Where the pointer took hold, in tiles from the piece's top corner. */
  gx: number;
  gy: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  moved: boolean;
  valid: boolean;
  view: Phaser.GameObjects.Container;
}

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
  /** The picture inside `view` (it hops a little each time the ghost lands on a new tile). */
  art: Phaser.GameObjects.Container;
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
  /** Smoke, builders, villagers, day and night: everything that moves by itself (ui/VillageLife.ts). */
  private life?: VillageLife;
  private raidBanner?: Phaser.GameObjects.Container;
  private raidText?: Phaser.GameObjects.Text;
  private raidKey = '';
  private buildTab: BuildTab = 'trade';
  private selection!: Phaser.GameObjects.Container;
  private ghostLayer!: Phaser.GameObjects.Container;
  private views = new Map<string, Phaser.GameObjects.Container>();
  private ticking: Ticking[] = [];
  private grid!: Phaser.GameObjects.Graphics;
  /** The village's own diamond drawn from code, and the picture of its plot (by castle level) that replaces it. */
  private lawn?: Phaser.GameObjects.Graphics;
  private plot?: Phaser.GameObjects.Image;
  private plotKey = '';
  private footprint!: Phaser.GameObjects.Graphics;
  private dock!: Phaser.GameObjects.Container;
  private dockTick?: () => void;
  private headerTop!: Phaser.GameObjects.Text;
  private headerGold!: Phaser.GameObjects.Text;
  private materialTexts = new Map<string, Phaser.GameObjects.Text>();
  private confirmButton?: Button;
  private placeMessage?: Phaser.GameObjects.Text;

  // 操作: the round buttons on the map, a 装飾 being lifted, the camera's comforts.
  private floatLayer!: Phaser.GameObjects.Container;
  private floatKey = '';
  private floatTweens: Phaser.Tweens.Tween[] = [];
  /** Where the floating buttons hang: the selected building's top, or the ghost's front corner (screen px). */
  private floatAnchor?: () => { x: number; y: number; top?: number; bottom?: number } | null;
  private floatHalfW = 0;
  private floatConfirm?: Phaser.GameObjects.Container;
  private lift?: Lift;
  private roadLayer!: Phaser.GameObjects.Container;
  private roadTool: RoadTool = 'draw';
  private roadStroke?: RoadStroke;
  private roadCount?: Phaser.GameObjects.Text;
  private holdTimer?: Phaser.Time.TimerEvent;
  /** 連続配置: after a place is confirmed, the same kind is put up again straight away. */
  private repeat = false;
  private lastTap?: { t: number; x: number; y: number };
  private velocity = { x: 0, y: 0 };
  private lastPan?: { t: number; x: number; y: number };
  private guideTween?: Phaser.Tweens.Tween;

  // ゲーム性: 完成の演出 and the 村の目標 button.
  private fx?: VillageFx;
  private goalsDot?: Phaser.GameObjects.Graphics;

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
    this.floatKey = '';
    this.floatTweens = [];
    this.floatAnchor = undefined;
    this.floatHalfW = 0;
    this.floatConfirm = undefined;
    this.lift = undefined;
    this.holdTimer = undefined;
    this.repeat = false;
    this.lastTap = undefined;
    this.velocity = { x: 0, y: 0 };
    this.lastPan = undefined;
    this.guideTween = undefined;
    this.fx = undefined;
    this.goalsDot = undefined;
    this.life = undefined;
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
    this.roadLayer = this.add.container(0, 0);
    this.buildingLayer = this.add.container(0, 0);
    this.markers = this.add.container(0, 0);
    this.wandererLayer = this.add.container(0, 0);
    this.selection = this.add.container(0, 0);
    this.ghostLayer = this.add.container(0, 0);
    this.world.add([this.grid, this.footprint, this.roadLayer, this.buildingLayer, this.markers, this.wandererLayer, this.selection, this.ghostLayer]);
    this.life = new VillageLife(this, {
      world: this.world,
      buildingLayer: this.buildingLayer,
      save: () => this.save,
      pos: (gx, gy) => this.pos(gx, gy),
      zoom: () => this.zoom,
      worldSize: WORLD,
      busy: () => this.mode === 'place' || this.blocked(),
    });

    this.resourceBar = new ResourceBar(this, 0, 0, 720);
    this.resourceBar.setDepth(20);
    this.resourceBar.update(this.save);
    enter(this, this.resourceBar, { dy: -20, duration: 280 });
    this.buildHeader();
    this.buildMaterialBar();
    this.dock = this.add.container(0, 0).setDepth(14);
    // The round buttons hanging round the selected building / the ghost: in screen space, so they stay one size at any zoom.
    this.floatLayer = this.add.container(0, 0).setDepth(13);

    this.renderBuildings();
    this.renderDock();
    this.refreshHeader();
    this.focusOn(this.save.village.buildings.find((b) => b.kind === 'castle'));

    this.input.on('pointerdown', () => {
      // A new touch stops a pan that is still coasting.
      this.velocity = { x: 0, y: 0 };
      this.maybeBeginPinch();
    });
    this.events.on(Phaser.Scenes.Events.UPDATE, (_time: number, delta: number) => this.coast(delta));
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

    // The village's own diamond: two greens, close enough together to read as one lawn (hidden once a picture of the plot is there).
    const lawn = this.add.graphics();
    for (let gx = 0; gx < VILLAGE_COLS; gx++) {
      for (let gy = 0; gy < VILLAGE_ROWS; gy++) {
        lawn.fillStyle((gx + gy) % 2 === 0 ? 0x6bb751 : 0x66b14d, 1);
        lawn.fillPoints([this.pos(gx, gy), this.pos(gx + 1, gy), this.pos(gx + 1, gy + 1), this.pos(gx, gy + 1)], true);
      }
    }
    lawn.lineStyle(4, 0xffffff, 0.25);
    lawn.strokePoints([this.pos(0, 0), this.pos(VILLAGE_COLS, 0), this.pos(VILLAGE_COLS, VILLAGE_ROWS), this.pos(0, VILLAGE_ROWS)], true);
    this.lawn = lawn;

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
    this.world.add([g, lawn]);
    this.refreshPlot();
  }

  /** How far the plot's picture reaches past the grid's diamond (its border sits just outside the first and last tile). */
  private static readonly PLOT_MARGIN = 1.03;

  /** The picture of the village's plot for the castle's level now (the best one that exists), over the drawn lawn; the plot
   *  grows from a rural patch to a town to a royal city as the castle does. Without any picture the drawn lawn stays. */
  private refreshPlot(): void {
    const tier = villagePlotTier(castleLevel(this.save));
    let key = '';
    for (let t = tier; t >= 1 && !key; t--) if (this.textures.exists(villagePlotKey(t))) key = villagePlotKey(t);
    for (let t = tier + 1; t <= VILLAGE_PLOT_TIERS && !key; t++) if (this.textures.exists(villagePlotKey(t))) key = villagePlotKey(t);
    if (key === this.plotKey) return;
    const old = this.plot;
    this.plotKey = key;
    this.lawn?.setVisible(key === '');
    if (!key) {
      old?.destroy();
      this.plot = undefined;
      return;
    }
    const top = this.pos(0, 0);
    const bottom = this.pos(VILLAGE_COLS, VILLAGE_ROWS);
    const right = this.pos(VILLAGE_COLS, 0);
    const left = this.pos(0, VILLAGE_ROWS);
    const image = this.add.image((top.x + bottom.x) / 2, (top.y + bottom.y) / 2, key).setDisplaySize((right.x - left.x) * VillageScene.PLOT_MARGIN, (bottom.y - top.y) * VillageScene.PLOT_MARGIN);
    // Just above the drawn ground, under every building.
    this.world.addAt(image, this.world.getIndex(this.lawn as Phaser.GameObjects.Graphics) + 1);
    this.plot = image;
    if (old) {
      // Growing into the next stage: the old plot melts into the new one.
      image.setAlpha(0);
      this.tweens.add({ targets: image, alpha: 1, duration: 900 });
      this.tweens.add({ targets: old, alpha: 0, duration: 900, onComplete: () => old.destroy() });
    }
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
    this.positionFloat();
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

  /** Double tap: in on the spot that was tapped, or back out to the usual view when already close. */
  private toggleZoom(sx: number, sy: number): void {
    const target = this.zoom < 1.25 ? 1.6 : START_ZOOM;
    const from = this.zoom;
    this.velocity = { x: 0, y: 0 };
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 280,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => this.zoomAt(sx, sy, from + (target - from) * (tween.getValue() ?? 1)),
    });
  }

  /** 城へ: slides back to the 城 (at the usual zoom). */
  private recenter(): void {
    const castle = this.save.village.buildings.find((b) => b.kind === 'castle');
    const def = castle ? getBuilding(castle.kind) : undefined;
    const c = castle && def ? this.pos(castle.x + def.w / 2, castle.y + def.h / 2) : this.pos(VILLAGE_COLS / 2, VILLAGE_ROWS / 2);
    const z0 = this.zoom;
    const x0 = this.world.x;
    const y0 = this.world.y;
    const z1 = Math.max(START_ZOOM, Math.min(this.zoom, 1.2));
    this.velocity = { x: 0, y: 0 };
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 380,
      ease: 'Cubic.easeInOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        this.zoom = z0 + (z1 - z0) * t;
        this.world.x = x0 + (360 - c.x * z1 - x0) * t;
        this.world.y = y0 + (600 - c.y * z1 - y0) * t;
        this.applyView();
      },
    });
  }

  /** Every frame (from the scene's UPDATE event, see create): a pan that was let go of keeps sliding for a moment, slowing down. */
  private coast(delta: number): void {
    const v = this.velocity;
    if (v.x === 0 && v.y === 0) return;
    if (this.panning || this.pinch || this.lift || this.drag?.dragging || this.blocked()) {
      this.velocity = { x: 0, y: 0 };
      return;
    }
    this.world.x += v.x * delta;
    this.world.y += v.y * delta;
    const keep = Math.pow(0.0035, delta / 1000);
    v.x *= keep;
    v.y *= keep;
    if (Math.hypot(v.x, v.y) < 0.02) this.velocity = { x: 0, y: 0 };
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
    // (The round 村の目標 button takes the end of the row.)
    const w = 720 - 14 - left - 66;
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
    this.buildGoalsButton();
  }

  private refreshHeader(): void {
    const now = Date.now();
    this.headerTop.setText(`村Lv${castleLevel(this.save, now)}　建築員 ${busyBuilders(this.save, now)}/${builderCount(this.save, now)}`);
    this.headerGold.setText(`売上 +${IdleSystem.perHour(this.save, now).gold.toString()}/時`);
    this.refreshMaterials();
    this.refreshRaidBanner();
    this.refreshGoalsDot();
  }

  // ------------------------------------------- 村の目標 and 完成の演出 --

  /** The round 目標 button at the end of the header row, with a red dot while a goal can be collected. */
  private buildGoalsButton(): void {
    const r = 28;
    const box = this.add.container(720 - 14 - r, 142 + r).setDepth(12);
    const disc = this.add.graphics();
    disc.fillStyle(0x000000, 0.35);
    disc.fillCircle(0, 3, r);
    disc.fillStyle(0xc7701c, 1);
    disc.fillCircle(0, 0, r);
    disc.fillStyle(0xffffff, 0.2);
    disc.fillEllipse(0, -r * 0.4, r * 1.3, r * 0.62);
    disc.lineStyle(3, CHROME.brassBright, 1);
    disc.strokeCircle(0, 0, r);
    box.add(disc);
    box.add(caption(this, 0, 1, '目標', { fontSize: '19px', fontStyle: 'bold', color: '#fff4dc', stroke: '#4a2406', strokeThickness: 4 }).setOrigin(0.5));
    this.goalsDot = this.add.graphics();
    box.add(this.goalsDot);
    const hit = this.add.zone(0, 0, r * 2, r * 2).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.openGoals());
    box.add(hit);
    enter(this, box, { dx: 30, dy: 0, duration: 320, delay: 200 });
  }

  private refreshGoalsDot(): void {
    if (!this.goalsDot) return;
    this.goalsDot.clear();
    if (VillageGoals.claimable(this.save).length === 0) return;
    this.goalsDot.fillStyle(0x1b1d29, 1);
    this.goalsDot.fillCircle(20, -20, 10);
    this.goalsDot.fillStyle(0xff4d4d, 1);
    this.goalsDot.fillCircle(20, -20, 8);
  }

  /** 村の目標: the goals and 村の発展 in a popup. */
  private openGoals(): void {
    if (this.blocked() || this.mode !== 'browse') return;
    this.modal = openVillageGoals({
      scene: this,
      save: this.save,
      onChanged: () => {
        SaveSystem.save(this.save);
        this.refreshMaterials();
        this.refreshGoalsDot();
        this.resourceBar.update(this.save);
      },
      showCastle: () => {
        const castle = this.save.village.buildings.find((b) => b.kind === 'castle');
        if (!castle) return;
        this.focusOn(castle);
        this.select(castle.id);
      },
      onClosed: () => {
        this.modal = undefined;
        this.refreshGoalsDot();
        this.renderDock();
      },
    });
  }

  /** 完成の演出 for what a settle took in (see ui/VillageFx.ts). */
  private celebrate(done: SettleResult): void {
    if (done.finished.length + done.rebuilt.length === 0) return;
    this.fx ??= new VillageFx({
      scene: this,
      world: this.world,
      pos: (gx, gy) => this.pos(gx, gy),
      zoom: () => this.zoom,
      glideTo: (gx, gy, then) => this.glideTo(gx, gy, then),
      busy: () => this.blocked() || this.mode === 'place' || !!this.lift,
    });
    this.fx.celebrate({ finished: done.finished, rebuilt: done.rebuilt });
  }

  /** Slides the camera so a point of the map (in tiles) is in the middle, then calls `then` (at once when the player is busy with the map). */
  private glideTo(gx: number, gy: number, then: () => void): void {
    if (this.panning || this.pinch || this.drag?.dragging || this.lift) {
      then();
      return;
    }
    const c = this.pos(gx, gy);
    const x0 = this.world.x;
    const y0 = this.world.y;
    const x1 = 360 - c.x * this.zoom;
    const y1 = 600 - c.y * this.zoom;
    this.velocity = { x: 0, y: 0 };
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 420,
      ease: 'Cubic.easeInOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        this.world.x = x0 + (x1 - x0) * t;
        this.world.y = y0 + (y1 - y0) * t;
        this.applyView();
      },
      onComplete: () => then(),
    });
  }

  private refreshMaterials(): void {
    const room = (720 - 14 - (14 + 270 + 10) - 66) / VILLAGE_MATERIALS.length - 46;
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
    this.life?.beforeRender();
    this.buildingLayer.removeAll(true);
    this.markers.removeAll(true);
    this.views = new Map();
    this.ticking = [];
    const front = (b: PlacedBuilding): number => b.x + getBuilding(b.kind).w + b.y + getBuilding(b.kind).h;
    this.renderRoads(now);
    for (const b of [...this.save.village.buildings].filter((x) => !getBuilding(x.kind).road).sort((a, c) => front(a) - front(c))) {
      const view = this.buildView(b);
      this.views.set(b.id, view);
      this.buildingLayer.add(view);
      if (movePhase(b, now) === 'demolish') this.addMoveMarker(b);
    }
    // Smoke, builders, villagers and the rest of the village's life (ui/VillageLife.ts) settle in among the new views.
    this.life?.afterRender(this.views);
    this.renderWanderers();
    this.drawSelection();
  }

  /** The paving: one picture per piece, the right shape for the pieces round it, under every building (a piece under a
   *  building is hidden; the neighbours still lead up to it). */
  private renderRoads(now = Date.now()): void {
    this.roadLayer.removeAll(true);
    const roads = this.save.village.buildings.filter((b) => getBuilding(b.kind).road);
    if (roads.length === 0) return;
    const has = new Set(roads.map((b) => `${b.x},${b.y}`));
    const covered = new Set<string>();
    for (const b of this.save.village.buildings) {
      const def = getBuilding(b.kind);
      if (def.road) continue;
      for (const at of footprints(b, now)) for (let y = at.y; y < at.y + def.h; y++) for (let x = at.x; x < at.x + def.w; x++) covered.add(`${x},${y}`);
    }
    const tier = villagePlotTier(castleLevel(this.save, now));
    // Back to front, so the kerbs of the nearer pieces lie over the farther ones.
    for (const b of [...roads].sort((a, c) => a.x + a.y - (c.x + c.y))) {
      if (covered.has(`${b.x},${b.y}`)) continue;
      const mask = (has.has(`${b.x},${b.y - 1}`) ? ROAD_N : 0) | (has.has(`${b.x + 1},${b.y}`) ? ROAD_E : 0) | (has.has(`${b.x},${b.y + 1}`) ? ROAD_S : 0) | (has.has(`${b.x - 1},${b.y}`) ? ROAD_W : 0);
      const top = this.pos(b.x, b.y);
      this.roadLayer.add(this.add.image(top.x - ISO.tileW / 2, top.y, roadTile(this, tier, mask)).setOrigin(0, 0));
    }
  }

  // ------------------------------------------------------------ 道づくり --

  /** 道を敷く: the whole screen becomes a canvas - a finger drawn over the ground lays paving, 消す takes it up, 動かす looks around. */
  private startRoadMode(): void {
    this.mode = 'road';
    this.roadTool = 'draw';
    this.roadStroke = undefined;
    this.selectedId = undefined;
    this.drawSelection();
    this.grid.setVisible(true);
    this.renderDock();
  }

  private endRoadMode(): void {
    this.roadStroke = undefined;
    this.mode = 'browse';
    this.grid.setVisible(false);
    SaveSystem.save(this.save);
    this.renderDock();
  }

  private setRoadTool(tool: RoadTool): void {
    this.roadTool = tool;
    this.roadStroke = undefined;
    this.renderDock();
  }

  /** The bar along the bottom in road mode: what it costs, how many are laid, the three tools and 終わり. */
  private renderRoadBar(): void {
    const level = getBuilding('road').levels[0];
    this.panelDock(176);
    this.dock.add(heading(this, 18, 28, '道づくり', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.roadCount = caption(this, DOCK.w - 18, 28, '', { fontSize: '20px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5);
    this.dock.add(this.roadCount);
    const hint = this.roadTool === 'draw' ? '指でなぞると、道が敷けます' : this.roadTool === 'erase' ? 'なぞった道を消します' : '地図を動かして、見回せます';
    this.dock.add(caption(this, 18, 60, hint, { fontSize: '18px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    this.dock.add(caption(this, 18, 90, `1マス　ゴールド ${VillageSystem.cost(this.save, level).toString()}　${this.bundleText(VillageSystem.materialCost(level))}`, { fontSize: '17px', color: '#ffe79a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const tools: [RoadTool, string][] = [['draw', '敷く'], ['erase', '消す'], ['pan', '動かす']];
    tools.forEach(([tool, label], i) => {
      this.dock.add(new Button(this, 62 + i * 110, 138, 104, 62, label, () => this.setRoadTool(tool), { variant: this.roadTool === tool ? 'gold' : 'wood', fontSize: '24px' }));
    });
    this.dock.add(new Button(this, DOCK.w - 72, 138, 124, 62, '終わり', () => this.endRoadMode(), { variant: 'wood', fontSize: '26px' }));
    this.refreshRoadCount();
  }

  private refreshRoadCount(now = Date.now()): void {
    this.roadCount?.setText(`${VillageSystem.count(this.save, 'road')} / ${VillageSystem.maxCount(this.save, 'road', now)}`);
  }

  /** The finger is at `p` in road mode: lays (or takes up) the tiles it has crossed since the last one. */
  private strokeRoad(p: Phaser.Input.Pointer): void {
    const stroke = this.roadStroke;
    if (!stroke) return;
    const g = this.gridAt(p);
    const to = { x: Math.floor(g.gx), y: Math.floor(g.gy) };
    const from = stroke.last ?? to;
    // Every tile on the way (a fast finger skips tiles between two moves).
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
    let changed = false;
    for (let i = stroke.last ? 1 : 0; i <= steps; i++) {
      const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
      if (this.roadTool === 'draw' ? this.layRoad(stroke, x, y) : this.takeUpRoad(stroke, x, y)) changed = true;
    }
    stroke.last = to;
    if (changed) {
      this.renderRoads();
      this.refreshRoadCount();
    }
  }

  private layRoad(stroke: RoadStroke, x: number, y: number): boolean {
    if (!VillageSystem.canPlace(this.save, 'road', x, y)) return false;
    if (stroke.stopped) return false;
    const reason = VillageSystem.checkStart(this.save, 'road', Date.now());
    if (reason) {
      stroke.stopped = reason;
      showToast(this, reason, '#ffb0a0');
      return false;
    }
    if (!VillageSystem.build(this.save, 'road', x, y)) return false;
    stroke.laid += 1;
    return true;
  }

  private takeUpRoad(stroke: RoadStroke, x: number, y: number): boolean {
    const b = this.save.village.buildings.find((o) => o.kind === 'road' && o.x === x && o.y === y);
    if (!b || !VillageSystem.remove(this.save, b)) return false;
    stroke.erased += 1;
    return true;
  }

  private endRoadStroke(): void {
    const stroke = this.roadStroke;
    this.roadStroke = undefined;
    if (!stroke || stroke.laid + stroke.erased === 0) return;
    SaveSystem.save(this.save);
    this.refreshHeader();
    this.refreshMaterials();
    this.resourceBar.update(this.save);
    showToast(this, stroke.laid > 0 ? `道を${stroke.laid}マス敷きました` : `道を${stroke.erased}マス消しました`, '#ffe9b8');
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
    if (this.mode === 'place' || this.mode === 'road') {
      // While placing (or laying road), a building is just ground: a drag looks around, a tap moves what is being placed.
      this.onGroundDown(p);
      return;
    }
    // A building is part of the land: a drag looks around, a tap selects it. (To move one, select it and press 移動.)
    this.panning = { sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: false, tap: b.id };
    this.lastPan = { t: this.time.now, x: p.x, y: p.y };
    // A 装飾 is the one thing that can be picked up with the hand: hold it, and it lifts (moving one is free and instant).
    this.holdTimer?.remove(false);
    this.holdTimer = undefined;
    if (getBuilding(b.kind).decor && VillageSystem.checkMoveStart(this.save, b) === null) {
      this.holdTimer = this.time.delayedCall(HOLD_MS, () => this.beginLift(b.id, p));
    }
  }

  /** The hold on a 装饰 has gone on long enough (and the finger has not moved): it comes up off the ground, to be dragged. */
  private beginLift(id: string, p: Phaser.Input.Pointer): void {
    this.holdTimer = undefined;
    const pan = this.panning;
    const b = VillageSystem.get(this.save, id);
    const view = this.views.get(id);
    if (!pan || pan.moved || pan.tap !== id || !p.isDown || !b || !view || this.blocked() || this.mode !== 'browse') return;
    this.panning = undefined;
    this.selectedId = undefined;
    this.drawSelection();
    this.renderDock();
    const g = this.gridAt(p);
    this.lift = { id, gx: g.gx - b.x, gy: g.gy - b.y, fromX: b.x, fromY: b.y, x: b.x, y: b.y, moved: false, valid: true, view };
    this.buildingLayer.bringToTop(view);
    this.grid.setVisible(true);
    this.paintFootprint(b.kind, b.x, b.y, true);
    const o = this.pos(b.x, b.y);
    view.setAlpha(0.92);
    this.tweens.add({ targets: view, y: o.y - 16, duration: 120, ease: 'Back.easeOut' });
  }

  /** Dragging a lifted 装飾: it follows the finger tile by tile; the ground under it shows green where it fits, red where it does not. */
  private dragLift(p: Phaser.Input.Pointer): void {
    const lift = this.lift;
    const b = lift ? VillageSystem.get(this.save, lift.id) : undefined;
    if (!lift || !b) return;
    const def = getBuilding(b.kind);
    const g = this.gridAt(p);
    const x = Phaser.Math.Clamp(Math.round(g.gx - lift.gx), 0, VILLAGE_COLS - def.w);
    const y = Phaser.Math.Clamp(Math.round(g.gy - lift.gy), 0, VILLAGE_ROWS - def.h);
    if (x === lift.x && y === lift.y && lift.moved) return;
    lift.x = x;
    lift.y = y;
    lift.moved = lift.moved || x !== lift.fromX || y !== lift.fromY;
    const home = x === lift.fromX && y === lift.fromY;
    lift.valid = home || VillageSystem.checkMove(this.save, b, x, y) === null;
    const o = this.pos(x, y);
    this.tweens.killTweensOf(lift.view);
    this.tweens.add({ targets: lift.view, x: o.x, y: o.y - 16, duration: 70, ease: 'Sine.easeOut' });
    this.paintFootprint(b.kind, x, y, lift.valid);
  }

  /** The finger lets go of a lifted 装飾: put down where it fits, else back where it was. */
  private endLift(): void {
    const lift = this.lift;
    this.lift = undefined;
    this.grid.setVisible(false);
    this.footprint.clear();
    if (!lift) return;
    const b = VillageSystem.get(this.save, lift.id);
    const def = b ? getBuilding(b.kind) : undefined;
    if (b && def && lift.moved && lift.valid && (lift.x !== lift.fromX || lift.y !== lift.fromY)) {
      if (VillageSystem.startMove(this.save, b, lift.x, lift.y)) {
        SaveSystem.save(this.save);
        this.selectedId = b.id;
        this.refreshQueued = false;
        this.flushRefresh();
        const view = this.views.get(b.id);
        if (view) popIn(this, view, { duration: 220 });
        showToast(this, `${def.name}を移しました`, '#ffe9b8');
        return;
      }
    }
    // Not moved, or nowhere it fits: it settles back where it was (a plain hold, no move, counts as a tap).
    const o = this.pos(lift.fromX, lift.fromY);
    this.tweens.killTweensOf(lift.view);
    this.tweens.add({ targets: lift.view, x: o.x, y: o.y, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    if (!lift.moved) this.select(lift.id);
    else showToast(this, 'ここには置けません', '#ffb0a0');
    if (this.refreshQueued) this.flushRefresh();
  }

  private onWandererDown(w: Wanderer, p: Phaser.Input.Pointer): void {
    if (this.blocked()) return;
    if (this.mode === 'place') {
      this.onGroundDown(p);
      return;
    }
    this.panning = { sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: false, pick: w.id };
    this.lastPan = { t: this.time.now, x: p.x, y: p.y };
  }

  private onGhostDown(p: Phaser.Input.Pointer): void {
    const ghost = this.ghost;
    if (!ghost || this.blocked()) return;
    const g = this.gridAt(p);
    this.drag = { sx: p.x, sy: p.y, gx: g.gx - ghost.x, gy: g.gy - ghost.y, dragging: false };
  }

  private onGroundDown(p: Phaser.Input.Pointer): void {
    if (this.blocked()) return;
    if (this.mode === 'road' && this.roadTool !== 'pan') {
      // A finger laid on the ground in road mode starts a stroke (with a tap, one tile).
      this.roadStroke = { laid: 0, erased: 0 };
      this.strokeRoad(p);
      return;
    }
    this.panning = { sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: false };
    this.lastPan = { t: this.time.now, x: p.x, y: p.y };
  }

  private maybeBeginPinch(): void {
    if (this.blocked() || !(this.input.pointer1.isDown && this.input.pointer2.isDown)) return;
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    this.drag = undefined;
    this.panning = undefined;
    this.endRoadStroke();
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

    if (this.lift) {
      this.dragLift(p);
      return;
    }
    if (this.roadStroke) {
      this.strokeRoad(p);
      return;
    }

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
      if (!pan.moved) {
        // A drag began: it is no hold on a 装飾 any more.
        this.holdTimer?.remove(false);
        this.holdTimer = undefined;
      }
      pan.moved = true;
      const before = { x: this.world.x, y: this.world.y };
      this.world.x = pan.wx + (p.x - pan.sx);
      this.world.y = pan.wy + (p.y - pan.sy);
      this.applyView();
      // How fast the map is being dragged (px per ms, smoothed), so that letting go can carry on sliding.
      const now = this.time.now;
      const last = this.lastPan;
      if (last && now > last.t) {
        const dt = Math.max(1, now - last.t);
        this.velocity = { x: 0.6 * this.velocity.x + 0.4 * ((this.world.x - before.x) / dt), y: 0.6 * this.velocity.y + 0.4 * ((this.world.y - before.y) / dt) };
      }
      this.lastPan = { t: now, x: p.x, y: p.y };
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (!(this.input.pointer1.isDown && this.input.pointer2.isDown)) this.pinch = undefined;
      return;
    }
    this.holdTimer?.remove(false);
    this.holdTimer = undefined;
    if (this.roadStroke) {
      this.endRoadStroke();
      return;
    }
    if (this.lift) {
      this.panning = undefined;
      this.drag = undefined;
      this.endLift();
      return;
    }
    const pan = this.panning;
    this.panning = undefined;
    this.drag = undefined;

    // A map that was being dragged keeps sliding if the finger was still moving when it let go (not if it had rested).
    if (pan?.moved) {
      const stale = !this.lastPan || this.time.now - this.lastPan.t > 70;
      if (stale || Math.hypot(this.velocity.x, this.velocity.y) < 0.12) this.velocity = { x: 0, y: 0 };
    } else {
      this.velocity = { x: 0, y: 0 };
    }

    if (pan && !pan.moved && !this.blocked()) {
      // Two taps on bare ground in a row zoom the map (in on the spot, or back out).
      if (!pan.tap && !pan.pick && this.mode === 'browse') {
        const last = this.lastTap;
        const now = this.time.now;
        if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) < DOUBLE_TAP_PX) {
          this.lastTap = undefined;
          this.toggleZoom(p.x, p.y);
          return;
        }
        this.lastTap = { t: now, x: p.x, y: p.y };
      }
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
    this.celebrate(done);
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
    if (this.drag?.dragging || this.pinch || this.lift) {
      this.refreshQueued = true;
      return;
    }
    this.renderBuildings();
    this.renderDock();
    this.refreshHeader();
    this.refreshPlot();
    this.resourceBar.update(this.save);
    this.refreshQueued = false;
  }

  // --------------------------------------------------------------- dock --

  private renderDock(): void {
    this.guideTween?.stop();
    this.guideTween = undefined;
    this.dock.removeAll(true);
    this.dockTick = undefined;
    this.confirmButton = undefined;
    this.placeMessage = undefined;
    if (this.mode === 'road') {
      this.renderRoadBar();
      this.renderFloat();
      return;
    }
    if (this.mode === 'place' && this.ghost) {
      this.panelDock(COMPACT.placeH);
      this.renderPlaceDock(this.ghost);
      this.renderFloat();
      return;
    }
    const b = this.selectedId ? VillageSystem.get(this.save, this.selectedId) : undefined;
    if (b) {
      this.panelDock(COMPACT.h);
      this.renderCompactDock(b);
    } else {
      this.renderCorners();
    }
    this.renderFloat();
  }

  /** The bar along the bottom that the selected building / placing uses (positions below are inside it). */
  private panelDock(height = DOCK.h): void {
    this.dock.setPosition(DOCK.x, 1280 - 12 - height);
    this.dock.add(createPanel(this, DOCK.w / 2, height / 2, DOCK.w, height, { fillColor: CHROME.woodFill, fillAlpha: 0.95, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 14, gradient: false }));
  }

  // ---------------------------------------------------- 操作: the round buttons --

  /** A round brass-and-wood button with a drawn symbol, a label under it and (optionally) a small line of price or reason under that. */
  private roundButton(spec: RoundSpec): Phaser.GameObjects.Container {
    const r = spec.radius ?? 34;
    const fill = { gold: 0xe0822a, wood: 0x45301a, red: 0x9a2d26, green: 0x2f8f4a }[spec.tone];
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.38);
    g.fillCircle(0, 5, r + 3);
    g.fillStyle(CHROME.brass, 1);
    g.fillCircle(0, 0, r + 3);
    g.fillStyle(fill, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.22);
    g.fillEllipse(0, -r * 0.42, r * 1.28, r * 0.74);
    g.lineStyle(2, CHROME.brassDark, 1);
    g.strokeCircle(0, 0, r + 3);
    g.setAlpha(spec.enabled ? 1 : 0.5);

    const glyph = this.add.graphics();
    this.drawGlyph(glyph, spec.glyph, r / 34);
    glyph.setAlpha(spec.enabled ? 1 : 0.55);

    const container = this.add.container(0, 0, [g, glyph]);
    const label = caption(this, 0, r + 15, spec.label, { fontSize: '17px', fontStyle: 'bold', color: spec.enabled ? '#ffe9b8' : '#b8a888', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
    container.add(label);
    if (spec.sub) container.add(caption(this, 0, r + 36, spec.sub, { fontSize: '14px', fontStyle: 'bold', color: spec.subColor ?? '#ffe79a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));

    const zone = this.add.zone(0, spec.sub ? 12 : 6, r * 2 + 14, r * 2 + (spec.sub ? 70 : 48)).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.tweens.add({ targets: container, scale: 0.92, duration: 70, ease: 'Sine.easeOut' }));
    zone.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 110, ease: 'Sine.easeOut' }));
    zone.on('pointerup', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 110, ease: 'Back.easeOut' });
      if (!this.blocked()) spec.onTap();
    });
    container.add(zone);
    return container;
  }

  /** The symbols on the round buttons, in white with a dark edge, about the centre. `k` scales them with the button. */
  private drawGlyph(g: Phaser.GameObjects.Graphics, kind: RoundSpec['glyph'], k: number): void {
    const line = (pts: [number, number][], width: number): void => {
      g.lineStyle(width * k + 4, 0x1c130a, 1);
      g.strokePoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x * k, y * k)), false);
      g.lineStyle(width * k, 0xffffff, 1);
      g.strokePoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x * k, y * k)), false);
    };
    const shape = (pts: [number, number][]): void => {
      const v = pts.map(([x, y]) => new Phaser.Math.Vector2(x * k, y * k));
      g.fillStyle(0xffffff, 1);
      g.fillPoints(v, true);
      g.lineStyle(2.5, 0x1c130a, 1);
      g.strokePoints(v, true);
    };
    switch (kind) {
      case 'up':
        shape([[0, -17], [16, 1], [6, 1], [6, 16], [-6, 16], [-6, 1], [-16, 1]]);
        break;
      case 'move':
        line([[-15, 0], [15, 0]], 4);
        line([[0, -15], [0, 15]], 4);
        shape([[0, -20], [7, -11], [-7, -11]]);
        shape([[0, 20], [7, 11], [-7, 11]]);
        shape([[-20, 0], [-11, -7], [-11, 7]]);
        shape([[20, 0], [11, -7], [11, 7]]);
        break;
      case 'trash':
        shape([[-11, -6], [11, -6], [9, 16], [-9, 16]]);
        shape([[-15, -12], [15, -12], [15, -8], [-15, -8]]);
        shape([[-5, -17], [5, -17], [5, -12], [-5, -12]]);
        break;
      case 'info':
        shape([[-4, -4], [4, -4], [4, 15], [-4, 15]]);
        shape([[-4, -15], [4, -15], [4, -8], [-4, -8]]);
        break;
      case 'wrench':
        line([[-12, 13], [7, -6]], 7);
        shape([[2, -17], [16, -11], [11, 3], [-1, -3]]);
        break;
      case 'bolt':
        shape([[4, -18], [-10, 3], [-1, 3], [-5, 18], [11, -4], [2, -4]]);
        break;
      case 'check':
        line([[-14, 1], [-4, 11], [14, -11]], 8);
        break;
      case 'cross':
        line([[-12, -12], [12, 12]], 8);
        line([[12, -12], [-12, 12]], 8);
        break;
      case 'castle':
        shape([[-14, 14], [-14, -4], [-9, -4], [-9, -9], [-5, -9], [-5, -4], [-2, -4], [-2, -13], [2, -13], [2, -4], [5, -4], [5, -9], [9, -9], [9, -4], [14, -4], [14, 14]]);
        break;
    }
  }

  /** Why an action cannot be taken, cut down to what fits under a round button. */
  private shortReason(reason: string): string {
    if (reason.includes('建築員')) return '建築員なし';
    if (reason.includes('ゴールド')) return '資金不足';
    if (reason.includes('足りません')) return '素材不足';
    const castle = reason.match(/城をLv(\d+)/);
    if (castle) return `城Lv${castle[1]}で`;
    if (reason.includes('これ以上') || reason.includes('上限')) return '最大';
    if (reason.includes('作業中')) return '作業中';
    return reason.length > 6 ? `${reason.slice(0, 5)}…` : reason;
  }

  /** The buttons that hang round the selected building: what can be done to it now. */
  private floatActions(b: PlacedBuilding): RoundSpec[] {
    const now = Date.now();
    const def = getBuilding(b.kind);
    const level = effectiveLevel(b, now);
    const work = VillageSystem.work(b, now);
    const actions: RoundSpec[] = [];
    const info: RoundSpec = { glyph: 'info', label: '情報', tone: 'wood', enabled: true, onTap: () => this.openInfo(b) };

    if (work) {
      // Being built / strengthened / moved: it can be hurried with 魔晶石 (and nothing else is done to it meanwhile).
      const gems = VillageSystem.finishCost(b, now);
      const reason = VillageSystem.checkFinish(this.save, b, now);
      actions.push({ glyph: 'bolt', label: 'すぐ完成', tone: 'gold', sub: `魔晶石 ${gems}`, subColor: reason ? '#ff9a8a' : '#c8f0ff', enabled: !reason, onTap: () => (reason ? showToast(this, reason, '#ffb0a0') : this.askFinish(b)) });
      actions.push(info);
      return actions;
    }

    if (b.damaged) {
      const reason = VillageSystem.checkRepair(this.save, b, now);
      actions.push({ glyph: 'wrench', label: '修理', tone: 'gold', sub: reason ? this.shortReason(reason) : '素材のみ', subColor: reason ? '#ff9a8a' : '#cdbb94', enabled: !reason, onTap: () => (reason ? showToast(this, reason, '#ffb0a0') : this.askRepair(b)) });
    } else if (!def.decor) {
      const next = def.levels[level];
      if (next) {
        const reason = VillageSystem.checkUpgrade(this.save, b, now);
        const cost = VillageSystem.cost(this.save, next);
        const affordable = SaveSystem.getGold(this.save).gte(cost);
        actions.push({
          glyph: 'up',
          label: `強化 Lv${level + 1}`,
          tone: 'gold',
          sub: reason ? this.shortReason(reason) : cost.toString(),
          subColor: reason ? '#ff9a8a' : affordable ? '#ffe79a' : '#ff9a8a',
          enabled: !reason,
          onTap: () => (reason ? showToast(this, reason, '#ffb0a0') : this.askUpgrade(b)),
        });
      } else {
        actions.push({ glyph: 'up', label: '最大Lv', tone: 'wood', enabled: false, onTap: () => showToast(this, 'このレベルが上限です', '#ffe9b8') });
      }
    }

    if (def.movable) {
      const reason = VillageSystem.checkMoveStart(this.save, b, now);
      actions.push({ glyph: 'move', label: '移動', tone: 'wood', sub: def.decor ? 'すぐ・無料' : reason ? this.shortReason(reason) : undefined, subColor: reason ? '#ff9a8a' : '#9fe39f', enabled: !reason, onTap: () => (reason ? showToast(this, reason, '#ffb0a0') : this.startMoving(b)) });
    }
    if (level > 0 && def.removable !== false) {
      actions.push({ glyph: 'trash', label: '撤去', tone: 'red', enabled: true, onTap: () => this.askRemove(b) });
    }
    actions.push(info);
    return actions;
  }

  /** Rebuilds the round buttons for the selection (or the ✓ / ✗ for placing). Left alone when nothing about them changed. */
  private renderFloat(): void {
    const layer = this.floatLayer;
    if (!layer) return;
    let specs: RoundSpec[] = [];
    let key = '';
    let anchor: (() => { x: number; y: number; top?: number; bottom?: number } | null) | undefined;
    if (this.mode === 'place' && this.ghost) {
      const ghost = this.ghost;
      key = `place:${ghost.kind}:${ghost.movingId ?? ''}`;
      specs = [
        { glyph: 'cross', label: 'やめる', tone: 'red', enabled: true, radius: 36, onTap: () => this.cancelPlacing() },
        {
          glyph: 'check',
          label: ghost.movingId ? 'ここに移す' : getBuilding(ghost.kind).decor ? 'ここに置く' : 'ここに建てる',
          tone: 'green',
          enabled: true,
          radius: 36,
          onTap: () => (this.ghost?.valid ? this.confirmPlacing() : showToast(this, this.placeMessage?.text || 'ここには置けません', '#ffb0a0')),
        },
      ];
      anchor = () => {
        const g = this.ghost;
        if (!g) return null;
        const def = getBuilding(g.kind);
        const c = this.pos(g.x + def.w, g.y + def.h);
        return { x: this.world.x + c.x * this.zoom, y: this.world.y + c.y * this.zoom + 84 };
      };
    } else if (!this.lift && this.selectedId && this.mode === 'browse') {
      const b = VillageSystem.get(this.save, this.selectedId);
      if (b) {
        specs = this.floatActions(b);
        key = `sel:${b.id}:${specs.map((s) => `${s.label}|${s.sub ?? ''}|${s.enabled ? 1 : 0}`).join(',')}`;
        const id = b.id;
        anchor = () => {
          const view = this.views.get(id);
          if (!view?.active) return null;
          const box = view.getBounds();
          return { x: box.centerX, y: box.y - 76, top: box.y, bottom: box.bottom };
        };
      }
    }

    if (specs.length === 0 || !anchor) {
      this.floatTweens.forEach((t) => t.stop());
      this.floatTweens = [];
      layer.removeAll(true);
      this.floatKey = '';
      this.floatAnchor = undefined;
      this.floatConfirm = undefined;
      this.positionFloat();
      return;
    }
    this.floatAnchor = anchor;
    if (key === this.floatKey && layer.length > 0) {
      this.positionFloat();
      return;
    }
    this.floatKey = key;
    this.floatTweens.forEach((t) => t.stop());
    this.floatTweens = [];
    layer.removeAll(true);
    this.floatConfirm = undefined;
    const gap = 88;
    const first = -((specs.length - 1) * gap) / 2;
    this.floatHalfW = ((specs.length - 1) * gap) / 2 + 52;
    specs.forEach((spec, i) => {
      const button = this.roundButton(spec);
      button.setPosition(first + i * gap, 0).setScale(0);
      layer.add(button);
      this.floatTweens.push(this.tweens.add({ targets: button, scale: 1, duration: 190, delay: i * 45, ease: 'Back.easeOut' }));
      if (spec.glyph === 'check') this.floatConfirm = button;
    });
    this.positionFloat();
    const confirm = this.floatConfirm as Phaser.GameObjects.Container | undefined;
    if (this.ghost) confirm?.setAlpha(this.ghost.valid ? 1 : 0.5);
  }

  /** Keeps the round buttons on their building (or the ghost) as the map is panned and zoomed. */
  private positionFloat(): void {
    const layer = this.floatLayer;
    if (!layer) return;
    const a = this.floatAnchor?.();
    if (!a) {
      layer.setVisible(false);
      return;
    }
    let x = a.x;
    let y = a.y;
    // Above the building; under it instead when there is no room above (the top of the screen is the header).
    if (a.top !== undefined && a.bottom !== undefined && y < 262) y = a.bottom + 86;
    const offscreen = a.top !== undefined && a.bottom !== undefined && (a.bottom < 150 || a.top > 1180);
    x = Phaser.Math.Clamp(x, this.floatHalfW, 720 - this.floatHalfW);
    y = Phaser.Math.Clamp(y, 280, 1010);
    layer.setPosition(x, y);
    layer.setVisible(!offscreen);
  }

  /** 情報: what the building is, what it does now and what the next level would give and cost. */
  private openInfo(b: PlacedBuilding): void {
    if (this.blocked()) return;
    const now = Date.now();
    const def = getBuilding(b.kind);
    const level = effectiveLevel(b, now);
    const next = def.decor ? undefined : def.levels[level];
    const w = 620;
    const h = next ? 560 : 400;
    const top = 640 - h / 2;
    const modal = openModal(this, noLock, 0.75, true);
    this.modal = modal;
    const content = this.add.container(0, 0);
    modal.container.add(content);
    content.add(createPanel(this, 360, 640, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 18, rarity: 5, gradient: false }));
    content.add(this.add.zone(360, 640, w, h).setInteractive());
    content.add(heading(this, 360, top + 46, this.titleOf(b, now), { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    const left = 360 - w / 2 + 34;
    content.add(caption(this, left, top + 100, def.description, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3, wordWrap: { width: w - 68, useAdvancedWrap: true } }).setOrigin(0, 0));
    content.add(caption(this, left, top + 168, this.statText(b, level, now), { fontSize: '20px', fontStyle: 'bold', color: b.damaged ? '#ffb07a' : '#9fe39f', stroke: INK, strokeThickness: 3, wordWrap: { width: w - 68, useAdvancedWrap: true } }).setOrigin(0, 0));
    let y = top + 236;
    if (next) {
      content.add(heading(this, left, y, `Lv${level + 1} にすると`, { fontSize: '24px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      const gain = this.gainText(b, level, now);
      if (gain) content.add(caption(this, left, y + 40, gain, { fontSize: '19px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      this.costLines(content, left, y + 84, y + 122, next, 26, 21);
      if (b.kind !== 'castle' && castleLevel(this.save, now) < next.needCastle) {
        content.add(caption(this, left, y + 160, `城をLv${next.needCastle}にすると、強くできます`, { fontSize: '17px', fontStyle: 'bold', color: '#ffb07a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      }
    } else if (!def.decor) {
      content.add(caption(this, left, y, 'このレベルが上限です', { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    }
    content.add(
      new Button(this, 360, top + h - 44, 200, 54, '閉じる', () => {
        modal.close();
        this.modal = undefined;
      }, { variant: 'wood', fontSize: '24px' }),
    );
  }

  /** The short bar along the bottom for the selected building: its name, what it does, the countdown while it is worked on. */
  private renderCompactDock(b: PlacedBuilding): void {
    const now = Date.now();
    const level = effectiveLevel(b, now);
    const work = VillageSystem.work(b, now);
    const closeW = 104;
    this.dock.add(heading(this, 18, 26, this.titleOf(b, now), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    if (work) {
      const head = work.kind === 'build' ? '完成まで' : work.kind === 'upgrade' ? '強化完了まで' : work.kind === 'demolish' ? '解体まで' : '再建築まで';
      const left = caption(this, 18, 66, '', { fontSize: '19px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
      this.dock.add(left);
      const update = () => {
        const current = VillageSystem.work(b, Date.now());
        left.setText(`${head} あと ${current ? StaminaSystem.formatDuration(current.left) : ''}`);
      };
      update();
      this.dockTick = update;
    } else {
      this.dock.add(caption(this, 18, 66, this.statText(b, level, now), { fontSize: '16px', fontStyle: 'bold', color: b.damaged ? '#ffb07a' : '#9fe39f', stroke: INK, strokeThickness: 3, wordWrap: { width: DOCK.w - 36 - closeW - 10, useAdvancedWrap: true } }).setOrigin(0, 0.5));
    }
    this.dock.add(new Button(this, DOCK.w - 14 - closeW / 2, COMPACT.h / 2, closeW, 52, '閉じる', () => this.select(undefined), { variant: 'wood', fontSize: '22px' }));
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
    // 城へ: a small round button above 受け取る that slides the map back to the 城.
    const home = this.roundButton({ glyph: 'castle', label: '城へ', tone: 'wood', enabled: true, radius: 28, onTap: () => this.recenter() });
    home.setPosition(720 - 14 - 40, 1060);
    this.dock.add(home);
    this.addFirstBuildGuide();
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

  /** The very first visit (nothing has ever been built beyond what the village started with): a bobbing arrow on 建築 and a line saying so. */
  private addFirstBuildGuide(): void {
    if (this.save.village.nextId > VILLAGE_START.length + 1) return;
    if (this.save.village.buildings.length > VILLAGE_START.length) return;
    const arrow = this.add.graphics();
    arrow.fillStyle(0xffe27a, 1);
    arrow.fillTriangle(0, 18, -17, -6, 17, -6);
    arrow.fillRect(-7, -26, 14, 22);
    arrow.lineStyle(3, 0x1c130a, 1);
    arrow.strokePoints([new Phaser.Math.Vector2(0, 18), new Phaser.Math.Vector2(-17, -6), new Phaser.Math.Vector2(-7, -6), new Phaser.Math.Vector2(-7, -26), new Phaser.Math.Vector2(7, -26), new Phaser.Math.Vector2(7, -6), new Phaser.Math.Vector2(17, -6)], true);
    const pill = this.plate(0, 0, 'タップして建物を建てよう', 20);
    pill.setPosition(190, -38);
    const guide = this.add.container(104, 1136, [arrow, pill]);
    this.dock.add(guide);
    this.guideTween = this.tweens.add({ targets: guide, y: 1148, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
    // Lv.N -> Lv.N+1 side by side, and what the next level changes (売上 / 素材 / 防衛 / what a 城 unlocks).
    const gain = VillageGoals.upgradeGain(this.save, b, now);
    const preview = { height: 214 + gain.length * 30, rows: gain.length };
    this.modal = openConfirm(this, noLock, {
      title: '強化の確認',
      message: `${def.name}を Lv${level + 1} に強化しますか？\n\n${this.costText(def.levels[level])}\n\n終わるまで建築員を1人使います。`,
      confirmLabel: '強化する',
      confirmVariant: 'gold',
      extra: {
        height: preview.height,
        build: (container, cy) => {
          const top = cy - preview.height / 2;
          const picsY = top + 84;
          const glow = this.add.circle(360 + 150, picsY, 72, 0xffd23f, 0.18).setBlendMode(Phaser.BlendModes.ADD);
          container.add(glow);
          container.add(villageThumb(this, b.kind, level, 150).setPosition(360 - 150, picsY));
          container.add(villageThumb(this, b.kind, level + 1, 160).setPosition(360 + 150, picsY));
          const arrow = this.add.graphics();
          arrow.fillStyle(0xffd23f, 1);
          arrow.lineStyle(3, 0x4a2406, 1);
          arrow.fillTriangle(360 + 20, picsY, 360 - 14, picsY - 24, 360 - 14, picsY + 24);
          arrow.strokeTriangle(360 + 20, picsY, 360 - 14, picsY - 24, 360 - 14, picsY + 24);
          container.add(arrow);
          container.add(caption(this, 360 - 150, picsY + 92, `Lv.${level}`, { fontSize: '22px', fontStyle: 'bold', color: '#cdbb94', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
          container.add(caption(this, 360 + 150, picsY + 92, `Lv.${level + 1}`, { fontSize: '24px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
          gain.forEach((line, i) => {
            container.add(caption(this, 360, picsY + 130 + i * 30, line, { fontSize: '20px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
          });
        },
      },
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

  /** The one-line role of a building in the 建築 menu, and the colour of its chip. */
  private roleOf(def: (typeof BUILDINGS)[number]): { text: string; color: number } {
    if (def.road) return { text: '道', color: 0x8a6a3a };
    if (def.decor) return { text: '見た目', color: 0x8a5aa8 };
    if (def.produces) return { text: `素材+ ${materialName(def.produces)}`, color: 0x4f8a3f };
    if (def.defense) return { text: '防衛', color: 0xb0482e };
    if (def.kind === 'house') return { text: '売上アップ', color: 0x3a6fb0 };
    if (def.kind === 'shop' || def.kind === 'market') return { text: '売上+', color: 0xb8841f };
    return { text: '村の中心', color: 0x6a5a3a };
  }

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
    // (+36: a line under the cards for what the next 城 level brings.)
    const top = 640 - (196 + longest * rowH + 76 + 36) / 2;
    const h = 196 + Math.max(3, kinds.length) * rowH + 76 + 36;
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

    // What can be built comes first; what is at its limit (or not yet allowed) follows, dimmed, with the 城 level that frees it.
    const full = (d: (typeof BUILDINGS)[number]): boolean => VillageSystem.count(this.save, d.kind) >= VillageSystem.maxCount(this.save, d.kind, now);
    const ordered = [...kinds].sort((a, b) => Number(full(a)) - Number(full(b)));
    ordered.forEach((def, i) => {
      const y = top + 188 + i * rowH;
      const left = left0;
      const have = VillageSystem.count(this.save, def.kind);
      const max = VillageSystem.maxCount(this.save, def.kind, now);
      const locked = have >= max;
      const role = this.roleOf(def);
      content.add(createPanel(this, 360, y + rowH / 2 - 6, w - 36, rowH - 12, { fillColor: 0x241810, fillAlpha: 1, borderColor: locked ? CHROME.brassDark : CHROME.brass, glowColor: CHROME.brassDark, radius: 12, gradient: false }));

      // The building's picture (the one on the map, level 1) in a lit frame.
      const frame = this.add.graphics();
      frame.fillStyle(0x3b4a2c, 1);
      frame.fillRoundedRect(left - 2, y + 14, 128, 128, 12);
      frame.fillStyle(0x4f6a3a, 0.7);
      frame.fillRoundedRect(left + 2, y + 18, 120, 56, 10);
      frame.lineStyle(2, CHROME.brassDark, 1);
      frame.strokeRoundedRect(left - 2, y + 14, 128, 128, 12);
      content.add(frame);
      const art = buildingArt(this, def.kind, 1);
      const scale = Math.min(112 / art.bounds.width, 112 / art.bounds.height);
      art.container.setScale(scale).setPosition(left + 62 - art.bounds.centerX * scale, y + 78 - art.bounds.centerY * scale);
      content.add(art.container);

      const nameText = heading(this, left + 142, y + 26, def.name, { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
      content.add(nameText);
      // A one-line role: 売上+ / 素材+ / 防衛 / 見た目.
      const roleLabel = caption(this, 0, 0, role.text, { fontSize: '15px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
      const chipW = roleLabel.width + 20;
      const chip = this.add.graphics();
      chip.fillStyle(role.color, 1);
      chip.fillRoundedRect(-chipW / 2, -13, chipW, 26, 13);
      chip.lineStyle(2, 0x1c130a, 0.9);
      chip.strokeRoundedRect(-chipW / 2, -13, chipW, 26, 13);
      content.add(this.add.container(nameText.x + nameText.width + 14 + chipW / 2, y + 27, [chip, roleLabel]));
      content.add(caption(this, left + 142, y + 56, `${have}/${max}　${def.w}×${def.h}マス`, { fontSize: '16px', fontStyle: 'bold', color: locked ? '#ff9a8a' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      content.add(caption(this, left + 142, y + 72, def.description, { fontSize: '14px', color: '#d8c49a', stroke: INK, strokeThickness: 2, wordWrap: { width: 300, useAdvancedWrap: true } }).setOrigin(0, 0));

      this.costLines(content, left + 142, y + 122, y + 150, def.levels[0], 22, 17);

      if (locked) {
        // At the limit (or not allowed yet): the whole card is dimmed.
        const veil = this.add.graphics();
        veil.fillStyle(0x000000, 0.4);
        veil.fillRoundedRect(58, y + 6, w - 36, rowH - 12, 12);
        content.add(veil);
      }

      const reason = VillageSystem.checkStart(this.save, def.kind, now);
      const need = VillageSystem.castleNeededForNext(this.save, def.kind);
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

    // 次に解放: what the next 城 level adds to this tab.
    const castle = castleLevel(this.save, now);
    const unlocks = kinds.filter((d) => (d.maxCount[castle] ?? 0) > (d.maxCount[castle - 1] ?? 0)).map((d) => d.name);
    if (unlocks.length > 0) {
      content.add(caption(this, 360, top + h - 92, `次に解放　城Lv${castle + 1}で　${unlocks.join('・')}が増えます`, { fontSize: '17px', fontStyle: 'bold', color: '#9fd8ff', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    }

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
    if (def.road) {
      this.startRoadMode();
      return;
    }
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
    this.ghost = { kind, x, y, valid: true, view, art: art.container, movingId };
    if (movingId) this.views.get(movingId)?.setAlpha(0.45);
    // 連続配置: cheap things that are put up in numbers (装飾, 柵, 門) stay in placing after each one; anything else only if asked.
    const def = getBuilding(kind);
    this.repeat = !movingId && !!(def.decor || def.defense);
    this.floatKey = '';
    this.renderDock();
  }

  /** Puts the ghost at its tile, coloured by whether it fits, and keeps the confirm button and its note in step. */
  private placeGhost(): void {
    const ghost = this.ghost;
    if (!ghost) return;
    const o = this.pos(ghost.x, ghost.y);
    const landed = ghost.view.x !== o.x || ghost.view.y !== o.y;
    ghost.view.setPosition(o.x, o.y);
    // Landing on a new tile: the picture hops a little.
    if (landed) {
      this.tweens.killTweensOf(ghost.art);
      ghost.art.y = -9;
      this.tweens.add({ targets: ghost.art, y: 0, duration: 150, ease: 'Back.easeOut' });
    }
    const moving = ghost.movingId ? VillageSystem.get(this.save, ghost.movingId) : undefined;
    const home = !!moving && ghost.x === moving.x && ghost.y === moving.y;
    let reason: string | null = null;
    if (ghost.movingId) reason = moving ? VillageSystem.checkMove(this.save, moving, ghost.x, ghost.y) : '移せません';
    else if (!VillageSystem.canPlace(this.save, ghost.kind, ghost.x, ghost.y)) reason = 'ここには置けません';
    ghost.valid = reason === null;
    this.paintFootprint(ghost.kind, ghost.x, ghost.y, ghost.valid || home);
    this.confirmButton?.setEnabled(ghost.valid);
    this.floatConfirm?.setAlpha(ghost.valid ? 1 : 0.5);
    const hint = ghost.movingId ? 'ドラッグか、地面のタップで場所を決めて、✓で移します' : 'ドラッグか、地面のタップで場所を決めて、✓で確定します';
    const text = ghost.valid ? hint : home ? '移す場所を選んでください' : (reason ?? '');
    this.placeMessage?.setText(text).setColor(ghost.valid || home ? '#9fe39f' : '#ff9a8a');
    this.positionFloat();
  }

  private renderPlaceDock(ghost: Ghost): void {
    const def = getBuilding(ghost.kind);
    const w = DOCK.w;
    const moving = ghost.movingId ? VillageSystem.get(this.save, ghost.movingId) : undefined;
    this.dock.add(heading(this, 18, ROW.title, moving ? `${def.name}を移す` : def.decor ? `${def.name}を置く` : `${def.name}を建てる`, { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.placeMessage = caption(this, 18, ROW.line, '', { fontSize: '15px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 3, wordWrap: { width: w - 36, useAdvancedWrap: true } }).setOrigin(0, 0.5);
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

    // 連続配置: after each one is put up, the next of the same kind follows (not offered when moving something).
    if (!moving) {
      const on = this.repeat;
      this.dock.add(
        new Button(this, w - 14 - 78, ROW.title, 156, 40, on ? '連続配置 ON' : '連続配置 OFF', () => {
          this.repeat = !this.repeat;
          // Redrawn after this tap has finished: the button being replaced is still handling it.
          this.time.delayedCall(0, () => this.renderDock());
        }, { variant: on ? 'gold' : 'wood', fontSize: '18px' }),
      );
    }
    // The ✓ and ✗ are on the map by the ghost (renderFloat); this bar only says what it is and what it costs.
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
    const built = getBuilding(building.kind);
    // 連続配置: stay in placing for the same kind (the ghost moves on to the next free place) until there is no room, no
    // more allowed, nothing left to pay with, or ✗ is pressed.
    if (this.repeat && this.mode === 'place' && this.ghost && !this.ghost.movingId) {
      const keep = this.ghost;
      const stop = VillageSystem.checkStart(this.save, kind);
      const spot = stop ? null : VillageSystem.findSpot(this.save, kind, x, y);
      if (spot) {
        keep.x = spot.x;
        keep.y = spot.y;
        this.selectedId = undefined;
        this.refreshQueued = false;
        this.flushRefresh();
        const placed = this.views.get(building.id);
        if (placed) popIn(this, placed, { duration: 240 });
        showToast(this, built.decor ? `${built.name}を置きました（連続配置）` : `${built.name}の建築を始めました（連続配置）`, '#ffe9b8');
        this.placeGhost();
        return;
      }
      showToast(this, stop ?? '置ける場所がありません', '#ffe9b8');
    }
    this.endPlacing();
    this.selectedId = building.id;
    this.flushRefresh();
    const view = this.views.get(building.id);
    if (view) popIn(this, view, { duration: 260 });
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
