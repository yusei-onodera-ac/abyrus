import Phaser from 'phaser';
import { describeEquip, equipLevelUpCost, equipMaxLevel, getEquipDef } from '../data/equipment';
import { EQUIP_SLOT_LABELS, RARITY_COLORS, hex, type EquipmentItem } from '../types';
import { Button } from './Button';
import { buildCardPanel, buildChip } from './CardParts';
import { equipIcon } from './ItemIcons';
import { CARD_WIDTH } from './ScreenFrame';
import { body, caption } from './theme';

const INK = '#1c130a';
export const EQUIP_ROW_H = 124;
const PAD = 14;

export interface EquipRowAction {
  label: string;
  variant: 'gold' | 'wood' | 'danger';
  /** Smaller line under the label, e.g. a cost. */
  subLabel?: string;
  enabled?: boolean;
  onTap: () => void;
}

export interface EquipRowOptions {
  /** Who wears it, shown on the card ("装備中: ○○"). */
  wornBy?: string;
  /** Up to two buttons down the right edge. */
  actions: EquipRowAction[];
  guard: () => boolean;
}

/** One piece of equipment as a card: its icon, name, rarity and level, what it adds, and action buttons. */
export function buildEquipmentRow(scene: Phaser.Scene, item: EquipmentItem, opts: EquipRowOptions): { container: Phaser.GameObjects.Container; height: number } {
  const def = getEquipDef(item.defId);
  const container = scene.add.container(0, 0);
  container.add(buildCardPanel(scene, CARD_WIDTH, EQUIP_ROW_H, !!opts.wornBy));
  if (!def) return { container, height: EQUIP_ROW_H };

  container.add(scene.add.image(PAD + 44, EQUIP_ROW_H / 2, equipIcon(scene, def.slot, def.rarity, 88)));
  const x = PAD + 100;
  container.add(body(scene, x, 26, def.name, { fontSize: '26px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
  container.add(scene.add.text(x, 58, '★'.repeat(def.rarity), { fontSize: '19px', color: hex(RARITY_COLORS[def.rarity]), stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
  container.add(caption(scene, x + 104, 58, `${EQUIP_SLOT_LABELS[def.slot]}　Lv.${item.level} / ${equipMaxLevel(item)}`, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
  container.add(body(scene, x, 90, describeEquip(item), { fontSize: '23px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
  if (opts.wornBy) {
    const chip = buildChip(scene, x + 190, 26 + 64, `装備中 ${opts.wornBy}`, { fill: 0x3a4f7a, color: '#e0ecff', fontSize: 16 });
    container.add(chip.container);
  }

  const bw = 150;
  const bh = opts.actions.length > 1 ? 50 : 62;
  opts.actions.forEach((action, i) => {
    const y = opts.actions.length > 1 ? 32 + i * (bh + 6) : EQUIP_ROW_H / 2;
    const button = new Button(scene, CARD_WIDTH - PAD - bw / 2, y, bw, bh, action.label, action.onTap, {
      variant: action.variant,
      fontSize: '21px',
      subLabel: action.subLabel,
      guard: opts.guard,
    });
    if (action.enabled === false) button.setEnabled(false);
    container.add(button);
  });
  return { container, height: EQUIP_ROW_H };
}

/** Cost label for a 強化 button: the 素材 needed, or 最大 at the top level. */
export function levelUpLabel(item: EquipmentItem, have: number): { sub: string; enabled: boolean } {
  const cost = equipLevelUpCost(item);
  if (cost === null) return { sub: '最大', enabled: false };
  return { sub: `素材 ${cost.toLocaleString('ja-JP')}${have >= cost ? '' : '（不足）'}`, enabled: have >= cost };
}
