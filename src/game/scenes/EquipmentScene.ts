import { dismantleValue, getEquipDef } from '../data/equipment';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { EQUIP_SLOTS, EQUIP_SLOT_LABELS, type EquipSlot } from '../types';
import { buildCardPanel } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { buildEquipmentRow, levelUpLabel } from '../ui/EquipmentRow';
import { Button } from '../ui/Button';
import { itemIcon } from '../ui/ItemIcons';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { body, caption } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
type Filter = EquipSlot | 'all';

/** 装備: everything the player owns - what is in the bag and what the heroes wear -
 *  as a list. Each piece can be levelled up with 装備強化素材 or, from the bag,
 *  分解d into more of it. Putting a piece on a hero is done from that hero's
 *  detail screen. */
export class EquipmentScene extends InboxScene {
  protected readonly screenTitle = '装備';
  protected emptyText = '装備を持っていません。\n装備ガチャや放置報酬で手に入ります。';
  private filter: Filter = 'all';

  constructor() {
    super('Equipment');
  }

  init(): void {
    super.init();
    this.filter = 'all';
  }

  protected goBack(): void {
    this.scene.start('EnhanceHub');
  }

  protected buildCards(): InboxCard[] {
    const guard = () => this.scroll.isTap();
    const owned = EquipmentSystem.all(this.save).filter((o) => this.filter === 'all' || getEquipDef(o.item.defId)?.slot === this.filter);
    // Strongest first: rarity, then level.
    owned.sort((a, b) => (getEquipDef(b.item.defId)?.rarity ?? 0) - (getEquipDef(a.item.defId)?.rarity ?? 0) || b.item.level - a.item.level);

    const cards: InboxCard[] = [this.headerCard(guard)];
    this.emptyText = this.filter === 'all' ? '装備を持っていません。\n装備ガチャや放置報酬で手に入ります。' : `${EQUIP_SLOT_LABELS[this.filter]}を持っていません。`;
    const have = SaveSystem.getItem(this.save, 'equip_essence');
    for (const { item, owner } of owned) {
      const up = levelUpLabel(item, have);
      const actions = [
        { label: '強化', variant: 'gold' as const, subLabel: up.sub, enabled: up.enabled, onTap: () => this.levelUp(item.id) },
        owner
          ? { label: '分解不可', variant: 'wood' as const, subLabel: '装備中', enabled: false, onTap: () => {} }
          : { label: '分解', variant: 'wood' as const, subLabel: `+${dismantleValue(item)}`, onTap: () => this.askDismantle(item.id) },
      ];
      cards.push(buildEquipmentRow(this, item, { wornBy: owner?.name, actions, guard }));
    }
    return cards;
  }

  /** 装備強化素材 held, the slot filter, and 一括分解 of the low-rarity pieces in the bag. */
  private headerCard(guard: () => boolean): InboxCard {
    const height = 232;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(this.add.image(54, 46, itemIcon(this, 'equip_essence', 56)));
    container.add(caption(this, 100, 30, '装備強化素材', { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(body(this, 100, 62, SaveSystem.getItem(this.save, 'equip_essence').toLocaleString('ja-JP'), { fontSize: '34px', fontStyle: 'bold', color: '#ffb36b', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));

    const low = this.save.equipment.filter((i) => (getEquipDef(i.defId)?.rarity ?? 5) <= 2);
    const gain = low.reduce((sum, i) => sum + dismantleValue(i), 0);
    const bulk = new Button(this, CARD_WIDTH - 16 - 170, 52, 340, 70, '★1〜2を一括分解', () => this.askDismantleLow(), {
      variant: 'wood',
      fontSize: '24px',
      subLabel: low.length > 0 ? `${low.length}個 → 素材 +${gain.toLocaleString('ja-JP')}` : '対象がありません',
      guard,
    });
    bulk.setEnabled(low.length > 0);
    container.add(bulk);

    const filters: { key: Filter; label: string }[] = [{ key: 'all', label: '全て' }, ...EQUIP_SLOTS.map((s) => ({ key: s as Filter, label: EQUIP_SLOT_LABELS[s] }))];
    const w = (CARD_WIDTH - 28 - 12 * (filters.length - 1)) / filters.length;
    filters.forEach((f, i) => {
      container.add(
        new Button(this, 14 + w / 2 + i * (w + 12), 168, w, 60, f.label, () => this.setFilter(f.key), { variant: f.key === this.filter ? 'gold' : 'wood', fontSize: '24px', guard }),
      );
    });
    return { container, height };
  }

  private setFilter(filter: Filter): void {
    this.filter = filter;
    this.queueRender();
  }

  private levelUp(itemId: string): void {
    if (!EquipmentSystem.levelUp(this.save, itemId)) return;
    SaveSystem.save(this.save);
    const item = EquipmentSystem.find(this.save, itemId)?.item;
    if (item) showToast(this, `Lv.${item.level} になりました`);
    this.queueRender();
  }

  private askDismantle(itemId: string): void {
    const item = EquipmentSystem.find(this.save, itemId)?.item;
    const def = item ? getEquipDef(item.defId) : undefined;
    if (!item || !def) return;
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '分解しますか？',
      message: `${def.name}（Lv.${item.level}）を分解して\n装備強化素材 ${dismantleValue(item).toLocaleString('ja-JP')} にします。\nこの操作は元に戻せません。`,
      confirmLabel: '分解する',
      onConfirm: () => {
        const gained = EquipmentSystem.dismantle(this.save, itemId);
        if (gained === null) return;
        SaveSystem.save(this.save);
        showToast(this, `装備強化素材 +${gained.toLocaleString('ja-JP')}`);
        this.queueRender();
      },
    });
  }

  private askDismantleLow(): void {
    const low = this.save.equipment.filter((i) => (getEquipDef(i.defId)?.rarity ?? 5) <= 2);
    if (low.length === 0) return;
    const gain = low.reduce((sum, i) => sum + dismantleValue(i), 0);
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '一括分解しますか？',
      message: `バッグの★1〜2の装備 ${low.length}個を分解して\n装備強化素材 ${gain.toLocaleString('ja-JP')} にします。\n（装備中のものは対象外です）`,
      confirmLabel: '分解する',
      onConfirm: () => {
        const result = EquipmentSystem.dismantleUpTo(this.save, 2);
        SaveSystem.save(this.save);
        showToast(this, `${result.count}個を分解　素材 +${result.essence.toLocaleString('ja-JP')}`);
        this.queueRender();
      },
    });
  }
}
