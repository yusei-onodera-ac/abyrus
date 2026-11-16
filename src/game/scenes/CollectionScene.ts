import type Phaser from 'phaser';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { HERO_ROSTER, createHeroInstance } from '../data/heroes';
import type { CollectionMilestone } from '../data/collection';
import type { Reward } from '../data/rewards';
import { ITEMS } from '../data/items';
import { CollectionSystem } from '../systems/CollectionSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { RARITY_COLORS, hex, type HeroData, type Rarity } from '../types';
import { Button } from '../ui/Button';
import { buildCardPanel } from '../ui/CardParts';
import { HeroSlot, HERO_SLOT_SIZE } from '../ui/HeroSlot';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForGranted } from '../ui/RewardTiles';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading, CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 14;
const COLS = 5;
const NAME_H = 30;

const REWARD_NAME: Record<string, string> = { gems: '魔晶石', gold: 'ゴールド', stamina: 'スタミナ', phaseMaterials: 'フェーズ素材', skillEssence: '技素' };

function rewardText(r: Reward): string {
  if (r.type === 'equipment') return `装備★${r.rarity} ×${r.amount}`;
  const name = r.type === 'item' ? ITEMS[r.item].short : REWARD_NAME[r.type];
  return `${name} ${r.amount.toLocaleString('ja-JP')}`;
}

/** 図鑑: every character of the game in rows by rarity - the ones held shown, the rest as black silhouettes - and the
 *  rewards for how many are held. Tapping a held character opens it; tapping a silhouette shows what it becomes at its best. */
export class CollectionScene extends InboxScene {
  protected readonly screenTitle = '図鑑';
  protected emptyText = '';
  protected readonly navTab = null;

  private generator!: CharacterGenerator;

  constructor() {
    super('Collection');
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
  }

  protected goBack(): void {
    this.scene.start('Roster');
  }

  protected buildCards(): InboxCard[] {
    const guard = () => this.scroll.isTap();
    const cards: InboxCard[] = [this.summaryCard(), this.rewardsCard(guard)];
    for (const group of CollectionSystem.byRarity(this.save)) cards.push(this.rarityCard(group.rarity, group.owned, group.total, guard));
    return cards;
  }

  // ------------------------------------------------------------ summary --

