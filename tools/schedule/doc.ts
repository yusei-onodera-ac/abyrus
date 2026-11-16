// Writes docs/EVENT_SCHEDULE.md from the game's own data (src/game/data/schedule.ts): run `npm run schedule:doc`.
// Printed to stdout; tools/schedule/export.mjs bundles and runs this and writes the file.
import { describeCampaign } from '../../src/game/data/campaigns';
import { LOGIN_BONUS } from '../../src/game/data/loginBonus';
import { MISSION_GROUPS } from '../../src/game/data/missions';
import { SCHEDULED_CAMPAIGNS, SCHEDULED_EVENTS, SCHEDULED_GACHAS, SCHEDULE_NEXT } from '../../src/game/data/schedule';
import { standardShop } from '../../src/game/data/limitedEvents';
import { getHeroDefinition } from '../../src/game/data/heroes';
import { pickupHeroesOf, ratesOf } from '../../src/game/systems/GachaSystem';
import { KIND_NAME, formatSpan, groupByMonth, scheduleItems } from '../../src/game/systems/ScheduleView';
import type { Reward } from '../../src/game/data/rewards';
import { WEEKDAY_TIERS } from '../../src/game/data/weekdayDungeons';

const out: string[] = [];
const line = (s = ''): void => void out.push(s);
const n = (v: number): string => v.toLocaleString('ja-JP');
const md = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const span = (a: string, b: string): string => `${md(a)} 〜 ${md(b)}`;
const gemsIn = (rewards: Reward[]): number => rewards.reduce((s, r) => s + (r.type === 'gems' ? r.amount : 0), 0);
const rewardText = (r: Reward): string => {
  if (r.type === 'equipment') return `装備★${r.rarity}×${r.amount}`;
  if (r.type === 'item') return `${{ exp_s: '経験値(小)', exp_m: '経験値(中)', exp_l: '経験値(大)', exp_xl: '経験値(特大)', equip_essence: '強化素材' }[r.item]}×${n(r.amount)}`;
  return `${{ gems: '魔晶石', gold: 'ゴールド', stamina: 'スタミナ', phaseMaterials: 'フェーズ素材', skillEssence: '技素' }[r.type]}×${n(r.amount)}`;
};
const heroName = (id: string): string => getHeroDefinition(id)?.name ?? id;

line('# 年間スケジュール（期間限定イベント・ガチャ・キャンペーン）');
line();
line('> このファイルは、`npm run schedule:doc` で、ゲームのデータ（`src/game/data/schedule.ts`）から自動で書き出しています。**手で直さず、データを直して、もう一度書き出してください。**');
line();
line('2026-11-16 から 2027-11-15 までの1年間の、運営カレンダーです。');
line('イベント・ガチャ・キャンペーンの画面、ホームのバナー、お知らせ、「年間予定」画面は、すべて、このデータから作られます（コードは触りません）。');
line();
line(`- 期間限定イベント: **${SCHEDULED_EVENTS.length}本**（イベントダンジョン ${SCHEDULED_EVENTS.filter((e) => e.kind === 'dungeon').length}本、ミッション型 ${SCHEDULED_EVENTS.filter((e) => e.kind === 'mission').length}本）。同時に開くのは、いつも1本だけ。`);
line(`- ピックアップガチャ: **${SCHEDULED_GACHAS.filter((g) => g.kind !== 'equipment').length}本**（毎日ちょうど1本が開催中）。装備の感謝祭: ${SCHEDULED_GACHAS.filter((g) => g.kind === 'equipment').length}回。`);
line(`- ブーストキャンペーン: **${SCHEDULED_CAMPAIGNS.length}本**（イベントのない日を埋める。毎日、イベントかキャンペーンのどちらかが開いている）。`);
line(`- この先: ${md(SCHEDULE_NEXT.at)}（2027年）に「${SCHEDULE_NEXT.title}」。`);
line();

// ------------------------------------------------------------------------------------------------ month by month
line('## 1. 月ごとの予定');
line();
for (const month of groupByMonth(scheduleItems())) {
  line(`### ${month.label}`);
  line();
  line('| 期間 | 種類 | 内容 | 詳細 |');
  line('|---|---|---|---|');
  for (const item of month.items) line(`| ${formatSpan(item)} | ${KIND_NAME[item.kind]} | ${item.title} | ${item.detail} |`);
  line();
}

