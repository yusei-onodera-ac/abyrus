import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import type { HelperHero, RaidOutcome, RaidTicket } from '../alliance/AllianceBackend';
import { AnimationController } from '../characters/AnimationController';
import { BattleFx, type Positioned } from '../characters/BattleFx';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { ENEMY_ROW_Y, fitEnemyArt } from '../characters/EnemyArt';
import { fitPartyArt, PARTY_ROW_Y, PARTY_SPACING } from '../characters/PartyLayout';
import { BigNumber } from '../systems/BigNumber';
import { BattleEngine, BattleSystem, ULT_MAX, type BattleEvent, type UnitInstance } from '../systems/BattleSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { SoundSystem } from '../systems/SoundSystem';
import { AutoSkillToggle } from '../ui/AutoSkillToggle';
import { applyBattleBackground } from '../ui/Background';
import { fullDigits } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { DamagePopupPool } from '../ui/DamagePopup';
import { createPanel } from '../ui/Panel';
import { PartyBar } from '../ui/PartyBar';
import { SpeedToggle } from '../ui/SpeedToggle';
import { body, caption, heading, CHROME, COLORS } from '../ui/theme';
import { enter, popIn } from '../ui/Transitions';
import { DURATION_FALLBACK_MS } from './allianceRaidConstants';

const INK = '#1c130a';

interface UnitView {
  unit: UnitInstance;
  sprite: Phaser.GameObjects.Sprite;
  readyRing: Phaser.GameObjects.Arc;
  readyPulse?: Phaser.Tweens.Tween;
}

/**
 * 共闘ボスへの挑戦: 60秒の戦闘。自分のパーティ(と、借りた助っ人)が、週のボスを殴る。ボスは、この戦闘のあいだ倒れない特別な敵で、
 * 60秒たつか、パーティが全滅したところで終わる。ボスから奪ったHP = 与えたダメージ。結果は AllianceService.finishRaid に出す
 * (入るダメージには、切符の上限がある)。
 */
export class AllianceRaidBattleScene extends Phaser.Scene {
  private save!: SaveData;
  private ticket!: RaidTicket;
  private helper: HelperHero | null = null;
  private generator!: CharacterGenerator;
  private anim!: AnimationController;
  private popups!: DamagePopupPool;
  private fx!: BattleFx;
  private engine?: BattleEngine;
  private boss?: UnitInstance;
  private bossMaxHp = BigNumber.ZERO;
  private views = new Map<string, UnitView>();
  private ready = false;
  private ended = false;
  private elapsedMs = 0;
  private autoSkill?: AutoSkillToggle;
  private speed?: SpeedToggle;
  private partyBar?: PartyBar;
  private timeText?: Phaser.GameObjects.Text;
  private damageText?: Phaser.GameObjects.Text;
  private bossBar?: Phaser.GameObjects.Graphics;

  constructor() {
    super('AllianceRaidBattle');
  }

  init(data: { ticket: RaidTicket; helper?: HelperHero | null }): void {
    this.ticket = data.ticket;
    this.helper = data.helper ?? null;
    this.views.clear();
    this.engine = undefined;
    this.boss = undefined;
    this.ready = false;
    this.ended = false;
    this.elapsedMs = 0;
    this.autoSkill = undefined;
    this.speed = undefined;
    this.partyBar = undefined;
  }

