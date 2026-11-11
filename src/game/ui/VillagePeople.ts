import Phaser from 'phaser';
import { VILLAGE_COLS, VILLAGE_ROWS, getBuilding, type BuildingKind } from '../data/village';
import type { SaveData } from '../systems/SaveSystem';
import { castleLevel, footprints } from '../systems/VillageIncome';
import { showToast } from './Toast';
import type { Pt } from './VillageArt';

/**
 * 村の住人: villagers and animals that wander over the free ground of the village. Pictures (all optional) are
 * public/assets/village/people/<id>.png - transparent, feet at the bottom edge, facing right; one without a picture is
 * drawn as a small coloured figure instead. They walk round the buildings (never through them), bob as they go, turn to
 * face the way they walk, stand and look about now and then, and say something when tapped.
 */

type Kind = 'person' | 'animal';
type Prefer = 'shop' | 'gate';

interface PeopleDef {
  id: string;
  kind: Kind;
  /** How tall it is drawn on the map, in px at 100% zoom (a tile is 104 wide). */
  height: number;
  /** Tiles a second. */
  speed: number;
  /** Likes to be near these buildings. */
  prefer?: Prefer;
  /** Colours of the figure drawn when there is no picture: body, head (or the whole animal), accent. */
  colors: [number, number, number];
  /** What it says when tapped (and the little mark it shows now and then). */
  lines: string[];
  marks: string[];
}

/** Everyone is drawn this much bigger than the heights below (a tile is 104 px wide: they were too small to see). */
const SIZE_BOOST = 1.22;

const PEOPLE_BASE: PeopleDef[] = [
  { id: 'p_farmer', kind: 'person', height: 64, speed: 1.0, colors: [0x6a8f3a, 0xf0c9a0, 0xc9a052], lines: ['いい天気だなあ。畑仕事がはかどるよ。', '今年の収穫は期待できそうだ！'], marks: ['♪', '…'] },
  { id: 'p_woman', kind: 'person', height: 62, speed: 0.95, colors: [0xc45a7a, 0xf4d3b0, 0x6a3a22], lines: ['この村、だんだん大きくなってきたわね。', 'お店の売れ行きは上々よ！'], marks: ['♪', '!'] },
  { id: 'p_child', kind: 'person', height: 48, speed: 1.5, colors: [0x4a8fd6, 0xf4d3b0, 0x8a5a2a], lines: ['わーい！かけっこしよう！', 'ぼくも大きくなったら冒険者になる！'], marks: ['!', '♪'] },
  { id: 'p_merchant', kind: 'person', height: 64, speed: 0.9, prefer: 'shop', colors: [0x8a4ac4, 0xf0c9a0, 0xe0b040], lines: ['いらっしゃい！いい品が入ってるよ。', '儲かってまっか？'], marks: ['♪', '…'] },
  { id: 'p_guard', kind: 'person', height: 66, speed: 0.85, prefer: 'gate', colors: [0x8a98a8, 0xf0c9a0, 0xb8452f], lines: ['見張りは任せてください！', '最近、獣の群れが多いので気をつけて。'], marks: ['!', '…'] },
  { id: 'p_old', kind: 'person', height: 58, speed: 0.6, colors: [0x8a7a6a, 0xf0d3b8, 0xe8e8e8], lines: ['わしが若い頃は、ここは野原だけじゃった…', '村が栄えて嬉しいのう。'], marks: ['…', '♪'] },
  { id: 'p_girl', kind: 'person', height: 52, speed: 1.3, colors: [0xe8a0c0, 0xf4d3b0, 0xd8a040], lines: ['お花、きれいだね♪', 'ねえねえ、あっち行こう！'], marks: ['♪', '!'] },
  { id: 'p_builder', kind: 'person', height: 64, speed: 1.0, colors: [0xd8802a, 0xf0c9a0, 0xf0c040], lines: ['トンカン、トンカン！もうすぐ完成だ！', 'はいよ、仕事中だよ！'], marks: ['!', '♪'] },
  { id: 'a_cat', kind: 'animal', height: 30, speed: 1.5, colors: [0xd8a060, 0xd8a060, 0xffffff], lines: ['にゃーん。', 'ごろごろ…。'], marks: ['♪', '…'] },
  { id: 'a_dog', kind: 'animal', height: 38, speed: 1.9, colors: [0xb88a5a, 0xb88a5a, 0xffffff], lines: ['わん！', 'わんわん！（しっぽをふっている）'], marks: ['!', '♪'] },
  { id: 'a_chicken', kind: 'animal', height: 28, speed: 0.8, colors: [0xf4f0e0, 0xf4f0e0, 0xd8402f], lines: ['コッコッコ…。', 'コケッ！'], marks: ['…', '!'] },
  { id: 'a_sheep', kind: 'animal', height: 40, speed: 0.55, colors: [0xf0ece0, 0x3a3a3a, 0xf0ece0], lines: ['めえ〜。', 'めえめえ〜。'], marks: ['♪', '…'] },
  { id: 'a_pig', kind: 'animal', height: 38, speed: 0.65, colors: [0xf0a8b0, 0xf0a8b0, 0xe0808a], lines: ['ぶひー。', 'ぶひぶひ！'], marks: ['♪', '…'] },
  { id: 'a_cow', kind: 'animal', height: 48, speed: 0.5, colors: [0xf4f0e8, 0x2a2a2a, 0xe8b0a0], lines: ['もー。', 'もーもー。'], marks: ['…', '♪'] },
];

