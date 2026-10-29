import type { SaveData } from './SaveSystem';

/** How long one point of stamina takes to come back. Placeholder balance. */
export const STAMINA_REGEN_SECONDS = 180;
const REGEN_MS = STAMINA_REGEN_SECONDS * 1000;

/** Which of the quest's three index spaces a stage lives in (see
 *  ProgressionSystem): the 150 main stages, the one final battle, and the
 *  post-ending Extra stages. */
export type StageKind = 'main' | 'final' | 'extra';

/** Stamina it costs to start a stage. Placeholder balance: main stages climb
 *  from 5 to 14 over the campaign, the final battle and Extra cost more. */
export function stageStaminaCost(kind: StageKind, index: number): number {
  if (kind === 'final') return 20;
  if (kind === 'extra') return 12 + Math.floor(index / 6);
  return 5 + Math.floor(index / 15);
}

/** Stamina is stored as the amount at the moment `staminaAt` says its timer
 *  last ticked, and brought up to date whenever it is read (`refresh`) - there
 *  is no timer running, so it also recovers while the game is closed. Safe to
 *  call as often as you like. */
export const StaminaSystem = {
  /** Adds what has recovered since `save.staminaAt`, up to the max. */
  refresh(save: SaveData, now = Date.now()): void {
    const [current, max] = save.stamina;
    // Full stamina has nothing to count down to; the timer starts when it drops.
    if (current >= max || save.staminaAt > now) {
      save.staminaAt = now;
      return;
    }
    const gained = Math.floor((now - save.staminaAt) / REGEN_MS);
    if (gained <= 0) return;
    const next = Math.min(max, current + gained);
    save.stamina = [next, max];
    save.staminaAt = next >= max ? now : save.staminaAt + gained * REGEN_MS;
  },

  canAfford(save: SaveData, cost: number, now = Date.now()): boolean {
    StaminaSystem.refresh(save, now);
    return save.stamina[0] >= cost;
  },

  /** Takes `cost` stamina. False (nothing taken) if there is not enough. */
  spend(save: SaveData, cost: number, now = Date.now()): boolean {
    StaminaSystem.refresh(save, now);
    const [current, max] = save.stamina;
    if (current < cost) return false;
    if (current >= max) save.staminaAt = now;
    save.stamina = [current - cost, max];
    return true;
  },

  /** Seconds until stamina reaches `target`; 0 if it already has (or if the
   *  target is above the max, which no amount of waiting reaches). */
  secondsUntil(save: SaveData, target: number, now = Date.now()): number {
    StaminaSystem.refresh(save, now);
    const [current, max] = save.stamina;
    if (current >= target || target > max) return 0;
    const intoPoint = Math.min(REGEN_MS, Math.max(0, now - save.staminaAt));
    const untilNext = REGEN_MS - intoPoint;
    return Math.ceil((untilNext + (target - current - 1) * REGEN_MS) / 1000);
  },

  /** 3:05 / 1:02:09 style countdown for a number of seconds. */
  formatDuration(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  },
};
