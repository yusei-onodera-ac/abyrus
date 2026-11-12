// Runs the 曜日ダンジョン data and system against a real SaveData, without a browser.
import { ProgressionSystem } from '../../src/game/systems/ProgressionSystem';
import { StageRewardSystem } from '../../src/game/systems/StageRewardSystem';
import { SaveSystem } from '../../src/game/systems/SaveSystem';
import { WeekdayDungeonSystem } from '../../src/game/systems/WeekdayDungeonSystem';
import { WEEKDAY_DUNGEONS, WEEKDAY_NAMES, WEEKDAY_TIERS, getWeekdayDungeon } from '../../src/game/data/weekdayDungeons';
import { ITEMS } from '../../src/game/data/items';
import { EVENTS } from '../../src/game/data/events';
import { BigNumber } from '../../src/game/systems/BigNumber';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// ---- data
ok(WEEKDAY_DUNGEONS.length === 7 && WEEKDAY_DUNGEONS.every((d, i) => d.day === i), 'seven dungeons, indexed by Date.getDay()');
ok(WEEKDAY_NAMES.length === 7, 'seven day names');
ok(WEEKDAY_DUNGEONS.every((d) => d.skillEssence.length === 4 && d.phaseMaterials.length === 4 && d.items.every((i) => i.amounts.length === 4)), 'every list has one amount per tier');
ok(WEEKDAY_DUNGEONS.every((d) => d.items.every((i) => i.item in ITEMS)), 'every item exists');
ok(WEEKDAY_TIERS.every((t, i, a) => i === 0 || (t.needStage > a[i - 1].needStage && t.likeStage > a[i - 1].likeStage && t.stamina > a[i - 1].stamina)), 'tiers rise in unlock, strength and cost');
ok(!EVENTS.some((e) => (e.kind as string) === 'weekday' || (e.kind as string) === 'expedition'), 'neither is on the Event tab any more');
ok(getWeekdayDungeon(7).day === 0 && getWeekdayDungeon(-1).day === 6, 'day numbers wrap');

// ---- stages
let stagesOk = true;
const seen = new Set<string>();
for (let day = 0; day < 7; day++) {
  for (let tier = 0; tier < 4; tier++) {
    const s = ProgressionSystem.getWeekdayStage(day, tier);
    const again = ProgressionSystem.getWeekdayStage(day, tier);
    const fine =
      s.enemies.length >= 3 && s.enemies.length <= 5 && s.index === tier && s.name.includes(WEEKDAY_NAMES[day]) && s.rewardExp > 0 && s.rewardSkillEssence > 0 &&
      s.rewardGold.toString() !== '0' && s.difficulty > 0 &&
      JSON.stringify(s.enemies) === JSON.stringify(again.enemies) && s.rewardGold.toString() === again.rewardGold.toString();
    if (!fine) {
      stagesOk = false;
      console.log('   bad stage', day, tier, s.name, s.enemies.length);
    }
    seen.add(s.name);
  }
}
ok(stagesOk, 'all 28 stages are well-formed and the same every time');
ok(seen.size === 28, 'every stage has its own name');

const mon0 = ProgressionSystem.getWeekdayStage(1, 3);
const fri3 = ProgressionSystem.getWeekdayStage(5, 3);
const goldRatio = Number(fri3.rewardGold.toString().replace(/,/g, '')) / Number(mon0.rewardGold.toString().replace(/,/g, ''));
ok(Math.abs(goldRatio - 8) < 0.05, `Friday pays 8x the gold of Monday at the same tier (ratio ${goldRatio.toFixed(2)})`);
const wed2 = ProgressionSystem.getWeekdayStage(3, 2);
const mon2 = ProgressionSystem.getWeekdayStage(1, 2);
ok(wed2.rewardSkillEssence - mon2.rewardSkillEssence === 1500, `Wednesday adds 1500 技素 at 上級 (+${wed2.rewardSkillEssence - mon2.rewardSkillEssence})`);
ok(ProgressionSystem.getWeekdayStage(1, 0).rewardGold.toString() === ProgressionSystem.getWeekdayStage(3, 0).rewardGold.toString(), 'a ×1 day pays the same gold as another ×1 day');
ok(ProgressionSystem.getWeekdayStage(1, 3).difficulty > ProgressionSystem.getWeekdayStage(1, 0).difficulty, 'a higher tier is harder');
ok(ProgressionSystem.getWeekdayStage(1, 3).regionIndex > ProgressionSystem.getWeekdayStage(1, 0).regionIndex, 'a higher tier is set in a later region');

// ---- system
const save = SaveSystem.createDefault();
ok(WeekdayDungeonSystem.isUnlocked(save, 0) && !WeekdayDungeonSystem.isUnlocked(save, 1), 'a new save has only 初級 open');
save.stageProgress = 60;
ok(WeekdayDungeonSystem.isUnlocked(save, 2) && !WeekdayDungeonSystem.isUnlocked(save, 3), 'stage 60 opens 上級 but not 超級');
const sunday = new Date(2026, 10, 1, 12, 0, 0).getTime(); // 2026-11-01 is a Sunday
ok(WeekdayDungeonSystem.today(sunday) === 0 && WeekdayDungeonSystem.today(sunday + 24 * 3600 * 1000) === 1, 'today() follows the local calendar day');

const monBonus = WeekdayDungeonSystem.bonus(1, 3);
ok(monBonus.gems === 0 && !monBonus.firstClear && monBonus.items.some((i) => i.item === 'exp_xl' && i.amount === 2) && monBonus.items.some((i) => i.item === 'exp_l' && i.amount === 10), 'Monday 超級 pays exp_l x10 and exp_xl x2');
ok(WeekdayDungeonSystem.bonus(1, 0).items.every((i) => i.item === 'exp_s'), 'Monday 初級 pays only exp_s');
ok(WeekdayDungeonSystem.bonus(4, 3).phaseMaterials === 6 && WeekdayDungeonSystem.bonus(4, 3).items.length === 0, 'Thursday 超級 pays 6 フェーズ素材 and no items');
ok(WeekdayDungeonSystem.preview(3, 1).length === 1 && WeekdayDungeonSystem.preview(3, 1)[0].type === 'skillEssence', 'Wednesday previews 技素 only');
ok(WeekdayDungeonSystem.preview(5, 0).length === 0, 'Friday previews no 素材 (its prize is the gold)');
ok(WeekdayDungeonSystem.preview(0, 3).length <= 5, 'no day previews more than 5 tiles (one row)');

// granting a clear
const before = { exp_l: save.items['exp_l'] ?? 0, exp_xl: save.items['exp_xl'] ?? 0, phase: save.phaseMaterials, gems: save.gems };
StageRewardSystem.grant(save, WeekdayDungeonSystem.bonus(1, 3));
ok((save.items['exp_l'] ?? 0) === before.exp_l + 10 && (save.items['exp_xl'] ?? 0) === before.exp_xl + 2 && save.gems === before.gems, 'granting Monday 超級 adds the items and no gems');
StageRewardSystem.grant(save, WeekdayDungeonSystem.bonus(4, 2));
ok(save.phaseMaterials === before.phase + 1 + 2, 'granting Monday 超級 (1) and Thursday 上級 (2) adds 3 フェーズ素材');
void BigNumber;

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
