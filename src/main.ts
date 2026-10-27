import './style.css';
import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { HomeScene } from './game/scenes/HomeScene';
import { BattleScene } from './game/scenes/BattleScene';
import { GachaScene } from './game/scenes/GachaScene';
import { RosterScene } from './game/scenes/RosterScene';
import { HeroDetailScene } from './game/scenes/HeroDetailScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#10121c',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 1280,
  },
  fps: { target: 60 },
  scene: [BootScene, HomeScene, BattleScene, GachaScene, RosterScene, HeroDetailScene],
};

new Phaser.Game(config);
