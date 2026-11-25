import Phaser from 'phaser';
import { AllianceService } from '../alliance/AllianceService';
import type { AllianceDetail } from '../alliance/AllianceBackend';
import { RESEARCH_LINES, RESEARCH_MAX_LEVEL, nextResearchStep, researchBlock, researchValue, type ResearchLineDef } from '../data/allianceResearch';
import { fullDigits } from '../ui/AllianceParts';
import { Button } from '../ui/Button';
import { wrappedText } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { body } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { t } from '../i18n';
import type { InboxCard } from './InboxScene';
import { AllianceScene, INK, PAD } from './AllianceBase';

/** Room for the text on the left of a research card (the button column is on the right). */
const TEXT_W = 410;
const PIP = 28;
const PIP_GAP = 8;

const pct = (v: number): string => `+${Math.round(v * 100)}%`;

/** 同盟研究: the alliance's 資金 (from 寄付) buys steps in three lines (戦闘 / 収入 / 成長), each a small raise for every member. The
 *  leader and officers choose what to research; everyone sees what has been done. */
export class AllianceResearchScene extends AllianceScene {
  protected get screenTitle(): string {
    return t('alliance.research.title');
  }
  protected readonly navTab = null;

  constructor() {
    super('AllianceResearch');
  }

  protected cards(d: AllianceDetail | null): InboxCard[] {
    if (!d) return [];
    return [this.fundCard(d), ...RESEARCH_LINES.map((line) => this.lineCard(d, line))];
  }

  private fit<T extends Phaser.GameObjects.Text>(text: T, max: number): T {
    if (text.width > max) text.setScale(max / text.width);
    return text;
  }

  private fundCard(d: AllianceDetail): InboxCard {
    const hint = wrappedText(this, PAD + 6, 80, t('alliance.research.fundHint'), CARD_WIDTH - PAD * 2 - 12, { fontSize: '18px', color: '#cdbb94', lineSpacing: 5 });
    const card = this.shell(80 + hint.height + 50, true);
    card.container.add(this.fit(body(this, PAD + 6, 36, t('alliance.research.fund', { fund: fullDigits(d.fund) }), { fontSize: '31px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5), CARD_WIDTH - PAD * 2 - 12));
    card.container.add(hint);
    const can = d.research.canResearch;
    this.fit(this.line(card, PAD + 6, 80 + hint.height + 24, can ? t('alliance.research.roleOfficer') : t('alliance.research.roleMember'), can ? '#9fe39f' : '#d8c49a', 18), CARD_WIDTH - PAD * 2 - 12);
    return card;
  }

  private lineCard(d: AllianceDetail, line: ResearchLineDef): InboxCard {
    const guard = () => this.scroll.isTap();
    const level = d.research.levels[line.id] ?? 0;
    const step = nextResearchStep(level);
    const block = researchBlock(level, d.summary.level, d.fund);
    const canResearch = d.research.canResearch && block === null;
    const card = this.shell(214, canResearch);
    const x = PAD + 6;

    card.container.add(this.fit(body(this, x, 30, t(line.name), { fontSize: '27px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5), 330));
    card.container.add(body(this, CARD_WIDTH - PAD - 6, 30, t('alliance.research.levelOf', { level, max: RESEARCH_MAX_LEVEL }), { fontSize: '22px', fontStyle: 'bold', color: level > 0 ? '#ffffff' : '#9a8a6a', stroke: INK, strokeThickness: 4 }).setOrigin(1, 0.5));
    this.fit(this.line(card, x, 66, t(line.effectText), '#cdbb94', 17), CARD_WIDTH - PAD * 2 - 12);

    // the five steps
    const pips = this.add.graphics();
    for (let i = 0; i < RESEARCH_MAX_LEVEL; i++) {
      const px = x + i * (PIP + PIP_GAP);
      pips.fillStyle(0x0d0905, 1);
      pips.fillRoundedRect(px, 92, PIP, PIP, 6);
      if (i < level) {
        pips.fillStyle(0xe0822a, 1);
        pips.fillRoundedRect(px + 3, 95, PIP - 6, PIP - 6, 4);
        pips.fillStyle(0xffffff, 0.25);
        pips.fillRoundedRect(px + 5, 97, PIP - 10, (PIP - 10) / 2, 3);
      }
      pips.lineStyle(2, 0x8a6a2f, 1);
      pips.strokeRoundedRect(px, 92, PIP, PIP, 6);
    }
    card.container.add(pips);
    card.container.add(this.fit(body(this, x + RESEARCH_MAX_LEVEL * (PIP + PIP_GAP) + 10, 106, t('alliance.research.now', { value: pct(researchValue(line.id, level)) }), { fontSize: '21px', fontStyle: 'bold', color: level > 0 ? '#9fe39f' : '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5), 230));

    if (step) {
      this.fit(this.line(card, x, 146, t('alliance.research.next', { value: pct(researchValue(line.id, level + 1)), cost: fullDigits(step.cost) }), '#f5e6c8', 19), TEXT_W);
      const note =
        block === 'level'
          ? t('alliance.research.needLevel', { needLevel: step.needLevel })
          : block === 'fund'
            ? t('alliance.research.shortOfFund', { short: fullDigits(step.cost - d.fund) })
            : d.research.canResearch
              ? ''
              : t('alliance.research.roleMember');
      this.fit(this.line(card, x, 180, note, block === null && d.research.canResearch ? '#9fe39f' : '#ff9a8a', 17), TEXT_W);
    } else {
      this.line(card, x, 150, t('alliance.research.maxed'), '#9fe39f', 21);
    }

    const label = !step ? t('alliance.research.maxed') : !d.research.canResearch ? t('alliance.research.noRight') : block === 'level' ? t('alliance.research.lockedLevel') : block === 'fund' ? t('alliance.research.lockedFund') : t('alliance.research.button');
    const button = new Button(this, CARD_WIDTH - PAD - 90, 138, 170, 66, label, () => this.ask(d, line), { variant: 'gold', fontSize: label.length > 9 ? '20px' : '26px', guard });
    button.setEnabled(canResearch);
    card.container.add(button);
    return card;
  }

  private ask(d: AllianceDetail, line: ResearchLineDef): void {
    const level = d.research.levels[line.id] ?? 0;
    const step = nextResearchStep(level);
    if (!step) return;
    this.setModal(
      openConfirm(this, this.scroll, {
        title: t('alliance.research.confirmTitle'),
        message: t('alliance.research.confirmMessage', { name: t(line.name), level: level + 1, cost: fullDigits(step.cost) }),
        confirmLabel: t('alliance.research.button'),
        confirmVariant: 'gold',
        onConfirm: () => void this.research(line),
      }),
    );
  }

  private async research(line: ResearchLineDef): Promise<void> {
    await this.run(AllianceService.researchUp(this.save, line.id), (r) => {
      showToast(this, t('alliance.research.done', { name: t(line.name), level: r.level, value: pct(researchValue(line.id, r.level)) }));
    });
  }
}
