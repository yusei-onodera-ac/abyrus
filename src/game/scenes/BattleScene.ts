import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { BigNumber } from '../systems/BigNumber';
import {
  ProgressionSystem,
  STAGES_PER_REGION,
  EXTRA_STAGES_PER_REGION,
  FINAL_STAGE_INDEX,
  type EnemyUnitDef,
  type StageDef,
  type FinalStageDef,
} from '../systems/ProgressionSystem';
import { getRegionOutroScript, getEndingScript } from '../data/storyScript';
import { StaminaSystem, stageStaminaCost } from '../systems/StaminaSystem';
import { nextQuestStage, questRoute, questStageName, type QuestStage } from '../systems/QuestRoute';
import { StageRewardSystem } from '../systems/StageRewardSystem';
import { SoundSystem } from '../systems/SoundSystem';
import { FINAL_BATTLE_TINT, getRegion } from '../data/regions';
import { BattleSystem, BattleEngine, ULT_MAX, type UnitInstance, type BattleEvent } from '../systems/BattleSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { AnimationController } from '../characters/AnimationController';
import { DamagePopupPool } from '../ui/DamagePopup';
import { AutoSkillToggle } from '../ui/AutoSkillToggle';
import { SpeedToggle } from '../ui/SpeedToggle';
import { Button } from '../ui/Button';
import { openConfirm } from '../ui/Dialogs';
import { buildRewardGrid, type RewardTile } from '../ui/RewardTiles';
import type { ModalHandle } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { applyBattleBackground } from '../ui/Background';
import { subheading, caption, heading, CHROME, COLORS } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';

