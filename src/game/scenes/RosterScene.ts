import Phaser from 'phaser';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { MAX_DECKS, DECK_NAME_MAX, autoFormation, defaultDeckName } from '../systems/DeckSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { ResourceBar } from '../ui/ResourceBar';
import { BottomNavBar } from '../ui/BottomNavBar';
import { BackButton } from '../ui/BackButton';
import { Button } from '../ui/Button';
import { HeroSlot, HERO_SLOT_SIZE } from '../ui/HeroSlot';
import type { ScrollView } from '../ui/ScrollView';
import { buildTitlePlate, buildFramedScrollView, CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { createPanel, createDivider } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { body, caption, heading, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { openModal, type ModalHandle } from '../ui/Modal';
import { openConfirm, openTextPrompt } from '../ui/Dialogs';
import { enter, enterStagger } from '../ui/Transitions';
import type { HeroData, Row } from '../types';

interface RosterSceneData {
  /** Hero id to arrive with, ready to drop into a slot of the deck in use -
   *  e.g. after returning from HeroDetailScene via its "編成にセット" button. */
  preSelect?: string;
}

interface SlotRef {
  row: Row;
  slot: number;
}

/** Deck order: three front-row slots, then two back-row. */
const DECK_SLOTS: SlotRef[] = [
  { row: 'front', slot: 0 },
  { row: 'front', slot: 1 },
  { row: 'front', slot: 2 },
  { row: 'back', slot: 0 },
  { row: 'back', slot: 1 },
];

const PAD = 12;
const INK = '#1c130a';
const CARD_GAP = 14;
const GRID_COLS = 5;
const GRID_GAP_Y = 14;
const DECK_RED = 0x7a1717;
const DECK_RED_IDLE = 0x4a2323;
const HEADER_FILL = 0x150e07;
const ACTION_H = 46;

type Card = { container: Phaser.GameObjects.Container; height: number };

/** キャラ編成: up to five named decks (3 front + 2 back each), one of them
 *  "in use" - that's the one stage battles and Infinite Mode field - plus
 *  every owned hero. Two views: the list of all decks, and an edit view for
 *  one deck where taps on heroes build the formation. Top/bottom bars are the
 *  shared HUD pieces; this scene only owns what's between them. */
export class RosterScene extends Phaser.Scene {
  private generator!: CharacterGenerator;
  private save!: SaveData;
  private scroll!: ScrollView;
  /** Deck being edited, or null while showing the list of all decks. */
  private editingDeck: number | null = null;
  /** Slot of the edited deck the next hero tap will fill. */
  private targetSlot: SlotRef | null = null;
  /** Hero waiting for the player to pick a slot for it. */
  private armedHeroId: string | null = null;
  private renderQueued = false;
  private modal?: ModalHandle;
  /** Which view the last render drew, so switching views resets the scroll. */
  private lastView: 'list' | 'edit' | null = null;

  constructor() {
    super('Roster');
  }

  init(data: RosterSceneData): void {
    const save: SaveData = this.game.registry.get('save');
    this.armedHeroId = data?.preSelect ?? null;
    this.editingDeck = data?.preSelect ? save.activeDeck : null;
    this.targetSlot = null;
    this.renderQueued = false;
    this.modal = undefined;
    this.lastView = null;
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    this.save = this.game.registry.get('save');
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'roster');

    const resourceBar = new ResourceBar(this, 0, 0, 720);
    resourceBar.update(this.save);
    enter(this, resourceBar, { dy: -20, duration: 280 });

    buildTitlePlate(this, 'キャラ編成');
    this.scroll = buildFramedScrollView(this);
    this.render(true);
    new BottomNavBar(this, 720, 1280, null);
    // Two levels deep while editing a deck: back first returns to the deck list
    // (everything is already saved), then to Home.
    const back = new BackButton(this, () => (this.editingDeck !== null ? this.finishEditing() : this.scene.start('Home')));
    enter(this, back, { dx: -40, dy: 0, duration: 300, delay: 250 });
  }

  /** Rebuilds the whole list in place, keeping the scroll position. Done from
   *  a tap handler's own call stack it would destroy the very zone that is
   *  mid-dispatch, so taps go through queueRender() instead. */
  private render(firstTime = false): void {
    const content = this.scroll.content;
    const view = this.editingDeck === null ? 'list' : 'edit';
    const scrolled = view === this.lastView ? this.scroll.getScroll() : 0;
    this.lastView = view;
    this.tweens.killTweensOf(content.list);
    content.removeAll(true);

    const left = (SCREEN_VIEW.w - CARD_WIDTH) / 2;
    const cards: Phaser.GameObjects.Container[] = [];
    let y = left;
    const stack = (card: Card): void => {
      card.container.setPosition(left, y);
      cards.push(card.container);
      y += card.height + CARD_GAP;
    };

    if (this.editingDeck !== null) {
      stack(this.buildDeckCard(this.editingDeck));
    } else {
      this.save.decks.forEach((_, i) => stack(this.buildDeckCard(i)));
      stack(this.buildAddCard());
    }
    stack(this.buildRosterCard());

    content.add(cards);
    this.scroll.setContentHeight(y - CARD_GAP + left);
    this.scroll.scrollTo(scrolled);
    if (firstTime) enterStagger(this, cards, { dy: 24, duration: 320, delay: 160, stagger: 60 });
  }

  private queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    this.time.delayedCall(0, () => {
      this.renderQueued = false;
      this.render();
    });
  }

  // --- deck cards --------------------------------------------------------

  private deckHeroes(index: number): HeroData[] {
    const { front, back } = SaveSystem.getDeckHeroes(this.save, index);
    return [...front, ...back];
  }

  private heroAt(index: number, ref: SlotRef): HeroData | undefined {
    const id = this.save.decks[index][ref.row][ref.slot];
    return id ? SaveSystem.getHero(this.save, id) : undefined;
  }

  /** One deck: name bar with 総合力 and 編集/完了, the five slots, and a row
   *  of actions underneath. Shared by the list and edit views - the edit
   *  view just adds the × badges, a hint line, and heavier actions. */
  private buildDeckCard(index: number): Card {
    const deck = this.save.decks[index];
    const editing = this.editingDeck === index;
    const isActive = this.save.activeDeck === index;
    const container = this.add.container(0, 0);
    const w = CARD_WIDTH;
    const innerW = w - PAD * 2;
    const guard = () => this.scroll.isTap();
    let y = PAD;

    // Name bar: deck name left (★ marks the deck in use), 総合力 right.
    const barH = 54;
    const editW = 136;
    const barW = innerW - editW - 10;
    const bar = this.add.graphics();
    bar.fillStyle(isActive ? DECK_RED : DECK_RED_IDLE, 1);
    bar.fillRoundedRect(PAD, y, barW, barH, 8);
    bar.fillStyle(0xffffff, 0.1);
    bar.fillRoundedRect(PAD + 3, y + 3, barW - 6, barH / 2 - 3, { tl: 6, tr: 6, bl: 2, br: 2 });
    bar.lineStyle(2, CHROME.brass, isActive ? 0.95 : 0.6);
    bar.strokeRoundedRect(PAD, y, barW, barH, 8);
    container.add(bar);

    const name = body(this, PAD + 18, y + barH / 2, `${isActive ? '★' : ''}${deck.name}`, { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    const power = body(this, PAD + barW - 16, y + barH / 2, `総合力：${ProgressionSystem.computeDeckTotals(this.deckHeroes(index)).power.toString()}`, {
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#fff4dc',
      stroke: INK,
      strokeThickness: 4,
    }).setOrigin(1, 0.5);
    // A very large number must not run into the deck name.
    const powerRoom = barW - 18 - name.width - 20 - 16;
    if (power.width > powerRoom) power.setScale(powerRoom / power.width);
    container.add([name, power]);

    container.add(
      new Button(this, PAD + barW + 10 + editW / 2, y + barH / 2, editW, barH, editing ? '完了' : '編集', () => (editing ? this.finishEditing() : this.startEditing(index)), {
        variant: editing ? 'gold' : 'wood',
        fontSize: '26px',
        guard,
      }),
    );
    y += barH + 12;

    // Slots: front group, wider gap, back group.
    const size = HERO_SLOT_SIZE;
    const gap = 10;
    const groupGap = 28;
    const rowW = size * DECK_SLOTS.length + gap * 3 + groupGap;
    const xs: number[] = [];
    let x = (w - rowW) / 2;
    DECK_SLOTS.forEach((_, i) => {
      xs.push(x + size / 2);
      x += size + (i === 2 ? groupGap : gap);
    });

    const captionStyle = { fontSize: '16px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 };
    container.add(caption(this, xs[0] - size / 2, y + 10, '前衛', captionStyle).setOrigin(0, 0.5));
    container.add(caption(this, xs[3] - size / 2, y + 10, '後衛', captionStyle).setOrigin(0, 0.5));
    y += 24;

    const slotY = y + size / 2;
    DECK_SLOTS.forEach((ref, i) => {
      const hero = this.heroAt(index, ref);
      const selected = editing && this.targetSlot?.row === ref.row && this.targetSlot.slot === ref.slot;
      container.add(new HeroSlot(this, xs[i], slotY, { hero, generator: this.generator, selected, onTap: () => this.onDeckSlotTap(index, ref), guard }));
      if (editing && hero) container.add(this.buildRemoveBadge(xs[i] + size / 2 - 4, slotY - size / 2 + 4, ref, guard));
    });
    y += size + 12;

    if (editing) {
      container.add(caption(this, w / 2, y + 8, this.editHint(), { fontSize: '17px', color: '#ffe9b8', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
      y += 30;
    }

    // Actions.
    const actionY = y + ACTION_H / 2;
    if (editing) {
      const count = 4;
      const btnGap = 8;
      const btnW = (innerW - btnGap * (count - 1)) / count;
      const at = (i: number) => PAD + btnW / 2 + i * (btnW + btnGap);
      const opts = (variant: 'wood' | 'gold' | 'danger') => ({ variant, fontSize: '20px', guard });
      container.add(new Button(this, at(0), actionY, btnW, ACTION_H, '名前変更', () => this.onRename(index), opts('wood')));
      container.add(new Button(this, at(1), actionY, btnW, ACTION_H, 'お任せ編成', () => this.onAutoFormation(index), opts('gold')));
      container.add(new Button(this, at(2), actionY, btnW, ACTION_H, '詳細', () => this.showDeckDetail(index), opts('wood')));
      container.add(new Button(this, at(3), actionY, btnW, ACTION_H, '削除', () => this.onDeleteDeck(index), opts('danger')));
    } else {
      const useW = 150;
      if (isActive) {
        const chip = this.add.graphics();
        chip.fillStyle(0x3b2a12, 1);
        chip.fillRoundedRect(PAD, actionY - ACTION_H / 2, useW, ACTION_H, 10);
        chip.lineStyle(2, CHROME.brassBright, 0.9);
        chip.strokeRoundedRect(PAD, actionY - ACTION_H / 2, useW, ACTION_H, 10);
        container.add(chip);
        container.add(body(this, PAD + useW / 2, actionY, '★ 使用中', { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
      } else {
        container.add(new Button(this, PAD + useW / 2, actionY, useW, ACTION_H, '使用する', () => this.useDeck(index), { variant: 'wood', fontSize: '22px', guard }));
      }
      container.add(new Button(this, PAD + innerW - 56, actionY, 112, ACTION_H, '詳細', () => this.showDeckDetail(index), { variant: 'wood', fontSize: '22px', guard }));
    }
    y += ACTION_H + PAD;

    container.addAt(
      createPanel(this, w / 2, y / 2, w, y, {
        fillColor: CHROME.woodFill,
        fillAlpha: 0.97,
        borderColor: isActive ? CHROME.brassBright : CHROME.brassDark,
        glowColor: CHROME.brass,
        radius: 14,
        gradient: false,
      }),
      0,
    );
    return { container, height: y };
  }

  /** Card at the end of the deck list that starts a new deck. */
  private buildAddCard(): Card {
    const container = this.add.container(0, 0);
    const w = CARD_WIDTH;
    const h = 92;
    const full = this.save.decks.length >= MAX_DECKS;
    container.add(createPanel(this, w / 2, h / 2, w, h, { fillColor: CHROME.woodFill, fillAlpha: 0.97, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false }));
    const label = full ? `デッキは最大${MAX_DECKS}つまで` : `＋ デッキを追加　${this.save.decks.length} / ${MAX_DECKS}`;
    const button = new Button(this, w / 2, h / 2, w - PAD * 2, 66, label, () => this.onAddDeck(), { variant: 'wood', fontSize: '26px', guard: () => this.scroll.isTap() });
    if (full) button.setEnabled(false);
    container.add(button);
    return { container, height: h };
  }

  private editHint(): string {
    if (this.armedHeroId) return '編成する枠を上からタップしてください';
    if (this.targetSlot) return '入れ替えるキャラを下から選んでください';
    return '下のキャラをタップで編成　枠をタップで入れ替え先を選択';
  }

  /** Red × on a filled slot while editing. */
  private buildRemoveBadge(x: number, y: number, ref: SlotRef, guard: () => boolean): Phaser.GameObjects.Container {
    const badge = this.add.container(x, y);
    const disc = this.add.graphics();
    disc.fillStyle(0xd23b3b, 1);
    disc.fillCircle(0, 0, 15);
    disc.lineStyle(2.5, 0xffffff, 1);
    disc.strokeCircle(0, 0, 15);
    disc.lineStyle(3, 0xffffff, 1);
    disc.beginPath();
    disc.moveTo(-6, -6);
    disc.lineTo(6, 6);
    disc.moveTo(6, -6);
    disc.lineTo(-6, 6);
    disc.strokePath();
    badge.add(disc);
    const hit = this.add.zone(0, 0, 44, 44).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (guard()) this.removeFromDeck(ref);
    });
    badge.add(hit);
    return badge;
  }

  /** Totals behind a deck's 詳細 button: everything 総合力 is made of. */
  private showDeckDetail(index: number): void {
    this.modal?.close();
    this.modal = openModal(this, this.scroll, 0.7, true);
    const modal = this.modal.container;
    const party = this.deckHeroes(index);
    const totals = ProgressionSystem.computeDeckTotals(party);
    const rows: { label: string; value: string; accent?: boolean }[] = [
      { label: '総合力', value: totals.power.toString(), accent: true },
      { label: 'HP', value: totals.maxHp.toString() },
      { label: '攻撃力', value: totals.atk.toString() },
      { label: '防御力', value: totals.def.toLocaleString('ja-JP') },
      { label: '素早さ', value: totals.spd.toLocaleString('ja-JP') },
    ];

    const w = 580;
    const rowH = 62;
    const h = 140 + rows.length * rowH + 100;
    const cy = 620;
    const top = cy - h / 2;
    const left = 360 - w / 2 + 50;
    const right = 360 + w / 2 - 50;

    const panel = createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false });
    // Swallows taps so touching the panel itself doesn't dismiss the popup.
    const block = this.add.zone(360, cy, w, h).setInteractive();
    modal.add([panel, block]);

    modal.add(heading(this, 360, top + 48, `${this.save.decks[index].name} の合計`, { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    modal.add(caption(this, 360, top + 92, `編成 ${party.length} / ${DECK_SLOTS.length} 体`, { fontSize: '18px', color: '#d8c49a' }).setOrigin(0.5));

    rows.forEach((row, i) => {
      const y = top + 140 + i * rowH + rowH / 2;
      if (i > 0) modal.add(createDivider(this, 360, y - rowH / 2, w - 70, CHROME.brassDark));
      const label = body(this, left, y, row.label, { fontSize: '25px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
      const value = body(this, right, y, row.value, {
        fontSize: row.accent ? '32px' : '29px',
        fontStyle: 'bold',
        color: row.accent ? '#ffe9b8' : '#fff4dc',
        stroke: INK,
        strokeThickness: 4,
      }).setOrigin(1, 0.5);
      // A very large total must not run into its label.
      const room = right - left - label.width - 24;
      if (value.width > room) value.setScale(room / value.width);
      modal.add([label, value]);
    });

    modal.add(new Button(this, 360, top + h - 56, 240, 68, '閉じる', () => this.modal?.close(), { variant: 'wood', fontSize: '24px' }));
  }

  // --- roster card -------------------------------------------------------

  private buildRosterCard(): Card {
    const container = this.add.container(0, 0);
    const w = CARD_WIDTH;
    const innerW = w - PAD * 2;
    const guard = () => this.scroll.isTap();
    // Copies of one character sit together, the character with the highest level first.
    const bestLevel = new Map<string, number>();
    for (const h of this.save.heroes) bestLevel.set(h.heroId, Math.max(bestLevel.get(h.heroId) ?? 0, h.level));
    const heroes = [...this.save.heroes].sort(
      (a, b) => b.rarity - a.rarity || bestLevel.get(b.heroId)! - bestLevel.get(a.heroId)! || a.heroId.localeCompare(b.heroId) || b.level - a.level,
    );
    // Only while editing: which heroes already stand in the deck being edited,
    // and which characters they are (a deck holds one copy of each).
    const inDeckHeroes = this.editingDeck === null ? [] : this.deckHeroes(this.editingDeck);
    const inDeck = new Set(inDeckHeroes.map((h) => h.id));
    const inDeckCharacters = new Set(inDeckHeroes.map((h) => h.heroId));
    let y = PAD;

    const headerH = 48;
    container.add(createPanel(this, w / 2, y + headerH / 2, innerW, headerH, { fillColor: HEADER_FILL, borderColor: CHROME.brassDark, glowColor: CHROME.brassDark, borderWidth: 1.5, radius: 8, gradient: false }));
    container.add(body(this, PAD + 16, y + headerH / 2, '所持キャラ', { fontSize: '23px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(body(this, PAD + innerW - 16, y + headerH / 2, `${heroes.length}体`, { fontSize: '22px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
    y += headerH + 12;

    const size = HERO_SLOT_SIZE;
    const gapX = (innerW - GRID_COLS * size) / (GRID_COLS - 1);
    heroes.forEach((hero, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      container.add(
        new HeroSlot(this, PAD + size / 2 + col * (size + gapX), y + size / 2 + row * (size + GRID_GAP_Y), {
          hero,
          generator: this.generator,
          inDeck: inDeck.has(hero.id),
          twinInDeck: !inDeck.has(hero.id) && inDeckCharacters.has(hero.heroId),
          selected: hero.id === this.armedHeroId,
          onTap: () => this.onHeroTap(hero),
          guard,
        }),
      );
    });
    const rows = Math.ceil(heroes.length / GRID_COLS);
    y += rows * size + Math.max(0, rows - 1) * GRID_GAP_Y + PAD;

    container.addAt(
      createPanel(this, w / 2, y / 2, w, y, { fillColor: CHROME.woodFill, fillAlpha: 0.97, borderColor: CHROME.brassDark, glowColor: CHROME.brass, radius: 14, gradient: false }),
      0,
    );
    return { container, height: y };
  }

  // --- interaction -------------------------------------------------------

  private startEditing(index: number, target: SlotRef | null = null): void {
    this.editingDeck = index;
    this.targetSlot = target;
    this.armedHeroId = null;
    this.queueRender();
  }

  private finishEditing(): void {
    this.editingDeck = null;
    this.targetSlot = null;
    this.armedHeroId = null;
    this.queueRender();
  }

  private findInDeck(index: number, heroId: string): SlotRef | undefined {
    return DECK_SLOTS.find((ref) => this.save.decks[index][ref.row][ref.slot] === heroId);
  }

  /** Where another copy of `hero`'s character stands in the deck, if one does. */
  private findTwinInDeck(index: number, hero: HeroData): SlotRef | undefined {
    return DECK_SLOTS.find((ref) => {
      const other = this.heroAt(index, ref);
      return other !== undefined && other.id !== hero.id && other.heroId === hero.heroId;
    });
  }

  private onHeroTap(hero: HeroData): void {
    const index = this.editingDeck;
    if (index === null) {
      this.openDetail(hero.id);
      return;
    }
    const placed = this.findInDeck(index, hero.id);
    if (placed) {
      this.removeFromDeck(placed);
      return;
    }
    if (this.armedHeroId === hero.id) {
      this.armedHeroId = null;
      this.queueRender();
      return;
    }
    if (this.targetSlot) {
      this.place(hero.id, this.targetSlot);
      return;
    }
    // A deck holds one of each character: another copy takes over that copy's slot.
    const twin = this.findTwinInDeck(index, hero);
    if (twin) {
      this.place(hero.id, twin);
      return;
    }
    const empty = DECK_SLOTS.find((ref) => !this.save.decks[index][ref.row][ref.slot]);
    if (empty) {
      this.place(hero.id, empty);
      return;
    }
    // Deck is full and no slot picked yet: hold this hero until one is.
    this.armedHeroId = hero.id;
    showToast(this, '入れ替える枠をタップしてください');
    this.queueRender();
  }

  private onDeckSlotTap(index: number, ref: SlotRef): void {
    const hero = this.heroAt(index, ref);
    if (this.editingDeck === null) {
      if (hero) {
        this.openDetail(hero.id);
      } else {
        // An empty slot is an invitation to fill it.
        this.startEditing(index, ref);
      }
      return;
    }
    if (this.armedHeroId) {
      this.place(this.armedHeroId, ref);
      return;
    }
    const same = this.targetSlot?.row === ref.row && this.targetSlot.slot === ref.slot;
    this.targetSlot = same ? null : ref;
    this.queueRender();
  }

  private place(heroId: string, ref: SlotRef): void {
    const index = this.editingDeck!;
    const hero = SaveSystem.getHero(this.save, heroId);
    const twin = hero ? this.findTwinInDeck(index, hero) : undefined;
    SaveSystem.setDeckSlot(this.save, index, ref.row, ref.slot, heroId);
    SaveSystem.save(this.save);
    if (twin && (twin.row !== ref.row || twin.slot !== ref.slot)) {
      showToast(this, '同じキャラは編成に1体までです。前の枠から移しました', '#ffd9a0');
    }
    this.armedHeroId = null;
    this.targetSlot = null;
    this.queueRender();
  }

  private removeFromDeck(ref: SlotRef): void {
    const index = this.editingDeck!;
    // The deck in use can't be emptied: it would send an empty party to fight.
    if (index === this.save.activeDeck && SaveSystem.countDeckHeroes(this.save, index) <= 1) {
      showToast(this, '使用中のデッキは最低1体必要です', '#ff8a8a');
      return;
    }
    SaveSystem.setDeckSlot(this.save, index, ref.row, ref.slot, null);
    SaveSystem.save(this.save);
    this.targetSlot = null;
    this.queueRender();
  }

  private useDeck(index: number): void {
    if (!SaveSystem.setActiveDeck(this.save, index)) {
      showToast(this, '空のデッキは使用できません', '#ff8a8a');
      return;
    }
    SaveSystem.save(this.save);
    showToast(this, `「${this.save.decks[index].name}」を使用中にしました`);
    this.queueRender();
  }

  private promptDeckName(title: string, initial: string, hint: string, onSubmit: (name: string) => void): void {
    this.modal?.close();
    this.modal = openTextPrompt(this, this.scroll, { title, initial, maxLength: DECK_NAME_MAX, hint, onSubmit });
  }

  private onAddDeck(): void {
    this.promptDeckName('新しいデッキを作成', defaultDeckName(this.save.decks), 'このままOKを押しても作成できます', (name) => {
      const index = SaveSystem.addDeck(this.save, name);
      if (index === null) return;
      SaveSystem.save(this.save);
      showToast(this, `「${this.save.decks[index].name}」を作成しました`);
      this.startEditing(index);
    });
  }

  private onRename(index: number): void {
    this.promptDeckName('デッキ名を変更', this.save.decks[index].name, '書き換えてOKを押してください', (name) => {
      SaveSystem.renameDeck(this.save, index, name);
      SaveSystem.save(this.save);
      this.queueRender();
    });
  }

  private onAutoFormation(index: number): void {
    SaveSystem.setDeckFormation(this.save, index, autoFormation(this.save.heroes));
    SaveSystem.save(this.save);
    this.targetSlot = null;
    this.armedHeroId = null;
    showToast(this, 'お任せ編成しました');
    this.queueRender();
  }

  private onDeleteDeck(index: number): void {
    if (index === this.save.activeDeck) {
      showToast(this, '使用中のデッキは削除できません', '#ff8a8a');
      return;
    }
    const name = this.save.decks[index].name;
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: 'デッキを削除',
      message: `「${name}」を削除しますか？\nこの操作は元に戻せません`,
      confirmLabel: '削除する',
      onConfirm: () => {
        if (!SaveSystem.removeDeck(this.save, index)) return;
        SaveSystem.save(this.save);
        showToast(this, `「${name}」を削除しました`);
        this.finishEditing();
      },
    });
  }

  private openDetail(heroId: string): void {
    this.scene.start('HeroDetail', { heroId, from: 'Roster' });
  }
}
