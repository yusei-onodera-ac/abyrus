import type { CampaignDef, CampaignKind } from '../data/campaigns';
import { SCHEDULED_CAMPAIGNS } from '../data/schedule';

/** The multipliers of the ブーストキャンペーン that are on (data/campaigns.ts; the year's are in data/schedule.ts). A leaf module: the systems that pay
 *  gold / EXP / drops / 放置報酬 or take stamina ask it for the multiplier. Under test (import.meta.env.MODE 'test') no campaign is ever on, so the
 *  tests do not depend on the date they are run on - the campaign test turns them on with `setTesting(false)`. */
let testing = import.meta.env.MODE === 'test';

export function isCampaignActive(c: Pick<CampaignDef, 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
  return new Date(c.startsAt).getTime() <= now && now < new Date(c.endsAt).getTime();
}

export const CampaignSystem = {
  /** Tests only: true (the default under test) = no campaign is on; false = the real ones are. */
  setTesting(on: boolean): void {
    testing = on;
  },

  active(now = Date.now()): CampaignDef[] {
    return testing ? [] : SCHEDULED_CAMPAIGNS.filter((c) => isCampaignActive(c, now));
  },

  /** The multiplier of everything of this kind: the biggest of the campaigns on (the cheapest, for stamina), 1 when none is. */
  mul(kind: CampaignKind, now = Date.now()): number {
    const same = CampaignSystem.active(now).filter((c) => c.kind === kind);
    if (same.length === 0) return 1;
    return kind === 'stamina' ? Math.min(...same.map((c) => c.mul)) : Math.max(...same.map((c) => c.mul));
  },

  /** `amount` made bigger by the campaign of this kind (whole numbers, never less than it was). */
  scale(kind: CampaignKind, amount: number, now = Date.now()): number {
    return Math.max(amount, Math.round(amount * CampaignSystem.mul(kind, now)));
  },

  /** A stamina cost made smaller by the stamina campaign (at least 1). */
  staminaCost(cost: number, now = Date.now()): number {
    const mul = CampaignSystem.mul('stamina', now);
    return mul >= 1 ? cost : Math.max(1, Math.ceil(cost * mul));
  },

  /** The drops of a clear (経験値素材, 装備強化素材, フェーズ素材, 村の素材) made bigger by the drop campaign. 魔晶石 is left alone. */
  boostDrops<T extends { phaseMaterials: number; items: { item: string; amount: number }[]; materials: Record<string, number | undefined> }>(bonus: T, now = Date.now()): T {
    const mul = CampaignSystem.mul('drop', now);
    if (mul === 1) return bonus;
    bonus.phaseMaterials = Math.round(bonus.phaseMaterials * mul);
    for (const drop of bonus.items) drop.amount = Math.round(drop.amount * mul);
    for (const key of Object.keys(bonus.materials)) bonus.materials[key] = Math.round((bonus.materials[key] ?? 0) * mul);
    return bonus;
  },
};
