import Phaser from 'phaser';
import { PREMIUM } from '../data/premium';
import { PremiumSystem } from '../systems/PremiumSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { SettingsSystem } from '../systems/SettingsSystem';
import { Button } from './Button';
import { openConfirm } from './Dialogs';

/** The 2倍速 button beside オート in a fight: プレミアムパス members switch the fight
 *  to double speed (kept in the settings); anyone else gets told what the pass offers. */
export class SpeedToggle extends Phaser.GameObjects.Container {
  private readonly save: SaveData;

  constructor(scene: Phaser.Scene, save: SaveData, x = 350, y = 1190) {
    super(scene, x, y);
    this.save = save;
    this.setDepth(30);
    this.render();
    scene.add.existing(this);
  }

  /** How many times faster the fight should run right now (1 or the pass's speed). */
  factor(): number {
    return PremiumSystem.battleSpeed(this.save);
  }

  private render(): void {
    this.removeAll(true);
    const member = PremiumSystem.isActive(this.save);
    const on = this.factor() > 1;
    this.add(
      new Button(this.scene, 0, 0, 220, 76, `${PREMIUM.battleSpeed}倍速`, () => this.tap(), {
        variant: on ? 'gold' : 'wood',
        fontSize: '30px',
        subLabel: !member ? 'パス限定' : on ? 'ON' : 'OFF',
      }),
    );
  }

  private tap(): void {
    if (!PremiumSystem.isActive(this.save)) {
      openConfirm(this.scene, { setEnabled: () => {} }, {
        title: `${PREMIUM.battleSpeed}倍速はプレミアムパス限定です`,
        message: `プレミアムパスに加入すると、\nクエストも無限モードも${PREMIUM.battleSpeed}倍の速さで進められます。`,
        confirmLabel: 'パスを見る',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.scene.start('Premium'),
      });
      return;
    }
    SettingsSystem.setSpeed2x(this.save, !SettingsSystem.getSpeed2x(this.save));
    SaveSystem.save(this.save);
    // Rebuilt after this tap has finished: the button being replaced is still handling it.
    this.scene.time.delayedCall(0, () => this.render());
  }
}