  private summaryCard(): InboxCard {
    const height = 150;
    const owned = CollectionSystem.owned(this.save);
    const total = CollectionSystem.total();
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 34, '集めたキャラ', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(body(this, CARD_WIDTH - PAD - 6, 34, `${owned} / ${total}体`, { fontSize: '30px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 5 }).setOrigin(1, 0.5));
    const barW = CARD_WIDTH - PAD * 2 - 12;
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(PAD + 6, 62, barW, 18, 9);
    bar.fillStyle(owned >= total ? 0xffd23f : 0xe0822a, 1);
    bar.fillRoundedRect(PAD + 6, 62, Math.max(12, (barW * owned) / Math.max(1, total)), 18, 9);
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(PAD + 6, 62, barW, 18, 9);
    container.add(bar);
    // ★ by ★
    const groups = CollectionSystem.byRarity(this.save);
    const cell = (CARD_WIDTH - PAD * 2) / groups.length;
    groups.forEach((g, i) => {
      const x = PAD + cell * i + cell / 2;
      container.add(this.add.text(x, 104, `★${g.rarity}`, { fontSize: '20px', fontStyle: 'bold', color: hex(RARITY_COLORS[g.rarity]), stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      container.add(caption(this, x, 130, `${g.owned}/${g.total}`, { fontSize: '19px', fontStyle: 'bold', color: g.owned >= g.total ? '#ffd23f' : '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    });
    return { container, height };
  }

  // ------------------------------------------------------------ rewards --

  private rewardsCard(guard: () => boolean): InboxCard {
    const milestones = CollectionSystem.milestones();
    const rowH = 92;
    const head = 56;
    const height = head + milestones.length * rowH + 8;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, CollectionSystem.claimable(this.save) > 0));
    container.add(heading(this, PAD + 6, head / 2, '集めた数の報酬', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    milestones.forEach((m, i) => this.milestoneRow(container, m, head + i * rowH, rowH, guard));
    return { container, height };
  }

  private milestoneRow(container: Phaser.GameObjects.Container, m: CollectionMilestone, top: number, h: number, guard: () => boolean): void {
    const state = CollectionSystem.state(this.save, m);
    const cy = top + h / 2;
    const all = m.count >= CollectionSystem.total();
    container.add(this.add.rectangle(CARD_WIDTH / 2, top, CARD_WIDTH - PAD * 2, 2, CHROME.brassDark, 0.6));
    container.add(body(this, PAD + 6, cy - 14, all ? `全${m.count}体` : `${m.count}体`, { fontSize: '27px', fontStyle: 'bold', color: state === 'claimed' ? '#8a7a5a' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, cy + 20, all ? 'コンプリート' : `あと ${Math.max(0, m.count - CollectionSystem.owned(this.save))}体`, { fontSize: '17px', color: state === 'locked' ? '#cdbb94' : '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const text = m.rewards.map(rewardText).join('\n');
    const label = body(this, 150, cy, text, { fontSize: '19px', fontStyle: 'bold', color: state === 'claimed' ? '#8a7a5a' : '#fff4dc', stroke: INK, strokeThickness: 3, lineSpacing: 2 }).setOrigin(0, 0.5);
    container.add(label);
    const bw = 150;
    const bx = CARD_WIDTH - PAD - bw / 2 - 4;
    if (state === 'claimable') {
      container.add(new Button(this, bx, cy, bw, 62, '受け取る', () => this.claim(m), { variant: 'gold', fontSize: '24px', guard }));
    } else {
      const b = new Button(this, bx, cy, bw, 62, state === 'claimed' ? '受け取り済み' : '未達成', () => undefined, { variant: 'wood', fontSize: state === 'claimed' ? '19px' : '22px' });
      b.setEnabled(false);
      container.add(b);
    }
  }

  private claim(m: CollectionMilestone): void {
    const granted = CollectionSystem.claim(this.save, m.count);
    if (!granted) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title: `${m.count >= CollectionSystem.total() ? '図鑑コンプリート' : `${m.count}体を集めた`}報酬`, tiles: tilesForGranted(granted), onClose: () => this.queueRender() });
  }

  // ------------------------------------------------------------ the book --

  /** One rarity: its heading and every character of it, 5 to a row. */
  private rarityCard(rarity: Rarity, owned: number, total: number, guard: () => boolean): InboxCard {
    const defs = HERO_ROSTER.filter((d) => d.rarity === rarity);
    const rows = Math.ceil(defs.length / COLS);
    const size = HERO_SLOT_SIZE;
    const head = 56;
    const rowH = size + NAME_H + 14;
    const height = head + rows * rowH + 8;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(this.add.text(PAD + 6, head / 2, `★${rarity}`, { fontSize: '28px', fontStyle: 'bold', color: hex(RARITY_COLORS[rarity]), stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(body(this, CARD_WIDTH - PAD - 6, head / 2, `${owned} / ${total}`, { fontSize: '24px', fontStyle: 'bold', color: owned >= total ? '#ffd23f' : '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));

    const innerW = CARD_WIDTH - PAD * 2;
    const gapX = (innerW - COLS * size) / (COLS - 1);
    // The best copy of each character held (a copy of it is what opens).
    const best = new Map<string, HeroData>();
    for (const h of this.save.heroes) {
      const cur = best.get(h.heroId);
      if (!cur || h.level > cur.level) best.set(h.heroId, h);
    }
    defs.forEach((def, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = PAD + size / 2 + col * (size + gapX);
      const cy = head + row * rowH + size / 2;
      const have = best.get(def.id);
      const hero = have ?? createHeroInstance(def.id, `book-${def.id}`, 1);
      container.add(
        new HeroSlot(
          this,
          cx,
          cy,
          {
            hero,
            generator: this.generator,
            hideLevel: !have,
            silhouette: !have,
            guard,
            onTap: () => (have ? this.scene.start('HeroDetail', { heroId: have.id, from: 'Collection' }) : this.scene.start('HeroDetail', { heroId: def.id, preview: true, from: 'Collection' })),
          },
          size,
        ),
      );
      const name = caption(this, cx, cy + size / 2 + 18, have ? def.name : '？？？', { fontSize: '15px', fontStyle: 'bold', color: have ? '#f5e6c8' : '#6f6552', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
      const room = size + gapX - 6;
      if (name.width > room) name.setScale(room / name.width);
      container.add(name);
    });
    return { container, height };
  }
}
