import { CharacterGenerator } from '../characters/CharacterGenerator';
import { EQUIP_DEFS, describeEquip } from '../data/equipment';
import { getActiveGachaBanners, formatGachaEnd, type GachaBannerEntry } from '../data/gachaBanners';
import { createHeroInstance } from '../data/heroes';
import { costOf, heroPoolOf, pityLeft, ratesOf, type RateRow } from '../systems/GachaSystem';
import { RARITY_COLORS, hex, type Rarity } from '../types';
import { buildCardPanel, wrappedText } from '../ui/CardParts';
import { HeroSlot } from '../ui/HeroSlot';
import { equipIcon } from '../ui/ItemIcons';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 14;
const COLS = 5;
const SLOT = 108;
const NAME_H = 22;
const RATE_H = 24;
const ROW_H = SLOT + NAME_H + RATE_H + 10;

/** "0.500%" - small rates keep their decimals; the tiny per-character ones need three. */
function percent(rate: number): string {
  return `${(rate * 100).toFixed(rate < 0.01 ? 3 : rate < 0.1 ? 2 : 1)}%`;
}

/** ガチャ詳細: everything a player may want to know before pulling - the price, the 天井,
 *  each rarity's rate, and every character (or piece of equipment) that can come out with
 *  its own rate. Built from the same banner entry the pull itself rolls with. */
export class GachaDetailScene extends InboxScene {
  protected readonly screenTitle = 'ガチャ詳細';
  protected emptyText = '';
  private banner?: GachaBannerEntry;
  private generator!: CharacterGenerator;

  constructor() {
    super('GachaDetail');
  }

  init(data: { bannerId?: string }): void {
    super.init();
    this.banner = getActiveGachaBanners().find((b) => b.id === data?.bannerId);
  }

  protected goBack(): void {
    this.scene.start('Gacha');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
  }

  protected buildCards(): InboxCard[] {
    const banner = this.banner;
    if (!banner) {
      this.time.delayedCall(0, () => this.scene.start('Gacha'));
      return [];
    }
    const rates = ratesOf(banner);
    const cards: InboxCard[] = [this.summaryCard(banner), this.ratesCard(rates)];
    for (const row of rates) cards.push(banner.kind === 'equipment' ? this.equipCard(banner, row) : this.heroCard(banner, row));
    return cards;
  }

  // --- summary: price, period, 天井 -----------------------------------------------------------

  private summaryCard(banner: GachaBannerEntry): InboxCard {
    const lines: { text: string; color: string; size: number; bold?: boolean }[] = [];
    lines.push({ text: banner.description, color: '#f5e6c8', size: 21 });
    lines.push({ text: `1回 ${costOf(banner, 1)} 魔晶石　／　10連 ${costOf(banner, 10)} 魔晶石`, color: '#ffe9b8', size: 22, bold: true });
    if (banner.endsAt) lines.push({ text: `開催期間：${formatGachaEnd(banner.endsAt)}`, color: '#cdbb94', size: 19 });
    if (banner.pity) {
      const { at, minRarity } = banner.pity;
      const left = pityLeft(this.save, banner) ?? at;
      lines.push({ text: `【天井】${at}回目のガチャで、★${minRarity}以上が必ず1体出ます。`, color: '#ffd23f', size: 21, bold: true });
      lines.push({ text: `★${minRarity}以上が出ると、回数は0に戻ります。（現在 あと${left}回で確定）`, color: '#d8c49a', size: 19 });
    } else {
      lines.push({ text: 'このガチャに天井はありません。', color: '#cdbb94', size: 19 });
    }
    if (banner.kind !== 'equipment') lines.push({ text: 'すでに持っているキャラは、合成用の素材として手に入ります。フェーズの上限を超える分は、ゴールドになります。', color: '#cdbb94', size: 18 });

    const texts = lines.map((l) => wrappedText(this, PAD + 6, 0, l.text, CARD_WIDTH - PAD * 2 - 12, { fontSize: `${l.size}px`, color: l.color, fontStyle: l.bold ? 'bold' : 'normal' }));
    let y = 64;
    for (const t of texts) {
      t.setY(y);
      y += t.height + 8;
    }
    const height = y + PAD;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 32, banner.title, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    texts.forEach((t) => container.add(t));
    return { container, height };
  }

