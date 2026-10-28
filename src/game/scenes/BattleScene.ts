import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { BigNumber } from '../systems/BigNumber';
import {
  ProgressionSystem,
  STAGES_PER_REGION,
  FINAL_STAGE_INDEX,
  type EnemyUnitDef,
  type StageDef,
  type FinalStageDef,
} from '../systems/ProgressionSystem';
import { getRegionOutroScript, getEndingScript } from '../data/storyScript';
import { BattleSystem, BattleEngine, type UnitInstance, type BattleEvent } from '../systems/BattleSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { AnimationController } from '../characters/AnimationController';
import { DamagePopupPool } from '../ui/DamagePopup';
import { Button } from '../ui/Button';
import { createPanel } from '../ui/Panel';
import { applyBackground } from '../ui/Background';
import { subheading, caption, heading, numeric, COLORS } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';

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

/** 'final' = the finite-wave 最終決戦 (see ProgressionSystem.getFinalStage);
 *  'extra' = a post-ending Extra dungeon stage (getExtraStage), its own
 *  index space from the main campaign; undefined = an ordinary main-quest
 *  stage (getStage). */
type BattleMode = 'final' | 'extra' | undefined;

export class BattleScene extends Phaser.Scene {
  private stageIndex = 0;
  private mode: BattleMode;
  private save!: SaveData;
  private generator!: CharacterGenerator;
  private anim!: AnimationController;
  private popups!: DamagePopupPool;
  private engine!: BattleEngine;
  private views = new Map<string, UnitView>();
  private resultOverlay?: Phaser.GameObjects.Container;

  private currentStageDef?: StageDef;
  private finalStage?: FinalStageDef;
  private waveIndex = 0;
  private rewardGold = BigNumber.ZERO;
  private rewardExp = 0;

  constructor() {
    super('Battle');
  }

  init(data: { stageIndex?: number; mode?: BattleMode }): void {
    this.stageIndex = data.stageIndex ?? 0;
    this.mode = data.mode;
    this.views.clear();
    this.resultOverlay = undefined;
    this.currentStageDef = undefined;
    this.finalStage = undefined;
    this.waveIndex = 0;
    this.rewardGold = BigNumber.ZERO;
    this.rewardExp = 0;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.generator = new CharacterGenerator(this);
    this.anim = new AnimationController(this);
    this.popups = new DamagePopupPool(this);
    this.cameras.main.setBackgroundColor('#0c0e18');
    applyBackground(this, 'battle');

    let title: string;
    if (this.mode === 'final') {
      this.finalStage = ProgressionSystem.getFinalStage();
      title = this.finalStage.name;
      this.rewardGold = this.finalStage.rewardGold;
      this.rewardExp = this.finalStage.rewardExp;
    } else if (this.mode === 'extra') {
      this.currentStageDef = ProgressionSystem.getExtraStage(this.stageIndex);
      title = this.currentStageDef.name;
      this.rewardGold = this.currentStageDef.rewardGold;
      this.rewardExp = this.currentStageDef.rewardExp;
    } else {
      this.currentStageDef = ProgressionSystem.getStage(this.stageIndex);
      title = this.currentStageDef.name;
      this.rewardGold = this.currentStageDef.rewardGold;
      this.rewardExp = this.currentStageDef.rewardExp;
    }

    const titleText = subheading(this, 360, 40, title, { fontSize: '22px' }).setOrigin(0.5);
    enter(this, titleText, { dy: -14, duration: 300 });

    const backBtn = new Button(this, 115, 53, 190, 66, '撤退', () => this.scene.start('Home'), { variant: 'ghost', fontSize: '15px' });
    enter(this, backBtn, { duration: 260 });

    const { front: pFront, back: pBack } = SaveSystem.getPartyHeroes(this.save);
    if (pFront.length + pBack.length === 0) {
      caption(this, 360, 640, '編成が空です。\n名鑑でパーティを編成してください。', { fontSize: '16px', color: '#ff8080', align: 'center' }).setOrigin(0.5);
      return;
    }

    const playerUnits: UnitInstance[] = [
      ...pFront.map((hero, i) => BattleSystem.createPlayerUnit(hero, 'front', i)),
      ...pBack.map((hero, i) => BattleSystem.createPlayerUnit(hero, 'back', i)),
    ];
    this.layoutUnits(playerUnits, true);

    if (this.mode === 'final' && this.finalStage) {
      this.waveIndex = 0;
      const wave = this.finalStage.waves[0];
      const enemyUnits = this.buildEnemyUnits(wave.enemies, wave.difficulty);
      this.engine = new BattleEngine(playerUnits, enemyUnits);
      this.layoutUnits(enemyUnits, false);
      this.announceWave(wave.name);
    } else if (this.currentStageDef) {
      const enemyUnits = this.buildEnemyUnits(this.currentStageDef.enemies, this.currentStageDef.difficulty);
      this.engine = new BattleEngine(playerUnits, enemyUnits);
      this.layoutUnits(enemyUnits, false);
    }
  }

