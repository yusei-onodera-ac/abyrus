// ショップ・プレミアムの値を Firestore (管理画面が書く) から読む: RemoteShopConfig.
// ネットワークには触らない。読んだ中身 (RemoteShopData) を自分で作って、検めて、入れ替えるところを調べる。
import { GEM_PRODUCTS, GOLD_PRODUCTS, ITEM_PRODUCTS, PACKS } from '../../src/game/data/shop';
import { PREMIUM, PREMIUM_JOIN_PACK } from '../../src/game/data/premium';
import { RemoteShopConfig, applyRemoteShop, parsePremiumConfig, parseShopProduct, resetRemoteShop, type RemoteShopData } from '../../src/game/systems/RemoteShopConfig';
import { ShopSystem } from '../../src/game/systems/ShopSystem';
import { PremiumSystem } from '../../src/game/systems/PremiumSystem';
import { SaveSystem } from '../../src/game/systems/SaveSystem';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const staticPacks = PACKS.map((p) => p.id);
const staticPremium = { ...PREMIUM };
const staticJoin = JSON.stringify(PREMIUM_JOIN_PACK);
const staticGems = GEM_PRODUCTS.map((p) => p.id);

const good = { name: 'テストパック', description: 'せつめい', group: 'pack', priceCurrency: 'yen', priceAmount: 600, goods: [{ type: 'gems', amount: 100 }, { type: 'exp_m', amount: 2 }] };

// ---- one product
{
  const r = parseShopProduct('pack-x', { ...good, bonus: 20, limitPeriod: 'week', limitCount: 2, badge: 'NEW', startsAt: '2026-12-01T00:00:00+09:00', endsAt: '2026-12-31T23:59:59+09:00' });
  ok(!!r && r.group === 'pack' && r.product.id === 'pack-x', 'a valid document becomes a product in its group');
  ok(!!r && r.product.price.currency === 'yen' && r.product.price.amount === 600 && r.product.goods.length === 2 && r.product.goods[1].type === 'exp_m', 'the price and the goods are carried over (素材 by item id too)');
  ok(!!r && r.product.bonus === 20 && r.product.limit?.period === 'week' && r.product.limit.count === 2 && r.product.badge === 'NEW', 'bonus, the purchase limit and the badge are carried over');
  ok(!!r && r.product.startsAt === '2026-12-01T00:00:00+09:00' && r.product.endsAt === '2026-12-31T23:59:59+09:00', 'the sale window is carried over');
  const minimal = parseShopProduct('gems-1', { name: '魔晶石', group: 'gems', priceCurrency: 'yen', priceAmount: 160, goods: [{ type: 'gems', amount: 50 }] });
  ok(!!minimal && minimal.product.limit === undefined && minimal.product.badge === undefined && minimal.product.description === undefined, 'the optional fields can be left out');
  const periodOnly = parseShopProduct('p', { ...good, limitPeriod: 'day' });
  ok(periodOnly?.product.limit?.count === 1, 'a limit with a period and no count is once per period');
  const item = parseShopProduct('i', { name: '薬', group: 'item', priceCurrency: 'gold', priceAmount: 1000, goods: [{ type: 'stamina', amount: 10 }], category: 'stamina' });
  ok(item?.product.category === 'stamina' && parseShopProduct('i2', { name: '薬', group: 'item', priceCurrency: 'gold', priceAmount: 1000, goods: [{ type: 'stamina', amount: 10 }] })?.product.category === 'material', 'an item product keeps its section (and falls back to material)');
  const ts = parseShopProduct('t', { ...good, endsAt: { toDate: () => new Date('2027-01-01T00:00:00Z') }, startsAt: { seconds: 1_800_000_000, nanoseconds: 0 } });
  ok(ts?.product.endsAt === '2027-01-01T00:00:00.000Z' && Number.isFinite(Date.parse(ts?.product.startsAt ?? '')), 'a Firestore Timestamp works as a date');

  const bad: [string, unknown][] = [
    ['not an object', 'text'],
    ['null', null],
    ['no name', { ...good, name: '' }],
    ['unknown group', { ...good, group: 'weapon' }],
    ['unknown currency', { ...good, priceCurrency: 'usd' }],
    ['price 0', { ...good, priceAmount: 0 }],
    ['price negative', { ...good, priceAmount: -5 }],
    ['price a fraction', { ...good, priceAmount: 99.5 }],
    ['price a string', { ...good, priceAmount: '600' }],
    ['yen price absurd', { ...good, priceAmount: 99_000_000 }],
    ['no goods', { ...good, goods: [] }],
    ['goods not a list', { ...good, goods: { type: 'gems', amount: 1 } }],
    ['unknown good', { ...good, goods: [{ type: 'diamonds', amount: 5 }] }],
    ['one unknown good among valid ones', { ...good, goods: [{ type: 'gems', amount: 5 }, { type: 'secret', amount: 1 }] }],
    ['good amount 0', { ...good, goods: [{ type: 'gems', amount: 0 }] }],
    ['good amount a fraction', { ...good, goods: [{ type: 'gems', amount: 1.5 }] }],
    ['unknown limit period', { ...good, limitPeriod: 'year' }],
    ['limit count 0', { ...good, limitPeriod: 'day', limitCount: 0 }],
    ['bonus negative', { ...good, bonus: -1 }],
    ['not a date', { ...good, endsAt: 'someday' }],
    ['name not a string', { ...good, name: 42 }],
  ];
  for (const [label, doc] of bad) ok(parseShopProduct('x', doc) === null, `dropped: ${label}`);
  ok(parseShopProduct('', good) === null, 'dropped: no document id');
}

