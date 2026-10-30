import Phaser from 'phaser';
import { DEFAULT_GLYPH, getEquipDef, type EquipGlyph } from '../data/equipment';
import { ITEMS, type ItemId } from '../data/items';
import type { Reward } from '../data/rewards';
import type { GrantedReward } from '../systems/RewardSystem';
import type { EquipmentItem, Rarity } from '../types';
import { buildChip } from './CardParts';
import { equipIcon, itemIcon } from './ItemIcons';
import { createPanel } from './Panel';
import { addGoodIcon, GOOD_LABEL } from './RewardIcon';
import { body, caption, CHROME } from './theme';

const INK = '#1c130a';
export const TILE_W = 112;
export const TILE_H = 132;
const GAP = 10;
const PER_ROW = 5;

export type RewardTileKind = 'gold' | 'gems' | 'phaseMaterials' | 'stamina' | 'exp' | 'essence' | 'rank' | 'item' | 'equipment';

export interface RewardTile {
  kind: RewardTileKind;
  /** Already formatted, e.g. "+266". Kept as text so a huge number shows in full. */
  amount: string;
  /** A small tag on the tile's corner, e.g. 初回. */
  tag?: string;
  /** For kind 'item'. */
  item?: ItemId;
  /** For kind 'equipment': the piece's slot, rarity and name. */
  equip?: { glyph: EquipGlyph; rarity: Rarity; name: string };
}

/** EXP and 技素 have no illustration of their own: a brass-ringed disc with a kanji. */
const BADGE: Record<'exp' | 'essence' | 'rank', { color: number; glyph: string; label: string }> = {
  rank: { color: 0xc7701c, glyph: 'Lv', label: 'プレイヤー' },
  exp: { color: 0x3a7fd6, glyph: '経', label: 'EXP' },
  essence: { color: 0x3f9a5a, glyph: '技', label: '技素' },
};

/** One tile per piece of equipment (its icon, name and rarity stars). */
export function tilesForEquipment(pieces: EquipmentItem[]): RewardTile[] {
  const tiles: RewardTile[] = [];
  for (const piece of pieces) {
    const def = getEquipDef(piece.defId);
    if (def) tiles.push({ kind: 'equipment', amount: '★'.repeat(def.rarity), equip: { glyph: def.glyph, rarity: def.rarity, name: def.name } });
  }
  return tiles;
}

/** The tiles for a list of rewards that were just handed over (one tile per piece of equipment). */
export function tilesForGranted(granted: GrantedReward[]): RewardTile[] {
  const tiles: RewardTile[] = [];
  for (const g of granted) {
    const r: Reward = g.reward;
    if (r.type === 'equipment') {
      tiles.push(...tilesForEquipment(g.equipment ?? []));
    } else if (r.type === 'item') tiles.push({ kind: 'item', item: r.item, amount: `+${r.amount.toLocaleString('ja-JP')}` });
    else if (r.type === 'skillEssence') tiles.push({ kind: 'essence', amount: `+${r.amount.toLocaleString('ja-JP')}` });
    else tiles.push({ kind: r.type, amount: `+${r.amount.toLocaleString('ja-JP')}` });
  }
  return tiles;
}

