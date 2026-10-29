import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { SettingsSystem } from '../systems/SettingsSystem';
import { Button } from './Button';

/** The オート button in a fight's lower-right corner: while it is ON, a hero's
 *  skill is cast as soon as its gauge is full, without tapping the hero. The
 *  choice is kept in the settings, so it stays as the player left it. */
export class AutoSkillToggle extends Phaser.GameObjects.Container {
  private readonly save: SaveData;

  constructor(scene: Phaser.Scene, save: SaveData, x = 600, y = 1190) {
    super(scene, x, y);
    this.save = save;
    this.setDepth(30);
    this.render();
    scene.add.existing(this);
  }

  isOn(): boolean {
    return SettingsSystem.getAutoSkill(this.save);
  }

  private render(): void {
    this.removeAll(true);
    const on = this.isOn();
    this.add(
      new Button(this.scene, 0, 0, 220, 76, 'オート', () => this.toggle(), {
        variant: on ? 'gold' : 'wood',
        fontSize: '30px',
        subLabel: on ? 'スキル自動発動 ON' : 'OFF',
      }),
    );
  }

  private toggle(): void {
    SettingsSystem.setAutoSkill(this.save, !this.isOn());
    SaveSystem.save(this.save);
    // Rebuilt after this tap has finished: the button being replaced is still handling it.
    this.scene.time.delayedCall(0, () => this.render());
  }
}
