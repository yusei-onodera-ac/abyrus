import Phaser from 'phaser';
import { SaveSystem, type SaveData, type InfiniteModeRunResult } from '../systems/SaveSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { AnimationController } from '../characters/AnimationController';
import { DamagePopupPool } from '../ui/DamagePopup';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { BottomNavBar } from '../ui/BottomNavBar';
import { applyBackground } from '../ui/Background';
import { heading, subheading, body, caption, sectionLabel, numeric, statLabel, COLORS } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';
import { InfiniteRunEngine, type InfiniteBattleEvent, type EnemySlotPosition } from '../systems/InfiniteModeSystem';
import type { UnitInstance } from '../systems/BattleSystem';
import { LeaderboardSystem } from '../systems/LeaderboardSystem';

type SceneState = 'ready' | 'running' | 'result';

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

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/**
 * Event tab: Infinite Mode (無限モード). The player's current party fights
 * an endless, ever-escalating stream of enemies (InfiniteRunEngine) and
 * tries to survive as long as possible; the run produces a score that's
 * recorded locally (SaveSystem) and submitted to the global leaderboard
 * (LeaderboardSystem) when one is configured. Cycles through three
 * internal states without ever restarting the scene itself, since this is
 * a persistent bottom-nav tab like every other main screen:
 *   ready   - personal best + leaderboard preview, "挑戦開始" to start
 *   running - the fight itself (mirrors BattleScene's unit-view handling)
 *   result  - final score + leaderboard submission, retry or go home
 */
export class InfiniteModeScene extends Phaser.Scene {
  private save!: SaveData;
  private generator!: CharacterGenerator;
  private anim!: AnimationController;
  private popups!: DamagePopupPool;
  private engine?: InfiniteRunEngine;
  private views = new Map<string, UnitView>();
  private state: SceneState = 'ready';
  // Bumped on every state change; async callbacks (leaderboard fetch/submit)
  // capture the token beforehand and bail out if it no longer matches,
  // instead of touching game objects a later state transition may have
  // already destroyed.
  private stateToken = 0;
  private stateContainer?: Phaser.GameObjects.Container;
  private hud?: RunningHud;

  constructor() {
    super('Event');
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.generator = new CharacterGenerator(this);
    this.anim = new AnimationController(this);
    this.popups = new DamagePopupPool(this);
    this.views.clear();
    this.engine = undefined;
    this.state = 'ready';
    this.stateToken = 0;
    this.stateContainer = undefined;
    this.hud = undefined;

    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'event');
    new BottomNavBar(this, 720, 1280, 'event');

    this.showReady();
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

  // ------------------------------------------------------------- ready --

  private showReady(): void {
    this.enterState('ready');
    const container = this.add.container(0, 0);
    this.stateContainer = container;
    const token = this.stateToken;

    const title = heading(this, 360, 150, '無限モード', { fontSize: '30px' }).setOrigin(0.5);
    const sub = body(this, 360, 196, 'どこまで耐えられるか', { fontSize: '15px', color: '#9a93b8' }).setOrigin(0.5);
    container.add([title, sub]);
    enter(this, title, { dy: -14, duration: 320 });
    enter(this, sub, { dy: -8, duration: 300, delay: 60 });

    const best = this.save.infiniteMode;
    const bestPanel = createPanel(this, 360, 300, 600, 130, {
      fillColor: COLORS.panelFill,
      borderColor: COLORS.border,
      glowColor: COLORS.accent,
      radius: 18,
    });
    container.add(bestPanel);
    const bestLabel = sectionLabel(this, 100, 254, '自己ベスト');
    const bestScore = numeric(this, 100, 284, `スコア ${best.bestScore.toLocaleString('ja-JP')}`, { fontSize: '18px' });
    const bestSurvival = caption(this, 100, 312, `生存 ${formatTime(best.bestSurvivalSeconds)} / 撃破 ${best.bestEnemiesDefeated}体`, { fontSize: '13px' });
    const bestRuns = caption(this, 100, 334, `挑戦回数 ${best.totalRuns}`, { fontSize: '12px' });
    container.add([bestLabel, bestScore, bestSurvival, bestRuns]);

    const leaderboardTitle = sectionLabel(this, 360, 400, 'グローバルランキング').setOrigin(0.5, 0);
    const leaderboardStatus = caption(this, 360, 430, '読み込み中…', { fontSize: '13px' }).setOrigin(0.5, 0);
    container.add([leaderboardTitle, leaderboardStatus]);
    void this.loadLeaderboardPreview(token, leaderboardStatus, container);

    const { front, back } = SaveSystem.getPartyHeroes(this.save);
    const hasParty = front.length + back.length > 0;

    const startBtn = new Button(
      this,
      360,
      1000,
      320,
      70,
      hasParty ? '挑戦開始' : '編成が空です',
      () => {
        if (hasParty) this.startRun();
      },
      { variant: hasParty ? 'primary' : 'ghost' },
    );
    if (!hasParty) startBtn.setEnabled(false);
    container.add(startBtn);
    enter(this, startBtn, { dy: 16, delay: 160 });

    if (!hasParty) {
      const hint = caption(this, 360, 1050, '編成が空です。名鑑でパーティを編成してください。', { fontSize: '13px', color: '#ff8080', align: 'center' }).setOrigin(0.5);
      container.add(hint);
    }
  }

