import './style.css';
import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { HomeScene } from './game/scenes/HomeScene';
import { BattleScene } from './game/scenes/BattleScene';
import { GachaScene } from './game/scenes/GachaScene';
import { GachaDetailScene } from './game/scenes/GachaDetailScene';
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
import { EnhanceHubScene } from './game/scenes/EnhanceHubScene';
import { EquipmentScene } from './game/scenes/EquipmentScene';
import { GearPickScene } from './game/scenes/GearPickScene';
import { HomeHeroScene } from './game/scenes/HomeHeroScene';
import { MissionScene } from './game/scenes/MissionScene';
import { IdleScene } from './game/scenes/IdleScene';
import { ExpeditionScene } from './game/scenes/ExpeditionScene';
import { WeekdayDungeonScene } from './game/scenes/WeekdayDungeonScene';
import { VillageScene } from './game/scenes/VillageScene';
import { PremiumScene } from './game/scenes/PremiumScene';
import { PauseScene } from './game/scenes/PauseScene';
import { AllianceFindScene } from './game/scenes/AllianceFindScene';
import { AllianceHomeScene } from './game/scenes/AllianceHomeScene';
import { AllianceMembersScene } from './game/scenes/AllianceMembersScene';
import { AllianceDonateScene } from './game/scenes/AllianceDonateScene';
import { AllianceShopScene } from './game/scenes/AllianceShopScene';
import { AllianceChatScene } from './game/scenes/AllianceChatScene';
import { AllianceRaidScene } from './game/scenes/AllianceRaidScene';
import { AllianceRaidBattleScene } from './game/scenes/AllianceRaidBattleScene';
import { AllianceWarScene } from './game/scenes/AllianceWarScene';
import { AllianceHelperScene } from './game/scenes/AllianceHelperScene';
import { ShopScene } from './game/scenes/ShopScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { showDevNotice } from './devNotice';

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
    GachaDetailScene,
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
    EnhanceHubScene,
    EquipmentScene,
    GearPickScene,
    HomeHeroScene,
    MissionScene,
    IdleScene,
    ExpeditionScene,
    WeekdayDungeonScene,
    VillageScene,
    PremiumScene,
    PauseScene,
    AllianceFindScene,
    AllianceHomeScene,
    AllianceMembersScene,
    AllianceDonateScene,
    AllianceShopScene,
    AllianceChatScene,
    AllianceRaidScene,
    AllianceRaidBattleScene,
    AllianceWarScene,
    AllianceHelperScene,
    ShopScene,
    SettingsScene,
  ],
};

// The dev environment (deploy/dev/deploy.sh builds it with VITE_DEV_ENV=1) says what it is before anything else.
if (import.meta.env.VITE_DEV_ENV === '1') showDevNotice();

new Phaser.Game(config);
