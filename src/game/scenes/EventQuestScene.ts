import type { EventShopItem, LimitedEventDef } from '../data/limitedEvents';
import { WEEKDAY_TIERS, getWeekdayTier, type WeekdayTier } from '../data/weekdayDungeons';
import { EventSystem, type EventMissionState, type MilestoneState } from '../systems/EventSystem';
import { touchEventLogin } from '../systems/EventProgress';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
import { CampaignSystem } from '../systems/CampaignSystem';
import { SweepSystem, type SweepTarget } from '../systems/SweepSystem';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip, buildUnreadDot, wrappedText } from '../ui/CardParts';
import { openConfirm, type ConfirmOptions } from '../ui/Dialogs';
import { drawBanner, eventBannerKey } from '../ui/EventPanels';
import { addHelperRow, canBorrowHelpers, HELPER_ROW_HEIGHT, launchWithHelper, type HelperChoice } from '../ui/HelperRow';
import { showRewardModal } from '../ui/RewardModal';
import { addTileIcon, buildRewardGrid, tileForReward, tilesForGranted, type RewardTile } from '../ui/RewardTiles';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { addSweepRow, showSweepResult, SWEEP_ROW_HEIGHT } from '../ui/SweepRow';
import { body, caption, heading, CHROME } from '../ui/theme';
import { formatDateTime } from '../ui/format';
import { InboxScene, type InboxCard } from './InboxScene';
import { t, type PlainKey } from '../i18n';

const INK = '#1c130a';
const PAD = 14;

type Tab = 'play' | 'mission' | 'reward' | 'shop';
const TAB_LABELS: Record<Tab, PlainKey> = { play: 'mission.eventQuest.tabChallenge', mission: 'mission.title', reward: 'mission.eventQuest.tabRewards', shop: 'mission.eventQuest.exchange' };

/** "3日4時間", "5時間12分", "8分". */
function leftText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  if (d > 0) return t('mission.eventQuest.daysHours', { d, h });
  if (h > 0) return t('mission.eventQuest.hoursMinutes', { h, total: total % 60 });
  return t('mission.eventQuest.minutes', { total });
}

/**
 * 期間限定イベント's own screen (data/limitedEvents.ts): what the event is, the currency in hand, and four tabs - 挑戦 (the event dungeon, for
 * a 'dungeon' event), ミッション, 累計報酬 and 交換所. The dungeon and the missions run until the event ends; the rewards and the 交換所 stay open
 * for a few days more (a banner says so). The rules are in systems/EventSystem.ts.
 */
export class EventQuestScene extends InboxScene {
  protected get screenTitle(): string {
    return t('mission.eventQuest.title');
  }
  protected emptyText = '';
  private def!: LimitedEventDef;
  private tab: Tab = 'play';
  /** Height of the picture-and-story card at the top: a tab switch scrolls just past it, so the new list is what is seen. */
  private headerHeight = 0;

  constructor() {
    super('EventQuest');
  }

  init(data?: { eventId?: string; tab?: Tab }): void {
    super.init(data);
    const def = data?.eventId ? EventSystem.get(data.eventId) : undefined;
    this.def = def as LimitedEventDef;
    // After the end the dungeon is closed: it opens on what can be taken (missions, then the 累計報酬), else the 交換所.
    const save = this.game.registry.get('save') as SaveData;
    const after: Tab = def && EventSystem.missions(save, def).some((m) => m.done && !m.claimed) ? 'mission' : def && EventSystem.milestones(save, def).some((m) => m.reached && !m.claimed) ? 'reward' : 'shop';
    const wanted = data?.tab && !(data.tab === 'play' && def?.kind !== 'dungeon') ? data.tab : undefined;
    this.tab = wanted ?? (def && !EventSystem.isRunning(def) ? after : def?.kind === 'dungeon' ? 'play' : 'mission');
  }

  create(): void {
    if (!this.def) {
      this.scene.start('Event');
      return;
    }
    // Coming in counts as a day of the login mission.
    touchEventLogin(this.game.registry.get('save'));
    super.create();
  }

  protected goBack(): void {
    this.scene.start('Event');
  }

  private get running(): boolean {
    return EventSystem.isRunning(this.def);
  }

