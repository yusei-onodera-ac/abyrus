import Phaser from 'phaser';
import type { LegalDocument } from '../data/legal';
import { Button } from './Button';
import { wrappedText } from './CardParts';
import { openModal, type ModalHandle } from './Modal';
import { createDivider, createPanel } from './Panel';
import { ScrollView } from './ScrollView';
import { heading, CHROME } from './theme';

const INK = '#1c130a';

/** A規約-style document in a popup of its own, scrolling when it's long
 *  (privacy policy, terms, the legal notices). */
export function openDocument(scene: Phaser.Scene, scroll: ScrollView, doc: LegalDocument): ModalHandle {
  const handle = openModal(scene, scroll, 0.75, false);
  const modal = handle.container;
  const w = 620;
  const h = 1000;
  const cy = 640;
  const top = cy - h / 2;
  const inner = w - 64;
  const left = 360 - inner / 2;

  modal.add(createPanel(scene, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
  modal.add(scene.add.zone(360, cy, w, h).setInteractive());
  modal.add(heading(scene, 360, top + 50, doc.title, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
  modal.add(wrappedText(scene, 360, top + 90, `最終更新日：${doc.updatedAt}`, inner, { fontSize: '16px', color: '#9a8a6a' }).setOrigin(0.5, 0));

  const viewTop = top + 128;
  modal.add(createDivider(scene, 360, viewTop - 8, inner, CHROME.brassDark));
  const viewH = top + h - 112 - viewTop;
  const view = new ScrollView(scene, left, viewTop, inner, viewH);
  view.setDepth(201);

  let y = 4;
  const add = (text: Phaser.GameObjects.Text, gap: number): void => {
    view.content.add(text);
    y += text.height + gap;
  };
  if (doc.intro) add(wrappedText(scene, 0, y, doc.intro, inner, { fontSize: '19px', color: '#f5e6c8', lineSpacing: 6 }), 22);
  for (const section of doc.sections) {
    if (section.heading) add(wrappedText(scene, 0, y, section.heading, inner, { fontSize: '22px', fontStyle: 'bold', color: '#ffe9b8', strokeThickness: 3 }), 8);
    for (const paragraph of section.body) add(wrappedText(scene, 0, y, paragraph, inner, { fontSize: '19px', color: '#f5e6c8', lineSpacing: 6 }), 14);
    y += 10;
  }
  view.setContentHeight(y);

  const close = (): void => {
    view.destroy();
    handle.close();
  };
  modal.add(new Button(scene, 360, top + h - 56, 240, 68, '閉じる', close, { variant: 'wood', fontSize: '24px' }));
  return { container: modal, close };
}
