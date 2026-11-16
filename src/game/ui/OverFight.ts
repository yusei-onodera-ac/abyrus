import type Phaser from 'phaser';

/**
 * Opens `target` laid over the running fight: the fight's own scene is paused (its clock, tweens and units stand still,
 * and its result is not lost), and `target` is told which scene to resume when it is closed (data.overlayOf).
 * Starting `target` the usual way would end the fight scene for good.
 */
export function openOverFight(fight: Phaser.Scene, target: string): void {
  fight.scene.pause();
  fight.scene.launch(target, { overlayOf: fight.scene.key });
  fight.scene.bringToTop(target);
}