  private buildEnemyUnits(defs: EnemyUnitDef[], difficulty: number): UnitInstance[] {
    const front = defs.slice(0, 3);
    const back = defs.slice(3, 5);
    return [
      ...front.map((def, i) => BattleSystem.createEnemyUnit(def, difficulty, 'front', i)),
      ...back.map((def, i) => BattleSystem.createEnemyUnit(def, difficulty, 'back', i)),
    ];
  }

  private layoutUnits(units: UnitInstance[], isPlayer: boolean): void {
    const frontY = isPlayer ? 760 : 420;
    const backY = isPlayer ? 900 : 280;
    this.placeRow(units.filter((u) => u.row === 'front'), frontY, isPlayer);
    this.placeRow(units.filter((u) => u.row === 'back'), backY, isPlayer);
  }

  private placeRow(units: UnitInstance[], y: number, isPlayer: boolean): void {
    const spacing = 150;
    const startX = 360 - ((units.length - 1) * spacing) / 2;
    units.forEach((unit, i) => this.createUnitView(unit, startX + i * spacing, y, isPlayer));
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
    const events = this.engine.triggerUlt(unitId);
    this.handleEvents(events);
  }

  update(_time: number, delta: number): void {
    if (!this.engine || this.engine.isOver()) return;
    const events = this.engine.update(delta);
    this.handleEvents(events);
    this.refreshBars();
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

  private handleEvents(events: BattleEvent[]): void {
    for (const event of events) {
      if (event.kind === 'attack') this.onAttack(event);
      else if (event.kind === 'defeated') this.onDefeated(event.unitId);
      else if (event.kind === 'victory') this.onWaveOrBattleVictory();
      else if (event.kind === 'defeat') this.onBattleEnd(false);
    }
  }

  private onAttack(event: Extract<BattleEvent, { kind: 'attack' }>): void {
    const attackerView = this.views.get(event.attackerId);
    const targetView = this.views.get(event.targetId);
    if (!attackerView || !targetView) return;
    this.anim.attack(attackerView.sprite, attackerView.unit.isPlayer);
    this.anim.hitFlash(targetView.sprite, event.crit);
    this.popups.pop(targetView.sprite.x, targetView.sprite.y - 30, event.damage, { crit: event.crit });
    if (event.crit) this.anim.critShake(this.cameras.main);
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
    });
  }

  // ----------------------------------------------------------- waves --
  // The final battle is a fixed, ordered list of waves (ProgressionSystem.
  // getFinalStage), not an endless mode - so unlike InfiniteRunEngine this
  // just swaps BattleEngine instances wave-to-wave, carrying the *same*
  // player UnitInstance objects forward (hp/ultGauge/alive intact) while
  // only the enemy squad resets.

  private onWaveOrBattleVictory(): void {
    if (this.mode === 'final' && this.finalStage && this.waveIndex < this.finalStage.waves.length - 1) {
      // A short beat before the next wave spawns, so the last enemy's own
      // death animation/ult-ring teardown has time to finish instead of
      // being cut off by clearEnemyViews() in the same frame it died.
      this.time.delayedCall(500, () => this.startNextWave());
    } else {
      this.onBattleEnd(true);
    }
  }

  private startNextWave(): void {
    if (!this.finalStage) return;
    this.waveIndex += 1;
    const wave = this.finalStage.waves[this.waveIndex];
    this.clearEnemyViews();
    const survivors = this.engine.playerUnits;
    const enemyUnits = this.buildEnemyUnits(wave.enemies, wave.difficulty);
    this.engine = new BattleEngine(survivors, enemyUnits);
    this.layoutUnits(enemyUnits, false);
    this.announceWave(wave.name);
  }

  private clearEnemyViews(): void {
    for (const [id, view] of [...this.views]) {
      if (view.unit.isPlayer) continue;
      this.anim.destroyAura(id);
      view.readyPulse?.stop();
      view.sprite.destroy();
      view.hpBg.destroy();
      view.hpFill.destroy();
      view.ultFill.destroy();
      view.nameText.destroy();
      view.readyRing.destroy();
      this.views.delete(id);
    }
  }

  private announceWave(name: string): void {
    const banner = heading(this, 360, 170, name, { fontSize: '22px' }).setOrigin(0.5).setDepth(20);
    banner.setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: banner, alpha: 0, delay: 1300, duration: 400, onComplete: () => banner.destroy() });
  }

  // ------------------------------------------------------------ result --

  private onBattleEnd(victory: boolean): void {
    if (this.resultOverlay) return;
    const container = this.add.container(0, 0);
    this.resultOverlay = container;
    const overlay = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0).setInteractive();
    container.add(overlay);
    this.tweens.add({ targets: overlay, fillAlpha: 0.82, duration: 220 });

    const panel = createPanel(this, 360, 630, 560, 320, {
      fillColor: COLORS.panelFill,
      borderColor: victory ? COLORS.gold : COLORS.danger,
      glowColor: victory ? COLORS.gold : COLORS.danger,
      radius: 22,
    });
    container.add(panel);
    panel.setScale(0.85);
    popIn(this, panel, { duration: 320, delay: 100 });

    const title = heading(this, 360, 540, victory ? '勝利!' : '敗北…', {
      fontSize: '40px',
      color: victory ? '#ffd23f' : '#ff6b6b',
    }).setOrigin(0.5);
    container.add(title);
    title.setScale(0);
    popIn(this, title, { duration: 360, delay: 180 });

    if (victory) {
      SaveSystem.addGold(this.save, this.rewardGold);
      for (const unit of this.engine.playerUnits) {
        SaveSystem.grantExp(this.save, unit.id, this.rewardExp);
      }
      this.applyProgressionOnVictory();
      SaveSystem.save(this.save);
      const rewardText = numeric(this, 360, 600, `+${this.rewardGold.toString()} G   +${this.rewardExp} EXP`, { fontSize: '18px' }).setOrigin(0.5);
      container.add(rewardText);
      enter(this, rewardText, { dy: 12, delay: 320 });
    }

    const btn = new Button(this, 360, 700, 220, 60, victory ? '次へ進む' : 'ホームへ戻る', () => this.onContinue(victory), {
      variant: victory ? 'primary' : 'secondary',
    });
    container.add(btn);
    btn.setScale(0);
    this.tweens.add({ targets: btn, scale: 1, duration: 280, delay: 380, ease: 'Back.easeOut' });
  }

  private applyProgressionOnVictory(): void {
    if (this.mode === 'extra') {
      SaveSystem.clearExtraStage(this.save, this.stageIndex);
    } else if (this.mode === 'final') {
      SaveSystem.clearStage(this.save, FINAL_STAGE_INDEX);
    } else {
      SaveSystem.clearStage(this.save, this.stageIndex);
    }
  }

  private onContinue(victory: boolean): void {
    if (!victory) {
      this.scene.start('Home');
      return;
    }

    if (this.mode === 'final') {
      this.scene.start('Story', { lines: getEndingScript().lines, next: { scene: 'Home' }, markSeen: { kind: 'ending' } });
      return;
    }
    if (this.mode === 'extra') {
      this.scene.start('StageSelect', { initialTab: 'extra' });
      return;
    }

    const regionIndex = Math.floor(this.stageIndex / STAGES_PER_REGION);
    const stageInRegion = this.stageIndex % STAGES_PER_REGION;
    if (stageInRegion === STAGES_PER_REGION - 1 && !this.save.storyFlags.regionOutro[regionIndex]) {
      this.scene.start('Story', {
        lines: getRegionOutroScript(regionIndex).lines,
        next: { scene: 'Home' },
        markSeen: { kind: 'regionOutro', regionIndex },
      });
      return;
    }
    this.scene.start('Home');
  }
}
