import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { HeroCard } from '../ui/HeroCard';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { heading, caption, sectionLabel, COLORS } from '../ui/theme';
import { enter, enterStagger } from '../ui/Transitions';
import { hex, RARITY_COLORS, type HeroData, type Row } from '../types';

interface RosterSceneData {
  /** Hero id to arrive pre-selected for formation placement, e.g. after
   *  returning from HeroDetailScene via its "編成にセット" button. */
  preSelect?: string;
}

export class RosterScene extends Phaser.Scene {
  private generator!: CharacterGenerator;
  private save!: SaveData;
  private selectedHeroId: string | null = null;
  private rosterContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('Roster');
  }

  init(data: RosterSceneData): void {
    this.selectedHeroId = data?.preSelect ?? null;
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    this.save = this.game.registry.get('save');
    this.cameras.main.setBackgroundColor('#141420');
    applyBackground(this, 'roster');

    const title = heading(this, 360, 50, '英雄名鑑', { fontSize: '28px' }).setOrigin(0.5);
    const hint = caption(this, 360, 82, 'タップで詳細表示 / 長押しで編成選択', { fontSize: '13px' }).setOrigin(0.5);
    enter(this, title, { dy: -12, duration: 340 });
    enter(this, hint, { dy: -8, delay: 70 });

    this.buildFormationSlots();
    this.buildRosterGrid();
    this.buildBackButton();

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.rosterContainer.y = Phaser.Math.Clamp(this.rosterContainer.y - dy * 0.5, -2000, 0);
    });
  }

  private buildFormationSlots(): void {
    const frontLabel = sectionLabel(this, 40, 130, '前衛');
    const backLabel = sectionLabel(this, 40, 240, '後衛');
    enter(this, frontLabel, { delay: 60 });
    enter(this, backLabel, { delay: 80 });
    for (let i = 0; i < 3; i++) this.makeSlot('front', i, 100 + i * 90, 180);
    for (let i = 0; i < 2; i++) this.makeSlot('back', i, 145 + i * 90, 290);
  }

  private makeSlot(row: Row, slot: number, x: number, y: number): void {
    const heroId = this.save.party[row][slot];
    const hero = heroId ? SaveSystem.getHero(this.save, heroId) : undefined;
    const borderColor = hero ? RARITY_COLORS[hero.rarity] : COLORS.border;

    const panel = createPanel(this, x, y, 76, 76, {
      fillColor: COLORS.panelFill,
      fillAlpha: hero ? 0.95 : 0.5,
      borderColor,
      glowColor: borderColor,
      radius: 14,
      rarity: hero?.rarity,
    });
    this.add.text(x, y, hero ? hero.name.slice(0, 2) : '空', { fontSize: '14px', color: hero ? '#ffffff' : hex(COLORS.textMuted) }).setOrigin(0.5);

    const hit = this.add.zone(x, y, 76, 76).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.onSlotTap(row, slot));

    enter(this, panel, { dy: 10, delay: 100 });
  }

  private onSlotTap(row: Row, slot: number): void {
    if (this.selectedHeroId) {
      SaveSystem.setPartySlot(this.save, row, slot, this.selectedHeroId);
      SaveSystem.save(this.save);
      this.scene.restart();
      return;
    }
    const heroId = this.save.party[row][slot];
    if (heroId) {
      SaveSystem.setPartySlot(this.save, row, slot, null);
      SaveSystem.save(this.save);
      this.scene.restart();
    }
  }

  private buildRosterGrid(): void {
    this.rosterContainer = this.add.container(0, 0);
    const cols = 5;
    const cellSize = 100;
    const startX = 60 + cellSize / 2;
    const startY = 400;
    const cards: HeroCard[] = [];
    this.save.heroes.forEach((hero, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cellSize;
      const y = startY + row * (cellSize + 10);
      const card = new HeroCard(this, x, y, hero, this.generator, 86);
      // Container hit-testing (Phaser InputManager.pointWithinHitArea) adds
      // displayOriginX/Y (half width/height) to the local point before
      // testing it against the hit area shape, so the shape must be defined
      // in top-left-relative space (0, 0, w, h) - not centered on the
      // container's own local (0, 0) - or real taps on the card miss it.
      card.setInteractive(new Phaser.Geom.Rectangle(0, 0, 86, 86), Phaser.Geom.Rectangle.Contains);
      card.setReadyGlow(hero.id === this.selectedHeroId);
      this.wireCardInput(hero, card);
      this.rosterContainer.add(card);
      cards.push(card);
    });
    enterStagger(this, cards, { dy: 16, duration: 260, delay: 140, stagger: 20 });
  }

  /** Short tap opens the full detail view; holding the card down instead
   *  selects it for formation placement (tap an empty slot afterward). */
  private wireCardInput(hero: HeroData, card: HeroCard): void {
    const LONG_PRESS_MS = 420;
    let longPressTimer: Phaser.Time.TimerEvent | null = null;
    let longPressed = false;

    card.on('pointerdown', () => {
      longPressed = false;
      longPressTimer = this.time.delayedCall(LONG_PRESS_MS, () => {
        longPressed = true;
        this.selectHero(hero, card);
      });
    });

    const cancel = () => {
      if (longPressed) return;
      longPressTimer?.remove();
    };

    card.on('pointerup', () => {
      const wasLongPress = longPressed;
      cancel();
      if (!wasLongPress) this.openDetail(hero);
    });
    card.on('pointerupoutside', cancel);
  }

  private selectHero(hero: HeroData, card: HeroCard): void {
    this.selectedHeroId = hero.id;
    this.rosterContainer.list.forEach((obj) => {
      if (obj instanceof HeroCard) obj.setReadyGlow(obj === card);
    });
  }

  private openDetail(hero: HeroData): void {
    this.scene.start('HeroDetail', { heroId: hero.id, from: 'Roster' });
  }

  private buildBackButton(): void {
    const btn = new Button(this, 90, 1230, 140, 52, '戻る', () => this.scene.start('Home'), { variant: 'ghost', fontSize: '16px' });
    enter(this, btn, { delay: 200 });
  }
}
