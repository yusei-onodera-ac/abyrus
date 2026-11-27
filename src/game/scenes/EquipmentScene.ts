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
import { showRewardModal } from '../ui/RewardModal';
import { body, caption } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';
import { t } from '../i18n';
import { heroShortOf } from '../data/heroes';

const INK = '#1c130a';
type Filter = EquipSlot | 'all';

/** 装備: everything the player owns - what is in the bag and what the heroes wear -
 *  as a list. Each piece can be levelled up with 装備強化素材 or, from the bag,
 *  分解d into more of it. Putting a piece on a hero is done from that hero's
 *  detail screen. */
export class EquipmentScene extends InboxScene {
  protected get screenTitle(): string {
    return t('hero.gear.title');
  }
  // (set again by buildCards for the filter in use, before it is drawn)
  protected emptyText = '';
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
    this.emptyText = this.filter === 'all' ? t('hero.equipment.noGear') : t('hero.equipment.noSlotGear', { EQUIP_SLOT_LABELS: EQUIP_SLOT_LABELS[this.filter] });
    const have = SaveSystem.getItem(this.save, 'equip_essence');
    for (const { item, owner } of owned) {
      const up = levelUpLabel(item, have);
      const actions = [
        { label: t('hero.equipment.upgrade'), variant: 'gold' as const, subLabel: up.sub, enabled: up.enabled, onTap: () => this.levelUp(item.id) },
        owner
          ? { label: t('hero.equipment.dismantleLocked'), variant: 'wood' as const, subLabel: t('hero.equipment.equipped'), enabled: false, onTap: () => {} }
          : { label: t('hero.equipment.dismantle'), variant: 'wood' as const, subLabel: `+${dismantleValue(item)}`, onTap: () => this.askDismantle(item.id) },
      ];
      cards.push(buildEquipmentRow(this, item, { wornBy: owner ? heroShortOf(owner) : undefined, actions, guard }));
    }
    return cards;
  }

  /** 装備強化素材 held, the slot filter, and 一括分解 of the low-rarity pieces in the bag. */
  private headerCard(guard: () => boolean): InboxCard {
    const height = 232;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(this.add.image(54, 46, itemIcon(this, 'equip_essence', 56)));
    container.add(caption(this, 100, 30, t('hero.equipment.upgradeMaterial'), { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(body(this, 100, 62, SaveSystem.getItem(this.save, 'equip_essence').toLocaleString('ja-JP'), { fontSize: '34px', fontStyle: 'bold', color: '#ffb36b', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));

    const low = this.save.equipment.filter((i) => (getEquipDef(i.defId)?.rarity ?? 5) <= 2);
    const gain = low.reduce((sum, i) => sum + dismantleValue(i), 0);
    const bulk = new Button(this, CARD_WIDTH - 16 - 170, 52, 340, 70, t('hero.equipment.dismantleLow'), () => this.askDismantleLow(), {
      variant: 'wood',
      fontSize: '24px',
      subLabel: low.length > 0 ? t('hero.equipment.dismantleLowSub', { count: low.length, gain: gain.toLocaleString('ja-JP') }) : t('hero.equipment.dismantleNone'),
      guard,
    });
    bulk.setEnabled(low.length > 0);
    container.add(bulk);

    const filters: { key: Filter; label: string }[] = [{ key: 'all', label: t('hero.equipment.filterAll') }, ...EQUIP_SLOTS.map((s) => ({ key: s as Filter, label: EQUIP_SLOT_LABELS[s] }))];
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
    if (item) showToast(this, t('hero.equipment.toastLevelUp', { level: item.level }));
    this.queueRender();
  }

  private askDismantle(itemId: string): void {
    const item = EquipmentSystem.find(this.save, itemId)?.item;
    const def = item ? getEquipDef(item.defId) : undefined;
    if (!item || !def) return;
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: t('hero.equipment.dismantleTitle'),
      message: t('hero.equipment.dismantleMessage', { name: def.name, level: item.level, dismantleValue: dismantleValue(item).toLocaleString('ja-JP') }),
      confirmLabel: t('hero.equipment.dismantleConfirm'),
      onConfirm: () => {
        const gained = EquipmentSystem.dismantle(this.save, itemId);
        if (gained === null) return;
        SaveSystem.save(this.save);
        this.modal?.close();
        this.modal = showRewardModal(this, this.scroll, { title: t('hero.equipment.dismantled'), tiles: [{ kind: 'item', item: 'equip_essence', amount: `+${gained.toLocaleString('ja-JP')}` }], onClose: () => this.queueRender() });
      },
    });
  }

  private askDismantleLow(): void {
    const low = this.save.equipment.filter((i) => (getEquipDef(i.defId)?.rarity ?? 5) <= 2);
    if (low.length === 0) return;
    const gain = low.reduce((sum, i) => sum + dismantleValue(i), 0);
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: t('hero.equipment.dismantleLowTitle'),
      message: t('hero.equipment.dismantleLowMessage', { count: low.length, gain: gain.toLocaleString('ja-JP') }),
      confirmLabel: t('hero.equipment.dismantleConfirm'),
      onConfirm: () => {
        const result = EquipmentSystem.dismantleUpTo(this.save, 2);
        SaveSystem.save(this.save);
        this.modal?.close();
        this.modal = showRewardModal(this, this.scroll, { title: t('hero.equipment.dismantledCount', { count: result.count }), tiles: [{ kind: 'item', item: 'equip_essence', amount: `+${result.essence.toLocaleString('ja-JP')}` }], onClose: () => this.queueRender() });
      },
    });
  }
}
