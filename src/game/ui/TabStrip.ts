import Phaser from 'phaser';
import { Button } from './Button';

export interface TabDef {
  key: string;
  label: string;
  /** A red count bubble on the tab's corner; omitted or 0 for none. */
  badge?: number;
}

/** A row of equal-width segmented buttons across `width`, the selected one
 *  lit up. The container's origin is the strip's top-left. */
export function buildTabStrip(scene: Phaser.Scene, tabs: TabDef[], active: string, width: number, height: number, onSelect: (key: string) => void): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const gap = 10;
  const tabW = (width - gap * (tabs.length - 1)) / tabs.length;
  tabs.forEach((tab, i) => {
    const cx = i * (tabW + gap) + tabW / 2;
    const selected = tab.key === active;
    container.add(new Button(scene, cx, height / 2, tabW, height, tab.label, () => onSelect(tab.key), { variant: selected ? 'gold' : 'wood', fontSize: '22px' }));
    if (tab.badge && tab.badge > 0) {
      const bx = cx + tabW / 2 - 10;
      const by = 6;
      const dot = scene.add.graphics();
      dot.fillStyle(0x1b1d29, 1);
      dot.fillCircle(bx, by, 15);
      dot.fillStyle(0xff4d4d, 1);
      dot.fillCircle(bx, by, 12.5);
      container.add(dot);
      container.add(scene.add.text(bx, by, String(Math.min(tab.badge, 99)), { fontFamily: 'Arial, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    }
  });
  return container;
}
