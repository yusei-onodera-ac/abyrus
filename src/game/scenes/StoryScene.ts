import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { STORY_BACKGROUNDS, STORY_BACKGROUND_REGION, type StoryLine, type RuriPortrait } from '../data/storyScript';
import { REGIONS } from '../data/regions';
import { MovieSystem } from '../systems/MovieSystem';
import { SettingsSystem } from '../systems/SettingsSystem';
import { ruriTexture } from '../ui/PetPortrait';
import { Button } from '../ui/Button';
import { wrapToWidth } from '../ui/CardParts';
import { createPanel } from '../ui/Panel';
import { drawScenery } from '../ui/StageMap';
import { CHROME, COLORS, body, subheading } from '../ui/theme';
import { enter } from '../ui/Transitions';

/** What flag (if any) to persist once the player reaches the end of this
 *  script, so re-entering the same trigger point later skips straight to
 *  `next` instead of replaying. Declarative on purpose (plain data, not a
 *  callback) so it can travel through `scene.start(key, data)` the same
 *  way every other scene transition in this game already does. */
export type StoryMarkSeen = { kind: 'regionIntro' | 'regionOutro'; regionIndex: number } | { kind: 'finalIntro' | 'ending' | 'opening' };

export interface StoryIntent {
  /** The script's id: if `public/assets/movies/<id>.mp4` exists it plays instead of the text. */
  id?: string;
  lines: StoryLine[];
  next: { scene: string; data?: Record<string, unknown> };
  markSeen?: StoryMarkSeen;
}

const INK = '#1c130a';
/** Set after the first tap that starts a movie: later movies in the session start by themselves. */
let movieUnlocked = false;
const PANEL_Y = 1068;
const PANEL_WIDTH = 690;
const PANEL_HEIGHT = 330;
const MS_PER_CHAR = 28;
const TEXT_SIZE = 25;
const TEXT_STROKE = 4;

/**
 * Novel-game-style story player: a full-bleed backdrop (the region's
 * scenery over the story background's gradient, or story_<key>.jpg when
 * supplied), a wood/brass dialogue panel matching the rest of the game's chrome
 * (Panel.ts / theme.ts conventions), a speaker nameplate, a tiny
 * procedurally-drawn portrait (Ruri gets a handful of mood variants; every
 * other speaker gets one generic silhouette bust - no cutscene art exists
 * yet, see storyScript.ts's doc comment), and tap/click-to-advance text
 * with a lightweight typewriter reveal. Driven entirely by the StoryIntent
 * passed via scene.start('Story', intent) - this scene has no idea which
 * story beat it's playing, so new script content never needs scene
 * changes, only new storyScript.ts entries.
 */
export class StoryScene extends Phaser.Scene {
  private save!: SaveData;
  private lines: StoryLine[] = [];
  private next!: StoryIntent['next'];
  private markSeen?: StoryMarkSeen;
  private lineIndex = 0;

  private bgContainer?: Phaser.GameObjects.Container;
  private bgKey = '';
  private bgTween?: Phaser.Tweens.Tween;

  private nameplate?: Phaser.GameObjects.Container;
  private portrait?: Phaser.GameObjects.Container;
  private bodyText!: Phaser.GameObjects.Text;
  private advanceHint!: Phaser.GameObjects.Text;

  private fullText = '';
  private charIndex = 0;
  private charTimer = 0;
  private lineDone = false;
  private scriptId?: string;
  private video?: Phaser.GameObjects.Video;
  /** Counts the times the scene has been started, so an answer that arrives late is ignored. */
  private token = 0;

  constructor() {
    super('Story');
  }

  init(data: StoryIntent): void {
    this.token += 1;
    this.scriptId = data.id;
    this.video = undefined;
    this.lines = data.lines;
    this.next = data.next;
    this.markSeen = data.markSeen;
    this.lineIndex = 0;
    this.bgKey = '';
    this.bgContainer = undefined;
    this.bgTween = undefined;
  }

