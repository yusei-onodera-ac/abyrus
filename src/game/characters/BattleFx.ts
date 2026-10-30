import Phaser from 'phaser';
import { heading } from '../ui/theme';

/**
 * Battle spectacle: everything that makes a hit, a skill, a kill and a win feel big - spark
 * bursts, shockwave rings, slashes, screen flashes and shakes, the skill-name banner, the
 * combo counter and the victory confetti. One of these per battle scene (BattleScene and
 * InfiniteModeScene both use it, so they cannot drift apart). The particle emitters are
 * made once and reused for every burst, like the damage popups.
 */
export type FxPalette = 'white' | 'fire' | 'gold' | 'green' | 'violet' | 'cyan' | 'blood';

const COLORS_BY_PALETTE: Record<FxPalette, number[]> = {
  white: [0xffffff, 0xfff2b0, 0xffd23f],
  fire: [0xfff6c0, 0xffa530, 0xff4b1f],
  gold: [0xffffff, 0xffe27a, 0xffb21e],
  green: [0xe8ffe0, 0x7bff9a, 0x24c46a],
  violet: [0xf4e8ff, 0xb97bff, 0x6a3fb0],
  cyan: [0xffffff, 0x9fe0ff, 0x3a9bd6],
  blood: [0xffd0c0, 0xff5a4a, 0x8a1020],
};

/** The solid colour of each palette (rings, flashes, banners). */
const MAIN: Record<FxPalette, number> = {
  white: 0xffffff,
  fire: 0xff7a2a,
  gold: 0xffd23f,
  green: 0x5fe08a,
  violet: 0xb07bff,
  cyan: 0x7fd4ff,
  blood: 0xff4a3a,
};

/** Which look each kind of skill gets. */
function paletteOf(kind: string): FxPalette {
  if (kind.startsWith('heal') || kind === 'revive') return 'green';
  if (kind.startsWith('buff')) return 'gold';
  if (kind.startsWith('debuff')) return 'violet';
  if (kind === 'stun') return 'violet';
  if (kind === 'invincible') return 'cyan';
  return 'fire';
}

const hexString = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const STAR = 'fx_star';
const CONFETTI = 'fx_confetti';
const DEPTH = 900;

function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(STAR)) {
    const g = scene.add.graphics();
    const c = 16;
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 2;
      const r = i % 2 === 0 ? 15 : 3.4;
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * r, c + Math.sin(a) * r));
    }
    g.fillStyle(0xffffff, 1);
    g.fillPoints(pts, true);
    g.fillCircle(c, c, 4.5);
    g.generateTexture(STAR, 32, 32);
    g.destroy();
  }
  if (!scene.textures.exists(CONFETTI)) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 12, 7);
    g.generateTexture(CONFETTI, 12, 7);
    g.destroy();
  }
}

/** Anything on screen that has a vertical position: a sprite, a bar, a label. */
export type Positioned = Phaser.GameObjects.GameObject & { y: number };

