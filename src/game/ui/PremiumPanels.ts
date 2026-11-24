import Phaser from 'phaser';
import { IDLE_BASE_CAP_HOURS } from '../data/idle';
import { PREMIUM, PREMIUM_JOIN_PACK } from '../data/premium';
import { PaymentSystem } from '../systems/PaymentSystem';
import { PremiumSystem } from '../systems/PremiumSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { Button } from './Button';
import { buildCardPanel, buildChip, wrappedText } from './CardParts';
import { openConfirm } from './Dialogs';
import { crownIcon, hourglassIcon } from './ItemIcons';
import type { ModalHandle, ModalLock } from './Modal';
import { addGoodIcon } from './RewardIcon';
import { showRewardModal } from './RewardModal';
import { buildRewardGrid, tileForReward, tilesForGranted } from './RewardTiles';
import { CARD_WIDTH } from './ScreenFrame';
import { showToast } from './Toast';
import { body, caption, heading } from './theme';
import { t } from '../i18n';

/** The プレミアムパス cards, shared by its own screen (イベント) and the shop so both
 *  show the same details and can buy it. Each card is anchored top-left. */
const INK = '#1c130a';
const PAD = 16;

export type PanelCard = { container: Phaser.GameObjects.Container; height: number };

/** Crown, name, 月額, whether the player is a member and until when. */
export function buildPremiumStatusCard(scene: Phaser.Scene, save: SaveData): PanelCard {
  const active = PremiumSystem.isActive(save);
  const height = 168;
  const container = scene.add.container(0, 0);
  container.add(buildCardPanel(scene, CARD_WIDTH, height, active));
  container.add(scene.add.image(PAD + 44, 62, crownIcon(scene, 88)));
  container.add(heading(scene, PAD + 104, 40, t('shop.premiumPass'), { fontSize: '34px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
  const chip = buildChip(scene, 0, 40, active ? t('shop.premium.active') : t('shop.premium.inactive'), { fill: active ? 0x2f7a3a : 0x4a3a3a, color: active ? '#e6ffe0' : '#d8c8c8', fontSize: 20 });
  chip.container.setX(CARD_WIDTH - PAD - chip.width);
  container.add(chip.container);
  container.add(body(scene, PAD + 104, 88, t('shop.premium.monthly', { yen: PREMIUM.yen.toLocaleString('ja-JP'), durationDays: PREMIUM.durationDays }), { fontSize: '28px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
  const until = new Date(save.premium.expiresAt);
  const line = active ? t('shop.premium.daysLeftUntil', { daysLeft: PremiumSystem.daysLeft(save), month: until.getMonth() + 1, day: until.getDate() }) : t('shop.premium.joinToUnlock');
  container.add(caption(scene, PAD + 104, 130, line, { fontSize: '21px', color: active ? '#9fe39f' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
  return { container, height };
}

/** The standing benefits: daily 魔晶石, 2倍速, 連戦, a bigger 放置報酬 cap. */
export function buildPremiumBenefitsCard(scene: Phaser.Scene): PanelCard {
  const rows: { icon: (x: number, y: number, c: Phaser.GameObjects.Container) => void; title: string; detail: string }[] = [
    {
      icon: (x, y, c) => c.add(addGoodIcon(scene, 'gems', x, y, 52)),
      title: t('shop.premium.benefit.gemsTitle', { dailyGems: PREMIUM.dailyGems }),
      detail: t('shop.premium.benefit.gemsDetail', { dailyGems: (PREMIUM.dailyGems * PREMIUM.durationDays).toLocaleString('ja-JP') }),
    },
    {
      icon: (x, y, c) => c.add(body(scene, x, y, '×2', { fontSize: '40px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 6 }).setOrigin(0.5)),
      title: t('shop.premium.benefit.speedTitle', { battleSpeed: PREMIUM.battleSpeed }),
      detail: t('shop.premium.benefit.speedDetail'),
    },
    {
      icon: (x, y, c) => c.add(body(scene, x, y, t('shop.premium.benefit.chainIcon'), { fontSize: '42px', fontStyle: 'bold', color: '#ffd23f', stroke: INK, strokeThickness: 6 }).setOrigin(0.5)),
      title: t('shop.premium.benefit.chainTitle'),
      detail: t('shop.premium.benefit.chainDetail'),
    },
    {
      icon: (x, y, c) => c.add(scene.add.image(x, y, hourglassIcon(scene, 56))),
      title: t('shop.premium.benefit.idleTitle'),
      detail: t('shop.premium.benefit.idleDetail', { IDLE_BASE_CAP_HOURS, idleCapHours: PREMIUM.idleCapHours }),
    },
  ];
  const rowH = 100;
  const height = 70 + rows.length * rowH;
  const container = scene.add.container(0, 0);
  container.add(buildCardPanel(scene, CARD_WIDTH, height));
  container.add(heading(scene, PAD + 4, 34, t('shop.premium.benefits'), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
  rows.forEach((row, i) => {
    const y = 70 + i * rowH + rowH / 2;
    row.icon(PAD + 40, y, container);
    container.add(body(scene, PAD + 92, y - 16, row.title, { fontSize: '26px', fontStyle: 'bold', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(wrappedText(scene, PAD + 92, y + 8, row.detail, CARD_WIDTH - PAD * 2 - 92, { fontSize: '19px', color: '#d8c49a' }));
  });
  return { container, height };
}

/** The 加入特典 pack that comes with every purchase or renewal. */
export function buildPremiumPackCard(scene: Phaser.Scene): PanelCard {
  const grid = buildRewardGrid(scene, PREMIUM_JOIN_PACK.map(tileForReward), CARD_WIDTH - PAD * 2);
  const height = 96 + grid.height + 20;
  const container = scene.add.container(0, 0);
  container.add(buildCardPanel(scene, CARD_WIDTH, height));
  container.add(heading(scene, PAD + 4, 34, t('shop.premium.packTitle'), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
  container.add(caption(scene, PAD + 4, 68, t('shop.premium.packNote'), { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
  grid.container.setPosition(PAD, 96);
  container.add(grid.container);
  return { container, height };
}

export interface PremiumActionHandlers {
  onClaimDaily: () => void;
  onBuy: () => void;
  guard: () => boolean;
}

/** Today's 魔晶石 (for members) and the buy / renew button. */
export function buildPremiumActionCard(scene: Phaser.Scene, save: SaveData, handlers: PremiumActionHandlers): PanelCard {
  const active = PremiumSystem.isActive(save);
  const canDaily = PremiumSystem.canClaimDaily(save);
  const gateway = PaymentSystem.getGateway();
  const height = 268;
  const container = scene.add.container(0, 0);
  container.add(buildCardPanel(scene, CARD_WIDTH, height));

  const daily = new Button(
    scene,
    CARD_WIDTH / 2,
    60,
    CARD_WIDTH - PAD * 2,
    84,
    !active ? t('shop.premium.dailyHint') : canDaily ? t('shop.premium.claimDaily', { dailyGems: PREMIUM.dailyGems }) : t('shop.premium.dailyClaimed'),
    handlers.onClaimDaily,
    { variant: 'gold', fontSize: '27px', guard: handlers.guard },
  );
  daily.setEnabled(canDaily);
  container.add(daily);

  container.add(
    new Button(scene, CARD_WIDTH / 2, 160, CARD_WIDTH - PAD * 2, 84, active ? t('shop.premium.renew', { durationDays: PREMIUM.durationDays }) : t('shop.buy'), handlers.onBuy, {
      variant: active ? 'wood' : 'gold',
      fontSize: '30px',
      subLabel: t(gateway.isTest ? 'shop.premium.priceTaxTest' : 'shop.premium.priceTax', { yen: PREMIUM.yen.toLocaleString('ja-JP') }),
      guard: handlers.guard,
    }),
  );
  container.add(caption(scene, CARD_WIDTH / 2, 232, t('shop.premium.noAutoRenew'), { fontSize: '16px', color: '#a89a78', stroke: INK, strokeThickness: 3, align: 'center' }).setOrigin(0.5));
  return { container, height };
}

/** Takes today's 魔晶石 and shows it, with a 確認 button. Returns the popup, or null if there was none to take. */
export function claimPremiumDaily(scene: Phaser.Scene, lock: ModalLock, save: SaveData, onClosed: () => void): ModalHandle | null {
  const gems = PremiumSystem.claimDaily(save);
  if (gems === 0) return null;
  SaveSystem.save(save);
  return showRewardModal(scene, lock, { title: t('shop.premium.dailyGemsTitle'), tiles: [{ kind: 'gems', amount: `+${gems.toLocaleString('ja-JP')}` }], note: t('shop.premium.dailyGemsNote'), onClose: onClosed });
}

/** Confirm, pay through PaymentSystem, and on success start/extend the pass and show what came with it. */
export function askBuyPremium(
  scene: Phaser.Scene,
  lock: ModalLock,
  save: SaveData,
  hooks: {
    /** The scene keeps the open popup so it can close it later. */
    setModal: (handle: ModalHandle) => void;
    /** Called after a purchase went through, before the reward popup is dismissed (top bar numbers, etc.). */
    onPaid: () => void;
    /** Called once the reward popup is closed (rebuild the screen). */
    onClosed: () => void;
    isBusy: () => boolean;
    setBusy: (busy: boolean) => void;
  },
): void {
  if (hooks.isBusy()) return;
  const gateway = PaymentSystem.getGateway();
  hooks.setModal(
    openConfirm(scene, lock, {
      title: PremiumSystem.isActive(save) ? t('shop.premium.renewPass') : t('shop.premium.buyPass'),
      message: t(gateway.isTest ? 'shop.premium.confirmMessageTest' : 'shop.premium.confirmMessage', { name: PREMIUM.name, yen: PREMIUM.yen.toLocaleString('ja-JP') }),
      confirmLabel: t('shop.buy'),
      confirmVariant: 'gold',
      onConfirm: () => {
        void (async () => {
          hooks.setBusy(true);
          const result = await PaymentSystem.getGateway().purchase({ productId: PREMIUM.productId, name: PREMIUM.name, yen: PREMIUM.yen });
          hooks.setBusy(false);
          if (!scene.scene.isActive()) return;
          if (result.status === 'paid') {
            const pack = PremiumSystem.activate(save);
            SaveSystem.save(save);
            hooks.onPaid();
            hooks.setModal(showRewardModal(scene, lock, { title: t('shop.premium.joinedTitle'), tiles: tilesForGranted(pack), note: t('shop.premium.packClaimed'), onClose: hooks.onClosed }));
          } else if (result.status === 'unavailable') {
            showToast(scene, t('shop.toast.paymentUnavailable'), '#ff8a8a');
          } else if (result.status === 'failed') {
            showToast(scene, t('shop.toast.paymentFailed'), '#ff8a8a');
          }
        })();
      },
    }),
  );
}
