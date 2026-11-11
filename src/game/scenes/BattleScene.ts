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
import { StageRewardSystem, type StageBonus } from '../systems/StageRewardSystem';
import { VillageSystem } from '../systems/VillageSystem';
import { RAID_PLAYER_EXP } from '../data/village';
import { WeekdayDungeonSystem } from '../systems/WeekdayDungeonSystem';
import { getWeekdayTier } from '../data/weekdayDungeons';
import { PlayerLevelSystem, type LevelUp } from '../systems/PlayerLevelSystem';
import { TutorialDirector } from '../systems/TutorialDirector';
import { recordMission } from '../systems/MissionProgress';
import { showToast } from '../ui/Toast';
import { SoundSystem } from '../systems/SoundSystem';
import { FINAL_BATTLE_TINT, getRegion } from '../data/regions';
import { BattleSystem, BattleEngine, ULT_MAX, type UnitInstance, type BattleEvent } from '../systems/BattleSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { AllianceService } from '../alliance/AllianceService';
import type { HelperHero } from '../alliance/AllianceBackend';
import { ENEMY_ROW_Y, ENEMY_SPACING, fitEnemyArt } from '../characters/EnemyArt';
import { fitPartyArt, PARTY_ROW_Y, PARTY_SPACING } from '../characters/PartyLayout';
import { AnimationController } from '../characters/AnimationController';
import { BattleFx, type Positioned } from '../characters/BattleFx';
import { DamagePopupPool } from '../ui/DamagePopup';
import { AutoSkillToggle } from '../ui/AutoSkillToggle';
import { SpeedToggle } from '../ui/SpeedToggle';
import { PartyBar } from '../ui/PartyBar';
import { AutoAdvance, stopAutoAdvance } from '../ui/AutoAdvanceToggle';
import { buildPartyResult, type PartyGain } from '../ui/PartyResult';
import { Button } from '../ui/Button';
import { openConfirm } from '../ui/Dialogs';
import { buildRewardGrid, type RewardTile } from '../ui/RewardTiles';
import type { ModalHandle } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { applyBattleBackground } from '../ui/Background';
import { subheading, caption, heading, CHROME, COLORS } from '../ui/theme';
import { MAX_LEVEL } from '../types';
import { enter, popIn } from '../ui/Transitions';

const INK = '#1c130a';

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

/** 'final' = the finite-wave 最終決戦 (see ProgressionSystem.getFinalStage);
 *  'extra' = a post-ending Extra dungeon stage (getExtraStage), its own
 *  index space from the main campaign; undefined = an ordinary main-quest
 *  stage (getStage); 'weekday' = a 曜日ダンジョン fight (getWeekdayStage): `stageIndex`
 *  is its tier and `day` the day it belongs to, and it moves no campaign progress;
 *  'raid' = a 襲撃 on the village (getRaidStage): `stageIndex` is the main stage it is set like and `seed`
 *  varies the pack. It moves no campaign progress, costs no stamina and pays the village (VillageSystem.winRaid). */
type BattleMode = 'final' | 'extra' | 'weekday' | 'raid' | undefined;

export class BattleScene extends Phaser.Scene {
  private stageIndex = 0;
  private mode: BattleMode;
  /** 曜日ダンジョン only: 0 = 日曜 ... 6 = 土曜. */
  private weekdayDay = 0;
  /** 襲撃 only: varies the pack of beasts. */
  private raidSeed = 0;
  private save!: SaveData;
  private generator!: CharacterGenerator;
  private anim!: AnimationController;
  private popups!: DamagePopupPool;
  private fx!: BattleFx;
  /** False while the party is still rising into place: the fight waits for it. */
  private ready = false;
  /** Set once the fight is over, so the end is handled once. */
  private ending = false;
  private engine!: BattleEngine;
  private views = new Map<string, UnitView>();
  private resultOverlay?: Phaser.GameObjects.Container;
  private autoSkill?: AutoSkillToggle;
  private speed?: SpeedToggle;
  private partyBar?: PartyBar;
  private modal?: ModalHandle;
  /** A member's hero borrowed for this fight (助っ人): stands in the back row as one more unit; it earns no EXP. */
  private helper?: HelperHero;

  private currentStageDef?: StageDef;
  private finalStage?: FinalStageDef;
  private waveIndex = 0;
  private rewardGold = BigNumber.ZERO;
  private rewardExp = 0;
  private rewardSkillEssence = 0;

  constructor() {
    super('Battle');
  }

