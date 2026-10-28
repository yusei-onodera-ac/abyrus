import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { createPanel } from './Panel';
import { coinIcon, gemIcon, staminaIcon, legionCrestIcon } from './Icons';
import { COLORS } from './theme';

const INK = '#2a1608';

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

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.hasArt = scene.textures.exists('topbar');

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
      goldPos = art(720, 205);
      gemPos = art(1215, 205);
      staminaPos = art(1710, 205);
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

      if (staminaPos) {
        const staminaIconImg = statIcon(scene, 'currency_stamina', staminaIcon(scene, 32), staminaPos.x - 17, staminaPos.y, 38);
        this.staminaText = scene.add.text(staminaPos.x + 2, staminaPos.y, '', statStyle('#ffd9a0')).setOrigin(0, 0.5);
        this.add([staminaIconImg, this.staminaText]);
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
    }

    scene.add.existing(this);
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
