import { equipValue, getEquipDef } from '../data/equipment';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { EQUIP_SLOT_LABELS, type EquipSlot } from '../types';
import { buildEquipmentRow } from '../ui/EquipmentRow';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';

interface GearPickData {
  heroId: string;
  slot: EquipSlot;
  /** The scene the hero detail was opened from (passed back when going back to it). */
  from: string;
  /** Opened straight from `from` (the formation screen), not by way of the hero detail: 戻る goes back to `from`. */
  direct?: boolean;
}

/** The list a hero's 武器 / 防具 / 装飾 slot opens: the piece worn now (with 外す) and
 *  every piece of that kind in the bag (with 装備する), best first. 戻る goes back
 *  to the hero's detail. */
export class GearPickScene extends InboxScene {
  protected readonly screenTitle = '装備を選ぶ';
  protected emptyText = '';
  private target!: GearPickData;

  constructor() {
    super('GearPick');
  }

  init(data: GearPickData): void {
    super.init();
    this.target = data;
    this.emptyText = `${EQUIP_SLOT_LABELS[data.slot]}を持っていません。\n装備ガチャや放置報酬で手に入ります。`;
  }

  protected goBack(): void {
    if (this.target.direct) this.scene.start(this.target.from);
    else this.scene.start('HeroDetail', { heroId: this.target.heroId, from: this.target.from });
  }

  protected buildCards(): InboxCard[] {
    const hero = SaveSystem.getHero(this.save, this.target.heroId);
    if (!hero) {
      this.time.delayedCall(0, () => this.scene.start(this.target.from));
      return [];
    }
    const guard = () => this.scroll.isTap();
    const { slot } = this.target;
    const cards: InboxCard[] = [];

    const worn = hero.gear[slot];
    if (worn) {
      cards.push(buildEquipmentRow(this, worn, { wornBy: hero.name, actions: [{ label: '外す', variant: 'wood', onTap: () => this.unequip() }], guard }));
    }
    const candidates = this.save.equipment
      .filter((i) => getEquipDef(i.defId)?.slot === slot)
      .sort((a, b) => {
        const da = getEquipDef(a.defId)!;
        const db = getEquipDef(b.defId)!;
        return db.rarity - da.rarity || equipValue(db, b.level) - equipValue(da, a.level);
      });
    for (const item of candidates) {
      cards.push(buildEquipmentRow(this, item, { actions: [{ label: '装備する', variant: 'gold', onTap: () => this.equip(item.id) }], guard }));
    }
    return cards;
  }

  private equip(itemId: string): void {
    if (!EquipmentSystem.equip(this.save, this.target.heroId, itemId)) return;
    SaveSystem.save(this.save);
    showToast(this, '装備しました');
    this.goBack();
  }

  private unequip(): void {
    if (!EquipmentSystem.unequip(this.save, this.target.heroId, this.target.slot)) return;
    SaveSystem.save(this.save);
    this.queueRender();
  }
}
