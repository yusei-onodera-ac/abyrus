import './style.css';
import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { HomeScene } from './game/scenes/HomeScene';
import { BattleScene } from './game/scenes/BattleScene';
import { GachaScene } from './game/scenes/GachaScene';
import { RosterScene } from './game/scenes/RosterScene';
import { NoticeScene } from './game/scenes/NoticeScene';
import { GiftScene } from './game/scenes/GiftScene';
import { MailScene } from './game/scenes/MailScene';
import { FriendScene } from './game/scenes/FriendScene';
import { MessageScene } from './game/scenes/MessageScene';
import { HeroDetailScene } from './game/scenes/HeroDetailScene';
import { EnhanceScene } from './game/scenes/EnhanceScene';
import { StageSelectScene } from './game/scenes/StageSelectScene';
import { StoryScene } from './game/scenes/StoryScene';
import { EventScene } from './game/scenes/EventScene';
import { InfiniteLobbyScene } from './game/scenes/InfiniteLobbyScene';
import { InfiniteModeScene } from './game/scenes/InfiniteModeScene';
import { EquipmentScene } from './game/scenes/EquipmentScene';
import { GearPickScene } from './game/scenes/GearPickScene';
import { IdleScene } from './game/scenes/IdleScene';
import { PremiumScene } from './game/scenes/PremiumScene';
import { ShopScene } from './game/scenes/ShopScene';
import { SettingsScene } from './game/scenes/SettingsScene';

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
  // Lets a scene overlay a real <input> (deck naming) so mobile keyboards/IME work.
  dom: { createContainer: true },
  scene: [
    BootScene,
    HomeScene,
    BattleScene,
    GachaScene,
    RosterScene,
    NoticeScene,
    GiftScene,
    MailScene,
    FriendScene,
    MessageScene,
    HeroDetailScene,
    EnhanceScene,
    StageSelectScene,
    StoryScene,
    EventScene,
    InfiniteLobbyScene,
    InfiniteModeScene,
    EquipmentScene,
    GearPickScene,
    IdleScene,
    PremiumScene,
    ShopScene,
    SettingsScene,
  ],
};

new Phaser.Game(config);
