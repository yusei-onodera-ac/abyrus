import Phaser from 'phaser';
import { CLASS_LABELS, type HeroClass } from '../types';
import { HERO_SORTS, type HeroListView } from '../systems/HeroListView';
import { Button } from './Button';
import { caption } from './theme';

const INK = '#1c130a';
const ROW_H = 46;
const GAP = 8;
const LABEL_W = 62;

export interface HeroListControls {
  container: Phaser.GameObjects.Container;
  height: number;
}

/** The sort and filter rows above a list of heroes: 並び (five orders), ★ (all / 6..1) and 職業 (all / the five classes).
 *  The container's origin is its top-left. `onChange` gets the new view; the caller redraws (from a queued call, not from
 *  inside the tap that came here). */
export function buildHeroListControls(scene: Phaser.Scene, width: number, view: HeroListView, onChange: (next: HeroListView) => void, guard: () => boolean): HeroListControls {
  const container = scene.add.container(0, 0);
  const classes = Object.keys(CLASS_LABELS) as HeroClass[];

  const row = (index: number, label: string, items: { text: string; active: boolean; pick: () => HeroListView }[]): void => {
    const y = index * (ROW_H + GAP) + ROW_H / 2;
    container.add(caption(scene, 0, y, label, { fontSize: '19px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const room = width - LABEL_W;
    const chipW = (room - GAP * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      container.add(
        new Button(scene, LABEL_W + i * (chipW + GAP) + chipW / 2, y, chipW, ROW_H - 4, item.text, () => onChange(item.pick()), { variant: item.active ? 'gold' : 'wood', fontSize: '19px', guard }),
      );
    });
  };

  row(
    0,
    '並び',
    HERO_SORTS.map((s) => ({ text: s.label, active: view.sort === s.key, pick: () => ({ ...view, sort: s.key }) })),
  );
  row(1, '★', [
    { text: '全部', active: view.rarity === 0, pick: () => ({ ...view, rarity: 0 }) },
    ...[6, 5, 4, 3, 2, 1].map((r) => ({ text: `★${r}`, active: view.rarity === r, pick: () => ({ ...view, rarity: r }) })),
  ]);
  row(2, '職業', [
    { text: '全部', active: view.heroClass === '', pick: () => ({ ...view, heroClass: '' as const }) },
    ...classes.map((c) => ({ text: CLASS_LABELS[c], active: view.heroClass === c, pick: () => ({ ...view, heroClass: c }) })),
  ]);

  return { container, height: 3 * ROW_H + 2 * GAP };
}

