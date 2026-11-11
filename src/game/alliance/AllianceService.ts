import type {
  AllianceBackend,
  AllianceDetail,
  AlliancePerks,
  AllianceReward,
  AllianceSummary,
  CreateAllianceParams,
  DonationKind,
  DonationResult,
  HelperHero,
  PlayerProfile,
  RaidOutcome,
  RaidTicket,
  Result,
} from './AllianceBackend';
import { fail, ok } from './AllianceBackend';
import { LocalAllianceBackend } from './LocalAllianceBackend';
import {
  ALLIANCE_CREATE_GEMS,
  DONATIONS,
  SHOP_ITEMS,
  WAR_STAGE_POINTS,
  allianceStaminaBonus,
  getShopItem,
  perksOfSave,
  weekIdOf,
  type ShopItem,
} from '../data/alliance';
import { heroSeedFromId } from '../data/heroes';
import { isItemId } from '../data/items';
import { staminaMaxFor } from '../data/playerLevel';
import { VILLAGE_MATERIALS } from '../data/village';
import { IdleSystem } from '../systems/IdleSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SaveSystem, type SaveData } from '../systems/SaveSystem';
import { isAllianceConfigured } from '../systems/firebaseConfig';
import type { EquipmentItem, EquipSlot, HeroData } from '../types';
import { EQUIP_SLOTS } from '../types';

/**
 * 同盟の、画面とゲームが使う入口 (設計: docs/ALLIANCE_DESIGN.md)。画面は、同盟の状態を、ここだけを通して読み書きする。
 *
 * - お金や素材を払う操作 (create / donate / buy / claim ...) は、ここが、セーブから払い、Backend に頼み、失敗したら払い戻す。
 * - 同盟コインは、Backend が持つ (AllianceDetail.coins)。報酬の `coins` は、Backend が、受け取りのときに足す。ここでは足さない。
 * - Backend は、Firebase が設定されていれば Online、なければ Local (疑似メンバー)。`backend()` は、どちらかに振り分ける窓口で、
 *   読み取りと、お金のかからない操作 (参加・設定・役職・招待など) に、画面が直接使ってよい。
 */

// ---------------------------------------------------------------------------------------------- どの Backend か

/** いま使っているセーブ (Local の Backend が読む)。profile / cached / refresh などが呼ばれるたびに、最新のものに差し替わる。 */
let currentSave: SaveData | undefined;
/** 最後に読み込んだ、自分の同盟 (undefined = このセッションでは、まだ)。 */
let lastDetail: AllianceDetail | null | undefined;

let local: LocalAllianceBackend | undefined;
let online: Promise<AllianceBackend | null> | undefined;

function remember(save: SaveData): SaveData {
  if (currentSave !== save) {
    currentSave = save;
    lastDetail = undefined;
  }
  return save;
}

function localBackend(): LocalAllianceBackend {
  if (!local) {
    local = new LocalAllianceBackend(() => {
      if (!currentSave) throw new Error('AllianceService: no save yet (call profile / cached / refresh first)');
      return currentSave;
    });
  }
  return local;
}

/** Online の Backend (alliance/OnlineAllianceBackend.ts) を、あれば読み込む。 */
function onlineBackend(): Promise<AllianceBackend | null> {
  if (!online) {
    online = (async () => {
      try {
        const files = import.meta.glob('./OnlineAllianceBackend.ts');
        const load = Object.values(files)[0];
        if (!load) return null;
        const mod = (await load()) as { OnlineAllianceBackend?: new () => AllianceBackend };
        return mod.OnlineAllianceBackend ? new mod.OnlineAllianceBackend() : null;
      } catch {
        return null;
      }
    })();
  }
  return online;
}

async function pick(): Promise<AllianceBackend> {
  if (isAllianceConfigured()) {
    const backend = await onlineBackend();
    if (backend) return backend;
  }
  return localBackend();
}

type AnyMethod = (...args: unknown[]) => unknown;