export const PEOPLE: PeopleDef[] = PEOPLE_BASE.map((d) => ({ ...d, height: Math.round(d.height * SIZE_BOOST) }));

const KEY_PREFIX = 'vp_';
const keyOf = (id: string): string => `${KEY_PREFIX}${id}`;
const fallbackKey = (id: string): string => `${KEY_PREFIX}fb_${id}`;

/** Loads the supplied pictures, if any (a missing file is ignored: BootScene ignores load errors). */
export function preloadVillagePeople(scene: Phaser.Scene): void {
  for (const def of PEOPLE) scene.load.image(keyOf(def.id), `assets/village/people/${def.id}.png`);
}

/** The order in which kinds are added as the village grows: a mix of people and animals. */
const ORDER = ['p_farmer', 'a_cat', 'p_woman', 'p_child', 'a_dog', 'p_merchant', 'p_old', 'a_chicken', 'p_guard', 'p_girl', 'a_sheep', 'p_farmer', 'a_pig', 'p_woman', 'a_cow', 'p_child'];
const MAX_WALKERS = 14;

/** How many are about: 2 in a new village, more with every house, shop and castle level. */
export function walkerTarget(save: SaveData, now = Date.now()): number {
  let houses = 0;
  let shops = 0;
  for (const b of save.village.buildings) {
    if (b.kind === 'house') houses++;
    else if (b.kind === 'shop' || b.kind === 'market') shops++;
  }
  return Phaser.Math.Clamp(Math.round(2 + houses + shops * 0.5 + (castleLevel(save, now) - 1)), 2, MAX_WALKERS);
}

export type { PeopleDef };

export interface WalkersHost {
  /** The container the walkers are put in (the building layer: its children are drawn in order of `depth`). */
  layer: Phaser.GameObjects.Container;
  save: () => SaveData;
  /** Where tile (gx, gy)'s top corner is, in the world. */
  pos: (gx: number, gy: number) => Pt;
}

interface Walker {
  def: PeopleDef;
  view: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Graphics;
  /** Feet, in (fractional) tiles. */
  gx: number;
  gy: number;
  path: { x: number; y: number }[];
  /** ms left standing still. */
  wait: number;
  phase: number;
  baseScale: number;
  facingLeft: boolean;
  /** ms until it may show a mark / be tapped again. */
  markIn: number;
  hop: number;
  bubble?: Phaser.GameObjects.Text;
}

