// i18n, Traditional Chinese: it is made from the Simplified tables by tools/i18n/zh-hant.mjs (OpenCC), never typed. These tests check that
// the making cannot damage a text's structure - {placeholders}, digits, line breaks, ASCII - with a stand-in converter (no OpenCC needed),
// and that the tables as committed (zhHant/, data/*ZhHant.ts) keep the structure of the Simplified ones row by row. That the committed files
// are the generator's current output is `npm run i18n:check`.
import { asciiOf, checkOverride, checkStructure, convertText, dataFile, placeholdersOf, quote, uiFile } from '../i18n/zh-hant-lib.mjs';
import { digitsOf } from '../i18n/lang-rules.mjs';
import { TABLES } from '../../src/game/i18n/tables';
import { DATA_TEXTS } from '../../src/game/i18n/dataTexts';
import { dataCells } from '../i18n/lang-rules.mjs';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

// ---- the text side, with a stand-in for OpenCC (a few characters, and a deliberately bad one)
const MAP: Record<string, string> = { 个: '個', 关: '關', 门: '門', 后: '後', 账: '賬', 软: '軟', 件: '體', 点: '點', 击: '擊' };
const fake = (s: string): string => Array.from(s).map((c) => MAP[c] ?? c).join('');
{
  const src = '获得{count}个魔晶石\n点击(x2) 100%，剩余 Lv.12 {n, plural, other {# 个}}';
  const out = convertText(src, { convert: fake });
  ok(out === '获得{count}個魔晶石\n點擊(x2) 100%，剩余 Lv.12 {n, plural, other {# 個}}', `only the Chinese runs are converted: ${out.replace(/\n/g, '/')}`);
  ok(asciiOf(out) === asciiOf(src) && placeholdersOf(out) === placeholdersOf(src) && checkStructure(src, out) === null, 'placeholders, digits, line breaks and every other ASCII character come through byte for byte');
  const damaging = (s: string): string => s.replace(/个/g, '2个').replace(/{/g, '');
  const bad = convertText(src, { convert: damaging });
  ok(checkStructure(src, bad) !== null, 'a converter that damages the ASCII is caught');
  ok(convertText('账号', { convert: fake, words: { 账号: '帳號' } }) === '帳號' && convertText('我的账户', { convert: fake, words: { 账号: '帳號' } }) === '我的賬户', 'a word of the overrides wins over the converter, wherever it occurs; other text is converted');
  ok(convertText('账号和账号', { convert: fake, words: { 账号: '帳號', 账号和: '帳號與' } }) === '帳號與帳號', 'the longest overriding word is taken first');
  ok(convertText('“关门”和‘后’', { convert: fake }) === '「關門」和『後』', 'quotation marks become 「」 and 『』');
  ok(convertText('', { convert: fake }) === '' && convertText('abc 123', { convert: fake }) === 'abc 123', 'empty and ASCII-only texts are left alone');
}
{
  ok(checkOverride('获得{count}个', '獲得{count}個') === null, 'an override that keeps the placeholders and numbers is accepted');
  ok(checkOverride('获得{count}个', '獲得{n}個') !== null && checkOverride('获得100个', '獲得10個') !== null && checkOverride('甲\n乙', '甲乙') !== null, 'an override that changes a placeholder, a number or the line breaks is refused');
}
{
  ok(quote("it's") === '"it\'s"' && quote('a\nb') === "'a\\nb'" && quote('a\\b') === "'a\\\\b'" && quote('魔晶石') === "'魔晶石'", 'a string literal is written the way the repo writes them');
  const file = dataFile('x', { t: { 'a.b': { n: '一', m: '二' }, c: { n: '三' } }, empty: {} });
  ok(file.includes("t: {\n    'a.b': { n: '一', m: '二' },\n    c: { n: '三' },\n  },\n  empty: {},") && file.startsWith('// 生成:'), 'a data file: ids that are not identifiers are quoted, an empty table stays, the header says it is generated');
  ok(uiFile('home', [['home.a', '甲']]).includes("export const home: Partial<Part<'home'>> = {\n  'home.a': '甲',\n};") && uiFile('home', []).includes('= {};'), 'a UI file');
}

// ---- the committed tables keep the structure of the Simplified ones
{
  const hans = TABLES['zh-Hans'] as Record<string, string>;
  const hant = TABLES['zh-Hant'] as Record<string, string>;
  const missing = Object.keys(hans).filter((k) => !(k in hant));
  const extra = Object.keys(hant).filter((k) => !(k in hans));
  ok(missing.length === 0 && extra.length === 0, `zh-Hant has exactly the UI keys zh-Hans has (${Object.keys(hans).length})${missing.length + extra.length ? `: missing ${missing.slice(0, 3).join(', ')} extra ${extra.slice(0, 3).join(', ')}` : ''}`);
  const damaged = Object.keys(hans).filter((k) => k in hant && (placeholdersOf(hans[k]) !== placeholdersOf(hant[k]) || digitsOf(hans[k]) !== digitsOf(hant[k]) || hans[k].split('\n').length !== hant[k].split('\n').length));
  ok(damaged.length === 0, `every UI message keeps its placeholders, numbers and line breaks${damaged.length ? ` (${damaged.slice(0, 5).join(', ')})` : ''}`);

  const hansCells = dataCells(DATA_TEXTS['zh-Hans']);
  const hantCells = dataCells(DATA_TEXTS['zh-Hant']);
  const cellMissing = [...hansCells.keys()].filter((c) => !hantCells.has(c));
  const cellExtra = [...hantCells.keys()].filter((c) => !hansCells.has(c));
  ok(cellMissing.length === 0 && cellExtra.length === 0, `zh-Hant has exactly the data rows zh-Hans has (${hansCells.size})${cellMissing.length + cellExtra.length ? `: missing ${cellMissing.slice(0, 3).join(', ')} extra ${cellExtra.slice(0, 3).join(', ')}` : ''}`);
  const cellDamaged = [...hansCells].filter(([c, text]) => hantCells.has(c) && (digitsOf(text) !== digitsOf(hantCells.get(c)!) || text.split('\n').length !== hantCells.get(c)!.split('\n').length));
  ok(cellDamaged.length === 0, `every data row keeps its numbers and line breaks${cellDamaged.length ? ` (${cellDamaged.slice(0, 5).map(([c]) => c).join(', ')})` : ''}`);

  // characters that exist only in Simplified: none may be left in the Traditional (an override that forgot to convert, a converter gap)
  const SIMPLIFIED_ONLY = /[这们个来说时与对发开关门问间东车见长爱从让设话认请边过还进远连选达带头题钱买卖红绿蓝岁节乐务为产业会传众优伤价体党兴养兽击则剑动励华单卫厅历变号吗响团图围场处奋实审将尔尽层岛币师帅广庆应异张弹强当录总战扩护拥择无显术杀杂权条极构样欢毕汉汤济灭灵灯热爷犹现电画疗盖盘确码离种积称纪约级纯线练细终组经结给绝统继绩维编罗联声职胜脑脚获观规览计订讨训议记讲许论访证评识诉词译试诗诚该详语误读调谁谈谢谱贝负财责败货贪贫购贯贵贸费资赏赛赶趋跃轨转轮软轻载较辅辆输迁运迟适递释针钉钓钟钢钥钻铁铃铜银链锁锐错键锻镇闪闭闲闹阅队阳阴阵阶际陆陈险随隐难雾静页顶项顺须顾顿预领颇频颜额风飘飞饥饭饮饰馆馈驱驳驶驻骑骗骤髅鱼鲜鸟鸡鸣麦黄齐齿龙龟]/;
  const leftover = [...hantCells].filter(([, text]) => SIMPLIFIED_ONLY.test(text)).map(([c]) => c);
  const leftoverUi = Object.keys(hant).filter((k) => SIMPLIFIED_ONLY.test(hant[k]));
  ok(leftover.length === 0 && leftoverUi.length === 0, `no Simplified-only character is left in zh-Hant${leftover.length + leftoverUi.length ? ` (${[...leftoverUi, ...leftover].slice(0, 5).join(', ')})` : ''}`);
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
