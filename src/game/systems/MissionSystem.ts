import { MISSION_GROUPS, getMissionGroup, type MissionDef, type MissionGroup, type MissionKey, type StatKey } from '../data/missions';
import { rollMissions, type MissionPeriod } from './MissionProgress';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import type { SaveData } from './SaveSystem';

export interface MissionStatus {
  def: MissionDef;
  progress: number;
  done: boolean;
  claimed: boolean;
}

/** How far along one list is, for the Home screen's box and the screen's tabs. */
export interface MissionSummary {
  group: MissionGroup;
  total: number;
  /** Met (taken or not). */
  done: number;
  /** Met and waiting to be taken. */
  claimable: number;
}

/** What a read-from-the-save key (used by 実績) is worth right now. */
function statValue(save: SaveData, key: StatKey): number {
  if (key === 'stage_cleared') return save.stageProgress;
  if (key === 'player_level') return save.playerLevel;
  return new Set(save.heroes.map((h) => h.heroId)).size;
}

const isStat = (key: MissionKey | StatKey): key is StatKey => key === 'stage_cleared' || key === 'player_level' || key === 'hero_kinds';

/** The period a daily / weekly list is kept in (実績 has none: it uses the totals). */
function periodOf(save: SaveData, group: MissionGroup): MissionPeriod | null {
  if (group === 'daily') return save.missions.daily;
  if (group === 'weekly') return save.missions.weekly;
  return null;
}

function claimedIds(save: SaveData, group: MissionGroup): string[] {
  return periodOf(save, group)?.claimed ?? save.missions.totalClaimed;
}

export const MissionSystem = {
  list(save: SaveData, group: MissionGroup, now = Date.now()): MissionStatus[] {
    rollMissions(save, now);
    const counts = periodOf(save, group)?.counts ?? save.missions.totals;
    const claimed = claimedIds(save, group);
    return getMissionGroup(group).missions.map((def) => {
      const value = isStat(def.key) ? statValue(save, def.key) : (counts[def.key] ?? 0);
      const progress = Math.min(def.target, value);
      return { def, progress, done: progress >= def.target, claimed: claimed.includes(def.id) };
    });
  },

  /** Missions met but not yet taken. */
  claimable(save: SaveData, group: MissionGroup, now = Date.now()): MissionStatus[] {
    return this.list(save, group, now).filter((m) => m.done && !m.claimed);
  },

  summary(save: SaveData, now = Date.now()): MissionSummary[] {
    return MISSION_GROUPS.map((g) => {
      const list = this.list(save, g.id, now);
      return { group: g.id, total: list.length, done: list.filter((m) => m.done).length, claimable: list.filter((m) => m.done && !m.claimed).length };
    });
  },

  /** True once every mission of the list has been taken (its bonus can be claimed). */
  allTaken(save: SaveData, group: MissionGroup, now = Date.now()): boolean {
    return this.list(save, group, now).every((m) => m.claimed);
  },

  hasBonus(group: MissionGroup): boolean {
    return !!getMissionGroup(group).bonus;
  },

  bonusClaimed(save: SaveData, group: MissionGroup): boolean {
    return periodOf(save, group)?.bonusClaimed ?? false;
  },

  bonusClaimable(save: SaveData, group: MissionGroup, now = Date.now()): boolean {
    return this.hasBonus(group) && this.allTaken(save, group, now) && !this.bonusClaimed(save, group);
  },

  /** Anything to collect in a list: a met mission, or its bonus. */
  groupHasReward(save: SaveData, group: MissionGroup, now = Date.now()): boolean {
    return this.claimable(save, group, now).length > 0 || this.bonusClaimable(save, group, now);
  },

  /** Anything to collect anywhere. For the Home screen's red dot. */
  hasReward(save: SaveData, now = Date.now()): boolean {
    return MISSION_GROUPS.some((g) => this.groupHasReward(save, g.id, now));
  },

  claim(save: SaveData, group: MissionGroup, id: string, now = Date.now()): GrantedReward | null {
    const mission = this.list(save, group, now).find((m) => m.def.id === id);
    if (!mission || !mission.done || mission.claimed) return null;
    claimedIds(save, group).push(id);
    return RewardSystem.grant(save, mission.def.reward);
  },

  /** Takes every met mission of a list at once. */
  claimAll(save: SaveData, group: MissionGroup, now = Date.now()): GrantedReward[] {
    return this.claimable(save, group, now)
      .map((m) => this.claim(save, group, m.def.id, now))
      .filter((g): g is GrantedReward => g !== null);
  },

  claimBonus(save: SaveData, group: MissionGroup, now = Date.now()): GrantedReward[] {
    const period = periodOf(save, group);
    const bonus = getMissionGroup(group).bonus;
    if (!period || !bonus || !this.bonusClaimable(save, group, now)) return [];
    period.bonusClaimed = true;
    return RewardSystem.grantAll(save, bonus);
  },
};
