import { showToast } from '../ui/Toast';
import type { ShopFocus } from '../data/shop';
import { buildPremiumActionCard, buildPremiumBenefitsCard, buildPremiumPackCard, buildPremiumStatusCard, askBuyPremium, claimPremiumDaily } from '../ui/PremiumPanels';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

/** プレミアムパス: what it gives, whether the player has it (and for how long),
 *  buying or renewing it through PaymentSystem, and taking the day's 魔晶石. It
 *  is one of the イベント tab's events, so 戻る goes back there. The same cards
 *  are shown in the shop (ui/PremiumPanels.ts). There is no store behind it
 *  yet: it does not renew by itself. */
export class PremiumScene extends InboxScene {
  protected readonly screenTitle = 'プレミアムパス';
  protected emptyText = '';
  private paying = false;
  /** Set when opened over a paused fight (from the 2倍速 button): 戻る then carries the fight on instead of going to イベント. */
  private overlayOf?: string;

  constructor() {
    super('Premium');
  }

  init(data?: { overlayOf?: string }): void {
    super.init();
    this.paying = false;
    this.overlayOf = data?.overlayOf;
  }

  protected goBack(): void {
    if (this.overlayOf) {
      const key = this.overlayOf;
      this.scene.stop();
      this.scene.resume(key);
      return;
    }
    this.scene.start('Event');
  }

  protected showBottomNav(): boolean {
    return !this.overlayOf;
  }

  protected openShop(focus: ShopFocus): void {
    // The fight underneath would be lost: the shop is for after it.
    if (this.overlayOf) showToast(this, '戦闘中はショップを開けません');
    else super.openShop(focus);
  }

  protected buildCards(): InboxCard[] {
    const guard = () => this.scroll.isTap();
    return [
      ...this.headerCard(),
      buildPremiumStatusCard(this, this.save),
      buildPremiumBenefitsCard(this),
      buildPremiumPackCard(this),
      buildPremiumActionCard(this, this.save, { guard, onBuy: () => this.buy(), onClaimDaily: () => this.claimDaily() }),
    ];
  }

  /** The picture across the top (public/assets/events/premium_header.jpg), when there is one. */
  private headerCard(): InboxCard[] {
    if (!this.textures.exists('premium_header')) return [];
    const source = this.textures.get('premium_header').getSourceImage();
    const height = Math.round((CARD_WIDTH * source.height) / source.width);
    const container = this.add.container(0, 0);
    container.add(this.add.image(CARD_WIDTH / 2, height / 2, 'premium_header').setDisplaySize(CARD_WIDTH, height));
    const frame = this.add.graphics();
    frame.lineStyle(3, CHROME.brass, 1);
    frame.strokeRoundedRect(1.5, 1.5, CARD_WIDTH - 3, height - 3, 10);
    container.add(frame);
    return [{ container, height }];
  }

  private claimDaily(): void {
    this.modal?.close();
    const handle = claimPremiumDaily(this, this.scroll, this.save, () => this.queueRender());
    if (!handle) return;
    this.modal = handle;
    this.refreshResources();
  }

  private buy(): void {
    if (this.modal?.container.active) return;
    askBuyPremium(this, this.scroll, this.save, {
      setModal: (handle) => {
        this.modal?.close();
        this.modal = handle;
      },
      onPaid: () => this.refreshResources(),
      onClosed: () => this.queueRender(),
      isBusy: () => this.paying,
      setBusy: (busy) => {
        this.paying = busy;
      },
    });
  }
}
