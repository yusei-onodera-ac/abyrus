import Phaser from 'phaser';
import type { CharacterGenerator } from '../characters/CharacterGenerator';
import { ULT_MAX, type UnitInstance } from '../systems/BattleSystem';
import type { HeroData } from '../types';
import { HeroSlot } from './HeroSlot';
import { CHROME, body } from './theme';

const INK = '#1c130a';

const CARD_W = 134;
const CARD_H = 212;
const GAP = 6;
/** The wood panel the cards sit on, and the cards' own top edge. */
const PANEL_TOP = 1034;
const TOP = 1050;
const ICON = 108;
const ICON_CENTER_Y = 40 + ICON / 2;
const BAR_W = 116;
const BAR_H = 17;
const HP_Y = 160;
const GAUGE_Y = 184;

interface Card {
  unit: UnitInstance;
  container: Phaser.GameObjects.Container;
  plate: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Graphics;
  bars: Phaser.GameObjects.Graphics;
  gaugeLabel: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Container;
  down: Phaser.GameObjects.Container;
  flash: Phaser.GameObjects.Rectangle;
  zone: Phaser.GameObjects.Zone;
  /** What was last drawn: the bars are only redrawn when this changes. */
  key: string;
  ready: boolean;
  tweens: Phaser.Tweens.Tween[];
}

export interface PartyBarOptions {
  generator: CharacterGenerator;
  units: UnitInstance[];
  /** The owned hero behind a unit, for its portrait. */
  heroOf: (unit: UnitInstance) => HeroData | undefined;
  /** A card was tapped: cast that hero's skill (a no-op until its gauge is full). */
  onTap: (unit: UnitInstance) => void;
}

/**
 * The party along the bottom of a fight: one card per hero with the name, the portrait, the HP
 * bar and the skill gauge. A hero whose gauge is full lights up with a pulsing TAP badge;
 * tapping the card casts the skill (the fight above carries on as it was).
 */
export class PartyBar {
  readonly container: Phaser.GameObjects.Container;
  private readonly cards: Card[];
  private readonly scene: Phaser.Scene;
  private readonly opts: PartyBarOptions;
  private enabled = true;
  /** 1 for up to five cards; less when a sixth (a borrowed 助っ人) is squeezed in. */
  private fit = 1;

  constructor(scene: Phaser.Scene, opts: PartyBarOptions) {
    this.scene = scene;
    this.opts = opts;
    this.container = scene.add.container(0, 0).setDepth(25);
    this.container.add(this.buildPanel());
    const n = opts.units.length;
    // A sixth card (a borrowed 助っ人) does not fit at full size: the cards shrink together, about the bar's centre line.
    const fit = Math.min(1, 704 / (n * CARD_W + (n - 1) * GAP));
    this.fit = fit;
    const startX = 360 - ((n * CARD_W + (n - 1) * GAP) * fit) / 2 + (CARD_W * fit) / 2;
    this.cards = opts.units.map((unit, i) => this.buildCard(unit, startX + i * (CARD_W + GAP) * fit));
    if (fit < 1) for (const card of this.cards) card.container.setScale(fit);
    this.cards.forEach((card) => this.refreshCard(card));
    // The bar comes up from below with the party.
    const rest = this.container.y;
    this.container.setY(rest + 260).setAlpha(0);
    scene.tweens.add({ targets: this.container, y: rest, alpha: 1, duration: 560, delay: 120, ease: 'Back.easeOut' });
  }

  /** Brings the bars and the TAP badges up to date; call every frame of the fight. */
  refresh(): void {
    for (const card of this.cards) this.refreshCard(card);
  }

  /** A hero just cast a skill: its card flashes and jumps. */
  cast(unitId: string): void {
    const card = this.cards.find((c) => c.unit.id === unitId);
    if (!card) return;
    card.flash.setAlpha(0.75);
    this.scene.tweens.add({ targets: card.flash, alpha: 0, duration: 380, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: card.container, scale: { from: 1.1 * this.fit, to: this.fit }, duration: 260, ease: 'Back.easeOut' });
  }

  /** After the fight: the cards drop away and stop answering taps. */
  leave(fade = true): void {
    this.enabled = false;
    for (const card of this.cards) {
      this.setReady(card, false);
      card.zone.disableInteractive();
    }
    this.scene.tweens.add({ targets: this.container, y: this.container.y + 260, alpha: fade ? 0 : 1, duration: 480, ease: 'Cubic.easeIn' });
  }

  destroy(): void {
    for (const card of this.cards) card.tweens.forEach((t) => t.stop());
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
  }

