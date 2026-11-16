import Phaser from 'phaser';
import { SaveSystem, type SaveData, type InfiniteModeRunResult } from '../systems/SaveSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { ENEMY_ROW_Y, ENEMY_SPACING, fitEnemyArt } from '../characters/EnemyArt';
import { fitPartyArt, PARTY_ROW_Y, PARTY_SPACING } from '../characters/PartyLayout';
import { AnimationController } from '../characters/AnimationController';
import { BattleFx, type Positioned } from '../characters/BattleFx';
import { DamagePopupPool } from '../ui/DamagePopup';
import { AutoSkillToggle } from '../ui/AutoSkillToggle';
import { SpeedToggle } from '../ui/SpeedToggle';
import { PartyBar } from '../ui/PartyBar';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBattleBackground } from '../ui/Background';
import { heading, body, caption, CHROME, COLORS } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';
import { InfiniteRunEngine, type InfiniteBattleEvent, type EnemySlotPosition } from '../systems/InfiniteModeSystem';
import { ULT_MAX, type UnitInstance } from '../systems/BattleSystem';
import { LeaderboardSystem } from '../systems/LeaderboardSystem';
import { formatSurvival } from '../ui/format';
import { SoundSystem } from '../systems/SoundSystem';
import { recordMission } from '../systems/MissionProgress';

type SceneState = 'running' | 'result';

const INK = '#1c130a';
/** The shared battle backdrop is tinted this violet for the arena (or replaced by public/assets/backgrounds/battle_infinite.jpg). */
const ARENA_TINT = 0xa890e0;

/** The name and HP bar floating by a unit: enemies only - the party's are on the PartyBar below. */
interface UnitBars {
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
}

interface UnitView {
  unit: UnitInstance;
  sprite: Phaser.GameObjects.Sprite;
  bars?: UnitBars;
  readyRing: Phaser.GameObjects.Arc;
  readyPulse?: Phaser.Tweens.Tween;
}

interface RunningHud {
  timeText: Phaser.GameObjects.Text;
  scoreText: Phaser.GameObjects.Text;
  diffText: Phaser.GameObjects.Text;
  killText: Phaser.GameObjects.Text;
}

// Same 720-wide, 3-front/2-back footprint BattleScene lays stage-battle
// enemies out on, so Infinite Mode's arena reads as the same kind of fight.
const ENEMY_SLOT_XY: Record<string, { x: number; y: number }> = {
  'front-0': { x: 360 - ENEMY_SPACING, y: ENEMY_ROW_Y.front },
  'front-1': { x: 360, y: ENEMY_ROW_Y.front },
  'front-2': { x: 360 + ENEMY_SPACING, y: ENEMY_ROW_Y.front },
  'back-0': { x: 360 - ENEMY_SPACING / 2, y: ENEMY_ROW_Y.back },
  'back-1': { x: 360 + ENEMY_SPACING / 2, y: ENEMY_ROW_Y.back },
};

/**
 * The 無限モード run itself (the lobby, InfiniteLobbyScene, starts it). The
 * player's current party fights an endless, ever-escalating stream of enemies
 * (InfiniteRunEngine) and tries to survive as long as possible; the run
 * produces a score that's recorded locally (SaveSystem) and submitted to the
 * global leaderboard (LeaderboardSystem) when one is configured. Two states
 * without ever restarting the scene itself:
 *   running - the fight (mirrors BattleScene's unit-view handling)
 *   result  - final score + leaderboard submission, retry or back to the lobby
 */
