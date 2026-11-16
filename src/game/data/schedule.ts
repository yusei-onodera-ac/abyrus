import type { Rarity } from '../types';
import type { CampaignDef, CampaignKind } from './campaigns';
import type { GachaBannerEntry } from './gachaBanners';
import { getHeroDefinition } from './heroes';
import { makeEvent, type LimitedEventDef } from './limitedEvents';

/**
 * 年間スケジュール: the year of 期間限定イベント, ピックアップガチャ and ブーストキャンペーン, from 2026-11-16 to 2027-11-15, in the order they
 * happen. This is the file to edit to change the plan: the Event tab, the Gacha tab, the Home banners, the お知らせ and the
 * 年間予定 screen all read it, and tools/schedule/export.mjs writes the table in docs/EVENT_SCHEDULE.md from it.
 *
 * A date is "MM-DD" with the year implied (2026-11-16 ... 2027-11-15); an event or a gacha starts at 0:00 of its first day and
 * ends at 23:59 of its last. Artwork goes in public/assets/events/<id>.jpg and public/assets/gacha/<id>.jpg (a missing picture
 * shows a banner drawn in the entry's colour). 数字は仮のバランス.
 */
export const SCHEDULE_START = '2026-11-16T00:00:00';
export const SCHEDULE_END = '2027-11-16T00:00:00';

/** What comes after the year: shown as the last line of the 年間予定. */
export const SCHEDULE_NEXT = { at: '2027-11-16T00:00:00', title: '1周年記念' };

/** "MM-DD" -> "YYYY-MM-DD": the year runs 11-16 (2026) to 11-15 (2027), so a date from 11-16 on is 2026's and an earlier one 2027's. */
const at = (md: string): string => `${md >= '11-16' ? 2026 : 2027}-${md}`;
const span = (from: string, to: string): { startsAt: string; endsAt: string } => ({ startsAt: `${at(from)}T00:00:00`, endsAt: `${at(to)}T23:59:00` });

// ------------------------------------------------------------------------------------------ 期間限定イベント (14)

