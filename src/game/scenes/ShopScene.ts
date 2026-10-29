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
import { openModal } from '../ui/Modal';
import { createPanel } from '../ui/Panel';
import { addGoodIcon, GOOD_COLOR, GOOD_LABEL } from '../ui/RewardIcon';
import { askBuyPremium, buildPremiumActionCard, buildPremiumBenefitsCard, buildPremiumPackCard, claimPremiumDaily } from '../ui/PremiumPanels';
import { CARD_WIDTH, SCREEN_VIEW } from '../ui/ScreenFrame';
import { buildTabStrip } from '../ui/TabStrip';
import { body, caption, heading, CHROME } from '../ui/theme';
import { showToast } from '../ui/Toast';
import { InboxScene, type InboxCard } from './InboxScene';

type ShopTab = 'gems' | 'items';

interface ShopSceneData {
  focus?: ShopFocus;
}

const PAD = 14;
const INK = '#1c130a';
const CARD_GAP = 12;
const GOOD_SLOT = 104;
const PRICE_W = 190;

const BLOCK_TEXT: Record<BlockReason, string> = {
  not_started: 'まだ販売前です',
  ended: '販売は終了しました',
  sold_out: '購入できる回数を超えています',
  stamina_full: 'スタミナはすでに満タンです',
};

/** Which tab and which section a top-bar + button lands on. */
const FOCUS_TAB: Record<ShopFocus, ShopTab> = { premium: 'gems', packs: 'gems', gems: 'gems', gold: 'gems', stamina: 'items', materials: 'items' };

const yen = (n: number): string => `¥${n.toLocaleString('ja-JP')}`;

/** A product's contents, one good per line: "魔晶石 ×300". */
/** How many of a good the player holds, as a line for its card. */
function heldLine(save: SaveData, type: GoodType): string {
  if (type === 'stamina') return `スタミナ ${save.stamina[0]} / ${save.stamina[1]}`;
  if (type === 'phaseMaterials') return `所持 ${save.phaseMaterials.toLocaleString('ja-JP')}個`;
  if (type === 'skillEssence') return `所持 ${save.skillEssence.toLocaleString('ja-JP')}`;
  if (isItemId(type)) return `所持 ${SaveSystem.getItem(save, type).toLocaleString('ja-JP')}個`;
  return '';
}

function goodLines(goods: Good[]): string[] {
  return goods.map((g) => `${GOOD_LABEL[g.type]} ×${g.amount.toLocaleString('ja-JP')}`);
}

function priceText(price: Price): string {
  if (price.currency === 'yen') return yen(price.amount);
  return `${price.currency === 'gems' ? '魔晶石' : 'ゴールド'} ${price.amount.toLocaleString('ja-JP')}`;
}

/** ショップ: two shops under one tab. The 魔晶石ショップ sells お得パック and
 *  魔晶石 for real money (パック may also cost 魔晶石) and ゴールド for 魔晶石;
 *  the アイテムショップ sells items for 魔晶石 or ゴールド. What is for sale is
 *  data/shop.ts; this scene only lays it out and runs the purchase.
 *
 *  Real-money purchases go through PaymentSystem, which has no real store behind
 *  it yet (see there): a dev build "pays" for free, a production build refuses. */
