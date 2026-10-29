import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { createPanel } from './Panel';
import { coinIcon, gemIcon, staminaIcon, legionCrestIcon } from './Icons';
import { COLORS, CHROME } from './theme';
import type { ShopFocus } from '../data/shop';

const INK = '#2a1608';

/** Radius of the round + buttons beside the three readouts. */
const PLUS_RADIUS = 15;
/** How far right of a readout's own anchor its + button sits (the number needs the room before it). */
const PLUS_OFFSET = 86;

export interface ResourceBarOptions {
  /** What a tap on a + button does. Defaults to opening the shop at that spot. */
  onPlus?: (focus: ShopFocus) => void;
}

/** Prefers the supplied currency illustration (coin/gem/stamina) over the
 *  procedural badge icon, scaled to fit `size` while preserving its own
 *  aspect ratio since none of the three source images are square. */
function statIcon(scene: Phaser.Scene, suppliedKey: string, fallbackTextureKey: string, x: number, y: number, size: number): Phaser.GameObjects.Image {
  if (scene.textures.exists(suppliedKey)) {
    const frame = scene.textures.get(suppliedKey).getSourceImage();
    const scale = Math.min(size / frame.width, size / frame.height);
    return scene.add.image(x, y, suppliedKey).setScale(scale);
  }
  return scene.add.image(x, y, fallbackTextureKey);
}

/** Top HUD strip. Uses the supplied "topbar" artwork (level circle + legion
 *  shield + name plank + ABYRUS plate + currency plank) when loaded, laying
 *  every readout into that art's own frames; falls back to a plain glass
 *  panel (gold/gems only) otherwise. */
