import Phaser from 'phaser';
import { SweepSystem, type SweepResult, type SweepTarget } from '../systems/SweepSystem';
import type { SaveData } from '../systems/SaveSystem';
import { Button } from './Button';
import type { ModalLock } from './Modal';
import { showRewardModal } from './RewardModal';
import type { RewardTile } from './RewardTiles';
import { body, CHROME } from './theme';
import { t } from '../i18n';

const INK = '#1c130a';
export const SWEEP_ROW_HEIGHT = 128;

/**
 * A row of the 出撃 popup, centred on (360, y), for a stage that has been cleared before: 掃討 - a ◀ n回 ▶ stepper (and 最大)
 * and a 掃討する button that says what it costs. Pressing it hands `count` to `onSweep`, which closes the popup and runs
 * SweepSystem.run (the scene knows what to redraw afterwards).
 */
export function addSweepRow(scene: Phaser.Scene, container: Phaser.GameObjects.Container, y: number, save: SaveData, target: SweepTarget, onSweep: (count: number) => void): void {
  const w = 520;
  const h = 116;
  const row = scene.add.container(360, y);
  container.add(row);
  const per = SweepSystem.costPer(target);
  const most = Math.max(1, SweepSystem.maxCount(save, target));
  let count = 1;

  const draw = (): void => {
    row.removeAll(true);
    const bg = scene.add.graphics();
    bg.fillStyle(0x1a1209, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(2, CHROME.brassDark, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    row.add(bg);
    row.add(body(scene, -w / 2 + 20, -34, t('quest.sweep.title'), { fontSize: '28px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    row.add(body(scene, -w / 2 + 104, -33, t('quest.sweep.description'), { fontSize: '17px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    const step = (delta: number): void => {
      count = Phaser.Math.Clamp(count + delta, 1, most);
      // Redrawn after this tap has finished: the button being replaced is still handling it.
      scene.time.delayedCall(0, draw);
    };
    const y2 = 24;
    const minus = new Button(scene, -w / 2 + 52, y2, 64, 52, '－', () => step(-1), { variant: 'wood', fontSize: '28px' }); // i18n-ignore (a sign)
    minus.setEnabled(count > 1);
    const plus = new Button(scene, -w / 2 + 224, y2, 64, 52, '＋', () => step(1), { variant: 'wood', fontSize: '28px' }); // i18n-ignore (a sign)
    plus.setEnabled(count < most);
    const mostBtn = new Button(scene, -w / 2 + 300, y2, 70, 52, t('quest.sweep.max'), () => step(most - count), { variant: 'wood', fontSize: '20px' });
    mostBtn.setEnabled(count < most);
    row.add([minus, plus, mostBtn]);
    row.add(body(scene, -w / 2 + 138, y2, t('quest.sweep.count', { count }), { fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    row.add(new Button(scene, w / 2 - 82, y2, 150, 56, t('quest.sweep.run'), () => onSweep(count), { variant: 'gold', fontSize: '24px', subLabel: t('quest.sweep.stamina', { per: per * count }) }));
  };
  draw();
}

/** The result of a sweep: every tile of what it paid (EXP is each hero's share), and who gained a level. */
export function showSweepResult(scene: Phaser.Scene, lock: ModalLock, result: SweepResult, onClose: () => void): void {
  const n = (v: number): string => `+${v.toLocaleString('ja-JP')}`;
  const tiles: RewardTile[] = [
    { kind: 'gold', amount: `+${result.gold.toString()}` },
    { kind: 'exp', amount: n(result.exp) },
    { kind: 'essence', amount: n(result.essence) },
    { kind: 'rank', amount: n(result.playerExp), tag: result.levelUp ? `Lv${result.levelUp.to}` : undefined },
  ];
  if (result.levelUp) tiles.push({ kind: 'gems', amount: n(result.levelUp.gems), tag: 'LvUP' });
  if (result.eventTokens) tiles.push({ kind: 'token', token: result.eventTokens.token, amount: n(result.eventTokens.amount), tag: t('quest.sweep.tagEvent') });
  if (result.phaseMaterials > 0) tiles.push({ kind: 'phaseMaterials', amount: n(result.phaseMaterials), tag: t('quest.sweep.tagDrop') });
  for (const { item, amount } of result.items) tiles.push({ kind: 'item', item, amount: n(amount), tag: t('quest.sweep.tagDrop') });
  const up = result.party.filter((p) => p.levelAfter > p.levelBefore);
  const note = up.length > 0 ? t('quest.sweep.levelUps', { count: up.length, value: Math.max(...up.map((p) => p.levelAfter)) }) : undefined;
  showRewardModal(scene, lock, { title: t('quest.sweep.complete', { count: result.count }), tiles, note, onClose });
}
