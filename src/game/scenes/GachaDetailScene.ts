import { CharacterGenerator } from '../characters/CharacterGenerator';
import { EQUIP_DEFS, describeEquip } from '../data/equipment';
import { getActiveGachaBanners, type GachaBannerEntry } from '../data/gachaBanners';
import { formatDateTime } from '../ui/format';
import { createHeroInstance } from '../data/heroes';
import { costOf, heroRatesOf, pickupNote, pityLeft, ratesOf, tenPullNote, type RateRow } from '../systems/GachaSystem';
import { RARITY_COLORS, hex, type Rarity } from '../types';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { HeroSlot } from '../ui/HeroSlot';
import { equipIcon } from '../ui/ItemIcons';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';
import { t } from '../i18n';

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
  protected get screenTitle(): string {
    return t('gacha.detail.title');
  }
  protected emptyText = '';
  private banner?: GachaBannerEntry;
  private generator!: CharacterGenerator;
  /** Where the list was scrolled to when a hero was opened, so coming back lands in the same place. */
  private restoreScroll = 0;

  constructor() {
    super('GachaDetail');
  }

  init(data: { bannerId?: string; scroll?: number }): void {
    super.init();
    this.banner = getActiveGachaBanners().find((b) => b.id === data?.bannerId);
    this.restoreScroll = data?.scroll ?? 0;
  }

  protected goBack(): void {
    this.scene.start('Gacha');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
    if (this.restoreScroll > 0) this.scroll.scrollTo(this.restoreScroll);
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
    lines.push({ text: t('gacha.detail.price', { costOf: costOf(banner, 1), costOf2: costOf(banner, 10) }), color: '#ffe9b8', size: 22, bold: true });
    if (banner.endsAt) {
      const end = formatDateTime(new Date(banner.endsAt).getTime());
      const period = banner.startsAt ? t('gacha.detail.periodRange', { start: formatDateTime(new Date(banner.startsAt).getTime()), end }) : t('gacha.detail.periodEnd', { end });
      lines.push({ text: period, color: '#cdbb94', size: 19 });
    }
    const pickup = pickupNote(banner);
    if (pickup) lines.push({ text: t('gacha.detail.rateUpLine', { pickup }), color: '#ff9ab8', size: 21, bold: true });
    if (banner.pity) {
      const { at, minRarity } = banner.pity;
      const left = pityLeft(this.save, banner) ?? at;
      lines.push({ text: banner.pity.pickup ? t('gacha.detail.pityRateUp', { at, minRarity }) : t('gacha.detail.pity', { at, minRarity }), color: '#ffd23f', size: 21, bold: true });
      lines.push({ text: t('gacha.detail.pityReset', { minRarity, left }), color: '#d8c49a', size: 19 });
    } else {
      lines.push({ text: t('gacha.detail.noPity'), color: '#cdbb94', size: 19 });
    }
    const ten = tenPullNote(banner);
    if (ten) lines.push({ text: t('gacha.detail.tenGuarantee', { ten }), color: '#ffd23f', size: 21, bold: true });
    if (banner.kind !== 'equipment') lines.push({ text: t('gacha.detail.previewHint'), color: '#9fe39f', size: 19, bold: true });
    if (banner.kind !== 'equipment') lines.push({ text: t('gacha.detail.duplicateNote'), color: '#cdbb94', size: 18 });

    const texts = lines.map((l) => wrappedText(this, PAD + 6, 0, l.text, CARD_WIDTH - PAD * 2 - 12, { fontSize: `${l.size}px`, color: l.color, fontStyle: l.bold ? 'bold' : 'normal' }));
    let y = 64;
    for (const text of texts) {
      text.setY(y);
      y += text.height + 8;
    }
    const height = y + PAD;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 32, banner.title, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    texts.forEach((text) => container.add(text));
    return { container, height };
  }

  // --- the rate table ---------------------------------------------------------------------------

  private ratesCard(rates: RateRow[]): InboxCard {
    const rowH = 50;
    const height = 70 + rates.length * rowH + PAD;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 34, t('gacha.detail.rates'), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
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
    // Each character with its own rate (the ピックアップ first, and higher: see heroRatesOf).
    const heroes = heroRatesOf(banner)
      .filter((r) => r.def.rarity === row.rarity)
      .sort((a, b) => Number(b.pickup) - Number(a.pickup));
    const rows = Math.ceil(heroes.length / COLS);
    const gapX = (CARD_WIDTH - PAD * 2 - COLS * SLOT) / (COLS - 1);
    const height = 70 + rows * ROW_H + PAD;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    this.addRarityHeader(container, row.rarity, t('gacha.detail.heroCount', { count: heroes.length }));
    heroes.forEach(({ def, rate, pickup }, i) => {
      const x = PAD + SLOT / 2 + (i % COLS) * (SLOT + gapX);
      const top = 70 + Math.floor(i / COLS) * ROW_H;
      const hero = createHeroInstance(def.id, `detail-${def.id}`);
      const open = (): void => this.openPreview(def.id);
      container.add(new HeroSlot(this, x, top + SLOT / 2, { hero, generator: this.generator, hideLevel: true, onTap: open, guard: () => this.scroll.isTap() }, SLOT));
      if (pickup) {
        const chip = buildChip(this, x - SLOT / 2 + 4, top + 12, t('gacha.detail.rateUpChip'), { fill: 0xc23232, color: '#fff0d0', fontSize: 13 });
        container.add(chip.container);
      }
      this.addTileText(container, x, top + SLOT, def.name, percent(rate), pickup);
    });
    return { container, height };
  }

  /** The character at its best (level, phase and skills all maxed); 戻る returns to this list where it was. */
  private openPreview(heroId: string): void {
    if (!this.banner) return;
    this.scene.start('HeroDetail', { heroId, preview: true, from: 'GachaDetail', fromData: { bannerId: this.banner.id, scroll: this.scroll.getScroll() } });
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
    this.addRarityHeader(container, row.rarity, t('gacha.detail.gearCount', { count: pieces.length }));
    void banner;
    pieces.forEach((def, i) => {
      const x = PAD + SLOT / 2 + (i % COLS) * (SLOT + gapX);
      const top = 70 + Math.floor(i / COLS) * ROW_H;
      container.add(this.add.image(x, top + SLOT / 2 - 6, equipIcon(this, def.glyph, def.rarity, 84, def.id)));
      container.add(caption(this, x, top + SLOT - 4, describeEquip({ id: 'x', defId: def.id, level: 1 }), { fontSize: '14px', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      this.addTileText(container, x, top + SLOT, def.name, percent(each));
    });
    return { container, height };
  }

  private addRarityHeader(container: Phaser.GameObjects.Container, rarity: Rarity, countText: string): void {
    container.add(this.add.text(PAD + 6, 34, '★'.repeat(rarity), { fontSize: '26px', color: hex(RARITY_COLORS[rarity]), stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, CARD_WIDTH - PAD - 6, 34, countText, { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
  }

  /** The name and the rate under a tile, each shrunk to fit its width. */
  private addTileText(container: Phaser.GameObjects.Container, x: number, tileBottom: number, name: string, rate: string, pickup = false): void {
    const nameText = caption(this, x, tileBottom + NAME_H / 2 + 2, name, { fontSize: '16px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
    if (nameText.width > SLOT) nameText.setScale(SLOT / nameText.width);
    const rateText = body(this, x, tileBottom + NAME_H + RATE_H / 2 + 2, rate, { fontSize: '19px', fontStyle: 'bold', color: pickup ? '#ff9ab8' : '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
    container.add([nameText, rateText]);
  }
}
