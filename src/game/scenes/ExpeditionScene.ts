import Phaser from 'phaser';
import { CharacterGenerator } from '../characters/CharacterGenerator';
import { EXPEDITIONS, EXPEDITION_CLASS_BONUS, EXPEDITION_SLOTS, getExpedition, type ExpeditionDef } from '../data/expeditions';
import { ExpeditionSystem } from '../systems/ExpeditionSystem';
import { SaveSystem, type ExpeditionRun } from '../systems/SaveSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
import { CLASS_LABELS, hex, RARITY_COLORS, type HeroData } from '../types';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { showRewardModal } from '../ui/RewardModal';
import { buildRewardGrid, tileForReward, tilesForGranted } from '../ui/RewardTiles';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { body, caption, heading } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 16;
const HERO_ROW_H = 112;

/** board: the slots (what is out, what is back, what is free); trips: which expedition to send from a
 *  free slot; party: which heroes to send on it. */
type ExpeditionView = 'board' | 'trips' | 'party';

interface ExpeditionData {
  view?: ExpeditionView;
  slot?: number;
  defId?: string;
}

/** 遠征: send heroes out for a few hours and take what they bring home (data/expeditions.ts has the list).
 *  The long ones are for the morning and the evening: leave on the way out, collect on the way home. */
export class ExpeditionScene extends InboxScene {
  protected readonly toolbarHeight = 84;
  protected emptyText = '';

  private view: ExpeditionView = 'board';
  private slot = 0;
  private def?: ExpeditionDef;
  private picked: string[] = [];
  private generator!: CharacterGenerator;
  /** Refreshes the countdowns on the board once a second (rebuilt with every render). */
  private tickers: (() => void)[] = [];
  private shownReady = 0;

  constructor() {
    super('Expedition');
  }

  protected get screenTitle(): string {
    return this.view === 'trips' ? '遠征先を選ぶ' : this.view === 'party' ? 'メンバーを選ぶ' : '遠征';
  }

  /** Every `scene.start('Expedition', ...)` names its view: Phaser gives a scene started without data the data it
   *  was last started with, so a bare start would open whichever screen was used last, not the board. */
  init(data?: ExpeditionData): void {
    super.init();
    this.view = data?.view ?? 'board';
    this.slot = data?.slot ?? 0;
    this.def = data?.defId ? getExpedition(data.defId) : undefined;
    this.picked = [];
    this.tickers = [];
    if (this.view === 'party' && !this.def) this.view = 'trips';
  }