/** Online か Local かを、呼ぶたびに決めて、そちらに任せる窓口。 */
const routing: AllianceBackend = new Proxy({} as AllianceBackend, {
  get(_target, prop: string) {
    if (prop === 'mode') return isAllianceConfigured() && online !== undefined ? 'online' : 'local';
    if (prop === 'subscribe') {
      return (me: PlayerProfile, onChange: () => void): (() => void) => {
        let off: (() => void) | undefined;
        let dead = false;
        void pick().then((b) => {
          if (!dead) off = b.subscribe(me, onChange);
        });
        return () => {
          dead = true;
          off?.();
        };
      };
    }
    return (...args: unknown[]) => pick().then((b) => (b as unknown as Record<string, AnyMethod>)[prop](...args));
  },
});

// ---------------------------------------------------------------------------------------------- 中の道具

/** 素材 (木・鉄・石) から、合計 `total` 個を、いちばん多いものから順に払う。足りなければ null (何も払わない)。 */
function payMaterials(save: SaveData, total: number): Record<string, number> | null {
  const have = VILLAGE_MATERIALS.map(({ id }) => ({ id, n: SaveSystem.getMaterial(save, id) }));
  if (have.reduce((s, h) => s + h.n, 0) < total) return null;
  const paid: Record<string, number> = {};
  let left = total;
  while (left > 0) {
    have.sort((a, b) => b.n - a.n);
    const top = have[0];
    const take = Math.min(left, Math.max(1, top.n - (have[1]?.n ?? 0)));
    top.n -= take;
    paid[top.id] = (paid[top.id] ?? 0) + take;
    left -= take;
  }
  SaveSystem.spendMaterials(save, paid);
  return paid;
}

/** 入っている同盟のLvで、スタミナ上限を合わせる (入ったとき・抜けたとき・Lvが上がったとき)。 */
function syncStaminaMax(save: SaveData): void {
  const max = staminaMaxFor(save.playerLevel) + allianceStaminaBonus(save);
  if (save.stamina[1] === max) return;
  // いまの量は、そのまま (上限を越えた分は、使えば減る。贈り物でも、そうなる)。
  save.stamina = [save.stamina[0], max];
}

function applyReward(save: SaveData, reward: AllianceReward): void {
  if (reward.gems) SaveSystem.addGems(save, reward.gems);
  if (reward.phaseMaterials) SaveSystem.addPhaseMaterials(save, reward.phaseMaterials);
  for (const [item, amount] of Object.entries(reward.items ?? {})) if (isItemId(item) && amount > 0) SaveSystem.addItem(save, item, amount);
  if (reward.goldHours && reward.goldHours > 0) SaveSystem.addGold(save, IdleSystem.perHour(save).gold.mul(reward.goldHours));
  // coins: Backend が、受け取りのときに足している。 badge: いまは、表示だけ。
}

function hasAlliance(save: SaveData): boolean {
  return save.alliance.allianceId !== null;
}

// ---------------------------------------------------------------------------------------------- 入口