  // ------------------------------------------------------------- cards --

  /** The same carved plank and gilt rail as the tab bar, so the party reads as part of the chrome. */
  private buildPanel(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    // A soft shade above the rail lifts the panel off the field.
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.4, 0.4);
    g.fillRect(0, PANEL_TOP - 26, 720, 26);
    g.fillStyle(CHROME.woodFill, 0.98);
    g.fillRect(0, PANEL_TOP, 720, 1280 - PANEL_TOP);
    g.lineStyle(1, CHROME.woodGrain, 0.3);
    for (let y = PANEL_TOP + 10; y < 1276; y += 8) {
      g.beginPath();
      g.moveTo(8, y);
      g.lineTo(712, y);
      g.strokePath();
    }
    g.fillGradientStyle(CHROME.brassBright, CHROME.brass, CHROME.brassBright, CHROME.brass, 1);
    g.fillRect(0, PANEL_TOP, 720, 4);
    return g;
  }

  private buildCard(unit: UnitInstance, cx: number): Card {
    const { scene } = this;
    const container = scene.add.container(cx, TOP + CARD_H / 2);
    this.container.add(container);
    // Everything below is drawn around the card's centre.
    const left = -CARD_W / 2;
    const top = -CARD_H / 2;

    const plate = scene.add.graphics();
    const glow = scene.add.graphics().setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    container.add([plate, glow]);

    const name = body(scene, 0, top + 20, unit.name, { fontSize: '19px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
    if (name.width > CARD_W - 14) name.setScale((CARD_W - 14) / name.width);
    container.add(name);

    container.add(new HeroSlot(scene, 0, top + ICON_CENTER_Y, { hero: this.opts.heroOf(unit), generator: this.opts.generator, hideLevel: true }, ICON));

    const down = scene.add.container(0, top + ICON_CENTER_Y).setVisible(false);
    const shade = scene.add.graphics();
    shade.fillStyle(0x000000, 0.62);
    shade.fillRoundedRect(-ICON / 2, -ICON / 2, ICON, ICON, 12);
    const downText = body(scene, 0, 0, '戦闘不能', { fontSize: '20px', fontStyle: 'bold', color: '#ff9a8a', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
    down.add([shade, downText]);
    container.add(down);

    const bars = scene.add.graphics();
    container.add(bars);
    const label = { fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 3 };
    container.add(body(scene, left + 14, top + HP_Y + BAR_H / 2, 'HP', label).setOrigin(0, 0.5));
    const gaugeLabel = body(scene, left + 14, top + GAUGE_Y + BAR_H / 2, 'SKILL', label).setOrigin(0, 0.5);
    container.add(gaugeLabel);

    // The TAP badge sits across the lower edge of the portrait.
    const badge = scene.add.container(0, top + 40 + ICON - 8).setVisible(false);
    const pill = scene.add.graphics();
    pill.fillStyle(0xe0822a, 1);
    pill.fillRoundedRect(-44, -17, 88, 34, 12);
    pill.fillStyle(0xffffff, 0.22);
    pill.fillRoundedRect(-40, -14, 80, 13, { tl: 9, tr: 9, bl: 2, br: 2 });
    pill.lineStyle(3, CHROME.brassBright, 1);
    pill.strokeRoundedRect(-44, -17, 88, 34, 12);
    const tap = body(scene, 0, 0, 'TAP!', { fontSize: '24px', fontStyle: 'bold', color: '#ffffff', stroke: '#4a2406', strokeThickness: 5 }).setOrigin(0.5);
    badge.add([pill, tap]);
    container.add(badge);

    const flash = scene.add.rectangle(0, 0, CARD_W, CARD_H, 0xffffff, 1).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    container.add(flash);

    const zone = scene.add.zone(0, 0, CARD_W, CARD_H).setOrigin(0.5);
    zone.setInteractive({ useHandCursor: true });
    container.add(zone);

    const card: Card = { unit, container, plate, glow, bars, gaugeLabel, badge, down, flash, zone, key: '', ready: false, tweens: [] };
    zone.on('pointerdown', () => this.press(card));
    zone.on('pointerup', () => scene.tweens.add({ targets: container, scale: this.fit, duration: 90, ease: 'Sine.easeOut' }));
    zone.on('pointerout', () => scene.tweens.add({ targets: container, scale: this.fit, duration: 120, ease: 'Sine.easeOut' }));
    this.drawPlate(card, false);
    return card;
  }

  private press(card: Card): void {
    if (!this.enabled) return;
    const { unit } = card;
    if (!unit.alive) return;
    if (card.ready) {
      this.opts.onTap(unit);
      return;
    }
    // Not charged yet: a small shake of the gauge says so.
    this.scene.tweens.add({ targets: card.container, scale: 0.95 * this.fit, duration: 70, yoyo: true, ease: 'Sine.easeOut' });
    this.scene.tweens.add({ targets: card.gaugeLabel, x: card.gaugeLabel.x + 5, duration: 45, yoyo: true, repeat: 2 });
  }

  private refreshCard(card: Card): void {
    const { unit } = card;
    const hp = unit.maxHp.isZero() ? 0 : Phaser.Math.Clamp(unit.hp.div(unit.maxHp).toNumber(), 0, 1);
    const gauge = Phaser.Math.Clamp(unit.ultGauge / ULT_MAX, 0, 1);
    const hasSkill = unit.skills.length > 0;
    const full = unit.alive && hasSkill && unit.ultGauge >= ULT_MAX;
    const key = `${Math.round(hp * 300)}|${Math.round(gauge * 300)}|${unit.alive}|${hasSkill}|${full}`;
    if (key === card.key) return;
    card.key = key;

    const g = card.bars;
    g.clear();
    const x = -BAR_W / 2;
    const top = -CARD_H / 2;
    const hpColor = hp < 0.3 ? 0xe05353 : hp < 0.6 ? 0xe0c653 : 0x4caf50;
    drawBar(g, x, top + HP_Y, hp, hpColor);
    drawBar(g, x, top + GAUGE_Y, hasSkill ? gauge : 0, full ? 0xffe27a : hasSkill ? 0xe0a02a : 0x666666);
    card.gaugeLabel.setText(!hasSkill ? '未解放' : full ? 'MAX' : 'SKILL');

    card.down.setVisible(!unit.alive);
    this.drawPlate(card, full);
    this.setReady(card, full);
  }

  private drawPlate(card: Card, ready: boolean): void {
    const g = card.plate;
    g.clear();
    g.fillStyle(0x24170c, 0.96);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(-CARD_W / 2 + 3, -CARD_H / 2 + 3, CARD_W - 6, 34, { tl: 11, tr: 11, bl: 3, br: 3 });
    g.lineStyle(3, ready ? CHROME.brassBright : CHROME.brassDark, 1);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 14);

    const glow = card.glow;
    glow.clear();
    glow.lineStyle(7, 0xffd23f, 0.85);
    glow.strokeRoundedRect(-CARD_W / 2 - 2, -CARD_H / 2 - 2, CARD_W + 4, CARD_H + 4, 16);
  }

  /** The TAP badge and the glowing frame: on while the hero's skill can be cast. */
  private setReady(card: Card, ready: boolean): void {
    if (card.ready === ready) return;
    card.ready = ready;
    card.tweens.forEach((t) => t.stop());
    card.tweens = [];
    const { scene } = this;
    if (!ready) {
      card.badge.setVisible(false);
      card.glow.setAlpha(0);
      return;
    }
    const restY = card.badge.y;
    card.badge.setVisible(true).setScale(0).setY(restY);
    card.tweens.push(
      scene.tweens.add({ targets: card.badge, scale: 1, duration: 260, ease: 'Back.easeOut' }),
      scene.tweens.add({ targets: card.badge, y: restY - 5, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 260 }),
      scene.tweens.add({ targets: card.glow, alpha: { from: 0.95, to: 0.25 }, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
    );
    // The card jumps once as it becomes ready, and a ping says so.
    card.flash.setAlpha(0.5);
    scene.tweens.add({ targets: card.flash, alpha: 0, duration: 320 });
    scene.tweens.add({ targets: card.container, scale: { from: 1.08 * this.fit, to: this.fit }, duration: 240, ease: 'Back.easeOut' });
  }
}

/** A rounded bar (dark trough, fill, a pale gloss along the top, a brass rim). */
function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, ratio: number, color: number): void {
  g.fillStyle(0x0d0905, 1);
  g.fillRoundedRect(x, y, BAR_W, BAR_H, BAR_H / 2);
  if (ratio > 0) {
    const w = Math.max(BAR_H, BAR_W * ratio);
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y, w, BAR_H, BAR_H / 2);
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(x + 4, y + 2, Math.max(4, w - 8), 5, 2);
  }
  g.lineStyle(2, CHROME.brassDark, 1);
  g.strokeRoundedRect(x, y, BAR_W, BAR_H, BAR_H / 2);
}
