import Phaser from 'phaser';
import { BottomNavBar, type NavTab } from '../ui/BottomNavBar';
import { applyBackground } from '../ui/Background';
import { heading, body } from '../ui/theme';
import { enter } from '../ui/Transitions';

/** Shared placeholder for bottom-nav tabs that don't have a real screen
 *  yet (Event/Legion/Profile/Settings). Keeps the tab bar live and
 *  tappable everywhere even before those features exist, instead of the
 *  tab doing nothing. */
export abstract class ComingSoonScene extends Phaser.Scene {
  protected abstract readonly tab: NavTab;
  protected abstract readonly title: string;

  create(): void {
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, this.tab);

    const title = heading(this, 360, 160, this.title, { fontSize: '30px' }).setOrigin(0.5);
    const sub = body(this, 360, 210, '準備中です', { fontSize: '16px', color: '#9a93b8' }).setOrigin(0.5);
    enter(this, title, { dy: -14, duration: 340 });
    enter(this, sub, { dy: -8, duration: 300, delay: 60 });

    new BottomNavBar(this, this.scale.width, this.scale.height, this.tab);
  }
}

export class EventScene extends ComingSoonScene {
  protected readonly tab: NavTab = 'event';
  protected readonly title = 'イベント';
  constructor() {
    super('Event');
  }
}

export class LegionScene extends ComingSoonScene {
  protected readonly tab: NavTab = 'legion';
  protected readonly title = '軍団';
  constructor() {
    super('Legion');
  }
}

export class ProfileScene extends ComingSoonScene {
  protected readonly tab: NavTab = 'profile';
  protected readonly title = 'プロフィール';
  constructor() {
    super('Profile');
  }
}

export class SettingsScene extends ComingSoonScene {
  protected readonly tab: NavTab = 'settings';
  protected readonly title = '設定';
  constructor() {
    super('Settings');
  }
}