/** The tile's illustration - a supplied/drawn icon, or a disc with a kanji - centered at (x, y), `size` px across. Returns its label. */
export function addTileIcon(scene: Phaser.Scene, container: Phaser.GameObjects.Container, tile: RewardTile, x: number, y: number, size: number): string {
  if (tile.kind === 'exp' || tile.kind === 'essence' || tile.kind === 'rank') {
    const badge = BADGE[tile.kind];
    const r = size / 2;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(x, y + 2, r);
    g.fillStyle(badge.color, 1);
    g.fillCircle(x, y, r);
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(x, y - r * 0.42, r * 1.3, r * 0.6);
    g.lineStyle(Math.max(2, r * 0.12), CHROME.brassBright, 0.95);
    g.strokeCircle(x, y, r);
    container.add(g);
    container.add(body(scene, x, y, badge.glyph, { fontSize: `${Math.round(r * (badge.glyph.length > 1 ? 0.8 : 1.08))}px`, fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    return badge.label;
  }
  if (tile.kind === 'item' && tile.item) {
    container.add(scene.add.image(x, y, itemIcon(scene, tile.item, size)));
    return ITEMS[tile.item].short;
  }
  if (tile.kind === 'equipment' && tile.equip) {
    container.add(scene.add.image(x, y, equipIcon(scene, tile.equip.glyph, tile.equip.rarity, size)));
    return tile.equip.name;
  }
  const good = tile.kind as 'gems' | 'gold' | 'stamina' | 'phaseMaterials';
  container.add(addGoodIcon(scene, good, x, y, size));
  return GOOD_LABEL[good];
}

/** A tile for a reward that has not been handed over yet (a calendar day, a pack's contents). */
export function tileForReward(r: Reward): RewardTile {
  const amount = `+${r.amount.toLocaleString('ja-JP')}`;
  if (r.type === 'equipment') return { kind: 'equipment', amount: `×${r.amount}`, equip: { glyph: DEFAULT_GLYPH.weapon, rarity: r.rarity, name: `装備★${r.rarity}` } };
  if (r.type === 'item') return { kind: 'item', item: r.item, amount };
  if (r.type === 'skillEssence') return { kind: 'essence', amount };
  return { kind: r.type, amount };
}

function drawTile(scene: Phaser.Scene, container: Phaser.GameObjects.Container, tile: RewardTile, x: number, cy: number): void {
  container.add(createPanel(scene, x, cy, TILE_W, TILE_H, { fillColor: 0x150e07, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, borderWidth: 1.5, radius: 10, gradient: false }));

  const label = addTileIcon(scene, container, tile, x, cy - 30, 52);
  const name = caption(scene, x, cy + 14, label, { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
  if (name.width > TILE_W - 8) name.setScale((TILE_W - 8) / name.width);
  const amount = body(scene, x, cy + 42, tile.amount, { fontSize: '25px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
  if (amount.width > TILE_W - 10) amount.setScale((TILE_W - 10) / amount.width);
  container.add([name, amount]);

  if (tile.tag) {
    const chip = buildChip(scene, x - TILE_W / 2 + 4, cy - TILE_H / 2 + 14, tile.tag, { fill: 0xb8472a, color: '#fff4dc', fontSize: 15 });
    container.add(chip.container);
  }
}

/** Reward tiles (icon, name, amount) laid out in centered rows of five, top-left of the
 *  container at (0, 0); `width` is the space to center within. `height` is what it takes. */
export function buildRewardGrid(scene: Phaser.Scene, tiles: RewardTile[], width: number): { container: Phaser.GameObjects.Container; height: number } {
  const container = scene.add.container(0, 0);
  const rows = Math.max(1, Math.ceil(tiles.length / PER_ROW));
  tiles.forEach((tile, i) => {
    const row = Math.floor(i / PER_ROW);
    const inRow = Math.min(PER_ROW, tiles.length - row * PER_ROW);
    const rowW = inRow * TILE_W + (inRow - 1) * GAP;
    const x = width / 2 - rowW / 2 + TILE_W / 2 + (i % PER_ROW) * (TILE_W + GAP);
    drawTile(scene, container, tile, x, TILE_H / 2 + row * (TILE_H + GAP));
  });
  return { container, height: rows * TILE_H + (rows - 1) * GAP };
}

/** One centered row of reward tiles around (cx, cy) - what a result screen shows. */
export function buildRewardTiles(scene: Phaser.Scene, tiles: RewardTile[], cx: number, cy: number): Phaser.GameObjects.Container {
  const { container } = buildRewardGrid(scene, tiles, TILE_W * PER_ROW + GAP * (PER_ROW - 1));
  container.setPosition(cx - (TILE_W * PER_ROW + GAP * (PER_ROW - 1)) / 2, cy - TILE_H / 2);
  return container;
}