/** A figure drawn from shapes, for a kind without a picture: a body, a head and a bit of colour. */
function ensureFallback(scene: Phaser.Scene, def: PeopleDef): string {
  const key = fallbackKey(def.id);
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const [body, head, accent] = def.colors;
  if (def.kind === 'person') {
    g.fillStyle(0x000000, 0.0);
    g.fillRect(0, 0, 48, 84);
    g.fillStyle(0x3a2810, 1);
    g.fillRoundedRect(12, 68, 10, 14, 3);
    g.fillRoundedRect(26, 68, 10, 14, 3);
    g.fillStyle(body, 1);
    g.fillRoundedRect(9, 36, 30, 36, 10);
    g.lineStyle(2, 0x3a2810, 0.9);
    g.strokeRoundedRect(9, 36, 30, 36, 10);
    g.fillStyle(accent, 1);
    g.fillRect(9, 52, 30, 6);
    g.fillStyle(head, 1);
    g.fillCircle(24, 22, 15);
    g.lineStyle(2, 0x3a2810, 0.9);
    g.strokeCircle(24, 22, 15);
    g.fillStyle(accent, 1);
    g.fillRoundedRect(10, 6, 28, 11, 6);
    g.fillStyle(0x2a1a0a, 1);
    g.fillCircle(19, 24, 2);
    g.fillCircle(29, 24, 2);
    g.generateTexture(key, 48, 84);
  } else {
    g.fillStyle(0x3a2810, 1);
    g.fillRect(8, 34, 5, 10);
    g.fillRect(36, 34, 5, 10);
    g.fillStyle(body, 1);
    g.fillEllipse(24, 28, 40, 24);
    g.lineStyle(2, 0x3a2810, 0.9);
    g.strokeEllipse(24, 28, 40, 24);
    g.fillStyle(head, 1);
    g.fillCircle(40, 18, 9);
    g.lineStyle(2, 0x3a2810, 0.9);
    g.strokeCircle(40, 18, 9);
    g.fillStyle(accent, 1);
    g.fillCircle(42, 22, 3);
    g.fillStyle(0x2a1a0a, 1);
    g.fillCircle(43, 16, 1.6);
    g.generateTexture(key, 52, 46);
  }
  g.destroy();
  return key;
}

/** The picture of `def` (or the figure drawn in its place) and the scale that makes it `def.height` px tall. */
export function peopleTexture(scene: Phaser.Scene, def: PeopleDef): { key: string; scale: number } {
  const key = scene.textures.exists(keyOf(def.id)) ? keyOf(def.id) : ensureFallback(scene, def);
  const source = scene.textures.get(key).getSourceImage() as { width: number; height: number };
  return { key, scale: def.height / source.height };
}

export class VillageWalkers {
  private readonly walkers: Walker[] = [];
  /** Tiles that are free to stand on (true), recomputed from the buildings. */
  private free: boolean[] = [];
  private rects: { kind: BuildingKind; x: number; y: number; w: number; h: number }[] = [];
  private destroyed = false;
  private readonly scene: Phaser.Scene;
  private readonly host: WalkersHost;

  constructor(scene: Phaser.Scene, host: WalkersHost) {
    this.scene = scene;
    this.host = host;
  }

  get items(): readonly Walker[] {
    return this.walkers;
  }

  // ------------------------------------------------------------ the map --

  private cell(x: number, y: number): number {
    return y * VILLAGE_COLS + x;
  }

  private isFree(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < VILLAGE_COLS && y < VILLAGE_ROWS && this.free[this.cell(x, y)] === true;
  }

