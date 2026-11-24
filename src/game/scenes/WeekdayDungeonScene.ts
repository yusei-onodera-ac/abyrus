import { WEEKDAY_DUNGEONS, WEEKDAY_TIERS, getWeekdayDungeon, type WeekdayTier } from '../data/weekdayDungeons';
import { ProgressionSystem, weekdayLong, weekdayShort } from '../systems/ProgressionSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
import { CampaignSystem } from '../systems/CampaignSystem';
import { WeekdayDungeonSystem } from '../systems/WeekdayDungeonSystem';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { Button } from '../ui/Button';
import { openConfirm, type ConfirmOptions } from '../ui/Dialogs';
import { addSweepRow, showSweepResult, SWEEP_ROW_HEIGHT } from '../ui/SweepRow';
import { SweepSystem, type SweepTarget } from '../systems/SweepSystem';
import { addHelperRow, canBorrowHelpers, HELPER_ROW_HEIGHT, launchWithHelper, type HelperChoice } from '../ui/HelperRow';
import { buildRewardGrid, tileForReward } from '../ui/RewardTiles';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading } from '../ui/theme';
import { addPlacePicture, weekdayPictureKey } from '../ui/PlacePicture';
import { InboxScene, type InboxCard } from './InboxScene';
import { t } from '../i18n';

const INK = '#1c130a';
const PAD = 16;

/** 曜日ダンジョン: today's dungeon, in four tiers, each paying the day's 素材 (data/weekdayDungeons.ts); and
 *  below them what the rest of the week pays, so the player knows which day to come back for. */
export class WeekdayDungeonScene extends InboxScene {
  protected get screenTitle(): string {
    return t('quest.dailyDungeon');
  }
  protected emptyText = '';
  private day = 0;

  constructor() {
    super('WeekdayDungeon');
  }

  init(): void {
    super.init();
    this.day = WeekdayDungeonSystem.today();
  }

  /** Entered from the クエスト screen, so 戻る goes back there. */
  protected goBack(): void {
    this.scene.start('StageSelect');
  }

  protected buildCards(): InboxCard[] {
    return [this.todayCard(), this.howToCard(), ...WEEKDAY_TIERS.map((tier, index) => this.tierCard(tier, index)), this.weekCard()];
  }

