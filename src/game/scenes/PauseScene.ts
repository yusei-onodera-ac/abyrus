import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { caption, CHROME, heading } from '../ui/theme';

const INK = '#1c130a';

export interface PauseData {
  /** The scene that is paused underneath (resumed when this closes). */
  of: string;
  /** Called after the paused scene has been resumed. */
  onSuspend?: () => void;
  onRetire?: () => void;
  /** Lines under the title. */
  lines?: string[];
}

/**
 * 一時停止: a popup laid over a paused fight (the fight's own scene is paused, so its clock, tweens and units stand
 * still exactly as they were). 再開 carries on; 中断 and リタイア are handed back to the fight's scene to do.
 */
export class PauseScene extends Phaser.Scene {
  private data0!: PauseData;

  constructor() {
    super('Pause');
  }

  init(data: PauseData): void {
    this.data0 = data;
  }

  create(): void {
    const data = this.data0;
    this.add.rectangle(360, 640, 720, 1280, 0x05060c, 0.78).setInteractive();
    const w = 600;
    const count = 1 + (data.onSuspend ? 1 : 0) + (data.onRetire ? 1 : 0);
    const h = 190 + count * 100;
    createPanel(this, 360, 640, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 20, gradient: false });
    const top = 640 - h / 2;
    heading(this, 360, top + 62, '一時停止', { fontSize: '46px', color: '#ffe9b8', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);
    (data.lines ?? []).forEach((line, i) => {
      caption(this, 360, top + 122 + i * 30, line, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3, align: 'center' }).setOrigin(0.5);
    });

    let y = top + 200;
    new Button(this, 360, y, w - 80, 84, '再開', () => this.close(), { variant: 'gold', fontSize: '34px' });
    if (data.onSuspend) {
      y += 104;
      new Button(this, 360, y, w - 80, 76, '中断して戻る', () => this.close(data.onSuspend), { variant: 'wood', fontSize: '28px', subLabel: '続きは、あとから再開できます' });
    }
    if (data.onRetire) {
      y += 100;
      new Button(this, 360, y, w - 80, 76, 'リタイア', () => this.close(data.onRetire), { variant: 'wood', fontSize: '28px', subLabel: 'ここまでの記録で終了します' });
    }
  }

  /** Back to the fight (resumed first, so what the callback does happens in a running scene). */
  private close(then?: () => void): void {
    const key = this.data0.of;
    this.scene.stop();
    this.scene.resume(key);
    then?.();
  }
}
