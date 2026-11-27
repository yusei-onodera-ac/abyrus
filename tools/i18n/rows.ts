// The text fields of the game's data tables, as rows [table, id, field, value] in the language being shown (`setLanguage`): every cell that
// goes through tr() / localized() (and a few that are assembled from messages: the skill kind tags, the schedule). The tests of the data
// translation (tools/tests/i18n_data.ts) and the proofreaders' export (tools/i18n/export.mjs) both read the game's text through this.
import { tr, trList } from '../../src/game/i18n';
import { TUTORIAL_GUIDE_NAME } from '../../src/game/data/tutorial';
import { BUILD_TABS, BUILDINGS, VILLAGE_MATERIALS, WANDERERS } from '../../src/game/data/village';
import { VILLAGE_GOALS, unlocksAt } from '../../src/game/data/villageGoals';
import { VILLAGE_QUESTS } from '../../src/game/data/villageQuests';
import { MISSION_GROUPS } from '../../src/game/data/missions';
import { GIFT_CAMPAIGNS } from '../../src/game/data/gifts';
import { MAIL_CAMPAIGNS } from '../../src/game/data/mails';
import { NOTICES } from '../../src/game/data/notices';
import { SUPPLY_SLOTS } from '../../src/game/data/supply';
import { EQUIP_DEFS, EQUIP_STAT_LABEL } from '../../src/game/data/equipment';
import { GEM_PRODUCTS, GOLD_PRODUCTS, ITEM_PRODUCTS, PACKS } from '../../src/game/data/shop';
import { premiumName } from '../../src/game/data/premium';
import { GACHA_BANNERS } from '../../src/game/data/gachaBanners';
import { FERAL_PREFIXES, REGIONS, pickFeral } from '../../src/game/data/regions';
import { WEEKDAY_DUNGEONS, WEEKDAY_TIERS } from '../../src/game/data/weekdayDungeons';
import { EXPEDITIONS } from '../../src/game/data/expeditions';
import { ITEMS } from '../../src/game/data/items';
import { TUTORIAL_STEPS, VILLAGE_TUTORIAL_STEPS } from '../../src/game/data/tutorial';
import { HERO_SKILLS, formatSkillEffectSummary, skillKindLabel, type SkillEffectKind } from '../../src/game/data/skills';
import { PEOPLE } from '../../src/game/ui/VillagePeople';
import { ALL_HEROES, defShort } from '../../src/game/data/heroes';
import { SCHEDULED_CAMPAIGNS, SCHEDULED_EVENTS, SCHEDULED_GACHAS, SCHEDULE_NEXT } from '../../src/game/data/schedule';
import { EVENTS } from '../../src/game/data/events';
import { scheduleNotices } from '../../src/game/data/notices';
import { scheduleItems } from '../../src/game/systems/ScheduleView';
import { DONATIONS, DONATION_KINDS, RAID_BOSSES, SHOP_ITEMS, WAR_REWARDS, simAllianceName, simWords, type SimWordKind } from '../../src/game/data/alliance';
import { SocialSystem } from '../../src/game/systems/SocialSystem';
import { ChatSystem } from '../../src/game/systems/ChatSystem';
import { CLASS_LINES, HERO_LINES, homeLinesFor } from '../../src/game/data/homeLines';
import { OPENING_SCRIPTS, getEndingScript, getExtraIntroScript, getFinalIntroScript, getRegionIntroScript, getRegionOutroScript, speakerName, type StoryScript } from '../../src/game/data/storyScript';

export type Row = [string, string, string, string];

/** The summon banners that are always there (the yearly ones are in the schedule). */
const STANDING_BANNERS = ['special', 'first', 'equip-standard', 'standard'];


/** Every story script, in the order the game plays them. */
export const STORY_SCRIPTS = (): StoryScript[] => [
  ...OPENING_SCRIPTS,
  ...[0, 1, 2, 3, 4].flatMap((i) => [getRegionIntroScript(i), getRegionOutroScript(i), getExtraIntroScript(i)]),
  getFinalIntroScript(),
  getEndingScript(),
];

/** One day after each event and summon of the year starts (the day its notice is on the board). */
export const SCHEDULE_NOTICE_TIMES: number[] = [...SCHEDULED_EVENTS, ...SCHEDULED_GACHAS].map((x) => new Date(x.startsAt!).getTime() + 24 * 3600 * 1000);

