import Phaser from 'phaser';
import { RemoteMaintenance, maintenanceMessageText } from '../systems/RemoteMaintenance';
import { Button } from '../ui/Button';
import { wrappedText } from '../ui/CardParts';
import { createDivider, createPanel } from '../ui/Panel';
import { CHROME, heading } from '../ui/theme';
import { t } from '../i18n';

export interface MaintenanceData {
  message: string;
  /** Where to go when the メンテナンス is over (what Boot would have started). */
  next: { scene: string; data?: object };
}

/** How often it asks again by itself while it is showing. */
const RECHECK_MS = 30_000;

/**
 * メンテナンス中: shown at launch, instead of Home, while the operator has メンテナンス switched on in the admin
 * (Firestore `config/maintenance`, see systems/RemoteMaintenance.ts). It asks again every 30 s and from the button, and carries on
 * to the screen Boot had chosen as soon as the メンテナンス is off.
 */
export class MaintenanceScene extends Phaser.Scene {
  private going = false;

  constructor() {
    super('Maintenance');
  }

  create(data: MaintenanceData): void {
    this.going = false;
    this.cameras.main.setBackgroundColor('#0a0b12');
    const w = 600;
    const h = 560;
    const cy = 600;
    const inner = w - 80;
    const left = 360 - inner / 2;
    createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false });
    heading(this, 360, cy - h / 2 + 64, t('home.maintenance.underMaintenance'), { fontSize: '40px' }).setOrigin(0.5);
    createDivider(this, 360, cy - h / 2 + 112, inner, CHROME.brassDark);
    wrappedText(this, left, cy - h / 2 + 140, maintenanceMessageText(data.message), inner, { fontSize: '25px', color: '#f5e6c8', lineSpacing: 10 });
    const status = this.add.text(360, cy + h / 2 - 150, '', { fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#9a8a6a' }).setOrigin(0.5);

    const recheck = async (): Promise<void> => {
      if (this.going) return;
      status.setText(t('home.maintenance.checking'));
      const state = await RemoteMaintenance.check();
      if (this.going) return;
      if (!state.enabled) {
        this.going = true;
        this.scene.start(data.next.scene, data.next.data);
        return;
      }
      status.setText(t('home.maintenance.stillUnderMaintenance'));
    };
    new Button(this, 360, cy + h / 2 - 80, 380, 76, t('home.maintenance.checkAgain'), () => void recheck(), { variant: 'wood', fontSize: '26px' });
    this.time.addEvent({ delay: RECHECK_MS, loop: true, callback: () => void recheck() });
  }
}