const INK = '#1c130a';

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
  private autoSkill?: AutoSkillToggle;
  private speed?: SpeedToggle;
  private modal?: ModalHandle;

  private currentStageDef?: StageDef;
  private finalStage?: FinalStageDef;
  private waveIndex = 0;
  private rewardGold = BigNumber.ZERO;
  private rewardExp = 0;
  private rewardSkillEssence = 0;

  constructor() {
    super('Battle');
  }

  init(data: { stageIndex?: number; mode?: BattleMode }): void {
    this.stageIndex = data.stageIndex ?? 0;
    this.mode = data.mode;
    this.views.clear();
    this.resultOverlay = undefined;
    this.autoSkill = undefined;
    this.speed = undefined;
    this.modal = undefined;
    this.currentStageDef = undefined;
    this.finalStage = undefined;
    this.waveIndex = 0;
    this.rewardGold = BigNumber.ZERO;
    this.rewardExp = 0;
    this.rewardSkillEssence = 0;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.generator = new CharacterGenerator(this);
    this.anim = new AnimationController(this);
    this.popups = new DamagePopupPool(this);
    this.cameras.main.setBackgroundColor('#0c0e18');
    this.applyBackdrop();

    let title: string;
    if (this.mode === 'final') {
      this.finalStage = ProgressionSystem.getFinalStage();
      title = this.finalStage.name;
      this.rewardGold = this.finalStage.rewardGold;
      this.rewardExp = this.finalStage.rewardExp;
      this.rewardSkillEssence = this.finalStage.rewardSkillEssence;
    } else if (this.mode === 'extra') {
      this.currentStageDef = ProgressionSystem.getExtraStage(this.stageIndex);
      title = this.currentStageDef.name;
      this.rewardGold = this.currentStageDef.rewardGold;
      this.rewardExp = this.currentStageDef.rewardExp;
      this.rewardSkillEssence = this.currentStageDef.rewardSkillEssence;
    } else {
      this.currentStageDef = ProgressionSystem.getStage(this.stageIndex);
      title = this.currentStageDef.name;
      this.rewardGold = this.currentStageDef.rewardGold;
      this.rewardExp = this.currentStageDef.rewardExp;
      this.rewardSkillEssence = this.currentStageDef.rewardSkillEssence;
    }

    // A wood-and-brass strip across the top: 撤退 and the stage's name.
    const hud = this.add.container(0, 0).setDepth(30);
    hud.add(createPanel(this, 360, 62, 696, 92, { fillColor: CHROME.woodFill, fillAlpha: 0.94, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 14, gradient: false }));
    hud.add(new Button(this, 104, 62, 160, 62, '撤退', () => this.scene.start('Home'), { variant: 'wood', fontSize: '26px' }));
    const titleText = subheading(this, 408, 62, title, { fontSize: '30px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
    if (titleText.width > 470) titleText.setScale(470 / titleText.width);
    hud.add(titleText);
    enter(this, hud, { dy: -20, duration: 260 });

    const { front: pFront, back: pBack } = SaveSystem.getPartyHeroes(this.save);
    this.autoSkill = new AutoSkillToggle(this, this.save);
    this.speed = new SpeedToggle(this, this.save);
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;
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

  /** Each region's fights get that region's backdrop; the final battle its own. */
  private applyBackdrop(): void {
    if (this.mode === 'final') {
      applyBattleBackground(this, 'final', FINAL_BATTLE_TINT);
      return;
    }
    const perRegion = this.mode === 'extra' ? EXTRA_STAGES_PER_REGION : STAGES_PER_REGION;
    const region = getRegion(Math.floor(this.stageIndex / perRegion));
    applyBattleBackground(this, region.id, region.look.battleTint);
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
    // 2倍速: the fight and every animation in it run faster together.
    const speed = this.speed?.factor() ?? 1;
    this.tweens.timeScale = speed;
    this.time.timeScale = speed;
    const events = this.engine.update(delta * speed);
    this.handleEvents(events);
    if (this.autoSkill?.isOn()) this.castReadySkills();
    this.refreshBars();
  }

  /** オート: every hero whose gauge is full casts its next skill right away. */
  private castReadySkills(): void {
    for (const unit of this.engine.playerUnits) {
      if (this.engine.isOver()) return;
      if (unit.alive && unit.ultGauge >= ULT_MAX && unit.skills.length > 0) this.handleEvents(this.engine.triggerUlt(unit.id));
    }
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
      else if (event.kind === 'skillCast') this.onSkillCast(event);
      else if (event.kind === 'defeated') this.onDefeated(event.unitId);
      else if (event.kind === 'victory') this.onWaveOrBattleVictory();
      else if (event.kind === 'defeat') this.onBattleEnd(false);
    }
  }

  private onAttack(event: Extract<BattleEvent, { kind: 'attack' }>): void {
    SoundSystem.play(this, event.crit ? 'crit' : 'hit');
    const attackerView = this.views.get(event.attackerId);
    const targetView = this.views.get(event.targetId);
    if (!attackerView || !targetView) return;
    this.anim.attack(attackerView.sprite, attackerView.unit.isPlayer);
    if (event.blocked) {
      this.popups.pop(targetView.sprite.x, targetView.sprite.y - 30, event.damage, { label: '無敵' });
      return;
    }
    this.anim.hitFlash(targetView.sprite, event.crit);
    this.popups.pop(targetView.sprite.x, targetView.sprite.y - 30, event.damage, { crit: event.crit });
    if (event.crit) this.anim.critShake(this.cameras.main);
  }

  /** A hero's unlocked skill firing: unlike a plain attack this can hit
   *  every enemy (AoE), land on allies (heals/buffs), or revive a unit
   *  whose view was already torn down by onDefeated - that last case
   *  rebuilds the view from scratch instead of animating a destroyed one. */
  private onSkillCast(event: Extract<BattleEvent, { kind: 'skillCast' }>): void {
    SoundSystem.play(this, 'skill');
    const casterView = this.views.get(event.casterId);
    if (casterView) this.anim.attack(casterView.sprite, casterView.unit.isPlayer);

    for (const result of event.results) {
      if (result.revived) {
        const unit = this.engine.units.find((u) => u.id === result.targetId);
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
      } else if (result.invincible) {
        this.anim.statusFlash(targetView.sprite, 0x9fe0ff);
        this.popups.pop(targetView.sprite.x, targetView.sprite.y - 30, BigNumber.ZERO, { label: '無敵' });
      }
    }
  }

  /** Recomputes a player unit's on-screen slot from its row/position among
   *  the party, the same layout formula layoutUnits/placeRow used when the
   *  battle started - needed to rebuild a revived unit's view, since its
   *  original one was already destroyed by onDefeated. */
  private computePlayerUnitPosition(unit: UnitInstance): { x: number; y: number } {
    const rowUnits = this.engine.playerUnits.filter((u) => u.row === unit.row);
    const i = Math.max(0, rowUnits.findIndex((u) => u.id === unit.id));
    const spacing = 150;
    const startX = 360 - ((rowUnits.length - 1) * spacing) / 2;
    return { x: startX + i * spacing, y: unit.row === 'front' ? 760 : 900 };
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
    SoundSystem.play(this, victory ? 'victory' : 'defeat');
    const next = victory ? this.nextStageOffer() : null;

    // The clear is settled first: what it pays decides how tall the panel is.
    let tiles: RewardTile[] = [];
    if (victory) {
      const stage: QuestStage = { kind: this.mode ?? 'main', index: this.stageIndex };
      // First-clear status has to be read before the progress counters move.
      const bonus = StageRewardSystem.roll(stage, StageRewardSystem.isFirstClear(this.save, stage), this.rewardExp);
      SaveSystem.addGold(this.save, this.rewardGold);
      SaveSystem.addSkillEssence(this.save, this.rewardSkillEssence);
      StageRewardSystem.grant(this.save, bonus);
      for (const unit of this.engine.playerUnits) {
        SaveSystem.grantExp(this.save, unit.id, this.rewardExp);
      }
      this.applyProgressionOnVictory();
      SaveSystem.save(this.save);

      tiles = [
        { kind: 'gold', amount: `+${this.rewardGold.toString()}` },
        { kind: 'exp', amount: `+${this.rewardExp}` },
        { kind: 'essence', amount: `+${this.rewardSkillEssence}` },
      ];
      if (bonus.gems > 0) tiles.push({ kind: 'gems', amount: `+${bonus.gems}`, tag: '初回' });
      if (bonus.phaseMaterials > 0) tiles.push({ kind: 'phaseMaterials', amount: `+${bonus.phaseMaterials}`, tag: 'ドロップ' });
      for (const { item, amount } of bonus.items) tiles.push({ kind: 'item', item, amount: `+${amount}`, tag: 'ドロップ' });
    }
    const grid = victory ? buildRewardGrid(this, tiles, 600) : undefined;

    // Title, the reward tiles, then the buttons (and, with a next stage on offer, a row of ways out).
    const gridH = grid?.height ?? 0;
    const buttonsH = !victory ? 90 : next ? 230 : 120;
    const panelH = (victory ? 112 : 170) + gridH + buttonsH;
    const top = 640 - panelH / 2;
    const gridTop = top + 112;
    const buttonsTop = victory ? gridTop + gridH + 22 : top + 150;
    const container = this.add.container(0, 0);
    this.resultOverlay = container;
    const overlay = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0).setInteractive();
    container.add(overlay);
    this.tweens.add({ targets: overlay, fillAlpha: 0.82, duration: 220 });

    const panel = createPanel(this, 360, 640, 640, panelH, {
      fillColor: CHROME.woodFill,
      fillAlpha: 1,
      borderColor: victory ? CHROME.brass : 0xb84f4f,
      glowColor: victory ? CHROME.brassBright : COLORS.danger,
      radius: 20,
      rarity: victory ? 5 : undefined,
      gradient: false,
    });
    container.add(panel);
    panel.setScale(0.85);
    popIn(this, panel, { duration: 320, delay: 100 });

    const title = heading(this, 360, top + (victory ? 58 : 84), victory ? '勝利!' : '敗北…', {
      fontSize: '46px',
      color: victory ? '#ffe9b8' : '#ff9a8a',
      stroke: INK,
      strokeThickness: 7,
    }).setOrigin(0.5);
    container.add(title);
    title.setScale(0);
    popIn(this, title, { duration: 360, delay: 180 });

    if (grid) {
      grid.container.setPosition(360 - 300, gridTop);
      container.add(grid.container);
      enter(this, grid.container, { dy: 14, delay: 320 });
    }

    const buttons: Button[] = [];
    if (next) {
      const cost = stageStaminaCost(next.kind, next.index);
      StaminaSystem.refresh(this.save);
      const enough = StaminaSystem.canAfford(this.save, cost);
      buttons.push(
        new Button(this, 360, buttonsTop + 43, 560, 86, '次のステージへ', () => this.goToNextStage(next), {
          variant: 'gold',
          fontSize: '30px',
          subLabel: `${questStageName(next)}　スタミナ ${cost}${enough ? '' : '（不足）'}`,
        }),
        new Button(this, 215, buttonsTop + 150, 270, 66, 'ホームへ', () => this.scene.start('Home'), { variant: 'wood', fontSize: '24px' }),
        new Button(this, 505, buttonsTop + 150, 270, 66, 'クエスト一覧', () => this.scene.start('StageSelect', this.mode === 'extra' ? { initialTab: 'extra' } : undefined), { variant: 'wood', fontSize: '24px' }),
      );
    } else {
      buttons.push(
        new Button(this, 360, buttonsTop + 37, 340, 74, victory ? this.continueLabel() : 'ホームへ戻る', () => this.onContinue(victory), {
          variant: victory ? 'gold' : 'wood',
          fontSize: '28px',
        }),
      );
    }
    buttons.forEach((btn, i) => {
      container.add(btn);
      btn.setScale(0);
      this.tweens.add({ targets: btn, scale: 1, duration: 280, delay: 380 + i * 60, ease: 'Back.easeOut' });
    });
  }

  /** The stage the result screen offers to go straight on to, or null when the
   *  clear leads somewhere else first: a story still to read (a region's last
   *  stage, the final battle's ending) or the end of the Extra stages. */
  private nextStageOffer(): QuestStage | null {
    if (this.mode === 'final') return null;
    if (this.mode !== 'extra' && this.storyAfterClear()) return null;
    return nextQuestStage({ kind: this.mode === 'extra' ? 'extra' : 'main', index: this.stageIndex });
  }

  /** True when clearing a region's last main stage still owes its closing story. */
  private storyAfterClear(): boolean {
    const regionIndex = Math.floor(this.stageIndex / STAGES_PER_REGION);
    return this.stageIndex % STAGES_PER_REGION === STAGES_PER_REGION - 1 && !this.save.storyFlags.regionOutro[regionIndex];
  }

  private continueLabel(): string {
    if (this.mode === 'final') return 'エンディングへ';
    if (this.mode === 'extra') return 'クエスト一覧へ';
    return 'ストーリーへ';
  }

  /** 次のステージへ: costs that stage's stamina, like entering it from the map.
   *  Short of it, offers the shop instead. */
  private goToNextStage(next: QuestStage): void {
    if (this.modal?.container.active) return;
    const cost = stageStaminaCost(next.kind, next.index);
    if (!StaminaSystem.canAfford(this.save, cost)) {
      const wait = StaminaSystem.formatDuration(StaminaSystem.secondsUntil(this.save, cost));
      // The popup's own dim layer blocks the result panel; there is no list to freeze.
      this.modal = openConfirm(this, { setEnabled: () => {} }, {
        title: 'スタミナが足りません',
        message: `${questStageName(next)}はスタミナ ${cost} 必要です。（現在 ${this.save.stamina[0]}）
回復まで あと ${wait}
ショップでスタミナを回復しますか？`,
        confirmLabel: 'ショップへ',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Shop', { focus: 'stamina' }),
      });
      return;
    }
    if (!StaminaSystem.spend(this.save, cost)) return;
    SaveSystem.save(this.save);
    const route = questRoute(this.save, next);
    this.scene.start(route.scene, route.data);
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
