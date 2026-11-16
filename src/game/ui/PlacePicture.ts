import Phaser from 'phaser';
import { EXPEDITIONS } from '../data/expeditions';
import { CHROME } from './theme';

/**
 * 場所の絵: a wide painting behind the header of a card - the 曜日ダンジョン of the day and each 遠征 (public/assets/weekday/<sun..sat>.jpg,
 * public/assets/expedition/<trip id>.jpg). A picture that is missing is skipped (the card stays plain).
 */
const DAY_FILES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function weekdayPictureKey(day: number): string {
  return `place_weekday_${DAY_FILES[((day % 7) + 7) % 7]}`;
}

export function expeditionPictureKey(id: string): string {
  return `place_expedition_${id}`;
}

export function preloadPlacePictures(scene: Phaser.Scene): void {
  for (const file of DAY_FILES) scene.load.image(`place_weekday_${file}`, `/assets/weekday/${file}.jpg`);
  for (const def of EXPEDITIONS) scene.load.image(expeditionPictureKey(def.id), `/assets/expedition/${def.id}.jpg`);
}

/** Adds the picture `key` into `container` as a w x h window at (x, y) (top-left), cropped to fit, darkened by `dim` so text laid over it
 *  stays readable, with a thin brass edge. Returns false when the picture is not loaded. Call before adding the text. */
export function addPlacePicture(scene: Phaser.Scene, container: Phaser.GameObjects.Container, key: string, x: number, y: number, w: number, h: number, dim = 0.5): boolean {
  if (!scene.textures.exists(key)) return false;
  const frame = scene.textures.getFrame(key);
  const scale = Math.max(w / frame.width, h / frame.height);
  const cropW = w / scale;
  const cropH = h / scale;
  const image = scene.add.image(x + w / 2, y + h / 2, key).setScale(scale);
  image.setCrop((frame.width - cropW) / 2, (frame.height - cropH) / 2, cropW, cropH);
  const shade = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, dim);
  const edge = scene.add.graphics();
  edge.lineStyle(2, CHROME.brassDark, 1);
  edge.strokeRect(x, y, w, h);
  container.add([image, shade, edge]);
  return true;
}