export class ShopScene extends InboxScene {
  protected readonly screenTitle = 'ショップ';
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
        { key: 'gems', label: '魔晶石ショップ' },
        { key: 'items', label: 'アイテムショップ' },
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
      add(this.sectionCard('プレミアムパス', PremiumSystem.isActive(this.save) ? `加入中（あと${PremiumSystem.daysLeft(this.save)}日）` : `月額 ${yen(PREMIUM.yen)}`), 'premium');
      add(buildPremiumBenefitsCard(this));
      add(buildPremiumPackCard(this));
      add(buildPremiumActionCard(this, this.save, { guard: () => this.scroll.isTap(), onBuy: () => this.buyPremium(), onClaimDaily: () => this.claimPremiumDaily() }));
      const packs = ShopSystem.visible(PACKS, now);
      if (packs.length > 0) {
        add(this.sectionCard('お得パック', '円・魔晶石で購入'), 'packs');
        for (const pack of packs) add(this.packCard(pack, now));
      }
      add(this.sectionCard('魔晶石', '価格は税込です'), 'gems');
      for (const product of ShopSystem.visible(GEM_PRODUCTS, now)) add(this.currencyCard(product));
      add(this.sectionCard('ゴールド', '魔晶石で購入できます'), 'gold');
      for (const product of ShopSystem.visible(GOLD_PRODUCTS, now)) add(this.currencyCard(product));
      add(this.legalCard());
    } else {
      const { stamina } = this.save;
      add(this.sectionCard('スタミナ回復', `スタミナ ${stamina[0]} / ${stamina[1]}`), 'stamina');
      for (const item of ShopSystem.visible(ITEM_PRODUCTS, now).filter((p) => p.category === 'stamina')) add(this.itemCard(item, now));
      add(this.sectionCard('育成素材', `フェーズ素材 ${this.save.phaseMaterials}個　技素 ${this.save.skillEssence.toLocaleString('ja-JP')}`), 'materials');
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
    if (!claimPremiumDaily(this, this.save)) return;
    this.refreshResources();
    this.queueRender();
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
      const chip = buildChip(this, tagX, cy + 22, `おまけ +${product.bonus.toLocaleString('ja-JP')}`, { fill: 0x9a4a12, color: '#ffe9b8', fontSize: 17 });
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
    card.container.add(caption(this, CARD_WIDTH / 2, 26, '表示価格はすべて消費税込みです。', { fontSize: '18px', color: '#cdbb94', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    const w = (CARD_WIDTH - PAD * 2 - 14) / 2;
    const guard = () => this.scroll.isTap();
    card.container.add(new Button(this, PAD + w / 2, 88, w, 60, '特定商取引法に基づく表記', () => this.openLegal('commerce'), { variant: 'wood', fontSize: '19px', guard }));
    card.container.add(new Button(this, CARD_WIDTH - PAD - w / 2, 88, w, 60, '資金決済法に基づく表示', () => this.openLegal('funds'), { variant: 'wood', fontSize: '19px', guard }));
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
      parts.push(left === null ? limit : `${limit}（残り${left}回）`);
      if (left === 0) color = '#ff9a7a';
    }
    const end = ShopSystem.endsAt(product);
    if (end !== null) {
      parts.push(`販売期間：${formatDateTime(end)}まで（${formatRemaining(end - now)}）`);
      if (end - now < 3 * 86_400_000) color = '#ffb07a';
    }
    return parts.length > 0 ? { text: parts.join('　'), color } : null;
  }

  // --- buying -----------------------------------------------------------

  /** The price as a button: ¥ / 魔晶石 / ゴールド amount, or why it can't be bought now. */
  private priceButton(x: number, y: number, product: ShopProduct, w: number, h: number): Button {
    const guard = () => this.scroll.isTap();
    const onTap = () => this.onBuy(product);
    const blocked = ShopSystem.blocked(this.save, product, Date.now());
    if (blocked) {
      const label = blocked === 'sold_out' ? '購入済み' : blocked === 'stamina_full' ? '満タン' : '販売外';
      return new Button(this, x, y, w, h, label, onTap, { variant: 'wood', fontSize: '24px', guard }).setEnabled(false);
    }
    const { price } = product;
    if (price.currency === 'yen') return new Button(this, x, y, w, h, yen(price.amount), onTap, { variant: 'gold', fontSize: '30px', subLabel: '税込', guard });
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
      showToast(this, BLOCK_TEXT[blocked], '#ff8a8a');
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
    const name = currency === 'gems' ? '魔晶石' : 'ゴールド';
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: `${name}が足りません`,
      message: `あと${name} ${Math.ceil(short).toLocaleString('ja-JP')} 必要です。\n${name}を購入しますか？`,
      confirmLabel: `${name}を購入`,
      confirmVariant: 'gold',
      onConfirm: () => this.openShop(currency),
    });
  }

  private confirm(product: ShopProduct): void {
    const gateway = PaymentSystem.getGateway();
    const lines = [product.name, ...goodLines(product.goods), '', `${priceText(product.price)}${product.price.currency === 'yen' ? '（税込）' : ''}で購入しますか？`];
    if (product.price.currency === 'yen' && gateway.isTest) lines.push('※開発版のテスト購入です。実際には課金されません。');
    this.modal?.close();
    this.modal = openConfirm(this, this.scroll, {
      title: '購入確認',
      message: lines.join('\n'),
      confirmLabel: '購入する',
      confirmVariant: 'gold',
      onConfirm: () => (product.price.currency === 'yen' ? this.pay(product) : this.buyWithCurrency(product)),
    });
  }

  private buyWithCurrency(product: ShopProduct): void {
    const result = ShopSystem.buyWithCurrency(this.save, product);
    if (!result.ok) {
      if (result.reason === 'gems' || result.reason === 'gold') this.offerTopUp(result.reason, ShopSystem.shortfall(this.save, product));
      else showToast(this, BLOCK_TEXT[result.reason], '#ff8a8a');
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
        if (result.status === 'unavailable') showToast(this, '決済は準備中のため、まだ購入できません', '#ff8a8a');
        else if (result.status === 'failed') showToast(this, '購入できませんでした。もう一度お試しください', '#ff8a8a');
      });
  }

  /** A single good is a toast; a bundle gets a receipt popup listing everything. */
  private announce(product: ShopProduct, goods: Good[]): void {
    if (goods.length === 1) {
      const good = goods[0];
      const verb = good.type === 'stamina' ? '回復しました' : '手に入れました';
      showToast(this, `${GOOD_LABEL[good.type]} ×${good.amount.toLocaleString('ja-JP')} を${verb}`);
      return;
    }
    this.modal?.close();
    const handle = openModal(this, this.scroll, 0.75, false);
    const modal = handle.container;
    const w = 580;
    const rowH = 78;
    const h = 250 + goods.length * rowH;
    const cy = 600;
    const top = cy - h / 2;
    modal.add(createPanel(this, 360, cy, w, h, { fillColor: CHROME.woodFill, fillAlpha: 1, borderColor: CHROME.brass, glowColor: CHROME.brassBright, radius: 16, rarity: 5, gradient: false }));
    modal.add(this.add.zone(360, cy, w, h).setInteractive());
    modal.add(heading(this, 360, top + 50, '購入完了', { fontSize: '32px', color: '#ffe9b8', stroke: INK, strokeThickness: 5 }).setOrigin(0.5));
    modal.add(caption(this, 360, top + 94, product.name, { fontSize: '20px', color: '#d8c49a', stroke: INK, strokeThickness: 3 }).setOrigin(0.5));
    goods.forEach((good, i) => {
      const y = top + 150 + i * rowH + rowH / 2;
      modal.add(addGoodIcon(this, good.type, 360 - w / 2 + 70, y, 56));
      modal.add(body(this, 360 - w / 2 + 120, y, GOOD_LABEL[good.type], { fontSize: '24px', color: '#fff4dc', stroke: INK, strokeThickness: 4 }).setOrigin(0, 0.5));
      modal.add(body(this, 360 + w / 2 - 50, y, `×${good.amount.toLocaleString('ja-JP')}`, { fontSize: '28px', fontStyle: 'bold', color: GOOD_COLOR[good.type], stroke: INK, strokeThickness: 5 }).setOrigin(1, 0.5));
    });
    modal.add(new Button(this, 360, top + h - 56, 240, 68, 'OK', () => handle.close(), { variant: 'gold', fontSize: '30px' }));
    this.modal = handle;
  }
}
