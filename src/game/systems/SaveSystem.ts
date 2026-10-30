import { BigNumber } from './BigNumber';
import { DUPLICATE_GOLD_REWARD } from './GachaSystem';
import { createHeroInstance } from '../data/heroes';
import { BACK_SLOTS, FRONT_SLOTS, MAX_DECKS, cleanDeckName, defaultDeckName, emptyDeck } from './DeckSystem';
import { REGION_COUNT } from '../data/regions';
import { EQUIP_SLOTS, MAX_LEVEL, MAX_PHASE, emptyGear, type EquipmentItem, type HeroData, type HeroGear, type Row } from '../types';
import { getEquipDef } from '../data/equipment';
import { isItemId, type ItemId } from '../data/items';
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
  /** 放置報酬: epoch ms it has been piling up from, and today's count of ads watched to speed it. */
  idle: { lastClaimAt: number; adDay: string; adCount: number };
}

export interface InfiniteModeRunResult {
  score: number;
  survivalSeconds: number;
  enemiesDefeated: number;
  difficultyReached: number;
}

export interface HeroPullOutcome {
  hero: HeroData;
  /** 'new': first of this character. 'copy': a repeat, kept in the roster as
   *  material for 合成. 'gold': a repeat nothing could use any more (the owned
   *  copies already reach MAX_PHASE), paid out as `duplicateGold` instead. */
  kind: 'new' | 'copy' | 'gold';
  duplicateGold: BigNumber;
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
  const idle = parsed.idle;
  merged.idle = {
    lastClaimAt: typeof idle?.lastClaimAt === 'number' && Number.isFinite(idle.lastClaimAt) ? idle.lastClaimAt : Date.now(),
    adDay: typeof idle?.adDay === 'string' ? idle.adDay : '',
    adCount: typeof idle?.adCount === 'number' ? Math.max(0, Math.floor(idle.adCount)) : 0,
  };
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
      idle: { lastClaimAt: Date.now(), adDay: '', adCount: 0 },
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

  /** Adds a newly pulled hero. A repeat of an owned character is kept as its
   *  own copy, to be fused (fuseHero) into another copy for +1 phase - unless
   *  the copies held already cover what's left to MAX_PHASE, in which case it
   *  pays gold instead of piling up in the roster. */
  addHero(data: SaveData, hero: HeroData): HeroPullOutcome {
    const copies = this.getCopies(data, hero);
    if (copies.length === 0) {
      data.heroes.push(hero);
      return { hero, kind: 'new', duplicateGold: BigNumber.ZERO };
    }
    const bestPhase = Math.max(...copies.map((c) => c.phase));
    if (bestPhase + (copies.length - 1) < MAX_PHASE) {
      data.heroes.push(hero);
      return { hero, kind: 'copy', duplicateGold: BigNumber.ZERO };
    }
    const duplicateGold = BigNumber.from(DUPLICATE_GOLD_REWARD[hero.rarity]);
    this.addGold(data, duplicateGold);
    return { hero, kind: 'gold', duplicateGold };
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
