import { BigNumber } from './BigNumber';
import { createHeroInstance } from '../data/heroes';
import { BACK_SLOTS, FRONT_SLOTS, MAX_DECKS, cleanDeckName, defaultDeckName, emptyDeck } from './DeckSystem';
import { REGION_COUNT } from '../data/regions';
import { EQUIP_SLOTS, MAX_LEVEL, MAX_PHASE, emptyGear, type EquipmentItem, type HeroData, type HeroGear, type Row } from '../types';
import { getEquipDef } from '../data/equipment';
import { EXPEDITION_SLOTS, getExpedition } from '../data/expeditions';
import { EXTRA_BUILDER_GEMS, RAID_INTERVAL_HOURS, VILLAGE_COLS, VILLAGE_MATERIALS, VILLAGE_ROWS, VILLAGE_START, VILLAGE_START_MATERIALS, WANDERERS, getBuilding, isBuildingKind, type BuildingKind, type MaterialBundle, type VillageMaterial, type WandererKind } from '../data/village';
import { isItemId, type ItemId } from '../data/items';
import { getSupplySlot } from '../data/supply';
import type { InfiniteRunState } from './InfiniteModeSystem';
import { ChatSystem } from './ChatSystem';
import { SocialSystem, generatePlayerId } from './SocialSystem';
import { SettingsSystem, type Report, type SettingsState } from './SettingsSystem';
import { StaminaSystem } from './StaminaSystem';
import { emptyMissions, loadMissions, recordMission, type MissionState } from './MissionProgress';
import { expToNextLevel } from './LevelCurve';
import { MAX_PLAYER_LEVEL, staminaMaxFor } from '../data/playerLevel';
import { MAX_SKILL_LEVEL, MAX_SKILL_SLOTS, isSkillSlotUnlocked, skillUpgradeCost } from '../data/skills';

export interface PartyFormation {
  front: (string | null)[];
  back: (string | null)[];
}

/** A named, saved formation. Heroes may appear in several decks, but only
 *  once within one. */
export interface Deck extends PartyFormation {
  name: string;
}

/** What a gift pays out. Gems and gold only for now. */
export interface GiftReward {
  type: 'gems' | 'gold';
  amount: number;
}

/** An item in the player's プレゼントBOX. Claimed or expired ones can be
 *  deleted; an unclaimed, unexpired one can't (so it can't be lost by tapping
 *  the wrong button). */
export interface Gift {
  id: string;
  title: string;
  message: string;
  reward: GiftReward;
  receivedAt: number;
  /** Epoch ms. After this it can no longer be claimed. */
  expiresAt: number;
  claimed: boolean;
}

/** An item in the player's メールBOX. Only a read mail can be deleted. */
export interface Mail {
  id: string;
  title: string;
  body: string;
  sentAt: number;
  read: boolean;
}

/** Someone on the player's friend list. Other players aren't reachable yet
 *  (no server), so for now this is whatever the save holds. */
export interface Friend {
  /** The friend's 8-character player ID. */
  id: string;
  name: string;
  level: number;
  addedAt: number;
  lastLoginAt: number;
  favorite: boolean;
}

/** A friend request waiting for an answer. `name` is empty for one the
 *  player sent by ID before the other side has said who they are. */
export interface FriendRequest {
  id: string;
  name: string;
  level: number;
  sentAt: number;
}

/** A 軍団: a chat group the player made out of their friends (the player
 *  themself is always in it, so `memberIds` holds only friends). */
export interface Group {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: number;
}

export interface SocialState {
  /** This player's own ID, the one friends add them by. */
  playerId: string;
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  groups: Group[];
  /** friend id -> local day ("2026-10-28") a present was last sent them. */
  giftSentDay: Record<string, string>;
}

