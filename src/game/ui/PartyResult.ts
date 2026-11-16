import Phaser from 'phaser';
import type { BattleFx } from '../characters/BattleFx';
import type { CharacterGenerator } from '../characters/CharacterGenerator';
import { expToNextLevel } from '../systems/LevelCurve';
import { SoundSystem } from '../systems/SoundSystem';
import { MAX_LEVEL, type HeroData } from '../types';
import { HeroSlot } from './HeroSlot';
import { CHROME, body, caption } from './theme';

const INK = '#1c130a';
const CELL_W = 116;
const SLOT = 92;
const BAR_W = 96;
const BAR_H = 12;
const BAR_Y = 134;

/** What one party member got from the fight: the level and EXP they started it with
 *  (the hero itself already holds the result). */
export interface PartyGain {
  hero: HeroData;
  levelBefore: number;
  expBefore: number;
  /** EXP this fight paid them (0 when they were already at the top level). */
  gained: number;
}

export interface PartyResult {
  container: Phaser.GameObjects.Container;
  height: number;
  /** Starts the bars filling and the level-up bursts. Call once the container is in place. */
  play(): void;
}

const ratioOf = (level: number, exp: number): number => (level >= MAX_LEVEL ? 1 : Phaser.Math.Clamp(exp / expToNextLevel(level), 0, 1));

/**
 * The party on the result panel: each hero's portrait with their level, an EXP bar that fills
 * (spilling over into a LEVEL UP burst when a level is gained) and the EXP the fight paid.
 */
export function buildPartyResult(scene: Phaser.Scene, generator: CharacterGenerator, fx: BattleFx, gains: PartyGain[], width: number): PartyResult {
  const container = scene.add.container(0, 0);
  const startX = (width - gains.length * CELL_W) / 2 + CELL_W / 2;
  const height = 176;
  let fanfare = false;

  const cells = gains.map((gain, i) => {
    const cx = startX + i * CELL_W;
    const { hero } = gain;
    const cell = scene.add.container(cx, 0);
    container.add(cell);

    cell.add(new HeroSlot(scene, 0, 8 + SLOT / 2, { hero, generator, hideLevel: true }, SLOT));
    const level = body(scene, 0, 112, `Lv.${gain.levelBefore}`, { fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
    cell.add(level);
    const bar = scene.add.graphics();
    cell.add(bar);
    const atMax = gain.levelBefore >= MAX_LEVEL;
    const sub = caption(scene, 0, 158, atMax ? 'MAX' : `EXP +${gain.gained.toLocaleString('ja-JP')}`, { fontSize: '18px', fontStyle: 'bold', color: atMax ? '#ffd23f' : '#9fd8ff', stroke: INK, strokeThickness: 3 }).setOrigin(0.5);
    cell.add(sub);

    const draw = (ratio: number): void => {
      bar.clear();
      bar.fillStyle(0x0d0905, 1);
      bar.fillRoundedRect(-BAR_W / 2, BAR_Y, BAR_W, BAR_H, 6);
      if (ratio > 0) {
        bar.fillStyle(ratio >= 1 ? 0xffd23f : 0xe0822a, 1);
        bar.fillRoundedRect(-BAR_W / 2, BAR_Y, Math.max(BAR_H, BAR_W * ratio), BAR_H, 6);
        bar.fillStyle(0xffffff, 0.25);
        bar.fillRoundedRect(-BAR_W / 2 + 2, BAR_Y + 2, Math.max(BAR_H - 4, BAR_W * ratio - 4), 4, 2);
      }
      bar.lineStyle(2, CHROME.brassDark, 1);
      bar.strokeRoundedRect(-BAR_W / 2, BAR_Y, BAR_W, BAR_H, 6);
    };
    draw(ratioOf(gain.levelBefore, gain.expBefore));
    return { gain, cell, level, sub, draw, cx };
  });

  const fill = (draw: (ratio: number) => void, from: number, to: number, ms: number, done?: () => void): void => {
    scene.tweens.addCounter({
      from,
      to,
      duration: ms,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => draw(tween.getValue() ?? to),
      onComplete: () => {
        draw(to);
        done?.();
      },
    });
  };

  const levelUpBurst = (cell: Phaser.GameObjects.Container, level: Phaser.GameObjects.Text, to: number): void => {
    fx.levelUp(container.x + cell.x, container.y + 8 + SLOT / 2);
    if (!fanfare) {
      fanfare = true;
      SoundSystem.play(scene, 'levelup');
    }
    level.setText(`Lv.${to}`).setColor('#ffd23f').setScale(1.9);
    scene.tweens.add({ targets: level, scale: 1.15, duration: 320, ease: 'Back.easeOut' });

    const badge = scene.add.container(0, 0).setScale(0);
    const label = scene.add
      .text(0, 0, 'LEVEL UP!', { fontFamily: 'Arial Black, sans-serif', fontSize: '19px', color: '#fff4a8', stroke: '#8a3a00', strokeThickness: 5 })
      .setOrigin(0.5);
    const pill = scene.add.graphics();
    pill.fillStyle(0x3a1a00, 0.92);
    pill.fillRoundedRect(-label.width / 2 - 8, -15, label.width + 16, 30, 10);
    pill.lineStyle(2, CHROME.brassBright, 1);
    pill.strokeRoundedRect(-label.width / 2 - 8, -15, label.width + 16, 30, 10);
    badge.add([pill, label]);
    cell.add(badge);
    scene.tweens.add({ targets: badge, scale: 1, duration: 300, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: badge, y: 4, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 300 });
  };

  const animate = (c: (typeof cells)[number]): void => {
    const { gain, cell, level, sub, draw } = c;
    const hero = gain.hero;
    if (gain.levelBefore >= MAX_LEVEL) return;
    scene.tweens.add({ targets: sub, scale: 1.35, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    const before = ratioOf(gain.levelBefore, gain.expBefore);
    const after = ratioOf(hero.level, hero.exp);
    if (hero.level === gain.levelBefore) {
      fill(draw, before, after, 700);
      return;
    }
    // Up to the top of the bar, a burst, then on into the new level's bar.
    fill(draw, before, 1, 520, () => {
      levelUpBurst(cell, level, hero.level);
      scene.time.delayedCall(260, () => fill(draw, 0, after, 520));
    });
  };

  return {
    container,
    height,
    play(): void {
      cells.forEach((c, i) => scene.time.delayedCall(i * 150, () => animate(c)));
    },
  };
}