  private get tabs(): Tab[] {
    return this.def.kind === 'dungeon' ? ['play', 'mission', 'reward', 'shop'] : ['mission', 'reward', 'shop'];
  }

  private get tokens(): number {
    return this.save.events[this.def.id]?.tokens ?? 0;
  }

  private tokenTile(amount: string, tag?: string): RewardTile {
    return { kind: 'token', token: this.def.token, amount, tag };
  }

  protected buildCards(): InboxCard[] {
    const header = this.headerCard();
    this.headerHeight = header.height;
    const cards: InboxCard[] = [header, this.tabsCard()];
    if (this.tab === 'play') {
      WEEKDAY_TIERS.forEach((tier, i) => cards.push(this.tierCard(tier, i)));
    } else if (this.tab === 'mission') {
      cards.push(...this.missionCards());
    } else if (this.tab === 'reward') {
      cards.push(...this.milestoneCards());
    } else {
      cards.push(...this.shopCards());
    }
    return cards;
  }

  // ---- the top: picture, what is going on, how long, the currency

  private headerCard(): InboxCard {
    const def = this.def;
    const innerW = CARD_WIDTH - 24;
    const container = this.add.container(0, 0);
    let y = 12;
    // The picture (its height follows the art), or a banner drawn in the event's colour.
    const key = eventBannerKey(def.id);
    let bannerH = 190;
    if (this.textures.exists(key)) {
      const frame = this.textures.get(key).getSourceImage();
      bannerH = Math.round((innerW * frame.height) / frame.width);
      container.add(this.add.image(CARD_WIDTH / 2, y + bannerH / 2, key).setDisplaySize(innerW, bannerH));
    } else {
      container.add(drawBanner(this, { title: def.title, accent: def.accent, emblem: def.emblem }, 12, y, innerW, bannerH));
    }
    const outline = this.add.graphics();
    outline.lineStyle(2, 0x120a04, 0.9);
    outline.strokeRect(12, y, innerW, bannerH);
    container.add(outline);
    y += bannerH + 12;

    container.add(heading(this, PAD + 4, y + 20, def.title, { fontSize: '30px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    y += 48;
    const story = wrappedText(this, PAD + 4, y, def.story, CARD_WIDTH - PAD * 2 - 8, { fontSize: '20px', color: '#f5e6c8' });
    container.add(story);
    y += story.height + 10;

    const now = Date.now();
    const end = new Date(def.endsAt).getTime();
    const closeAt = end + def.exchangeDays * 24 * 60 * 60 * 1000;
    const status = this.running
      ? { text: t('mission.eventQuest.liveTimeLeft', { leftText: leftText(end - now) }), fill: 0x2f7a3a, color: '#e6ffe0' }
      : { text: t('mission.eventQuest.exchangeTimeLeft', { leftText: leftText(closeAt - now) }), fill: 0x8a5a1c, color: '#fff0d0' };
    const chip = buildChip(this, PAD + 4, y + 18, status.text, { fill: status.fill, color: status.color, fontSize: 19 });
    chip.container.setX(PAD + 4);
    container.add(chip.container);
    container.add(caption(this, PAD + 4, y + 50, t('mission.eventQuest.period', { formatDateTime: formatDateTime(new Date(def.startsAt).getTime()), formatDateTime2: formatDateTime(end) }), { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    if (!this.running) container.add(caption(this, PAD + 4, y + 76, t('mission.eventQuest.exchangeUntil', { formatDateTime: formatDateTime(closeAt) }), { fontSize: '17px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    // What is in hand.
    const hold = this.add.container(CARD_WIDTH - PAD - 150, y + 30);
    addTileIcon(this, hold, this.tokenTile(''), -62, 0, 44);
    hold.add(body(this, -30, -12, def.token.name, { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    hold.add(body(this, -30, 14, this.tokens.toLocaleString('ja-JP'), { fontSize: '28px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(hold);
    y += this.running ? 82 : 100;

    container.addAt(buildCardPanel(this, CARD_WIDTH, y + 10), 0);
    return { container, height: y + 10 };
  }

  private tabsCard(): InboxCard {
    const guard = () => this.scroll.isTap();
    const height = 96;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    const tabs = this.tabs;
    const gap = 8;
    const w = (CARD_WIDTH - PAD * 2 - gap * (tabs.length - 1)) / tabs.length;
    tabs.forEach((id, i) => {
      const x = PAD + w / 2 + i * (w + gap);
      const label = t(TAB_LABELS[id]);
      container.add(new Button(this, x, height / 2, w, 68, label, () => this.pick(id), { variant: id === this.tab ? 'gold' : 'wood', fontSize: label.length > 3 ? '22px' : '26px', guard }));
      const claimable = (id === 'mission' && EventSystem.missions(this.save, this.def).some((m) => m.done && !m.claimed)) || (id === 'reward' && EventSystem.milestones(this.save, this.def).some((m) => m.reached && !m.claimed));
      if (claimable) container.add(buildUnreadDot(this, x + w / 2 - 10, 16, 8));
    });
    return { container, height };
  }

  private pick(tab: Tab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.scroll.scrollTo(this.headerHeight + 12);
    this.queueRender();
  }

  // ---- 挑戦: the dungeon's four tiers

  private tierCard(tier: WeekdayTier, index: number): InboxCard {
    const def = this.def;
    const guard = () => this.scroll.isTap();
    const unlocked = EventSystem.isTierOpen(this.save, index);
    const open = unlocked && this.running;
    const first = !EventSystem.isCleared(this.save, def.id, index);
    const tiles: RewardTile[] = [this.tokenTile(`+${EventSystem.tokensPerClear(def, index)}`)];
    if (first && (def.firstClearGems[index] ?? 0) > 0) tiles.push({ kind: 'gems', amount: `+${def.firstClearGems[index]}`, tag: t('mission.eventQuest.firstClear') });
    const grid = buildRewardGrid(this, tiles, CARD_WIDTH - PAD * 2);
    const gridTop = 112;
    const height = gridTop + grid.height + 14 + 18 + 70 + 18;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));

    container.add(heading(this, PAD + 4, 34, tier.name, { fontSize: '30px', color: open ? '#ffe9b8' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const stamina = CampaignSystem.staminaCost(tier.stamina);
    const cost = buildChip(this, 0, 34, stamina < tier.stamina ? t('mission.eventQuest.staminaDiscounted', { stamina }) : t('mission.eventQuest.stamina', { stamina }), { fill: stamina < tier.stamina ? 0x2f7a3a : 0x3a2b17, color: '#ffe9b8', fontSize: 18 });
    cost.container.setX(CARD_WIDTH - PAD - cost.width);
    container.add(cost.container);
    const enemies = ProgressionSystem.getEventStage(def, index).enemies.length;
    container.add(caption(this, PAD + 4, 76, t('mission.eventQuest.enemiesNote', { enemies, note: tier.note ?? t('mission.eventQuest.likeQuestFloor', { likeStage: tier.likeStage + 1 }) }), { fontSize: '19px', fontStyle: tier.note ? 'bold' : 'normal', color: tier.note ? '#ff9a6a' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    grid.container.setPosition(PAD, gridTop);
    if (!open) grid.container.setAlpha(0.5);
    container.add(grid.container);

    const label = !this.running ? t('mission.eventQuest.eventEnded') : unlocked ? t('mission.eventQuest.challenge') : t('mission.eventQuest.unlockAtStage', { needStage: tier.needStage });
    const button = new Button(this, CARD_WIDTH / 2, gridTop + grid.height + 14 + 18 + 35, CARD_WIDTH - PAD * 2, 70, label, () => this.askToEnter(index), {
      variant: open ? 'gold' : 'wood',
      fontSize: open ? '30px' : '22px',
      guard,
    });
    button.setEnabled(open);
    container.add(button);
    return { container, height };
  }

  /** Tapping 挑戦 spends nothing by itself: a popup shows the stamina cost, and only 出撃 takes it and goes on to the fight. */
  private askToEnter(tier: number): void {
    if (this.modal?.container.active || !this.running) return;
    const def = this.def;
    const cost = CampaignSystem.staminaCost(getWeekdayTier(tier).stamina);
    const name = ProgressionSystem.getEventStage(def, tier).name;

    const party = SaveSystem.getPartyHeroes(this.save);
    if (party.front.length + party.back.length === 0) {
      this.openDialog({ title: t('mission.eventQuest.partyEmptyTitle'), message: t('mission.eventQuest.partyEmptyMessage'), confirmLabel: t('mission.eventQuest.toCollection'), confirmVariant: 'gold', onConfirm: () => this.scene.start('Roster') });
      return;
    }
    if (!StaminaSystem.canAfford(this.save, cost)) {
      const wait = StaminaSystem.formatDuration(StaminaSystem.secondsUntil(this.save, cost));
      this.openDialog({
        title: t('mission.eventQuest.notEnoughStaminaTitle'),
        message: t('mission.eventQuest.notEnoughStaminaMessage', { name, cost, stamina: this.save.stamina[0], wait }),
        confirmLabel: t('mission.eventQuest.toShop'),
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Shop', { focus: 'stamina' }),
      });
      return;
    }
    const have = this.save.stamina[0];
    const choice: HelperChoice = { helper: null };
    const helpers = canBorrowHelpers(this.save);
    const target: SweepTarget = { kind: 'event', eventId: def.id, tier };
    const sweep = SweepSystem.canSweep(this.save, target);
    const extraHeight = (helpers ? HELPER_ROW_HEIGHT : 0) + (sweep ? SWEEP_ROW_HEIGHT : 0);
    this.openDialog({
      title: name,
      message: t('mission.eventQuest.deployMessage', { cost, have, have2: have - cost }),
      confirmLabel: t('mission.eventQuest.deploy'),
      confirmVariant: 'gold',
      extra:
        extraHeight === 0
          ? undefined
          : {
              height: extraHeight,
              build: (container, y) => {
                let top = y - extraHeight / 2;
                if (helpers) {
                  addHelperRow(this, container, top + HELPER_ROW_HEIGHT / 2, this.save, choice);
                  top += HELPER_ROW_HEIGHT;
                }
                if (sweep) addSweepRow(this, container, top + SWEEP_ROW_HEIGHT / 2, this.save, target, (count) => this.sweep(target, count));
              },
            },
      onConfirm: () => {
        if (!StaminaSystem.spend(this.save, cost)) return;
        SaveSystem.save(this.save);
        void launchWithHelper(this, this.save, { scene: 'Battle', data: { stageIndex: tier, mode: 'event', eventId: def.id } }, choice.helper);
      },
    });
  }

  /** 掃討 pressed in the 出撃 popup: the popup closes, the sweep is done and its rewards are shown. */
  private sweep(target: SweepTarget, count: number): void {
    this.modal?.close();
    const result = SweepSystem.run(this.save, target, count);
    if (!result) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    showSweepResult(this, this.scroll, result, () => this.queueRender());
  }

  private openDialog(opts: ConfirmOptions): void {
    this.modal = openConfirm(this, this.scroll, opts);
  }

  // ---- ミッション

  private missionCards(): InboxCard[] {
    const states = EventSystem.missions(this.save, this.def);
    return [this.missionHeader(states), ...states.map((m) => this.missionRow(m))];
  }

  private missionHeader(states: EventMissionState[]): InboxCard {
    const guard = () => this.scroll.isTap();
    const ready = states.filter((m) => m.done && !m.claimed).length;
    const height = 120;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 34, t('mission.eventQuest.missionsHeading'), { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 74, t('mission.eventQuest.completedCount', { count: states.filter((m) => m.done).length, count2: states.length }), { fontSize: '21px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 98, this.running ? t('mission.eventQuest.countsDuring') : t('mission.eventQuest.overClaimOnly'), { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const all = new Button(this, CARD_WIDTH - PAD - 100, height / 2, 200, 80, t('mission.claimAll'), () => this.claimAllMissions(), { variant: 'gold', fontSize: '19px', subLabel: ready > 0 ? t('mission.readyCount', { ready }) : undefined, guard });
    all.setEnabled(ready > 0);
    container.add(all);
    return { container, height };
  }

  private missionRow(m: EventMissionState): InboxCard {
    const guard = () => this.scroll.isTap();
    const rowH = 112;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, rowH, m.done && !m.claimed));
    container.add(body(this, PAD + 6, 28, m.def.title, { fontSize: '23px', fontStyle: 'bold', color: m.claimed ? '#8a7a5a' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const barX = PAD + 6;
    const barW = 296;
    const ratio = m.count / m.def.target;
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(barX, 56, barW, 16, 8);
    if (ratio > 0) {
      bar.fillStyle(m.done ? 0x4fc07a : 0xe0822a, 1);
      bar.fillRoundedRect(barX, 56, Math.max(16, barW * ratio), 16, 8);
    }
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(barX, 56, barW, 16, 8);
    container.add(bar);
    container.add(caption(this, barX + barW + 12, 64, `${m.count.toLocaleString('ja-JP')} / ${m.def.target.toLocaleString('ja-JP')}`, { fontSize: '19px', color: '#f5e6c8', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const rewardBox = this.add.container(0, 0);
    addTileIcon(this, rewardBox, this.tokenTile(''), PAD + 36, 92, 30);
    rewardBox.add(body(this, PAD + 62, 92, `+${m.def.tokens}`, { fontSize: '20px', fontStyle: 'bold', color: '#ffd9a0', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    rewardBox.setAlpha(m.claimed ? 0.4 : 1);
    container.add(rewardBox);
    const label = m.claimed ? t('common.claimed') : m.done ? t('common.claim') : t('mission.incomplete');
    const button = new Button(this, CARD_WIDTH - PAD - 90, rowH / 2, 180, 70, label, () => this.claimMission(m.def.id), { variant: m.done && !m.claimed ? 'gold' : 'wood', fontSize: '24px', guard });
    button.setEnabled(m.done && !m.claimed);
    container.add(button);
    return { container, height: rowH };
  }

  private claimMission(id: string): void {
    const tokens = EventSystem.claimMission(this.save, this.def, id);
    if (tokens !== null) this.paid(t('mission.missionComplete'), [this.tokenTile(`+${tokens}`)]);
  }

  private claimAllMissions(): void {
    const tokens = EventSystem.claimAllMissions(this.save, this.def);
    if (tokens > 0) this.paid(t('mission.missionComplete'), [this.tokenTile(`+${tokens}`)]);
  }

  // ---- 累計報酬

  private milestoneCards(): InboxCard[] {
    const states = EventSystem.milestones(this.save, this.def);
    return [this.milestoneHeader(states), ...states.map((m) => this.milestoneRow(m))];
  }

  private milestoneHeader(states: MilestoneState[]): InboxCard {
    const guard = () => this.scroll.isTap();
    const points = this.save.events[this.def.id]?.points ?? 0;
    const ready = states.filter((m) => m.reached && !m.claimed).length;
    const height = 120;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 34, t('mission.eventQuest.milestoneRewards'), { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(body(this, PAD + 6, 76, t('mission.eventQuest.collectedSoFar', { points: points.toLocaleString('ja-JP') }), { fontSize: '23px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 100, t('mission.eventQuest.spendingDoesNotLower', { name: this.def.token.name }), { fontSize: '16px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const all = new Button(this, CARD_WIDTH - PAD - 100, height / 2, 200, 80, t('mission.claimAll'), () => this.claimAllMilestones(), { variant: 'gold', fontSize: '19px', subLabel: ready > 0 ? t('mission.readyCount', { ready }) : undefined, guard });
    all.setEnabled(ready > 0);
    container.add(all);
    return { container, height };
  }

  private milestoneRow(state: MilestoneState): InboxCard {
    const guard = () => this.scroll.isTap();
    const points = this.save.events[this.def.id]?.points ?? 0;
    const grid = buildRewardGrid(this, state.milestone.rewards.map(tileForReward), CARD_WIDTH - 230);
    const height = Math.max(150, 56 + grid.height + PAD);
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, state.reached && !state.claimed));
    container.add(body(this, PAD + 6, 28, t('mission.eventQuest.collectPoints', { points: state.milestone.points.toLocaleString('ja-JP') }), { fontSize: '24px', fontStyle: 'bold', color: state.claimed ? '#8a7a5a' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    if (!state.reached) container.add(caption(this, 250, 28, t('mission.eventQuest.pointsToGo', { points: (state.milestone.points - points).toLocaleString('ja-JP') }), { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    grid.container.setPosition(PAD, 56);
    grid.container.setAlpha(state.claimed ? 0.4 : 1);
    container.add(grid.container);
    const label = state.claimed ? t('common.claimed') : state.reached ? t('common.claim') : t('mission.incomplete');
    const button = new Button(this, CARD_WIDTH - PAD - 90, height / 2, 180, 70, label, () => this.claimMilestone(state.index), { variant: state.reached && !state.claimed ? 'gold' : 'wood', fontSize: '24px', guard });
    button.setEnabled(state.reached && !state.claimed);
    container.add(button);
    return { container, height };
  }

  private claimMilestone(index: number): void {
    const granted = EventSystem.claimMilestone(this.save, this.def, index);
    if (granted) this.paid(t('mission.eventQuest.milestoneRewards'), tilesForGranted(granted));
  }

  private claimAllMilestones(): void {
    const granted = EventSystem.claimAllMilestones(this.save, this.def);
    if (granted.length > 0) this.paid(t('mission.eventQuest.milestoneRewards'), tilesForGranted(granted));
  }

  // ---- 交換所

  private shopCards(): InboxCard[] {
    return [this.shopHeader(), ...this.def.shop.map((item) => this.shopRow(item))];
  }

  private shopHeader(): InboxCard {
    const height = 96;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 6, 32, t('mission.eventQuest.exchange'), { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 6, 68, t('mission.eventQuest.tokensExpire', { name: this.def.token.name, exchangeDays: this.def.exchangeDays }), { fontSize: '17px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    return { container, height };
  }

  private shopRow(item: EventShopItem): InboxCard {
    const guard = () => this.scroll.isTap();
    const rowH = 118;
    const block = EventSystem.buyBlock(this.save, this.def, item);
    const bought = EventSystem.bought(this.save, this.def, item.id);
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, rowH, block === 'ok'));
    // What it gives: the icon of its first reward, then the name.
    const icon = this.add.container(0, 0);
    addTileIcon(this, icon, tileForReward(item.rewards[0]), PAD + 40, rowH / 2 - 8, 56);
    container.add(icon);
    container.add(body(this, PAD + 84, 30, item.name, { fontSize: '23px', fontStyle: 'bold', color: block === 'limit' ? '#8a7a5a' : '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const price = this.add.container(0, 0);
    addTileIcon(this, price, this.tokenTile(''), PAD + 98, 66, 30);
    price.add(body(this, PAD + 122, 66, item.cost.toLocaleString('ja-JP'), { fontSize: '24px', fontStyle: 'bold', color: block === 'tokens' ? '#ff8a8a' : '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(price);
    container.add(caption(this, PAD + 84, 96, t('mission.eventQuest.stockLeft', { limit: item.limit - bought, limit2: item.limit }), { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    const label = block === 'limit' ? t('mission.eventQuest.exchangedOut') : block === 'closed' ? t('mission.eventQuest.closed') : block === 'tokens' ? t('mission.eventQuest.needTokens', { name: this.def.token.name }) : t('mission.eventQuest.exchangeButton');
    const button = new Button(this, CARD_WIDTH - PAD - 90, rowH / 2, 180, 70, label, () => this.buy(item), { variant: block === 'ok' ? 'gold' : 'wood', fontSize: block === 'tokens' ? '19px' : '24px', guard });
    button.setEnabled(block === 'ok');
    container.add(button);
    return { container, height: rowH };
  }

  private buy(item: EventShopItem): void {
    if (this.modal?.container.active) return;
    // A dear item is asked about first; the cheap ones, which are bought over and over, are not.
    if (item.cost >= 1000) {
      this.openDialog({
        title: t('mission.eventQuest.exchangeTitle'),
        message: t('mission.eventQuest.exchangeMessage', { name: item.name, cost: item.cost.toLocaleString('ja-JP'), name2: this.def.token.name }),
        confirmLabel: t('mission.eventQuest.exchangeButton'),
        confirmVariant: 'gold',
        onConfirm: () => this.doBuy(item),
      });
      return;
    }
    this.doBuy(item);
  }

  private doBuy(item: EventShopItem): void {
    const granted = EventSystem.buy(this.save, this.def, item.id);
    if (granted) this.paid(t('mission.eventQuest.exchangeComplete'), tilesForGranted(granted));
  }

  /** Saves, then shows what was handed over; the list is redrawn when the popup is closed. */
  private paid(title: string, tiles: RewardTile[]): void {
    SaveSystem.save(this.save);
    this.refreshResources();
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title, tiles, onClose: () => this.queueRender() });
  }
}