// ---- the premium pass
{
  const full = parsePremiumConfig({ yen: 1800, durationDays: 31, dailyGems: 40, battleSpeed: 2, idleCapHours: 30, joinPack: [{ type: 'gems', amount: 80 }, { type: 'item', item: 'exp_l', amount: 2 }, { type: 'equipment', rarity: 4, amount: 1 }] });
  ok(full.yen === 1800 && full.durationDays === 31 && full.dailyGems === 40 && full.battleSpeed === 2 && full.idleCapHours === 30 && full.joinPack?.length === 3, 'a valid config/premium is read whole');
  const part = parsePremiumConfig({ yen: '1800', durationDays: 0, dailyGems: -3, battleSpeed: 9, idleCapHours: 1.5, joinPack: 'nope' });
  ok(Object.keys(part).length === 0, 'every invalid field is dropped on its own');
  const mixed = parsePremiumConfig({ yen: 2000, dailyGems: 'many', joinPack: [{ type: 'gems', amount: 1 }, { type: 'item', item: 'nonsense', amount: 1 }, { type: 'equipment', rarity: 9, amount: 1 }, { type: 'gold', amount: 0 }] });
  ok(mixed.yen === 2000 && mixed.dailyGems === undefined && mixed.joinPack?.length === 1, 'valid fields stay, and only the valid rewards of the join pack');
  ok(parsePremiumConfig({ joinPack: [] }).joinPack === undefined, 'an empty join pack is not taken (the static one stays)');
  ok(Object.keys(parsePremiumConfig(null)).length === 0 && Object.keys(parsePremiumConfig([1, 2])).length === 0, 'not an object: nothing is taken');
}

