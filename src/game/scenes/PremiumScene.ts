import type Phaser from 'phaser';
import { IDLE_BASE_CAP_HOURS } from '../data/idle';
import { PREMIUM, PREMIUM_JOIN_PACK } from '../data/premium';
import { PaymentSystem } from '../systems/PaymentSystem';
import { PremiumSystem } from '../systems/PremiumSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { crownIcon, hourglassIcon } from '../ui/ItemIcons';
import { showRewardModal } from '../ui/RewardModal';
import { addGoodIcon } from '../ui/RewardIcon';
import { buildRewardGrid, tileForReward, tilesForGranted } from '../ui/RewardTiles';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { body, caption, heading } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 16;

/** プレミアムパス: what it gives, whether the player has it (and for how long), buying
 *  or renewing it through PaymentSystem, and taking the day's 魔晶石. There is no
 *  store behind it yet: it does not renew by itself. */
export class PremiumScene extends InboxScene {
  protected readonly screenTitle = 'プレミアムパス';
  protected emptyText = '';
  private paying = false;

  constructor() {
    super('Premium');
  }

  init(): void {
    super.init();
    this.paying = false;
  }

  protected buildCards(): InboxCard[] {
    return [this.statusCard(), this.benefitsCard(), this.packCard(), this.actionCard()];
  }

