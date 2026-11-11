import { WEEKDAY_DUNGEONS, WEEKDAY_NAMES, WEEKDAY_TIERS, getWeekdayDungeon, type WeekdayTier } from '../data/weekdayDungeons';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { StaminaSystem } from '../systems/StaminaSystem';
import { WeekdayDungeonSystem } from '../systems/WeekdayDungeonSystem';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { Button } from '../ui/Button';
import { openConfirm, type ConfirmOptions } from '../ui/Dialogs';
import { addHelperRow, canBorrowHelpers, HELPER_ROW_HEIGHT, launchWithHelper, type HelperChoice } from '../ui/HelperRow';
import { buildRewardGrid, tileForReward } from '../ui/RewardTiles';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body, caption, heading } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 16;

/** 曜日ダンジョン: today's dungeon, in four tiers, each paying the day's 素材 (data/weekdayDungeons.ts); and
 *  below them what the rest of the week pays, so the player knows which day to come back for. */
export class WeekdayDungeonScene extends InboxScene {
  protected readonly screenTitle = '曜日ダンジョン';
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
    return [this.todayCard(), ...WEEKDAY_TIERS.map((tier, index) => this.tierCard(tier, index)), this.weekCard()];
  }

  private todayCard(): InboxCard {
    const dungeon = getWeekdayDungeon(this.day);
    const height = 146;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, true));
    container.add(caption(this, PAD + 4, 24, `今日は${WEEKDAY_NAMES[this.day]}曜日`, { fontSize: '20px', fontStyle: 'bold', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
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
    const gridTop = 112;
    const extraNote = dungeon.goldMul > 1 ? 34 : 0;
    const bodyH = grid ? grid.height + 14 : extraNote > 0 ? 8 : 0;
    const height = gridTop + bodyH + extraNote + 18 + 70 + 18;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));

    container.add(heading(this, PAD + 4, 34, tier.name, { fontSize: '30px', color: open ? '#ffe9b8' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const cost = buildChip(this, 0, 34, `スタミナ ${tier.stamina}`, { fill: 0x3a2b17, color: '#ffe9b8', fontSize: 18 });
    cost.container.setX(CARD_WIDTH - PAD - cost.width);
    container.add(cost.container);
    container.add(caption(this, PAD + 4, 76, `${ProgressionSystem.getWeekdayStage(this.day, index).enemies.length}体の敵　${tier.note ?? `クエスト${tier.likeStage + 1}層ほどの強さ`}`, { fontSize: '19px', fontStyle: tier.note ? 'bold' : 'normal', color: tier.note ? '#ff9a6a' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));

    let y = gridTop;
    if (grid) {
      grid.container.setPosition(PAD, y);
      if (!open) grid.container.setAlpha(0.5);
      container.add(grid.container);
      y += grid.height + 14;
    }
    if (dungeon.goldMul > 1) {
      container.add(body(this, PAD + 4, y + 14, `ゴールド ×${dungeon.goldMul}`, { fontSize: '24px', fontStyle: 'bold', color: open ? '#ffe79a' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      y += extraNote;
    }

    const button = new Button(this, CARD_WIDTH / 2, y + 18 + 35, CARD_WIDTH - PAD * 2, 70, open ? '挑戦する' : `メインステージ${tier.needStage}まで進めると開放`, () => this.askToEnter(index), {
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
    container.add(heading(this, PAD + 4, 34, '1週間の予定', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
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
      container.add(body(this, PAD + 14, y, `${WEEKDAY_NAMES[day]}`, { fontSize: '24px', fontStyle: 'bold', color: today ? '#ffd23f' : '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      container.add(caption(this, PAD + 62, y, dungeon.name, { fontSize: '21px', fontStyle: 'bold', color: today ? '#ffe9b8' : '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
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
    const cost = WEEKDAY_TIERS[tier].stamina;
    const name = ProgressionSystem.getWeekdayStage(this.day, tier).name;

    const party = SaveSystem.getPartyHeroes(this.save);
    if (party.front.length + party.back.length === 0) {
      this.openDialog({ title: '編成が空です', message: 'パーティが空のため出撃できません。\n名鑑で編成しますか？', confirmLabel: '名鑑へ', confirmVariant: 'gold', onConfirm: () => this.scene.start('Roster') });
      return;
    }
    if (!StaminaSystem.canAfford(this.save, cost)) {
      const wait = StaminaSystem.formatDuration(StaminaSystem.secondsUntil(this.save, cost));
      this.openDialog({
        title: 'スタミナが足りません',
        message: `${name}はスタミナ ${cost} 必要です。（現在 ${this.save.stamina[0]}）\n回復まで あと ${wait}\nショップでスタミナを回復しますか？`,
        confirmLabel: 'ショップへ',
        confirmVariant: 'gold',
        onConfirm: () => this.scene.start('Shop', { focus: 'stamina' }),
      });
      return;
    }
    const have = this.save.stamina[0];
    // 助っ人: a member's hero can be borrowed for this fight (offered only in a 同盟 that has some).
    const choice: HelperChoice = { helper: null };
    const helpers = canBorrowHelpers(this.save);
    this.openDialog({
      title: name,
      message: `スタミナ ${cost} を消費して出撃します。\n（現在 ${have} → ${have - cost}）`,
      confirmLabel: '出撃',
      confirmVariant: 'gold',
      extra: helpers ? { height: HELPER_ROW_HEIGHT, build: (container, y) => addHelperRow(this, container, y, this.save, choice) } : undefined,
      onConfirm: () => {
        if (!StaminaSystem.spend(this.save, cost)) return;
        SaveSystem.save(this.save);
        void launchWithHelper(this, this.save, { scene: 'Battle', data: { stageIndex: tier, mode: 'weekday', day: this.day } }, choice.helper);
      },
    });
  }

  private openDialog(opts: ConfirmOptions): void {
    this.modal = openConfirm(this, this.scroll, opts);
  }
}