export class InfiniteModeScene extends Phaser.Scene {
  private save!: SaveData;
  private generator!: CharacterGenerator;
  private anim!: AnimationController;
  private popups!: DamagePopupPool;
  private fx!: BattleFx;
  /** False while the party is still rising into place: the run waits for it. */
  private ready = false;
  private engine?: InfiniteRunEngine;
  private views = new Map<string, UnitView>();
  private state: SceneState = 'running';
  // Bumped on every state change; async callbacks (leaderboard fetch/submit)
  // capture the token beforehand and bail out if it no longer matches,
  // instead of touching game objects a later state transition may have
  // already destroyed.
  private stateToken = 0;
  private stateContainer?: Phaser.GameObjects.Container;
  private hud?: RunningHud;
  private autoSkill?: AutoSkillToggle;
  private speed?: SpeedToggle;
  private partyBar?: PartyBar;
  /** Opened from the lobby's 続きから: pick the saved run up instead of starting a new one. */
  private resumeRun = false;
  /** Real milliseconds since the run was last written to the save (see autosave). */
  private saveClock = 0;
  private readonly onPageHide = (): void => this.saveSuspended();

  constructor() {
    super('InfiniteRun');
  }

  init(data?: { resume?: boolean }): void {
    this.resumeRun = data?.resume === true;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.generator = new CharacterGenerator(this);
    this.anim = new AnimationController(this);
    this.popups = new DamagePopupPool(this);
    this.fx = new BattleFx(this);
    this.views.clear();
    this.engine = undefined;
    this.state = 'running';
    this.stateToken = 0;
    this.stateContainer = undefined;
    this.hud = undefined;
    this.autoSkill = undefined;
    this.speed = undefined;
    this.partyBar = undefined;
    this.saveClock = 0;

    // The run is written to the save every few seconds, when the scene is left and when the page is closed or hidden,
    // so a run is never lost: it can be picked up again from the lobby.
    window.addEventListener('pagehide', this.onPageHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('pagehide', this.onPageHide);
      this.saveSuspended();
    });

    this.cameras.main.setBackgroundColor('#10121c');
    applyBattleBackground(this, 'infinite', ARENA_TINT);