export const SCHEDULED_EVENTS: LimitedEventDef[] = [
  makeEvent({
    id: 'launch',
    kind: 'dungeon',
    title: '開幕記念・はじまりの祝祭',
    description: '旅立ちを祝う祭りの森で、祝祭メダルを集めよう。ごほうびと交換できます。',
    story: '迷いの森で、旅立ちを祝う祭りがひらかれた。ランタンの下を駆ける獣たちを倒して、祝祭メダルを集めよう。',
    image: 'launch.jpg',
    accent: 0x3f7a3a,
    emblem: '祭',
    ...span('11-16', '12-06'),
    token: { name: '祝祭メダル', glyph: '祭', color: 0x4aa05a },
    region: 0,
    headline: { finalRewards: [{ type: 'equipment', rarity: 5, amount: 1 }], shop: { id: 'equip5', name: '装備 ★5 ×1', cost: 6000, limit: 1, rewards: [{ type: 'equipment', rarity: 5, amount: 1 }] } },
  }),
  makeEvent({
    id: 'xmas',
    kind: 'dungeon',
    title: '聖夜の贈りもの',
    description: '雪の山で、迷子のプレゼントを集めよう。聖夜の贈りものと交換できます。',
    story: '蒼氷の山嶺に、聖夜の贈りものがばらまかれてしまった。雪にまぎれた獣たちから、プレゼントを取り戻そう。',
    image: 'xmas.jpg',
    accent: 0xb8332e,
    emblem: '聖',
    ...span('12-17', '12-30'),
    token: { name: 'プレゼント', glyph: '贈', color: 0xd8473c },
    region: 2,
    headline: { finalRewards: [{ type: 'gems', amount: 200 }], shop: { id: 'xmas-gems', name: '聖夜の魔晶石 ×100', cost: 1500, limit: 3, rewards: [{ type: 'gems', amount: 100 }] } },
  }),
  makeEvent({
    id: 'newyear',
    kind: 'dungeon',
    title: '新春・福袋まつり',
    description: '新年の都で福札を集めよう。福袋と交換できます。',
    story: '黄昏の都は新年のにぎわい。福袋の当たる福札を、おとなしくない獣たちと競って集めよう。',
    image: 'newyear.jpg',
    accent: 0xd1a12e,
    emblem: '福',
    ...span('12-31', '01-13'),
    token: { name: '福札', glyph: '福', color: 0xd9a02a },
    region: 4,
    headline: { finalRewards: [{ type: 'gold', amount: 500000 }], shop: { id: 'fukubukuro', name: '福袋（魔晶石 ×100）', cost: 1800, limit: 3, rewards: [{ type: 'gems', amount: 100 }] } },
  }),
  makeEvent({
    id: 'setsubun',
    kind: 'dungeon',
    title: '鬼は外！ 豆まき大会',
    description: '遺跡にあふれた鬼を、福豆で追い払え。福豆を集めて、ごほうびと交換しよう。',
    story: '瘴気の遺跡から、節分の鬼があふれ出した。福豆を手に、鬼たちを追い払おう。',
    image: 'setsubun.jpg',
    accent: 0x9a3a1c,
    emblem: '鬼',
    ...span('01-28', '02-09'),
    token: { name: '福豆', glyph: '豆', color: 0xc9a45a },
    region: 3,
    headline: { finalRewards: [{ type: 'phaseMaterials', amount: 2 }] },
  }),
  makeEvent({
    id: 'valentine',
    kind: 'mission',
    title: '甘き魔法のショコラ',
    description: 'いつもの冒険で、ショコラが集まる。8日間のミッションイベントです。',
    story: '村の魔法使いが、甘い魔法のショコラをふるまっている。いつもの冒険をこなすだけで、ショコラがたまっていく。',
    image: 'valentine.jpg',
    accent: 0xc2527a,
    emblem: '♥',
    ...span('02-10', '02-17'),
    token: { name: 'ショコラ', glyph: '甘', color: 0x8a4a2a },
    headline: { finalRewards: [{ type: 'item', item: 'exp_xl', amount: 1 }] },
  }),
  makeEvent({
    id: 'sakura',
    kind: 'dungeon',
    title: '桜花爛漫・春まつり',
    description: '桜舞う森で、花びらを集めよう。春のごほうびと交換できます。',
    story: '迷いの森の桜が、いっせいに咲いた。舞い散る花びらを集めながら、花見の宴をじゃまする獣を追い払おう。',
    image: 'sakura.jpg',
    accent: 0xd96a9a,
    emblem: '桜',
    ...span('03-17', '04-06'),
    token: { name: '桜の花びら', glyph: '桜', color: 0xf08ab0 },
    region: 0,
    headline: { finalRewards: [{ type: 'equipment', rarity: 5, amount: 1 }], shop: { id: 'equip5', name: '装備 ★5 ×1', cost: 6000, limit: 1, rewards: [{ type: 'equipment', rarity: 5, amount: 1 }] } },
  }),
  makeEvent({
    id: 'golden',
    kind: 'dungeon',
    title: '黄金週間・大宝探し',
    description: '荒野に眠る黄金を探そう。コインを集めて、大きなごほうびと交換できます。',
    story: '灰塵の荒野で、黄金の財宝の地図が見つかった。獣たちが守る宝を求めて、黄金のコインを集めよう。',
    image: 'golden.jpg',
    accent: 0xc79a2a,
    emblem: '宝',
    ...span('04-28', '05-12'),
    token: { name: '黄金のコイン', glyph: '金', color: 0xe0b030 },
    region: 1,
    headline: { finalRewards: [{ type: 'gold', amount: 1000000 }], shop: { id: 'gold-big', name: 'ゴールド 500,000', cost: 600, limit: 20, rewards: [{ type: 'gold', amount: 500000 }] } },
  }),
  makeEvent({
    id: 'rain',
    kind: 'mission',
    title: '紫陽花の雨宿り',
    description: '雨の日も、いつもの冒険で。雨粒の宝玉を集める、ミッションイベントです。',
    story: '長雨の続く村で、紫陽花が咲いた。雨宿りの合間にこなした冒険が、雨粒の宝玉になって集まる。',
    image: 'rain.jpg',
    accent: 0x4f5fa8,
    emblem: '雨',
    ...span('06-10', '06-24'),
    token: { name: '雨粒の宝玉', glyph: '雨', color: 0x6a8ad8 },
    headline: { finalRewards: [{ type: 'phaseMaterials', amount: 2 }] },
  }),
  makeEvent({
    id: 'tanabata',
    kind: 'dungeon',
    title: '星降る七夕祭',
    description: '星の降る都で、願い星を集めよう。願いをかなえるごほうびと交換できます。',
    story: '黄昏の都の空に、願い星が降りはじめた。短冊に願いを込めて、流れ星を集めよう。',
    image: 'tanabata.jpg',
    accent: 0x3a4f9a,
    emblem: '星',
    ...span('07-01', '07-12'),
    token: { name: '願い星', glyph: '星', color: 0xf0e070 },
    region: 4,
    headline: { finalRewards: [{ type: 'skillEssence', amount: 20000 }], shop: { id: 'skill-big', name: '技素 ×5,000', cost: 1200, limit: 10, rewards: [{ type: 'skillEssence', amount: 5000 }] } },
  }),
  makeEvent({
    id: 'summer',
    kind: 'dungeon',
    title: '真夏の海賊祭',
    description: '荒野の海辺で、貝殻の宝を集めよう。夏の大ごほうびと交換できます。',
    story: '灰塵の荒野の入り江に、海賊の宝船が流れ着いた。太陽の下で、貝殻の宝を拾い集めよう。',
    image: 'summer.jpg',
    accent: 0x1f9ab8,
    emblem: '海',
    ...span('07-20', '08-16'),
    token: { name: '貝殻の宝', glyph: '貝', color: 0x3fc0d8 },
    region: 1,
    exchangeDays: 4,
    headline: { finalRewards: [{ type: 'equipment', rarity: 5, amount: 1 }, { type: 'gems', amount: 200 }], shop: { id: 'equip5', name: '装備 ★5 ×1', cost: 6000, limit: 1, rewards: [{ type: 'equipment', rarity: 5, amount: 1 }] } },
  }),
  makeEvent({
    id: 'moon',
    kind: 'mission',
    title: '月見の宴',
    description: '十五夜の晩は、いつもの冒険で月見団子を集めよう。ミッションイベントです。',
    story: '十五夜の村で、月見の宴がひらかれる。冒険の合間に、月見団子をたくさん集めよう。',
    image: 'moon.jpg',
    accent: 0x5a4a8a,
    emblem: '月',
    ...span('09-15', '09-28'),
    token: { name: '月見団子', glyph: '月', color: 0xf0d878 },
    headline: { finalRewards: [{ type: 'item', item: 'exp_xl', amount: 1 }] },
  }),
  makeEvent({
    id: 'harvest',
    kind: 'dungeon',
    title: '実りの秋・紅葉狩り',
    description: '色づく森で、紅葉を集めよう。秋の実りと交換できます。',
    story: '迷いの森が、赤や黄色に色づいた。実りの秋をねらう獣たちを倒して、紅葉と木の実を集めよう。',
    image: 'harvest.jpg',
    accent: 0xc7541c,
    emblem: '紅',
    ...span('10-05', '10-17'),
    token: { name: '紅葉', glyph: '葉', color: 0xe0662a },
    region: 0,
    headline: { finalRewards: [{ type: 'item', item: 'exp_xl', amount: 3 }], shop: { id: 'exp-big', name: '経験値素材（特大）×3', cost: 4800, limit: 5, rewards: [{ type: 'item', item: 'exp_xl', amount: 3 }] } },
  }),
  makeEvent({
    id: 'halloween',
    kind: 'dungeon',
    title: 'ハロウィン・ナイトパレード',
    description: '遺跡に夜のパレードがやってきた。ジャックの灯を集めて、ごほうびと交換しよう。',
    story: '瘴気の遺跡で、ハロウィンの夜のパレードがはじまった。ジャックの灯をともしながら、お化けたちをやっつけよう。',
    image: 'halloween.jpg',
    accent: 0x6a2a8a,
    emblem: '宵',
    ...span('10-20', '11-02'),
    token: { name: 'ジャックの灯', glyph: '灯', color: 0xf08a2a },
    region: 3,
    headline: { finalRewards: [{ type: 'equipment', rarity: 5, amount: 1 }], shop: { id: 'equip5', name: '装備 ★5 ×1', cost: 6000, limit: 1, rewards: [{ type: 'equipment', rarity: 5, amount: 1 }] } },
  }),
  makeEvent({
    id: 'countdown',
    kind: 'mission',
    title: '1周年カウントダウン',
    description: '1周年まであと少し。いつもの冒険で、記念メダルを集めよう。',
    story: 'ABYRUSの1周年まで、あとわずか。感謝をこめて、冒険のたびに記念メダルがたまっていく。',
    image: 'countdown.jpg',
    accent: 0xd9367f,
    emblem: '1',
    ...span('11-05', '11-15'),
    token: { name: '記念メダル', glyph: '周', color: 0xf0c040 },
    headline: { finalRewards: [{ type: 'gems', amount: 300 }] },
  }),
];

