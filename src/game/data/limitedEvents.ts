import type { MissionKey } from './missions';
import type { Reward } from './rewards';
import { localized } from '../i18n';

/**
 * 期間限定イベント: an event that runs between two dates, has its own currency (the 通貨 the player collects), a track of
 * 累計報酬 (rewards for the total collected), an 交換所 (what the currency buys) and ミッション (more of the currency for doing
 * what the player does anyway). Two kinds:
 *
 *  - 'dungeon'  an event dungeon in four tiers (the same tiers as the 曜日ダンジョン): every clear pays the currency.
 *  - 'mission'  no dungeon: the currency comes from the ミッション alone.
 *
 * The year's events are listed in data/schedule.ts, built with the templates at the bottom of this file. 数字は仮のバランス.
 */
export type LimitedEventKind = 'dungeon' | 'mission';

/** What the event's missions count. `login` = the days the player came in during the event, `event_clear` = clears of the event dungeon
 *  (a 掃討 counts too); the rest are the ordinary mission keys, counted from the start of the event. */
export type EventMissionKey = MissionKey | 'login' | 'event_clear';

/** The currency of an event: 祝祭メダル, 福豆 ... It is lost (as are the unspent ones) when the 交換期間 ends. */
export interface EventToken {
  name: string;
  /** One kanji on its round badge. */
  glyph: string;
  color: number;
}

export interface EventMissionDef {
  id: string;
  title: string;
  key: EventMissionKey;
  target: number;
  /** The event currency paid for taking it. */
  tokens: number;
}

/** One step of the 累計報酬: reached when `points` (the total of the currency ever collected) is met. */
export interface EventMilestone {
  points: number;
  rewards: Reward[];
}

export interface EventShopItem {
  id: string;
  name: string;
  /** Price in the event currency. */
  cost: number;
  /** How many the player may buy in all. */
  limit: number;
  rewards: Reward[];
}

export interface LimitedEventDef {
  id: string;
  kind: LimitedEventKind;
  title: string;
  /** One or two lines on the card of the Event tab. */
  description: string;
  /** Two or three lines at the top of the event's own screen: what is going on. */
  story: string;
  /** Filename under public/assets/events/ (a wide picture, e.g. 1050x450). */
  image: string;
  /** Colour of the drawn banner while there is no picture, and of the chips. */
  accent: number;
  emblem: string;
  /** Local times, e.g. "2026-12-17T00:00:00" and "2026-12-30T23:59:00". */
  startsAt: string;
  endsAt: string;
  /** The 交換所 and the 累計報酬 stay open this many days after the end (the dungeon and the missions close at the end). */
  exchangeDays: number;
  token: EventToken;
  /** 'dungeon' only: the region whose beasts and backdrop the dungeon uses (0 = 迷いの森 ... 4 = 黄昏の都). */
  region: number;
  /** 'dungeon' only: currency per clear = the tier's stamina x this. */
  tokenPerStamina: number;
  /** 'dungeon' only: 魔晶石 for the first clear of each tier (初級 ... 超級). */
  firstClearGems: number[];
  missions: EventMissionDef[];
  milestones: EventMilestone[];
  shop: EventShopItem[];
}

// ------------------------------------------------------------------------------------------ templates

/** The tiers' unlock / strength / stamina are those of the 曜日ダンジョン (WEEKDAY_TIERS): an event dungeon is as hard as that day's. */
export const EVENT_TIER_FIRST_CLEAR_GEMS = [20, 30, 50, 100];

/** The headline reward of the last step of the 累計報酬 and the one-of-a-kind item of the 交換所 - what makes an event its own. */
export interface EventHeadline {
  /** Added to the last step of the 累計報酬. */
  finalRewards?: Reward[];
  /** An extra item in the 交換所 (name, price scale 1 = a dungeon event's price). */
  shop?: Omit<EventShopItem, 'cost'> & { cost: number };
}

const DUNGEON_POINTS = [300, 800, 1500, 2400, 3400, 4500, 5800, 7200, 8800, 10500];
// The last step is the sum of every mission of a mission event (2,000): finishing them all gets there.
const MISSION_POINTS = [100, 250, 450, 700, 1000, 1350, 1700, 2000];

