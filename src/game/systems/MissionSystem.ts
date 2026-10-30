import { DAILY_MISSIONS, MISSION_BONUS, type MissionDef } from '../data/missions';
import { rollMissionDay } from './MissionProgress';
import { RewardSystem, type GrantedReward } from './RewardSystem';
import type { SaveData } from './SaveSystem';

export interface MissionStatus {
  def: MissionDef;
  progress: number;
  done: boolean;
  claimed: boolean;
}

export const MissionSystem = {
  list(save: SaveData, now = Date.now()): MissionStatus[] {
    rollMissionDay(save, now);
    return DAILY_MISSIONS.map((def) => {
      const progress = Math.min(def.target, save.missions.counts[def.key] ?? 0);
      return { def, progress, done: progress >= def.target, claimed: save.missions.claimed.includes(def.id) };
    });
  },

  /** Missions finished but not yet taken. */
  claimable(save: SaveData, now = Date.now()): MissionStatus[] {
    return this.list(save, now).filter((m) => m.done && !m.claimed);
  },

  /** True once every mission has been taken (the bonus can be claimed). */
  allTaken(save: SaveData, now = Date.now()): boolean {
    return this.list(save, now).every((m) => m.claimed);
  },

  bonusClaimable(save: SaveData, now = Date.now()): boolean {
    return this.allTaken(save, now) && !save.missions.bonusClaimed;
  },

  /** Anything to collect: a finished mission, or the bonus. For the Home screen's red dot. */
  hasReward(save: SaveData, now = Date.now()): boolean {
    return this.claimable(save, now).length > 0 || this.bonusClaimable(save, now);
  },

  claim(save: SaveData, id: string, now = Date.now()): GrantedReward | null {
    const mission = this.list(save, now).find((m) => m.def.id === id);
    if (!mission || !mission.done || mission.claimed) return null;
    save.missions.claimed.push(id);
    return RewardSystem.grant(save, mission.def.reward);
  },

  /** Takes every finished mission at once. */
  claimAll(save: SaveData, now = Date.now()): GrantedReward[] {
    return this.claimable(save, now)
      .map((m) => this.claim(save, m.def.id, now))
      .filter((g): g is GrantedReward => g !== null);
  },

  claimBonus(save: SaveData, now = Date.now()): GrantedReward[] {
    if (!this.bonusClaimable(save, now)) return [];
    save.missions.bonusClaimed = true;
    return RewardSystem.grantAll(save, MISSION_BONUS);
  },
};