// ------------------------------------------------------------------------------------------ ピックアップガチャ (25) と 装備の感謝祭 (3)

/** ★5 ピックアップ: ★5 2%, 天井 50回 (★5以上、ピックアップ確定). */
const P5_RATES: GachaBannerEntry['rates'] = [
  { rarity: 5, rate: 0.02 },
  { rarity: 4, rate: 0.08 },
  { rarity: 3, rate: 0.22 },
  { rarity: 2, rate: 0.3 },
  { rarity: 1, rate: 0.38 },
];
/** ★4 ピックアップ: ★4 14%, 天井 30回 (★4以上、ピックアップ確定). */
const P4_RATES: GachaBannerEntry['rates'] = [
  { rarity: 5, rate: 0.01 },
  { rarity: 4, rate: 0.14 },
  { rarity: 3, rate: 0.25 },
  { rarity: 2, rate: 0.3 },
  { rarity: 1, rate: 0.3 },
];
/** 1周年カウントダウン: ★5 3%, 天井 40回. */
const ANNIVERSARY_RATES: GachaBannerEntry['rates'] = [
  { rarity: 5, rate: 0.03 },
  { rarity: 4, rate: 0.1 },
  { rarity: 3, rate: 0.25 },
  { rarity: 2, rate: 0.3 },
  { rarity: 1, rate: 0.32 },
];
/** 装備の感謝祭: ★5 4% (ふだんの2倍). */
const EQUIP_FEST_RATES: GachaBannerEntry['rates'] = [
  { rarity: 5, rate: 0.04 },
  { rarity: 4, rate: 0.12 },
  { rarity: 3, rate: 0.22 },
  { rarity: 2, rate: 0.28 },
  { rarity: 1, rate: 0.34 },
];

