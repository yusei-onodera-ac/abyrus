import type { Reward } from './rewards';

/**
 * ミッション: three lists of things to do, each with a reward. Edit this file to change the
 * missions or what they pay (数字は仮のバランス).
 *
 *  - デイリーミッション      starts over at local midnight; doing them all pays a bonus
 *  - ウィークリーミッション  starts over on Monday at local midnight; also a bonus
 *  - 実績                    never starts over: each is taken once, for good
 *
 * `key` is what is counted. Most are counted where they happen (a won stage, a gacha pull,
 * ...: see recordMission in systems/MissionProgress.ts) - per day, per week and in total.
 * A few (`stage_cleared`, `player_level`, `hero_kinds`) are read from the save itself and
 * only make sense for 実績.
 */
export type MissionKey = 'quest_clear' | 'stamina' | 'gacha_pull' | 'hero_enhance' | 'equip_enhance' | 'idle_claim' | 'infinite_run';
export type StatKey = 'stage_cleared' | 'player_level' | 'hero_kinds';

export interface MissionDef {
  id: string;
  title: string;
  key: MissionKey | StatKey;
  target: number;
  reward: Reward;
}

export type MissionGroup = 'daily' | 'weekly' | 'total';

export interface MissionGroupDef {
  id: MissionGroup;
  /** The tab and the screen's heading. */
  name: string;
  /** Short form, for the Home screen's box. */
  short: string;
  /** When it starts over, shown under the heading. */
  resetNote: string;
  missions: MissionDef[];
  /** Paid once for taking every mission of the list (none for 実績). */
  bonus?: Reward[];
}

const DAILY: MissionDef[] = [
  { id: 'quest3', title: 'クエストを3回クリアする', key: 'quest_clear', target: 3, reward: { type: 'gems', amount: 20 } },
  { id: 'quest10', title: 'クエストを10回クリアする', key: 'quest_clear', target: 10, reward: { type: 'item', item: 'exp_m', amount: 3 } },
  { id: 'stamina50', title: 'スタミナを50使う', key: 'stamina', target: 50, reward: { type: 'gold', amount: 5000 } },
  { id: 'gacha1', title: 'ガチャを1回引く', key: 'gacha_pull', target: 1, reward: { type: 'gold', amount: 3000 } },
  { id: 'hero1', title: 'キャラを強化する', key: 'hero_enhance', target: 1, reward: { type: 'item', item: 'exp_s', amount: 20 } },
  { id: 'equip1', title: '装備を強化する', key: 'equip_enhance', target: 1, reward: { type: 'item', item: 'equip_essence', amount: 30 } },
  { id: 'idle1', title: '放置報酬を受け取る', key: 'idle_claim', target: 1, reward: { type: 'skillEssence', amount: 100 } },
  { id: 'infinite1', title: '無限モードに挑戦する', key: 'infinite_run', target: 1, reward: { type: 'phaseMaterials', amount: 1 } },
];

const WEEKLY: MissionDef[] = [
  { id: 'w_quest30', title: 'クエストを30回クリアする', key: 'quest_clear', target: 30, reward: { type: 'gems', amount: 100 } },
  { id: 'w_quest80', title: 'クエストを80回クリアする', key: 'quest_clear', target: 80, reward: { type: 'item', item: 'exp_l', amount: 3 } },
  { id: 'w_stamina400', title: 'スタミナを400使う', key: 'stamina', target: 400, reward: { type: 'gold', amount: 40000 } },
  { id: 'w_gacha10', title: 'ガチャを10回引く', key: 'gacha_pull', target: 10, reward: { type: 'gems', amount: 100 } },
  { id: 'w_hero10', title: 'キャラを10回強化する', key: 'hero_enhance', target: 10, reward: { type: 'item', item: 'exp_m', amount: 10 } },
  { id: 'w_equip10', title: '装備を10回強化する', key: 'equip_enhance', target: 10, reward: { type: 'item', item: 'equip_essence', amount: 200 } },
  { id: 'w_idle5', title: '放置報酬を5回受け取る', key: 'idle_claim', target: 5, reward: { type: 'skillEssence', amount: 500 } },
  { id: 'w_infinite5', title: '無限モードに5回挑戦する', key: 'infinite_run', target: 5, reward: { type: 'phaseMaterials', amount: 3 } },
];

