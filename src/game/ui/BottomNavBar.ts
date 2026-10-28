import Phaser from 'phaser';
import { COLORS } from './theme';

export type NavTab = 'event' | 'legion' | 'home' | 'profile' | 'settings';

const TAB_LABELS: Record<NavTab, string> = {
  event: 'イベント',
  legion: '軍団',
  home: 'ホーム',
  profile: 'プロフィール',
  settings: '設定',
};

const TAB_SCENE: Record<NavTab, string> = {
  event: 'Event',
  legion: 'Legion',
  home: 'Home',
  profile: 'Profile',
  settings: 'Settings',
};

const TABS: NavTab[] = ['event', 'legion', 'home', 'profile', 'settings'];

// The wood-plank art's five circular slots sit at this fraction of the
// art's own height/width, measured directly from the source image rather
// than eyeballed - the slot ring runs from ~y0.27 to ~y0.87 of the art
// (center 0.58, diameter 0.59 of the art's height). Expressing every
// measurement as a fraction of the art's own size - never a fixed pixel
// count - is what keeps this correctly aligned at any canvas/device size,
// since Phaser's FIT scale mode only guarantees the 720x1280 design
// canvas stays internally consistent, not any particular pixel count.
const SLOT_CENTER_Y_FRAC = 0.58;
const SLOT_DIAMETER_FRAC = 0.56;
/** Extra strip below the art itself, reserved for the label (the art has
 *  only a sliver of plank below the ring - not enough room for legible
 *  text), sized relative to the art's own height so it scales with it. */
const LABEL_STRIP_FRAC = 0.34;

export class BottomNavBar extends Phaser.GameObjects.Container {
  /** Total height this bar occupies (art + label strip, or the flat
   *  fallback height), so other scenes can lay out content above it
   *  without guessing. */
  static totalHeight(scene: Phaser.Scene, canvasWidth: number): number {
    if (scene.textures.exists('bottombar')) {
      const frame = scene.textures.get('bottombar').getSourceImage();
      const artHeight = canvasWidth / (frame.width / frame.height);
      return artHeight * (1 + LABEL_STRIP_FRAC);
    }
    return 96;
  }

  constructor(scene: Phaser.Scene, canvasWidth: number, canvasHeight: number, active: NavTab) {
    super(scene, 0, 0);

    const hasArt = scene.textures.exists('bottombar');
    let artHeight: number;
    let barY: number;
    let labelY: number;

    if (hasArt) {
      const frame = scene.textures.get('bottombar').getSourceImage();
      artHeight = canvasWidth / (frame.width / frame.height);
      const total = artHeight * (1 + LABEL_STRIP_FRAC);
      barY = canvasHeight - total;
      labelY = barY + artHeight + (total - artHeight) * 0.5;
      const bg = scene.add.image(0, barY, 'bottombar').setOrigin(0, 0).setDisplaySize(canvasWidth, artHeight);
      this.add(bg);
      // No flat panel behind the label strip: it sits on whatever the
      // scene's own background already is, so it reads as part of the
      // screen rather than a separate box bolted under the plank art.
    } else {
      artHeight = 96;
      barY = canvasHeight - artHeight;
      labelY = barY + artHeight * 0.86;
      const bg = scene.add.rectangle(0, barY, canvasWidth, artHeight, COLORS.panelFill, 0.96).setOrigin(0, 0);
      this.add(bg);
    }

    const slotCenterY = barY + artHeight * SLOT_CENTER_Y_FRAC;
    const iconSize = artHeight * SLOT_DIAMETER_FRAC;
    const slotWidth = canvasWidth / TABS.length;
    const totalHeight = hasArt ? artHeight * (1 + LABEL_STRIP_FRAC) : artHeight;

    TABS.forEach((tab, i) => {
      const cx = slotWidth * (i + 0.5);
      const isActive = tab === active;

      const iconKey = `tab_${tab}`;
      if (scene.textures.exists(iconKey)) {
        const frame = scene.textures.get(iconKey).getSourceImage();
        const scale = Math.min(iconSize / frame.width, iconSize / frame.height);
        const icon = scene.add.image(cx, slotCenterY, iconKey).setScale(scale);
        if (!isActive) icon.setAlpha(0.6);
        this.add(icon);
      }

      // Matches the gold-on-parchment lettering style of the bar/icon art
      // itself (serif, stroked for legibility over the plank's wood grain)
      // instead of the game's plain sans-serif UI caption style, which read
      // as a cheap placeholder bolted under an otherwise painted bar.
      const label = scene.add
        .text(cx, labelY, TAB_LABELS[tab], {
          fontFamily: 'Georgia, "Hiragino Mincho ProN", "Noto Serif JP", serif',
          fontSize: isActive ? '15px' : '14px',
          color: isActive ? '#ffd23f' : '#c9b38a',
          fontStyle: isActive ? 'bold' : 'normal',
          stroke: '#2a1a0f',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.add(label);

      const hitZone = scene.add.zone(cx, barY + totalHeight / 2, slotWidth, totalHeight).setOrigin(0.5);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.on('pointerup', () => {
        if (!isActive) scene.scene.start(TAB_SCENE[tab]);
      });
      this.add(hitZone);
    });

    this.setDepth(100);
    scene.add.existing(this);
  }
}
