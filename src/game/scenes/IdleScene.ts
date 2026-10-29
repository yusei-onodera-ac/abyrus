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
import { buildRewardGrid, tilesForEquipment, type RewardTile } from '../ui/RewardTiles';
import { showRewardModal } from '../ui/RewardModal';
import { CARD_WIDTH } from '../ui/ScreenFrame';
import { showToast } from '../ui/Toast';
import { body, caption, heading, CHROME } from '../ui/theme';
import { InboxScene, type InboxCard } from './InboxScene';

const INK = '#1c130a';
const PAD = 16;

function formatHours(hours: number): string {
  const total = Math.floor(hours * 60);
  return `${Math.floor(total / 60)}時間${String(total % 60).padStart(2, '0')}分`;
}

/** 放置報酬: coins and 素材 pile up while the player is away (up to a cap that the
 *  プレミアムパス raises) and are taken here. A watched ad moves the clock an hour
 *  ahead, a few times a day. */
export class IdleScene extends InboxScene {
  protected readonly screenTitle = '放置報酬';
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
    container.add(heading(this, PAD + 92, 36, 'たまった時間', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    container.add(body(this, PAD + 92, 80, formatHours(preview.hours), { fontSize: '40px', fontStyle: 'bold', color: preview.full ? '#ffd23f' : '#ffffff', stroke: INK, strokeThickness: 6 }).setOrigin(0, 0.5));
    container.add(caption(this, CARD_WIDTH - PAD, 36, `上限 ${preview.capHours}時間`, { fontSize: '21px', color: preview.full ? '#ffd23f' : '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));

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
      ? `プレミアムパス加入中（上限 ${PREMIUM.idleCapHours}時間）`
      : preview.full
        ? '上限までたまりました。受け取りましょう。'
        : `プレミアムパスで上限が ${IDLE_BASE_CAP_HOURS}→${PREMIUM.idleCapHours}時間に`;
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
    if (preview.equipment > 0) tiles.push({ kind: 'equipment', equip: { slot: 'weapon', rarity: 2, name: '装備' }, amount: `×${preview.equipment}` });

    const grid = buildRewardGrid(this, tiles, CARD_WIDTH - PAD * 2);
    const height = 70 + grid.height + 24;
    const container = this.add.container(0, 0);
    container.add(buildCardPanel(this, CARD_WIDTH, height));
    container.add(heading(this, PAD + 4, 34, 'いま受け取れる報酬', { fontSize: '26px', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
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

    const claim = new Button(this, CARD_WIDTH / 2, 62, CARD_WIDTH - PAD * 2, 88, '受け取る', () => this.claim(), { variant: 'gold', fontSize: '36px', guard });
    claim.setEnabled(preview.hours >= 1 / 60);
    container.add(claim);

    const canAd = left > 0 && !preview.full;
    const sub = preview.full ? '上限までたまっています' : left === 0 ? '今日の回数を使い切りました' : `今日あと ${left} / ${IDLE_AD_BOOSTS_PER_DAY} 回${gateway.isTest ? '（テスト広告）' : ''}`;
    const ad = new Button(this, CARD_WIDTH / 2, 160, CARD_WIDTH - PAD * 2, 84, `広告を見て ${IDLE_AD_BOOST_HOURS}時間進める`, () => this.watchAd(), { variant: 'wood', fontSize: '28px', subLabel: sub, guard });
    ad.setEnabled(canAd);
    container.add(ad);
    return { container, height };
  }

  private claim(): void {
    const result = IdleSystem.claim(this.save);
    SaveSystem.save(this.save);
    this.refreshResources();
    const p = result.preview;
    const tiles: RewardTile[] = [{ kind: 'gold', amount: `+${p.gold.toString()}` }];
    if (p.skillEssence > 0) tiles.push({ kind: 'essence', amount: `+${p.skillEssence.toLocaleString('ja-JP')}` });
    for (const { item, amount } of p.items) tiles.push({ kind: 'item', item, amount: `+${amount.toLocaleString('ja-JP')}` });
    if (p.phaseMaterials > 0) tiles.push({ kind: 'phaseMaterials', amount: `+${p.phaseMaterials}` });
    tiles.push(...tilesForEquipment(result.equipment));
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title: '放置報酬を受け取りました', tiles, onClose: () => this.queueRender() });
  }

  /** Plays a rewarded ad (whatever AdSystem is connected to); a watched one moves the clock ahead. */
  private watchAd(): void {
    if (this.watchingAd) return;
    this.watchingAd = true;
    // A dim layer with a note while the ad runs, which also keeps the screen from being tapped.
    this.modal?.close();
    const overlay = openModal(this, this.scroll, 0.85, false);
    overlay.container.add(heading(this, 360, 620, '広告を再生中…', { fontSize: '40px', color: '#ffe9b8', stroke: INK, strokeThickness: 6 }).setOrigin(0.5));
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
          showToast(this, outcome === 'ok' ? `${IDLE_AD_BOOST_HOURS}時間進みました` : '今は進められません');
        } else if (result === 'unavailable') {
          showToast(this, '広告を利用できません', '#ff8a8a');
        }
        this.queueRender();
      });
  }
}
