import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const save = SaveSystem.load();
    this.game.registry.set('save', save);
    this.scene.start('Home');
  }
}