/** One line of chat. `channel` is 'global', `dm:<friendId>` or `group:<groupId>`. */
export interface ChatMessage {
  id: string;
  channel: string;
  /** 'self', 'system' (the operator), or the sender's player ID. */
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export interface ChatState {
  messages: ChatMessage[];
}

/** How often each shop product has been bought in the current limit period
 *  (see PurchaseLimit in data/shop.ts). `period` is the key of the period the
 *  count belongs to; a count from an earlier period no longer applies. */
export interface ShopState {
  purchases: Record<string, { period: string; count: number }>;
}

/** An expedition under way (data/expeditions.ts): which one, who is away on it, when they left, and
 *  what its rewards are multiplied by (settled when they left, from who was sent). */
export interface ExpeditionRun {
  id: string;
  heroIds: string[];
  startedAt: number;
  bonus: number;
}

/** A building in the village (data/village.ts): where its top-left tile is, the level it has reached, and
 *  the work under way on it - building it (`level` 0), raising it one level, or moving it (`move`: it is taken
 *  down for `demolish` seconds where it stands, then put up again at (toX, toY) for `rebuild` seconds). It counts
 *  at the new level / place once the time has run, even if the village has not been opened since (see VillageIncome). */
export interface PlacedBuilding {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  upgrade?: { startedAt: number; seconds: number };
  move?: { startedAt: number; demolish: number; rebuild: number; toX: number; toY: number };
  /** Broken by a 襲撃 that got through: it does nothing until it is repaired (VillageSystem.repair). */
  damaged?: boolean;
}

/** A 行商人 or 宝箱 standing on the map (top-left tile x, y) until `expiresAt`, holding this much. */
export interface Wanderer {
  id: string;
  kind: WandererKind;
  x: number;
  y: number;
  expiresAt: number;
  materials: MaterialBundle;
  /** Hours of the 放置報酬 gold it holds too. */
  goldHours: number;
}

/** A 襲撃 waiting to be answered: when it came, when it gives up waiting, how strong it is (and the region that sets it). */
export interface PendingRaid {
  arrivedAt: number;
  expiresAt: number;
  power: number;
  region: number;
}

/** What happened to a 襲撃 nobody answered (shown once, the next time the village is opened). */
export interface RaidReport {
  at: number;
  outcome: 'repelled' | 'damaged';
  /** The names of the buildings that were broken. */
  damaged: string[];
}

export interface VillageRaid {
  /** When the next one comes (while none is waiting). */
  nextAt: number;
  pending: PendingRaid | null;
  report: RaidReport | null;
  /** How many have been beaten in battle. */
  won: number;
}

/** Today's 村の依頼: how far each chore has got and which have been collected. `day` is the period key it belongs to. */
export interface VillageQuestState {
  day: string;
  counts: Record<string, number>;
  claimed: string[];
}

/** 村の目標 (data/villageGoals.ts): which goals have been collected, and how much 素材 has come in all told (the one thing the
 *  goals count that nothing else in the save remembers). */
export interface VillageMilestones {
  claimed: string[];
  gathered: number;
}

export interface VillageState {
  buildings: PlacedBuilding[];
  /** Next number for a new building's id. */
  nextId: number;
  /** 木材 / 鉄 / 石 in hand (data/village.ts). Only the village shows them. */
  materials: Record<VillageMaterial, number>;
  /** Builders bought with 魔晶石, on top of what the 城 gives. */
  extraBuilders: number;
  quests: VillageQuestState;
  wanderers: { lastSpawnAt: number; items: Wanderer[] };
  raid: VillageRaid;
  milestones: VillageMilestones;
}

export interface SaveData {
  version: number;
  gold: [number, number];
  gems: number;
  /** Spent to raise a hero's individual skill level (1-10); earned from
   *  stage clears and Infinite Mode runs. Kept separate from `gems`/`gold`
   *  (and from the concurrently-in-progress `phaseMaterials` currency) so
   *  skill progression - a per-hero, level-gated investment - has its own
   *  economy rather than competing with gacha pulls or phase fusion for
   *  the same pool. */
  skillEssence: number;
  heroes: HeroData[];
  /** 1 to MAX_DECKS saved formations. */
  decks: Deck[];
  /** Index into `decks` of the one that fights - stage battles and Infinite
   *  Mode both read it through getPartyHeroes(). Never points at an empty deck. */
  activeDeck: number;
  stageProgress: number;
  updatedAt: number;
  playerName: string;
  playerLevel: number;
  /** ミッション: what has been done in the current day and week (each starts over when its
   *  `id` - the local date, or the week's Monday - is no longer current), which missions
   *  were taken, and whether the all-done bonus was; plus the never-reset totals for 実績. */
  missions: MissionState;
  /** Per gacha banner id: pulls since its last 天井 hit (see GachaBannerEntry.pity). */
  gachaPity: Record<string, number>;
  /** The hero standing on the Home screen (an owned hero's `id`). Always one of the heroes
   *  owned: SaveSystem.getHomeHero repairs it when it is empty or the hero is gone. */
  homeHeroId: string;
  /** The first-launch story and チュートリアル: `opening` once the opening story has been
   *  seen, `step` the next tutorial step (data/tutorial.ts), `done` when finished or skipped. */
  tutorial: { opening: boolean; step: number; done: boolean };
  /** EXP towards the next プレイヤーレベル (see data/playerLevel.ts). */
  playerExp: number;
  /** [current, max]. Starting a stage spends it and it recovers over time -
   *  always go through StaminaSystem, which brings it up to date first. */
  stamina: [number, number];
  /** Epoch ms from which the next point of stamina is being counted (see
   *  StaminaSystem.refresh). */
  staminaAt: number;
  gifts: Gift[];
  mails: Mail[];
  /** Ids of operator gifts/mails (data/gifts.ts, data/mails.ts) already sent
   *  to this save, so one the player deleted is never sent again. */
  deliveredInboxIds: string[];
  /** Ids of お知らせ (data/notices.ts) the player has opened. */
  readNotices: string[];
  social: SocialState;
  chat: ChatState;
  shop: ShopState;
  settings: SettingsState;
  /** お問い合わせ / バグ報告 waiting for a server to take them. */
  reports: Report[];
  /** This device's own best Infinite Mode (Event tab) run. Kept locally so
   *  the Event tab still shows a meaningful personal best even before the
   *  global leaderboard call resolves, or when the backend isn't configured. */
  infiniteMode: {
    bestScore: number;
    bestSurvivalSeconds: number;
    bestEnemiesDefeated: number;
    bestDifficultyReached: number;
    totalRuns: number;
    /** A run that was paused (or left) part-way, kept to be picked up again from the lobby (systems/InfiniteModeSystem.ts
     *  reads it back and ignores anything that is not a well-formed one). Cleared when a run ends. */
    suspended?: InfiniteRunState;
  };
  /** Spent one at a time to raise a hero's phase directly (see MAX_PHASE in
   *  types.ts) - no source grants these yet (no stage-reward wiring), so
   *  this is just a starter stash to make the mechanic testable/usable now. */
  phaseMaterials: number;
  /** Quest-mode story read-state, keyed by region index (0-4). regionIntro
   *  gates whether entering a region's 1st stage plays its long-form story
   *  first; regionOutro gates the same for the story after clearing a
   *  region's 30th stage. Extra's own per-region one-liners are NOT
   *  tracked here - they're short enough to just replay every time, same
   *  as InfiniteModeScene's toasts. */
  storyFlags: {
    regionIntro: boolean[];
    regionOutro: boolean[];
    finalIntro: boolean;
    ending: boolean;
  };
  /** Extra (野に放たれた狂獣) progress - a separate counter/index space
   *  from `stageProgress` (the main 150-stage + final-battle campaign),
   *  since Extra only unlocks after the ending and re-fights each
   *  region's own boss on a harder curve. */
  extraProgress: number;
  /** 素材 (data/items.ts) held, by id: 経験値素材 and 装備強化素材. */
  items: Record<string, number>;
  /** Equipment not worn by anyone (a worn piece lives on its hero, HeroData.gear). */
  equipment: EquipmentItem[];
  /** プレミアムパス. `expiresAt` is epoch ms (0 = never bought); `dailyDay` is the
   *  local day ("2026-10-30") its 魔晶石 was last taken. */
  premium: { expiresAt: number; dailyDay: string };
  /** ログインボーナス of the month in `month` ("2026-10"): the day numbers already claimed. */
  loginBonus: { month: string; claimed: number[] };
  /** 朝夕の補給 (data/supply.ts): the local day ("2026-11-10") the record is for, the slots taken that day and whether that
   *  day's both-slots bonus was paid. A record of an earlier day counts as nothing taken. */
  supply: { day: string; claimed: string[]; bonus: boolean };
  /** 放置報酬: epoch ms it has been piling up from, and today's count of ads watched to speed it. */
  idle: { lastClaimAt: number; adDay: string; adCount: number };
  /** 遠征: one entry per slot (EXPEDITION_SLOTS), null where nothing is out. */
  expeditions: { slots: (ExpeditionRun | null)[] };
  /** 村: the buildings standing in it. */
  village: VillageState;
}

export interface InfiniteModeRunResult {
  score: number;
  survivalSeconds: number;
  enemiesDefeated: number;
  difficultyReached: number;
}

export interface HeroPullOutcome {
  hero: HeroData;
  /** 'new': first of this character. 'copy': a repeat - which is added to the roster like
   *  any other (every pull is kept). */
  kind: 'new' | 'copy';
}

const STORAGE_KEY = 'abyrus_save_v1';

export { expToNextLevel };

/** Coerces whatever a save holds into a well-formed deck: right slot counts,
 *  string ids only, a usable name. */
function normalizeDeck(raw: Partial<Deck> | undefined, fallbackName: string): Deck {
  const fit = (ids: unknown, size: number): (string | null)[] =>
    Array.from({ length: size }, (_, i) => (Array.isArray(ids) && typeof ids[i] === 'string' ? (ids[i] as string) : null));
  return {
    name: typeof raw?.name === 'string' ? cleanDeckName(raw.name, fallbackName) : fallbackName,
    front: fit(raw?.front, FRONT_SLOTS),
    back: fit(raw?.back, BACK_SLOTS),
  };
}

/** Loads `decks`, or - for a save from before decks existed - turns its single
 *  `party` into デッキ1, so an old save keeps its formation. */
function restoreDecks(parsed: Partial<SaveData> & { party?: PartyFormation }, fallback: Deck[]): Deck[] {
  if (Array.isArray(parsed.decks) && parsed.decks.length > 0) {
    return parsed.decks.slice(0, MAX_DECKS).map((deck, i) => normalizeDeck(deck, `デッキ${i + 1}`));
  }
  if (parsed.party) return [normalizeDeck(parsed.party as Partial<Deck>, 'デッキ1')];
  return fallback;
}

/** A deck may hold one copy of each character: keeps the first slot that
 *  names a character and empties any later slot holding another copy of it.
 *  (Saves from before copies could be kept never have such a deck.) */
function dropRepeatedCharacters(deck: Deck, heroes: HeroData[]): Deck {
  const seen = new Set<string>();
  const keep = (id: string | null): string | null => {
    const character = id === null ? undefined : heroes.find((h) => h.id === id)?.heroId;
    if (character === undefined) return id;
    if (seen.has(character)) return null;
    seen.add(character);
    return id;
  };
  return { ...deck, front: deck.front.map(keep), back: deck.back.map(keep) };
}

/** A piece of equipment as saved, or null if it is malformed or its kind no longer exists. */
function cleanItem(raw: unknown): EquipmentItem | null {
  const item = raw as Partial<EquipmentItem> | null;
  if (!item || typeof item.id !== 'string' || typeof item.defId !== 'string' || typeof item.level !== 'number') return null;
  const def = getEquipDef(item.defId);
  return def ? { id: item.id, defId: item.defId, level: Math.max(1, Math.min(Math.floor(item.level), 99)) } : null;
}

/** Brings the parts of a loaded save that came after the first release up to shape:
 *  素材, equipment (held and worn), プレミアムパス, ログインボーナス, 放置報酬. */
function restoreInventory(merged: SaveData, parsed: Partial<SaveData>): void {
  const items: Record<string, number> = {};
  for (const [id, n] of Object.entries(parsed.items ?? {})) if (isItemId(id) && typeof n === 'number' && n > 0) items[id] = Math.floor(n);
  merged.items = items;
  merged.equipment = Array.isArray(parsed.equipment) ? parsed.equipment.map(cleanItem).filter((i): i is EquipmentItem => i !== null) : [];
  merged.heroes = merged.heroes.map((hero) => {
    const gear: HeroGear = emptyGear();
    for (const slot of EQUIP_SLOTS) {
      const item = cleanItem(hero.gear?.[slot]);
      // A piece only fits the slot its kind belongs to.
      if (item && getEquipDef(item.defId)?.slot === slot) gear[slot] = item;
    }
    return { ...hero, gear };
  });
  const premium = parsed.premium;
  merged.premium = {
    expiresAt: typeof premium?.expiresAt === 'number' && Number.isFinite(premium.expiresAt) ? premium.expiresAt : 0,
    dailyDay: typeof premium?.dailyDay === 'string' ? premium.dailyDay : '',
  };
  const login = parsed.loginBonus;
  merged.loginBonus = {
    month: typeof login?.month === 'string' ? login.month : '',
    claimed: Array.isArray(login?.claimed) ? login.claimed.filter((d): d is number => Number.isInteger(d)) : [],
  };
  const supply = parsed.supply;
  merged.supply = {
    day: typeof supply?.day === 'string' ? supply.day : '',
    claimed: Array.isArray(supply?.claimed) ? [...new Set(supply.claimed.filter((id): id is string => typeof id === 'string' && !!getSupplySlot(id)))] : [],
    bonus: supply?.bonus === true,
  };
  const idle = parsed.idle;
  merged.idle = {
    lastClaimAt: typeof idle?.lastClaimAt === 'number' && Number.isFinite(idle.lastClaimAt) ? idle.lastClaimAt : Date.now(),
    adDay: typeof idle?.adDay === 'string' ? idle.adDay : '',
    adCount: typeof idle?.adCount === 'number' ? Math.max(0, Math.floor(idle.adCount)) : 0,
  };
  merged.expeditions = restoreExpeditions(parsed.expeditions);
  merged.village = restoreVillage(parsed.village);
}

/** A new village (also what a save from before 村 existed is given): the 城 and one 店. */
function defaultVillage(now = Date.now()): VillageState {
  return {
    buildings: VILLAGE_START.map((s, i) => ({ id: `b${i + 1}`, kind: s.kind, x: s.x, y: s.y, level: s.level })),
    nextId: VILLAGE_START.length + 1,
    materials: { ...VILLAGE_START_MATERIALS },
    extraBuilders: 0,
    quests: { day: '', counts: {}, claimed: [] },
    wanderers: { lastSpawnAt: now, items: [] },
    raid: { nextAt: now + RAID_INTERVAL_HOURS * 3600 * 1000, pending: null, report: null, won: 0 },
    milestones: { claimed: [], gathered: 0 },
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** The saved 行商人 / 宝箱: the ones that are malformed are dropped, positions are pulled onto the map. */
function restoreWanderers(raw: Partial<VillageState['wanderers']> | undefined, now: number): VillageState['wanderers'] {
  const items: Wanderer[] = [];
  const seen = new Set<string>();
  for (const w of Array.isArray(raw?.items) ? (raw.items as Partial<Wanderer>[]) : []) {
    if (!w || typeof w.id !== 'string' || !w.id || seen.has(w.id) || (w.kind !== 'chest' && w.kind !== 'merchant') || !WANDERERS[w.kind]) continue;
    if (!finiteNumber(w.x) || !finiteNumber(w.y) || !finiteNumber(w.expiresAt)) continue;
    const materials: MaterialBundle = {};
    for (const { id } of VILLAGE_MATERIALS) {
      const amount = (w.materials as MaterialBundle | undefined)?.[id];
      if (finiteNumber(amount) && amount > 0) materials[id] = Math.floor(amount);
    }
    seen.add(w.id);
    items.push({
      id: w.id,
      kind: w.kind,
      x: Math.max(0, Math.min(VILLAGE_COLS - 1, Math.floor(w.x))),
      y: Math.max(0, Math.min(VILLAGE_ROWS - 1, Math.floor(w.y))),
      expiresAt: w.expiresAt,
      materials,
      goldHours: finiteNumber(w.goldHours) ? Math.max(0, w.goldHours) : 0,
    });
  }
  return { lastSpawnAt: finiteNumber(raw?.lastSpawnAt) ? raw.lastSpawnAt : now, items };
}

/** The saved 襲撃 state: a pending one that is malformed is dropped, and a missing clock starts a fresh interval. */
function restoreRaid(raw: Partial<VillageRaid> | undefined, now: number): VillageRaid {
  const p = raw?.pending as Partial<PendingRaid> | null | undefined;
  const pending =
    p && finiteNumber(p.arrivedAt) && finiteNumber(p.expiresAt) && finiteNumber(p.power) && finiteNumber(p.region)
      ? { arrivedAt: p.arrivedAt, expiresAt: p.expiresAt, power: Math.max(0, p.power), region: Math.max(0, Math.floor(p.region)) }
      : null;
  const r = raw?.report as Partial<RaidReport> | null | undefined;
  const report: RaidReport | null =
    r && finiteNumber(r.at) && (r.outcome === 'repelled' || r.outcome === 'damaged')
      ? { at: r.at, outcome: r.outcome, damaged: Array.isArray(r.damaged) ? r.damaged.filter((n): n is string => typeof n === 'string') : [] }
      : null;
  return {
    nextAt: finiteNumber(raw?.nextAt) ? raw.nextAt : now + RAID_INTERVAL_HOURS * 3600 * 1000,
    pending,
    report,
    won: finiteNumber(raw?.won) ? Math.max(0, Math.floor(raw.won)) : 0,
  };
}

function restoreQuests(raw: Partial<VillageQuestState> | undefined): VillageQuestState {
  const counts: Record<string, number> = {};
  if (raw?.counts && typeof raw.counts === 'object') {
    for (const [id, n] of Object.entries(raw.counts)) if (finiteNumber(n) && n > 0) counts[id] = Math.floor(n);
  }
  return {
    day: typeof raw?.day === 'string' ? raw.day : '',
    counts,
    claimed: Array.isArray(raw?.claimed) ? raw.claimed.filter((id): id is string => typeof id === 'string') : [],
  };
}

/** The saved 村の目標 record: ids once each (an id that no longer names a goal is kept: harmless), and a whole-number count. */
function restoreMilestones(raw: Partial<VillageMilestones> | undefined): VillageMilestones {
  return {
    claimed: Array.isArray(raw?.claimed) ? [...new Set(raw.claimed.filter((id): id is string => typeof id === 'string'))] : [],
    gathered: finiteNumber(raw?.gathered) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw.gathered))) : 0,
  };
}

