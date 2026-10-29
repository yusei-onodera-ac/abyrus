import Phaser from 'phaser';
import { buildCardPanel } from './CardParts';

const INK = '#1c130a';
export const INFO_HEADER_HEIGHT = 36;

/** A wood-and-brass panel with a coloured title strip across its top, like the
 *  reference's skill boxes (orange / green / red). Origin is the panel's
 *  top-left; put the contents in `container`, starting at `bodyTop`. */
export function buildInfoPanel(
  scene: Phaser.Scene,
  width: number,
  bodyHeight: number,
  title: string,
  headerColor: number,
): { container: Phaser.GameObjects.Container; height: number; bodyTop: number } {
  const height = INFO_HEADER_HEIGHT + bodyHeight;
  const container = scene.add.container(0, 0);
  container.add(buildCardPanel(scene, width, height));

  const header = scene.add.graphics();
  header.fillStyle(headerColor, 1);
  header.fillRoundedRect(4, 4, width - 8, INFO_HEADER_HEIGHT - 4, { tl: 11, tr: 11, bl: 0, br: 0 });
  header.fillStyle(0xffffff, 0.2);
  header.fillRoundedRect(6, 6, width - 12, (INFO_HEADER_HEIGHT - 8) / 2, { tl: 9, tr: 9, bl: 0, br: 0 });
  container.add(header);
  container.add(
    scene.add
      .text(16, INFO_HEADER_HEIGHT / 2 + 2, title, { fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 })
      .setOrigin(0, 0.5),
  );
  return { container, height, bodyTop: INFO_HEADER_HEIGHT };
}