  private async loadLeaderboardPreview(token: number, statusText: Phaser.GameObjects.Text, container: Phaser.GameObjects.Container): Promise<void> {
    const result = await LeaderboardSystem.fetchTopScores(5);
    if (token !== this.stateToken) return;

    if (result.status === 'not_configured') {
      statusText.setText('ランキング準備中(この端末のベストのみ記録されます)');
      return;
    }
    if (result.status === 'error') {
      statusText.setText('ランキングの取得に失敗しました');
      return;
    }
    if (result.data.length === 0) {
      statusText.setText('まだ記録がありません。最初の挑戦者になろう!');
      return;
    }

    statusText.setText('');
    result.data.forEach((entry, i) => {
      const row = body(this, 360, 430 + i * 30, `${i + 1}. ${entry.playerName}  ${entry.score.toLocaleString('ja-JP')}`, { fontSize: '14px' }).setOrigin(0.5, 0);
      container.add(row);
    });
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

  private buildRunningHud(): void {
    const container = this.add.container(0, 0);
    this.stateContainer = container;

    const retreatBtn = new Button(this, 115, 53, 190, 66, 'リタイア', () => this.retreat(), { variant: 'ghost', fontSize: '15px' });
    container.add(retreatBtn);
    enter(this, retreatBtn, { duration: 260 });

    const timeText = subheading(this, 360, 44, '0:00', { fontSize: '22px' }).setOrigin(0.5);
    const diffText = statLabel(this, 230, 80, '難易度 Lv.1', { fontSize: '14px' }).setOrigin(0.5);
    const killText = statLabel(this, 490, 80, '撃破 0体', { fontSize: '14px' }).setOrigin(0.5);
    const scoreText = numeric(this, 360, 108, 'スコア 0', { fontSize: '17px' }).setOrigin(0.5);
    container.add([timeText, diffText, killText, scoreText]);

    this.hud = { timeText, scoreText, diffText, killText };
  }

  private refreshHud(): void {
    if (!this.hud || !this.engine) return;
    const snap = this.engine.getSnapshot();
    this.hud.timeText.setText(formatTime(snap.survivalSeconds));
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
    SaveSystem.save(this.save);
    this.showResult(result, result.score > previousBestScore);
  }

  private showResult(result: InfiniteModeRunResult, isNewLocalBest: boolean): void {
    this.enterState('result');
    const container = this.add.container(0, 0);
    this.stateContainer = container;
    const token = this.stateToken;

    const overlay = this.add.rectangle(360, 578, 720, 1156, 0x000000, 0).setInteractive();
    container.add(overlay);
    this.tweens.add({ targets: overlay, fillAlpha: 0.82, duration: 220 });

    const panel = createPanel(this, 360, 540, 600, 460, { fillColor: COLORS.panelFill, borderColor: COLORS.gold, glowColor: COLORS.gold, radius: 22 });
    container.add(panel);
    panel.setScale(0.9);
    popIn(this, panel, { duration: 320, delay: 80 });

    const title = heading(this, 360, 360, 'ランアウト', { fontSize: '32px', color: '#ffd23f' }).setOrigin(0.5);
    container.add(title);
    title.setScale(0);
    popIn(this, title, { duration: 340, delay: 160 });

    const statsText = caption(
      this,
      360,
      430,
      `生存時間 ${formatTime(result.survivalSeconds)}\n撃破数 ${result.enemiesDefeated}体\n到達難易度 Lv.${Math.floor(result.difficultyReached) + 1}`,
      { fontSize: '15px', align: 'center', color: '#f0ecff' },
    ).setOrigin(0.5);
    container.add(statsText);

    const scoreText = numeric(this, 360, 530, `スコア ${result.score.toLocaleString('ja-JP')}`, { fontSize: '26px' }).setOrigin(0.5);
    container.add(scoreText);
    enter(this, scoreText, { dy: 12, delay: 300 });

    if (isNewLocalBest) {
      const bestBadge = caption(this, 360, 566, '自己ベスト更新!', { fontSize: '14px', color: '#ffd23f' }).setOrigin(0.5);
      container.add(bestBadge);
    }

    const rankText = caption(this, 360, 600, '送信中…', { fontSize: '14px', color: '#9a93b8' }).setOrigin(0.5);
    container.add(rankText);
    void this.submitResult(token, result, rankText);

    const retryBtn = new Button(this, 250, 690, 220, 60, 'もう一度', () => this.showReady(), { variant: 'primary' });
    const homeBtn = new Button(this, 480, 690, 200, 60, 'ホームへ', () => this.scene.start('Home'), { variant: 'secondary' });
    container.add([retryBtn, homeBtn]);
    [retryBtn, homeBtn].forEach((btn) => {
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
