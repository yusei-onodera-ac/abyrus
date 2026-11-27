// i18n, line breaking (ui/TextLayout.ts): Japanese, English, Korean (breaks at spaces, a word kept whole) and Chinese (no spaces: any
// two characters, never before a closing mark / after an opening one). The canvas is faked: a full-width character is 20 px, a Latin
// letter or digit 11 px, a space 6 px, a punctuation mark of the Latin kind 6 px - the shapes of the real widths, so the rules (not
// the font) are what is tested. The real fonts are looked at in screenshots (docs/I18N.md).
import { breakLines, lineText, NEWLINE, NO_LINE_END, NO_LINE_START, tokenize } from '../../src/game/ui/TextLayout';
import { getLanguage, setLanguage } from '../../src/game/i18n';
import { textWrap } from '../../src/game/ui/CardParts';

let failures = 0;
function ok(cond: unknown, label: string): void {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

const advance = (ch: string): number => {
  if (ch === ' ') return 6;
  if (/[.,:;!?'"()[\]{}·]/.test(ch)) return 6;
  if (/[\x00-\x7f]/.test(ch)) return 11;
  return 20;
};
(globalThis as { document?: unknown }).document = {
  documentElement: {},
  createElement: () => ({ getContext: () => ({ font: '', measureText: (text: string) => ({ width: Array.from(text).reduce((n, c) => n + advance(c), 0) }) }) }),
};

const FONT = 'bold 20px Arial';
/** The lines `text` is set in at `width` px (the way CardParts.wrappedText sets them: one character of slack for a hanging mark). */
function lines(text: string, width: number): string[] {
  return breakLines(tokenize(text, FONT), width - 20, 20).map(lineText);
}
const wide = (line: string): number => Array.from(line).reduce((n, c) => n + advance(c), 0);

// ---- Japanese: unchanged behaviour (kinsoku, a break between any two characters)
{
  const ja = lines('この森には、古い言い伝えが残っている。「迷い込んだ者は、二度と戻らない」と。', 200);
  ok(ja.every((l) => !NO_LINE_START.has(Array.from(l)[0]) && !NO_LINE_END.has(Array.from(l).at(-1)!)), 'Japanese: no line starts with 、。」 or ends with 「');
  ok(ja.join('') === 'この森には、古い言い伝えが残っている。「迷い込んだ者は、二度と戻らない」と。' && ja.length >= 3, `Japanese is broken between characters (${ja.length} lines)`);
}

// ---- English: only at spaces
{
  const en = lines('Take the Gems from the village chest and spend them on a Rate-Up summon, Commander!', 220);
  ok(en.join(' ') === 'Take the Gems from the village chest and spend them on a Rate-Up summon, Commander!', 'English: lines join back with the spaces they were cut at (no word was split)');
  ok(en.every((l) => wide(l) <= 220), 'English: no line is wider than the box');
}

// ---- Korean: words are kept whole; only a word wider than a whole line is cut
{
  const text = '마을 상자에서 마정석을 꺼내 픽업 소환에 사용하세요, 사령관님. 오늘의 보상은 100 골드입니다.';
  const ko = lines(text, 200);
  ok(ko.join(' ') === text, `Korean: lines join back with the spaces they were cut at (${ko.length} lines: ${ko.join(' | ')})`);
  ok(ko.every((l) => wide(l) <= 200), 'Korean: no line is wider than the box');
  ok(ko.every((l) => !NO_LINE_START.has(Array.from(l)[0])), 'Korean: a period or comma never starts a line');
  const long = lines('가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하.', 200);
  ok(long.length >= 4 && long.every((l) => wide(l) <= 200), `Korean: a word wider than the line is cut into lines that fit (${long.length} lines)`);
  ok(long.join('') === '가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사아자차카타파하.' && !NO_LINE_START.has(Array.from(long.at(-1)!)[0]), 'and nothing is lost, the final period stays with its word');
  const spaced = lines('가나다라마바사아자차카타파하가나다라마바사아자차카타파하 안녕하세요 반갑습니다', 200);
  ok(spaced.join(' ').replace(/\s+/g, '') === '가나다라마바사아자차카타파하가나다라마바사아자차카타파하안녕하세요반갑습니다', 'a long word and short ones after it: all text kept');
  ok(spaced.slice(-1)[0].includes('안녕하세요') || spaced.slice(-2).join(' ').includes('안녕하세요'), 'the words after it are still kept whole');
}

// ---- Chinese: any two characters, with the rules of Chinese punctuation
{
  const marks = Array.from('，。！？；：、）」』】》”’·…');
  const opens = Array.from('（「『【《“‘');
  const text = '“迷路者再也回不来了。”——村里的老人这样说。在迷之森深处，红色的雾气正在升起，（据说那是狂化因子的征兆）请务必小心；还有，别忘了带上「魔晶石」。';
  for (const width of [140, 180, 220, 260, 300, 340]) {
    const zh = lines(text, width);
    const bad = zh.filter((l) => marks.includes(Array.from(l)[0]) || opens.includes(Array.from(l).at(-1)!));
    if (bad.length) console.log('      ' + zh.join(' | '));
    ok(bad.length === 0 && zh.join('') === text, `Chinese at ${width}px: no line starts with a closing mark or ends with an opening one (${zh.length} lines)${bad.length ? `: ${bad.join(' | ')}` : ''}`);
    ok(zh.every((l) => wide(l) <= width + 20), `Chinese at ${width}px: nothing runs past the box (a mark may hang one character)`);
  }
  const mixed = lines('获得 Lv.12 的奖励：100 金币和 3 个魔晶石 (Gems)', 160);
  ok(mixed.join('').replace(/ /g, '') === '获得Lv.12的奖励：100金币和3个魔晶石(Gems)' && mixed.every((l) => !/Lv\.$|^12/.test(l)), `Chinese with Latin and numbers: "Lv.12" and "(Gems)" are not cut (${mixed.join(' | ')})`);
  const nl = breakLines(tokenize(`第一行${NEWLINE}第二行很长很长很长很长很长很长很长很长`, FONT), 100, 20).map(lineText);
  ok(nl[0] === '第一行' && nl.length >= 3, 'an explicit line break is kept');
}

// ---- Phaser's own wrapping (captions, dialog messages): left alone for Japanese / English, our own line breaking for Korean and Chinese
{
  setLanguage('ja', { persist: false });
  ok(JSON.stringify(textWrap(300)) === '{"width":300}' && JSON.stringify(textWrap(300, true)) === '{"width":300,"useAdvancedWrap":true}', 'Japanese: the options Phaser got before, unchanged');
  setLanguage('en', { persist: false });
  ok(JSON.stringify(textWrap(300, true)) === '{"width":300,"useAdvancedWrap":true}', 'English: unchanged');
  const fake = { style: { fontSize: '20px', fontStyle: 'bold', fontFamily: 'Arial', strokeThickness: 0 } };
  setLanguage('ko', { persist: false });
  {
    const text = '가나다라마바사아자차카타파하가나다라마바사아자차카타파하 안녕하세요 반갑습니다';
    const out = String(textWrap(200).callback!(text, fake as never)).split('\n');
    ok(out.length >= 3 && out.every((l) => wide(l) <= 200), `ko: the callback cuts a Korean word that is wider than the box (${out.length} lines)`);
    ok(out.slice(-2).join(' ').includes('안녕하세요 반갑습니다') || out.at(-1)!.includes('반갑습니다'), 'and keeps the short words whole');
  }
  for (const code of ['zh-Hans', 'zh-Hant'] as const) {
    setLanguage(code, { persist: false });
    const wrap = textWrap(200);
    ok(typeof wrap.callback === 'function' && wrap.width === 200, `${code}: a callback that breaks between characters`);
    const out = String(wrap.callback!('这是一段没有空格的中文，必须在任何两个字之间换行，而不是溢出到框外。', fake as never)).split('\n');
    ok(out.length >= 3 && out.every((l) => wide(l) <= 200) && out.join('') === '这是一段没有空格的中文，必须在任何两个字之间换行，而不是溢出到框外。', `${code}: the callback wraps a sentence with no spaces into ${out.length} lines that fit`);
  }
  setLanguage('ja', { persist: false });
  void getLanguage;
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