/** The most of one material that is kept (so the count stays an exact whole number). */
const MATERIAL_CAP = Number.MAX_SAFE_INTEGER;

/** The saved materials: whole numbers from 0; a save from before the village had materials is given the starting amounts. */
function restoreMaterials(raw: Partial<Record<VillageMaterial, number>> | undefined): Record<VillageMaterial, number> {
  const materials = { ...VILLAGE_START_MATERIALS };
  if (!raw || typeof raw !== 'object') return materials;
  for (const { id } of VILLAGE_MATERIALS) {
    const value = raw[id];
    if (typeof value === 'number' && Number.isFinite(value)) materials[id] = Math.max(0, Math.min(MATERIAL_CAP, Math.floor(value)));
  }
  return materials;
}

/** The saved village: buildings that are malformed or of a kind that no longer exists are dropped, positions are
 *  pulled back onto the map, and a village without a 城 is replaced by a new one. Two buildings on the same tiles
 *  are left as they are (a layout can only get that way by editing the map's size); moving one sorts it out. */
function restoreVillage(raw: Partial<VillageState> | undefined): VillageState {
  if (!raw || !Array.isArray(raw.buildings)) return defaultVillage();
  const seen = new Set<string>();
  const buildings: PlacedBuilding[] = [];
  for (const item of raw.buildings as Partial<PlacedBuilding>[]) {
    if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !isBuildingKind(item.kind)) continue;
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || !Number.isFinite(item.level)) continue;
    const def = getBuilding(item.kind);
    const level = Math.max(0, Math.min(def.levels.length, Math.floor(item.level as number)));
    const upgrade = item.upgrade;
    const work =
      upgrade && Number.isFinite(upgrade.startedAt) && Number.isFinite(upgrade.seconds) && upgrade.seconds > 0 && level < def.levels.length
        ? { startedAt: upgrade.startedAt, seconds: Math.floor(upgrade.seconds) }
        : undefined;
    // A building with no level and no work under way would be an empty plot: it is not kept.
    if (level === 0 && !work) continue;
    // A move needs a finished building that can be moved, with no other work going on it.
    const m = item.move;
    const move =
      m && !work && level > 0 && def.movable && [m.startedAt, m.demolish, m.rebuild, m.toX, m.toY].every((n) => typeof n === 'number' && Number.isFinite(n))
        ? {
            startedAt: m.startedAt,
            demolish: Math.max(0, Math.floor(m.demolish)),
            rebuild: Math.max(0, Math.floor(m.rebuild)),
            toX: Math.max(0, Math.min(VILLAGE_COLS - def.w, Math.floor(m.toX))),
            toY: Math.max(0, Math.min(VILLAGE_ROWS - def.h, Math.floor(m.toY))),
          }
        : undefined;
    seen.add(item.id);
    buildings.push({
      id: item.id,
      kind: item.kind,
      x: Math.max(0, Math.min(VILLAGE_COLS - def.w, Math.floor(item.x as number))),
      y: Math.max(0, Math.min(VILLAGE_ROWS - def.h, Math.floor(item.y as number))),
      level,
      ...(work ? { upgrade: work } : {}),
      ...(move ? { move } : {}),
      ...(item.damaged === true && level > 0 && item.kind !== 'castle' && !def.decor ? { damaged: true } : {}),
    });
  }
  if (!buildings.some((b) => b.kind === 'castle')) return defaultVillage();
  const highest = buildings.reduce((max, b) => Math.max(max, Number(b.id.replace(/^b/, '')) || 0), 0);
  const nextId = typeof raw.nextId === 'number' && Number.isFinite(raw.nextId) ? Math.floor(raw.nextId) : 0;
  const now = Date.now();
  const extra = finiteNumber(raw.extraBuilders) ? Math.max(0, Math.min(EXTRA_BUILDER_GEMS.length, Math.floor(raw.extraBuilders))) : 0;
  return {
    buildings,
    nextId: Math.max(nextId, highest + 1, 1),
    materials: restoreMaterials(raw.materials),
    extraBuilders: extra,
    quests: restoreQuests(raw.quests),
    wanderers: restoreWanderers(raw.wanderers, now),
    raid: restoreRaid(raw.raid, now),
    milestones: restoreMilestones(raw.milestones),
  };
}