  create(): void {
    this.save = this.game.registry.get('save');
    this.generator = new CharacterGenerator(this);
    this.anim = new AnimationController(this);
    this.popups = new DamagePopupPool(this);
    this.fx = new BattleFx(this);
    this.cameras.main.setBackgroundColor('#0c0e18');
    applyBattleBackground(this, 'final', 0xd8b0b0);
    this.tweens.timeScale = 1;
    this.time.timeScale = 1;

    const { front, back } = SaveSystem.getPartyHeroes(this.save);
    if (front.length + back.length === 0) {
      caption(this, 360, 640, '編成が空です。', { fontSize: '24px', color: '#ff8080' }).setOrigin(0.5);
      this.time.delayedCall(1500, () => this.scene.start('AllianceRaid'));
      return;
    }
    const players: UnitInstance[] = [
      ...front.map((hero, i) => BattleSystem.createPlayerUnit(hero, 'front', i)),
      ...back.map((hero, i) => BattleSystem.createPlayerUnit(hero, 'back', i)),
    ];
    // A borrowed 助っ人 stands in the back row as the sixth.
    if (this.helper) players.push(BattleSystem.createPlayerUnit(AllianceService.helperToHeroData(this.helper), 'back', back.length));

    // The boss: one big unit that cannot fall in this fight. It hits as hard as the party can bear for about the minute
    // (a hit takes about 1/34 of the party's HP), so tanks and healers matter.
    const total = players.reduce((sum, u) => sum.add(u.maxHp), BigNumber.ZERO);
    const boss = BattleSystem.createEnemyUnit({ seed: 5150, heroClass: this.ticket.boss.heroClass, rarity: 5, name: this.ticket.boss.name, art: this.ticket.boss.art, isBoss: true }, 0, 'front', 1);
    boss.maxHp = BigNumber.from(Math.max(1e6, this.ticket.maxDamage) * 20);
    boss.hp = boss.maxHp;
    boss.atk = total.div(34);
    boss.def = 10;
    boss.critRate = 0.05;
    this.boss = boss;
    this.bossMaxHp = boss.maxHp;

    this.autoSkill = new AutoSkillToggle(this, this.save);
    this.speed = new SpeedToggle(this, this.save);
    this.buildHud();

    this.layoutPlayers(players);
    this.createUnitView(boss, 360, ENEMY_ROW_Y.front + 10, false);
    this.partyBar = new PartyBar(this, {
      generator: this.generator,
      units: players,
      heroOf: (u) => SaveSystem.getHero(this.save, u.id) ?? (this.helper && u.id === AllianceService.helperToHeroData(this.helper).id ? AllianceService.helperToHeroData(this.helper) : undefined),
      onTap: (u) => this.handleEvents(this.engine?.triggerUlt(u.id) ?? []),
    });
    this.engine = new BattleEngine(players, [boss]);
    this.rise();
  }

  // ------------------------------------------------------------ HUD --

