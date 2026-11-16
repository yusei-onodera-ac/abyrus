import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import type { HelperHero } from '../alliance/AllianceBackend';
import type { SaveData } from '../systems/SaveSystem';
import { showToast } from './Toast';
import { fullDigits } from './AllianceParts';
import { Button } from './Button';
import { body, CHROME } from './theme';

const INK = '#1c130a';
export const HELPER_ROW_HEIGHT = 100;

/** The 助っ人 picked in a 出撃 popup (null = none). Made once per popup. */
export interface HelperChoice {
  helper: HelperHero | null;
}

/** True when the player is in a 同盟 (the row is only offered then). */
export function canBorrowHelpers(save: SaveData): boolean {
  const d = AllianceService.cached(save);
  return !!d && d.members.some((m) => m.helper && m.uid !== d.me.uid);
}

/**
 * A row of the 出撃 popup, centred on (360, y): 助っ人 - a ◀ ▶ pair that goes through the 同盟 members' helpers (strongest
 * first) with "なし" in front. Whatever is showing when 出撃 is pressed is borrowed (see launchWithHelper).
 */
export function addHelperRow(scene: Phaser.Scene, container: Phaser.GameObjects.Container, y: number, save: SaveData, choice: HelperChoice): void {
  const w = 520;
  const h = 88;
  const row = scene.add.container(360, y);
  container.add(row);
  const detail = AllianceService.cached(save);
  const helpers = (detail?.members ?? [])
    .filter((m) => m.helper && m.uid !== detail?.me.uid)
    .map((m) => m.helper as HelperHero)
    .sort((a, b) => b.power - a.power);
  let index = -1; // -1 = none
  const draw = (): void => {
    row.removeAll(true);
    const bg = scene.add.graphics();
    bg.fillStyle(0x1a1209, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(2, choice.helper ? CHROME.brassBright : CHROME.brassDark, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    row.add(bg);
    row.add(body(scene, -w / 2 + 20, -20, '助っ人', { fontSize: '26px', fontStyle: 'bold', color: choice.helper ? '#ffd23f' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const h0 = choice.helper;
    row.add(body(scene, -w / 2 + 20, 18, h0 ? `${h0.name}　Lv.${h0.level}　（${h0.ownerName}）` : helpers.length > 0 ? '借りない　▶で選べます' : '借りられる助っ人がいません', { fontSize: '19px', color: h0 ? '#f5e6c8' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    if (h0) row.add(body(scene, w / 2 - 20, -20, `総合力 ${fullDigits(h0.power)}`, { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    const step = (delta: number): void => {
      // -1 (none), 0 .. n-1
      const n = helpers.length;
      index = ((index + 1 + delta + (n + 1)) % (n + 1)) - 1;
      choice.helper = index >= 0 ? helpers[index] : null;
      // Redrawn after this tap has finished: the button being replaced is still handling it.
      scene.time.delayedCall(0, draw);
    };
    const prev = new Button(scene, w / 2 - 110, 18, 60, 44, '◀', () => step(-1), { variant: 'wood', fontSize: '22px' });
    const next = new Button(scene, w / 2 - 40, 18, 60, 44, '▶', () => step(1), { variant: 'wood', fontSize: '22px' });
    prev.setEnabled(helpers.length > 0);
    next.setEnabled(helpers.length > 0);
    row.add([prev, next]);
  };
  draw();
}

/**
 * Starts the scene a 出撃 leads to, borrowing the chosen 助っ人 first (once per fight): the borrowed copy goes into the
 * Battle scene's data as `helper` (also when the route goes through a story scene on its way to the fight).
 */
export async function launchWithHelper(scene: Phaser.Scene, save: SaveData, route: { scene: string; data: object }, helper: HelperHero | null): Promise<void> {
  let borrowed: HelperHero | null = null;
  if (helper) {
    const result = await AllianceService.borrowHelper(save, helper.ownerUid);
    if (result.ok) borrowed = result.value;
    else showToast(scene, `助っ人を借りられませんでした：${result.message}`, '#ffb0a0');
  }
  if (!scene.scene.isActive()) return;
  if (!borrowed) {
    scene.scene.start(route.scene, route.data);
    return;
  }
  const data = { ...(route.data as Record<string, unknown>) };
  const next = data.next as { scene: string; data: Record<string, unknown> } | undefined;
  if (route.scene === 'Battle') data.helper = borrowed;
  else if (next?.scene === 'Battle') data.next = { ...next, data: { ...next.data, helper: borrowed } };
  scene.scene.start(route.scene, data);
}
