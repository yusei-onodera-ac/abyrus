import Phaser from 'phaser';
import { TUTORIAL_REWARD } from '../data/tutorial';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForGranted } from '../ui/RewardTiles';
import { TutorialOverlay } from '../ui/TutorialOverlay';
import { RewardSystem } from './RewardSystem';
import { SaveSystem, type SaveData } from './SaveSystem';
import { TutorialSystem } from './TutorialSystem';

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
    const step = TutorialSystem.current(save);
    if (!step || step.scene !== scene.scene.key || (step.on ?? 'enter') !== event) return;
    waiting = true;
    scene.time.delayedCall(delay, () => this.show(scene));
  },

  show(scene: Phaser.Scene): void {
    const save = getSave(scene);
    const step = save ? TutorialSystem.current(save) : null;
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
    });
  },

  advance(scene: Phaser.Scene, save: SaveData): void {
    const finished = TutorialSystem.advance(save);
    SaveSystem.save(save);
    clear();
    if (finished) {
      const granted = RewardSystem.grantAll(save, TUTORIAL_REWARD);
      SaveSystem.save(save);
      // Reopen the screen afterwards so the top bar shows what came with it.
      showRewardModal(scene, { setEnabled: () => undefined }, { title: 'チュートリアル完了！', tiles: tilesForGranted(granted), note: 'ルリより：おつかれさま！ これからもよろしくね。', onClose: () => scene.scene.restart() });
      return;
    }
    // The next step may be on this same screen (e.g. the 出撃 popup that the last press opened).
    this.maybeShow(scene, 'enter', 320);
  },
};