  private buildHud(): void {
    const hud = this.add.container(0, 0).setDepth(30);
    hud.add(createPanel(this, 360, 84, 696, 148, { fillColor: CHROME.woodFill, fillAlpha: 0.94, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 14, gradient: false }));
    hud.add(new Button(this, 104, 62, 160, 62, '一時停止', () => this.openPause(), { variant: 'wood', fontSize: '24px' }));
    const title = heading(this, 370, 38, this.ticket.boss.name, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
    if (title.width > 290) title.setScale(290 / title.width);
    hud.add(title);
    this.timeText = body(this, 672, 40, '1:00', { fontSize: '36px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 6 }).setOrigin(1, 0.5);
    hud.add(this.timeText);
    this.damageText = body(this, 360, 92, 'ダメージ 0', { fontSize: '30px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 5 }).setOrigin(0.5);
    hud.add(this.damageText);
    this.bossBar = this.add.graphics();
    hud.add(this.bossBar);
    this.drawBossBar(0);
    enter(this, hud, { dy: -20, duration: 260 });
  }

  /** The bar under the boss's name shows the share of this attempt's damage cap reached (the boss itself never falls). */
  private drawBossBar(ratio: number): void {
    const g = this.bossBar;
    if (!g) return;
    g.clear();
    g.fillStyle(0x0d0905, 1);
    g.fillRoundedRect(60, 122, 600, 18, 9);
    if (ratio > 0) {
      g.fillStyle(0xc0392b, 1);
      g.fillRoundedRect(60, 122, Math.max(18, 600 * Math.min(1, ratio)), 18, 9);
    }
    g.lineStyle(2, CHROME.brassDark, 1);
    g.strokeRoundedRect(60, 122, 600, 18, 9);
  }

  private openPause(): void {
    if (this.ended || !this.ready || this.scene.isPaused()) return;
    this.scene.pause();
    this.scene.launch('Pause', {
      of: 'AllianceRaidBattle',
      lines: ['戦闘はここで止まっています。', 'リタイアすると、ここまでのダメージで終わります。'],
      onRetire: () => this.finish(),
    });
    this.scene.bringToTop('Pause');
  }

  // ----------------------------------------------------------- field --

  private layoutPlayers(units: UnitInstance[]): void {
    for (const row of ['front', 'back'] as const) {
      const rowUnits = units.filter((u) => u.row === row);
      const startX = 360 - ((rowUnits.length - 1) * PARTY_SPACING) / 2;
      rowUnits.forEach((unit, i) => this.createUnitView(unit, startX + i * PARTY_SPACING, PARTY_ROW_Y[row], true, true));
    }
  }

  private rise(): void {
    const views = [...this.views.values()].filter((v) => v.unit.isPlayer);
    this.fx.rise(
      views.map((v) => [v.sprite, v.readyRing] as Positioned[]),
      () => {
        this.ready = true;
        for (const v of views) if (v.sprite.active) this.anim.idle(v.sprite);
      },
    );
  }

  private createUnitView(unit: UnitInstance, x: number, y: number, isPlayer: boolean, entrance = false): void {
    const art = isPlayer ? fitPartyArt(this, this.generator, unit) : fitEnemyArt(this, unit.art, true);
    const generated = art ? null : this.generator.generate(unit.seed, unit.heroClass, unit.rarity, unit.heroId);
    const sprite = this.add.sprite(x, y, art?.key ?? generated?.textureKey ?? '');
    if (art) sprite.setDisplaySize(art.width * (isPlayer ? 1 : 1.25), art.height * (isPlayer ? 1 : 1.25));
    else sprite.setDisplaySize((generated?.size ?? 96) * 0.9, (generated?.size ?? 96) * 0.9);
    if (!isPlayer && !art) sprite.setFlipX(true);
    sprite.setData('baseScale', sprite.scaleX);
    const size = art ? art.height : (generated?.size ?? 96);
    const readyRing = this.add.circle(x, y, size * 0.52).setStrokeStyle(3, 0xffd23f, 0.9).setVisible(false);
    if (!entrance) this.anim.idle(sprite);
    this.anim.attachAura(unit.id, sprite, unit.rarity);
    this.views.set(unit.id, { unit, sprite, readyRing });
  }

  // ----------------------------------------------------------- update --

  update(_time: number, delta: number): void {
    if (this.ended || !this.ready || !this.engine) return;
    const speed = this.speed?.factor() ?? 1;
    this.tweens.timeScale = speed;
    this.time.timeScale = speed;
    const step = delta * speed;
    this.handleEvents(this.engine.update(step));
    this.elapsedMs += step;
    if (this.autoSkill?.isOn()) this.castReadySkills();
    this.refresh();
    if (this.elapsedMs >= (this.ticket.durationMs || DURATION_FALLBACK_MS)) this.finish();
  }

  private castReadySkills(): void {
    const engine = this.engine;
    if (!engine) return;
    for (const unit of engine.playerUnits) {
      if (this.ended || engine.isOver()) return;
      if (unit.alive && unit.ultGauge >= ULT_MAX && unit.skills.length > 0) this.handleEvents(engine.triggerUlt(unit.id));
    }
  }

  /** What the boss has lost so far (never above this attempt's cap). */
  private damageDealt(): number {
    const boss = this.boss;
    if (!boss) return 0;
    const lost = this.bossMaxHp.sub(boss.hp).toNumber();
    return Math.max(0, Math.min(this.ticket.maxDamage, lost));
  }

  private refresh(): void {
    const left = Math.max(0, (this.ticket.durationMs || DURATION_FALLBACK_MS) - this.elapsedMs);
    const sec = Math.ceil(left / 1000);
    this.timeText?.setText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    const damage = this.damageDealt();
    this.damageText?.setText(`ダメージ ${fullDigits(damage)}`);
    this.drawBossBar(this.ticket.maxDamage > 0 ? damage / this.ticket.maxDamage : 0);
    for (const view of this.views.values()) {
      if (!view.unit.isPlayer) continue;
      const ready = view.unit.ultGauge >= 100;
      if (ready && !view.readyRing.visible) {
        this.fx.ready(view.sprite.x, view.sprite.y);
        view.readyRing.setVisible(true).setScale(1).setAlpha(1);
        view.readyPulse = this.tweens.add({ targets: view.readyRing, scale: 1.18, alpha: 0.4, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (!ready && view.readyRing.visible) {
        view.readyPulse?.stop();
        view.readyPulse = undefined;
        view.readyRing.setVisible(false).setScale(1).setAlpha(1);
      }
    }
    this.partyBar?.refresh();
  }

  // ----------------------------------------------------------- events --

  private handleEvents(events: BattleEvent[]): void {
    let hold = 0;
    for (const event of events) {
      if (event.kind === 'attack') this.onAttack(event);
      else if (event.kind === 'skillCast') hold = this.onSkillCast(event);
      else if (event.kind === 'defeated') {
        const id = event.unitId;
        if (hold > 0) this.time.delayedCall(hold, () => this.onDefeated(id));
        else this.onDefeated(id);
      } else if (event.kind === 'defeat') this.finish();
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
    // The boss is too big to be shoved about.
    if (targetView.unit.isPlayer) this.anim.knockback(target, attackerView.sprite, event.crit ? 24 : 12);
    this.popups.pop(target.x, target.y - 30, event.damage, { crit: event.crit });
    this.fx.hit(target.x, target.y, { crit: event.crit });
    if (attackerView.unit.isPlayer) this.fx.combo();
  }

  private onSkillCast(event: Extract<BattleEvent, { kind: 'skillCast' }>): number {
    SoundSystem.play(this, 'skill');
    const casterView = this.views.get(event.casterId);
    const fromPlayer = !!casterView?.unit.isPlayer;
    if (fromPlayer) this.partyBar?.cast(event.casterId);
    let hold = 0;
    if (casterView) {
      this.anim.attack(casterView.sprite, fromPlayer);
      this.fx.skillStart(casterView.sprite.x, casterView.sprite.y, event.effectKind, event.skillName, fromPlayer);
    }
    for (const result of event.results) {
      if (result.revived) {
        const unit = this.engine?.playerUnits.find((u) => u.id === result.targetId);
        if (!unit) continue;
        const pos = this.positionOf(unit);
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
        const { damage } = result;
        const crit = !!result.crit;
        const sprite = targetView.sprite;
        const land = (): void => {
          if (!sprite.active) return;
          this.anim.hitFlash(sprite, crit);
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

  private positionOf(unit: UnitInstance): { x: number; y: number } {
    const rowUnits = (this.engine?.playerUnits ?? []).filter((u) => u.row === unit.row);
    const i = Math.max(0, rowUnits.findIndex((u) => u.id === unit.id));
    const startX = 360 - ((rowUnits.length - 1) * PARTY_SPACING) / 2;
    return { x: startX + i * PARTY_SPACING, y: PARTY_ROW_Y[unit.row] };
  }

  private onDefeated(unitId: string): void {
    const view = this.views.get(unitId);
    if (!view || !view.unit.isPlayer) return;
    this.anim.destroyAura(unitId);
    view.readyPulse?.stop();
    view.readyRing.destroy();
    this.fx.kill(view.sprite.x, view.sprite.y, true);
    this.anim.death(view.sprite, () => {
      view.sprite.destroy();
      this.views.delete(unitId);
    });
  }

  // ----------------------------------------------------------- result --

  /** The fight is over (the minute is up, the party is down, or 一時停止 -> リタイア): the damage goes to the 同盟. */
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.fx.clearCombo();
    const damage = this.damageDealt();
    this.partyBar?.leave();
    for (const control of [this.autoSkill, this.speed]) control?.setVisible(false);
    void this.submit(damage);
  }

  private async submit(damage: number): Promise<void> {
    const result = await AllianceService.finishRaid(this.save, this.ticket, damage);
    SaveSystem.save(this.save);
    if (!this.scene.isActive()) return;
    this.showResult(damage, result.ok ? result.value : null, result.ok ? '' : result.message);
  }

  private showResult(damage: number, outcome: RaidOutcome | null, error: string): void {
    const container = this.add.container(0, 0).setDepth(80);
    const overlay = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0).setInteractive();
    container.add(overlay);
    this.tweens.add({ targets: overlay, fillAlpha: 0.82, duration: 220 });
    const panelH = 640;
    const top = 640 - panelH / 2;
    const panel = createPanel(this, 360, 640, 640, panelH, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 20, rarity: 5, gradient: false });
    container.add(panel);
    panel.setScale(0.9);
    popIn(this, panel, { duration: 320, delay: 80 });
    container.add(heading(this, 360, top + 62, outcome?.defeated ? 'ボス撃破！' : '挑戦おわり', { fontSize: '46px', color: '#ffe9b8', stroke: INK, strokeThickness: 7 }).setOrigin(0.5));
    container.add(body(this, 360, top + 150, `${fullDigits(outcome?.damage ?? damage)}`, { fontSize: '50px', fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 7 }).setOrigin(0.5));
    container.add(caption(this, 360, top + 196, 'ダメージ', { fontSize: '22px', color: '#cdbb94', stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    const rows: [string, string][] = [];
    if (outcome) {
      if (outcome.damage < damage) rows.push(['切り捨て', '1回の上限をこえた分は入りません']);
      rows.push(['ボスの残りHP', outcome.defeated ? 'なし（撃破）' : `${fullDigits(outcome.hpLeft)}`]);
      rows.push(['同盟ポイント', `+${outcome.points.toLocaleString('ja-JP')}`]);
      if (outcome.lastHit) rows.push(['とどめ', 'あなたが倒しました！']);
    }
    rows.forEach(([label, value], i) => {
      const y = top + 270 + i * 54;
      container.add(caption(this, 90, y, label, { fontSize: '22px', color: '#cdbb94', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      const t = body(this, 630, y, value, { fontSize: '24px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5);
      if (t.width > 380) t.setScale(380 / t.width);
      container.add(t);
    });
    if (error) container.add(caption(this, 360, top + 300, `送れませんでした。\n${error}`, { fontSize: '22px', color: '#ff9a8a', stroke: INK, strokeThickness: 4, align: 'center' }).setOrigin(0.5));
    const back = new Button(this, 360, top + panelH - 70, 360, 80, '同盟に戻る', () => this.scene.start('AllianceRaid'), { variant: 'gold', fontSize: '32px' });
    container.add(back);
    back.setScale(0);
    this.tweens.add({ targets: back, scale: 1, duration: 280, delay: 380, ease: 'Back.easeOut' });
  }
}
