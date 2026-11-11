import Phaser from 'phaser';
import { BigNumber } from '../systems/BigNumber';
import { isItemId } from '../data/items';
import { ALLIANCE_ROLE_LABEL, EMBLEM_COUNT, JOIN_POLICY_LABEL, type AllianceDetail, type AllianceReward, type AllianceRole, type JoinPolicy } from '../alliance/AllianceBackend';
import { buildChip } from './CardParts';
import type { RewardTile } from './RewardTiles';
import { CHROME } from './theme';

/** Small things the 同盟 screens share: the emblems (drawn from code), reward tiles, chips and number text. */

// ---------------------------------------------------------------------------------------------- 紋章

type Pt = { x: number; y: number };
/** [main colour, accent, dark edge] */
const PALETTES: [number, number, number][] = [
  [0xb3262e, 0xffd23f, 0x5a0f14],
  [0x2f6fc0, 0xeaf2ff, 0x143266],
  [0x2f8f5a, 0xffe08a, 0x12452a],
];

/** A shape's outline in a 100x100 box centred on (0, 0). */
function shapeOf(i: number): Pt[] {
  if (i === 0) return [[-40, -46], [40, -46], [42, 8], [0, 50], [-42, 8]].map(([x, y]) => ({ x, y }));
  if (i === 1) return Array.from({ length: 28 }, (_, k) => ({ x: Math.cos((k / 28) * Math.PI * 2) * 44, y: Math.sin((k / 28) * Math.PI * 2) * 44 }));
  if (i === 2) return Array.from({ length: 6 }, (_, k) => ({ x: Math.cos((k / 6) * Math.PI * 2 + Math.PI / 6) * 48, y: Math.sin((k / 6) * Math.PI * 2 + Math.PI / 6) * 48 }));
  return [[-38, -46], [38, -46], [38, 44], [0, 24], [-38, 44]].map(([x, y]) => ({ x, y }));
}

/** The symbol in the middle (6 of them), drawn in `accent`. */
function glyph(g: Phaser.GameObjects.Graphics, i: number, accent: number, dark: number): void {
  g.fillStyle(accent, 1);
  g.lineStyle(2, dark, 1);
  if (i === 0) {
    // star
    const pts: Pt[] = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 24 : 10;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r - 2 });
    }
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  } else if (i === 1) {
    // crown
    const pts: Pt[] = [{ x: -22, y: 14 }, { x: -24, y: -14 }, { x: -11, y: -2 }, { x: 0, y: -20 }, { x: 11, y: -2 }, { x: 24, y: -14 }, { x: 22, y: 14 }];
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  } else if (i === 2) {
    // sword
    g.fillRect(-4, -26, 8, 40);
    g.strokeRect(-4, -26, 8, 40);
    g.fillRect(-16, 8, 32, 7);
    g.strokeRect(-16, 8, 32, 7);
    g.fillRect(-4, 15, 8, 12);
  } else if (i === 3) {
    // wings
    for (const s of [-1, 1]) {
      const pts: Pt[] = [{ x: s * 4, y: 14 }, { x: s * 26, y: -4 }, { x: s * 24, y: -22 }, { x: s * 12, y: -10 }, { x: s * 6, y: -24 }];
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
    }
  } else if (i === 4) {
    // flame
    const pts: Pt[] = [{ x: 0, y: -28 }, { x: 14, y: -6 }, { x: 18, y: 10 }, { x: 8, y: 24 }, { x: -8, y: 24 }, { x: -18, y: 10 }, { x: -10, y: -6 }, { x: -4, y: -2 }];
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  } else {
    // moon (a disc with another disc taken out of it, drawn in the shape's own colour by the caller's cut)
    g.fillCircle(0, -2, 22);
    g.fillStyle(dark, 1);
    g.fillCircle(10, -6, 18);
  }
}

/** One of the EMBLEM_COUNT emblems (shape × colours × symbol), centred on (x, y), `size` px across. */
export function buildEmblem(scene: Phaser.Scene, x: number, y: number, size: number, index: number): Phaser.GameObjects.Container {
  const i = ((Math.floor(index) % EMBLEM_COUNT) + EMBLEM_COUNT) % EMBLEM_COUNT;
  const [main, accent, dark] = PALETTES[Math.floor(i / 4) % PALETTES.length];
  const g = scene.add.graphics();
  const outline = shapeOf(i % 4);
  g.fillStyle(0x000000, 0.35);
  g.fillPoints(outline.map((p) => ({ x: p.x, y: p.y + 4 })), true);
  g.fillStyle(main, 1);
  g.fillPoints(outline, true);
  g.fillStyle(0xffffff, 0.16);
  g.fillPoints(outline.map((p) => ({ x: p.x * 0.78, y: p.y * 0.78 - 6 })).filter((p) => p.y < 4), true);
  g.lineStyle(4, accent, 1);
  g.strokePoints(outline, true);
  g.lineStyle(2, dark, 0.9);
  g.strokePoints(outline.map((p) => ({ x: p.x * 0.88, y: p.y * 0.88 })), true);
  glyph(g, i % 6, accent, i % 6 === 5 ? main : dark);
  const container = scene.add.container(x, y, [g]);
  container.setScale(size / 100);
  return container;
}

