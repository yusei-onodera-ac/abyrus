import { AllianceService } from '../alliance/AllianceService';
import { DONATION_LABEL, type AllianceDetail, type DonationKind } from '../alliance/AllianceBackend';
import { DONATIONS, DONATION_KINDS } from '../data/alliance';
import { SaveSystem } from '../systems/SaveSystem';
import { playAllianceLevelUp } from '../ui/AllianceFx';
import { buildBar, fullDigits } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { openConfirm } from '../ui/Dialogs';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { t, type PlainKey } from '../i18n';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

const WHAT: Record<DonationKind, PlainKey> = { gold: 'alliance.donate.whatGold', materials: 'alliance.donate.whatMaterials', gems: 'alliance.donate.whatGems' };

/** 寄付: gold, 素材 and 魔晶石 given to the 同盟 raise its level (and everyone's perks) and give the donor 貢献, which are also
 *  同盟コイン for the ショップ. Each kind has a daily limit. */
export class AllianceDonateScene extends AllianceScene {
  protected get screenTitle(): string {
    return t('alliance.shared.donate');
  }
  protected readonly navTab = null;

  constructor() {
    super('AllianceDonate');
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    return [this.statusCard(d), ...DONATION_KINDS.map((kind) => this.kindCard(d, kind))];
  }

  private statusCard(d: AllianceDetail): InboxCard {
    const card = this.shell(176, true);
    card.container.add(body(this, PAD + 6, 30, t('alliance.shared.level', { level: d.summary.level }), { fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    const need = d.expToNext;
    card.container.add(buildBar(this, PAD + 6, 62, CARD_WIDTH - PAD * 2 - 12, 22, need ? d.exp / need : 1, 0x3a7fd6));
    this.line(card, PAD + 6, 106, need ? t('alliance.donate.exp', { fullDigits: fullDigits(d.exp), fullDigits2: fullDigits(need) }) : t('alliance.donate.maxLevel'), '#f5e6c8', 19);
    this.line(card, PAD + 6, 142, t('alliance.donate.coinsAndContribution', { fullDigits: fullDigits(d.coins), fullDigits2: fullDigits(d.me.contribution) }), '#cdbb94', 18);
    return card;
  }

  private kindCard(d: AllianceDetail, kind: DonationKind): InboxCard {
    const guard = () => this.scroll.isTap();
    const rule = DONATIONS[kind];
    const what = t(WHAT[kind]);
    const left = d.donationLeft[kind] ?? 0;
    const card = this.shell(154, left > 0);
    card.container.add(body(this, PAD + 6, 30, t(DONATION_LABEL[kind]), { fontSize: '27px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    this.line(card, PAD + 6, 66, t('alliance.donate.each', { what }), '#f5e6c8', 18);
    this.line(card, PAD + 6, 98, t('alliance.donate.gains', { allianceExp: rule.allianceExp, contribution: rule.contribution }), '#9fe39f', 18);
    this.line(card, PAD + 6, 128, t('alliance.donate.leftToday', { left, limit: rule.limit }), left > 0 ? '#cdbb94' : '#ff9a8a', 17);
    const button = new Button(this, CARD_WIDTH - PAD - 90, 78, 170, 66, left > 0 ? t('alliance.donate.donate') : t('alliance.donate.doneToday'), () => this.ask(kind), { variant: 'gold', fontSize: '26px', guard });
    button.setEnabled(left > 0);
    card.container.add(button);
    return card;
  }

  private ask(kind: DonationKind): void {
    const rule = DONATIONS[kind];
    const what = t(WHAT[kind]);
    this.setModal(
      openConfirm(this, this.scroll, {
        title: t('alliance.donate.confirmTitle', { label: t(DONATION_LABEL[kind]) }),
        message: t('alliance.donate.confirmMessage', { what, allianceExp: rule.allianceExp, contribution: rule.contribution }),
        confirmLabel: t('alliance.donate.donate'),
        confirmVariant: 'gold',
        onConfirm: () => void this.donate(kind),
      }),
    );
  }

  private async donate(kind: DonationKind): Promise<void> {
    await this.run(AllianceService.donate(this.save, kind), (r) => {
      SaveSystem.save(this.save);
      showToast(this, t('alliance.donate.donated', { allianceExp: r.allianceExp, contribution: r.contribution }));
      if (r.levelUp !== null) playAllianceLevelUp(this, r.levelUp);
    });
  }
}