  init(data: { stageIndex?: number; mode?: BattleMode; day?: number; seed?: number; helper?: HelperHero }): void {
    this.helper = data.helper;
    this.stageIndex = data.stageIndex ?? 0;
    this.mode = data.mode;
    this.weekdayDay = data.day ?? 0;
    this.raidSeed = data.seed ?? 0;
    this.views.clear();
    this.resultOverlay = undefined;
    this.autoSkill = undefined;
    this.speed = undefined;
    this.partyBar = undefined;
    this.ready = false;
    this.ending = false;
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
    this.fx = new BattleFx(this);
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
    } else if (this.mode === 'weekday') {
      this.currentStageDef = ProgressionSystem.getWeekdayStage(this.weekdayDay, this.stageIndex);
      title = this.currentStageDef.name;
      this.rewardGold = this.currentStageDef.rewardGold;
      this.rewardExp = this.currentStageDef.rewardExp;
      this.rewardSkillEssence = this.currentStageDef.rewardSkillEssence;
    } else if (this.mode === 'raid') {
      this.currentStageDef = ProgressionSystem.getRaidStage(this.stageIndex, this.raidSeed);
      title = this.currentStageDef.name;
      // The village pays a won 襲撃 (gold included): see VillageSystem.winRaid.
      this.rewardGold = BigNumber.ZERO;
      this.rewardExp = this.currentStageDef.rewardExp;
      this.rewardSkillEssence = 0;
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
    hud.add(new Button(this, 104, 62, 160, 62, '撤退', () => this.scene.start(this.mode === 'raid' ? 'Village' : 'Home'), { variant: 'wood', fontSize: '26px' }));
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
    const helperHero = this.helper ? AllianceService.helperToHeroData(this.helper) : undefined;
    if (helperHero) playerUnits.push(BattleSystem.createPlayerUnit(helperHero, 'back', pBack.length));
    this.layoutUnits(playerUnits, true, true);
    this.partyBar = new PartyBar(this, {
      generator: this.generator,
      units: playerUnits,
      heroOf: (u) => SaveSystem.getHero(this.save, u.id) ?? (helperHero && u.id === helperHero.id ? helperHero : undefined),
      onTap: (u) => this.onHeroTap(u.id),
    });
    this.riseParty();

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
    if (this.mode === 'weekday') {
      const dungeonRegion = getRegion(ProgressionSystem.getWeekdayStage(this.weekdayDay, this.stageIndex).regionIndex);
      applyBattleBackground(this, dungeonRegion.id, dungeonRegion.look.battleTint);
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

  private layoutUnits(units: UnitInstance[], isPlayer: boolean, entrance = false): void {
    const frontY = isPlayer ? PARTY_ROW_Y.front : ENEMY_ROW_Y.front;
    const backY = isPlayer ? PARTY_ROW_Y.back : ENEMY_ROW_Y.back;
    this.placeRow(units.filter((u) => u.row === 'front'), frontY, isPlayer, entrance);
    this.placeRow(units.filter((u) => u.row === 'back'), backY, isPlayer, entrance);
  }

  private placeRow(units: UnitInstance[], y: number, isPlayer: boolean, entrance: boolean): void {
    const spacing = isPlayer ? PARTY_SPACING : ENEMY_SPACING;
    const startX = 360 - ((units.length - 1) * spacing) / 2;
    units.forEach((unit, i) => this.createUnitView(unit, startX + i * spacing, y, isPlayer, entrance));
  }

  /** A view's pieces, which move together. */
  private partsOf(view: UnitView): Positioned[] {
    return [view.sprite, view.readyRing];
  }

  /** At the start: the party rises in from below the screen; the fight begins once they are up. */
  private riseParty(): void {
    const views = [...this.views.values()].filter((v) => v.unit.isPlayer);
    this.fx.rise(
      views.map((v) => this.partsOf(v)),
      () => {
        this.ready = true;
        for (const v of views) if (v.sprite.active) this.anim.idle(v.sprite);
      },
    );
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
    const events = this.engine.triggerUlt(unitId);
    this.handleEvents(events);
  }

  update(_time: number, delta: number): void {
    if (!this.ready || !this.engine || this.engine.isOver()) return;
    // The tutorial's speech holds the fight still while it is on screen.
    if (TutorialDirector.isBlocking()) return;
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

  private handleEvents(events: BattleEvent[]): void {
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
      else if (event.kind === 'victory') this.onWaveOrBattleVictory();
      else if (event.kind === 'defeat') this.onBattleEnd(false);
    }
  }

  private onAttack(event: Extract<BattleEvent, { kind: 'attack' }>): void {
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

  /** A hero's unlocked skill firing: unlike a plain attack this can hit
   *  every enemy (AoE), land on allies (heals/buffs), or revive a unit
   *  whose view was already torn down by onDefeated - that last case
   *  rebuilds the view from scratch instead of animating a destroyed one. */
  private onSkillCast(event: Extract<BattleEvent, { kind: 'skillCast' }>): number {
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
        const unit = this.engine.units.find((u) => u.id === result.targetId);
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

  /** Recomputes a player unit's on-screen slot from its row/position among
   *  the party, the same layout formula layoutUnits/placeRow used when the
   *  battle started - needed to rebuild a revived unit's view, since its
   *  original one was already destroyed by onDefeated. */
  private computePlayerUnitPosition(unit: UnitInstance): { x: number; y: number } {
    const rowUnits = this.engine.playerUnits.filter((u) => u.row === unit.row);
    const i = Math.max(0, rowUnits.findIndex((u) => u.id === unit.id));
    const startX = 360 - ((rowUnits.length - 1) * PARTY_SPACING) / 2;
    return { x: startX + i * PARTY_SPACING, y: PARTY_ROW_Y[unit.row] };
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

  /** An enemy's floating name and HP bar. */
  private destroyBars(view: UnitView): void {
    view.bars?.hpBg.destroy();
    view.bars?.hpFill.destroy();
    view.bars?.nameText.destroy();
  }

  private clearEnemyViews(): void {
    for (const [id, view] of [...this.views]) {
      if (view.unit.isPlayer) continue;
      this.anim.destroyAura(id);
      view.readyPulse?.stop();
      view.sprite.destroy();
      this.destroyBars(view);
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
    if (this.resultOverlay || this.ending) return;
    this.ending = true;
    // The bottom of the screen is the panel's now: the cards drop away, and so do the controls.
    this.partyBar?.refresh();
    this.partyBar?.leave();
    for (const control of [this.autoSkill, this.speed]) control?.setVisible(false);
    SoundSystem.play(this, victory ? 'victory' : 'defeat');
    const next = victory ? this.nextStageOffer() : null;

    // The clear is settled first: what it pays decides how tall the panel is.
    let tiles: RewardTile[] = [];
    let levelUp: LevelUp | null = null;
    let party: PartyGain[] = [];
    let chainWins = 0;
    const chain = AutoAdvance.isOn(this.game, this.save);
    if (victory) {
      // 曜日ダンジョン pays its day's 素材 in fixed amounts, and is no stage of the campaign.
      const weekday = this.mode === 'weekday';
      // A 襲撃 is no stage of the campaign either: the village pays it.
      const raid = this.mode === 'raid';
      const stage: QuestStage = { kind: this.mode === 'extra' || this.mode === 'final' ? this.mode : 'main', index: this.stageIndex };
      // First-clear status has to be read before the progress counters move.
      const noBonus: StageBonus = { firstClear: false, gems: 0, phaseMaterials: 0, items: [], materials: {} };
      const bonus = raid
        ? noBonus
        : weekday
          ? WeekdayDungeonSystem.bonus(this.weekdayDay, this.stageIndex)
          : StageRewardSystem.roll(stage, StageRewardSystem.isFirstClear(this.save, stage), this.rewardExp);
      const raidWin = raid ? VillageSystem.winRaid(this.save) : null;
      SaveSystem.addGold(this.save, this.rewardGold);
      SaveSystem.addSkillEssence(this.save, this.rewardSkillEssence);
      StageRewardSystem.grant(this.save, bonus);
      // Who was on the field, and where they stood before the EXP: the result shows the change.
      party = this.engine.playerUnits.flatMap((unit) => {
        const hero = SaveSystem.getHero(this.save, unit.id);
        return hero ? [{ hero, levelBefore: hero.level, expBefore: hero.exp, gained: hero.level >= MAX_LEVEL ? 0 : this.rewardExp }] : [];
      });
      for (const unit of this.engine.playerUnits) {
        SaveSystem.grantExp(this.save, unit.id, this.rewardExp);
      }
      this.applyProgressionOnVictory();
      if (!raid) recordMission(this.save, 'quest_clear');
      // プレイヤーEXP = the stamina this stage cost.
      const playerExp = raid ? RAID_PLAYER_EXP : weekday ? getWeekdayTier(this.stageIndex).stamina : stageStaminaCost(stage.kind, stage.index);
      levelUp = PlayerLevelSystem.gain(this.save, playerExp);
      SaveSystem.save(this.save);
      if (chain) AutoAdvance.addWin(this.game);

      tiles = [
        { kind: 'gold', amount: `+${(raidWin ? raidWin.gold : this.rewardGold).toString()}` },
        { kind: 'exp', amount: `+${this.rewardExp}` },
      ];
      if (!raid) tiles.push({ kind: 'essence', amount: `+${this.rewardSkillEssence}` });
      tiles.push({ kind: 'rank', amount: `+${playerExp}`, tag: levelUp ? `Lv${levelUp.to}` : undefined });
      if (levelUp) tiles.push({ kind: 'gems', amount: `+${levelUp.gems}`, tag: 'LvUP' });
      if (bonus.gems > 0) tiles.push({ kind: 'gems', amount: `+${bonus.gems}`, tag: '初回' });
      if (bonus.phaseMaterials > 0) tiles.push({ kind: 'phaseMaterials', amount: `+${bonus.phaseMaterials}`, tag: 'ドロップ' });
      for (const { item, amount } of bonus.items) tiles.push({ kind: 'item', item, amount: `+${amount}`, tag: 'ドロップ' });
    } else if (chain) {
      // A loss ends a 連戦.
      chainWins = AutoAdvance.wins(this.game);
      stopAutoAdvance(this.game);
    }

    if (!victory) {
      this.showResult(false, null, [], null, [], false, chainWins, chain);
      return;
    }
    // The win: a flash and confetti, the party floating up off the screen, then the panel.
    this.fx.clearCombo();
    this.fx.victory();
    this.exitParty(() => this.showResult(true, next, tiles, levelUp, party, chain && !!next, chainWins, chain));
  }

  /** After a win the party lifts off the top of the screen, fading; `onDone` runs once they are gone. */
  private exitParty(onDone: () => void): void {
    const views = [...this.views.values()].filter((v) => v.unit.isPlayer && v.sprite.active);
    for (const v of views) {
      this.anim.destroyAura(v.unit.id);
      v.readyPulse?.stop();
      v.readyRing.setVisible(false);
      this.tweens.killTweensOf(v.sprite);
    }
    this.fx.exit(views.map((v) => this.partsOf(v)), onDone);
  }

  /** The panel: the title, the party with its EXP, what was won, and the ways on. */
  private showResult(
    victory: boolean,
    next: QuestStage | null,
    tiles: RewardTile[],
    levelUp: LevelUp | null,
    party: PartyGain[],
    chaining: boolean,
    chainWins: number,
    wasChain: boolean,
  ): void {
    const grid = victory ? buildRewardGrid(this, tiles, 600) : undefined;
    const partyResult = party.length > 0 ? buildPartyResult(this, this.generator, this.fx, party, 600) : undefined;

    // Title, the party, the reward tiles, then the buttons (and, with a next stage on offer, a row of ways out).
    const gridH = grid?.height ?? 0;
    const partyH = partyResult ? partyResult.height + 10 : 0;
    const chainH = chaining ? 44 : 0;
    const buttonsH = !victory ? 90 : next ? 230 + chainH : 120;
    const panelH = (victory ? 112 : 170) + partyH + gridH + buttonsH;
    const top = 640 - panelH / 2;
    const partyTop = top + 104;
    const gridTop = top + 112 + partyH;
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
    if (!victory && wasChain) {
      container.add(caption(this, 360, top + 130, chainWins > 0 ? `連戦は ${chainWins}勝 で終了です` : '連戦を終了しました', { fontSize: '20px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    }

    if (partyResult) {
      partyResult.container.setPosition(360 - 300, partyTop);
      container.add(partyResult.container);
      enter(this, partyResult.container, { dy: 14, delay: 300 });
      // Once the panel has settled, the bars fill (and a level gained bursts).
      this.time.delayedCall(620, () => partyResult.play());
    }
    if (grid) {
      grid.container.setPosition(360 - 300, gridTop);
      container.add(grid.container);
      enter(this, grid.container, { dy: 14, delay: 320 });
    }

    if (levelUp) {
      SoundSystem.play(this, 'reveal');
      showToast(this, `プレイヤーレベル ${levelUp.from} → ${levelUp.to}！ スタミナが全回復しました`, '#ffd23f');
    }
    const buttons: Button[] = [];
    let countdown: Phaser.Time.TimerEvent | undefined;
    if (next) {
      const cost = stageStaminaCost(next.kind, next.index);
      StaminaSystem.refresh(this.save);
      const enough = StaminaSystem.canAfford(this.save, cost);
      const rowY = buttonsTop + chainH;
      buttons.push(
        new Button(this, 360, rowY + 43, 560, 86, '次のステージへ', () => {
          countdown?.remove();
          this.goToNextStage(next);
        }, {
          variant: 'gold',
          fontSize: '30px',
          subLabel: `${questStageName(next)}　スタミナ ${cost}${enough ? '' : '（不足）'}`,
        }),
      );
      const toList = (): void => {
        this.scene.start('StageSelect', this.mode === 'extra' ? { initialTab: 'extra' } : undefined);
      };
      if (chaining) {
        // 連戦: the next fight starts by itself after a short count, unless the player stops it.
        let remaining = 4;
        const note = caption(this, 360, buttonsTop + 14, `連戦中…　${remaining}秒後に次のステージへ`, { fontSize: '22px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 4 }).setOrigin(0.5);
        container.add(note);
        const stop = new Button(this, 160, rowY + 150, 190, 66, 'ストップ', () => {
          countdown?.remove();
          stopAutoAdvance(this.game);
          note.setText('連戦をとめました');
          stop.setEnabled(false);
        }, { variant: 'danger', fontSize: '24px' });
        buttons.push(
          stop,
          new Button(this, 360, rowY + 150, 190, 66, 'ホームへ', () => this.scene.start('Home'), { variant: 'wood', fontSize: '22px' }),
          new Button(this, 560, rowY + 150, 190, 66, 'クエスト一覧', toList, { variant: 'wood', fontSize: '22px' }),
        );
        countdown = this.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            remaining -= 1;
            if (remaining > 0) {
              note.setText(`連戦中…　${remaining}秒後に次のステージへ`);
              return;
            }
            countdown?.remove();
            this.goToNextStage(next);
          },
        });
      } else {
        buttons.push(
          new Button(this, 215, rowY + 150, 270, 66, 'ホームへ', () => this.scene.start('Home'), { variant: 'wood', fontSize: '24px' }),
          new Button(this, 505, rowY + 150, 270, 66, 'クエスト一覧', toList, { variant: 'wood', fontSize: '24px' }),
        );
      }
    } else {
      buttons.push(
        new Button(this, 360, buttonsTop + 37, 340, 74, victory ? this.continueLabel() : this.mode === 'raid' ? '村へ戻る' : 'ホームへ戻る', () => this.onContinue(victory), {
          variant: victory ? 'gold' : 'wood',
          fontSize: '28px',
        }),
      );
    }
    if (victory) TutorialDirector.trigger(this, 'result');
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
    if (this.mode === 'final' || this.mode === 'weekday' || this.mode === 'raid') return null;
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
    if (this.mode === 'weekday') return 'ダンジョン一覧へ';
    if (this.mode === 'raid') return '村へ戻る';
    return 'ストーリーへ';
  }

  /** 次のステージへ: costs that stage's stamina, like entering it from the map.
   *  Short of it, offers the shop instead. */
  private goToNextStage(next: QuestStage): void {
    if (this.modal?.container.active) return;
    const cost = stageStaminaCost(next.kind, next.index);
    if (!StaminaSystem.canAfford(this.save, cost)) {
      if (AutoAdvance.isOn(this.game, this.save)) {
        stopAutoAdvance(this.game);
        showToast(this, 'スタミナが足りないので、連戦を終了しました');
      }
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
    if (this.mode === 'weekday' || this.mode === 'raid') return;
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
      this.scene.start(this.mode === 'raid' ? 'Village' : 'Home');
      return;
    }

    if (this.mode === 'raid') {
      this.scene.start('Village');
      return;
    }
    if (this.mode === 'final') {
      const ending = getEndingScript();
      this.scene.start('Story', { id: ending.id, lines: ending.lines, next: { scene: 'Home' }, markSeen: { kind: 'ending' } });
      return;
    }
    if (this.mode === 'extra') {
      this.scene.start('StageSelect', { initialTab: 'extra' });
      return;
    }
    if (this.mode === 'weekday') {
      this.scene.start('WeekdayDungeon');
      return;
    }

    const regionIndex = Math.floor(this.stageIndex / STAGES_PER_REGION);
    const stageInRegion = this.stageIndex % STAGES_PER_REGION;
    if (stageInRegion === STAGES_PER_REGION - 1 && !this.save.storyFlags.regionOutro[regionIndex]) {
      const outro = getRegionOutroScript(regionIndex);
      this.scene.start('Story', {
        id: outro.id,
        lines: outro.lines,
        next: { scene: 'Home' },
        markSeen: { kind: 'regionOutro', regionIndex },
      });
      return;
    }
    this.scene.start('Home');
  }
}