    const { front, back } = SaveSystem.getPartyHeroes(this.save);
    // Only reachable from the lobby, which won't start an empty party; this is for a stale link.
    if (front.length + back.length === 0) {
      this.scene.start('InfiniteMode');
      return;
    }
    this.autoSkill = new AutoSkillToggle(this, this.save);
    this.speed = new SpeedToggle(this, this.save);
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
    this.startRun();
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'running' || !this.engine || !this.ready) return;
    // 2倍速: the run and every animation in it go faster together.
    const speed = this.speed?.factor() ?? 1;
    this.tweens.timeScale = speed;
    this.time.timeScale = speed;
    this.handleEvents(this.engine.update(delta * speed));
    if (this.autoSkill?.isOn()) this.castReadySkills();
    this.refreshBars();
    this.refreshHud();
    this.saveClock += delta;
    if (this.saveClock >= 3000) this.saveSuspended();
  }

  /** Writes the run as it stands into the save (only while it is being fought: a finished run is not kept). */
  private saveSuspended(): void {
    this.saveClock = 0;
    const engine = this.engine;
    if (!engine || this.state !== 'running' || !this.ready || engine.isOver()) return;
    this.save.infiniteMode.suspended = engine.serialize();
    SaveSystem.save(this.save);
  }

  /** 一時停止: the fight stands still under a popup (再開 / 中断して戻る / リタイア). */
  private openPause(): void {
    if (this.state !== 'running' || !this.ready || !this.engine || this.scene.isPaused()) return;
    this.saveSuspended();
    this.scene.pause();
    this.scene.launch('Pause', {
      of: 'InfiniteRun',
      lines: ['戦闘はここで止まっています。'],
      onSuspend: () => {
        this.saveSuspended();
        this.scene.start('InfiniteMode');
      },
      onRetire: () => this.retreat(),
    });
    this.scene.bringToTop('Pause');
  }

  /** オート: every hero whose gauge is full casts its next skill right away. */
  private castReadySkills(): void {
    const engine = this.engine;
    if (!engine) return;
    for (const unit of engine.playerUnits) {
      if (engine.isOver()) return;
      if (unit.alive && unit.ultGauge >= ULT_MAX && unit.skills.length > 0) this.handleEvents(engine.triggerUlt(unit.id));
    }
  }

  private enterState(state: SceneState): void {
    this.stateToken += 1;
    this.state = state;
    this.stateContainer?.destroy();
    this.stateContainer = undefined;
    this.clearCombatViews();
  }

  // ------------------------------------------------------------ running --

  private startRun(): void {
    this.enterState('running');
    // 続きから: the saved run (when it can still be used), otherwise a new one.
    let engine = this.resumeRun ? InfiniteRunEngine.restore(this.save.infiniteMode.suspended, (id) => SaveSystem.getHero(this.save, id)) : null;
    const resumed = engine !== null;
    if (!engine) {
      const { front, back } = SaveSystem.getPartyHeroes(this.save);
      engine = new InfiniteRunEngine({ front, back });
    }
    // A new run replaces whatever was set aside; its own copy is written within a few seconds.
    delete this.save.infiniteMode.suspended;
    this.engine = engine;

    this.ready = false;
    this.placePlayerRow(engine.playerUnits.filter((u) => u.row === 'front'), PARTY_ROW_Y.front);
    this.placePlayerRow(engine.playerUnits.filter((u) => u.row === 'back'), PARTY_ROW_Y.back);
    if (resumed) for (const { position, unit } of engine.getEnemySlots()) if (unit && unit.alive) this.onEnemySpawned(unit, position);
    this.partyBar = new PartyBar(this, {
      generator: this.generator,
      units: engine.playerUnits,
      heroOf: (u) => SaveSystem.getHero(this.save, u.id),
      onTap: (u) => this.onHeroTap(u.id),
    });
    this.buildRunningHud();
    this.riseParty();
  }

  private placePlayerRow(units: UnitInstance[], y: number): void {
    const startX = 360 - ((units.length - 1) * PARTY_SPACING) / 2;
    // A hero already down (in a run picked up again) has no figure, but keeps its place in the row.
    units.forEach((unit, i) => {
      if (unit.alive) this.createUnitView(unit, startX + i * PARTY_SPACING, y, true, true);
    });
  }

  /** The party rises in from below the screen; the run begins once they are up. */
  private riseParty(): void {
    const views = [...this.views.values()].filter((v) => v.unit.isPlayer);
    const token = this.stateToken;
    this.fx.rise(
      views.map((v) => [v.sprite, v.readyRing] as Positioned[]),
      () => {
        if (token !== this.stateToken) return;
        this.ready = true;
        for (const v of views) if (v.sprite.active) this.anim.idle(v.sprite);
      },
    );
  }

  /** A wood-and-brass strip across the top: リタイア, then survival time and
   *  score on the left, 難易度 and 撃破 on the right. */
  private buildRunningHud(): void {
    const container = this.add.container(0, 0);
    this.stateContainer = container;

    container.add(createPanel(this, 360, 72, 696, 116, { fillColor: CHROME.woodFill, fillAlpha: 0.94, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 14, gradient: false }));
    const retreatBtn = new Button(this, 104, 72, 160, 64, 'リタイア', () => this.retreat(), { variant: 'wood', fontSize: '24px' });
    container.add(retreatBtn);
    const pauseBtn = new Button(this, 236, 72, 92, 64, '一時停止', () => this.openPause(), { variant: 'wood', fontSize: '19px' });
    container.add(pauseBtn);

    const style = (size: number, color: string) => ({ fontSize: `${size}px`, fontStyle: 'bold', color, stroke: INK, strokeThickness: 5 });
    const timeText = body(this, 356, 50, '0:00', style(36, '#ffe9b8')).setOrigin(0.5);
    const scoreText = body(this, 356, 92, 'スコア 0', style(24, '#fff4dc')).setOrigin(0.5);
    const diffText = body(this, 694, 50, '難易度 Lv.1', style(24, '#ffd9a0')).setOrigin(1, 0.5);
    const killText = body(this, 694, 92, '撃破 0体', style(24, '#fff4dc')).setOrigin(1, 0.5);
    container.add([timeText, diffText, killText, scoreText]);
    enter(this, container, { dy: -20, duration: 260 });

    this.hud = { timeText, scoreText, diffText, killText };
  }

  private refreshHud(): void {
    if (!this.hud || !this.engine) return;
    const snap = this.engine.getSnapshot();
    this.hud.timeText.setText(formatSurvival(snap.survivalSeconds));
    this.hud.diffText.setText(`難易度 Lv.${Math.floor(snap.difficultyIndex) + 1}`);
    this.hud.killText.setText(`撃破 ${snap.enemiesDefeated}体`);
    this.hud.scoreText.setText(`スコア ${snap.score.toLocaleString('ja-JP')}`);
  }

  private createUnitView(unit: UnitInstance, x: number, y: number, isPlayer: boolean, entrance = false): void {
    // An enemy with a picture is drawn from it (as drawn, facing whichever way); the rest are silhouettes.
    const art = isPlayer ? fitPartyArt(this, this.generator, unit) : fitEnemyArt(this, unit.art, unit.isBoss);
    const generated = art ? null : this.generator.generate(unit.seed, unit.heroClass, unit.rarity, unit.heroId);
    const textureKey = art?.key ?? generated?.textureKey ?? '';
    const size = art ? art.height : (generated?.size ?? 96);
    const sprite = this.add.sprite(x, y, textureKey);
    if (art) sprite.setDisplaySize(art.width, art.height);
    else sprite.setDisplaySize(size * 0.9, size * 0.9);
    if (!isPlayer && !art) sprite.setFlipX(true);
    sprite.setData('baseScale', sprite.scaleX);

    // The party's name, HP and skill gauge are on the PartyBar; an enemy carries its own.
    let bars: UnitBars | undefined;
    if (!isPlayer) {
      const nameText = caption(this, x, y - size / 2 - 14, unit.name, { fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
      const barWidth = 90;
      const hpBg = this.add.rectangle(x, y + size / 2 + 4, barWidth, 7, 0x000000, 0.6).setRounded(3);
      const hpFill = this.add.rectangle(x - barWidth / 2, y + size / 2 + 4, barWidth, 7, 0x4caf50).setOrigin(0, 0.5).setRounded(3);
      bars = { hpBg, hpFill, nameText };
    }
    const readyRing = this.add.circle(x, y, size * 0.52).setStrokeStyle(3, 0xffd23f, 0.9).setVisible(false);

    if (!entrance) this.anim.idle(sprite);
    this.anim.attachAura(unit.id, sprite, unit.rarity);

    this.views.set(unit.id, { unit, sprite, bars, readyRing });
  }

  private onHeroTap(unitId: string): void {
    if (!this.engine) return;
    this.handleEvents(this.engine.triggerUlt(unitId));
  }

  private retreat(): void {
    this.engine?.retreat();
    this.endRun();
  }

  private refreshBars(): void {
    for (const view of this.views.values()) {
      if (view.bars) {
        const ratio = view.unit.maxHp.isZero() ? 0 : view.unit.hp.div(view.unit.maxHp).toNumber();
        view.bars.hpFill.setScale(Phaser.Math.Clamp(ratio, 0, 1), 1);
        view.bars.hpFill.setFillStyle(ratio < 0.3 ? 0xe05353 : ratio < 0.6 ? 0xe0c653 : 0x4caf50);
      }
      if (view.unit.isPlayer) {
        const ready = view.unit.ultGauge >= 100;
        if (ready && !view.readyRing.visible) {
          this.fx.ready(view.sprite.x, view.sprite.y);
          view.readyRing.setVisible(true).setScale(1).setAlpha(1);
          view.readyPulse = this.tweens.add({
            targets: view.readyRing,
            scale: 1.18,
            alpha: 0.4,
            duration: 480,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        } else if (!ready && view.readyRing.visible) {
          view.readyPulse?.stop();
          view.readyPulse = undefined;
          view.readyRing.setVisible(false).setScale(1).setAlpha(1);
        }
      }
    }
    this.partyBar?.refresh();
  }

  private handleEvents(events: InfiniteBattleEvent[]): void {
    // A skill's orb is still flying when the engine already reports who fell: hold those back.
    let hold = 0;
    for (const event of events) {
      if (event.kind === 'attack') this.onAttack(event);
      else if (event.kind === 'skillCast') hold = this.onSkillCast(event);
      else if (event.kind === 'defeated') {
        const id = event.unitId;
        if (hold > 0) this.time.delayedCall(hold, () => this.onDefeated(id));
        else this.onDefeated(id);
      }
      else if (event.kind === 'enemySpawned') this.onEnemySpawned(event.unit, event.position);
      else if (event.kind === 'runOver') this.endRun();
    }
  }

  private onAttack(event: Extract<InfiniteBattleEvent, { kind: 'attack' }>): void {
    SoundSystem.play(this, event.crit ? 'crit' : 'hit');
    const attackerView = this.views.get(event.attackerId);
    const targetView = this.views.get(event.targetId);
    if (!attackerView || !targetView) return;
    const target = targetView.sprite;
    this.anim.lunge(attackerView.sprite, target);
    if (event.blocked) {
      this.popups.pop(target.x, target.y - 30, event.damage, { label: '無敵' });
      this.fx.block(target.x, target.y);
      return;
    }
    this.anim.hitFlash(target, event.crit);
    this.anim.knockback(target, attackerView.sprite, event.crit ? 24 : 12);
    this.popups.pop(target.x, target.y - 30, event.damage, { crit: event.crit });
    this.fx.hit(target.x, target.y, { crit: event.crit });
    if (attackerView.unit.isPlayer) this.fx.combo();
  }

  /** Mirrors BattleScene's onSkillCast: a hero's unlocked skill firing can
   *  hit every enemy, land on allies, or revive a party member whose view
   *  onDefeated already tore down (and, here, removed from `views`
   *  entirely) - that case rebuilds the view instead of animating nothing. */
  private onSkillCast(event: Extract<InfiniteBattleEvent, { kind: 'skillCast' }>): number {
    SoundSystem.play(this, 'skill');
    const casterView = this.views.get(event.casterId);
    const fromPlayer = !!casterView?.unit.isPlayer;
    if (fromPlayer) this.partyBar?.cast(event.casterId);
    // How long the longest orb flies: units it kills are held until it lands.
    let hold = 0;
    if (casterView) {
      this.anim.attack(casterView.sprite, fromPlayer);
      this.fx.skillStart(casterView.sprite.x, casterView.sprite.y, event.effectKind, event.skillName, fromPlayer);
    }

    for (const result of event.results) {
      if (result.revived) {
        const unit = this.engine?.playerUnits.find((u) => u.id === result.targetId);
        if (!unit) continue;
        const pos = this.computePlayerUnitPosition(unit);
        this.createUnitView(unit, pos.x, pos.y, true);
        const view = this.views.get(unit.id);
        if (view) this.fx.status(view.sprite.x, view.sprite.y, 'heal', '復活');
        if (view && result.heal) this.popups.pop(view.sprite.x, view.sprite.y - 30, result.heal, { heal: true });
        continue;
      }

      const targetView = this.views.get(result.targetId);
      if (!targetView) continue;
      const { x, y } = targetView.sprite;
      if (result.damage) {
        // An orb flies from the caster; the hit and the number land with it.
        const { damage } = result;
        const crit = !!result.crit;
        const sprite = targetView.sprite;
        const land = (): void => {
          if (!sprite.active) return;
          this.anim.hitFlash(sprite, crit);
          if (casterView) this.anim.knockback(sprite, casterView.sprite, crit ? 30 : 18);
          this.popups.pop(x, y - 30, damage, { crit });
          this.fx.hit(x, y, { crit, big: true, palette: 'fire' });
          if (fromPlayer) this.fx.combo();
        };
        if (casterView) hold = Math.max(hold, this.fx.travel({ x: casterView.sprite.x, y: casterView.sprite.y }, { x, y }, event.effectKind, land));
        else land();
      } else if (result.heal) {
        this.anim.statusFlash(targetView.sprite, COLORS.heal);
        this.popups.pop(x, y - 30, result.heal, { heal: true });
        this.fx.status(x, y, 'heal');
      } else if (result.buffAtk || result.buffDef) {
        this.anim.statusFlash(targetView.sprite, COLORS.gold);
        this.fx.status(x, y, 'buff', result.buffAtk && result.buffDef ? '攻防UP' : result.buffAtk ? '攻撃UP' : '防御UP');
      } else if (result.debuffAtk || result.debuffDef) {
        this.anim.statusFlash(targetView.sprite, COLORS.danger);
        this.fx.status(x, y, 'debuff', result.debuffAtk && result.debuffDef ? '攻防DOWN' : result.debuffAtk ? '攻撃DOWN' : '防御DOWN');
      } else if (result.stunned) {
        this.anim.statusFlash(targetView.sprite, COLORS.textMuted);
        this.fx.status(x, y, 'stun', 'スタン');
      } else if (result.invincible) {
        this.anim.statusFlash(targetView.sprite, 0x9fe0ff);
        this.fx.status(x, y, 'invincible', '無敵');
      }
    }
    return hold;
  }

  private computePlayerUnitPosition(unit: UnitInstance): { x: number; y: number } {
    const rowUnits = (this.engine?.playerUnits ?? []).filter((u) => u.row === unit.row);
    const i = Math.max(0, rowUnits.findIndex((u) => u.id === unit.id));
    const startX = 360 - ((rowUnits.length - 1) * PARTY_SPACING) / 2;
    return { x: startX + i * PARTY_SPACING, y: PARTY_ROW_Y[unit.row] };
  }

  private onEnemySpawned(unit: UnitInstance, position: EnemySlotPosition): void {
    const xy = ENEMY_SLOT_XY[`${position.row}-${position.slot}`];
    this.createUnitView(unit, xy.x, xy.y, false);
  }

  private onDefeated(unitId: string): void {
    const view = this.views.get(unitId);
    if (!view) return;
    this.anim.destroyAura(unitId);
    view.readyPulse?.stop();
    view.readyRing.destroy();
    this.fx.kill(view.sprite.x, view.sprite.y, view.unit.isPlayer);
    if (!view.unit.isPlayer) SoundSystem.play(this, 'boom');
    this.anim.death(view.sprite, () => {
      view.sprite.destroy();
      this.destroyBars(view);
      this.views.delete(unitId);
    });
  }

  /** An enemy's floating name and HP bar. */
  private destroyBars(view: UnitView): void {
    view.bars?.hpBg.destroy();
    view.bars?.hpFill.destroy();
    view.bars?.nameText.destroy();
  }

  private clearCombatViews(): void {
    for (const [id, view] of this.views) {
      this.anim.destroyAura(id);
      this.tweens.killTweensOf(view.sprite);
      this.tweens.killTweensOf(view.readyRing);
      view.readyPulse?.stop();
      view.sprite.destroy();
      this.destroyBars(view);
      view.readyRing.destroy();
    }
    this.views.clear();
    this.hud = undefined;
    this.partyBar?.destroy();
    this.partyBar = undefined;
  }

  // ------------------------------------------------------------- result --

  private endRun(): void {
    if (this.state === 'result' || !this.engine) return;
    this.fx.clearCombo();
    const snapshot = this.engine.getSnapshot();
    const result: InfiniteModeRunResult = {
      score: snapshot.score,
      survivalSeconds: Math.round(snapshot.survivalSeconds),
      enemiesDefeated: snapshot.enemiesDefeated,
      difficultyReached: snapshot.difficultyIndex,
    };

    delete this.save.infiniteMode.suspended;
    const previousBestScore = this.save.infiniteMode.bestScore;
    SaveSystem.recordInfiniteModeResult(this.save, result);
    recordMission(this.save, 'infinite_run');
    const skillEssenceGained = Math.round(result.score / 40);
    SaveSystem.addSkillEssence(this.save, skillEssenceGained);
    SaveSystem.save(this.save);
    this.showResult(result, result.score > previousBestScore, skillEssenceGained);
  }

  private showResult(result: InfiniteModeRunResult, isNewLocalBest: boolean, skillEssenceGained: number): void {
    this.enterState('result');
    for (const control of [this.autoSkill, this.speed]) control?.setVisible(false);
    SoundSystem.play(this, isNewLocalBest ? 'victory' : 'confirm');
    const container = this.add.container(0, 0);
    this.stateContainer = container;
    const token = this.stateToken;

    const overlay = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0).setInteractive();
    container.add(overlay);
    this.tweens.add({ targets: overlay, fillAlpha: 0.82, duration: 220 });

    const panelH = 620;
    const top = 640 - panelH / 2;
    const panel = createPanel(this, 360, 640, 640, panelH, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 20, rarity: 5, gradient: false });
    container.add(panel);
    panel.setScale(0.9);
    popIn(this, panel, { duration: 320, delay: 80 });

    const title = heading(this, 360, top + 62, 'ランアウト', { fontSize: '46px', color: '#ffe9b8', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);
    container.add(title);
    title.setScale(0);
    popIn(this, title, { duration: 340, delay: 160 });

    const scoreText = body(this, 360, top + 148, `スコア ${result.score.toLocaleString('ja-JP')}`, { fontSize: '44px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 7 }).setOrigin(0.5);
    container.add(scoreText);
    enter(this, scoreText, { dy: 12, delay: 300 });

    const rows: [string, string][] = [
      ['生存時間', formatSurvival(result.survivalSeconds)],
      ['撃破数', `${result.enemiesDefeated.toLocaleString('ja-JP')}体`],
      ['到達難易度', `Lv.${Math.floor(result.difficultyReached) + 1}`],
      ['獲得', `${skillEssenceGained.toLocaleString('ja-JP')} 技素`],
    ];
    rows.forEach(([label, value], i) => {
      const y = top + 222 + i * 48;
      container.add(caption(this, 90, y, label, { fontSize: '23px', color: '#cdbb94', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      container.add(body(this, 630, y, value, { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
    });

    if (isNewLocalBest) {
      container.add(body(this, 360, top + 430, '自己ベスト更新！', { fontSize: '26px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    }
    const rankText = caption(this, 360, top + 476, '送信中…', { fontSize: '20px', color: '#d8c49a', stroke: INK, strokeThickness: 3, align: 'center' }).setOrigin(0.5);
    container.add(rankText);
    void this.submitResult(token, result, rankText);

    const retryBtn = new Button(this, 218, top + panelH - 60, 270, 76, 'もう一度', () => this.scene.restart(), { variant: 'gold', fontSize: '28px' });
    const lobbyBtn = new Button(this, 502, top + panelH - 60, 270, 76, 'ロビーへ', () => this.scene.start('InfiniteMode'), { variant: 'wood', fontSize: '28px' });
    container.add([retryBtn, lobbyBtn]);
    [retryBtn, lobbyBtn].forEach((btn) => {
      btn.setScale(0);
      this.tweens.add({ targets: btn, scale: 1, duration: 280, delay: 380, ease: 'Back.easeOut' });
    });
  }

  private async submitResult(token: number, result: InfiniteModeRunResult, rankText: Phaser.GameObjects.Text): Promise<void> {
    const submission = await LeaderboardSystem.submitScore(this.save.playerName, result);
    if (token !== this.stateToken) return;

    if (submission.status === 'not_configured') {
      rankText.setText('ランキング準備中(この端末のベストのみ記録されました)');
    } else if (submission.status === 'error') {
      rankText.setText('ランキングへの送信に失敗しました');
    } else {
      rankText.setText(
        submission.isNewBest ? `グローバル順位 ${submission.rank.toLocaleString('ja-JP')}位(ベスト更新!)` : `グローバル順位 ${submission.rank.toLocaleString('ja-JP')}位`,
      );
    }
  }
}