  private movieKey(): string {
    return `movie_${this.scriptId}`;
  }

  /** The movie for this script, if one was supplied (public/assets/movies/<id>.mp4, see
   *  MovieSystem): it plays instead of the text, so a script needs no setup to get one. */
  create(): void {
    this.save = this.game.registry.get('save');
    this.cameras.main.setBackgroundColor('#0a0a0e');
    this.buildSkipButton();
    const id = this.scriptId;
    if (!id) {
      this.startText();
      return;
    }
    this.lineDone = true;
    const token = this.token;
    void MovieSystem.has(id).then((has) => {
      if (token !== this.token || !this.sys.isActive()) return; // the scene moved on while we asked
      if (has) this.startMovie(id);
      else this.startText();
    });
  }

  private startText(): void {
    this.lineDone = false;
    this.buildDialoguePanel();
    const tapZone = this.add.zone(360, 640, 720, 1280).setOrigin(0.5).setDepth(5);
    tapZone.setInteractive({ useHandCursor: true });
    tapZone.on('pointerup', () => this.onTap());
    this.showLine(0);
  }

  /** Plays the movie full screen (kept whole, black bars where the shapes differ), then goes
   *  on. Browsers only allow sound after a tap, so the first movie of a session waits for
   *  one. Anything that goes wrong falls back to the text. */
  private startMovie(id: string): void {
    // What Phaser's video loader would have cached; the Video object does the real loading.
    if (!this.cache.video.exists(this.movieKey())) this.cache.video.add(this.movieKey(), { url: MovieSystem.url(id), noAudio: false });
    const video = this.add.video(360, 640, this.movieKey()).setDepth(1);
    this.video = video;
    video.setVolume(SettingsSystem.getVolume(this.save, 'voice'));
    video.on(Phaser.GameObjects.Events.VIDEO_CREATED, (_v: unknown, w: number, h: number) => {
      if (w > 0 && h > 0) video.setScale(Math.min(720 / w, 1280 / h));
    });
    video.on(Phaser.GameObjects.Events.VIDEO_COMPLETE, () => this.finish());
    video.on(Phaser.GameObjects.Events.VIDEO_ERROR, () => {
      video.destroy();
      this.video = undefined;
      this.startText();
    });

    const play = (): void => {
      movieUnlocked = true;
      video.play(false);
    };
    if (movieUnlocked) {
      play();
      return;
    }
    const cover = this.add.container(0, 0).setDepth(4);
    cover.add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 1).setInteractive());
    cover.add(subheading(this, 360, 600, 'ムービー', { fontSize: '44px', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
    const tap = body(this, 360, 690, 'タップで再生', { fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
    cover.add(tap);
    this.tweens.add({ targets: tap, alpha: { from: 1, to: 0.3 }, duration: 700, yoyo: true, repeat: -1 });
    cover.once('destroy', () => this.tweens.killTweensOf(tap));
    cover.list[0].once('pointerup', () => {
      cover.destroy();
      play();
    });
  }

  update(_time: number, delta: number): void {
    if (this.lineDone || !this.bodyText) return;
    this.charTimer += delta;
    while (this.charTimer >= MS_PER_CHAR && this.charIndex < this.fullText.length) {
      this.charTimer -= MS_PER_CHAR;
      this.charIndex++;
    }
    this.bodyText.setText(this.fullText.slice(0, this.charIndex));
    if (this.charIndex >= this.fullText.length) {
      this.lineDone = true;
      this.advanceHint.setVisible(true);
    }
  }

  // ----------------------------------------------------------------- UI --

  private buildDialoguePanel(): void {
    const panel = createPanel(this, 360, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, {
      fillColor: CHROME.woodFill,
      fillAlpha: 0.95,
      borderColor: CHROME.brassDark,
      glowColor: CHROME.brass,
      radius: 18,
      rarity: 4,
    }).setDepth(2);

    this.bodyText = body(this, 360 - PANEL_WIDTH / 2 + 34, PANEL_Y - PANEL_HEIGHT / 2 + 46, '', {
      fontSize: `${TEXT_SIZE}px`,
      color: '#fff0cc',
      stroke: INK,
      strokeThickness: TEXT_STROKE,
      lineSpacing: 12,
    }).setDepth(3);

    this.advanceHint = body(this, 360 + PANEL_WIDTH / 2 - 38, PANEL_Y + PANEL_HEIGHT / 2 - 30, '▼', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(3)
      .setVisible(false);
    this.tweens.add({ targets: this.advanceHint, y: this.advanceHint.y + 6, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    void panel;
  }

  private buildSkipButton(): void {
    const btn = new Button(this, 626, 62, 158, 60, 'スキップ', () => this.finish(), { variant: 'wood', fontSize: '24px' });
    btn.setDepth(6);
    enter(this, btn, { duration: 240 });
  }

  // --------------------------------------------------------------- flow --

  private onTap(): void {
    if (!this.lineDone) {
      this.charIndex = this.fullText.length;
      this.bodyText.setText(this.fullText);
      this.lineDone = true;
      this.advanceHint.setVisible(true);
      return;
    }
    const nextIndex = this.lineIndex + 1;
    if (nextIndex >= this.lines.length) {
      this.finish();
    } else {
      this.showLine(nextIndex);
    }
  }

  private showLine(index: number): void {
    this.lineIndex = index;
    const line = this.lines[index];

    this.fullText = wrapToWidth(line.text, PANEL_WIDTH - 68, TEXT_SIZE, TEXT_STROKE);
    this.charIndex = 0;
    this.charTimer = 0;
    this.lineDone = false;
    this.bodyText.setText('');
    this.advanceHint.setVisible(false);

    this.applyBackground(line.background);
    this.applySpeaker(line.speaker, line.portrait);

    if (line.cue === 'shake') this.cameras.main.shake(260, 0.008);
    else if (line.cue === 'flashRed') this.cameras.main.flash(320, 170, 20, 20);
  }

  private finish(): void {
    if (this.markSeen) {
      const mark = this.markSeen;
      if (mark.kind === 'regionIntro') SaveSystem.markRegionIntroSeen(this.save, mark.regionIndex);
      else if (mark.kind === 'regionOutro') SaveSystem.markRegionOutroSeen(this.save, mark.regionIndex);
      else if (mark.kind === 'finalIntro') SaveSystem.markFinalIntroSeen(this.save);
      else if (mark.kind === 'ending') SaveSystem.markEndingSeen(this.save);
      else if (mark.kind === 'opening') SaveSystem.markOpeningSeen(this.save);
      SaveSystem.save(this.save);
    }
    this.video?.stop();
    this.scene.start(this.next.scene, this.next.data);
  }

  // ---------------------------------------------------------- background --

  private applyBackground(key: string): void {
    if (key === this.bgKey) return;
    this.bgKey = key;

    const old = this.bgContainer;
    this.bgTween?.stop();
    if (old) {
      this.tweens.add({ targets: old, alpha: 0, duration: 280, onComplete: () => old.destroy() });
    }

    const palette = STORY_BACKGROUNDS[key] ?? { top: 0x1a1a24, bottom: 0x2a2a3a };
    const container = this.add.container(0, 0).setDepth(-10);
    container.setAlpha(0);

    const artKey = `story_${key}`;
    const region = REGIONS.find((r) => r.id === STORY_BACKGROUND_REGION[key]);
    if (this.textures.exists(artKey)) {
      const frame = this.textures.get(artKey).getSourceImage();
      container.add(this.add.image(360, 640, artKey).setScale(Math.max(720 / frame.width, 1280 / frame.height)));
    } else {
      const g = this.add.graphics();
      if (region) {
        // The region's scenery over this scene's own mood colors.
        drawScenery(g, { ...region.look, skyTop: palette.top, skyBottom: palette.bottom }, 720, 1280, 500 + key.length * 31);
      } else {
        g.fillGradientStyle(palette.top, palette.top, palette.bottom, palette.bottom, 1);
        g.fillRect(0, 0, 720, 1280);
      }
      container.add(g);

      // A dark ridge along the bottom, under the dialogue panel, grounds the scene.
      const silhouette = this.add.graphics();
      silhouette.fillStyle(0x000000, 0.4);
      const baseY = 900;
      silhouette.beginPath();
      silhouette.moveTo(0, 1280);
      silhouette.lineTo(0, baseY + 60);
      for (let x = 0; x <= 720; x += 60) {
        const bump = 30 + 40 * Math.abs(Math.sin(x * 0.013 + key.length));
        silhouette.lineTo(x, baseY - bump);
      }
      silhouette.lineTo(720, baseY + 60);
      silhouette.lineTo(720, 1280);
      silhouette.closePath();
      silhouette.fillPath();
      container.add(silhouette);
    }

    const vignette = this.add.graphics();
    vignette.fillStyle(0x05060a, 0.3);
    vignette.fillRect(0, 0, 720, 1280);
    container.add(vignette);

    this.children.moveTo(container, 0);
    this.bgContainer = container;
    this.tweens.add({ targets: container, alpha: 1, duration: 320 });

    // Slow ambient "camera breathing" so a static gradient still reads as
    // a living scene rather than a parked slide.
    container.setScale(1.04);
    this.bgTween = this.tweens.add({ targets: container, scale: 1.1, duration: 9000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // -------------------------------------------------------------- speaker --

  private applySpeaker(speaker: string, portrait?: RuriPortrait): void {
    this.nameplate?.destroy();
    this.nameplate = undefined;
    this.portrait?.destroy();
    this.portrait = undefined;

    const left = 360 - PANEL_WIDTH / 2;
    const top = PANEL_Y - PANEL_HEIGHT / 2;

    if (speaker) {
      const plate = createPanel(this, left + 220, top - 6, 230, 56, {
        fillColor: CHROME.woodFill,
        fillAlpha: 1,
        borderColor: CHROME.brass,
        glowColor: CHROME.brassBright,
        radius: 10,
        gradient: false,
      }).setDepth(4);
      const text = subheading(this, left + 220, top - 6, speaker, { fontSize: '27px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0.5).setDepth(4);
      this.nameplate = this.add.container(0, 0, [plate, text]).setDepth(4);
      enter(this, this.nameplate, { duration: 180, dy: 0, dx: -10 });

      const badgeKey = speaker === 'ルリ' ? ruriTexture(this, portrait ?? 'normal') : this.silhouetteTexture();
      const badge = this.add.image(left + 66, top - 66, badgeKey).setOrigin(0.5).setDisplaySize(130, 130).setDepth(4);
      this.portrait = this.add.container(0, 0, [badge]).setDepth(4);
      enter(this, this.portrait, { duration: 220, dy: 12 });
    }
  }

  private silhouetteTexture(): string {
    const key = 'story_silhouette_bust';
    if (this.textures.exists(key)) return key;

    const size = 100;
    const c = size / 2;
    const g = this.add.graphics();
    g.fillStyle(0x12141c, 0.5);
    g.fillCircle(c, c, c);
    g.fillStyle(0x1c1c24, 1);
    g.fillCircle(c, c - 14, c * 0.34);
    g.fillRoundedRect(c - c * 0.56, c + c * 0.1, c * 1.12, c * 0.7, 10);
    g.fillStyle(COLORS.accentBright, 0.15);
    g.fillEllipse(c - 10, c - 22, c * 0.3, c * 0.16);
    g.generateTexture(key, size, size);
    g.destroy();
    return key;
  }
}