/** The saved expeditions under way: one entry per slot, dropping any that are malformed or whose
 *  kind no longer exists (the heroes on it are simply free again). */
function restoreExpeditions(raw: Partial<SaveData['expeditions']> | undefined): SaveData['expeditions'] {
  const saved = Array.isArray(raw?.slots) ? raw.slots : [];
  const slots = Array.from({ length: EXPEDITION_SLOTS }, (_, i): ExpeditionRun | null => {
    const run = saved[i] as Partial<ExpeditionRun> | null | undefined;
    if (!run || typeof run.id !== 'string' || !getExpedition(run.id)) return null;
    if (typeof run.startedAt !== 'number' || !Number.isFinite(run.startedAt)) return null;
    const heroIds = Array.isArray(run.heroIds) ? run.heroIds.filter((id): id is string => typeof id === 'string') : [];
    const bonus = typeof run.bonus === 'number' && Number.isFinite(run.bonus) ? Math.max(1, Math.min(run.bonus, 5)) : 1;
    return { id: run.id, heroIds, startedAt: run.startedAt, bonus };
  });
  return { slots };
}

/** Keeps a saved social state, filling in anything missing (an older save, or
 *  one from before 軍団 existed) and making sure the player has a valid ID. */
function restoreSocial(raw: Partial<SocialState> | undefined, fallback: SocialState): SocialState {
  if (!raw || !Array.isArray(raw.friends)) return fallback;
  return {
    playerId: typeof raw.playerId === 'string' && raw.playerId.length === 8 ? raw.playerId : generatePlayerId(),
    friends: raw.friends,
    incoming: Array.isArray(raw.incoming) ? raw.incoming : [],
    outgoing: Array.isArray(raw.outgoing) ? raw.outgoing : [],
    groups: Array.isArray(raw.groups) ? raw.groups : [],
    giftSentDay: raw.giftSentDay && typeof raw.giftSentDay === 'object' ? raw.giftSentDay : {},
  };
}

