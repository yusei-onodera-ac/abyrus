import Phaser from 'phaser';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { LeaderboardSystem } from '../systems/LeaderboardSystem';
import { describeSuspendedRun, readSuspendedRun } from '../systems/InfiniteModeSystem';
import { openConfirm } from '../ui/Dialogs';
import { applyBackground } from '../ui/Background';
import { BackButton } from '../ui/BackButton';
import { BottomNavBar } from '../ui/BottomNavBar';
import { Button } from '../ui/Button';
import { wrappedText } from '../ui/CardParts';
import { HeroSlot } from '../ui/HeroSlot';
import { buildInfoPanel } from '../ui/InfoPanel';
import { ResourceBar } from '../ui/ResourceBar';
import { buildFramedScrollView, buildTitlePlate, CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import type { ScrollView } from '../ui/ScrollView';
import { body, caption } from '../ui/theme';
import { formatSurvival } from '../ui/format';
import { enter, enterStagger } from '../ui/Transitions';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { t as tl } from '../i18n';

const INK = '#1c130a';
const PAD = 16;
const GAP = 14;
const RANK_ROWS = 5;
const RANK_ROW_H = 38;

/** The 無限モード event's own screen, opened from the イベント list: what it is,
 *  this device's best, the global ranking, who will fight, and 挑戦開始 (which
 *  goes to the run itself, InfiniteModeScene). */
export class InfiniteLobbyScene extends Phaser.Scene {
  private scroll!: ScrollView;
  private generator!: CharacterGenerator;
  /** False once the scene is left, so a late ranking reply doesn't touch destroyed text. */
  private alive = true;

  constructor() {
    super('InfiniteMode');
  }

  create(): void {
    this.alive = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
    });
    this.generator = new CharacterGenerator(this);
    this.cameras.main.setBackgroundColor('#10121c');
    applyBackground(this, 'event');

    const save: SaveData = this.game.registry.get('save');
    const resourceBar = new ResourceBar(this, 0, 0, 720);
    resourceBar.update(save);
    enter(this, resourceBar, { dy: -20, duration: 280 });

    buildTitlePlate(this, tl('quest.infiniteLobby.title'));
    this.buildList(save);
    new BottomNavBar(this, 720, 1280, 'event');
    enter(this, new BackButton(this, () => this.scene.start('Event')), { dx: -40, dy: 0, duration: 300, delay: 250 });
  }

  private buildList(save: SaveData): void {
    this.scroll = buildFramedScrollView(this);
    const guard = () => this.scroll.isTap();
    const left = (SCREEN_VIEW.w - CARD_WIDTH) / 2;
    const rows: Phaser.GameObjects.Container[] = [];
    let y = left;
    const stack = (card: { container: Phaser.GameObjects.Container; height: number }): void => {
      card.container.setPosition(left, y);
      rows.push(card.container);
      y += card.height + GAP;
    };

    // 挑戦開始 comes right after who is fighting, so it is on screen without scrolling.
    stack(this.buildRulesCard());
    stack(this.buildPartyCard(save, guard));
    const suspended = this.suspendedRun(save);
    if (suspended) stack(this.buildResumeCard(suspended, guard));
    stack(this.buildStartRow(save, guard, suspended !== null));
    stack(this.buildBestCard(save));
    stack(this.buildRankingCard());

    this.scroll.content.add(rows);
    this.scroll.setContentHeight(y - GAP + left);
    enterStagger(this, rows, { dy: 24, duration: 320, delay: 160, stagger: 60 });
  }

  /** What the mode is, in three lines. */
  private buildRulesCard(): { container: Phaser.GameObjects.Container; height: number } {
    const lines = [tl('quest.infiniteLobby.rule1'), tl('quest.infiniteLobby.rule2'), tl('quest.infiniteLobby.rule3')];
    const texts = lines.map((line) => wrappedText(this, PAD, 0, line, CARD_WIDTH - PAD * 2, { fontSize: '20px', color: '#f5e6c8' }));
    let y = 18;
    for (const t of texts) {
      t.setY(y);
      y += t.height + 8;
    }
    const panel = buildInfoPanel(this, CARD_WIDTH, y + 8, tl('quest.infiniteLobby.rules'), 0xc7701c);
    texts.forEach((t) => {
      t.setY(t.y + panel.bodyTop);
      panel.container.add(t);
    });
    return { container: panel.container, height: panel.height };
  }

  /** This device's best, kept in the save. */
  private buildBestCard(save: SaveData): { container: Phaser.GameObjects.Container; height: number } {
    const best = save.infiniteMode;
    const cellH = 84;
    const panel = buildInfoPanel(this, CARD_WIDTH, cellH * 2 + 14, tl('quest.infiniteLobby.personalBest'), 0x3f7a3a);
    const cells: [string, string][] = [
      [tl('quest.infiniteLobby.score'), best.bestScore.toLocaleString('ja-JP')],
      [tl('quest.infiniteLobby.survivalTime'), formatSurvival(best.bestSurvivalSeconds)],
      [tl('quest.infiniteLobby.enemiesDefeated'), tl('quest.infiniteLobby.bestEnemiesDefeated', { bestEnemiesDefeated: best.bestEnemiesDefeated.toLocaleString('ja-JP') })],
      [tl('quest.infiniteLobby.totalRuns'), tl('quest.infiniteLobby.totalRunsValue', { totalRuns: best.totalRuns.toLocaleString('ja-JP') })],
    ];
    cells.forEach(([label, value], i) => {
      const x = PAD + (i % 2) * (CARD_WIDTH / 2);
      const top = panel.bodyTop + 10 + Math.floor(i / 2) * cellH;
      panel.container.add(caption(this, x, top + 14, label, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      panel.container.add(body(this, x, top + 50, value, { fontSize: '32px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    });
    return { container: panel.container, height: panel.height };
  }

  /** Who will fight: the deck in use, tapping goes to the formation screen. */
  private buildPartyCard(save: SaveData, guard: () => boolean): { container: Phaser.GameObjects.Container; height: number } {
    const { front, back } = SaveSystem.getPartyHeroes(save);
    const party = [...front, ...back];
    const size = 100;
    const panel = buildInfoPanel(this, CARD_WIDTH, size + 96, tl('quest.infiniteLobby.party'), 0x3a4f7a);
    const top = panel.bodyTop;
    const slots = front.length + back.length === 0 ? [] : party;
    const gapX = (CARD_WIDTH - PAD * 2 - size * 5) / 4;
    for (let i = 0; i < 5; i++) {
      const hero = slots[i];
      panel.container.add(new HeroSlot(this, PAD + size / 2 + i * (size + gapX), top + 16 + size / 2, { hero, generator: this.generator, onTap: () => this.scene.start('Roster'), guard }, size));
    }
    const power = ProgressionSystem.computeDeckTotals(party).power.toString();
    panel.container.add(caption(this, PAD, top + size + 52, party.length === 0 ? tl('quest.infiniteLobby.partyEmpty') : tl('quest.infiniteLobby.power', { power }), { fontSize: '22px', fontStyle: 'bold', color: party.length === 0 ? '#ff9a8a' : '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    panel.container.add(caption(this, CARD_WIDTH - PAD, top + size + 52, tl('quest.infiniteLobby.tapToEdit'), { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    return { container: panel.container, height: panel.height };
  }

  /** The global top five; the rows fill in when the reply arrives. */
  private buildRankingCard(): { container: Phaser.GameObjects.Container; height: number } {
    const panel = buildInfoPanel(this, CARD_WIDTH, 24 + RANK_ROWS * RANK_ROW_H + 16, tl('quest.infiniteLobby.globalRanking'), 0x6a3fb0);
    const top = panel.bodyTop;
    const status = caption(this, CARD_WIDTH / 2, top + 20 + (RANK_ROWS * RANK_ROW_H) / 2, tl('quest.infiniteLobby.loading'), { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3, align: 'center' }).setOrigin(0.5);
    panel.container.add(status);
    void this.loadRanking(panel.container, top, status);
    return { container: panel.container, height: panel.height };
  }

  private async loadRanking(container: Phaser.GameObjects.Container, top: number, status: Phaser.GameObjects.Text): Promise<void> {
    const result = await LeaderboardSystem.fetchTopScores(RANK_ROWS);
    if (!this.alive) return;
    if (result.status === 'not_configured') {
      status.setText(tl('quest.infiniteLobby.rankingNotReady'));
      return;
    }
    if (result.status === 'error') {
      status.setText(tl('quest.infiniteLobby.rankingError'));
      return;
    }
    if (result.data.length === 0) {
      status.setText(tl('quest.infiniteLobby.rankingEmpty'));
      return;
    }
    status.setText('');
    result.data.forEach((entry, i) => {
      const y = top + 20 + i * RANK_ROW_H + RANK_ROW_H / 2;
      container.add(body(this, PAD, y, tl('quest.infiniteLobby.rankPlace', { i: i + 1 }), { fontSize: '22px', fontStyle: 'bold', color: i === 0 ? '#ffd23f' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      container.add(body(this, PAD + 80, y, entry.playerName, { fontSize: '21px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      container.add(body(this, CARD_WIDTH - PAD, y, entry.score.toLocaleString('ja-JP'), { fontSize: '22px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
    });
  }

  /** A run that was paused or left part-way, if there is one that can still be picked up (every hero in it is still around). */
  private suspendedRun(save: SaveData): ReturnType<typeof readSuspendedRun> {
    const state = readSuspendedRun(save.infiniteMode.suspended);
    if (state && state.players.every((u) => SaveSystem.getHero(save, u.id))) return state;
    if (save.infiniteMode.suspended) {
      delete save.infiniteMode.suspended;
      SaveSystem.save(save);
    }
    return null;
  }

  /** 中断中の挑戦: how far it got, and 続きから. */
  private buildResumeCard(state: NonNullable<ReturnType<typeof readSuspendedRun>>, guard: () => boolean): { container: Phaser.GameObjects.Container; height: number } {
    const info = describeSuspendedRun(state);
    const h = 194;
    const panel = buildInfoPanel(this, CARD_WIDTH, h, tl('quest.infiniteLobby.pausedRun'), 0xe0822a);
    const top = panel.bodyTop;
    const cells: [string, string][] = [
      [tl('quest.infiniteLobby.timeShort'), formatSurvival(info.survivalSeconds)],
      [tl('quest.infiniteLobby.score'), info.score.toLocaleString('ja-JP')],
      [tl('quest.infiniteLobby.defeatedShort'), tl('quest.infiniteLobby.enemiesDefeatedValue', { enemiesDefeated: info.enemiesDefeated.toLocaleString('ja-JP') })],
      [tl('quest.infiniteLobby.difficulty'), `Lv.${Math.floor(info.difficultyIndex) + 1}`],
    ];
    cells.forEach(([label, value], i) => {
      const x = PAD + (i % 2) * (CARD_WIDTH / 2);
      const y = top + 10 + Math.floor(i / 2) * 46;
      panel.container.add(caption(this, x, y + 12, label, { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      panel.container.add(body(this, x + 104, y + 12, value, { fontSize: '24px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    });
    panel.container.add(new Button(this, CARD_WIDTH / 2, top + 130, CARD_WIDTH - PAD * 2, 76, tl('quest.infiniteLobby.resume'), () => this.scene.start('InfiniteRun', { resume: true }), { variant: 'gold', fontSize: '32px', guard }));
    return { container: panel.container, height: panel.height };
  }

  /** 挑戦開始, or why it cannot be pressed. With a run set aside it starts over instead (after asking). */
  private buildStartRow(save: SaveData, guard: () => boolean, hasSuspended = false): { container: Phaser.GameObjects.Container; height: number } {
    const { front, back } = SaveSystem.getPartyHeroes(save);
    const hasParty = front.length + back.length > 0;
    const h = 92;
    const container = this.add.container(0, 0);
    const start = (): void => {
      if (!hasSuspended) {
        this.scene.start('InfiniteRun');
        return;
      }
      openConfirm(this, this.scroll, {
        title: tl('quest.infiniteLobby.startOverTitle'),
        message: tl('quest.infiniteLobby.startOverMessage'),
        confirmLabel: tl('quest.infiniteLobby.startNew'),
        confirmVariant: 'gold',
        onConfirm: () => {
          delete save.infiniteMode.suspended;
          SaveSystem.save(save);
          this.scene.start('InfiniteRun');
        },
      });
    };
    const button = new Button(this, CARD_WIDTH / 2, h / 2, CARD_WIDTH, h, !hasParty ? tl('quest.shared.emptyParty') : hasSuspended ? tl('quest.infiniteLobby.newRun') : tl('quest.infiniteLobby.startRun'), start, {
      variant: hasParty && !hasSuspended ? 'gold' : 'wood',
      fontSize: '34px',
      guard,
    });
    button.setEnabled(hasParty);
    container.add(button);
    return { container, height: h };
  }
}