// ------------------------------------------------------------------------------------------------ events
line('## 2. 期間限定イベント');
line();
line('イベントは2種類です。どちらも、**イベント通貨**を集めて、**累計報酬**（集めた数に応じて、自動で解放）と**交換所**（通貨で好きなものと交換）に使います。');
line();
line('- **イベントダンジョン型**: 曜日ダンジョンと同じ4段階（初級・中級・上級・超級。開放条件・強さ・スタミナも同じ）。クリアするたびに、スタミナ×2 のイベント通貨がもらえる（初級20、中級28、上級36、超級60）。初回クリアで魔晶石。クリア済みの段階は掃討できる。敵の姿と背景は、イベントごとに決めた地域のもの。ゴールドは通常の2倍。');
line('- **ミッション型**: ダンジョンなし。いつもの冒険（クエスト、ガチャ、強化、遠征、村、補給）のミッションで、通貨がたまる。すべて終えると、ちょうど最後の累計報酬に届く。');
line();
line('どちらにも、「ログインした日」のミッションがあります。ホームを開くか、何かを遊ぶと、その日が数えられます。');
line('期間が終わっても、**交換所と累計報酬の受け取りは、3日間（夏は4日間）だけ**できます。ダンジョンとミッションの進行は、終了と同時に止まります。通貨は、交換期間が終わると使えなくなります。');
line();
line('| イベント | 期間 | 型 | 通貨 | 地域 | 最後の累計報酬（目玉） | 魔晶石（累計報酬＋初回） |');
line('|---|---|---|---|---|---|---|');
const REGIONS = ['迷いの森', '灰塵の荒野', '蒼氷の山嶺', '瘴気の遺跡', '黄昏の都'];
let eventGems = 0;
for (const e of SCHEDULED_EVENTS) {
  const gems = e.milestones.reduce((s, m) => s + gemsIn(m.rewards), 0) + (e.kind === 'dungeon' ? e.firstClearGems.reduce((a, b) => a + b, 0) : 0);
  eventGems += gems;
  const last = e.milestones[e.milestones.length - 1];
  line(`| ${e.title} | ${span(e.startsAt, e.endsAt)} | ${e.kind === 'dungeon' ? 'ダンジョン' : 'ミッション'} | ${e.token.name} | ${e.kind === 'dungeon' ? REGIONS[e.region] : '―'} | ${n(last.points)}で ${last.rewards.map(rewardText).join('、')} | ${n(gems)} |`);
}
line();
line('### 標準の中身（全イベント共通。イベントごとに、最後の報酬と、交換所の目玉だけが変わる）');
line();
const dungeon = SCHEDULED_EVENTS.find((e) => e.kind === 'dungeon')!;
const mission = SCHEDULED_EVENTS.find((e) => e.kind === 'mission')!;
line(`- **累計報酬（ダンジョン型）**: ${dungeon.milestones.map((m) => n(m.points)).join(' / ')}（10段階）。`);
line(`- **累計報酬（ミッション型）**: ${mission.milestones.map((m) => n(m.points)).join(' / ')}（8段階）。`);
line(`- **ミッション（ダンジョン型）**: ${dungeon.missions.map((m) => `${m.title}（${m.tokens}）`).join('、')}。合計 ${n(dungeon.missions.reduce((s, m) => s + m.tokens, 0))}。`);
line(`- **ミッション（ミッション型）**: ${mission.missions.map((m) => `${m.title}（${m.tokens}）`).join('、')}。合計 ${n(mission.missions.reduce((s, m) => s + m.tokens, 0))}。`);
line('- **交換所（ダンジョン型の値段。ミッション型は、おおむね5分の1）**:');
for (const item of standardShop('dungeon')) line(`  - ${item.name}: ${n(item.cost)}（${item.limit}回まで）`);
line();
line('目安: 1日にスタミナを150使う人は、14日のダンジョン型で約4,200＋ミッション約2,000＝約6,000集まり、累計報酬の6〜7段階めまで届きます。毎日ぜんぶ使う人（1日480）で、最後の段階に届くくらいです。');
line();