/** The part of a name a player calls the character by: "星導のアストラ" -> "アストラ". */
function shortName(id: string): string {
  const name = getHeroDefinition(id)?.name ?? id;
  return name.match(/[ァ-ヶー]+$/)?.[0] ?? name;
}

interface PickupSpec {
  id: string;
  title: string;
  from: string;
  to: string;
  /** ★5 ピックアップ (a '★5' banner) - or none for a '★4' banner. */
  five?: string[];
  four: string[];
  three?: string[];
  accent: number;
  emblem: string;
  rates?: GachaBannerEntry['rates'];
  pityAt?: number;
  /** The share of each rarity's rate that goes to its ピックアップ (default 0.5 for a ★5 banner, 0.6 for a ★4 banner). */
  share?: number;
}

function pickupGacha(spec: PickupSpec): GachaBannerEntry {
  const five = spec.five ?? [];
  const top = five.length > 0 ? five : spec.four;
  const star = five.length > 0 ? 5 : 4;
  return {
    id: spec.id,
    title: spec.title,
    image: `${spec.id}.jpg`,
    // (one line in the card: more than two names are "クレナイほか2体")
    description: `★${star} ${top.length > 2 ? `${shortName(top[0])}ほか${top.length - 1}体` : top.map(shortName).join('・')} 出現率UP！`,
    accent: spec.accent,
    emblem: spec.emblem,
    ...span(spec.from, spec.to),
    rates: spec.rates ?? (five.length > 0 ? P5_RATES : P4_RATES),
    pickup: { heroes: [...five, ...spec.four, ...(spec.three ?? [])], share: spec.share ?? (five.length > 0 ? 0.5 : 0.6) },
    pity: five.length > 0 ? { at: spec.pityAt ?? 50, minRarity: 5 as Rarity, pickup: true } : { at: spec.pityAt ?? 30, minRarity: 4 as Rarity, pickup: true },
    tenMin: 3,
  };
}