export function standardMilestones(kind: LimitedEventKind, headline?: EventHeadline): EventMilestone[] {
  if (kind === 'dungeon') {
    const rewards: Reward[][] = [
      [{ type: 'gold', amount: 30000 }],
      [{ type: 'item', item: 'exp_m', amount: 5 }],
      [{ type: 'gems', amount: 50 }],
      [{ type: 'equipment', rarity: 3, amount: 1 }],
      [{ type: 'phaseMaterials', amount: 1 }],
      [{ type: 'gems', amount: 100 }],
      [{ type: 'item', item: 'exp_l', amount: 3 }],
      [{ type: 'equipment', rarity: 4, amount: 1 }],
      [{ type: 'gems', amount: 150 }, { type: 'phaseMaterials', amount: 1 }],
      [{ type: 'gems', amount: 300 }, { type: 'item', item: 'exp_xl', amount: 1 }, { type: 'phaseMaterials', amount: 2 }, ...(headline?.finalRewards ?? [])],
    ];
    return DUNGEON_POINTS.map((points, i) => ({ points, rewards: rewards[i] }));
  }
  const rewards: Reward[][] = [
    [{ type: 'gold', amount: 10000 }],
    [{ type: 'item', item: 'exp_m', amount: 3 }],
    [{ type: 'gems', amount: 30 }],
    [{ type: 'equipment', rarity: 3, amount: 1 }],
    [{ type: 'phaseMaterials', amount: 1 }],
    [{ type: 'gems', amount: 50 }],
    [{ type: 'item', item: 'exp_l', amount: 2 }],
    [{ type: 'gems', amount: 100 }, { type: 'equipment', rarity: 4, amount: 1 }, ...(headline?.finalRewards ?? [])],
  ];
  return MISSION_POINTS.map((points, i) => ({ points, rewards: rewards[i] }));
}

/** 5-yen steps, so a mission event's prices (a fifth of a dungeon event's) stay round. */
const roundPrice = (n: number): number => Math.max(5, Math.round(n / 5) * 5);

export function standardShop(kind: LimitedEventKind, headline?: EventHeadline): EventShopItem[] {
  const scale = kind === 'dungeon' ? 1 : 0.2;
  const base: EventShopItem[] = [
    { id: 'gold', name: 'ゴールド 50,000', cost: 80, limit: 30, rewards: [{ type: 'gold', amount: 50000 }] },
    { id: 'exp_m', name: '経験値素材（中）×5', cost: 100, limit: 20, rewards: [{ type: 'item', item: 'exp_m', amount: 5 }] },
    { id: 'exp_l', name: '経験値素材（大）×1', cost: 200, limit: 15, rewards: [{ type: 'item', item: 'exp_l', amount: 1 }] },
    { id: 'essence', name: '装備強化素材 ×100', cost: 150, limit: 20, rewards: [{ type: 'item', item: 'equip_essence', amount: 100 }] },
    { id: 'skill', name: '技素 ×500', cost: 150, limit: 20, rewards: [{ type: 'skillEssence', amount: 500 }] },
    { id: 'stamina', name: 'スタミナ ×50', cost: 300, limit: 10, rewards: [{ type: 'stamina', amount: 50 }] },
    { id: 'gems', name: '魔晶石 ×30', cost: 250, limit: 10, rewards: [{ type: 'gems', amount: 30 }] },
    { id: 'phase', name: 'フェーズ素材 ×1', cost: 700, limit: 5, rewards: [{ type: 'phaseMaterials', amount: 1 }] },
    { id: 'equip4', name: '装備 ★4 ×1', cost: 1400, limit: 3, rewards: [{ type: 'equipment', rarity: 4, amount: 1 }] },
    { id: 'exp_xl', name: '経験値素材（特大）×1', cost: 1800, limit: 5, rewards: [{ type: 'item', item: 'exp_xl', amount: 1 }] },
  ];
  const items = base.map((item) => ({ ...item, cost: roundPrice(item.cost * scale), limit: kind === 'dungeon' ? item.limit : Math.max(1, Math.ceil(item.limit / 3)) }));
  if (headline?.shop) items.push({ ...headline.shop, cost: roundPrice(headline.shop.cost * scale) });
  return items;
}

