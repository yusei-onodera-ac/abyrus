import { t } from '../i18n';

/**
 * ブーストキャンペーン: for a week or so, one thing pays more (or costs less). They fill the weeks between the 期間限定イベント
 * (data/schedule.ts lists the year's) and can overlap an event. They need no screen of their own: the Event tab shows the ones
 * that are on, and the systems that pay the thing read the multiplier (systems/CampaignSystem.ts).
 */
export type CampaignKind =
  /** ゴールド from stages (クエスト, 曜日ダンジョン, イベントダンジョン, and their 掃討). */
  | 'gold'
  /** The EXP the party gets from a stage. */
  | 'exp'
  /** The 素材 (経験値素材・装備強化素材・フェーズ素材) a stage drops. */
  | 'drop'
  /** Stamina a stage costs: `mul` 0.5 = half. */
  | 'stamina'
  /** 放置報酬 (the gold and 素材 piling up while away). */
  | 'idle';

export interface CampaignDef {
  id: string;
  kind: CampaignKind;
  /** 2 = twice as much; for 'stamina', 0.5 = half the cost. */
  mul: number;
  title: string;
  /** Local times, as for an event. */
  startsAt: string;
  endsAt: string;
}

// (getters: the name is looked up each time it is read, so it follows the language)
export const CAMPAIGN_KIND_NAME: Record<CampaignKind, string> = {
  get gold() {
    return t('sys.campaign.gold');
  },
  get exp() {
    return t('sys.campaign.exp');
  },
  get drop() {
    return t('sys.campaign.drop');
  },
  get stamina() {
    return t('sys.campaign.stamina');
  },
  get idle() {
    return t('sys.campaign.idle');
  },
};

/** "ゴールド ×2", "スタミナ消費 半分". */
export function describeCampaign(c: Pick<CampaignDef, 'kind' | 'mul'>): string {
  if (c.kind === 'stamina' && c.mul === 0.5) return t('sys.campaign.half', { name: CAMPAIGN_KIND_NAME[c.kind] });
  return t('sys.campaign.times', { name: CAMPAIGN_KIND_NAME[c.kind], mul: c.mul });
}