// ------------------------------------------------------------------------------------------------ gachas
line('## 3. ガチャ');
line();
line('通常ガチャ・特設ガチャ（★6アイオーン）・はじめてのガチャ・装備ガチャは、いままでどおり、ずっと開いています。**その上に**、期間ごとのピックアップが1本ずつ乗ります（ガチャ画面では、開催中の限定ガチャが上に並ぶ）。');
line();
line('- **★5ピックアップ**: ★5の出現率 2%。そのうち半分（1%）が、ピックアップの★5に行く（2体なら、半分ずつ）。★4は8%で、ピックアップの★4が半分。**50回目の召喚は、必ず、ピックアップの★5**（回数は、★5が出るとゼロに戻る）。10連は★3以上1体保証。');
line('- **★4ピックアップ**: ★4の出現率 14%（そのうち6割がピックアップの★4）。**30回目は、必ず、ピックアップの★4以上**。10連は★3以上1体保証。');
line('- **1周年カウントダウン**: ★5 3%、ピックアップの割合7割、天井40回。');
line('- **装備の感謝祭**: 装備ガチャの★5が、ふだんの2%から4%に。');
line('- ★6は、いまのところ、特設ガチャだけです。★6が増えたら、復刻の予定を、ここに足します。');
line();
line('| 開催 | ガチャ | ★5 | ★4 | ★3 | 天井 |');
line('|---|---|---|---|---|---|');
for (const g of SCHEDULED_GACHAS.filter((x) => x.kind !== 'equipment')) {
  const picks = pickupHeroesOf(g);
  const by = (r: number): string => picks.filter((h) => h.rarity === r).map((h) => heroName(h.id)).join('、') || '―';
  line(`| ${span(g.startsAt!, g.endsAt!)} | ${g.title} | ${by(5)} | ${by(4)} | ${by(3)} | ${g.pity!.at}回 |`);
}
line();
line('★5の登場回数（ピックアップになる回数）:');
line();
const fives = new Map<string, number>();
for (const g of SCHEDULED_GACHAS) for (const h of pickupHeroesOf(g)) if (h.rarity === 5) fives.set(h.id, (fives.get(h.id) ?? 0) + 1);
line([...fives].map(([id, c]) => `${heroName(id)} ${c}回`).join('、'));
line();
line('（★5が6体しかいないので、同じキャラが年に3〜4回、ピックアップになります。新しい★5を足したら、このスケジュールの、★5の枠から、入れ替えてください。）');
line();
line('レート: ' + ratesOf(SCHEDULED_GACHAS[0]).map((r) => `★${r.rarity} ${(r.rate * 100).toFixed(1)}%`).join('、') + '（★5ピックアップの場合）');
line();

// ------------------------------------------------------------------------------------------------ campaigns
line('## 4. ブーストキャンペーン');
line();
line('ゴールド2倍、経験値2倍、素材ドロップ2倍、放置報酬2倍、スタミナ消費半分。クエスト・曜日ダンジョン・イベントダンジョン（と、それらの掃討）に効きます。プレイヤーEXPは、スタミナ半額の間も、ふだんどおり入ります。魔晶石には効きません。');
line();
line('| 期間 | 内容 | 名前 |');
line('|---|---|---|');
for (const c of SCHEDULED_CAMPAIGNS) line(`| ${span(c.startsAt, c.endsAt)} | ${describeCampaign(c)} | ${c.title} |`);
line();

// ------------------------------------------------------------------------------------------------ economy
line('## 5. 魔晶石の収支（無料で入る分）');
line();
const dailyGems = (g: 'daily' | 'weekly'): number => {
  const group = MISSION_GROUPS.find((x) => x.id === g)!;
  return group.missions.reduce((s, m) => s + gemsIn([m.reward]), 0) + gemsIn(group.bonus ?? []);
};
const loginGems = gemsIn(LOGIN_BONUS);
const base = dailyGems('daily') * 365 + dailyGems('weekly') * 52 + loginGems * 12;
const shopGems = SCHEDULED_EVENTS.reduce((s, e) => s + e.shop.reduce((t, i) => t + i.limit * gemsIn(i.rewards), 0), 0);
line('| 入口 | 1年の合計 |');
line('|---|---|');
line(`| デイリーミッション（1日 ${n(dailyGems('daily'))}） | ${n(dailyGems('daily') * 365)} |`);
line(`| ウィークリーミッション（1週 ${n(dailyGems('weekly'))}） | ${n(dailyGems('weekly') * 52)} |`);
line(`| ログインボーナス（1か月 ${n(loginGems)}） | ${n(loginGems * 12)} |`);
line(`| **期間限定イベント（累計報酬＋初回クリア。全部とった場合）** | **${n(eventGems)}** |`);
line(`| 期間限定イベントの交換所（魔晶石の品を、買える上限まで買った場合） | ${n(shopGems)} |`);
line();
const gemsOfEvent = (e: (typeof SCHEDULED_EVENTS)[number]): number => e.milestones.reduce((t, m) => t + gemsIn(m.rewards), 0) + (e.kind === 'dungeon' ? e.firstClearGems.reduce((a, b) => a + b, 0) : 0);
const dungeonGems = SCHEDULED_EVENTS.filter((e) => e.kind === 'dungeon').map(gemsOfEvent);
const missionGems = SCHEDULED_EVENTS.filter((e) => e.kind === 'mission').map(gemsOfEvent);
line(`イベントは、ミッションなどの常時の収入（${n(base)}）の、約 ${Math.round((eventGems / base) * 100)}%（交換所を足して ${Math.round(((eventGems + shopGems) / base) * 100)}%）です。1回の10連は900魔晶石。ダンジョン型1本の累計報酬＋初回クリアは ${n(Math.min(...dungeonGems))}〜${n(Math.max(...dungeonGems))}（10連 約1回ぶん）、ミッション型は ${n(Math.min(...missionGems))}〜${n(Math.max(...missionGems))} です。`);
line(`（ほかに、メインステージの初回クリア・実績・プレイヤーレベルアップなどでも魔晶石が入ります。上の表には入れていません。）`);
line();
line('ピックアップの天井は、★5が50回=5,000魔晶石、★4が30回=3,000魔晶石です。');
line();

