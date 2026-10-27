import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { HERO_ROSTER } from '../data/heroes';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Illustration PNGs are optional: most heroes won't have one yet, and a
    // missing file must not break the load queue. CharacterGenerator falls
    // back to procedural art whenever textures.exists(heroId) is false.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {});
    for (const hero of HERO_ROSTER) {
      this.load.image(hero.id, `/assets/characters/${hero.id}.png`);
    }
  }

  create(): void {
    const save = SaveSystem.load();
    this.game.registry.set('save', save);
    this.scene.start('Home');
  }
}
