import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
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
  hpFill: Phaser.GameObjects.Rectangle;
  ultFill: Phaser.GameObjects.Rectangle;
  readyRing: Phaser.GameObjects.Arc;
  nameText: Phaser.GameObjects.Text;
  readyPulse?: Phaser.Tweens.Tween;
}

export class BattleScene extends Phaser.Scene {
  private stageIndex = 0;
  private save!: SaveData;
  private generator!: CharacterGenerator;
  private anim!: AnimationController;
  private popups!: DamagePopupPool;
  private engine!: BattleEngine;
  private views = new Map<string, UnitView>();
  private resultOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super('Battle');
  }

  init(data: { stageIndex?: number }): void {
    this.stageIndex = data.stageIndex ?? 0;
    this.views.clear();
    this.resultOverlay = undefined;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.generator = new CharacterGenerator(this);
    this.anim = new AnimationController(this);
    this.popups = new DamagePopupPool(this);
    this.cameras.main.setBackgroundColor('#0c0e18');
    applyBackground(this, 'battle');

    const stage = ProgressionSystem.getStage(this.stageIndex);
    const title = subheading(this, 360, 40, stage.name, { fontSize: '22px' }).setOrigin(0.5);
    enter(this, title, { dy: -14, duration: 300 });

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

    const frontEnemies = stage.enemies.slice(0, 3);
    const backEnemies = stage.enemies.slice(3, 5);
    const enemyUnits: UnitInstance[] = [
      ...frontEnemies.map((def, i) => BattleSystem.createEnemyUnit(def, this.stageIndex, 'front', i)),
      ...backEnemies.map((def, i) => BattleSystem.createEnemyUnit(def, this.stageIndex, 'back', i)),
    ];

    this.engine = new BattleEngine(playerUnits, enemyUnits);

    this.layoutUnits(playerUnits, true);
    this.layoutUnits(enemyUnits, false);
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
    this.add.rectangle(x, y + size / 2 + 4, barWidth, 7, 0x000000, 0.6).setRounded(3);
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

    this.views.set(unit.id, { unit, sprite, hpFill, ultFill, readyRing, nameText });
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
      else if (event.kind === 'skillCast') this.onSkillCast(event);
      else if (event.kind === 'defeated') this.onDefeated(event.unitId);
      else if (event.kind === 'victory') this.onBattleEnd(true);
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

  /** A hero's unlocked skill firing: unlike a plain attack this can hit
   *  every enemy (AoE), land on allies (heals/buffs), or revive a unit
   *  whose view was already torn down by onDefeated - that last case
   *  rebuilds the view from scratch instead of animating a destroyed one. */
  private onSkillCast(event: Extract<BattleEvent, { kind: 'skillCast' }>): void {
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
      view.hpFill.destroy();
      view.ultFill.destroy();
      view.nameText.destroy();
    });
  }

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
      const stage = ProgressionSystem.getStage(this.stageIndex);
      SaveSystem.addGold(this.save, stage.rewardGold);
      SaveSystem.addSkillEssence(this.save, stage.rewardSkillEssence);
      for (const unit of this.engine.playerUnits) {
        SaveSystem.grantExp(this.save, unit.id, stage.rewardExp);
      }
      SaveSystem.clearStage(this.save, this.stageIndex);
      SaveSystem.save(this.save);
      const rewardText = numeric(
        this,
        360,
        600,
        `+${stage.rewardGold.toString()} G   +${stage.rewardExp} EXP   +${stage.rewardSkillEssence} 技素`,
        { fontSize: '16px' },
      ).setOrigin(0.5);
      container.add(rewardText);
      enter(this, rewardText, { dy: 12, delay: 320 });
    }

    const btn = new Button(this, 360, 700, 220, 60, victory ? '次へ進む' : 'ホームへ戻る', () => this.scene.start('Home'), {
      variant: victory ? 'primary' : 'secondary',
    });
    container.add(btn);
    btn.setScale(0);
    this.tweens.add({ targets: btn, scale: 1, duration: 280, delay: 380, ease: 'Back.easeOut' });
  }
}
