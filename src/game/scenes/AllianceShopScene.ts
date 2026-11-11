import { AllianceService } from '../alliance/AllianceService';
import type { AllianceDetail } from '../alliance/AllianceBackend';
import type { ShopItem } from '../data/alliance';
import { SaveSystem } from '../systems/SaveSystem';
import { fullDigits, rewardLine, tilesForAllianceReward } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { openConfirm } from '../ui/Dialogs';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body } from '../ui/theme';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

const noLock = { setEnabled: () => {} };

/** 同盟ショップ: 同盟コイン (from 寄付, the boss, the 対抗戦 and lending a 助っ人) for things that help. Some have a weekly limit. */
export class AllianceShopScene extends AllianceScene {
  protected readonly screenTitle = '同盟ショップ';
  protected readonly navTab = null;

  constructor() {
    super('AllianceShop');
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    const head = this.shell(86, true);
    head.container.add(body(this, PAD + 6, 43, `あなたの同盟コイン　${fullDigits(d.coins)}`, { fontSize: '28px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    return [head, ...this.items().map((item) => this.itemCard(d, item))];
  }

  private items(): ShopItem[] {
    return AllianceService.shopItems();
  }

  private itemCard(d: AllianceDetail, item: ShopItem): InboxCard {
    const guard = () => this.scroll.isTap();
    const status = AllianceService.shopStatus(this.save, item.id);
    const left = item.weeklyLimit > 0 ? status.left : null;
    const affordable = d.coins >= item.cost;
    const card = this.shell(126);
    card.container.add(body(this, PAD + 6, 32, item.name, { fontSize: '26px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 70, left === null ? '何回でも交換できます' : `今週あと ${left}回（週${item.weeklyLimit}回まで）`, left === 0 ? '#ff9a8a' : '#cdbb94', 17);
    this.line(card, PAD + 6, 100, rewardLine(item.reward), '#9fe39f', 16);
    const sold = left === 0;
    const button = new Button(this, CARD_WIDTH - PAD - 90, 63, 170, 66, sold ? '売り切れ' : `${fullDigits(item.cost)}コイン`, () => this.ask(item), { variant: 'gold', fontSize: sold ? '24px' : '22px', guard });
    button.setEnabled(!sold && affordable);
    card.container.add(button);
    return card;
  }

  private ask(item: ShopItem): void {
    this.setModal(
      openConfirm(this, this.scroll, {
        title: '交換',
        message: `同盟コイン ${fullDigits(item.cost)}枚で、\n「${item.name}」と交換しますか？`,
        confirmLabel: '交換する',
        confirmVariant: 'gold',
        onConfirm: () => void this.buy(item),
      }),
    );
  }

  private async buy(item: ShopItem): Promise<void> {
    await this.run(AllianceService.buy(this.save, item.id), (reward) => {
      SaveSystem.save(this.save);
      this.modal = showRewardModal(this, noLock, { title: '交換しました', tiles: tilesForAllianceReward(reward), note: item.name });
    });
  }
}
