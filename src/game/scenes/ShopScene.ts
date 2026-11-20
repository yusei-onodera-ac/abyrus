import Phaser from 'phaser';
import { COMMERCE_NOTICE, FUNDS_NOTICE } from '../data/legal';
import { isItemId } from '../data/items';
import { GEM_PRODUCTS, GOLD_PRODUCTS, ITEM_PRODUCTS, PACKS, type Good, type GoodType, type Price, type ShopFocus, type ShopProduct } from '../data/shop';
import { PaymentSystem } from '../systems/PaymentSystem';
import { PREMIUM } from '../data/premium';
import { PremiumSystem } from '../systems/PremiumSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { describeLimit, ShopSystem, type BlockReason } from '../systems/ShopSystem';
import type { NavTab } from '../ui/BottomNavBar';
import { Button } from '../ui/Button';
import { buildCardPanel, buildChip, wrappedText } from '../ui/CardParts';
import { openConfirm } from '../ui/Dialogs';
import { openDocument } from '../ui/DocumentViewer';
import { formatDateTime, formatRemaining } from '../ui/format';
import { showRewardModal } from '../ui/RewardModal';
import { tilesForGoods } from '../ui/RewardTiles';
import { createPanel } from '../ui/Panel';
import { addGoodIcon, GOOD_COLOR, GOOD_LABEL } from '../ui/RewardIcon';
import { askBuyPremium, buildPremiumActionCard, buildPremiumBenefitsCard, buildPremiumPackCard, claimPremiumDaily } from '../ui/PremiumPanels';
import { CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { buildTabStrip } from '../ui/TabStrip';
import { body, caption, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';
import { t, type PlainKey } from '../i18n';

type ShopTab = 'gems' | 'items';

interface ShopSceneData {
  focus?: ShopFocus;
}

const PAD = 14;
const INK = '#1c130a';
const CARD_GAP = 12;
const GOOD_SLOT = 104;
const PRICE_W = 190;

const BLOCK_TEXT: Record<BlockReason, PlainKey> = {
  not_started: 'shop.blocked.notStarted',
  ended: 'shop.blocked.ended',
  sold_out: 'shop.blocked.soldOut',
  stamina_full: 'shop.blocked.staminaFull',
};

/** Which tab and which section a top-bar + button lands on. */
const FOCUS_TAB: Record<ShopFocus, ShopTab> = { premium: 'gems', packs: 'gems', gems: 'gems', gold: 'gems', stamina: 'items', materials: 'items' };

const yen = (n: number): string => `¥${n.toLocaleString('ja-JP')}`;

/** A product's contents, one good per line: "魔晶石 ×300". */
/** How many of a good the player holds, as a line for its card. */
function heldLine(save: SaveData, type: GoodType): string {
  if (type === 'stamina') return t('shop.staminaNow', { stamina: save.stamina[0], stamina2: save.stamina[1] });
  if (type === 'phaseMaterials') return t('shop.held.phaseMaterials', { phaseMaterials: save.phaseMaterials.toLocaleString('ja-JP') });
  if (type === 'skillEssence') return t('shop.held.skillEssence', { skillEssence: save.skillEssence.toLocaleString('ja-JP') });
  if (isItemId(type)) return t('shop.held.item', { getItem: SaveSystem.getItem(save, type).toLocaleString('ja-JP') });
  return '';
}

function goodLines(goods: Good[]): string[] {
  return goods.map((g) => `${GOOD_LABEL[g.type]} ×${g.amount.toLocaleString('ja-JP')}`);
}

function priceText(price: Price): string {
  if (price.currency === 'yen') return yen(price.amount);
  return t(price.currency === 'gems' ? 'shop.price.gems' : 'shop.price.gold', { amount: price.amount.toLocaleString('ja-JP') });
}

/** ショップ: two shops under one tab. The 魔晶石ショップ sells お得パック and
 *  魔晶石 for real money (パック may also cost 魔晶石) and ゴールド for 魔晶石;
 *  the アイテムショップ sells items for 魔晶石 or ゴールド. What is for sale is
 *  data/shop.ts; this scene only lays it out and runs the purchase.
 *
 *  Real-money purchases go through PaymentSystem, which has no real store behind
 *  it yet (see there): a dev build "pays" for free, a production build refuses. */
export class ShopScene extends InboxScene {
  protected get screenTitle(): string {
    return t('shop.title');
  }
  protected emptyText = '';
  protected readonly navTab: NavTab = 'shop';
  protected readonly toolbarHeight = 76;

  private tab: ShopTab = 'gems';
  /** A section to scroll to once the list is built. */
  private pendingFocus?: ShopFocus;
  /** Section key -> its top edge in the list, filled in by buildCards(). */
  private sectionTops: Partial<Record<ShopFocus, number>> = {};
  /** True while a real-money payment is open, so a second tap can't start another. */
  private paying = false;

  constructor() {
    super('Shop');
  }

  init(data?: ShopSceneData): void {
    super.init();
    this.pendingFocus = data?.focus;
    this.tab = data?.focus ? FOCUS_TAB[data.focus] : 'gems';
    this.sectionTops = {};
    this.paying = false;
  }

  /** The top bar's + buttons, while already in the shop: jump instead of reloading. */
  protected openShop(focus: ShopFocus): void {
    this.modal?.close();
    this.modal = undefined;
    this.tab = FOCUS_TAB[focus];
    this.pendingFocus = focus;
    this.queueRender();
  }

  protected buildToolbar(toolbar: Phaser.GameObjects.Container): void {
    const strip = buildTabStrip(
      this,
      [
        { key: 'gems', label: t('shop.tab.gems') },
        { key: 'items', label: t('shop.tab.items') },
      ],
      this.tab,
      SCREEN_VIEW.w,
      56,
      (key) => {
        this.tab = key as ShopTab;
        this.pendingFocus = undefined;
        this.scroll.scrollTo(0);
        this.queueRender();
      },
    );
    strip.setPosition(0, 10);
    toolbar.add(strip);
  }

  protected render(firstTime = false): void {
    super.render(firstTime);
    const focus = this.pendingFocus;
    this.pendingFocus = undefined;
    const top = focus ? this.sectionTops[focus] : undefined;
    // 'packs' is the head of the list; the rest sit lower.
    if (top !== undefined) this.scroll.scrollTo(top - 6);
  }

  protected buildCards(): InboxCard[] {
    const now = Date.now();
    const cards: InboxCard[] = [];
    this.sectionTops = {};
    const left = (SCREEN_VIEW.w - CARD_WIDTH) / 2;
    let y = left;
    const add = (card: InboxCard, section?: ShopFocus): void => {
      if (section) this.sectionTops[section] = y;
      cards.push(card);
      y += card.height + CARD_GAP;
    };

    if (this.tab === 'gems') {
      add(this.sectionCard(t('shop.premiumPass'), PremiumSystem.isActive(this.save) ? t('shop.section.premiumActive', { daysLeft: PremiumSystem.daysLeft(this.save) }) : t('shop.section.premiumMonthly', { yen: yen(PREMIUM.yen) })), 'premium');
      add(buildPremiumBenefitsCard(this));
      add(buildPremiumPackCard(this));
      add(buildPremiumActionCard(this, this.save, { guard: () => this.scroll.isTap(), onBuy: () => this.buyPremium(), onClaimDaily: () => this.claimPremiumDaily() }));
      const packs = ShopSystem.visible(PACKS, now);
      if (packs.length > 0) {
        add(this.sectionCard(t('shop.section.packs'), t('shop.section.packsNote')), 'packs');
        for (const pack of packs) add(this.packCard(pack, now));
      }
      add(this.sectionCard(t('shop.gems'), t('shop.section.gemsNote')), 'gems');
      for (const product of ShopSystem.visible(GEM_PRODUCTS, now)) add(this.currencyCard(product));
      add(this.sectionCard(t('shop.gold'), t('shop.section.goldNote')), 'gold');
      for (const product of ShopSystem.visible(GOLD_PRODUCTS, now)) add(this.currencyCard(product));
      add(this.legalCard());
    } else {
      const { stamina } = this.save;
      add(this.sectionCard(t('shop.section.stamina'), t('shop.staminaNow', { stamina: stamina[0], stamina2: stamina[1] })), 'stamina');
      for (const item of ShopSystem.visible(ITEM_PRODUCTS, now).filter((p) => p.category === 'stamina')) add(this.itemCard(item, now));
      add(this.sectionCard(t('shop.section.materials'), t('shop.section.materialsNote', { phaseMaterials: this.save.phaseMaterials, skillEssence: this.save.skillEssence.toLocaleString('ja-JP') })), 'materials');
      for (const item of ShopSystem.visible(ITEM_PRODUCTS, now).filter((p) => p.category === 'material')) add(this.itemCard(item, now));
    }
    return cards;
  }

  // --- cards ------------------------------------------------------------

  private buyPremium(): void {
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

  private claimPremiumDaily(): void {
    this.modal?.close();
    const handle = claimPremiumDaily(this, this.scroll, this.save, () => this.queueRender());
    if (!handle) return;
    this.modal = handle;
    this.refreshResources();
  }

  private shell(height: number, highlight = false): InboxCard {
    const container = this.add.container(0, 0);
    container.addAt(buildCardPanel(this, CARD_WIDTH, height, highlight), 0);
    return { container, height };
  }

  private sectionCard(title: string, note: string): InboxCard {
    const card = this.shell(54);
    card.container.add(body(this, PAD + 6, 27, title, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
    card.container.add(caption(this, CARD_WIDTH - PAD - 6, 27, note, { fontSize: '19px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(1, 0.5));
    return card;
  }

  /** A pack: badge + name, what it holds, the price button, and how often / how long it's sold. */
  private packCard(product: ShopProduct, now: number): InboxCard {
    const container = this.add.container(0, 0);
    let y = PAD;
    let nameX = PAD + 4;
    if (product.badge) {
      const chip = buildChip(this, PAD + 4, y + 18, product.badge, { fill: 0xb3262e, color: '#ffffff', fontSize: 17 });
      container.add(chip.container);
      nameX += chip.width + 10;
    }
    container.add(body(this, nameX, y + 18, product.name, { fontSize: '28px', fontStyle: 'bold', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5));
    y += 44;

    if (product.description) {
      const text = wrappedText(this, PAD + 4, y, product.description, CARD_WIDTH - PAD * 2 - 8, { fontSize: '18px', color: '#d8c49a' });
      container.add(text);
      y += text.height + 8;
    }

    const rowH = 96;
    product.goods.forEach((good, i) => {
      const cx = PAD + 4 + i * GOOD_SLOT + GOOD_SLOT / 2 - 8;
      container.add(this.goodSlot(good, cx, y));
    });
    container.add(this.priceButton(CARD_WIDTH - PAD - PRICE_W / 2, y + rowH / 2, product, PRICE_W, 72));
    y += rowH + 4;

    const note = this.limitLine(product, now);
    if (note) {
      container.add(caption(this, PAD + 4, y + 11, note.text, { fontSize: '17px', color: note.color, stroke: INK, strokeThickness: 3 }).setOrigin(0, 0.5));
      y += 28;
    }
    const height = y + PAD;
    container.addAt(buildCardPanel(this, CARD_WIDTH, height, !!product.badge), 0);
    return { container, height };
  }

  /** A good drawn as icon, amount and name, the slot's centre at x. */
  private goodSlot(good: Good, cx: number, top: number): Phaser.GameObjects.Container {
    const slot = this.add.container(cx, top);
    slot.add(addGoodIcon(this, good.type, 0, 28, 52));
    slot.add(body(this, 0, 64, `×${good.amount.toLocaleString('ja-JP')}`, { fontSize: '21px', fontStyle: 'bold', color: GOOD_COLOR[good.type], stroke: INK, strokeThickness: 4 }).setOrigin(0.5));
    slot.add(caption(this, 0, 86, GOOD_LABEL[good.type], { fontSize: '14px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    return slot;
  }

  /** A 魔晶石 / ゴールド product: big icon, amount, おまけ tag, price button. */
  private currencyCard(product: ShopProduct): InboxCard {
    const height = 124;
    const container = this.add.container(0, 0);
    const good = product.goods[0];
    const cy = height / 2;
    container.add(createPanel(this, PAD + 42, cy, 84, 84, { fillColor: 0x150e07, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
    container.add(addGoodIcon(this, good.type, PAD + 42, cy, 62));

    const textX = PAD + 84 + 18;
    container.add(
      body(this, textX, cy - 18, `${product.name} ×${good.amount.toLocaleString('ja-JP')}`, { fontSize: '29px', fontStyle: 'bold', color: GOOD_COLOR[good.type], stroke: INK, strokeThickness: 5 }).setOrigin(0, 0.5),
    );
    let tagX = textX;
    if (product.bonus) {
      const chip = buildChip(this, tagX, cy + 22, t('shop.bonus', { bonus: product.bonus.toLocaleString('ja-JP') }), { fill: 0x9a4a12, color: '#ffe9b8', fontSize: 17 });
      container.add(chip.container);
      tagX += chip.width + 8;
    }
    if (product.badge) container.add(buildChip(this, tagX, cy + 22, product.badge, { fill: 0xb3262e, color: '#ffffff', fontSize: 17 }).container);

    container.add(this.priceButton(CARD_WIDTH - PAD - PRICE_W / 2, cy, product, PRICE_W, 72));
    container.addAt(buildCardPanel(this, CARD_WIDTH, height), 0);
    return { container, height };
  }

  /** An item: icon, name, what it does, how many you hold, price button. */
  private itemCard(product: ShopProduct, now: number): InboxCard {
    const container = this.add.container(0, 0);
    const good = product.goods[0];
    const slot = 92;
    container.add(createPanel(this, PAD + slot / 2, PAD + slot / 2, slot, slot, { fillColor: 0x150e07, borderColor: CHROME.brass, glowColor: CHROME.brassDark, radius: 12, gradient: false }));
    container.add(addGoodIcon(this, good.type, PAD + slot / 2, PAD + slot / 2, 66));

    const textX = PAD + slot + 16;
    const textW = CARD_WIDTH - textX - PRICE_W - PAD - 10;
    let y = PAD;
    const place = (text: Phaser.GameObjects.Text, gap: number): void => {
      container.add(text);
      y += text.height + gap;
    };
    place(wrappedText(this, textX, y, product.name, textW, { fontSize: '25px', fontStyle: 'bold', color: '#ffe9b8', strokeThickness: 4 }), 4);
    if (product.description) place(wrappedText(this, textX, y, product.description, textW, { fontSize: '18px', color: '#d8c49a' }), 6);
    place(wrappedText(this, textX, y, heldLine(this.save, good.type), textW, { fontSize: '18px', fontStyle: 'bold', color: GOOD_COLOR[good.type] }), 4);
    const note = this.limitLine(product, now);
    if (note) place(wrappedText(this, textX, y, note.text, textW, { fontSize: '16px', color: note.color }), 0);

    const height = Math.max(PAD * 2 + slot, y + PAD);
    container.add(this.priceButton(CARD_WIDTH - PAD - PRICE_W / 2, height / 2, product, PRICE_W, 72));
    container.addAt(buildCardPanel(this, CARD_WIDTH, height), 0);
    return { container, height };
  }

  /** Links to the legal notices a shop has to show, and the tax note. */
  private legalCard(): InboxCard {
    const height = 138;
    const card = this.shell(height);
    card.container.add(caption(this, CARD_WIDTH / 2, 26, t('shop.taxNote'), { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    const w = (CARD_WIDTH - PAD * 2 - 14) / 2;
    const guard = () => this.scroll.isTap();
    card.container.add(new Button(this, PAD + w / 2, 88, w, 60, t('shop.legal.commerce'), () => this.openLegal('commerce'), { variant: 'wood', fontSize: '19px', guard }));
    card.container.add(new Button(this, CARD_WIDTH - PAD - w / 2, 88, w, 60, t('shop.legal.funds'), () => this.openLegal('funds'), { variant: 'wood', fontSize: '19px', guard }));
    return card;
  }

  private openLegal(which: 'commerce' | 'funds'): void {
    this.modal?.close();
    this.modal = openDocument(this, this.scroll, which === 'commerce' ? COMMERCE_NOTICE : FUNDS_NOTICE);
  }

  /** "週に1回まで（残り1回）" and the sale deadline, with a colour for how urgent it is. */
  private limitLine(product: ShopProduct, now: number): { text: string; color: string } | null {
    const parts: string[] = [];
    let color = '#d8c49a';
    const limit = describeLimit(product);
    if (limit) {
      const left = ShopSystem.remaining(this.save, product, now);
      parts.push(left === null ? limit : t('shop.limit.withLeft', { limit, left }));
      if (left === 0) color = '#ff9a7a';
    }
    const end = ShopSystem.endsAt(product);
    if (end !== null) {
      parts.push(t('shop.limit.saleEnds', { formatDateTime: formatDateTime(end), formatRemaining: formatRemaining(end - now) }));
      if (end - now < 3 * 86_400_000) color = '#ffb07a';
    }
    return parts.length > 0 ? { text: parts.join('　'), color } : null; // i18n-ignore (a separator)
  }

  // --- buying -----------------------------------------------------------

  /** The price as a button: ¥ / 魔晶石 / ゴールド amount, or why it can't be bought now. */
  private priceButton(x: number, y: number, product: ShopProduct, w: number, h: number): Button {
    const guard = () => this.scroll.isTap();
    const onTap = () => this.onBuy(product);
    const blocked = ShopSystem.blocked(this.save, product, Date.now());
    if (blocked) {
      const label = blocked === 'sold_out' ? t('shop.button.soldOut') : blocked === 'stamina_full' ? t('shop.button.full') : t('shop.button.unavailable');
      return new Button(this, x, y, w, h, label, onTap, { variant: 'wood', fontSize: '24px', guard }).setEnabled(false);
    }
    const { price } = product;
    if (price.currency === 'yen') return new Button(this, x, y, w, h, yen(price.amount), onTap, { variant: 'gold', fontSize: '30px', subLabel: t('shop.taxIncluded'), guard });
    // 魔晶石 / ゴールド: the currency's own icon in front of the amount.
    const button = new Button(this, x, y, w, h, '', onTap, { variant: 'gold', guard });
    const icon = addGoodIcon(this, price.currency, 0, 0, 40);
    const amount = this.add
      .text(0, 0, price.amount.toLocaleString('ja-JP'), { fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: '#4a2406', strokeThickness: 5 })
      .setOrigin(0, 0.5);
    const total = 40 + 8 + amount.width;
    icon.setX(-total / 2 + 20);
    amount.setX(-total / 2 + 48);
    button.add([icon, amount]);
    return button;
  }

  private onBuy(product: ShopProduct): void {
    if (this.paying) return;
    const blocked = ShopSystem.blocked(this.save, product, Date.now());
    if (blocked) {
      showToast(this, t(BLOCK_TEXT[blocked]), '#ff8a8a');
      return;
    }
    const { currency } = product.price;
    if (currency !== 'yen') {
      const short = ShopSystem.shortfall(this.save, product);
      if (short > 0) {
        this.offerTopUp(currency, short);
        return;
      }
    }
    // Spending ゴールド is cheap and common: no confirmation. Everything else asks.
    if (currency === 'gold') this.buyWithCurrency(product);
    else this.confirm(product);
  }

  /** Not enough 魔晶石 / ゴールド: offer to go and buy some. */
  private offerTopUp(currency: 'gems' | 'gold', short: number): void {
    const gems = currency === 'gems';
    const amount = Math.ceil(short).toLocaleString('ja-JP');
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: gems ? t('shop.topUp.notEnoughGems') : t('shop.topUp.notEnoughGold'),
      message: gems ? t('shop.topUp.needMoreGems', { short: amount }) : t('shop.topUp.needMoreGold', { short: amount }),
      confirmLabel: gems ? t('shop.topUp.buyGems') : t('shop.topUp.buyGold'),
      confirmVariant: 'gold',
      onConfirm: () => this.openShop(currency),
    });
  }

  private confirm(product: ShopProduct): void {
    const gateway = PaymentSystem.getGateway();
    const lines = [product.name, ...goodLines(product.goods), '', t(product.price.currency === 'yen' ? 'shop.confirm.buyYen' : 'shop.confirm.buy', { price: priceText(product.price) })];
    if (product.price.currency === 'yen' && gateway.isTest) lines.push(t('shop.confirm.devNote'));
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: t('shop.confirm.title'),
      message: lines.join('\n'),
      confirmLabel: t('shop.buy'),
      confirmVariant: 'gold',
      onConfirm: () => (product.price.currency === 'yen' ? this.pay(product) : this.buyWithCurrency(product)),
    });
  }

  private buyWithCurrency(product: ShopProduct): void {
    const result = ShopSystem.buyWithCurrency(this.save, product);
    if (!result.ok) {
      if (result.reason === 'gems' || result.reason === 'gold') this.offerTopUp(result.reason, ShopSystem.shortfall(this.save, product));
      else showToast(this, t(BLOCK_TEXT[result.reason]), '#ff8a8a');
      return;
    }
    SaveSystem.save(this.save);
    this.refreshResources();
    this.announce(product, result.goods);
    this.queueRender();
  }

  /** Real-money purchase: the goods are handed over only once the gateway says
   *  the money was taken - and then even if the player has left this screen. */
  private pay(product: ShopProduct): void {
    this.paying = true;
    void PaymentSystem.getGateway()
      .purchase({ productId: product.id, name: product.name, yen: product.price.amount })
      .catch((): { status: 'failed' } => ({ status: 'failed' }))
      .then((result) => {
        this.paying = false;
        if (result.status === 'paid') {
          const goods = ShopSystem.completePaid(this.save, product);
          SaveSystem.save(this.save);
          if (!this.scene.isActive()) return;
          this.refreshResources();
          this.announce(product, goods);
          this.queueRender();
          return;
        }
        if (!this.scene.isActive()) return;
        if (result.status === 'unavailable') showToast(this, t('shop.toast.paymentNotReady'), '#ff8a8a');
        else if (result.status === 'failed') showToast(this, t('shop.toast.purchaseFailed'), '#ff8a8a');
      });
  }

  /** What a purchase handed over, shown as a popup with a 確認 button. */
  private announce(product: ShopProduct, goods: Good[]): void {
    this.modal?.close();
    this.modal = showRewardModal(this, this.scroll, { title: t('shop.purchaseComplete'), note: product.name, tiles: tilesForGoods(goods) });
  }
}
