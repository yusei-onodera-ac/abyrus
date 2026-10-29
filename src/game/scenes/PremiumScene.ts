import { buildPremiumActionCard, buildPremiumBenefitsCard, buildPremiumPackCard, buildPremiumStatusCard, askBuyPremium, claimPremiumDaily } from '../ui/PremiumPanels';
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

  constructor() {
    super('Premium');
  }

  init(): void {
    super.init();
    this.paying = false;
  }

  protected goBack(): void {
    this.scene.start('Event');
  }

  protected buildCards(): InboxCard[] {
    const guard = () => this.scroll.isTap();
    return [
      buildPremiumStatusCard(this, this.save),
      buildPremiumBenefitsCard(this),
      buildPremiumPackCard(this),
      buildPremiumActionCard(this, this.save, { guard, onBuy: () => this.buy(), onClaimDaily: () => this.claimDaily() }),
    ];
  }

  private claimDaily(): void {
    if (!claimPremiumDaily(this, this.save)) return;
    this.refreshResources();
    this.queueRender();
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
