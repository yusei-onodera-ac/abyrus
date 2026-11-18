import { IDLE_AD_BOOSTS_PER_DAY, IDLE_AD_BOOST_HOURS, IDLE_BASE_CAP_HOURS } from '../data/idle';
import { PREMIUM } from '../data/premium';
import { AdSystem } from '../systems/AdSystem';
import { IdleSystem } from '../systems/IdleSystem';
import { PremiumSystem } from '../systems/PremiumSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { Button } from '../ui/Button';
import { buildCardPanel } from '../ui/CardParts';
import { hourglassIcon } from '../ui/ItemIcons';
import { openModal } from '../ui/Modal';
import { buildRewardGrid, tilesForIdleClaim, type RewardTile } from '../ui/RewardTiles';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { body, caption, heading, CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';
import { t } from '../i18n';

const INK = '#1c130a';
const PAD = 16;

function formatHours(hours: number): string {
  const total = Math.floor(hours * 60);
  return t('home.idle.hoursMinutes', { total: Math.floor(total / 60), total2: String(total % 60).padStart(2, '0') });
}

/** 放置報酬: coins and 素材 pile up while the player is away (up to a cap that the
 *  プレミアムパス raises) and are taken here. A watched ad moves the clock an hour
 *  ahead, a few times a day. */
export class IdleScene extends InboxScene {
  protected get screenTitle(): string {
    return t('home.idleRewards');
  }
  protected emptyText = '';
  private watchingAd = false;

  constructor() {
    super('Idle');
  }

  init(): void {
    super.init();
    this.watchingAd = false;
  }

  protected buildCards(): InboxCard[] {
    return [this.statusCard(), this.rewardCard(), this.actionCard()];
  }

  private statusCard(): InboxCard {
    const preview = IdleSystem.preview(this.save);
    const height = 188;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(this.add.image(PAD + 38, 56, hourglassIcon(this, 76)));
    container.add(heading(this, PAD + 92, 36, t('home.idle.storedTime'), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(body(this, PAD + 92, 80, formatHours(preview.hours), { fontSize: '40px', fontStyle: 'bold', color: preview.full ? '#ffd23f' : '#ffffff', stroke: INK, strokeThickness: 6 }).setOrigin(0, 0.5));
    container.add(caption(this, CARD_WIDTH - PAD, 36, t('home.idle.maxH', { capHours: preview.capHours }), { fontSize: '21px', color: preview.full ? '#ffd23f' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));

    const barX = PAD;
    const barW = CARD_WIDTH - PAD * 2;
    const bar = this.add.graphics();
    bar.fillStyle(0x0d0905, 1);
    bar.fillRoundedRect(barX, 118, barW, 18, 9);
    bar.fillStyle(preview.full ? 0xffd23f : 0xe0822a, 1);
    bar.fillRoundedRect(barX, 118, Math.max(18, barW * Math.min(1, preview.hours / preview.capHours)), 18, 9);
    bar.lineStyle(2, CHROME.brassDark, 1);
    bar.strokeRoundedRect(barX, 118, barW, 18, 9);
    container.add(bar);

    const note = PremiumSystem.isActive(this.save)
      ? t('home.idle.premiumPassActiveMax', { idleCapHours: PREMIUM.idleCapHours })
      : preview.full
        ? t('home.idle.fullyStoredTimeTo')
        : t('home.idle.premiumPassRaisesThe', { IDLE_BASE_CAP_HOURS, idleCapHours: PREMIUM.idleCapHours });
    container.add(caption(this, PAD, 160, note, { fontSize: '19px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
    return { container, height };
  }

  /** What is waiting right now, as tiles. */
  private rewardCard(): InboxCard {
    const preview = IdleSystem.preview(this.save);
    const tiles: RewardTile[] = [{ kind: 'gold', amount: `+${preview.gold.toString()}` }];
    if (preview.skillEssence > 0) tiles.push({ kind: 'essence', amount: `+${preview.skillEssence.toLocaleString('ja-JP')}` });
    for (const { item, amount } of preview.items) tiles.push({ kind: 'item', item, amount: `+${amount.toLocaleString('ja-JP')}` });
    if (preview.phaseMaterials > 0) tiles.push({ kind: 'phaseMaterials', amount: `+${preview.phaseMaterials}` });
    if (preview.equipment > 0) tiles.push({ kind: 'equipment', equip: { glyph: 'sword', rarity: 2, name: t('home.idle.gear') }, amount: `×${preview.equipment}` });

    const grid = buildRewardGrid(this, tiles, CARD_WIDTH - PAD * 2);
    const height = 70 + grid.height + 24;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 34, t('home.idle.readyToClaim'), { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    grid.container.setPosition(PAD, 66);
    container.add(grid.container);
    return { container, height };
  }

  private actionCard(): InboxCard {
    const guard = () => this.scroll.isTap();
    const preview = IdleSystem.preview(this.save);
    const left = IdleSystem.adBoostsLeft(this.save);
    const gateway = AdSystem.getGateway();
    const height = 232;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));

    const claim = new Button(this, CARD_WIDTH / 2, 62, CARD_WIDTH - PAD * 2, 88, t('common.claim'), () => this.claim(), { variant: 'gold', fontSize: '36px', guard });
    claim.setEnabled(preview.hours >= 1 / 60);
    container.add(claim);

    const canAd = left > 0 && !preview.full;
    const sub = preview.full ? t('home.idle.storageIsFull') : left === 0 ? t('home.idle.noBoostsLeftToday') : t('home.idle.boostsLeft', { left, perDay: IDLE_AD_BOOSTS_PER_DAY }) + (gateway.isTest ? t('home.idle.testAd') : '');
    const ad = new Button(this, CARD_WIDTH / 2, 160, CARD_WIDTH - PAD * 2, 84, t('home.idle.watchAdH', { IDLE_AD_BOOST_HOURS }), () => this.watchAd(), { variant: 'wood', fontSize: '28px', subLabel: sub, guard });
    ad.setEnabled(canAd);
    container.add(ad);
    return { container, height };
  }

  private claim(): void {
    const result = IdleSystem.claim(this.save);
    SaveSystem.save(this.save);
    this.refreshResources();
    const tiles = tilesForIdleClaim(result.preview, result.equipment);
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title: t('home.idle.idleRewardsClaimed'), tiles, onClose: () => this.queueRender() });
  }

  /** Plays a rewarded ad (whatever AdSystem is connected to); a watched one moves the clock ahead. */
  private watchAd(): void {
    if (this.watchingAd) return;
    this.watchingAd = true;
    // A dim layer with a note while the ad runs, which also keeps the screen from being tapped.
    this.modal?.close();
    const overlay = openModal(this, this.scroll, 0.85, false);
    overlay.container.add(heading(this, 360, 620, t('home.idle.playingAd'), { fontSize: '40px', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
    this.modal = overlay;
    void AdSystem.getGateway()
      .showRewardedAd()
      .then((result) => {
        this.watchingAd = false;
        if (!this.scene.isActive()) return;
        overlay.close();
        if (result === 'watched') {
          const outcome = IdleSystem.boostByAd(this.save);
          SaveSystem.save(this.save);
          showToast(this, outcome === 'ok' ? t('home.idle.hAdded', { IDLE_AD_BOOST_HOURS }) : t('home.idle.canTAdvanceRight'));
        } else if (result === 'unavailable') {
          showToast(this, t('home.idle.adsAreUnavailable'), '#ff8a8a');
        }
        this.queueRender();
      });
  }
}