export const SCHEDULED_GACHAS: GachaBannerEntry[] = [
  pickupGacha({ id: 'g01-launch', title: '開幕記念 召喚祭', from: '11-16', to: '12-06', five: ['astra'], four: ['sieg', 'nova'], three: ['celes'], accent: 0x3f7a3a, emblem: '祭' }),
  pickupGacha({ id: 'g02-winter4', title: '冬支度 ★4ピックアップ', from: '12-07', to: '12-16', four: ['seira', 'ignis', 'brann'], three: ['fros'], accent: 0x3a6a9a, emblem: '冬' }),
  pickupGacha({ id: 'g03-xmas', title: '聖夜の召喚', from: '12-17', to: '12-30', five: ['aria'], four: ['ouka', 'quartz'], three: ['noel', 'celes'], accent: 0xb8332e, emblem: '聖' }),
  pickupGacha({ id: 'g04-newyear', title: '新春 福袋召喚', from: '12-31', to: '01-13', five: ['gauss'], four: ['kurenai', 'thorne'], three: ['gen', 'jin'], accent: 0xd1a12e, emblem: '福' }),
  pickupGacha({ id: 'g05-sword4', title: '剣豪 ★4ピックアップ', from: '01-14', to: '01-27', four: ['dias', 'ren', 'kohaku'], three: ['taiga'], accent: 0x6a6a7a, emblem: '剣' }),
  pickupGacha({ id: 'g06-setsubun', title: '豆まき召喚', from: '01-28', to: '02-09', five: ['shade'], four: ['ignis', 'raijin'], three: ['taiga', 'gustav'], accent: 0x9a3a1c, emblem: '鬼' }),
  pickupGacha({ id: 'g07-valentine', title: '甘き魔法の召喚', from: '02-10', to: '02-17', five: ['viara'], four: ['ivy', 'lilith'], three: ['rosa', 'lena'], accent: 0xc2527a, emblem: '♥' }),
  pickupGacha({ id: 'g08-archer4', title: '弓の名手 ★4ピックアップ', from: '02-18', to: '03-09', four: ['suzuna', 'nova', 'gale'], three: ['morrigan', 'tsubame'], accent: 0x3a8a5a, emblem: '弓' }),
  pickupGacha({ id: 'g09-piday', title: '円周率の日 召喚', from: '03-10', to: '03-16', five: ['zeno'], four: ['quartz', 'brann'], three: ['noct', 'orga'], accent: 0x3a4fa8, emblem: 'π' }),
  pickupGacha({ id: 'g10-sakura', title: '桜花の召喚', from: '03-17', to: '04-06', five: ['aria'], four: ['ouka', 'sylva'], three: ['haruka', 'lune'], accent: 0xd96a9a, emblem: '桜' }),
  pickupGacha({ id: 'g11-tank4', title: '守護の盾 ★4ピックアップ', from: '04-07', to: '04-27', four: ['baron', 'brann', 'raijin'], three: ['elrin', 'gustav', 'doris'], accent: 0x5a6a7a, emblem: '盾' }),
  pickupGacha({ id: 'g12-golden', title: '黄金週間の召喚', from: '04-28', to: '05-12', five: ['gauss'], four: ['thorne', 'dias'], three: ['bruno', 'sora'], accent: 0xc79a2a, emblem: '金' }),
  pickupGacha({ id: 'g13-mage4', title: '魔導の極み ★4ピックアップ', from: '05-13', to: '05-26', four: ['lilith', 'quartz', 'ouka'], three: ['miru', 'felix'], accent: 0x6a3aa8, emblem: '魔' }),
  pickupGacha({ id: 'g14-gale', title: '疾風怒濤の召喚', from: '05-27', to: '06-09', five: ['zeno'], four: ['gale', 'nova'], three: ['mina', 'tsubame'], accent: 0x3a9ab8, emblem: '風' }),
  pickupGacha({ id: 'g15-rain', title: '紫陽花の召喚', from: '06-10', to: '06-30', five: ['viara'], four: ['ivy', 'quartz'], three: ['toxar', 'lena'], accent: 0x4f5fa8, emblem: '雨' }),
  pickupGacha({ id: 'g16-tanabata', title: '星降る七夕の召喚', from: '07-01', to: '07-12', five: ['astra'], four: ['quartz', 'lilith'], three: ['miru', 'noct'], accent: 0x3a4f9a, emblem: '星' }),
  pickupGacha({ id: 'g17-heat4', title: '灼熱の ★4ピックアップ', from: '07-13', to: '07-19', four: ['kurenai', 'ignis', 'raijin'], three: ['kai'], accent: 0xd9501c, emblem: '炎' }),
  pickupGacha({ id: 'g18-summer', title: '真夏の海賊召喚', from: '07-20', to: '08-02', five: ['gauss'], four: ['gale', 'seira'], three: ['sora', 'ines'], accent: 0x1f9ab8, emblem: '海' }),
  pickupGacha({ id: 'g19-summer2', title: '真夏の海賊召喚 第2弾', from: '08-03', to: '08-16', five: ['zeno'], four: ['quartz', 'nova'], three: ['felix', 'tsubame'], accent: 0x2aa0b8, emblem: '波' }),
  pickupGacha({ id: 'g20-late4', title: '夏の終わり ★4ピックアップ', from: '08-17', to: '08-30', four: ['ren', 'dias', 'sieg'], three: ['haruka'], accent: 0x7a8a3a, emblem: '夏' }),
  pickupGacha({ id: 'g21-autumn', title: '秋の足音の召喚', from: '08-31', to: '09-14', five: ['astra'], four: ['sieg', 'gale'], three: ['mina', 'robin'], accent: 0xb8742a, emblem: '秋' }),
  pickupGacha({ id: 'g22-moon', title: '月夜の召喚', from: '09-15', to: '10-04', five: ['shade'], four: ['lilith', 'quartz'], three: ['lune', 'miru'], accent: 0x5a4a8a, emblem: '月' }),
  pickupGacha({ id: 'g23-momiji', title: '紅葉の召喚', from: '10-05', to: '10-19', five: ['aria'], four: ['kurenai', 'ouka'], three: ['kaede', 'haruka'], accent: 0xc7541c, emblem: '葉' }),
  pickupGacha({ id: 'g24-halloween', title: 'ハロウィンの召喚', from: '10-20', to: '11-02', five: ['shade', 'viara'], four: ['lilith', 'ivy'], three: ['nyx', 'toxar'], accent: 0x6a2a8a, emblem: '宵' }),
  pickupGacha({ id: 'g25-countdown', title: '1周年カウントダウン召喚', from: '11-03', to: '11-15', five: ['aria', 'zeno', 'astra'], four: ['sieg', 'kurenai', 'ouka'], three: ['celes'], accent: 0xd9367f, emblem: '周', rates: ANNIVERSARY_RATES, pityAt: 40, share: 0.7 }),

  // 装備の感謝祭 (the same picture each time): ★5 of the 装備ガチャ at twice the usual rate.
  ...(
    [
      ['equip-fest-1', '12-07', '12-16'],
      ['equip-fest-2', '05-13', '05-26'],
      ['equip-fest-3', '08-17', '08-30'],
    ] as const
  ).map(([id, from, to]): GachaBannerEntry => ({
    id,
    kind: 'equipment',
    title: '装備の感謝祭',
    image: 'equip_fest.jpg',
    description: '装備ガチャの★5が、ふだんの2倍！',
    accent: 0x2f7a8a,
    emblem: '装',
    ...span(from, to),
    rates: EQUIP_FEST_RATES,
  })),
];

