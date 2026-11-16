import { dismantleValue, equipDefsOfRarity, equipLevelUpCost, getEquipDef } from '../data/equipment';
import { EQUIP_SLOTS, type EquipSlot, type EquipmentItem, type HeroData, type Rarity } from '../types';
import { SaveSystem, type SaveData } from './SaveSystem';
import { recordMission } from './MissionProgress';

/** A piece of equipment found somewhere in the save, with who wears it (nobody if it is in the bag). */
export interface OwnedEquipment {
  item: EquipmentItem;
  owner?: HeroData;
}

let counter = 0;

export const EquipmentSystem = {
  /** A fresh level-1 piece of the kind `defId`. */
  create(defId: string): EquipmentItem {
    counter += 1;
    return { id: `eq-${Date.now().toString(36)}-${counter}-${Math.floor(Math.random() * 1e6).toString(36)}`, defId, level: 1 };
  },

  /** A random level-1 piece of `rarity`, put in the bag. */
  grantRandom(save: SaveData, rarity: Rarity, rng: () => number = Math.random): EquipmentItem {
    const pool = equipDefsOfRarity(rarity);
    const item = this.create(pool[Math.floor(rng() * pool.length)].id);
    save.equipment.push(item);
    return item;
  },

  /** Every piece the player has: the bag first, then what the heroes wear. */
  all(save: SaveData): OwnedEquipment[] {
    const worn: OwnedEquipment[] = [];
    for (const hero of save.heroes) {
      for (const slot of EQUIP_SLOTS) {
        const item = hero.gear[slot];
        if (item) worn.push({ item, owner: hero });
      }
    }
    return [...save.equipment.map((item) => ({ item })), ...worn];
  },

  find(save: SaveData, itemId: string): OwnedEquipment | undefined {
    return this.all(save).find((o) => o.item.id === itemId);
  },

  /** Puts the bag's piece on the hero. Whatever was in that slot goes back to the bag. */
  equip(save: SaveData, heroId: string, itemId: string): boolean {
    const hero = SaveSystem.getHero(save, heroId);
    const index = save.equipment.findIndex((i) => i.id === itemId);
    if (!hero || index < 0) return false;
    const item = save.equipment[index];
    const slot = getEquipDef(item.defId)?.slot;
    if (!slot) return false;
    save.equipment.splice(index, 1);
    const previous = hero.gear[slot];
    if (previous) save.equipment.push(previous);
    hero.gear[slot] = item;
    return true;
  },

  /** Takes the piece off, into the bag. */
  unequip(save: SaveData, heroId: string, slot: EquipSlot): boolean {
    const hero = SaveSystem.getHero(save, heroId);
    const item = hero?.gear[slot];
    if (!hero || !item) return false;
    hero.gear[slot] = null;
    save.equipment.push(item);
    return true;
  },

  /** Spends 装備強化素材 to raise a piece (worn or not) one level. False if it is at its top level or there is not enough. */
  levelUp(save: SaveData, itemId: string): boolean {
    const found = this.find(save, itemId);
    const cost = found ? equipLevelUpCost(found.item) : null;
    if (!found || cost === null || !SaveSystem.spendItem(save, 'equip_essence', cost)) return false;
    found.item.level += 1;
    recordMission(save, 'equip_enhance');
    return true;
  },

  /** 分解: turns a piece from the bag into 装備強化素材. Returns how much, or null if it is not in the bag (a worn piece has to come off first). */
  dismantle(save: SaveData, itemId: string): number | null {
    const index = save.equipment.findIndex((i) => i.id === itemId);
    if (index < 0) return null;
    const gained = dismantleValue(save.equipment[index]);
    save.equipment.splice(index, 1);
    SaveSystem.addItem(save, 'equip_essence', gained);
    return gained;
  },

  /** 一括分解: every piece in the bag of `maxRarity` or lower. */
  dismantleUpTo(save: SaveData, maxRarity: Rarity): { count: number; essence: number } {
    const doomed = save.equipment.filter((i) => (getEquipDef(i.defId)?.rarity ?? 5) <= maxRarity);
    let essence = 0;
    for (const item of doomed) essence += this.dismantle(save, item.id) ?? 0;
    return { count: doomed.length, essence };
  },
};