export function standardMissions(kind: LimitedEventKind): EventMissionDef[] {
  const login: EventMissionDef[] = [
    { id: 'login1', title: 'イベント期間中にログインする', key: 'login', target: 1, tokens: 50 },
    { id: 'login3', title: 'ログインした日が3日になる', key: 'login', target: 3, tokens: 100 },
    { id: 'login5', title: 'ログインした日が5日になる', key: 'login', target: 5, tokens: 150 },
    { id: 'login7', title: 'ログインした日が7日になる', key: 'login', target: 7, tokens: 200 },
  ];
  if (kind === 'dungeon') {
    return [
      ...login,
      { id: 'clear10', title: 'イベントダンジョンを10回クリアする', key: 'event_clear', target: 10, tokens: 150 },
      { id: 'clear30', title: 'イベントダンジョンを30回クリアする', key: 'event_clear', target: 30, tokens: 300 },
      { id: 'clear60', title: 'イベントダンジョンを60回クリアする', key: 'event_clear', target: 60, tokens: 500 },
      { id: 'clear100', title: 'イベントダンジョンを100回クリアする', key: 'event_clear', target: 100, tokens: 800 },
      { id: 'gacha10', title: 'ガチャを10回引く', key: 'gacha_pull', target: 10, tokens: 200 },
    ];
  }
  return [
    ...login,
    { id: 'quest20', title: 'クエストを20回クリアする', key: 'quest_clear', target: 20, tokens: 100 },
    { id: 'quest60', title: 'クエストを60回クリアする', key: 'quest_clear', target: 60, tokens: 200 },
    { id: 'stamina300', title: 'スタミナを300使う', key: 'stamina', target: 300, tokens: 150 },
    { id: 'stamina800', title: 'スタミナを800使う', key: 'stamina', target: 800, tokens: 250 },
    { id: 'gacha10', title: 'ガチャを10回引く', key: 'gacha_pull', target: 10, tokens: 150 },
    { id: 'gacha30', title: 'ガチャを30回引く', key: 'gacha_pull', target: 30, tokens: 250 },
    { id: 'hero10', title: 'キャラを10回強化する', key: 'hero_enhance', target: 10, tokens: 100 },
    { id: 'expedition8', title: '遠征から8回帰還させる', key: 'expedition', target: 8, tokens: 100 },
    { id: 'village3', title: '村の建物を3回建てる・強くする', key: 'village_build', target: 3, tokens: 100 },
    { id: 'supply8', title: '朝夕の補給を8回受け取る', key: 'supply', target: 8, tokens: 100 },
  ];
}

// ------------------------------------------------------------------------------------------ lookups

/** Builds a complete event from the few things that make it its own; the rest is the standard (templates above). The text (the title, the
 *  currency, the missions, the exchange items) is read through tr() each time it is used: English is i18n/data/scheduleEn.ts, by the event's
 *  id (the missions and the exchange items every event shares, by their own ids). */
export function makeEvent(
  spec: Pick<LimitedEventDef, 'id' | 'kind' | 'title' | 'description' | 'story' | 'image' | 'accent' | 'emblem' | 'startsAt' | 'endsAt' | 'token'> &
    Partial<Pick<LimitedEventDef, 'region' | 'tokenPerStamina' | 'exchangeDays'>> & { headline?: EventHeadline },
): LimitedEventDef {
  const { headline, ...rest } = spec;
  const def: LimitedEventDef = {
    region: 0,
    tokenPerStamina: 2,
    exchangeDays: 3,
    ...rest,
    token: localized('eventToken', spec.id, spec.token, ['name', 'glyph']),
    firstClearGems: EVENT_TIER_FIRST_CLEAR_GEMS,
    missions: standardMissions(spec.kind).map((m) => localized('eventMission', m.id, m, ['title'])),
    milestones: standardMilestones(spec.kind, headline),
    shop: standardShop(spec.kind, headline).map((item) => localized('eventShop', item.id, item, ['name'])),
  };
  return localized('event', spec.id, def, ['title', 'description', 'story', 'emblem']);
}