export class ResourceBar extends Phaser.GameObjects.Container {
  private goldText: Phaser.GameObjects.Text;
  private gemText: Phaser.GameObjects.Text;
  private staminaText?: Phaser.GameObjects.Text;
  private levelText?: Phaser.GameObjects.Text;
  private nameText?: Phaser.GameObjects.Text;
  /** True when the real topbar artwork is in use, so callers (HomeScene's
   *  separate "ABYRUS" wordmark) can skip anything the art already shows. */
  readonly hasArt: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, opts: ResourceBarOptions = {}) {
    super(scene, x, y);
    this.hasArt = scene.textures.exists('topbar');
    const onPlus = opts.onPlus ?? ((focus: ShopFocus) => scene.scene.start('Shop', { focus }));

    let height: number;
    let goldPos: { x: number; y: number };
    let gemPos: { x: number; y: number };
    let staminaPos: { x: number; y: number } | null = null;

    if (this.hasArt) {
      const frame = scene.textures.get('topbar').getSourceImage();
      height = width / (frame.width / frame.height);
      const bg = scene.add.image(0, 0, 'topbar').setOrigin(0, 0).setDisplaySize(width, height);
      this.add(bg);

      // Every position below was read off the source art's own 2000x350
      // canvas (measured by sampling its pixels for the circle/shield/plank
      // bounds) and is scaled by width/2000 here - the same uniform factor
      // the background image itself is scaled by - so these line up with
      // the illustrated frames at any bar width.
      const art = (ox: number, oy: number) => ({ x: width * (ox / 2000), y: width * (oy / 2000) });

      const levelPos = art(156, 141);
      this.levelText = scene.add
        .text(levelPos.x, levelPos.y, '', {
          fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
          fontSize: '22px',
          color: '#ffe9b8',
          fontStyle: 'bold',
          stroke: INK,
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      this.add(this.levelText);

      const crestPos = art(388, 200);
      this.add(scene.add.image(crestPos.x, crestPos.y, legionCrestIcon(scene, 40)));

      const namePos = art(410, 50);
      this.nameText = scene.add
        .text(namePos.x, namePos.y, '', {
          fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
          fontSize: '15px',
          color: '#f5e6c8',
          fontStyle: 'bold',
          stroke: INK,
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.add(this.nameText);

      // The plate sits well above this row (bottom edge ~y130 vs this
      // row's y205), so the plank is open the whole way from the shield's
      // right edge (~x460) to the bar's right edge - spread across that
      // full width instead of bunching against the right edge.
      // The three slots sit a little left of where the plank's middle would
      // put them, to leave room for a + button after each readout.
      goldPos = art(648, 205);
      gemPos = art(1143, 205);
      staminaPos = art(1638, 205);
    } else {
      height = 64;
      const panel = createPanel(scene, width / 2, height / 2, width, height, {
        fillColor: COLORS.panelFill,
        fillAlpha: 0.95,
        borderColor: COLORS.border,
        glowColor: COLORS.accent,
        radius: 16,
      });
      this.add(panel);
      goldPos = { x: 34, y: 20 };
      gemPos = { x: 34, y: 46 };
    }

    if (this.hasArt) {
      // Icon-left, number-right (like the fallback panel) rather than a
      // stacked icon-over-number: a single row gives the number the whole
      // slot's width to grow into instead of splitting it with the icon.
      const statStyle = (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
        fontFamily: 'Arial, sans-serif',
        fontSize: '19px',
        color,
        fontStyle: 'bold',
        stroke: INK,
        strokeThickness: 3,
      });
      const goldIcon = statIcon(scene, 'currency_coin', coinIcon(scene, 32), goldPos.x - 17, goldPos.y, 38);
      this.goldText = scene.add.text(goldPos.x + 2, goldPos.y, '', statStyle('#ffe79a')).setOrigin(0, 0.5);
      const gemIconImg = statIcon(scene, 'currency_gem', gemIcon(scene, 32), gemPos.x - 17, gemPos.y, 38);
      this.gemText = scene.add.text(gemPos.x + 2, gemPos.y, '', statStyle('#bfeaff')).setOrigin(0, 0.5);
      this.add([goldIcon, this.goldText, gemIconImg, this.gemText]);

      this.add(this.buildPlus(goldPos.x + PLUS_OFFSET, goldPos.y, 'gold', onPlus));
      this.add(this.buildPlus(gemPos.x + PLUS_OFFSET, gemPos.y, 'gems', onPlus));
      if (staminaPos) {
        const staminaIconImg = statIcon(scene, 'currency_stamina', staminaIcon(scene, 32), staminaPos.x - 17, staminaPos.y, 38);
        this.staminaText = scene.add.text(staminaPos.x + 2, staminaPos.y, '', statStyle('#ffd9a0')).setOrigin(0, 0.5);
        this.add([staminaIconImg, this.staminaText]);
        this.add(this.buildPlus(staminaPos.x + PLUS_OFFSET, staminaPos.y, 'stamina', onPlus));
      }
    } else {
      const goldIcon = statIcon(scene, 'currency_coin', coinIcon(scene, 26), goldPos.x, goldPos.y, 30);
      const gemIconImg = statIcon(scene, 'currency_gem', gemIcon(scene, 22), gemPos.x, gemPos.y, 26);
      this.goldText = scene.add
        .text(goldPos.x + 20, goldPos.y, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffe79a', fontStyle: 'bold' })
        .setOrigin(0, 0.5);
      this.gemText = scene.add
        .text(gemPos.x + 20, gemPos.y, '', { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#bfeaff' })
        .setOrigin(0, 0.5);
      this.add([goldIcon, gemIconImg, this.goldText, this.gemText]);
      this.add(this.buildPlus(width - 34, goldPos.y, 'gold', onPlus));
      this.add(this.buildPlus(width - 34, gemPos.y, 'gems', onPlus));
    }

    scene.add.existing(this);
  }

  /** A round brass-and-orange + that opens the shop at the part selling what it sits beside. */
  private buildPlus(x: number, y: number, focus: ShopFocus, onPlus: (focus: ShopFocus) => void): Phaser.GameObjects.Container {
    const scene = this.scene;
    const r = PLUS_RADIUS;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, 2, r);
    g.fillStyle(0xe0822a, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.22);
    g.fillEllipse(0, -r * 0.4, r * 1.3, r * 0.7);
    g.lineStyle(2, CHROME.brassBright, 1);
    g.strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-r * 0.55, -r * 0.14, r * 1.1, r * 0.28, 2);
    g.fillRoundedRect(-r * 0.14, -r * 0.55, r * 0.28, r * 1.1, 2);
    const button = scene.add.container(x, y, [g]);
    const hit = scene.add.zone(0, 0, 46, 46).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => scene.tweens.add({ targets: button, scale: 1.12, duration: 110, ease: 'Sine.easeOut' }));
    hit.on('pointerout', () => scene.tweens.add({ targets: button, scale: 1, duration: 140, ease: 'Sine.easeOut' }));
    hit.on('pointerdown', () => scene.tweens.add({ targets: button, scale: 0.9, duration: 70, ease: 'Sine.easeOut' }));
    hit.on('pointerup', () => {
      scene.tweens.add({ targets: button, scale: 1.12, duration: 90, ease: 'Sine.easeOut' });
      onPlus(focus);
    });
    button.add(hit);
    return button;
  }

  update(save: SaveData): void {
    const unit = this.hasArt ? '' : ' G';
    this.goldText.setText(`${SaveSystem.getGold(save).toString()}${unit}`);
    this.gemText.setText(this.hasArt ? save.gems.toLocaleString('ja-JP') : `${save.gems.toLocaleString('ja-JP')} 魔晶石`);
    this.levelText?.setText(`Lv${save.playerLevel}`);
    this.nameText?.setText(save.playerName);
    this.staminaText?.setText(`${save.stamina[0]}/${save.stamina[1]}`);
  }
}