// ---------------------------------------------------------------------------------------------- 数

/** A big number in full digits (never 万/億), whatever its size. */
export function fullDigits(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1e15) return Math.round(n).toLocaleString('ja-JP');
  return BigNumber.from(n).toString();
}

/** "あと 2時間05分" / "あと 3日" for the time left until `endsAt`. */
export function timeLeft(endsAt: number, now = Date.now()): string {
  const ms = Math.max(0, endsAt - now);
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days >= 1) return `あと${days}日${hours}時間`;
  if (minutes >= 60) return `あと${hours}時間${String(minutes % 60).padStart(2, '0')}分`;
  return `あと${minutes}分`;
}

// ---------------------------------------------------------------------------------------------- 報酬

/** The reward tiles for what a 同盟 reward holds (shown in the 確認 popup after it was handed over). */
export function tilesForAllianceReward(reward: AllianceReward): RewardTile[] {
  const tiles: RewardTile[] = [];
  if (reward.gems) tiles.push({ kind: 'gems', amount: `+${reward.gems.toLocaleString('ja-JP')}` });
  if (reward.phaseMaterials) tiles.push({ kind: 'phaseMaterials', amount: `+${reward.phaseMaterials.toLocaleString('ja-JP')}` });
  if (reward.coins) tiles.push({ kind: 'coin', amount: `+${reward.coins.toLocaleString('ja-JP')}` });
  if (reward.goldHours) tiles.push({ kind: 'gold', amount: `${reward.goldHours}時間分` });
  for (const [id, amount] of Object.entries(reward.items ?? {})) if (amount > 0 && isItemId(id)) tiles.push({ kind: 'item', item: id, amount: `+${amount.toLocaleString('ja-JP')}` });
  return tiles;
}

/** One line for a reward ("魔晶石 50・同盟コイン 30"), for lists where there is no room for tiles. */
export function rewardLine(reward: AllianceReward): string {
  const parts: string[] = [];
  if (reward.gems) parts.push(`魔晶石 ${reward.gems.toLocaleString('ja-JP')}`);
  if (reward.phaseMaterials) parts.push(`フェーズ素材 ${reward.phaseMaterials}`);
  if (reward.coins) parts.push(`同盟コイン ${reward.coins.toLocaleString('ja-JP')}`);
  if (reward.goldHours) parts.push(`ゴールド ${reward.goldHours}時間分`);
  for (const [id, amount] of Object.entries(reward.items ?? {})) if (amount > 0) parts.push(`${id} ×${amount}`);
  return parts.join('・') || 'なし';
}

// ---------------------------------------------------------------------------------------------- 通知

/** How many things in the 同盟 are waiting for the player (for a red dot): a reward to take, a request to answer (幹部以上),
 *  stamina sent to them, boss attempts left. 0 for no 同盟 or nothing waiting. */
export function allianceAttention(d: AllianceDetail | null | undefined): number {
  if (!d) return 0;
  let n = 0;
  if (d.raid.claimable) n += 1;
  if (d.war.claimable) n += 1;
  if (d.requests.length > 0) n += 1;
  if (d.support.receivable > 0 && d.support.receiveLeft > 0) n += 1;
  if (d.raid.attemptsLeft > 0 && d.raid.defeatedAt === null) n += 1;
  return n;
}

// ---------------------------------------------------------------------------------------------- チップ

const ROLE_FILL: Record<AllianceRole, number> = { leader: 0xb8841f, officer: 0x3a6fb0, member: 0x4a3a28 };

export function roleChip(scene: Phaser.Scene, x: number, y: number, role: AllianceRole, fontSize = 15): { container: Phaser.GameObjects.Container; width: number } {
  return buildChip(scene, x, y, ALLIANCE_ROLE_LABEL[role], { fill: ROLE_FILL[role], color: '#fff4dc', fontSize });
}

const POLICY_FILL: Record<JoinPolicy, number> = { open: 0x2f7a4a, approval: 0x3a6fb0, invite: 0x6a3fb0 };

export function policyChip(scene: Phaser.Scene, x: number, y: number, policy: JoinPolicy, fontSize = 15): { container: Phaser.GameObjects.Container; width: number } {
  return buildChip(scene, x, y, JOIN_POLICY_LABEL[policy], { fill: POLICY_FILL[policy], color: '#fff4dc', fontSize });
}

/** A thin progress bar (brass rim, orange fill) with its left edge at (x, y). */
export function buildBar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, fill = 0xe0822a): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x0d0905, 1);
  g.fillRoundedRect(x, y, w, h, h / 2);
  const r = Phaser.Math.Clamp(ratio, 0, 1);
  if (r > 0) {
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, y, Math.max(h, w * r), h, h / 2);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(x + 2, y + 2, Math.max(h - 4, w * r - 4), h / 2 - 2, (h / 2 - 2) / 2);
  }
  g.lineStyle(2, CHROME.brassDark, 1);
  g.strokeRoundedRect(x, y, w, h, h / 2);
  return g;
}
