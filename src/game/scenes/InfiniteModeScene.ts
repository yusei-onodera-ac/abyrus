import Phaser from 'phaser';
import { SaveSystem, type SaveData, type InfiniteModeRunResult } from '../systems/SaveSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { AnimationController } from '../characters/AnimationController';
import { DamagePopupPool } from '../ui/DamagePopup';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBattleBackground } from '../ui/Background';
import { heading, body, caption, CHROME, COLORS } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';
import { InfiniteRunEngine, type InfiniteBattleEvent, type EnemySlotPosition } from '../systems/InfiniteModeSystem';
import type { UnitInstance } from '../systems/BattleSystem';
import { LeaderboardSystem } from '../systems/LeaderboardSystem';
import { formatSurvival } from '../ui/format';

type SceneState = 'running' | 'result';

const INK = '#1c130a';
/** The shared battle backdrop is tinted this violet for the arena (or replaced by public/assets/backgrounds/battle_infinite.jpg). */
const ARENA_TINT = 0xa890e0;

interface UnitView {
  unit: UnitInstance;
  sprite: Phaser.GameObjects.Sprite;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  ultFill: Phaser.GameObjects.Rectangle;
  readyRing: Phaser.GameObjects.Arc;
  nameText: Phaser.GameObjects.Text;
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
  'front-0': { x: 210, y: 420 },
  'front-1': { x: 360, y: 420 },
  'front-2': { x: 510, y: 420 },
  'back-0': { x: 285, y: 280 },
  'back-1': { x: 435, y: 280 },
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

  constructor() {
    super('InfiniteRun');
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.generator = new CharacterGenerator(this);
    this.anim = new AnimationController(this);
    this.popups = new DamagePopupPool(this);
    this.views.clear();
    this.engine = undefined;
    this.state = 'running';
    this.stateToken = 0;
    this.stateContainer = undefined;
    this.hud = undefined;

    this.cameras.main.setBackgroundColor('#10121c');
    applyBattleBackground(this, 'infinite', ARENA_TINT);

    const { front, back } = SaveSystem.getPartyHeroes(this.save);
    // Only reachable from the lobby, which won't start an empty party; this is for a stale link.
    if (front.length + back.length === 0) {
      this.scene.start('InfiniteMode');
      return;
    }
    this.startRun();
  }

  update(_time: number, delta: number): void {
    if (this.state !== 'running' || !this.engine) return;
    this.handleEvents(this.engine.update(delta));
    this.refreshBars();
    this.refreshHud();
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
    const { front, back } = SaveSystem.getPartyHeroes(this.save);
    const engine = new InfiniteRunEngine({ front, back });
    this.engine = engine;

    this.placePlayerRow(engine.playerUnits.filter((u) => u.row === 'front'), 760);
    this.placePlayerRow(engine.playerUnits.filter((u) => u.row === 'back'), 900);
    this.buildRunningHud();
  }

  private placePlayerRow(units: UnitInstance[], y: number): void {
    const spacing = 150;
    const startX = 360 - ((units.length - 1) * spacing) / 2;
    units.forEach((unit, i) => this.createUnitView(unit, startX + i * spacing, y, true));
  }

