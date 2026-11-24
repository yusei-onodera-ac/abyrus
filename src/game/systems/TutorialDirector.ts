import Phaser from 'phaser';
import { TUTORIAL_REWARD, VILLAGE_TUTORIAL_REWARD } from '../data/tutorial';
import { showRewardModal } from '../ui/RewardModal';
import { ResourceBar } from '../ui/ResourceBar';
import { tilesForGranted } from '../ui/RewardTiles';
import { openRestoreFlow } from '../ui/TransferDialogs';
import { TutorialOverlay } from '../ui/TutorialOverlay';
import { RewardSystem } from './RewardSystem';
import { SaveSystem, type SaveData } from './SaveSystem';
import { TutorialSystem } from './TutorialSystem';
import { t } from '../i18n';

let overlay: TutorialOverlay | undefined;
/** True from the moment a step is due until its overlay is gone: a fight waits for it. */
let waiting = false;

function getSave(scene: Phaser.Scene): SaveData | undefined {
  return scene.game.registry.get('save');
}

function clear(): void {
  overlay?.destroy();
  overlay = undefined;
  waiting = false;
}

/** Decides when the チュートリアル's next step is shown. Installed once by BootScene: it
 *  watches every scene being created, and shows the step that belongs to that scene. A
 *  scene can also ask for a step that is due at a moment of its own (the fight's result). */
export const TutorialDirector = {
  install(game: Phaser.Game): void {
    for (const scene of game.scene.scenes) {
      scene.events.on(Phaser.Scenes.Events.CREATE, () => this.onSceneCreated(scene));
      scene.events.on(Phaser.Scenes.Events.SHUTDOWN, () => clear());
    }
  },

  /** True while a step is on its way or on screen - a battle holds still meanwhile. */
  isBlocking(): boolean {
    return waiting;
  },

  onSceneCreated(scene: Phaser.Scene): void {
    this.maybeShow(scene, 'enter', 450);
  },

  /** A scene reports a moment a step may be waiting for (e.g. 'result'). */
  trigger(scene: Phaser.Scene, event: 'result'): void {
    this.maybeShow(scene, event, 500);
  },

  maybeShow(scene: Phaser.Scene, event: 'enter' | 'result', delay: number): void {
    const save = getSave(scene);
    if (!save) return;
    const step = TutorialSystem.active(save);
    if (!step || step.scene !== scene.scene.key || (step.on ?? 'enter') !== event) return;
    waiting = true;
    scene.time.delayedCall(delay, () => this.show(scene));
  },

  show(scene: Phaser.Scene): void {
    const save = getSave(scene);
    const step = save ? TutorialSystem.active(save) : null;
    if (!save || !step || step.scene !== scene.scene.key || !scene.scene.isActive()) {
      waiting = false;
      return;
    }
    overlay?.destroy();
    overlay = new TutorialOverlay(scene, step, save, {
      onAdvance: () => this.advance(scene, save),
      onSkip: () => {
        TutorialSystem.skip(save);
        SaveSystem.save(save);
        clear();
      },
      onName: (name) => this.confirmName(scene, save, name),
      onTransfer: () => this.openTransfer(scene, save),
    });
  },

  /** The 名前 step is answered: the name is kept, and the tutorial goes on with its next step. */
  confirmName(scene: Phaser.Scene, save: SaveData, name: string): void {
    if (!TutorialSystem.confirmName(save, name)) return;
    SaveSystem.save(save);
    // The name on the top bar (Home built it with the old one).
    for (const child of scene.children.list) if (child instanceof ResourceBar) child.update(save);
    clear();
    this.maybeShow(scene, 'enter', 320);
  },

  /** データを引き継ぐ, chosen on the 名前 step: the step steps aside while the popups run (the overlay would sit above them).
   *  Backing out brings it back; a restore that goes through ends the tutorial for the new save and reopens Home with it. */
  openTransfer(scene: Phaser.Scene, save: SaveData): void {
    overlay?.destroy();
    overlay = undefined;
    openRestoreFlow(scene, { setEnabled: () => undefined }, {
      local: save,
      finishTutorial: true,
      onCancel: () => this.show(scene),
      onDone: (restored) => {
        scene.game.registry.set('save', restored);
        clear();
        scene.scene.restart();
      },
    });
  },

  advance(scene: Phaser.Scene, save: SaveData): void {
    const finished = TutorialSystem.advance(save);
    SaveSystem.save(save);
    clear();
    if (finished) {
      const village = finished === 'village';
      const granted = RewardSystem.grantAll(save, village ? VILLAGE_TUTORIAL_REWARD : TUTORIAL_REWARD);
      SaveSystem.save(save);
      // Reopen the screen afterwards so the top bar shows what came with it.
      showRewardModal(scene, { setEnabled: () => undefined }, {
        title: village ? t('tutorial.done.village') : t('tutorial.done.main'),
        tiles: tilesForGranted(granted),
        note: village ? t('tutorial.done.villageNote') : t('tutorial.done.mainNote'),
        onClose: () => scene.scene.restart(),
      });
      return;
    }
    // The next step may be on this same screen (e.g. the 出撃 popup that the last press opened).
    this.maybeShow(scene, 'enter', 320);
  },
};