export const AllianceService = {
  /** どちらの Backend にも使える窓口 (読み取り・お金のかからない操作用)。Local のときは、最後に渡されたセーブを使う。 */
  backend(): AllianceBackend {
    return routing;
  },

  /** 'online' / 'local'。 */
  mode(): 'online' | 'local' {
    return isAllianceConfigured() ? 'online' : 'local';
  },

  /** 自分のプロフィール (uid = フレンドID, 名前, プレイヤーLv, いまのデッキの総合力)。 */
  profile(save: SaveData): PlayerProfile {
    remember(save);
    const { front, back } = SaveSystem.getPartyHeroes(save);
    let power = 0;
    try {
      power = ProgressionSystem.computeDeckTotals([...front, ...back]).power.toNumber();
    } catch {
      power = 0;
    }
    return { uid: save.social.playerId, name: save.playerName || 'プレイヤー', level: save.playerLevel, power: Number.isFinite(power) ? Math.max(0, Math.min(1e280, power)) : 1e280 };
  },

  /** 入っている同盟の、ゲーム側の恩恵 (同期)。放置ゴールド・経験値素材・スタミナ上限は、ゲームの側で、これを使っている。 */
  membership(save: SaveData): { allianceId: string | null; level: number; perks: AlliancePerks } {
    return { allianceId: save.alliance.allianceId, level: save.alliance.level, perks: perksOfSave(save) };
  },

  /** このセッションで最後に読み込んだ同盟 (undefined = まだ。null = 入っていない)。画面を、すぐ描くために使う。 */
  cached(save: SaveData): AllianceDetail | null | undefined {
    remember(save);
    return lastDetail;
  },

  /** 読み込み直す: 同盟の状態、時間の経過 (疑似メンバーの動き)、貯めていた同盟ポイントの送信、助っ人の最新化、スタミナ上限の更新。 */
  async refresh(save: SaveData): Promise<Result<AllianceDetail | null>> {
    remember(save);
    const me = AllianceService.profile(save);
    await AllianceService.flushPending(save);
    const backend = await pick();
    let result = await backend.load(me);
    if (!result.ok) return result;
    let detail = result.value;
    // Online では、入っている同盟を、ここでセーブに写す (Local は、Backend が書いている)。
    save.alliance.allianceId = detail ? detail.summary.id : null;
    save.alliance.level = detail ? detail.summary.level : 0;
    // 助っ人に登録したキャラのLv・フェーズなどが変わっていたら、登録し直す。
    if (detail && save.alliance.helperHeroId) {
      const snapshot = AllianceService.helperSnapshot(save, save.alliance.helperHeroId);
      const stored = detail.me.helper;
      if (!snapshot) {
        await backend.setHelper(me, null);
        save.alliance.helperHeroId = '';
      } else if (!stored || stored.heroId !== snapshot.heroId || stored.level !== snapshot.level || stored.phase !== snapshot.phase || Math.abs(stored.power - snapshot.power) > 1e-6 * Math.max(1, snapshot.power)) {
        const set = await backend.setHelper(me, snapshot);
        if (set.ok) {
          result = await backend.load(me);
          if (result.ok) detail = result.value;
        }
      }
    }
    if (!detail) save.alliance.helperHeroId = '';
    syncStaminaMax(save);
    lastDetail = detail;
    SaveSystem.save(save);
    return ok(detail);
  },

  /** 同盟ポイントに換えていなかった、メインステージの初クリアを送る。 */
  async flushPending(save: SaveData): Promise<void> {
    if (!hasAlliance(save) || save.alliance.pendingStagePoints <= 0) return;
    const count = save.alliance.pendingStagePoints;
    const r = await (await pick()).addWarPoints(AllianceService.profile(save), 'stages', count * WAR_STAGE_POINTS);
    if (r.ok) {
      save.alliance.pendingStagePoints = Math.max(0, save.alliance.pendingStagePoints - count);
      SaveSystem.save(save);
    }
  },

  /** メインステージを、初めてクリアした (SaveSystem.clearStage が、数だけ先に記録している)。対抗戦のポイントを、すぐ送る。 */
  async recordStageClear(save: SaveData, _stageIndex: number): Promise<void> {
    await AllianceService.flushPending(save);
  },

  // ---- 作る・寄付・ボス

  /** 同盟を作る: 魔晶石300個を払ってから Backend に頼み、失敗したら返す。 */
  async create(save: SaveData, params: CreateAllianceParams): Promise<Result<AllianceSummary>> {
    remember(save);
    if (hasAlliance(save)) return fail('already_in_alliance', 'すでに同盟に入っています。');
    if (!SaveSystem.spendGems(save, ALLIANCE_CREATE_GEMS)) return fail('not_enough', `魔晶石が足りません（${ALLIANCE_CREATE_GEMS}個かかります）。`);
    const result = await (await pick()).create(AllianceService.profile(save), params);
    if (!result.ok) SaveSystem.addGems(save, ALLIANCE_CREATE_GEMS);
    else {
      save.alliance.allianceId = result.value.id;
      save.alliance.level = result.value.level;
      lastDetail = undefined;
    }
    SaveSystem.save(save);
    return result;
  },

  /** 寄付する: 表のぶんを払ってから Backend に頼み、失敗したら返す。 */
  async donate(save: SaveData, kind: DonationKind): Promise<Result<DonationResult>> {
    remember(save);
    if (!hasAlliance(save)) return fail('not_in_alliance', '同盟に入っていません。');
    const rule = DONATIONS[kind];
    if (!rule) return fail('bad_input', 'その寄付は、できません。');
    let refund: () => void;
    if (rule.cost.gems) {
      const gems = rule.cost.gems;
      if (!SaveSystem.spendGems(save, gems)) return fail('not_enough', `魔晶石が足りません（${gems}個）。`);
      refund = () => SaveSystem.addGems(save, gems);
    } else if (rule.cost.goldHours) {
      const gold = IdleSystem.perHour(save).gold.mul(rule.cost.goldHours);
      if (!SaveSystem.spendGold(save, gold)) return fail('not_enough', 'ゴールドが足りません。');
      refund = () => SaveSystem.addGold(save, gold);
    } else {
      const total = rule.cost.materials ?? 0;
      const paid = payMaterials(save, total);
      if (!paid) return fail('not_enough', `素材が足りません（木材・鉄・石の合計で${total}個）。`);
      refund = () => SaveSystem.addMaterials(save, paid);
    }
    const result = await (await pick()).donate(AllianceService.profile(save), kind);
    if (!result.ok) refund();
    else {
      if (result.value.levelUp) save.alliance.level = result.value.levelUp;
      syncStaminaMax(save);
    }
    SaveSystem.save(save);
    return result;
  },

  /** 1回の挑戦を始める (挑戦回数を1つ使う)。返る切符で戦い、`finishRaid` で結果を出す。 */
  async beginRaid(save: SaveData): Promise<Result<RaidTicket>> {
    remember(save);
    return (await pick()).beginRaid(AllianceService.profile(save));
  },

  /** 戦って与えたダメージを出す (上限で切られる)。 */
  async finishRaid(save: SaveData, ticket: RaidTicket, damage: number): Promise<Result<RaidOutcome>> {
    remember(save);
    const result = await (await pick()).finishRaid(AllianceService.profile(save), ticket, damage);
    SaveSystem.save(save);
    return result;
  },

  /** ボス(撃破・週の終わり)・対抗戦の報酬を受け取って、セーブに足す。返す報酬は、`showRewardModal` に出す。 */
  async claim(save: SaveData, which: 'raid' | 'war'): Promise<Result<AllianceReward>> {
    remember(save);
    const backend = await pick();
    const me = AllianceService.profile(save);
    const result = which === 'raid' ? await backend.claimRaidReward(me) : await backend.claimWarReward(me);
    if (!result.ok) return result;
    applyReward(save, result.value);
    SaveSystem.save(save);
    return result;
  },

  // ---- 同盟ショップ

  shopItems(): ShopItem[] {
    return SHOP_ITEMS;
  },

  /** 今週の、その品の購入数と残り (0 = 制限なしのときは left = Infinity)。 */
  shopStatus(save: SaveData, itemId: string): { bought: number; left: number } {
    const item = getShopItem(itemId);
    const week = weekIdOf(Date.now());
    const bought = save.alliance.shop.week === week ? (save.alliance.shop.bought[itemId] ?? 0) : 0;
    return { bought, left: item && item.weeklyLimit > 0 ? Math.max(0, item.weeklyLimit - bought) : Infinity };
  },

  /** 同盟コインで買う。 */
  async buy(save: SaveData, itemId: string): Promise<Result<AllianceReward>> {
    remember(save);
    const item = getShopItem(itemId);
    if (!item) return fail('not_found', 'その品は、ありません。');
    if (!hasAlliance(save)) return fail('not_in_alliance', '同盟に入っていません。');
    const week = weekIdOf(Date.now());
    if (save.alliance.shop.week !== week) save.alliance.shop = { week, bought: {} };
    if (item.weeklyLimit > 0 && (save.alliance.shop.bought[itemId] ?? 0) >= item.weeklyLimit) return fail('limit_reached', '今週は、もう買えません。');
    const spent = await (await pick()).spendCoins(AllianceService.profile(save), item.cost);
    if (!spent.ok) return spent;
    save.alliance.shop.bought[itemId] = (save.alliance.shop.bought[itemId] ?? 0) + 1;
    applyReward(save, item.reward);
    SaveSystem.save(save);
    return ok(item.reward);
  },

  // ---- 助っ人・支援

  /** 自分のキャラ (id) の写し。持っていなければ null。 */
  helperSnapshot(save: SaveData, heroInstanceId: string): HelperHero | null {
    const hero = SaveSystem.getHero(save, heroInstanceId);
    if (!hero) return null;
    const gear = {} as HelperHero['gear'];
    for (const slot of EQUIP_SLOTS) {
      const piece = hero.gear[slot];
      gear[slot] = piece ? { defId: piece.defId, level: piece.level } : null;
    }
    let power = 0;
    try {
      power = ProgressionSystem.computeHeroPower(hero).toNumber();
    } catch {
      power = 0;
    }
    return {
      ownerUid: save.social.playerId,
      ownerName: save.playerName || 'プレイヤー',
      heroId: hero.heroId,
      name: hero.name,
      heroClass: hero.heroClass,
      rarity: hero.rarity,
      level: hero.level,
      phase: hero.phase,
      skillLevels: [...hero.skillLevels],
      gear,
      power: Number.isFinite(power) ? power : 1e280,
      setAt: Date.now(),
    };
  },

  /** 助っ人に登録する (null で外す)。 */
  async setHelper(save: SaveData, heroInstanceId: string | null): Promise<Result<true>> {
    remember(save);
    if (!hasAlliance(save)) return fail('not_in_alliance', '同盟に入っていません。');
    const snapshot = heroInstanceId ? AllianceService.helperSnapshot(save, heroInstanceId) : null;
    if (heroInstanceId && !snapshot) return fail('not_found', 'そのキャラは、持っていません。');
    const result = await (await pick()).setHelper(AllianceService.profile(save), snapshot);
    if (result.ok) {
      save.alliance.helperHeroId = heroInstanceId ?? '';
      lastDetail = undefined;
      SaveSystem.save(save);
    }
    return result;
  },

  /** メンバーの助っ人を借りる。戦闘には、`helperToHeroData` で、HeroData にして出す。 */
  async borrowHelper(save: SaveData, ownerUid: string): Promise<Result<HelperHero>> {
    remember(save);
    const result = await (await pick()).borrowHelper(AllianceService.profile(save), ownerUid);
    SaveSystem.save(save);
    return result;
  },

  /** 助っ人の写しを、BattleSystem.createPlayerUnit に渡せる HeroData にする (装備つき)。 */
  helperToHeroData(helper: HelperHero): HeroData {
    const gear = { weapon: null, armor: null, accessory: null } as HeroData['gear'];
    for (const slot of EQUIP_SLOTS as EquipSlot[]) {
      const p = helper.gear[slot];
      gear[slot] = p ? ({ id: `helper-${helper.ownerUid}-${slot}`, defId: p.defId, level: p.level } satisfies EquipmentItem) : null;
    }
    return {
      id: `helper:${helper.ownerUid}:${helper.heroId}`,
      heroId: helper.heroId,
      seed: heroSeedFromId(helper.heroId),
      rarity: helper.rarity,
      heroClass: helper.heroClass,
      name: helper.name,
      level: helper.level,
      exp: 0,
      phase: helper.phase,
      gear,
      skillLevels: [...helper.skillLevels],
    };
  },

  /** 贈られたスタミナを受け取って、セーブに足す (最大を超えてもよい)。受け取った量。 */
  async claimStamina(save: SaveData): Promise<Result<number>> {
    remember(save);
    const result = await (await pick()).claimStamina(AllianceService.profile(save));
    if (!result.ok) return result;
    if (result.value > 0) {
      const [current, max] = save.stamina;
      save.stamina = [current + result.value, max];
    }
    SaveSystem.save(save);
    return result;
  },
};