  // --- the rate table ---------------------------------------------------------------------------

  private ratesCard(rates: RateRow[]): InboxCard {
    const rowH = 50;
    const height = 70 + rates.length * rowH + PAD;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 34, '排出率', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    rates.forEach((row, i) => {
      const y = 70 + i * rowH + rowH / 2;
      container.add(this.add.text(PAD + 30, y, '★'.repeat(row.rarity), { fontSize: '24px', color: hex(RARITY_COLORS[row.rarity]), stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      container.add(body(this, CARD_WIDTH - PAD - 30, y, percent(row.rate), { fontSize: '27px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
    });
    return { container, height };
  }

  // --- who can come out ---------------------------------------------------------------------------

  /** One rarity's characters, each with its own rate (the rarity's rate shared evenly). */
  private heroCard(banner: GachaBannerEntry, row: RateRow): InboxCard {
    const heroes = heroPoolOf(banner).filter((h) => h.rarity === row.rarity);
    const each = row.rate / Math.max(1, heroes.length);
    const rows = Math.ceil(heroes.length / COLS);
    const gapX = (CARD_WIDTH - PAD * 2 - COLS * SLOT) / (COLS - 1);
    const height = 70 + rows * ROW_H + PAD;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    this.addRarityHeader(container, row.rarity, heroes.length, '体');
    heroes.forEach((def, i) => {
      const x = PAD + SLOT / 2 + (i % COLS) * (SLOT + gapX);
      const top = 70 + Math.floor(i / COLS) * ROW_H;
      const hero = createHeroInstance(def.id, `detail-${def.id}`);
      container.add(new HeroSlot(this, x, top + SLOT / 2, { hero, generator: this.generator, hideLevel: true }, SLOT));
      this.addTileText(container, x, top + SLOT, def.name, percent(each));
    });
    return { container, height };
  }

  /** One rarity's pieces of equipment: icon, name, effect at level 1 and the rate. */
  private equipCard(banner: GachaBannerEntry, row: RateRow): InboxCard {
    const pieces = EQUIP_DEFS.filter((d) => d.rarity === row.rarity);
    const each = row.rate / Math.max(1, pieces.length);
    const rows = Math.ceil(pieces.length / COLS);
    const gapX = (CARD_WIDTH - PAD * 2 - COLS * SLOT) / (COLS - 1);
    const height = 70 + rows * ROW_H + PAD;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    this.addRarityHeader(container, row.rarity, pieces.length, '種');
    void banner;
    pieces.forEach((def, i) => {
      const x = PAD + SLOT / 2 + (i % COLS) * (SLOT + gapX);
      const top = 70 + Math.floor(i / COLS) * ROW_H;
      container.add(this.add.image(x, top + SLOT / 2 - 6, equipIcon(this, def.glyph, def.rarity, 84)));
      container.add(caption(this, x, top + SLOT - 4, describeEquip({ id: 'x', defId: def.id, level: 1 }), { fontSize: '14px', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      this.addTileText(container, x, top + SLOT, def.name, percent(each));
    });
    return { container, height };
  }

  private addRarityHeader(container: Phaser.GameObjects.Container, rarity: Rarity, count: number, unit: string): void {
    container.add(this.add.text(PAD + 6, 34, '★'.repeat(rarity), { fontSize: '26px', color: hex(RARITY_COLORS[rarity]), stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, CARD_WIDTH - PAD - 6, 34, `${count}${unit}`, { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
  }

  /** The name and the rate under a tile, each shrunk to fit its width. */
  private addTileText(container: Phaser.GameObjects.Container, x: number, tileBottom: number, name: string, rate: string): void {
    const nameText = caption(this, x, tileBottom + NAME_H / 2 + 2, name, { fontSize: '16px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
    if (nameText.width > SLOT) nameText.setScale(SLOT / nameText.width);
    const rateText = body(this, x, tileBottom + NAME_H + RATE_H / 2 + 2, rate, { fontSize: '19px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
    container.add([nameText, rateText]);
  }
}