export const SaveSystem = {
  createDefault(): SaveData {
    // Starters are drawn from the illustrated roster, not the un-illustrated
    // base 12, so a brand-new save's showcase hero (highest rarity owned)
    // has real art instead of falling back to the bare procedural medallion
    // on the very first screen a player sees.
    const heroes: HeroData[] = [
      createHeroInstance('mizuki', 'starter-1'),
      createHeroInstance('ember', 'starter-2'),
      createHeroInstance('lumi', 'starter-3'),
    ];
    return {
      version: 1,
      gold: BigNumber.from(500).toJSON(),
      gems: 1500,
      skillEssence: 300,
      heroes,
      decks: [{ name: 'デッキ1', front: [heroes[0].id, heroes[1].id, null], back: [heroes[2].id, null] }],
      activeDeck: 0,
      stageProgress: 0,
      updatedAt: Date.now(),
      playerName: 'プレイヤー',
      playerLevel: 1,
      playerExp: 0,
      tutorial: { opening: false, step: 0, done: false },
      homeHeroId: '',
      gachaPity: {},
      missions: emptyMissions(),
      stamina: [50, 50],
      staminaAt: Date.now(),
      gifts: [],
      mails: [],
      deliveredInboxIds: [],
      readNotices: [],
      social: SocialSystem.createDefaultState(Date.now()),
      chat: ChatSystem.createDefaultState(Date.now()),
      shop: { purchases: {} },
      settings: SettingsSystem.createDefaultState(),
      reports: [],
      infiniteMode: { bestScore: 0, bestSurvivalSeconds: 0, bestEnemiesDefeated: 0, bestDifficultyReached: 0, totalRuns: 0 },
      phaseMaterials: 5,
      storyFlags: {
        regionIntro: Array(REGION_COUNT).fill(false),
        regionOutro: Array(REGION_COUNT).fill(false),
        finalIntro: false,
        ending: false,
      },
      extraProgress: 0,
      items: {},
      equipment: [],
      premium: { expiresAt: 0, dailyDay: '' },
      loginBonus: { month: '', claimed: [] },
      supply: { day: '', claimed: [], bonus: false },
      idle: { lastClaimAt: Date.now(), adDay: '', adCount: 0 },
      expeditions: { slots: Array.from({ length: EXPEDITION_SLOTS }, () => null) },
      village: defaultVillage(),
    };
  },

  load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.createDefault();
      const parsed = JSON.parse(raw) as Partial<SaveData> & { party?: PartyFormation };
      if (!parsed.version) return this.createDefault();
      // Spread over a fresh default so a save written before a field (like
      // playerName) existed still gets a sane value instead of undefined.
      const merged = { ...this.createDefault(), ...parsed } as SaveData & { party?: PartyFormation; unread?: unknown };
      merged.decks = restoreDecks(parsed, merged.decks);
      merged.social = restoreSocial(parsed.social, merged.social);
      merged.chat = Array.isArray(parsed.chat?.messages) ? { messages: parsed.chat.messages } : merged.chat;
      merged.shop = parsed.shop && typeof parsed.shop.purchases === 'object' && parsed.shop.purchases ? { purchases: parsed.shop.purchases } : merged.shop;
      merged.settings = SettingsSystem.restore(parsed.settings);
      merged.reports = SettingsSystem.restoreReports(parsed.reports);
      if (typeof parsed.staminaAt !== 'number' || !Number.isFinite(parsed.staminaAt)) merged.staminaAt = Date.now();
      merged.playerLevel = Number.isInteger(parsed.playerLevel) ? Math.max(1, Math.min(MAX_PLAYER_LEVEL, parsed.playerLevel!)) : 1;
      // A save from before the tutorial existed belongs to someone already playing: nothing to teach.
      const t = parsed.tutorial;
      merged.tutorial =
        t && typeof t.opening === 'boolean' && Number.isInteger(t.step) && typeof t.done === 'boolean'
          ? { opening: t.opening, step: Math.max(0, t.step), done: t.done }
          : { opening: true, step: 0, done: true };
      merged.missions = loadMissions(parsed.missions);
      merged.gachaPity = {};
      for (const [id, n] of Object.entries(parsed.gachaPity ?? {})) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) merged.gachaPity[id] = Math.floor(n);
      merged.homeHeroId = typeof parsed.homeHeroId === 'string' ? parsed.homeHeroId : '';
      merged.playerExp = typeof parsed.playerExp === 'number' && parsed.playerExp >= 0 ? Math.floor(parsed.playerExp) : 0;
      // The stamina maximum follows the level (a save from before levels still holds 50).
      merged.stamina = [Math.min(merged.stamina[0], Math.max(merged.stamina[1], staminaMaxFor(merged.playerLevel))), Math.max(merged.stamina[1], staminaMaxFor(merged.playerLevel))];
      merged.activeDeck = Number.isInteger(parsed.activeDeck) && parsed.activeDeck! >= 0 && parsed.activeDeck! < merged.decks.length ? parsed.activeDeck! : 0;
      // A hero saved before phase / skills existed lacks those fields.
      merged.heroes = merged.heroes.map((hero) => ({
        ...hero,
        phase: hero.phase ?? 1,
        skillLevels: hero.skillLevels ?? Array(MAX_SKILL_SLOTS).fill(1),
        // A save from before the level cap may hold a level above it.
        level: Math.min(hero.level, MAX_LEVEL),
        exp: hero.level >= MAX_LEVEL ? 0 : hero.exp,
      }));
      merged.decks = merged.decks.map((deck) => dropRepeatedCharacters(deck, merged.heroes));
      restoreInventory(merged, parsed);
      delete merged.party;
      // Replaced by values derived from the real inbox (InboxSystem.getUnread).
      delete merged.unread;
      return merged;
    } catch {
      return this.createDefault();
    }
  },

  save(data: SaveData): void {
    data.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage can fail (quota, private mode) - progress just stays in-memory.
    }
  },

  getGold(data: SaveData): BigNumber {
    return BigNumber.fromJSON(data.gold);
  },

  addGold(data: SaveData, amount: BigNumber): void {
    data.gold = this.getGold(data).add(amount).toJSON();
  },

  /** 木材 / 鉄 / 石 in hand. */
  getMaterial(data: SaveData, id: VillageMaterial): number {
    return data.village.materials[id] ?? 0;
  },

  /** Adds 素材 to the village's store (whole numbers; anything else is ignored). */
  addMaterials(data: SaveData, bundle: MaterialBundle): void {
    for (const { id } of VILLAGE_MATERIALS) {
      const amount = Math.floor(bundle[id] ?? 0);
      if (amount > 0) {
        data.village.materials[id] = Math.min(MATERIAL_CAP, (data.village.materials[id] ?? 0) + amount);
        // Counted for the 村の目標 ("素材を累計 N 集める").
        data.village.milestones.gathered = Math.min(MATERIAL_CAP, data.village.milestones.gathered + amount);
      }
    }
  },

  /** The materials of `bundle` that there are not enough of in hand (none when it can be paid). */
  missingMaterials(data: SaveData, bundle: MaterialBundle): VillageMaterial[] {
    return VILLAGE_MATERIALS.filter(({ id }) => (bundle[id] ?? 0) > this.getMaterial(data, id)).map(({ id }) => id);
  },

  /** Pays `bundle` out of the store. False, with nothing taken, when any of it is short. */
  spendMaterials(data: SaveData, bundle: MaterialBundle): boolean {
    if (this.missingMaterials(data, bundle).length > 0) return false;
    for (const { id } of VILLAGE_MATERIALS) data.village.materials[id] = this.getMaterial(data, id) - (bundle[id] ?? 0);
    return true;
  },

  getItem(data: SaveData, id: ItemId): number {
    return data.items[id] ?? 0;
  },

  addItem(data: SaveData, id: ItemId, amount: number): void {
    data.items[id] = this.getItem(data, id) + amount;
  },

  /** False (and nothing taken) if there is not that much. */
  spendItem(data: SaveData, id: ItemId, amount: number): boolean {
    if (this.getItem(data, id) < amount) return false;
    data.items[id] = this.getItem(data, id) - amount;
    return true;
  },

  addGems(data: SaveData, amount: number): void {
    data.gems += amount;
  },

  addPhaseMaterials(data: SaveData, amount: number): void {
    data.phaseMaterials += amount;
  },

  spendGems(data: SaveData, amount: number): boolean {
    if (data.gems < amount) return false;
    data.gems -= amount;
    return true;
  },

  spendGold(data: SaveData, amount: BigNumber): boolean {
    const have = this.getGold(data);
    if (have.lt(amount)) return false;
    data.gold = have.sub(amount).toJSON();
    return true;
  },

  /** Restores stamina up to its max (never above). Returns how much it actually added. */
  recoverStamina(data: SaveData, amount: number): number {
    StaminaSystem.refresh(data);
    const [current, max] = data.stamina;
    const next = Math.min(max, current + amount);
    data.stamina = [next, max];
    return Math.max(0, next - current);
  },

  /** Wipes this device's save and starts over with a brand-new one (new player
   *  ID included). Returns the fresh save, already stored. */
  reset(): SaveData {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored, or storage is unavailable: the fresh default below is all there is.
    }
    const fresh = this.createDefault();
    this.save(fresh);
    return fresh;
  },

  addSkillEssence(data: SaveData, amount: number): void {
    data.skillEssence += amount;
  },

  /** Spends skillEssence to raise one hero's skill (by slot index) one
   *  level, if that slot is unlocked, not already maxed, and affordable.
   *  Returns false (no state changed) otherwise. */
  upgradeHeroSkill(data: SaveData, heroId: string, slotIndex: number): boolean {
    const hero = this.getHero(data, heroId);
    if (!hero) return false;
    if (!isSkillSlotUnlocked(slotIndex, hero.level)) return false;
    const currentLevel = hero.skillLevels[slotIndex] ?? 1;
    if (currentLevel >= MAX_SKILL_LEVEL) return false;
    const cost = skillUpgradeCost(currentLevel);
    if (data.skillEssence < cost) return false;
    data.skillEssence -= cost;
    hero.skillLevels[slotIndex] = currentLevel + 1;
    return true;
  },

  /** Adds a newly pulled hero. A repeat of an owned character is added too, as its own copy
   *  (the 強化 screen can fuse copies, but a pull never turns one into anything else). */
  addHero(data: SaveData, hero: HeroData): HeroPullOutcome {
    const kind = this.getCopies(data, hero).length === 0 ? 'new' : 'copy';
    data.heroes.push(hero);
    return { hero, kind };
  },

  /** Every owned copy of the same character as `hero` (itself included). */
  getCopies(data: SaveData, hero: HeroData): HeroData[] {
    return data.heroes.filter((h) => h.heroId === hero.heroId);
  },

  isInAnyDeck(data: SaveData, id: string): boolean {
    return data.decks.some((deck) => deck.front.includes(id) || deck.back.includes(id));
  },

  /** The other copies of `hero`'s character that could be fused into it,
   *  cheapest to lose first: ones standing in no deck, then the lowest level. */
  fusionMaterials(data: SaveData, hero: HeroData): HeroData[] {
    const spare = (h: HeroData) => (this.isInAnyDeck(data, h.id) ? 1 : 0);
    return this.getCopies(data, hero)
      .filter((h) => h.id !== hero.id)
      .sort((a, b) => spare(a) - spare(b) || a.level - b.level || a.exp - b.exp);
  },

  /** 合成: consumes the copy `materialId` to raise `baseId` by 1 phase. Both
   *  must be copies of the same character, and the base not yet at MAX_PHASE.
   *  A deck that had the material standing in it gets the base there instead
   *  (it can't hold both). False (no change) when any of that doesn't hold. */
  fuseHero(data: SaveData, baseId: string, materialId: string): boolean {
    const base = this.getHero(data, baseId);
    const material = this.getHero(data, materialId);
    if (!base || !material || base.id === material.id || base.heroId !== material.heroId || base.phase >= MAX_PHASE) return false;
    // What the copy was wearing goes back to the bag rather than vanishing with it.
    for (const slot of EQUIP_SLOTS) {
      const worn = material.gear[slot];
      if (worn) data.equipment.push(worn);
    }
    // The fused copy stood on Home? Its character carries on there, as the copy it was fused into.
    if (data.homeHeroId === material.id) data.homeHeroId = base.id;
    data.heroes = data.heroes.filter((h) => h.id !== material.id);
    for (const deck of data.decks) {
      const hasBase = deck.front.includes(base.id) || deck.back.includes(base.id);
      const swap = (id: string | null) => (id === material.id ? (hasBase ? null : base.id) : id);
      deck.front = deck.front.map(swap);
      deck.back = deck.back.map(swap);
    }
    base.phase += 1;
    recordMission(data, 'hero_enhance');
    return true;
  },

  /** Spends one phase material to raise a hero's phase by 1 (capped at
   *  MAX_PHASE). False (no change) if out of materials or already maxed. */
  usePhaseMaterial(data: SaveData, heroId: string): boolean {
    const hero = this.getHero(data, heroId);
    if (!hero || hero.phase >= MAX_PHASE || data.phaseMaterials <= 0) return false;
    data.phaseMaterials -= 1;
    hero.phase += 1;
    recordMission(data, 'hero_enhance');
    return true;
  },

  /** The hero on the Home screen. There is always one: if none was chosen (or the chosen
   *  one is gone - fused away), the best owned hero is taken and remembered. */
  getHomeHero(data: SaveData): HeroData | undefined {
    const chosen = this.getHero(data, data.homeHeroId);
    if (chosen) return chosen;
    if (data.heroes.length === 0) return undefined;
    let best = data.heroes[0];
    for (const hero of data.heroes) if (hero.rarity >= best.rarity) best = hero;
    data.homeHeroId = best.id;
    return best;
  },

  /** Makes an owned hero the Home character. False (no change) for an id that is not owned. */
  setHomeHero(data: SaveData, heroId: string): boolean {
    if (!this.getHero(data, heroId)) return false;
    data.homeHeroId = heroId;
    return true;
  },

  getHero(data: SaveData, id: string): HeroData | undefined {
    return data.heroes.find((h) => h.id === id);
  },

  getDeckHeroes(data: SaveData, deckIndex: number): { front: HeroData[]; back: HeroData[] } {
    const deck = data.decks[deckIndex];
    const resolve = (id: string | null) => (id ? this.getHero(data, id) : undefined);
    return {
      front: deck.front.map(resolve).filter((h): h is HeroData => !!h),
      back: deck.back.map(resolve).filter((h): h is HeroData => !!h),
    };
  },

  /** The deck that fights: what stage battles and Infinite Mode field. */
  getPartyHeroes(data: SaveData): { front: HeroData[]; back: HeroData[] } {
    return this.getDeckHeroes(data, data.activeDeck);
  },

  countDeckHeroes(data: SaveData, deckIndex: number): number {
    const { front, back } = this.getDeckHeroes(data, deckIndex);
    return front.length + back.length;
  },

  /** Puts a hero in (or, with null, empties) a slot of one deck. A deck holds
   *  one copy of each character, so the slot a copy of the same character
   *  stood in (this very hero included) is emptied. */
  setDeckSlot(data: SaveData, deckIndex: number, row: Row, slot: number, heroId: string | null): void {
    const deck = data.decks[deckIndex];
    const character = heroId === null ? undefined : this.getHero(data, heroId)?.heroId;
    const sameCharacter = (id: string | null): boolean => id !== null && (id === heroId || (character !== undefined && this.getHero(data, id)?.heroId === character));
    for (const r of ['front', 'back'] as const) {
      deck[r] = deck[r].map((id, i) => (r === row && i === slot ? id : sameCharacter(id) ? null : id));
    }
    deck[row][slot] = heroId;
  },

  setDeckFormation(data: SaveData, deckIndex: number, formation: Pick<Deck, 'front' | 'back'>): void {
    const deck = data.decks[deckIndex];
    deck.front = [...formation.front];
    deck.back = [...formation.back];
  },

  /** Appends an empty deck and returns its index, or null at the cap. */
  addDeck(data: SaveData, name: string): number | null {
    if (data.decks.length >= MAX_DECKS) return null;
    data.decks.push(emptyDeck(cleanDeckName(name, defaultDeckName(data.decks))));
    return data.decks.length - 1;
  },

  renameDeck(data: SaveData, deckIndex: number, name: string): void {
    const deck = data.decks[deckIndex];
    deck.name = cleanDeckName(name, deck.name);
  },

  /** False (and no change) for an empty deck: it couldn't fight. */
  setActiveDeck(data: SaveData, deckIndex: number): boolean {
    if (!data.decks[deckIndex] || this.countDeckHeroes(data, deckIndex) === 0) return false;
    data.activeDeck = deckIndex;
    return true;
  },

  /** False (and no change) for the deck in use - which also means the last
   *  remaining deck can never be removed. */
  removeDeck(data: SaveData, deckIndex: number): boolean {
    if (!data.decks[deckIndex] || deckIndex === data.activeDeck) return false;
    data.decks.splice(deckIndex, 1);
    if (deckIndex < data.activeDeck) data.activeDeck -= 1;
    return true;
  },

  grantExp(data: SaveData, heroId: string, exp: number): void {
    const hero = this.getHero(data, heroId);
    if (!hero || hero.level >= MAX_LEVEL) return;
    hero.exp += exp;
    while (hero.level < MAX_LEVEL && hero.exp >= expToNextLevel(hero.level)) {
      hero.exp -= expToNextLevel(hero.level);
      hero.level += 1;
    }
    if (hero.level >= MAX_LEVEL) hero.exp = 0;
  },

  clearStage(data: SaveData, stageIndex: number): void {
    if (stageIndex >= data.stageProgress) data.stageProgress = stageIndex + 1;
  },

  /** Mirrors clearStage() but advances the separate Extra index space
   *  instead of the main `stageProgress`. */
  clearExtraStage(data: SaveData, extraIndex: number): void {
    if (extraIndex >= data.extraProgress) data.extraProgress = extraIndex + 1;
  },

  markRegionIntroSeen(data: SaveData, regionIndex: number): void {
    data.storyFlags.regionIntro[regionIndex] = true;
  },

  markRegionOutroSeen(data: SaveData, regionIndex: number): void {
    data.storyFlags.regionOutro[regionIndex] = true;
  },

  markFinalIntroSeen(data: SaveData): void {
    data.storyFlags.finalIntro = true;
  },

  markOpeningSeen(data: SaveData): void {
    data.tutorial.opening = true;
  },

  markEndingSeen(data: SaveData): void {
    data.storyFlags.ending = true;
  },

  /** Records an Infinite Mode run, bumping each personal-best field
   *  independently (a longer survival time and a higher score don't
   *  necessarily come from the same run). */
  recordInfiniteModeResult(data: SaveData, result: InfiniteModeRunResult): void {
    const best = data.infiniteMode;
    best.totalRuns += 1;
    best.bestScore = Math.max(best.bestScore, result.score);
    best.bestSurvivalSeconds = Math.max(best.bestSurvivalSeconds, result.survivalSeconds);
    best.bestEnemiesDefeated = Math.max(best.bestEnemiesDefeated, result.enemiesDefeated);
    best.bestDifficultyReached = Math.max(best.bestDifficultyReached, result.difficultyReached);
  },
};
