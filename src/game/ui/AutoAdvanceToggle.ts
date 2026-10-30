import Phaser from 'phaser';
import { PremiumSystem } from '../systems/PremiumSystem';
import type { SaveData } from '../systems/SaveSystem';
import { Button } from './Button';
import { openConfirm } from './Dialogs';

const KEY = 'autoAdvance';
const WINS_KEY = 'autoAdvanceWins';

/** 連戦: after a win the fight goes straight on to the next stage by itself, over and over,
 *  until the party loses (or the stamina or the stages run out). プレミアムパス限定.
 *  Kept for the session only (the game registry), not in the save: a new visit starts with
 *  it off, and the Home and quest-list screens switch it off (see stopAutoAdvance). */
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

/** The 連戦 button at the bottom-left of a fight, beside オート and 2倍速. */
export class AutoAdvanceToggle extends Phaser.GameObjects.Container {
  private readonly save: SaveData;

  constructor(scene: Phaser.Scene, save: SaveData, x = 118, y = 1190) {
    super(scene, x, y);
    this.save = save;
    this.setDepth(30);
    this.render();
    scene.add.existing(this);
  }

  isOn(): boolean {
    return AutoAdvance.isOn(this.scene.game, this.save);
  }

  /** Redraws the button (after the chain was ended from outside it). */
  refresh(): void {
    this.render();
  }

  private render(): void {
    this.removeAll(true);
    const member = PremiumSystem.isActive(this.save);
    const on = this.isOn();
    this.add(
      new Button(this.scene, 0, 0, 200, 76, '連戦', () => this.tap(), {
        variant: on ? 'gold' : 'wood',
        fontSize: '30px',
        subLabel: !member ? 'パス限定' : on ? 'ON' : 'OFF',
      }),
    );
  }

  private tap(): void {
    if (!PremiumSystem.isActive(this.save)) {
      openConfirm(this.scene, { setEnabled: () => {} }, {
        title: '連戦はプレミアムパス限定です',
        message: '勝つたびに自動で次のステージへ進み、\n負けるまで挑み続けます。',
        confirmLabel: 'パスを見る',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.scene.start('Premium'),
      });
      return;
    }
    AutoAdvance.set(this.scene.game, !this.isOn());
    // Rebuilt after this tap has finished: the button being replaced is still handling it.
    this.scene.time.delayedCall(0, () => this.render());
  }
}