// ------------------------------------------------------------------------------------------ ブーストキャンペーン (24)

const campaign = (id: string, kind: CampaignKind, mul: number, title: string, from: string, to: string): CampaignDef => ({ id, kind, mul, title, ...span(from, to) });

export const SCHEDULED_CAMPAIGNS: CampaignDef[] = [
  campaign('c01', 'stamina', 0.5, '冬支度応援 スタミナ半額', '12-07', '12-13'),
  campaign('c02', 'gold', 2, '年末ゴールド祭', '12-14', '12-16'),
  campaign('c03', 'exp', 2, '新年 経験値2倍', '01-14', '01-20'),
  campaign('c04', 'drop', 2, '冬のドロップ祭', '01-21', '01-27'),
  campaign('c05', 'gold', 2, 'ゴールド祭', '02-18', '02-24'),
  campaign('c06', 'idle', 2, '猫の日 放置報酬2倍', '02-22', '03-02'),
  campaign('c07', 'stamina', 0.5, 'ひな祭り スタミナ半額', '03-03', '03-09'),
  campaign('c08', 'drop', 2, '春のドロップ祭', '03-10', '03-16'),
  campaign('c09', 'exp', 2, '新生活応援 経験値2倍', '04-07', '04-14'),
  campaign('c10', 'gold', 2, '新生活応援 ゴールド2倍', '04-15', '04-21'),
  campaign('c22', 'drop', 2, '連休まえ ドロップ2倍', '04-22', '04-27'),
  campaign('c11', 'drop', 2, '初夏のドロップ祭', '05-13', '05-19'),
  campaign('c12', 'stamina', 0.5, '連休あけ スタミナ半額', '05-20', '05-26'),
  campaign('c13', 'idle', 2, '放置報酬2倍ウィーク', '05-27', '06-02'),
  campaign('c14', 'gold', 2, '梅雨入り ゴールド2倍', '06-03', '06-09'),
  campaign('c15', 'exp', 2, '梅雨あけ 経験値2倍', '06-25', '07-01'),
  campaign('c16', 'stamina', 0.5, '海の日 スタミナ半額', '07-13', '07-19'),
  campaign('c17', 'stamina', 0.5, '夏休み後半 スタミナ半額', '08-17', '08-23'),
  campaign('c18', 'drop', 2, '夏のドロップ祭', '08-24', '08-30'),
  campaign('c19', 'gold', 2, '秋のゴールド祭', '08-31', '09-06'),
  campaign('c20', 'exp', 2, '読書の秋 経験値2倍', '09-07', '09-14'),
  campaign('c21', 'idle', 2, '放置報酬2倍ウィーク', '09-29', '10-04'),
  campaign('c23', 'stamina', 0.5, 'ハロウィン準備 スタミナ半額', '10-18', '10-19'),
  campaign('c24', 'gold', 2, '感謝のゴールド2倍', '11-03', '11-04'),
];