  /** A wood-and-brass strip across the top: リタイア, then survival time and
   *  score on the left, 難易度 and 撃破 on the right. */
  private buildRunningHud(): void {
    const container = this.add.container(0, 0);
    this.stateContainer = container;

    container.add(createPanel(this, 360, 72, 696, 116, { fillColor: CHROME.woodFill, fillAlpha: 0.94, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 14, gradient: false }));
    const retreatBtn = new Button(this, 104, 72, 160, 64, 'リタイア', () => this.retreat(), { variant: 'wood', fontSize: '24px' });
    container.add(retreatBtn);

    const style = (size: number, color: string) => ({ fontSize: `${size}px`, fontStyle: 'bold', color, stroke: INK, strokeThickness: 5 });
    const timeText = body(this, 330, 50, '0:00', style(36, '#ffe9b8')).setOrigin(0.5);
    const scoreText = body(this, 330, 92, 'スコア 0', style(24, '#fff4dc')).setOrigin(0.5);
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

  private createUnitView(unit: UnitInstance, x: number, y: number, isPlayer: boolean): void {
    const { textureKey, size } = this.generator.generate(unit.seed, unit.heroClass, unit.rarity, unit.heroId);
    const sprite = this.add.sprite(x, y, textureKey).setDisplaySize(size * 0.9, size * 0.9);
    if (!isPlayer) sprite.setFlipX(true);

    const nameText = caption(this, x, y - size / 2 - 14, unit.name, { fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
    const barWidth = 90;
    const hpBg = this.add.rectangle(x, y + size / 2 + 4, barWidth, 7, 0x000000, 0.6).setRounded(3);
    const hpFill = this.add.rectangle(x - barWidth / 2, y + size / 2 + 4, barWidth, 7, 0x4caf50).setOrigin(0, 0.5).setRounded(3);
    const ultFill = this.add
      .rectangle(x - barWidth / 2, y + size / 2 + 13, barWidth, 4, 0xffd23f)
      .setOrigin(0, 0.5)
      .setScale(0, 1)
      .setRounded(2);
    const readyRing = this.add.circle(x, y, size * 0.52).setStrokeStyle(3, 0xffd23f, 0.9).setVisible(false);

    this.anim.idle(sprite);
    this.anim.attachAura(unit.id, sprite, unit.rarity);

    if (isPlayer) {
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => this.onHeroTap(unit.id));
    }

    this.views.set(unit.id, { unit, sprite, hpBg, hpFill, ultFill, readyRing, nameText });
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
      const ratio = view.unit.maxHp.isZero() ? 0 : view.unit.hp.div(view.unit.maxHp).toNumber();
      view.hpFill.setScale(Phaser.Math.Clamp(ratio, 0, 1), 1);
      view.hpFill.setFillStyle(ratio < 0.3 ? 0xe05353 : ratio < 0.6 ? 0xe0c653 : 0x4caf50);
      if (view.unit.isPlayer) {
        view.ultFill.setScale(Phaser.Math.Clamp(view.unit.ultGauge / 100, 0, 1), 1);
        const ready = view.unit.ultGauge >= 100;
        if (ready && !view.readyRing.visible) {
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
  }

  private handleEvents(events: InfiniteBattleEvent[]): void {
    for (const event of events) {
      if (event.kind === 'attack') this.onAttack(event);
      else if (event.kind === 'skillCast') this.onSkillCast(event);
      else if (event.kind === 'defeated') this.onDefeated(event.unitId);
      else if (event.kind === 'enemySpawned') this.onEnemySpawned(event.unit, event.position);
      else if (event.kind === 'runOver') this.endRun();
    }
  }

  private onAttack(event: Extract<InfiniteBattleEvent, { kind: 'attack' }>): void {
    const attackerView = this.views.get(event.attackerId);
    const targetView = this.views.get(event.targetId);
    if (!attackerView || !targetView) return;
    this.anim.attack(attackerView.sprite, attackerView.unit.isPlayer);
    this.anim.hitFlash(targetView.sprite, event.crit);
    this.popups.pop(targetView.sprite.x, targetView.sprite.y - 30, event.damage, { crit: event.crit });
    if (event.crit) this.anim.critShake(this.cameras.main);
  }

  /** Mirrors BattleScene's onSkillCast: a hero's unlocked skill firing can
   *  hit every enemy, land on allies, or revive a party member whose view
   *  onDefeated already tore down (and, here, removed from `views`
   *  entirely) - that case rebuilds the view instead of animating nothing. */
  private onSkillCast(event: Extract<InfiniteBattleEvent, { kind: 'skillCast' }>): void {
    const casterView = this.views.get(event.casterId);
    if (casterView) this.anim.attack(casterView.sprite, casterView.unit.isPlayer);

    for (const result of event.results) {
      if (result.revived) {
        const unit = this.engine?.playerUnits.find((u) => u.id === result.targetId);
        if (!unit) continue;
        const pos = this.computePlayerUnitPosition(unit);
        this.createUnitView(unit, pos.x, pos.y, true);
        const view = this.views.get(unit.id);
        if (view && result.heal) this.popups.pop(view.sprite.x, view.sprite.y - 30, result.heal, { heal: true });
        continue;
      }

      const targetView = this.views.get(result.targetId);
      if (!targetView) continue;
      if (result.damage) {
        this.anim.hitFlash(targetView.sprite, !!result.crit);
        this.popups.pop(targetView.sprite.x, targetView.sprite.y - 30, result.damage, { crit: result.crit });
        if (result.crit) this.anim.critShake(this.cameras.main);
      } else if (result.heal) {
        this.anim.statusFlash(targetView.sprite, COLORS.heal);
        this.popups.pop(targetView.sprite.x, targetView.sprite.y - 30, result.heal, { heal: true });
      } else if (result.buffAtk || result.buffDef) {
        this.anim.statusFlash(targetView.sprite, COLORS.gold);
      } else if (result.debuffAtk || result.debuffDef) {
        this.anim.statusFlash(targetView.sprite, COLORS.danger);
      } else if (result.stunned) {
        this.anim.statusFlash(targetView.sprite, COLORS.textMuted);
      }
    }
  }

  private computePlayerUnitPosition(unit: UnitInstance): { x: number; y: number } {
    const rowUnits = (this.engine?.playerUnits ?? []).filter((u) => u.row === unit.row);
    const i = Math.max(0, rowUnits.findIndex((u) => u.id === unit.id));
    const spacing = 150;
    const startX = 360 - ((rowUnits.length - 1) * spacing) / 2;
    return { x: startX + i * spacing, y: unit.row === 'front' ? 760 : 900 };
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
    this.anim.death(view.sprite, () => {
      view.sprite.destroy();
      view.hpBg.destroy();
      view.hpFill.destroy();
      view.ultFill.destroy();
      view.nameText.destroy();
      this.views.delete(unitId);
    });
  }

  private clearCombatViews(): void {
    for (const [id, view] of this.views) {
      this.anim.destroyAura(id);
      this.tweens.killTweensOf(view.sprite);
      this.tweens.killTweensOf(view.readyRing);
      view.readyPulse?.stop();
      view.sprite.destroy();
      view.hpBg.destroy();
      view.hpFill.destroy();
      view.ultFill.destroy();
      view.nameText.destroy();
      view.readyRing.destroy();
    }
    this.views.clear();
    this.hud = undefined;
  }

  // ------------------------------------------------------------- result --

  private endRun(): void {
    if (this.state === 'result' || !this.engine) return;
    const snapshot = this.engine.getSnapshot();
    const result: InfiniteModeRunResult = {
      score: snapshot.score,
      survivalSeconds: Math.round(snapshot.survivalSeconds),
      enemiesDefeated: snapshot.enemiesDefeated,
      difficultyReached: snapshot.difficultyIndex,
    };

    const previousBestScore = this.save.infiniteMode.bestScore;
    SaveSystem.recordInfiniteModeResult(this.save, result);
    const skillEssenceGained = Math.round(result.score / 40);
    SaveSystem.addSkillEssence(this.save, skillEssenceGained);
    SaveSystem.save(this.save);
    this.showResult(result, result.score > previousBestScore, skillEssenceGained);
  }

  private showResult(result: InfiniteModeRunResult, isNewLocalBest: boolean, skillEssenceGained: number): void {
    this.enterState('result');
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