  private statusCard(): InboxCard {
    const active = PremiumSystem.isActive(this.save);
    const height = 168;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height, active));
    container.add(this.add.image(PAD + 44, 62, crownIcon(this, 88)));
    container.add(heading(this, PAD + 104, 40, 'プレミアムパス', { fontSize: '34px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    const chip = buildChip(this, 0, 40, active ? '加入中' : '未加入', { fill: active ? 0x2f7a3a : 0x4a3a3a, color: active ? '#e6ffe0' : '#d8c8c8', fontSize: 20 });
    chip.container.setX(CARD_WIDTH - PAD - chip.width);
    container.add(chip.container);
    container.add(body(this, PAD + 104, 88, `月額 ¥${PREMIUM.yen.toLocaleString('ja-JP')}（${PREMIUM.durationDays}日間）`, { fontSize: '28px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    const until = new Date(this.save.premium.expiresAt);
    const line = active ? `あと${PremiumSystem.daysLeft(this.save)}日（${until.getMonth() + 1}/${until.getDate()}まで）` : '加入すると、下の特典がすべて使えます';
    container.add(caption(this, PAD + 104, 130, line, { fontSize: '21px', color: active ? '#9fe39f' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    return { container, height };
  }

  private benefitsCard(): InboxCard {
    const rows: { icon: (x: number, y: number, c: Phaser.GameObjects.Container) => void; title: string; detail: string }[] = [
      {
        icon: (x, y, c) => c.add(addGoodIcon(this, 'gems', x, y, 52)),
        title: `毎日 魔晶石 ${PREMIUM.dailyGems}個`,
        detail: `ひと月で約${(PREMIUM.dailyGems * PREMIUM.durationDays).toLocaleString('ja-JP')}個（約3,000円ぶん）`,
      },
      {
        icon: (x, y, c) => {
          c.add(body(this, x, y, '×2', { fontSize: '40px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
        },
        title: `${PREMIUM.battleSpeed}倍速でサクサク`,
        detail: 'クエストも無限モードも、戦闘が2倍の速さに',
      },
      {
        icon: (x, y, c) => c.add(this.add.image(x, y, hourglassIcon(this, 56))),
        title: '放置報酬の上限アップ',
        detail: `たまる時間の上限が ${IDLE_BASE_CAP_HOURS}時間 → ${PREMIUM.idleCapHours}時間`,
      },
    ];
    const rowH = 100;
    const height = 70 + rows.length * rowH;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 34, 'プレミアム特典', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    rows.forEach((row, i) => {
      const y = 70 + i * rowH + rowH / 2;
      row.icon(PAD + 40, y, container);
      container.add(body(this, PAD + 92, y - 16, row.title, { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      container.add(wrappedText(this, PAD + 92, y + 8, row.detail, CARD_WIDTH - PAD * 2 - 92, { fontSize: '19px', color: '#d8c49a' }));
    });
    return { container, height };
  }

  private packCard(): InboxCard {
    const grid = buildRewardGrid(this, PREMIUM_JOIN_PACK.map(tileForReward), CARD_WIDTH - PAD * 2);
    const height = 96 + grid.height + 20;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 34, '加入特典 限定パック', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(caption(this, PAD + 4, 68, '加入・更新のたびに届きます（約300円ぶん）', { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    grid.container.setPosition(PAD, 96);
    container.add(grid.container);
    return { container, height };
  }

  private actionCard(): InboxCard {
    const guard = () => this.scroll.isTap();
    const active = PremiumSystem.isActive(this.save);
    const canDaily = PremiumSystem.canClaimDaily(this.save);
    const gateway = PaymentSystem.getGateway();
    const height = 268;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));

    const daily = new Button(this, CARD_WIDTH / 2, 60, CARD_WIDTH - PAD * 2, 84, !active ? '加入中は毎日魔晶石がもらえます' : canDaily ? `今日の魔晶石 ${PREMIUM.dailyGems}個を受け取る` : '今日の魔晶石は受け取り済みです', () => this.claimDaily(), {
      variant: 'gold',
      fontSize: '27px',
      guard,
    });
    daily.setEnabled(canDaily);
    container.add(daily);

    const buy = new Button(this, CARD_WIDTH / 2, 160, CARD_WIDTH - PAD * 2, 84, active ? `更新する（+${PREMIUM.durationDays}日）` : '購入する', () => this.askBuy(), {
      variant: active ? 'wood' : 'gold',
      fontSize: '30px',
      subLabel: `¥${PREMIUM.yen.toLocaleString('ja-JP')}${gateway.isTest ? '（テスト決済・請求なし）' : ''}`,
      guard,
    });
    container.add(buy);
    container.add(caption(this, CARD_WIDTH / 2, 232, '※自動更新には対応していません。期限が切れたら、もう一度ご購入ください。', { fontSize: '16px', color: '#a89a78', stroke: INK, strokeThickness: 3, align: 'center' }).setOrigin(0.5));
    return { container, height };
  }

  private claimDaily(): void {
    const gems = PremiumSystem.claimDaily(this.save);
    if (gems === 0) return;
    SaveSystem.save(this.save);
    this.refreshResources();
    showToast(this, `魔晶石 ${gems}個を受け取りました`);
    this.queueRender();
  }

  private askBuy(): void {
    if (this.paying || this.modal?.container.active) return;
    const gateway = PaymentSystem.getGateway();
    this.modal = openConfirm(this, this.scroll, {
      title: PremiumSystem.isActive(this.save) ? 'プレミアムパスを更新' : 'プレミアムパスを購入',
      message: `${PREMIUM.name}\n¥${PREMIUM.yen.toLocaleString('ja-JP')}（税込）${gateway.isTest ? '\n※テスト決済です。実際には請求されません。' : ''}`,
      confirmLabel: '購入する',
      confirmVariant: 'gold',
      onConfirm: () => void this.pay(),
    });
  }

  private async pay(): Promise<void> {
    this.paying = true;
    const result = await PaymentSystem.getGateway().purchase({ productId: PREMIUM.productId, name: PREMIUM.name, yen: PREMIUM.yen });
    this.paying = false;
    if (!this.scene.isActive()) return;
    if (result.status === 'paid') {
      const pack = PremiumSystem.activate(this.save);
      SaveSystem.save(this.save);
      this.refreshResources();
      this.modal?.close();
      this.modal = showRewardModal(this, this.scroll, { title: 'プレミアムパス加入', tiles: tilesForGranted(pack), note: '加入特典パックを受け取りました', onClose: () => this.queueRender() });
    } else if (result.status === 'unavailable') {
      showToast(this, 'ただいま決済を利用できません', '#ff8a8a');
    } else if (result.status === 'failed') {
      showToast(this, '決済に失敗しました', '#ff8a8a');
    }
  }
}
