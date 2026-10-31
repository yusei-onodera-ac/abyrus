import Phaser from 'phaser';
import { PremiumSystem } from '../systems/PremiumSystem';
import type { SaveData } from '../systems/SaveSystem';
import { openConfirm } from './Dialogs';
import { body, CHROME } from './theme';

const KEY = 'autoAdvance';
const WINS_KEY = 'autoAdvanceWins';
const INK = '#1c130a';

/** 連戦: after a win the fight goes straight on to the next stage by itself, over and over,
 *  until the party loses (or the stamina or the stages run out). プレミアムパス限定.
 *  Switched on in the 出撃 popup (see addChainRow). Kept for the session only (the game
 *  registry), not in the save: a new visit starts with it off, and the Home and quest-list
 *  screens switch it off (see stopAutoAdvance). */
export const AutoAdvance = {
  isOn(game: Phaser.Game, save: SaveData): boolean {
    return game.registry.get(KEY) === true && PremiumSystem.isActive(save);
  },
  set(game: Phaser.Game, on: boolean): void {
    game.registry.set(KEY, on);
    game.registry.set(WINS_KEY, 0);
  },
  /** Stages won in the current 連戦. */
  wins(game: Phaser.Game): number {
    return (game.registry.get(WINS_KEY) as number | undefined) ?? 0;
  },
  addWin(game: Phaser.Game): void {
    game.registry.set(WINS_KEY, AutoAdvance.wins(game) + 1);
  },
};

/** Switches 連戦 off - when the player walks away from the chain on their own (Home, the
 *  quest list), so that the next fight they pick is just one fight. */
export function stopAutoAdvance(game: Phaser.Game): void {
  AutoAdvance.set(game, false);
}

/** How tall the 連戦 row is, for a popup making room for it. */
export const CHAIN_ROW_HEIGHT = 108;

/**
 * The 連戦 switch as a row inside the 出撃 popup, centred on (360, `y`): its name and what it
 * does on the left, an ON/OFF switch on the right. Without the pass the switch is replaced by a
 * パス限定 tag, and tapping the row says what the pass offers.
 */
export function addChainRow(scene: Phaser.Scene, container: Phaser.GameObjects.Container, y: number, save: SaveData): void {
  const w = 520;
  const h = 88;
  const row = scene.add.container(360, y);
  container.add(row);

  const draw = (): void => {
    row.removeAll(true);
    const member = PremiumSystem.isActive(save);
    const on = AutoAdvance.isOn(scene.game, save);

    const bg = scene.add.graphics();
    bg.fillStyle(0x1a1209, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(2, on ? CHROME.brassBright : CHROME.brassDark, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    row.add(bg);
    row.add(body(scene, -w / 2 + 22, -17, '連戦', { fontSize: '28px', fontStyle: 'bold', color: on ? '#ffd23f' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    row.add(body(scene, -w / 2 + 22, 20, '負けるまで、自動で次のステージへ', { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    const sx = w / 2 - 82;
    const sw = scene.add.graphics();
    if (member) {
      // The switch: a pill with a knob that slides to the ON side, lit orange when on.
      sw.fillStyle(on ? 0xe0822a : 0x3a2a18, 1);
      sw.fillRoundedRect(sx - 56, -25, 112, 50, 25);
      sw.lineStyle(3, on ? CHROME.brassBright : CHROME.brass, 1);
      sw.strokeRoundedRect(sx - 56, -25, 112, 50, 25);
      sw.fillStyle(0xfff4dc, 1);
      sw.fillCircle(sx + (on ? 31 : -31), 0, 19);
      sw.lineStyle(2, CHROME.brassDark, 1);
      sw.strokeCircle(sx + (on ? 31 : -31), 0, 19);
      row.add(sw);
      row.add(body(scene, sx + (on ? -17 : 17), 0, on ? 'ON' : 'OFF', { fontSize: '19px', fontStyle: 'bold', color: on ? '#ffffff' : '#d8c49a', stroke: on ? '#4a2406' : INK, strokeThickness: 3 }).setOrigin(0.5));
    } else {
      sw.fillStyle(0x3a2a18, 1);
      sw.fillRoundedRect(sx - 56, -21, 112, 42, 21);
      sw.lineStyle(2, CHROME.brass, 1);
      sw.strokeRoundedRect(sx - 56, -21, 112, 42, 21);
      row.add(sw);
      row.add(body(scene, sx, 0, 'パス限定', { fontSize: '20px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    }

    const zone = scene.add.zone(0, 0, w, h).setOrigin(0.5);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (!member) {
        openConfirm(scene, { setEnabled: () => {} }, {
          title: '連戦はプレミアムパス限定です',
          message: '勝つたびに自動で次のステージへ進み、\n負けるまで挑み続けます。',
          confirmLabel: 'パスを見る',
          confirmVariant: 'gold',
          onConfirm: () => scene.scene.start('Premium'),
        });
        return;
      }
      AutoAdvance.set(scene.game, !on);
      // Redrawn after this tap has finished: the row being replaced is still handling it.
      scene.time.delayedCall(0, draw);
    });
    row.add(zone);
  };
  draw();
}