  create(): void {
    this.generator = new CharacterGenerator(this);
    super.create();
    this.shownReady = ExpeditionSystem.readyCount(this.save);
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });
  }

  protected goBack(): void {
    if (this.view === 'party') this.scene.start('Expedition', { view: 'trips', slot: this.slot });
    else if (this.view === 'trips') this.scene.start('Expedition', { view: 'board' });
    else this.scene.start('Home');
  }

  private tick(): void {
    if (this.view !== 'board') return;
    const ready = ExpeditionSystem.readyCount(this.save);
    if (ready !== this.shownReady) {
      this.shownReady = ready;
      this.queueRender();
      return;
    }
    for (const update of this.tickers) update();
  }

  protected buildCards(): InboxCard[] {
    this.tickers = [];
    if (this.view === 'trips') return this.tripCards();
    if (this.view === 'party') return this.partyCards();
    return this.boardCards();
  }

  protected buildToolbar(toolbar: Phaser.GameObjects.Container): void {
    if (this.view === 'party' && this.def) {
      const bonus = ExpeditionSystem.bonus(this.save, this.def, this.picked);
      const ready = this.picked.length === this.def.partySize;
      this.layoutToolbar(toolbar, `${this.picked.length}/${this.def.partySize}人　報酬 ×${bonus.multiplier}`, [
        { label: '出発', variant: 'gold', enabled: ready, onTap: () => this.depart() },
      ]);
    } else if (this.view === 'trips') {
      this.layoutToolbar(toolbar, `枠${this.slot + 1} に出す遠征を選びます`, []);
    } else {
      const running = ExpeditionSystem.runningCount(this.save);
      const back = ExpeditionSystem.readyCount(this.save);
      this.layoutToolbar(toolbar, `遠征中 ${running}/${EXPEDITION_SLOTS}　帰還 ${back}`, []);
    }
  }

  // ------------------------------------------------------------- board --

  private boardCards(): InboxCard[] {
    const cards: InboxCard[] = [this.introCard()];
    this.save.expeditions.slots.forEach((run, slot) => cards.push(run ? this.runningCard(run, slot) : this.emptyCard(slot)));
    return cards;
  }

  private introCard(): InboxCard {
    const height = 124;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(
      wrappedText(this, PAD + 4, 18, '送り出したキャラは、時間がたつと報酬を持ち帰ります。8〜12時間の遠征は、朝に出して夕方に受け取るのが目安です。得意な職業のキャラを送ると、報酬が増えます。', CARD_WIDTH - PAD * 2 - 8, {
        fontSize: '20px',
        color: '#d8c49a',
        lineSpacing: 6,
      }),
    );
    return { container, height };
  }

  private emptyCard(slot: number): InboxCard {
    const guard = () => this.scroll.isTap();
    const height = 128;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 38, `枠${slot + 1}　空き`, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 4, 86, 'キャラを遠征に出せます', { fontSize: '20px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(new Button(this, CARD_WIDTH - PAD - 120, height / 2, 220, 70, '遠征に出す', () => this.scene.start('Expedition', { view: 'trips', slot }), { variant: 'gold', fontSize: '26px', guard }));
    return { container, height };
  }

  private runningCard(run: ExpeditionRun, slot: number): InboxCard {
    const def = getExpedition(run.id);
    if (!def) return this.emptyCard(slot);
    const guard = () => this.scroll.isTap();
    const done = ExpeditionSystem.isDone(run);
    const height = 206;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, done));

    container.add(heading(this, PAD + 4, 32, def.name, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const chip = buildChip(this, 0, 32, `${def.hours}時間`, { fill: 0x3a2b17, color: '#ffe9b8', fontSize: 18 });
    chip.container.setX(CARD_WIDTH - PAD - chip.width);
    container.add(chip.container);

    const names = run.heroIds.map((id) => SaveSystem.getHero(this.save, id)?.name ?? '？').join('・');
    const members = caption(this, PAD + 4, 72, `メンバー　${names}`, { fontSize: '20px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5);
    if (members.width > CARD_WIDTH - PAD * 2 - 130) members.setScale((CARD_WIDTH - PAD * 2 - 130) / members.width);
    container.add(members);
    if (run.bonus > 1) container.add(caption(this, CARD_WIDTH - PAD, 72, `報酬 ×${run.bonus}`, { fontSize: '20px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));

    const barX = PAD;
    const barW = CARD_WIDTH - PAD * 2;
    const bar = this.add.graphics();
    container.add(bar);
    const timeText = body(this, PAD + 4, 146, '', { fontSize: '32px', fontStyle: 'bold', color: done ? '#ffd23f' : '#ffffff', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5);
    container.add(timeText);

    const draw = (): void => {
      if (!timeText.active) return;
      const left = ExpeditionSystem.secondsLeft(run);
      timeText.setText(left === 0 ? '帰還しました！' : `帰還まで ${StaminaSystem.formatDuration(left)}`);
      bar.clear();
      bar.fillStyle(0x0d0905, 1);
      bar.fillRoundedRect(barX, 100, barW, 16, 8);
      bar.fillStyle(left === 0 ? 0xffd23f : 0xe0822a, 1);
      bar.fillRoundedRect(barX, 100, Math.max(16, barW * ExpeditionSystem.progress(run)), 16, 8);
      bar.lineStyle(2, 0x6b4a1c, 1);
      bar.strokeRoundedRect(barX, 100, barW, 16, 8);
    };
    draw();
    this.tickers.push(draw);

    const claim = new Button(this, CARD_WIDTH - PAD - 120, 156, 220, 66, done ? '受け取る' : '遠征中', () => this.claim(slot), { variant: done ? 'gold' : 'wood', fontSize: '26px', guard });
    claim.setEnabled(done);
    container.add(claim);
    return { container, height };
  }

  private claim(slot: number): void {
    const result = ExpeditionSystem.claim(this.save, slot);
    if (!result) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, {
      title: `${result.def.name} から帰還`,
      tiles: tilesForGranted(result.granted),
      note: result.bonus > 1 ? `ボーナス ×${result.bonus}` : undefined,
      onClose: () => this.queueRender(),
    });
  }

  // ------------------------------------------------------------- trips --

  private tripCards(): InboxCard[] {
    const unlocked = EXPEDITIONS.filter((d) => ExpeditionSystem.isUnlocked(this.save, d));
    const locked = EXPEDITIONS.filter((d) => !ExpeditionSystem.isUnlocked(this.save, d));
    return [...unlocked, ...locked].map((def) => this.tripCard(def));
  }

  private tripCard(def: ExpeditionDef): InboxCard {
    const guard = () => this.scroll.isTap();
    const open = ExpeditionSystem.isUnlocked(this.save, def);
    const grid = buildRewardGrid(this, def.rewards.map(tileForReward), CARD_WIDTH - PAD * 2);
    const gridTop = 134;
    const height = gridTop + grid.height + 18 + 70 + 18;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));

    container.add(heading(this, PAD + 4, 32, def.name, { fontSize: '28px', color: open ? '#ffe9b8' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const hours = buildChip(this, 0, 32, `${def.hours}時間`, { fill: 0x3a2b17, color: '#ffe9b8', fontSize: 18 });
    hours.container.setX(CARD_WIDTH - PAD - hours.width);
    container.add(hours.container);

    container.add(caption(this, PAD + 4, 74, def.description, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const people = buildChip(this, PAD + 4, 108, `${def.partySize}人`, { fill: 0x3a2b17, color: '#ffe9b8', fontSize: 17 });
    container.add(people.container);
    const bonusPct = Math.round(EXPEDITION_CLASS_BONUS * 100);
    const favored = buildChip(this, PAD + 4 + people.width + 8, 108, `得意：${CLASS_LABELS[def.favored]}（1人ごとに報酬+${bonusPct}%）`, { fill: 0x2f5a30, color: '#dff7d8', fontSize: 17 });
    container.add(favored.container);

    grid.container.setPosition(PAD, gridTop);
    container.add(grid.container);
    if (!open) grid.container.setAlpha(0.5);

    const button = new Button(
      this,
      CARD_WIDTH / 2,
      gridTop + grid.height + 18 + 35,
      CARD_WIDTH - PAD * 2,
      70,
      open ? 'この遠征にする' : `メインステージ${def.needStage}まで進めると開放`,
      () => this.scene.start('Expedition', { view: 'party', slot: this.slot, defId: def.id }),
      { variant: open ? 'gold' : 'wood', fontSize: open ? '28px' : '22px', guard },
    );
    button.setEnabled(open);
    container.add(button);
    return { container, height };
  }

  // ------------------------------------------------------------- party --

  /** Heroes best suited first (the class the trip favors), then the highest ★ and level. */
  private candidates(def: ExpeditionDef): HeroData[] {
    return [...this.save.heroes].sort(
      (a, b) =>
        Number(b.heroClass === def.favored) - Number(a.heroClass === def.favored) || b.rarity - a.rarity || b.level - a.level || a.name.localeCompare(b.name, 'ja'),
    );
  }

  private partyCards(): InboxCard[] {
    const def = this.def;
    if (!def) return [];
    const busy = ExpeditionSystem.busyHeroIds(this.save);
    const free = this.save.heroes.filter((h) => !busy.has(h.id)).length;
    const cards: InboxCard[] = [this.partySummaryCard(def, free)];
    for (const hero of this.candidates(def)) cards.push(this.heroRow(def, hero, busy.has(hero.id)));
    return cards;
  }

  private partySummaryCard(def: ExpeditionDef, free: number): InboxCard {
    const lacking = free < def.partySize;
    const height = lacking ? 150 : 108;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 32, def.name, { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 4, 74, `${def.hours}時間　${def.partySize}人　得意：${CLASS_LABELS[def.favored]}`, { fontSize: '21px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    if (lacking) container.add(caption(this, PAD + 4, 116, `遠征に出せるキャラが足りません（あと${def.partySize - free}人）`, { fontSize: '20px', fontStyle: 'bold', color: '#ff9a8a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    return { container, height };
  }

  private heroRow(def: ExpeditionDef, hero: HeroData, away: boolean): InboxCard {
    const guard = () => this.scroll.isTap();
    const isPicked = this.picked.includes(hero.id);
    const full = this.picked.length >= def.partySize;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, HERO_ROW_H, isPicked));

    const { textureKey } = this.generator.generate(hero.seed, hero.heroClass, hero.rarity, hero.heroId);
    const portrait = this.add.sprite(PAD + 52, HERO_ROW_H / 2, textureKey).setDisplaySize(88, 88);
    if (away) portrait.setTint(0x777777);
    container.add(portrait);

    const color = RARITY_COLORS[hero.rarity];
    const name = body(this, PAD + 112, 30, hero.name, { fontSize: '26px', fontStyle: 'bold', color: away ? '#9a8a6a' : '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
    if (name.width > 250) name.setScale(250 / name.width);
    container.add(name);
    container.add(caption(this, PAD + 112, 62, '★'.repeat(hero.rarity), { fontSize: '20px', color: hex(color), stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 112, 90, `${CLASS_LABELS[hero.heroClass]}　Lv.${hero.level}`, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    if (hero.heroClass === def.favored) {
      const chip = buildChip(this, PAD + 112 + name.displayWidth + 10, 30, '得意', { fill: 0x2f5a30, color: '#dff7d8', fontSize: 16 });
      container.add(chip.container);
    }

    const label = away ? '遠征中' : isPicked ? '外す' : '選ぶ';
    const button = new Button(this, CARD_WIDTH - PAD - 80, HERO_ROW_H / 2, 150, 60, label, () => this.toggle(hero.id), { variant: isPicked ? 'wood' : 'gold', fontSize: '24px', guard });
    button.setEnabled(!away && (isPicked || !full));
    container.add(button);
    return { container, height: HERO_ROW_H };
  }

  private toggle(heroId: string): void {
    const at = this.picked.indexOf(heroId);
    if (at >= 0) this.picked.splice(at, 1);
    else if (this.def && this.picked.length < this.def.partySize) this.picked.push(heroId);
    this.queueRender();
  }

  private depart(): void {
    const def = this.def;
    if (!def) return;
    if (!ExpeditionSystem.start(this.save, this.slot, def, this.picked)) {
      showToast(this, ExpeditionSystem.check(this.save, this.slot, def, this.picked) ?? '出発できません', '#ff8a8a');
      return;
    }
    SaveSystem.save(this.save);
    this.scene.start('Expedition', { view: 'board' });
  }
}