// ------------------------------------------------------------------------------------------------ operations
line('## 6. 運営のしかた');
line();
line('**予定を変える**: `src/game/data/schedule.ts` を直す（日付は "MM-DD"、年は自動）。イベントは `makeEvent({...})`、ガチャは `pickupGacha({...})`、キャンペーンは `campaign(...)` の1行です。');
line('その後、`npm test`（日付の穴・重なり・確率の合計・ピックアップが実在するか、などを調べます）と、`npm run schedule:doc`（このファイルを書き直す）を実行します。');
line();
line('**絵**: イベントは `public/assets/events/<id>.jpg`（1050×450）、ガチャは `public/assets/gacha/<id>.jpg`（1024×576）。無いときは、色つきの仮のバナーが出ます。');
line('作り直すときは、`tools/art/manifest.mjs`（`limited` と `pickups` のグループ）を直して、`node tools/art/generate.mjs --group limited,pickups --force --only <id>`、`python tools/art/process.py --install --group limited,pickups` です。');
line();
line('**別の日の画面を見る**（開発用。ローカルの開発サーバーと、DEV環境で使えます。本番用のビルドでは効きません）: アドレスに `?date=2027-01-05` を足すと、ゲームの時計がその日（と時刻）から動きます。日付だけなら、正午です。');
line('ホームやイベント、ガチャ、年間予定などを、その日の姿で見られます。（ローカルの開発サーバーでは、`?scene=Event&date=2027-03-20`、`?scene=Schedule&date=2027-06-01`、`?battle=0&mode=event&event=launch&date=2026-11-20` のように、画面や戦闘も直接開けます。）');
line('**注意**: 日付を進めて遊ぶと、そのブラウザのセーブに、先の日の時刻が入ります（スタミナや放置報酬が満タンになる、など）。確かめたあとは、設定の「リセット」でセーブを消すのが確実です。');
line();
line('**お知らせ・ホームのバナー**: イベントとガチャが始まると、お知らせが自動で1件増え（30日間残る）、ホームのバナーにも自動で入ります。');
line();
line('**ずらす**: サービス開始日が決まったら、`schedule.ts` の日付を、いっせいにずらしてください（季節のイベントは、実際の季節に合わせたほうが自然です）。');
line();
line('## 7. 未決定・これから');
line();
line('- 開始日と、イベントの細かい数字（通貨の量、交換所の値段、累計報酬の段階）は、仮です。実際に遊んで、調整してください。');
line('- イベント限定キャラ（新しい★5・★4）は、まだありません。足すときは、キャラの絵・セリフ・ボイスを作って、ガチャの★5・★4の枠に入れます。');
line('- 効果音は、イベントごとの音（通貨を受け取る音など）も、`docs/SFX_WISHLIST.md` に追加できます。');
line('- 通知（イベント開始・終了前のプッシュ通知）は、アプリ化のときに、スケジュールのデータから作れます。');
line('- 日付は、端末の時計（日本時間のつもり）で動きます。サーバーを用意したら、サーバーの時刻に合わせます。');
line();

console.log(out.join('\n'));
void WEEKDAY_TIERS;