/** 実績: one-time goals, in the order they are met. */
const TOTAL: MissionDef[] = [
  { id: 't_stage10', title: 'メインステージを10まで進める', key: 'stage_cleared', target: 10, reward: { type: 'gems', amount: 50 } },
  { id: 't_stage30', title: 'メインステージを30まで進める', key: 'stage_cleared', target: 30, reward: { type: 'gems', amount: 100 } },
  { id: 't_stage60', title: 'メインステージを60まで進める', key: 'stage_cleared', target: 60, reward: { type: 'gems', amount: 150 } },
  { id: 't_stage100', title: 'メインステージを100まで進める', key: 'stage_cleared', target: 100, reward: { type: 'gems', amount: 200 } },
  { id: 't_stage150', title: 'メインステージを全て進める', key: 'stage_cleared', target: 150, reward: { type: 'gems', amount: 300 } },
  { id: 't_quest10', title: 'クエストを合計10回クリアする', key: 'quest_clear', target: 10, reward: { type: 'gems', amount: 30 } },
  { id: 't_quest50', title: 'クエストを合計50回クリアする', key: 'quest_clear', target: 50, reward: { type: 'gems', amount: 60 } },
  { id: 't_quest150', title: 'クエストを合計150回クリアする', key: 'quest_clear', target: 150, reward: { type: 'gems', amount: 100 } },
  { id: 't_quest500', title: 'クエストを合計500回クリアする', key: 'quest_clear', target: 500, reward: { type: 'gems', amount: 200 } },
  { id: 't_level5', title: 'プレイヤーLv.5になる', key: 'player_level', target: 5, reward: { type: 'gems', amount: 30 } },
  { id: 't_level10', title: 'プレイヤーLv.10になる', key: 'player_level', target: 10, reward: { type: 'gems', amount: 50 } },
  { id: 't_level25', title: 'プレイヤーLv.25になる', key: 'player_level', target: 25, reward: { type: 'gems', amount: 100 } },
  { id: 't_level50', title: 'プレイヤーLv.50になる', key: 'player_level', target: 50, reward: { type: 'gems', amount: 200 } },
  { id: 't_gacha10', title: 'ガチャを合計10回引く', key: 'gacha_pull', target: 10, reward: { type: 'gems', amount: 30 } },
  { id: 't_gacha50', title: 'ガチャを合計50回引く', key: 'gacha_pull', target: 50, reward: { type: 'gems', amount: 60 } },
  { id: 't_gacha100', title: 'ガチャを合計100回引く', key: 'gacha_pull', target: 100, reward: { type: 'gems', amount: 100 } },
  { id: 't_heroes5', title: 'キャラを5種類集める', key: 'hero_kinds', target: 5, reward: { type: 'gems', amount: 50 } },
  { id: 't_heroes15', title: 'キャラを15種類集める', key: 'hero_kinds', target: 15, reward: { type: 'gems', amount: 100 } },
  { id: 't_heroes30', title: 'キャラを30種類集める', key: 'hero_kinds', target: 30, reward: { type: 'gems', amount: 200 } },
  { id: 't_hero10', title: 'キャラを合計10回強化する', key: 'hero_enhance', target: 10, reward: { type: 'item', item: 'exp_m', amount: 5 } },
  { id: 't_hero50', title: 'キャラを合計50回強化する', key: 'hero_enhance', target: 50, reward: { type: 'item', item: 'exp_l', amount: 3 } },
  { id: 't_equip10', title: '装備を合計10回強化する', key: 'equip_enhance', target: 10, reward: { type: 'item', item: 'equip_essence', amount: 100 } },
  { id: 't_equip50', title: '装備を合計50回強化する', key: 'equip_enhance', target: 50, reward: { type: 'item', item: 'equip_essence', amount: 400 } },
  { id: 't_infinite1', title: '無限モードに初挑戦する', key: 'infinite_run', target: 1, reward: { type: 'gems', amount: 30 } },
  { id: 't_infinite10', title: '無限モードに合計10回挑戦する', key: 'infinite_run', target: 10, reward: { type: 'phaseMaterials', amount: 3 } },
  { id: 't_idle7', title: '放置報酬を合計7回受け取る', key: 'idle_claim', target: 7, reward: { type: 'skillEssence', amount: 300 } },
  { id: 't_idle30', title: '放置報酬を合計30回受け取る', key: 'idle_claim', target: 30, reward: { type: 'skillEssence', amount: 1000 } },
];

export const MISSION_GROUPS: MissionGroupDef[] = [
  {
    id: 'daily',
    name: 'デイリーミッション',
    short: 'デイリー',
    resetNote: '毎日0時にリセット',
    missions: DAILY,
    bonus: [
      { type: 'gems', amount: 50 },
      { type: 'item', item: 'exp_l', amount: 1 },
    ],
  },
  {
    id: 'weekly',
    name: 'ウィークリーミッション',
    short: 'ウィークリー',
    resetNote: '毎週月曜0時にリセット',
    missions: WEEKLY,
    bonus: [
      { type: 'gems', amount: 200 },
      { type: 'item', item: 'exp_l', amount: 3 },
      { type: 'phaseMaterials', amount: 2 },
    ],
  },
  {
    id: 'total',
    name: '実績',
    short: '実績',
    resetNote: 'リセットされません（それぞれ1回だけ）',
    missions: TOTAL,
  },
];

export function getMissionGroup(id: MissionGroup): MissionGroupDef {
  return MISSION_GROUPS.find((g) => g.id === id) ?? MISSION_GROUPS[0];
}
