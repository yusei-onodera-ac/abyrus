import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { HeroCard } from '../ui/HeroCard';
import type { HeroData, Row } from '../types';

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

    this.add.text(360, 50, '英雄名鑑', { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(360, 80, 'タップで詳細表示 / 長押しで編成選択', { fontSize: '13px', color: '#9a93b8' }).setOrigin(0.5);

    this.buildFormationSlots();
    this.buildRosterGrid();
    this.buildBackButton();

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.rosterContainer.y = Phaser.Math.Clamp(this.rosterContainer.y - dy * 0.5, -2000, 0);
    });
  }

  private buildFormationSlots(): void {
    this.add.text(40, 130, '前衛', { fontSize: '14px', color: '#9a93b8' });
    for (let i = 0; i < 3; i++) this.makeSlot('front', i, 100 + i * 90, 180);
    this.add.text(40, 240, '後衛', { fontSize: '14px', color: '#9a93b8' });
    for (let i = 0; i < 2; i++) this.makeSlot('back', i, 145 + i * 90, 290);
  }

  private makeSlot(row: Row, slot: number, x: number, y: number): void {
    const bg = this.add.rectangle(x, y, 76, 76, 0x23263a).setStrokeStyle(2, 0x4a4d66).setInteractive({ useHandCursor: true });
    const heroId = this.save.party[row][slot];
    const hero = heroId ? SaveSystem.getHero(this.save, heroId) : undefined;
    this.add.text(x, y, hero ? hero.name.slice(0, 2) : '空', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerdown', () => this.onSlotTap(row, slot));
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
    this.save.heroes.forEach((hero, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cellSize;
      const y = startY + row * (cellSize + 10);
      const card = new HeroCard(this, x, y, hero, this.generator, 86);
      card.setInteractive(new Phaser.Geom.Rectangle(-43, -43, 86, 86), Phaser.Geom.Rectangle.Contains);
      card.setReadyGlow(hero.id === this.selectedHeroId);
      this.wireCardInput(hero, card);
      this.rosterContainer.add(card);
    });
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
    const bg = this.add.rectangle(80, 1230, 120, 48, 0x2a2c3d).setStrokeStyle(2, 0x4a4d66).setInteractive({ useHandCursor: true });
    this.add.text(80, 1230, '戻る', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerdown', () => this.scene.start('Home'));
  }
}