export class BattleFx {
  private scene: Phaser.Scene;
  private emitters = new Map<FxPalette, Phaser.GameObjects.Particles.ParticleEmitter>();
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private comboCount = 0;
  private comboText?: Phaser.GameObjects.Text;
  private comboTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureTextures(scene);
    for (const palette of Object.keys(COLORS_BY_PALETTE) as FxPalette[]) {
      const emitter = scene.add
        .particles(0, 0, STAR, {
          emitting: false,
          lifespan: { min: 320, max: 760 },
          speed: { min: 140, max: 420 },
          scale: { start: 1.15, end: 0 },
          alpha: { start: 1, end: 0 },
          rotate: { min: 0, max: 360 },
          color: COLORS_BY_PALETTE[palette],
          blendMode: 'ADD',
          gravityY: 260,
        })
        .setDepth(DEPTH);
      this.emitters.set(palette, emitter);
    }
    this.confetti = scene.add
      .particles(0, 0, CONFETTI, {
        emitting: false,
        lifespan: 1700,
        speedX: { min: -140, max: 140 },
        speedY: { min: 120, max: 420 },
        gravityY: 360,
        rotate: { min: 0, max: 360 },
        scaleX: { start: 1.1, end: 0.2 },
        scaleY: 1.1,
        alpha: { start: 1, end: 0.85 },
        color: [0xff5a7a, 0xffd23f, 0x5fe08a, 0x7fd4ff, 0xb07bff, 0xffffff],
      })
      .setDepth(DEPTH - 2);
  }

  // ------------------------------------------------------------ entrances --

  /** The party rising in from below the screen, one after another (the parts of one unit
   *  together), each springing up a little past where it stands. `onDone` runs when the last
   *  one has landed - decided by the animations themselves, not a timer: Phaser's tweens and
   *  its timers keep separate clocks, and after a tab is stopped and resumed a timer could say
   *  "ready" while the party was still on its way up, letting the fight start behind them. */
  rise(units: Positioned[][], onDone: () => void): void {
    const gap = 110;
    const duration = 640;
    let pending = 0;
    const landed = (): void => {
      pending -= 1;
      if (pending === 0) onDone();
    };
    units.forEach((parts, i) => {
      for (const p of parts) {
        const rest = p.y;
        p.y = rest + 720;
        pending += 1;
        this.scene.tweens.add({ targets: p, y: rest, delay: 80 + i * gap, duration, ease: 'Back.easeOut', onComplete: landed });
      }
    });
    if (pending === 0) onDone();
  }

  /** The party floating up off the top of the screen, fading, after a win. `onDone` runs when
   *  the last one is gone (again by the animations, not a timer). */
  exit(units: Positioned[][], onDone: () => void): void {
    const gap = 70;
    const duration = 720;
    let pending = 0;
    const gone = (): void => {
      pending -= 1;
      if (pending === 0) onDone();
    };
    units.forEach((parts, i) => {
      for (const p of parts) {
        pending += 1;
        this.scene.tweens.add({ targets: p, y: p.y - 620, alpha: 0, delay: i * gap, duration, ease: 'Cubic.easeIn', onComplete: gone });
      }
    });
    if (pending === 0) onDone();
  }

  // ------------------------------------------------------------- pieces --

  private burst(palette: FxPalette, x: number, y: number, count: number): void {
    this.emitters.get(palette)?.explode(count, x, y);
  }

  /** An expanding ring that fades: the shockwave. */
  private ring(x: number, y: number, color: number, from: number, to: number, ms: number, width = 5): void {
    const g = this.scene.add.graphics({ x, y }).setDepth(DEPTH - 1).setBlendMode(Phaser.BlendModes.ADD);
    // Redrawn each frame so the line thins as the ring grows (scaling it would thicken it).
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        g.clear();
        g.lineStyle(Math.max(1, width * (1 - t)), color, 1 - t);
        g.strokeCircle(0, 0, from + (to - from) * t);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** A bright streak across the impact. */
  private slash(x: number, y: number, color: number, length: number): void {
    const bar = this.scene.add.rectangle(x, y, length, 7, color, 1).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
    bar.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-60, 60)));
    bar.setScale(0.2, 1);
    this.scene.tweens.add({
      targets: bar,
      scaleX: 1.2,
      scaleY: 0.2,
      alpha: 0,
      duration: 190,
      ease: 'Cubic.easeOut',
      onComplete: () => bar.destroy(),
    });
  }

  /** A soft white disc that swells and fades: the flash of an explosion. */
  private flashDisc(x: number, y: number, color: number, radius: number): void {
    const disc = this.scene.add.circle(x, y, radius, color, 0.9).setDepth(DEPTH - 1).setBlendMode(Phaser.BlendModes.ADD);
    disc.setScale(0.25);
    this.scene.tweens.add({ targets: disc, scale: 1.6, alpha: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => disc.destroy() });
  }

  private shake(ms: number, strength: number): void {
    this.scene.cameras.main.shake(ms, strength);
  }

  private flash(ms: number, color: number): void {
    const rgb = Phaser.Display.Color.IntegerToRGB(color);
    this.scene.cameras.main.flash(ms, rgb.r, rgb.g, rgb.b, true);
  }

  // ---------------------------------------------------------------- hits --

  /** A hit landing: sparks, a ring and (bigger hits) a slash, a flash and a shake. */
  hit(x: number, y: number, opts: { crit?: boolean; big?: boolean; palette?: FxPalette } = {}): void {
    const crit = !!opts.crit;
    const big = !!opts.big || crit;
    const palette = opts.palette ?? (crit ? 'fire' : 'white');
    this.burst(palette, x, y, crit ? 30 : big ? 18 : 10);
    if (crit) this.burst('gold', x, y, 14);
    this.ring(x, y, MAIN[crit ? 'gold' : palette], 10, crit ? 96 : big ? 70 : 44, crit ? 300 : 220, crit ? 7 : 5);
    if (big) this.slash(x, y, 0xffffff, crit ? 150 : 100);
    if (crit) {
      this.flash(110, 0xffffff);
      this.shake(240, 0.013);
    } else if (big) {
      this.shake(150, 0.006);
    } else {
      this.shake(70, 0.0025);
    }
  }

  /** A blocked hit (the target is invincible): a cold ping instead of damage. */
  block(x: number, y: number): void {
    this.burst('cyan', x, y, 8);
    this.ring(x, y, MAIN.cyan, 12, 56, 240);
  }

  /** A non-damage skill landing on someone, shown so it can be read at a glance: a burst and
   *  a ring, then a mark that fits what it does (green crosses rising, gold arrows up, violet
   *  arrows down, stars circling the head, a bubble of light) and a word beside it. */
  status(x: number, y: number, kind: 'heal' | 'buff' | 'debuff' | 'stun' | 'invincible', label?: string): void {
    const palette: FxPalette = kind === 'heal' ? 'green' : kind === 'buff' ? 'gold' : kind === 'invincible' ? 'cyan' : 'violet';
    this.burst(palette, x, y, kind === 'heal' ? 16 : 12);
    this.ring(x, y, MAIN[palette], 14, 74, 320);
    if (kind === 'heal') this.ring(x, y, MAIN.green, 8, 46, 260, 3);
    const color = MAIN[palette];
    if (kind === 'heal') this.risingGlyphs(x, y, '＋', color, 5, -78);
    else if (kind === 'buff') this.risingGlyphs(x, y, '▲', color, 3, -70);
    else if (kind === 'debuff') this.risingGlyphs(x, y - 50, '▼', color, 3, 60);
    else if (kind === 'stun') this.orbitStars(x, y - 52);
    else this.bubble(x, y);
    if (label) this.floatLabel(x, y - 66, label, color);
  }

  /** Glyphs drifting from around a point, one after another: up for a negative `dy`, down for a positive one. */
  private risingGlyphs(x: number, y: number, glyph: string, color: number, count: number, dy: number): void {
    for (let i = 0; i < count; i++) {
      const gx = x + (i - (count - 1) / 2) * 26 + Phaser.Math.Between(-6, 6);
      const t = this.scene.add
        .text(gx, y + (dy > 0 ? 0 : 14), glyph, { fontFamily: 'Arial Black, sans-serif', fontSize: '34px', color: hexString(color), stroke: '#1c130a', strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(DEPTH + 4)
        .setAlpha(0);
      this.scene.tweens.add({
        targets: t,
        y: t.y + dy,
        alpha: { from: 1, to: 0 },
        scale: { from: 0.7, to: 1.3 },
        delay: i * 90,
        duration: 760,
        ease: 'Cubic.easeOut',
        onStart: () => t.setAlpha(1),
        onComplete: () => t.destroy(),
      });
    }
  }

  /** Three stars circling above a stunned unit's head. */
  private orbitStars(x: number, y: number): void {
    const stars = [0, 1, 2].map(() =>
      this.scene.add
        .text(x, y, '★', { fontFamily: 'Arial Black, sans-serif', fontSize: '30px', color: '#ffe27a', stroke: '#8a5a00', strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(DEPTH + 4),
    );
    this.scene.tweens.addCounter({
      from: 0,
      to: Math.PI * 4,
      duration: 1500,
      onUpdate: (tween) => {
        const a = tween.getValue() ?? 0;
        stars.forEach((star, i) => {
          const angle = a + (i * Math.PI * 2) / 3;
          star.setPosition(x + Math.cos(angle) * 34, y + Math.sin(angle) * 11);
          star.setScale(0.8 + 0.25 * Math.sin(angle));
        });
      },
      onComplete: () => stars.forEach((star) => star.destroy()),
    });
  }

  /** A shimmering bubble of light round an invincible unit. */
  private bubble(x: number, y: number): void {
    const g = this.scene.add.graphics({ x, y }).setDepth(DEPTH + 3).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1300,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const r = 52 + 8 * Math.sin(t * Math.PI * 6);
        const a = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
        g.clear();
        g.fillStyle(MAIN.cyan, 0.2 * a);
        g.fillCircle(0, 0, r);
        g.lineStyle(4, 0xffffff, 0.9 * a);
        g.strokeCircle(0, 0, r);
        g.lineStyle(2, MAIN.cyan, 0.7 * a);
        g.strokeCircle(0, 0, r - 7);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** A short word popping up beside a unit: 攻撃UP, スタン, ... */
  private floatLabel(x: number, y: number, text: string, color: number): void {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#ffffff', stroke: hexString(color), strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(DEPTH + 6)
      .setScale(0.3);
    this.scene.tweens.add({ targets: t, scale: 1.1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, delay: 620, duration: 380, onComplete: () => t.destroy() });
  }

  // --------------------------------------------------------------- skills --

  /** A skill being cast: a coloured flash, a burst and ring on the caster and (for a
   *  hero's own) the skill's name sweeping across the field. */
  skillStart(x: number, y: number, kind: string, name: string, fromPlayer: boolean): void {
    const palette = paletteOf(kind);
    const color = MAIN[palette];
    this.flash(fromPlayer ? 150 : 90, color);
    this.burst(palette, x, y, 24);
    this.burst('white', x, y, 10);
    this.ring(x, y, color, 18, 120, 420, 8);
    this.ring(x, y, 0xffffff, 10, 80, 300, 4);
    this.shake(fromPlayer ? 200 : 100, fromPlayer ? 0.007 : 0.003);
    if (fromPlayer) this.banner(name, color);
  }

  /** The skill's name, big, sweeping in over a coloured band and out the other side. */
  private banner(name: string, color: number): void {
    const y = 585;
    const band = this.scene.add.rectangle(360, y, 820, 84, color, 0.55).setDepth(DEPTH + 10).setRotation(Phaser.Math.DegToRad(-3));
    band.setBlendMode(Phaser.BlendModes.ADD);
    band.setScale(1, 0);
    const text = heading(this.scene, -260, y, name, {
      fontSize: '50px',
      color: '#ffffff',
      stroke: hexString(color),
      strokeThickness: 10,
    })
      .setOrigin(0.5)
      .setDepth(DEPTH + 11)
      .setRotation(Phaser.Math.DegToRad(-3));
    this.scene.tweens.add({ targets: band, scaleY: 1, duration: 140, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({
      targets: text,
      x: 360,
      duration: 240,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          scale: 1.08,
          duration: 360,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
        this.scene.time.delayedCall(560, () => {
          this.scene.tweens.add({ targets: text, x: 980, alpha: 0, duration: 260, ease: 'Cubic.easeIn', onComplete: () => text.destroy() });
          this.scene.tweens.add({ targets: band, alpha: 0, scaleY: 0, duration: 260, onComplete: () => band.destroy() });
        });
      },
    });
  }

  /** A glowing orb flying from `from` to `to`, shedding sparks; `arrive` runs when it lands (the
   *  hit, the number). Returns how long it flies, so the caller can hold back what should follow it. */
  travel(from: { x: number; y: number }, to: { x: number; y: number }, kind: string, arrive: () => void): number {
    const palette = paletteOf(kind);
    const color = MAIN[palette];
    const ms = Phaser.Math.Clamp(Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) * 0.5, 150, 300);
    const halo = this.scene.add.circle(from.x, from.y, 34, color, 0.45).setDepth(DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD);
    const orb = this.scene.add.circle(from.x, from.y, 15, 0xffffff, 1).setDepth(DEPTH + 3).setBlendMode(Phaser.BlendModes.ADD);
    // A bright line from the caster, so the path reads even for a fast orb.
    const streak = this.scene.add.graphics().setDepth(DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: [halo, orb],
      x: to.x,
      y: to.y,
      duration: ms,
      ease: 'Cubic.easeIn',
      onUpdate: () => {
        this.emitters.get(palette)?.emitParticleAt(orb.x, orb.y, 2);
        streak.clear();
        streak.lineStyle(10, color, 0.45);
        streak.lineBetween(from.x, from.y, orb.x, orb.y);
        streak.lineStyle(4, 0xffffff, 0.9);
        streak.lineBetween(from.x, from.y, orb.x, orb.y);
      },
      onComplete: () => {
        halo.destroy();
        orb.destroy();
        this.scene.tweens.add({ targets: streak, alpha: 0, duration: 160, onComplete: () => streak.destroy() });
        arrive();
      },
    });
    return ms;
  }

  /** A hero's gauge just filled: a ping to say 撃てる. */
  ready(x: number, y: number): void {
    this.burst('gold', x, y, 12);
    this.ring(x, y, MAIN.gold, 16, 70, 380, 4);
  }

  // ---------------------------------------------------------------- kills --

  /** A unit going down: an enemy bursts (a flash disc, a fireball of sparks, a big ring and a
   *  shake); a fallen ally just fades in violet sparks. */
  kill(x: number, y: number, ally: boolean): void {
    if (ally) {
      this.burst('violet', x, y, 14);
      this.ring(x, y, MAIN.violet, 14, 60, 320);
      return;
    }
    this.flashDisc(x, y, 0xffffff, 56);
    this.burst('fire', x, y, 36);
    this.burst('gold', x, y, 14);
    this.ring(x, y, MAIN.fire, 16, 130, 380, 8);
    this.shake(190, 0.008);
  }

  // ---------------------------------------------------------------- combo --

  /** One more hit by the player's side: the running HIT counter punches up. */
  combo(): void {
    this.comboCount += 1;
    this.comboTimer?.remove();
    this.comboTimer = this.scene.time.delayedCall(1800, () => this.endCombo());
    if (this.comboCount < 3) return;
    const n = this.comboCount;
    const color = n >= 20 ? '#ff4a3a' : n >= 10 ? '#ff9a2a' : n >= 5 ? '#ffd23f' : '#ffffff';
    if (!this.comboText) {
      this.comboText = this.scene.add
        .text(700, 560, '', { fontFamily: 'Arial Black, sans-serif', fontSize: '44px', color: '#ffffff', stroke: '#1c130a', strokeThickness: 8 })
        .setOrigin(1, 0.5)
        .setDepth(DEPTH + 5);
    }
    const text = this.comboText;
    this.scene.tweens.killTweensOf(text);
    text.setText(`${n} HIT!`);
    text.setColor(color);
    text.setAlpha(1).setVisible(true).setScale(1.55).setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-5, 3)));
    this.scene.tweens.add({ targets: text, scale: 1, rotation: 0, duration: 170, ease: 'Back.easeOut' });
  }

  /** Ends the combo counter at once (the fight is over: the result panel must not sit under it). */
  clearCombo(): void {
    this.comboTimer?.remove();
    this.comboCount = 0;
    if (!this.comboText) return;
    this.scene.tweens.killTweensOf(this.comboText);
    this.comboText.setVisible(false).setAlpha(0).setY(560);
  }

  private endCombo(): void {
    this.comboCount = 0;
    const text = this.comboText;
    if (!text) return;
    this.scene.tweens.add({ targets: text, alpha: 0, y: text.y - 24, duration: 360, onComplete: () => text.setVisible(false).setY(560) });
  }

  // -------------------------------------------------------------- victory --

  /** The last enemy down: a white flash, a shake and a rain of confetti. */
  victory(): void {
    this.flash(220, 0xffffff);
    this.shake(300, 0.01);
    this.rain(90);
    this.scene.time.delayedCall(450, () => this.rain(60));
  }

  /** Confetti falling from the top edge, scattered along it. */
  private rain(count: number): void {
    for (let i = 0; i < count; i++) this.confetti.emitParticleAt(Phaser.Math.Between(0, 720), Phaser.Math.Between(-40, -10), 1);
  }

  /** Sparks and rings for a party member levelling up on the result panel. */
  levelUp(x: number, y: number): void {
    this.burst('gold', x, y, 34);
    this.burst('white', x, y, 12);
    this.ring(x, y, MAIN.gold, 20, 110, 500, 7);
    this.ring(x, y, 0xffffff, 12, 80, 380, 4);
  }
}
