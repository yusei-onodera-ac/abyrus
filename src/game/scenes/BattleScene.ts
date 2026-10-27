import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { BattleSystem, BattleEngine, type UnitInstance, type BattleEvent } from '../systems/BattleSystem';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { AnimationController } from '../characters/AnimationController';
import { DamagePopupPool } from '../ui/DamagePopup';

interface UnitView {
  unit: UnitInstance;
  sprite: Phaser.GameObjects.Sprite;
  hpFill: Phaser.GameObjects.Rectangle;
  ultFill: Phaser.GameObjects.Rectangle;
  readyRing: Phaser.GameObjects.Arc;
  nameText: Phaser.GameObjects.Text;
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

    const stage = ProgressionSystem.getStage(this.stageIndex);
    this.add.text(360, 40, stage.name, { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);

    const backBtn = this.add.rectangle(60, 40, 90, 40, 0x2a2c3d).setStrokeStyle(2, 0x4a4d66).setInteractive({ useHandCursor: true });
    this.add.text(60, 40, '撤退', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5);
    backBtn.on('pointerdown', () => this.scene.start('Home'));

    const { front: pFront, back: pBack } = SaveSystem.getPartyHeroes(this.save);
    if (pFront.length + pBack.length === 0) {
      this.add
        .text(360, 640, '編成が空です。\n名鑑でパーティを編成してください。', { fontSize: '16px', color: '#ff8080', align: 'center' })
        .setOrigin(0.5);
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
    const { textureKey, size } = this.generator.generate(unit.seed, unit.heroClass, unit.rarity);
    const sprite = this.add.sprite(x, y, textureKey).setDisplaySize(size * 0.9, size * 0.9);
    if (!isPlayer) sprite.setFlipX(true);

    const nameText = this.add.text(x, y - size / 2 - 14, unit.name, { fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
    const barWidth = 90;
    this.add.rectangle(x, y + size / 2 + 4, barWidth, 7, 0x000000, 0.6);
    const hpFill = this.add.rectangle(x - barWidth / 2, y + size / 2 + 4, barWidth, 7, 0x4caf50).setOrigin(0, 0.5);
    const ultFill = this.add.rectangle(x - barWidth / 2, y + size / 2 + 13, barWidth, 4, 0xffd23f).setOrigin(0, 0.5).setScale(0, 1);
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
        view.readyRing.setVisible(view.unit.ultGauge >= 100);
      }
    }
  }

  private handleEvents(events: BattleEvent[]): void {
    for (const event of events) {
      if (event.kind === 'attack') this.onAttack(event);
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

  private onDefeated(unitId: string): void {
    const view = this.views.get(unitId);
    if (!view) return;
    this.anim.destroyAura(unitId);
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
    const overlay = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.8).setInteractive();
    container.add(overlay);

    const title = this.add
      .text(360, 540, victory ? '勝利!' : '敗北…', { fontSize: '40px', color: victory ? '#ffd23f' : '#ff6b6b' })
      .setOrigin(0.5);
    container.add(title);

    if (victory) {
      const stage = ProgressionSystem.getStage(this.stageIndex);
      SaveSystem.addGold(this.save, stage.rewardGold);
      for (const unit of this.engine.playerUnits) {
        SaveSystem.grantExp(this.save, unit.id, stage.rewardExp);
      }
      SaveSystem.clearStage(this.save, this.stageIndex);
      SaveSystem.save(this.save);
      const rewardText = this.add
        .text(360, 600, `+${stage.rewardGold.toString()} G   +${stage.rewardExp} EXP`, { fontSize: '18px', color: '#ffffff' })
        .setOrigin(0.5);
      container.add(rewardText);
    }

    const btn = this.add.rectangle(360, 700, 220, 60, 0x2a2c3d).setStrokeStyle(2, 0x4a4d66).setInteractive({ useHandCursor: true });
    const btnText = this.add.text(360, 700, victory ? '次へ進む' : 'ホームへ戻る', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    container.add([btn, btnText]);
    btn.on('pointerdown', () => this.scene.start('Home'));
  }
}