// ---- putting it in
{
  const data: RemoteShopData = {
    products: [
      { id: 'pack-weekly', data: { ...good, name: 'ウィークリー(新)', priceAmount: 1100, limitPeriod: 'week', limitCount: 1 } },
      { id: 'pack-starter', data: { ...good, name: '初心者(新)', priceAmount: 300 } },
      { id: 'pack-zzz', data: { ...good, name: '新しいパック' } },
      { id: 'pack-aaa', data: { ...good, name: 'もうひとつ新しい' } },
      { id: 'gold-1000', data: { name: 'ゴールド', group: 'gold', priceCurrency: 'gems', priceAmount: 77, goods: [{ type: 'gold', amount: 1000 }] } },
      { id: 'broken', data: { ...good, priceAmount: -1 } },
      { id: 'also-broken', data: 'x' },
    ],
    premium: { yen: 1800, dailyGems: 45, joinPack: [{ type: 'gems', amount: 99 }] },
  };
  const arrayRef = PACKS;
  const result = applyRemoteShop(data);
  ok(result.status === 'ok' && result.products === 5 && result.dropped === 2, `5 products used, 2 invalid ones dropped (${result.products}/${result.dropped})`);
  ok(PACKS === arrayRef, 'the same array is filled in place (every screen reads it by that name)');
  ok(PACKS.map((p) => p.id).join() === ['pack-starter', 'pack-weekly', 'pack-aaa', 'pack-zzz'].join(), `known products keep the static order, new ones follow by id (${PACKS.map((p) => p.id).join(',')})`);
  ok(PACKS.find((p) => p.id === 'pack-weekly')!.price.amount === 1100 && PACKS.find((p) => p.id === 'pack-starter')!.name === '初心者(新)', 'the server\'s name and price are used');
  ok(GEM_PRODUCTS.map((p) => p.id).join() === staticGems.join() && ITEM_PRODUCTS.length > 1 && GOLD_PRODUCTS.length === 1, 'a group with no valid product on the server keeps the static data (gold had one: it is that one)');
  ok(PREMIUM.yen === 1800 && PREMIUM.dailyGems === 45 && PREMIUM.durationDays === staticPremium.durationDays && PREMIUM.idleCapHours === staticPremium.idleCapHours, 'the premium fields that came are replaced, the others stay');
  ok(PREMIUM_JOIN_PACK.length === 1 && PREMIUM_JOIN_PACK[0].amount === 99, 'the join pack is replaced');
  ok(result.premium.sort().join() === ['dailyGems', 'joinPack', 'yen'].join(), `the result says which premium fields were taken (${result.premium.join(',')})`);

  // what the existing systems do with it: nothing changed in them
  const save = SaveSystem.createDefault();
  save.gems = 5000;
  const weekly = PACKS.find((p) => p.id === 'pack-weekly')!;
  ok(ShopSystem.visible(PACKS, Date.now()).some((p) => p.id === 'pack-weekly'), 'ShopSystem lists the server\'s product');
  const gold = GOLD_PRODUCTS[0];
  const before = save.gems;
  const bought = ShopSystem.buyWithCurrency(save, gold, Date.now());
  ok(bought.ok && save.gems === before - 77, 'buying a server product charges the price from the server (77 魔晶石) under the unchanged rules');
  ok(weekly.limit?.period === 'week', 'purchase limits come with the product');
  save.premium.expiresAt = 0;
  PremiumSystem.activate(save, Date.now());
  ok(save.gems >= 99 && PremiumSystem.isActive(save), 'PremiumSystem uses the join pack and the config it reads live');
  ok(PremiumSystem.claimDaily(save, Date.now()) === 45, 'and the daily gems of the server (45)');

  // applying again starts from the static data: what is gone from the server comes back as the static one
  applyRemoteShop({ products: [{ id: 'pack-zzz', data: { ...good, name: 'ひとつだけ' } }], premium: null });
  ok(PACKS.map((p) => p.id).join() === ['pack-zzz'].join(), 'the second read replaces the first (a group with one product is that one product)');
  ok(PREMIUM.yen === staticPremium.yen && PREMIUM.dailyGems === staticPremium.dailyGems && JSON.stringify(PREMIUM_JOIN_PACK) === staticJoin, 'premium goes back to the static values when the server has none');
  applyRemoteShop({ products: [], premium: null });
  ok(PACKS.map((p) => p.id).join() === staticPacks.join(), 'nothing on the server: the static data');
  applyRemoteShop(data);
  resetRemoteShop();
  ok(PACKS.map((p) => p.id).join() === staticPacks.join() && PREMIUM.yen === staticPremium.yen && PREMIUM_JOIN_PACK.length === JSON.parse(staticJoin).length, 'reset goes back to the static data');
}

// ---- reading: never throws, never needs Firebase
{
  RemoteShopConfig.forget();
  const none = await RemoteShopConfig.refresh();
  ok(none.status === 'not_configured' && !RemoteShopConfig.isConfigured(), 'without Firebase settings: not_configured at once (no network, no SDK)');
  ok(PACKS.map((p) => p.id).join() === staticPacks.join(), 'and the static data stays');

  RemoteShopConfig.forget();
  const good1 = await RemoteShopConfig.refresh(async () => ({ products: [{ id: 'pack-weekly', data: { ...good, priceAmount: 1234 } }], premium: { yen: 1700 } }));
  ok(good1.status === 'ok' && PACKS.find((p) => p.id === 'pack-weekly')!.price.amount === 1234 && PREMIUM.yen === 1700, 'a fetch that works is applied');
  const again = await RemoteShopConfig.refresh(async () => ({ products: [{ id: 'pack-weekly', data: { ...good, priceAmount: 1 } }], premium: null }));
  ok(again === good1 && PACKS.find((p) => p.id === 'pack-weekly')!.price.amount === 1234, 'it is read once: later calls get the same answer and change nothing');

  RemoteShopConfig.forget();
  const failed = await RemoteShopConfig.refresh(async () => {
    throw new Error('offline');
  });
  ok(failed.status === 'unavailable' && PACKS.map((p) => p.id).join() === staticPacks.join() && PREMIUM.yen === staticPremium.yen, 'a failed fetch (offline, rules) is silent: unavailable, the static data');

  RemoteShopConfig.forget();
  const garbage = await RemoteShopConfig.refresh(async () => ({ products: [{ id: 'a', data: 12 }, { id: 'b', data: null }, { id: 'c', data: [] }], premium: 'x' }) as unknown as RemoteShopData);
  ok(garbage.status === 'ok' && garbage.products === 0 && garbage.dropped === 3 && PACKS.map((p) => p.id).join() === staticPacks.join(), 'garbage in the documents is dropped without a throw');

  RemoteShopConfig.forget();
  const broken = await RemoteShopConfig.refresh((async () => ({ products: 'not a list', premium: null })) as unknown as () => Promise<RemoteShopData>);
  ok(broken.status === 'unavailable' && PACKS.map((p) => p.id).join() === staticPacks.join(), 'a read that is not even the right shape is unavailable, not an exception');
  RemoteShopConfig.forget();
}

if (failures) process.exit(1);