  /** Works out which tiles are free: not under any building (nor the place one is being moved to), nor under a 行商人 / 宝箱. */
  private mapGround(now: number): void {
    const save = this.host.save();
    this.free = new Array<boolean>(VILLAGE_COLS * VILLAGE_ROWS).fill(true);
    this.rects = [];
    for (const b of save.village.buildings) {
      const def = getBuilding(b.kind);
      for (const at of footprints(b, now)) {
        this.rects.push({ kind: b.kind, x: at.x, y: at.y, w: def.w, h: def.h });
        for (let y = at.y; y < at.y + def.h; y++) for (let x = at.x; x < at.x + def.w; x++) if (x >= 0 && y >= 0 && x < VILLAGE_COLS && y < VILLAGE_ROWS) this.free[this.cell(x, y)] = false;
      }
    }
    for (const w of save.village.wanderers.items) if (w.x >= 0 && w.y >= 0 && w.x < VILLAGE_COLS && w.y < VILLAGE_ROWS) this.free[this.cell(Math.floor(w.x), Math.floor(w.y))] = false;
  }

  /** Breadth-first over the free tiles from (sx, sy): the distance to every tile that can be walked to (-1 for the rest). */
  private reach(sx: number, sy: number): { dist: number[]; from: number[] } {
    const dist = new Array<number>(VILLAGE_COLS * VILLAGE_ROWS).fill(-1);
    const from = new Array<number>(VILLAGE_COLS * VILLAGE_ROWS).fill(-1);
    const queue: number[] = [this.cell(sx, sy)];
    dist[queue[0]] = 0;
    const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      const x = at % VILLAGE_COLS;
      const y = Math.floor(at / VILLAGE_COLS);
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isFree(nx, ny)) continue;
        // No cutting a corner of a building on a diagonal step.
        if (dx !== 0 && dy !== 0 && (!this.isFree(x + dx, y) || !this.isFree(x, y + dy))) continue;
        const to = this.cell(nx, ny);
        if (dist[to] >= 0) continue;
        dist[to] = dist[at] + 1;
        from[to] = at;
        queue.push(to);
      }
    }
    return { dist, from };
  }

  private randomFreeTile(): { x: number; y: number } | null {
    const tiles: number[] = [];
    this.free.forEach((ok, i) => {
      if (ok) tiles.push(i);
    });
    if (tiles.length === 0) return null;
    const at = tiles[Math.floor(Math.random() * tiles.length)];
    return { x: at % VILLAGE_COLS, y: Math.floor(at / VILLAGE_COLS) };
  }

  /** A tile near a building of the kind this one likes (merchants: shops, guards: gates and fences), when there is one. */
  private preferredTarget(prefer: Prefer, dist: number[]): { x: number; y: number } | null {
    const kinds: BuildingKind[] = prefer === 'shop' ? ['shop', 'market'] : ['gate', 'fence'];
    const spots: number[] = [];
    for (const r of this.rects) {
      if (!kinds.includes(r.kind)) continue;
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          if (this.isFree(x, y) && dist[this.cell(x, y)] >= 2) spots.push(this.cell(x, y));
        }
      }
    }
    if (spots.length === 0) return null;
    const at = spots[Math.floor(Math.random() * spots.length)];
    return { x: at % VILLAGE_COLS, y: Math.floor(at / VILLAGE_COLS) };
  }

  // ------------------------------------------------------------ walkers --

  private makeWalker(def: PeopleDef, tile: { x: number; y: number }): Walker {
    const { key, scale: baseScale } = peopleTexture(this.scene, def);
    const body = this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setScale(baseScale);
    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillEllipse(0, -2, Math.max(20, body.displayWidth * 0.8), 9);
    const view = this.scene.add.container(0, 0, [shadow, body]);
    const walker: Walker = {
      def,
      view,
      body,
      shadow,
      gx: tile.x + 0.5,
      gy: tile.y + 0.5,
      path: [],
      wait: 400 + Math.random() * 2500,
      phase: Math.random() * 6,
      baseScale,
      facingLeft: Math.random() < 0.5,
      markIn: 3000 + Math.random() * 6000,
      hop: 0,
    };
    this.place(walker);
    this.host.layer.add(view);
    return walker;
  }

  /** Puts the figure where its feet are (the world position and the draw order, which is the same sum a building's is). */
  private place(w: Walker): void {
    const p = this.host.pos(w.gx, w.gy);
    w.view.setPosition(p.x, p.y);
    w.view.setDepth(w.gx + w.gy);
  }

  /** Brings the crowd up to date with the village: its size, and anyone standing where a building now is. */
  refresh(now = Date.now()): void {
    if (this.destroyed) return;
    this.mapGround(now);
    const want = walkerTarget(this.host.save(), now);
    while (this.walkers.length > want) {
      const w = this.walkers.pop();
      if (w) this.removeWalker(w);
    }
    while (this.walkers.length < want) {
      const id = ORDER[this.walkers.length % ORDER.length];
      const def = PEOPLE.find((p) => p.id === id) ?? PEOPLE[0];
      const tile = this.randomFreeTile();
      if (!tile) break;
      this.walkers.push(this.makeWalker(def, tile));
    }
    for (const w of this.walkers) {
      const tx = Math.floor(w.gx);
      const ty = Math.floor(w.gy);
      const blocked = !this.isFree(tx, ty);
      const wrong = w.path.some((step) => !this.isFree(step.x, step.y));
      if (blocked) {
        const tile = this.randomFreeTile();
        if (!tile) continue;
        w.gx = tile.x + 0.5;
        w.gy = tile.y + 0.5;
        w.path = [];
        w.view.setAlpha(0);
        this.scene.tweens.add({ targets: w.view, alpha: 1, duration: 400 });
        this.place(w);
      } else if (wrong) {
        w.path = [];
      }
    }
  }

  private removeWalker(w: Walker): void {
    this.scene.tweens.killTweensOf(w.view);
    if (w.bubble) this.scene.tweens.killTweensOf(w.bubble);
    w.view.destroy();
  }

  /** The figures leave the building layer (without being destroyed) while it is cleared and drawn again. */
  detach(): void {
    for (const w of this.walkers) this.host.layer.remove(w.view, false);
  }

  attach(): void {
    for (const w of this.walkers) {
      if (!w.view.active) continue;
      this.host.layer.add(w.view);
    }
  }

  /** Chooses where to go next: a tile 3 to 12 steps away (a merchant likes the shops, a guard the gates). */
  private chooseWalk(w: Walker): void {
    const sx = Math.floor(w.gx);
    const sy = Math.floor(w.gy);
    if (!this.isFree(sx, sy)) return;
    const { dist, from } = this.reach(sx, sy);
    let target: { x: number; y: number } | null = null;
    if (w.def.prefer && Math.random() < 0.7) target = this.preferredTarget(w.def.prefer, dist);
    if (!target) {
      const options: number[] = [];
      dist.forEach((d, i) => {
        if (d >= 3 && d <= 12) options.push(i);
      });
      if (options.length === 0) return;
      const at = options[Math.floor(Math.random() * options.length)];
      target = { x: at % VILLAGE_COLS, y: Math.floor(at / VILLAGE_COLS) };
    }
    const path: { x: number; y: number }[] = [];
    let at = this.cell(target.x, target.y);
    while (at >= 0 && at !== this.cell(sx, sy)) {
      path.push({ x: at % VILLAGE_COLS, y: Math.floor(at / VILLAGE_COLS) });
      at = from[at];
    }
    path.reverse();
    w.path = path;
  }

  /** Moves everyone on by `dtMs` (the caller runs this about 30 times a second). `visible(gx, gy)` says whether the tile is on screen. */
  update(dtMs: number, visible: (gx: number, gy: number) => boolean): void {
    for (const w of this.walkers) {
      w.markIn -= dtMs;
      if (w.hop > 0) w.hop = Math.max(0, w.hop - dtMs);
      const hopY = w.hop > 0 ? -Math.sin((1 - w.hop / 360) * Math.PI) * 14 : 0;
      if (w.path.length === 0) {
        w.wait -= dtMs;
        w.phase += dtMs * 0.0025;
        // Standing: a slow breath.
        w.body.setScale(w.baseScale * (w.facingLeft ? -1 : 1) * (1 - 0.012 * Math.sin(w.phase)), w.baseScale * (1 + 0.018 * Math.sin(w.phase)));
        w.body.y = hopY;
        if (w.def.kind === 'animal' && w.def.id === 'a_chicken') w.body.y += Math.max(0, Math.sin(w.phase * 6)) * -1.5;
        if (w.wait <= 0) {
          this.chooseWalk(w);
          w.wait = 800 + Math.random() * 4500;
        }
        if (w.markIn <= 0) {
          w.markIn = 7000 + Math.random() * 9000;
          if (visible(w.gx, w.gy) && !w.bubble) this.say(w, w.def.marks[Math.floor(Math.random() * w.def.marks.length)]);
        }
        continue;
      }
      const next = w.path[0];
      const tx = next.x + 0.5;
      const ty = next.y + 0.5;
      const dx = tx - w.gx;
      const dy = ty - w.gy;
      const len = Math.hypot(dx, dy);
      const step = (w.def.speed * dtMs) / 1000;
      if (len <= step) {
        w.gx = tx;
        w.gy = ty;
        w.path.shift();
      } else {
        w.gx += (dx / len) * step;
        w.gy += (dy / len) * step;
      }
      // On screen the step is (dgx - dgy) * tileW / 2 across.
      const screenDx = dx - dy;
      if (Math.abs(screenDx) > 0.05) w.facingLeft = screenDx < 0;
      w.phase += step * 7.5;
      const bounce = Math.abs(Math.sin(w.phase));
      const squash = Math.sin(w.phase * 2);
      w.body.setScale(w.baseScale * (w.facingLeft ? -1 : 1) * (1 - 0.035 * squash), w.baseScale * (1 + 0.05 * squash));
      w.body.y = -bounce * (w.def.kind === 'animal' ? 2.5 : 4.5) + hopY;
      this.place(w);
    }
  }

  /** A little mark ( ♪ ! … ) over a head for a moment. It is a child of the figure's own container, so it goes wherever the
   *  figure goes and is never left behind when the building layer is cleared and drawn again. */
  private say(w: Walker, mark: string): void {
    const text = this.scene.add
      .text(0, -w.def.height - 14, mark, { fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#fff4dc', stroke: '#1c130a', strokeThickness: 4 })
      .setOrigin(0.5)
      .setAlpha(0);
    w.view.add(text);
    w.bubble = text;
    const done = (): void => {
      if (w.bubble === text) w.bubble = undefined;
      text.destroy();
    };
    this.scene.tweens.add({
      targets: text,
      alpha: { from: 0, to: 1 },
      y: text.y - 10,
      duration: 260,
      onComplete: () => {
        if (!text.active) return;
        this.scene.tweens.add({ targets: text, alpha: 0, delay: 1100, duration: 380, onComplete: () => text.active && done() });
      },
    });
  }

  /** The figure under a point of the world (feet at the walker's position), if any. */
  hit(wx: number, wy: number): Walker | undefined {
    let best: Walker | undefined;
    let bestY = -Infinity;
    for (const w of this.walkers) {
      const left = w.view.x - Math.max(24, (w.body.displayWidth * 0.5) + 6);
      const right = w.view.x + Math.max(24, (w.body.displayWidth * 0.5) + 6);
      const top = w.view.y - w.def.height - 10;
      const bottom = w.view.y + 8;
      if (wx >= left && wx <= right && wy >= top && wy <= bottom && w.view.y > bestY) {
        best = w;
        bestY = w.view.y;
      }
    }
    return best;
  }

  /** A tap on a figure: it hops, shows a heart and says its line. */
  poke(w: Walker): void {
    w.hop = 360;
    w.path = [];
    w.wait = 1800;
    showToast(this.scene, w.def.lines[Math.floor(Math.random() * w.def.lines.length)], '#ffe9b8');
    if (!w.bubble) this.say(w, w.def.kind === 'animal' ? '♪' : '!');
  }

  destroy(): void {
    this.destroyed = true;
    for (const w of this.walkers) this.removeWalker(w);
    this.walkers.length = 0;
  }
}
