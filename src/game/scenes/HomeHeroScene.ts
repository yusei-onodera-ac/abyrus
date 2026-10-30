import { CharacterGenerator } from '../characters/CharacterGenerator';
import { homeLinesFor } from '../data/homeLines';
import { SaveSystem } from '../systems/SaveSystem';
import { CLASS_LABELS, RARITY_COLORS, hex, type HeroData } from '../types';
import { buildCardPanel } from '../ui/CardParts';
import { HeroSlot } from '../ui/HeroSlot';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { body, caption, heading } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 14;
const COLS = 5;
const SLOT = 108;

/** ホームキャラ: who stands on the Home screen (and talks when tapped). Every hero the
 *  player owns is listed; tapping one makes it the home character - there is always
 *  exactly one, so nothing here un-picks. 戻る goes back to Home. */
export class HomeHeroScene extends InboxScene {
  protected readonly screenTitle = 'ホームキャラ';
  protected emptyText = '';
  private generator!: CharacterGenerator;

  constructor() {
    super('HomeHero');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
  }

  protected buildCards(): InboxCard[] {
    const chosen = SaveSystem.getHomeHero(this.save);
    const cards: InboxCard[] = [];
    if (chosen) cards.push(this.currentCard(chosen));
    cards.push(this.listCard(chosen));
    return cards;
  }

  /** The hero standing on Home now, with a line they might say. */
  private currentCard(hero: HeroData): InboxCard {
    const height = 168;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, true));
    container.add(new HeroSlot(this, PAD + 66, height / 2, { hero, generator: this.generator }, 132));
    const x = PAD + 132 + 20;
    container.add(caption(this, x, 28, 'いまホームにいるキャラ', { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(body(this, x, 66, hero.name, { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(this.add.text(x, 104, '★'.repeat(hero.rarity), { fontSize: '20px', color: hex(RARITY_COLORS[hero.rarity]), stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(caption(this, x + 110, 104, `${CLASS_LABELS[hero.heroClass]}　Lv.${hero.level}`, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const line = homeLinesFor(hero.heroId, hero.heroClass)[0]?.text ?? '';
    const said = caption(this, x, 140, `「${line}」`, { fontSize: '18px', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    if (said.width > CARD_WIDTH - x - PAD) said.setScale((CARD_WIDTH - x - PAD) / said.width);
    container.add(said);
    return { container, height };
  }

  /** Everyone owned, best first (copies of one character together); tap to choose. */
  private listCard(chosen: HeroData | undefined): InboxCard {
    const guard = () => this.scroll.isTap();
    const best = new Map<string, number>();
    for (const h of this.save.heroes) best.set(h.heroId, Math.max(best.get(h.heroId) ?? 0, h.level));
    const heroes = [...this.save.heroes].sort((a, b) => b.rarity - a.rarity || (best.get(b.heroId) ?? 0) - (best.get(a.heroId) ?? 0) || a.heroId.localeCompare(b.heroId) || b.level - a.level);

    const innerW = CARD_WIDTH - PAD * 2;
    const gapX = (innerW - COLS * SLOT) / (COLS - 1);
    const rows = Math.ceil(heroes.length / COLS);
    const height = 64 + rows * SLOT + Math.max(0, rows - 1) * 14 + PAD + 8;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 32, 'キャラを選ぶ', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, CARD_WIDTH - PAD - 4, 32, 'タップでホームに表示', { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    heroes.forEach((hero, i) => {
      const x = PAD + SLOT / 2 + (i % COLS) * (SLOT + gapX);
      const y = 64 + SLOT / 2 + Math.floor(i / COLS) * (SLOT + 14);
      container.add(
        new HeroSlot(this, x, y, { hero, generator: this.generator, selected: chosen?.id === hero.id, onTap: () => this.choose(hero), guard }),
      );
    });
    return { container, height };
  }

  private choose(hero: HeroData): void {
    if (SaveSystem.getHomeHero(this.save)?.id === hero.id) return;
    SaveSystem.setHomeHero(this.save, hero.id);
    SaveSystem.save(this.save);
    showToast(this, `${hero.name} をホームに設定しました`);
    this.queueRender();
  }
}
