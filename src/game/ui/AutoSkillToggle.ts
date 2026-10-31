import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { SettingsSystem } from '../systems/SettingsSystem';
import { BATTLE_CONTROL_POS, RoundControl } from './BattleControl';

/** The オート button at the bottom right of a fight: while it is ON, a hero's
 *  skill is cast as soon as its gauge is full, without tapping the hero. The
 *  choice is kept in the settings, so it stays as the player left it. */
export class AutoSkillToggle extends Phaser.GameObjects.Container {
  private readonly save: SaveData;

  constructor(scene: Phaser.Scene, save: SaveData, x = BATTLE_CONTROL_POS.auto.x, y = BATTLE_CONTROL_POS.auto.y) {
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
    this.add(new RoundControl(this.scene, 'オート', on ? 'ON' : 'OFF', on, () => this.toggle()));
  }

  private toggle(): void {
    SettingsSystem.setAutoSkill(this.save, !this.isOn());
    SaveSystem.save(this.save);
    // Rebuilt after this tap has finished: the button being replaced is still handling it.
    this.scene.time.delayedCall(0, () => this.render());
  }
}