  /** あそびかた: the five things a player needs to know, in the order they meet them. */
  private howToCard(): InboxCard {
    const steps = [
      t('quest.weekdayDungeon.howTo1'),
      t('quest.weekdayDungeon.howTo2'),
      t('quest.weekdayDungeon.howTo3'),
      t('quest.weekdayDungeon.howTo4'),
      t('quest.weekdayDungeon.howTo5'),
    ];
    const textW = CARD_WIDTH - PAD * 2 - 44;
    const container = this.add.container(0, 0);
    let y = 64;
    const rows = steps.map((step, i) => {
      const number = body(this, PAD + 4, 0, String(i + 1), { fontSize: '22px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0);
      const text = wrappedText(this, 0, 0, step, textW, { fontSize: '21px', color: '#f5e6c8' });
      const rowY = y;
      number.setY(rowY + 1);
      text.setPosition(PAD + 44, rowY);
      y += Math.max(text.height, 28) + 12;
      return [number, text];
    });
    const height = y + 8;
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 32, t('quest.weekdayDungeon.howToTitle'), { fontSize: '28px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    rows.forEach((row) => container.add(row));
    return { container, height };
  }

  private todayCard(): InboxCard {
    const dungeon = getWeekdayDungeon(this.day);
    const height = 146;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, true));
    addPlacePicture(this, container, weekdayPictureKey(this.day), 6, 6, CARD_WIDTH - 12, height - 12, 0.42);
    const dayName = weekdayLong(this.day);
    container.add(caption(this, PAD + 4, 24, t('quest.weekdayDungeon.today', { dayName }), { fontSize: '20px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    container.add(heading(this, PAD + 4, 64, dungeon.name, { fontSize: '34px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 4, 108, dungeon.theme, { fontSize: '21px', fontStyle: 'bold', color: '#9fe39f', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    return { container, height };
  }

  private tierCard(tier: WeekdayTier, index: number): InboxCard {
    const guard = () => this.scroll.isTap();
    const open = WeekdayDungeonSystem.isUnlocked(this.save, index);
    const dungeon = getWeekdayDungeon(this.day);
    const tiles = WeekdayDungeonSystem.preview(this.day, index).map(tileForReward);
    const grid = tiles.length > 0 ? buildRewardGrid(this, tiles, CARD_WIDTH - PAD * 2) : undefined;
    // "クリアでもらえるもの" over the rewards, so it is plain what they are.
    const hasRewards = tiles.length > 0 || dungeon.goldMul > 1;
    const gridTop = hasRewards ? 138 : 112;
    const extraNote = dungeon.goldMul > 1 ? 34 : 0;
    const bodyH = grid ? grid.height + 14 : extraNote > 0 ? 8 : 0;
    const height = gridTop + bodyH + extraNote + 18 + 70 + 18;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));

    container.add(heading(this, PAD + 4, 34, tier.name, { fontSize: '30px', color: open ? '#ffe9b8' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const staminaNow = CampaignSystem.staminaCost(tier.stamina);
    const cost = buildChip(this, 0, 34, staminaNow < tier.stamina ? t('quest.weekdayDungeon.staminaDiscount', { staminaNow }) : t('quest.weekdayDungeon.stamina', { staminaNow }), { fill: staminaNow < tier.stamina ? 0x2f7a3a : 0x3a2b17, color: '#ffe9b8', fontSize: 18 });
    cost.container.setX(CARD_WIDTH - PAD - cost.width);
    container.add(cost.container);
    const strength = tier.note ?? t('quest.weekdayDungeon.likeFloor', { likeStage: tier.likeStage + 1 });
    const enemyCount = ProgressionSystem.getWeekdayStage(this.day, index).enemies.length;
    container.add(caption(this, PAD + 4, 76, t('quest.weekdayDungeon.enemiesAndStrength', { enemyCount, strength }), { fontSize: '19px', fontStyle: tier.note ? 'bold' : 'normal', color: tier.note ? '#ff9a6a' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    if (hasRewards) container.add(caption(this, PAD + 4, 116, t('quest.weekdayDungeon.clearRewards'), { fontSize: '19px', fontStyle: 'bold', color: open ? '#d8c49a' : '#8d7d5e', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    let y = gridTop;
    if (grid) {
      grid.container.setPosition(PAD, y);
      if (!open) grid.container.setAlpha(0.5);
      container.add(grid.container);
      y += grid.height + 14;
    }
    if (dungeon.goldMul > 1) {
      container.add(body(this, PAD + 4, y + 14, t('quest.weekdayDungeon.goldBonus', { goldMul: dungeon.goldMul }), { fontSize: '24px', fontStyle: 'bold', color: open ? '#ffe79a' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      y += extraNote;
    }

    const button = new Button(this, CARD_WIDTH / 2, y + 18 + 35, CARD_WIDTH - PAD * 2, 70, open ? t('quest.weekdayDungeon.challenge') : t('quest.shared.unlocksAtStage', { needStage: tier.needStage }), () => this.askToEnter(index), {
      variant: open ? 'gold' : 'wood',
      fontSize: open ? '30px' : '22px',
      guard,
    });
    button.setEnabled(open);
    container.add(button);
    return { container, height };
  }

  private weekCard(): InboxCard {
    const rowH = 38;
    const height = 70 + WEEKDAY_DUNGEONS.length * rowH + 14;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 34, t('quest.weekdayDungeon.weeklySchedule'), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    // 月 first, 日 last: the order a week is read in.
    const order = [1, 2, 3, 4, 5, 6, 0];
    order.forEach((day, row) => {
      const dungeon = getWeekdayDungeon(day);
      const y = 70 + row * rowH + rowH / 2;
      const today = day === this.day;
      if (today) {
        const mark = this.add.graphics();
        mark.fillStyle(0xffd23f, 0.16);
        mark.fillRoundedRect(PAD, y - rowH / 2 + 2, CARD_WIDTH - PAD * 2, rowH - 4, 8);
        container.add(mark);
      }
      const dayLabel = body(this, PAD + 14, y, weekdayShort(day), { fontSize: '24px', fontStyle: 'bold', color: today ? '#ffd23f' : '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5);
      container.add(dayLabel);
      // A day name wider than the one Japanese character (Wed) pushes the dungeon's name along.
      container.add(caption(this, Math.max(PAD + 62, PAD + 14 + dayLabel.width + 14), y, dungeon.name, { fontSize: '21px', fontStyle: 'bold', color: today ? '#ffe9b8' : '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      const theme = wrappedText(this, 0, 0, dungeon.theme.replace(/^.曜日は、/, ''), 330, { fontSize: '17px', color: '#cdbb94' });
      theme.setPosition(CARD_WIDTH - PAD - 8 - Math.min(theme.width, 330), y - theme.height / 2);
      container.add(theme);
    });
    return { container, height };
  }

  /** Tapping 挑戦 spends nothing by itself: a popup shows the stamina cost, and only 出撃 takes it and goes
   *  on to the fight. Without a formation or enough stamina it says so and points at where to fix that. */
  private askToEnter(tier: number): void {
    if (this.modal?.container.active) return;
    const cost = CampaignSystem.staminaCost(WEEKDAY_TIERS[tier].stamina);
    const name = ProgressionSystem.getWeekdayStage(this.day, tier).name;

    const party = SaveSystem.getPartyHeroes(this.save);
    if (party.front.length + party.back.length === 0) {
      this.openDialog({ title: t('quest.shared.emptyParty'), message: t('quest.shared.emptyPartyMessage'), confirmLabel: t('quest.shared.toCollection'), confirmVariant: 'gold', onConfirm: () => this.scene.start('Roster') });
      return;
    }
    if (!StaminaSystem.canAfford(this.save, cost)) {
      const wait = StaminaSystem.formatDuration(StaminaSystem.secondsUntil(this.save, cost));
      this.openDialog({
        title: t('quest.shared.notEnoughStamina'),
        message: t('quest.shared.notEnoughStaminaMessage', { name, cost, stamina: this.save.stamina[0], wait }),
        confirmLabel: t('quest.shared.toShop'),
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Shop', { focus: 'stamina' }),
      });
      return;
    }
    const have = this.save.stamina[0];
    // 助っ人: a member's hero can be borrowed for this fight (offered only in a 同盟 that has some).
    const choice: HelperChoice = { helper: null };
    const helpers = canBorrowHelpers(this.save);
    // 掃討: a tier cleared before can be swept (no fight, the rewards at once).
    const target: SweepTarget = { kind: 'weekday', day: this.day, tier };
    const sweep = SweepSystem.canSweep(this.save, target);
    const extraHeight = (helpers ? HELPER_ROW_HEIGHT : 0) + (sweep ? SWEEP_ROW_HEIGHT : 0);
    this.openDialog({
      title: name,
      message: t('quest.shared.deployMessage', { cost, have, have2: have - cost }),
      confirmLabel: t('quest.shared.deploy'),
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
        void launchWithHelper(this, this.save, { scene: 'Battle', data: { stageIndex: tier, mode: 'weekday', day: this.day } }, choice.helper);
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
}
