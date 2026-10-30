import type { HeroClass } from '../types';

/**
 * ホーム画面のキャラをタップしたときのセリフ。吹き出しに文字が出て、音声ファイルがあれば
 * 声も出る。セリフと声はここだけで決まる(画面側のコードは触らない)。
 *
 *  - HERO_LINES      そのキャラ専用のセリフ。キャラ id ごとに足す。
 *                    声: public/assets/voice/home_<キャラid>_<番号>.mp3  (番号は 1 から)
 *  - CLASS_LINES     専用のセリフがないキャラは、職業ごとの共通セリフを言う。
 *                    声: public/assets/voice/home_<職業>_<番号>.mp3
 *                    (職業: warrior mage archer tank healer)
 *
 * 例: gauss の 2 つ目のセリフの声は home_gauss_2.mp3。声のファイルがなければ、
 * 文字だけが出る。
 */
export const HERO_LINES: Record<string, string[]> = {
  // 専用のセリフを足すときは、ここに書く。例:
  // gauss: ['算盤の音が聞こえるか？ 全て計算どおりだ。', '数字は嘘をつかん。信じるがいい。', '守りは任せろ。'],
};

export const CLASS_LINES: Record<HeroClass, string[]> = {
  warrior: ['剣の腕なら誰にも負けないぞ！', '前は任せて。ひとりも通さない！', '鍛錬は欠かしてないからね。'],
  mage: ['魔力が満ちているのを感じます……。', 'ふふ、面白いことになりそうですね。', '計算どおり。次の一手はもう見えています。'],
  archer: ['狙いは外さないよ。見ててね！', '風向き、良好。いつでもいけるよ。', '遠くの敵も、見逃さないから。'],
  tank: ['どんな攻撃も、俺が受け止める。', '背中は預けてくれ。', 'びくともしないさ。かかってこい！'],
  healer: ['傷ついたら、すぐに言ってくださいね。', 'みんなが無事なのが、いちばんです。', '今日も、一緒にがんばりましょう。'],
};

/** What the hero can say and which voice files go with it: [text, voice id] pairs. */
export function homeLinesFor(heroId: string, heroClass: HeroClass): { text: string; voice: string }[] {
  const own = HERO_LINES[heroId];
  if (own && own.length > 0) return own.map((text, i) => ({ text, voice: `home_${heroId}_${i + 1}` }));
  return CLASS_LINES[heroClass].map((text, i) => ({ text, voice: `home_${heroClass}_${i + 1}` }));
}