export const SKILL_KINDS: SkillEffectKind[] = ['nuke_single', 'nuke_aoe', 'drain_single', 'buff_atk', 'buff_def', 'debuff_atk', 'debuff_def', 'stun', 'invincible', 'heal_single', 'heal_aoe', 'revive'];
export const SKILL_OF_KIND = new Map(Object.values(HERO_SKILLS).flat().map((def) => [def.kind, def] as const));

/** [table, id, field, value] for each text field of each row. */
export function collect(): Row[] {
  const out: Row[] = [];
  const add = (table: string, id: string, row: object, fields: string[]): void => {
    for (const f of fields) {
      const v = (row as Record<string, unknown>)[f];
      if (typeof v === 'string') out.push([table, id, f, v]);
    }
  };
  for (const r of BUILD_TABS) add('buildTab', r.id, r, ['name']);
  for (const r of VILLAGE_MATERIALS) add('villageMaterial', r.id, r, ['name']);
  for (const r of BUILDINGS) add('building', r.kind, r, ['name', 'description']);
  for (const [k, r] of Object.entries(WANDERERS)) add('wanderer', k, r, ['name']);
  for (const r of VILLAGE_GOALS) add('villageGoal', r.id, r, ['text']);
  for (const r of VILLAGE_QUESTS) add('villageQuest', r.id, r, ['text']);
  for (let level = 2; level <= 6; level++) unlocksAt(level).forEach((line, i) => add('unlock', `${level}.${i}`, line, ['text']));
  for (const g of MISSION_GROUPS) for (const m of g.missions) add('mission', m.id, m, ['title']);
  for (const r of GIFT_CAMPAIGNS) add('gift', r.id, r, ['title', 'message']);
  for (const r of MAIL_CAMPAIGNS) add('mail', r.id, r, ['title', 'body']);
  for (const r of NOTICES) add('notice', r.id, r, ['title', 'body']);
  for (const r of SUPPLY_SLOTS) add('supply', r.id, r, ['name']);
  for (const r of EQUIP_DEFS) add('equip', r.id, r, ['name']);
  for (const [k, v] of Object.entries(EQUIP_STAT_LABEL)) out.push(['equipStat', k, 'label', v]);
  for (const r of [...PACKS, ...GEM_PRODUCTS, ...GOLD_PRODUCTS, ...ITEM_PRODUCTS]) add('shop', r.id, r, ['name', 'description', 'badge']);
  out.push(['premium', 'pass', 'name', premiumName()]);
  for (const r of GACHA_BANNERS.filter((b) => STANDING_BANNERS.includes(b.id))) add('gachaBanner', r.id, r, ['title', 'description']);
  for (const r of REGIONS) {
    add('region', r.id, r, ['name', 'mapDescription', 'bossName']);
    out.push(['region', r.id, 'tab', tr('region', r.id, 'tab', r.name)]);
    r.feralAnimals.forEach((a, i) => add('feralAnimal', `${r.id}_${i}`, a, ['name']));
  }
  for (const r of WEEKDAY_TIERS) add('weekdayTier', r.id, r, ['name', 'note']);
  for (const r of WEEKDAY_DUNGEONS) add('weekdayDungeon', String(r.day), r, ['name', 'theme']);
  for (const r of EXPEDITIONS) add('expedition', r.id, r, ['name', 'description']);
  for (const r of Object.values(ITEMS)) add('item', r.id, r, ['name', 'short', 'description']);
  for (const step of [...TUTORIAL_STEPS, ...VILLAGE_TUTORIAL_STEPS]) if (step.lines) out.push(['tutorial', step.id, 'lines', step.lines.join('\n')]);
  for (const p of PEOPLE) out.push(['villager', p.id, 'lines', trList('villager', p.id, 'lines', p.lines).join('\n')]);
  for (const r of ALL_HEROES) {
    add('hero', r.id, r, ['name']);
    out.push(['hero', r.id, 'short', defShort(r)]);
    homeLinesFor(r.id, r.heroClass).forEach((line, i) => out.push(['heroLine', r.id, String(i + 1), line.text]));
  }
  for (const cls of Object.keys(CLASS_LINES) as (keyof typeof CLASS_LINES)[]) homeLinesFor('nobody', cls).forEach((line, i) => out.push(['classLine', cls, String(i + 1), line.text]));
  for (const e of SCHEDULED_EVENTS) {
    add('event', e.id, e, ['title', 'description', 'story', 'emblem']);
    add('eventToken', e.id, e.token, ['name', 'glyph']);
    for (const m of e.missions) add('eventMission', m.id, m, ['title']);
    for (const s of e.shop) add('eventShop', s.id, s, ['name']);
  }
  for (const e of EVENTS.filter((x) => x.kind !== 'limited')) add('event', e.id, e, ['title', 'description', 'actionLabel']);
  for (const g of SCHEDULED_GACHAS) add('gachaBanner', g.id, g, ['title', 'description', 'emblem']);
  for (const c of SCHEDULED_CAMPAIGNS) add('campaign', c.id, c, ['title']);
  out.push(['scheduleNext', 'next', 'title', SCHEDULE_NEXT.title]);
  // the notices the calendar makes (one for each event and summon, on the day after it starts) and the lines of the yearly schedule
  for (const at of SCHEDULE_NOTICE_TIMES) {
    for (const n of scheduleNotices(at)) {
      if (!out.some(([tb, id]) => tb === 'scheduleNotice' && id === n.id)) {
        add('scheduleNotice', n.id, n, ['title', 'body']);
      }
    }
  }
  for (const item of scheduleItems()) add('scheduleItem', `${item.kind}-${item.id}`, item, ['title', 'detail']);
  for (const b of RAID_BOSSES) add('allianceBoss', b.id, b, ['name', 'description']);
  for (const k of DONATION_KINDS) add('allianceDonation', k, DONATIONS[k], ['label']);
  for (const w of WAR_REWARDS) add('allianceWar', `${w.fromRank}-${w.toRank}`, w, ['label']);
  for (const s of SHOP_ITEMS) add('allianceShop', s.id, s, ['name']);
  for (const kind of ['prefix', 'suffix', 'name', 'description', 'chat', 'help'] as SimWordKind[]) simWords(kind).forEach((text, i) => out.push(['allianceSim', `${kind}.${i}`, 'text', text]));
  {
    const social = SocialSystem.createDefaultState(0);
    [...social.friends, ...social.incoming].forEach((p) => out.push(['seedFriend', p.id, 'name', p.name]));
    ChatSystem.createDefaultState(0).messages.forEach((m, i) => {
      out.push(['seedChat', String(i), 'senderName', m.senderName]);
      out.push(['seedChat', String(i), 'text', m.text]);
    });
  }
  for (const script of STORY_SCRIPTS()) {
    script.lines.forEach((line, i) => {
      out.push(['story', `${script.id}.${i + 1}`, 'text', line.text]);
      if (line.speaker) out.push(['storySpeaker', line.speaker, 'name', speakerName(line.speaker)]);
    });
  }
  // the heroes' skills: name and description of each, the tag of each kind, and the numbers readout under a skill (level 1 and 10)
  for (const [heroId, kit] of Object.entries(HERO_SKILLS)) kit.forEach((def, slot) => add('skill', `${heroId}_${slot}`, def, ['name', 'description']));
  for (const kind of SKILL_KINDS) {
    out.push(['skillKind', kind, 'label', skillKindLabel(kind)]);
    const def = SKILL_OF_KIND.get(kind);
    if (def) for (const level of [1, 10]) out.push(['skillSummary', `${kind}.${level}`, 'text', formatSkillEffectSummary(def, level)]);
  }
  return out;
}

/** The Japanese source of every translatable cell (`table.id.field`), read in Japanese: what `collect()` has, plus the cells it does not
 *  list because the tests check them another way (the enemies' adjectives, the guide's name, the emblems of the standing banners), and
 *  the yearly summons under the name their English table has (`scheduledGacha`; the test lists them as `gachaBanner`). */
export function japaneseSources(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [table, id, field, value] of collect()) {
    out.set(`${table}.${id}.${field}`, value);
    if (table === 'gachaBanner' && !STANDING_BANNERS.includes(id)) out.set(`scheduledGacha.${id}.${field}`, value);
  }
  FERAL_PREFIXES.forEach((prefix, i) => out.set(`feralPrefix.${i}.name`, prefix));
  out.set('tutorial.guide.name', TUTORIAL_GUIDE_NAME);
  for (const b of GACHA_BANNERS.filter((x) => STANDING_BANNERS.includes(x.id))) if (b.emblem !== undefined) out.set(`gachaBanner.${b.id}.emblem`, b.emblem);
  return out;
}
