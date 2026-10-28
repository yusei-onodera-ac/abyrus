import './style.css';
import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { HomeScene } from './game/scenes/HomeScene';
import { BattleScene } from './game/scenes/BattleScene';
import { GachaScene } from './game/scenes/GachaScene';
import { RosterScene } from './game/scenes/RosterScene';
import { HeroDetailScene } from './game/scenes/HeroDetailScene';
import { StageSelectScene } from './game/scenes/StageSelectScene';
import { EventScene, LegionScene, ProfileScene, SettingsScene } from './game/scenes/ComingSoonScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#10121c',
  scale: {
    // EXPAND keeps the design width (720) fixed and stretches the design
    // height to match whatever the real device's aspect ratio actually is,
    // so the canvas fills the full screen edge-to-edge on any phone - no
    // FIT-mode letterbox bars, and nothing cropped either. Every screen's
    // background/bottom-bar/overlay code reads the live this.scale.height
    // instead of assuming 1280, so they stretch to fill whatever height
    // EXPAND computes.
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 1280,
  },
  fps: { target: 60 },
  scene: [
    BootScene,
    HomeScene,
    BattleScene,
    GachaScene,
    RosterScene,
    HeroDetailScene,
    StageSelectScene,
    EventScene,
    LegionScene,
    ProfileScene,
    SettingsScene,
  ],
};

new Phaser.Game(config);
