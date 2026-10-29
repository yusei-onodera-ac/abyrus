import type Phaser from 'phaser';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { EXP_ITEMS, ITEMS } from '../data/items';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { expToNextLevel } from '../systems/LevelCurve';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { CLASS_LABELS, MAX_LEVEL, MAX_PHASE, RARITY_COLORS, hex, type HeroData } from '../types';
import { Button } from '../ui/Button';
import { buildCardPanel } from '../ui/CardParts';
import { HeroSlot } from '../ui/HeroSlot';
import { itemIcon, skillEssenceIcon, swordBadgeIcon } from '../ui/ItemIcons';
import { phaseMaterialIcon } from '../ui/Icons';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading, CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 14;
const ROW_H = 120;

/** 強化 tab: everything about making heroes stronger in one place - the materials
 *  held, a way into 装備, and every owned hero as a row with a 強化 button that
 *  goes straight to that hero's enhance screen (レベル / 経験値素材 / フェーズ / 合成). */
export class EnhanceHubScene extends InboxScene {
  protected readonly screenTitle = '強化';
  protected emptyText = '英雄がいません。';
  protected readonly navTab = 'enhance' as const;

  private generator!: CharacterGenerator;

  constructor() {
    super('EnhanceHub');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
  }

  protected buildCards(): InboxCard[] {
    const cards: InboxCard[] = [this.materialsCard(), this.equipmentCard()];
    const guard = () => this.scroll.isTap();
    const heroes = [...this.save.heroes].sort((a, b) => b.rarity - a.rarity || b.level - a.level || a.heroId.localeCompare(b.heroId));
    for (const hero of heroes) cards.push(this.heroRow(hero, guard));
    return cards;
  }

  /** What is held: the four 経験値素材, 装備強化素材, 技素 and フェーズ素材, as icon + count. */
  private materialsCard(): InboxCard {
    const entries: { icon: () => Phaser.GameObjects.Image; label: string; count: number }[] = [
      ...EXP_ITEMS.map((id) => ({ icon: () => this.add.image(0, 0, itemIcon(this, id, 48)), label: ITEMS[id].short, count: SaveSystem.getItem(this.save, id) })),
      { icon: () => this.add.image(0, 0, itemIcon(this, 'equip_essence', 48)), label: '強化素材', count: SaveSystem.getItem(this.save, 'equip_essence') },
      { icon: () => this.add.image(0, 0, skillEssenceIcon(this, 48)), label: '技素', count: this.save.skillEssence },
      { icon: () => this.add.image(0, 0, phaseMaterialIcon(this, 48)), label: 'フェーズ素材', count: this.save.phaseMaterials },
    ];
    const perRow = 4;
    const cellW = (CARD_WIDTH - PAD * 2) / perRow;
    const rows = Math.ceil(entries.length / perRow);
    const rowH = 104;
    const height = 64 + rows * rowH + 8;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 32, '所持している素材', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    entries.forEach((entry, i) => {
      const x = PAD + (i % perRow) * cellW + cellW / 2;
      const y = 64 + Math.floor(i / perRow) * rowH + 34;
      const icon = entry.icon();
      icon.setPosition(x, y);
      container.add(icon);
      const label = caption(this, x, y + 34, entry.label, { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
      if (label.width > cellW - 6) label.setScale((cellW - 6) / label.width);
      container.add(label);
      container.add(body(this, x, y + 56, entry.count.toLocaleString('ja-JP'), { fontSize: '21px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    });
    return { container, height };
  }

  /** The way into 装備: how many pieces are in the bag and how many are worn. */
  private equipmentCard(): InboxCard {
    const all = EquipmentSystem.all(this.save);
    const worn = all.filter((o) => o.owner).length;
    const height = 112;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(this.add.image(PAD + 44, height / 2, swordBadgeIcon(this, 72)));
    container.add(heading(this, PAD + 100, 36, '装備', { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 100, 78, `バッグ ${this.save.equipment.length}個　装備中 ${worn}個`, { fontSize: '20px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(new Button(this, CARD_WIDTH - PAD - 90, height / 2, 180, 70, '装備を見る', () => this.scene.start('Equipment'), { variant: 'gold', fontSize: '24px', guard: () => this.scroll.isTap() }));
    return { container, height };
  }

  private heroRow(hero: HeroData, guard: () => boolean): InboxCard {
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, ROW_H));
    container.add(new HeroSlot(this, PAD + 48, ROW_H / 2, { hero, generator: this.generator, onTap: () => this.scene.start('HeroDetail', { heroId: hero.id, from: 'EnhanceHub' }), guard }, 88));

    const x = PAD + 112;
    const atMax = hero.level >= MAX_LEVEL;
    const name = body(this, x, 24, hero.name, { fontSize: '24px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    if (name.width > 250) name.setScale(250 / name.width);
    container.add(name);
    container.add(this.add.text(x, 52, '★'.repeat(hero.rarity), { fontSize: '17px', color: hex(RARITY_COLORS[hero.rarity]), stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(caption(this, x + 92, 52, `${CLASS_LABELS[hero.heroClass]}　フェーズ ${hero.phase}/${MAX_PHASE}`, { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    container.add(body(this, x, 84, `Lv.${hero.level}`, { fontSize: '24px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const barX = x + 96;
    const barW = 200;
    const ratio = atMax ? 1 : Math.max(0, Math.min(1, hero.exp / expToNextLevel(hero.level)));
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(barX, 78, barW, 12, 6);
    bar.fillStyle(atMax ? 0xffd23f : 0xe0822a, 1);
    bar.fillRoundedRect(barX, 78, Math.max(8, barW * ratio), 12, 6);
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(barX, 78, barW, 12, 6);
    container.add(bar);
    container.add(caption(this, barX + barW + 8, 84, atMax ? 'MAX' : '', { fontSize: '15px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(caption(this, x, 106, `総合力 ${ProgressionSystem.computeHeroPower(hero).toString()}`, { fontSize: '15px', color: '#a89a78', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    container.add(new Button(this, CARD_WIDTH - PAD - 62, ROW_H / 2, 124, 70, '強化', () => this.scene.start('Enhance', { heroId: hero.id, from: 'EnhanceHub' }), { variant: 'gold', fontSize: '28px', guard }));
    return { container, height: ROW_H };
  }
}
