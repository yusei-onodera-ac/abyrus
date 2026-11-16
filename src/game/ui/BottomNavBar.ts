import Phaser from 'phaser';
import { createPanel, createDivider } from './Panel';
import { enhanceTabIcon, eventTabIcon, friendTabIcon, homeTabIcon, shopTabIcon } from './Icons';
import { CHROME } from './theme';

// Sampled from the topbar artwork (see CHROME in theme.ts), so this
// code-drawn bar reads as the same physical material as that illustrated bar.
const WOOD_FILL = CHROME.woodFill;
const WOOD_GRAIN = CHROME.woodGrain;
const BRASS_DARK = CHROME.brassDark;
const BRASS = CHROME.brass;
const BRASS_BRIGHT = CHROME.brassBright;

export type NavTab = 'event' | 'friend' | 'home' | 'enhance' | 'shop';

const TAB_LABELS: Record<NavTab, string> = {
  event: 'イベント',
  friend: 'フレンド',
  home: 'ホーム',
  enhance: '強化',
  shop: 'ショップ',
};

const TAB_SCENE: Record<NavTab, string> = {
  event: 'Event',
  friend: 'Friend',
  home: 'Home',
  enhance: 'EnhanceHub',
  shop: 'Shop',
};

const TAB_ICON: Record<NavTab, (scene: Phaser.Scene, size?: number) => string> = {
  event: eventTabIcon,
  friend: friendTabIcon,
  home: homeTabIcon,
  enhance: enhanceTabIcon,
  shop: shopTabIcon,
};

const TABS: NavTab[] = ['event', 'friend', 'home', 'enhance', 'shop'];

const BAR_HEIGHT = 124;

/** Persistent 5-tab bar fixed to the bottom of the screen, drawn entirely
 *  from code (panel chrome + the same procedural round-badge icon family
 *  as the home screen's quest/gacha/roster nav) rather than from supplied
 *  art, so it never depends on external art being well-calibrated. Dressed
 *  up with the game's highest-rarity panel treatment (extra glow layers,
 *  corner accents) plus a raised gold rail and a glowing medallion under
 *  the active tab, so it reads as its own piece of chrome rather than a
 *  plain rounded box. */
export class BottomNavBar extends Phaser.GameObjects.Container {
  static totalHeight(): number {
    return BAR_HEIGHT;
  }

  /** `active` is null on screens that aren't one of the five tabs (e.g.
   *  Gacha): no tab is highlighted, and every tab stays tappable. */
  constructor(scene: Phaser.Scene, canvasWidth: number, canvasHeight: number, active: NavTab | null) {
    super(scene, 0, 0);

    const barY = canvasHeight - BAR_HEIGHT;
    const barCx = canvasWidth / 2;
    const barCy = barY + BAR_HEIGHT / 2;
    const slotWidth = canvasWidth / TABS.length;
    // Sized so the supplied icon art reads as the star of each slot - large
    // enough to spill slightly past its own glow medallion rather than
    // sitting shrunk safely inside it.
    const iconSize = BAR_HEIGHT * 0.8;

    const panel = createPanel(scene, barCx, barCy, canvasWidth - 6, BAR_HEIGHT - 6, {
      fillColor: WOOD_FILL,
      fillAlpha: 0.97,
      borderColor: BRASS_DARK,
      glowColor: BRASS,
      radius: 0,
      rarity: 5,
    });
    this.add(panel);

    // Faint horizontal grain so the panel body reads as the same carved
    // plank the top bar is painted on, not a flat UI rectangle.
    const grain = scene.add.graphics();
    grain.lineStyle(1, WOOD_GRAIN, 0.3);
    for (let gy = barY + 10; gy < barY + BAR_HEIGHT - 6; gy += 8) {
      grain.beginPath();
      grain.moveTo(8, gy);
      grain.lineTo(canvasWidth - 8, gy);
      grain.strokePath();
    }
    this.add(grain);

    // A thin bright rail along the very top edge, like the gilt trim on a
    // physical chest/console, so the bar reads as a distinct fixture
    // instead of just another rounded panel.
    const rail = scene.add.graphics();
    rail.fillGradientStyle(BRASS_BRIGHT, BRASS, BRASS_BRIGHT, BRASS, 1);
    rail.fillRect(3, barY, canvasWidth - 6, 3);
    this.add(rail);

    for (let i = 1; i < TABS.length; i++) {
      this.add(createDivider(scene, slotWidth * i, barCy, BAR_HEIGHT * 0.56, BRASS_DARK).setAngle(90));
    }

    TABS.forEach((tab, i) => {
      const cx = slotWidth * (i + 0.5);
      const isActive = tab === active;
      const iconCy = barY + BAR_HEIGHT * 0.38;

      if (isActive) {
        const medallion = scene.add.graphics();
        for (let r = 3; r >= 1; r--) {
          medallion.fillStyle(BRASS_BRIGHT, 0.05 + r * 0.05);
          medallion.fillCircle(cx, iconCy, iconSize * 0.46 + r * 5);
        }
        medallion.lineStyle(2, BRASS_BRIGHT, 0.8);
        medallion.strokeCircle(cx, iconCy, iconSize * 0.46);
        this.add(medallion);
      }

      // Prefer the supplied illustrated icon over the procedural badge -
      // only the bar chrome itself is code-drawn now, per direction; the
      // icon art still comes from the user's (text-free) source images.
      const suppliedKey = `tab_${tab}`;
      let icon: Phaser.GameObjects.Image;
      if (scene.textures.exists(suppliedKey)) {
        const frame = scene.textures.get(suppliedKey).getSourceImage();
        const scale = Math.min(iconSize / frame.width, iconSize / frame.height);
        icon = scene.add.image(cx, iconCy, suppliedKey).setScale(scale);
      } else {
        icon = scene.add.image(cx, iconCy, TAB_ICON[tab](scene, iconSize));
      }
      if (!isActive) icon.setAlpha(0.55);
      this.add(icon);

      const label = scene.add
        .text(cx, barY + BAR_HEIGHT * 0.87, TAB_LABELS[tab], {
          fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
          fontSize: isActive ? '15px' : '13px',
          color: isActive ? '#ffe9b8' : '#d8c49a',
          fontStyle: isActive ? 'bold' : 'normal',
          stroke: '#1c130a',
          strokeThickness: isActive ? 4 : 3,
        })
        .setOrigin(0.5);
      this.add(label);

      if (isActive) {
        const underline = scene.add.rectangle(cx, barY + BAR_HEIGHT * 0.97, iconSize * 0.8, 3, BRASS_BRIGHT, 0.95);
        this.add(underline);
      }

      const hitZone = scene.add.zone(cx, barCy, slotWidth, BAR_HEIGHT).setOrigin(0.5);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.on('pointerover', () => { if (!isActive) icon.setAlpha(0.8); });
      hitZone.on('pointerout', () => { if (!isActive) icon.setAlpha(0.55); });
      hitZone.on('pointerup', () => {
        if (!isActive) scene.scene.start(TAB_SCENE[tab]);
      });
      this.add(hitZone);
    });

    this.setDepth(100);
    scene.add.existing(this);
  }
}
