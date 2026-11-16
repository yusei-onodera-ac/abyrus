import type { HeroClass } from '../types';
import type { Reward } from './rewards';
import type { MaterialBundle } from './village';

/**
 * 遠征: send heroes away for a few hours, take what they bring home when they are back, send
 * them again. The long ones (8 / 12 hours) are meant to be started on the way out in the morning
 * and taken on the way home in the evening - twice a day. Edit this file to change the list, the
 * times or what they pay (数字は仮のバランス).
 *
 * Heroes away are not taken out of the battle party: they only cannot be sent on a second
 * expedition at the same time.
 */

/** How many expeditions can be out at once. */
export const EXPEDITION_SLOTS = 3;

/** Each hero of the expedition's `favored` class adds this much to everything it pays... */
export const EXPEDITION_CLASS_BONUS = 0.25;
/** ...and each ★ the party has above one star apiece adds this much. */
export const EXPEDITION_STAR_BONUS = 0.03;

export interface ExpeditionDef {
  id: string;
  name: string;
  /** One line under the name. */
  description: string;
  /** How long they are away. */
  hours: number;
  /** How many heroes it takes (all of them, no fewer). */
  partySize: number;
  /** Main stages that must have been cleared before it opens (a region has 30). */
  needStage: number;
  /** The class that suits it best: see EXPEDITION_CLASS_BONUS. */
  favored: HeroClass;
  /** What it pays with no bonus; a bonus raises every amount. */
  rewards: Reward[];
  /** 村の素材 (木材・鉄・石) it brings home besides, raised by the bonus too. Only the village shows them. */
  materials?: MaterialBundle;
}

export const EXPEDITIONS: ExpeditionDef[] = [
  {
    id: 'forest-patrol',
    name: '森の見回り',
    description: '迷いの森を一回りして、様子を見てくる。',
    hours: 4,
    partySize: 1,
    needStage: 0,
    favored: 'archer',
    rewards: [{ type: 'gold', amount: 3000 }, { type: 'item', item: 'exp_s', amount: 8 }, { type: 'stamina', amount: 15 }],
    materials: { wood: 40, stone: 20 },
  },
  {
    id: 'forest-herbs',
    name: '薬草の採取行',
    description: '森の奥まで入って、薬草と素材を集める。',
    hours: 8,
    partySize: 2,
    needStage: 0,
    favored: 'healer',
    rewards: [{ type: 'gold', amount: 6000 }, { type: 'item', item: 'exp_s', amount: 20 }, { type: 'item', item: 'equip_essence', amount: 20 }, { type: 'stamina', amount: 30 }],
    materials: { wood: 90, stone: 40 },
  },
  {
    id: 'waste-caravan',
    name: '隊商の護衛',
    description: '荒野を渡る隊商に付き添って、荷を守る。',
    hours: 8,
    partySize: 2,
    needStage: 30,
    favored: 'tank',
    rewards: [{ type: 'gold', amount: 10000 }, { type: 'item', item: 'exp_m', amount: 6 }, { type: 'item', item: 'equip_essence', amount: 40 }, { type: 'skillEssence', amount: 150 }],
    materials: { stone: 120, iron: 25 },
  },
  {
    id: 'waste-hunt',
    name: '猛獣狩り',
    description: '荒野にはびこる狂獣を、一帯から追い払う。',
    hours: 12,
    partySize: 3,
    needStage: 30,
    favored: 'warrior',
    rewards: [{ type: 'gold', amount: 18000 }, { type: 'item', item: 'exp_m', amount: 10 }, { type: 'equipment', rarity: 2, amount: 1 }, { type: 'phaseMaterials', amount: 1 }],
    materials: { stone: 150, iron: 50, wood: 60 },
  },
  {
    id: 'frost-lab',
    name: '廃研究所の調査',
    description: '氷に閉ざされた研究所で、記録と素材を探す。',
    hours: 8,
    partySize: 2,
    needStage: 60,
    favored: 'mage',
    rewards: [{ type: 'gold', amount: 14000 }, { type: 'item', item: 'exp_m', amount: 12 }, { type: 'item', item: 'equip_essence', amount: 60 }, { type: 'skillEssence', amount: 300 }],
    materials: { stone: 200, iron: 70 },
  },
  {
    id: 'frost-climb',
    name: '山嶺の踏破',
    description: '蒼氷の山嶺を越えて、奥地まで道を拓く。',
    hours: 12,
    partySize: 3,
    needStage: 60,
    favored: 'archer',
    rewards: [{ type: 'gold', amount: 26000 }, { type: 'item', item: 'exp_l', amount: 2 }, { type: 'equipment', rarity: 3, amount: 1 }, { type: 'phaseMaterials', amount: 1 }, { type: 'stamina', amount: 50 }],
    materials: { stone: 320, iron: 110, wood: 120 },
  },
  {
    id: 'ruins-dig',
    name: '遺跡の発掘',
    description: '瘴気の遺跡で、古い品を掘り出す。',
    hours: 8,
    partySize: 2,
    needStage: 90,
    favored: 'mage',
    rewards: [{ type: 'gold', amount: 22000 }, { type: 'item', item: 'exp_l', amount: 3 }, { type: 'item', item: 'equip_essence', amount: 100 }],
    materials: { stone: 380, iron: 140 },
  },
  {
    id: 'ruins-seal',
    name: '封印の巡礼',
    description: '遺跡に残る封印を巡って、瘴気を鎮める。',
    hours: 12,
    partySize: 3,
    needStage: 90,
    favored: 'healer',
    rewards: [{ type: 'gold', amount: 40000 }, { type: 'item', item: 'exp_l', amount: 4 }, { type: 'skillEssence', amount: 600 }, { type: 'phaseMaterials', amount: 2 }, { type: 'equipment', rarity: 3, amount: 1 }],
    materials: { stone: 520, iron: 190, wood: 200 },
  },
  {
    id: 'twilight-guard',
    name: '都の治安維持',
    description: '暴走する獣であふれた黄昏の都を、見回って鎮める。',
    hours: 12,
    partySize: 3,
    needStage: 120,
    favored: 'tank',
    rewards: [{ type: 'gold', amount: 60000 }, { type: 'item', item: 'exp_xl', amount: 1 }, { type: 'equipment', rarity: 4, amount: 1 }, { type: 'gems', amount: 50 }, { type: 'phaseMaterials', amount: 2 }],
    materials: { stone: 800, iron: 300, wood: 350 },
  },
];

export function getExpedition(id: string): ExpeditionDef | undefined {
  return EXPEDITIONS.find((e) => e.id === id);
}
