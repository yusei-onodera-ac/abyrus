import Phaser from 'phaser';
import { MovieSystem } from '../systems/MovieSystem';
import { body } from './theme';

const INK = '#1c130a';
/** Above the scene's popups (depth 200), so the next layer can be built underneath. */
const DEPTH = 300;

export interface MovieOverlayOptions {
  /** 0..1. */
  volume: number;
  /** The movie ended, was skipped, or there is none: build whatever comes next now. It is put
   *  up underneath the movie, which then fades away over it - no black gap in between. */
  onEnd: () => void;
}

/**
 * Plays `public/assets/movies/<id>.mp4` over the whole screen (kept whole, black where the
 * shapes differ), skippable with a tap. Meant to be called from a tap, which is what lets the
 * browser play it with sound. With no such movie, or one that cannot play, `onEnd` runs at once.
 */
export function playMovieOverlay(scene: Phaser.Scene, id: string, opts: MovieOverlayOptions): void {
  void MovieSystem.has(id).then((has) => {
    if (!has || !scene.sys.isActive()) {
      opts.onEnd();
      return;
    }
    const key = `movie_${id}`;
    if (!scene.cache.video.exists(key)) scene.cache.video.add(key, { url: MovieSystem.url(id), noAudio: false });

    const cover = scene.add.rectangle(360, 640, 720, 1280, 0x000000, 1).setDepth(DEPTH).setInteractive();
    const video = scene.add.video(360, 640, key).setDepth(DEPTH + 1);
    video.setVolume(opts.volume);
    const hint = body(scene, 360, 1232, 'タップでスキップ', { fontSize: '24px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0.5).setDepth(DEPTH + 2).setAlpha(0);
    scene.tweens.add({ targets: hint, alpha: 0.75, delay: 1200, duration: 400 });

    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      video.pause();
      opts.onEnd();
      scene.tweens.add({
        targets: [cover, video, hint],
        alpha: 0,
        duration: 380,
        onComplete: () => {
          video.destroy();
          cover.destroy();
          hint.destroy();
        },
      });
    };
    video.on(Phaser.GameObjects.Events.VIDEO_CREATED, (_v: unknown, w: number, h: number) => {
      if (w > 0 && h > 0) video.setScale(Math.min(720 / w, 1280 / h));
    });
    video.on(Phaser.GameObjects.Events.VIDEO_COMPLETE, finish);
    video.on(Phaser.GameObjects.Events.VIDEO_ERROR, finish);
    cover.on('pointerup', finish);
    video.play(false);
  });
}
