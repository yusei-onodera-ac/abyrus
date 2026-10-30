import type { Reward } from './rewards';

/**
 * チュートリアル: the pet (ルリ) walks a new player through the game, in text and - when
 * the file exists - voice (`public/assets/voice/<step id>.mp3`). One step is one thing
 * she says; the steps run in order, each on the screen it names. Edit this list to
 * change what she says or where she points.
 *
 *  - advance 'tap'    the player taps to go on (a highlighted `target` is only shown)
 *  - advance 'target' the player has to press the highlighted spot, which then does its
 *                     normal job (so the step is finished by doing the thing)
 *  - on 'result'      shown when the fight's result panel appears, not when the screen opens
 *
 * Coordinates are in game pixels (the screen is 720 x 1280) as a top-left rectangle.
 */
export interface TutorialRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TutorialStep {
  id: string;
  /** The scene this step runs on (a scene key). */
  scene: string;
  on?: 'enter' | 'result';
  /** What she says: one line per entry, shown together. */
  lines: string[];
  target?: TutorialRect;
  advance: 'tap' | 'target';
}

const HOME_TAB: TutorialRect = { x: 288, y: 1156, w: 144, h: 124 };

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'home_welcome',
    scene: 'Home',
    lines: ['やっほー、軍団長！ ルリだよ。', 'これから、この世界での戦い方をアタシが教えてあげる。ちゃんとついてきてね！'],
    advance: 'tap',
  },
  {
    id: 'home_bar',
    scene: 'Home',
    lines: ['上のバーが軍団長の持ち物。ゴールド、魔晶石、スタミナだよ。', 'スタミナはクエストに出ると減って、時間がたつと戻るの。'],
    target: { x: 0, y: 0, w: 720, h: 126 },
    advance: 'tap',
  },
  {
    id: 'home_quest',
    scene: 'Home',
    lines: ['まずはクエスト！ 光ってるボタンを押して、出撃しよう。'],
    target: { x: 68, y: 545, w: 220, h: 220 },
    advance: 'target',
  },
  {
    id: 'quest_node',
    scene: 'StageSelect',
    lines: ['最初のステージはここ。丸いマークを押してみて。'],
    target: { x: 46, y: 432, w: 100, h: 100 },
    advance: 'target',
  },
  {
    id: 'quest_go',
    scene: 'StageSelect',
    lines: ['出撃するとスタミナを使うよ。「出撃」を押して、戦いに行こう！'],
    target: { x: 392, y: 684, w: 216, h: 74 },
    advance: 'target',
  },
  {
    id: 'battle_basic',
    scene: 'Battle',
    lines: ['戦いは自動で進むよ。ヒーローの下のゲージがたまったら、その子をタップでスキル発動！', '右下の「オート」を押せば、たまった瞬間に自動で撃ってくれるよ。'],
    target: { x: 490, y: 1152, w: 220, h: 76 },
    advance: 'tap',
  },
  {
    id: 'battle_result',
    scene: 'Battle',
    on: 'result',
    lines: ['やったね、勝利！ お金や経験値、素材がもらえたよ。', '「次のステージへ」で続けて戦えるし、ホームに戻ってもいいよ。'],
    advance: 'tap',
  },
  {
    id: 'home_gacha',
    scene: 'Home',
    lines: ['仲間を増やそう！ ガチャのボタンを押してみて。'],
    target: { x: 290, y: 700, w: 220, h: 220 },
    advance: 'target',
  },
  {
    id: 'gacha_info',
    scene: 'Gacha',
    lines: ['ここでは魔晶石を使って、新しい仲間や装備を召喚できるよ。', '「詳細」を見れば、どのキャラが出るか、出る確率も全部わかる。はじめてのガチャは、30回目までにレアが必ず出るから、遠慮なく回してね！', '見終わったら、下のホームに戻ろう。'],
    target: HOME_TAB,
    advance: 'target',
  },
  {
    id: 'home_roster',
    scene: 'Home',
    lines: ['仲間が増えたら、パーティを組もう。編成のボタンを押して。'],
    target: { x: 68, y: 860, w: 220, h: 220 },
    advance: 'target',
  },
  {
    id: 'roster_info',
    scene: 'Roster',
    lines: ['前に3人、後ろに2人。同じキャラは1人しか入れられないよ。', '編集を押して、キャラをタップで並べてね。終わったら、ホームに戻ろう。'],
    target: HOME_TAB,
    advance: 'target',
  },
  {
    id: 'home_enhance',
    scene: 'Home',
    lines: ['キャラを強くするなら「強化」。下のバーのここだよ。'],
    target: { x: 432, y: 1156, w: 144, h: 124 },
    advance: 'target',
  },
  {
    id: 'enhance_info',
    scene: 'EnhanceHub',
    lines: ['経験値素材でレベルアップ、フェーズ素材や同じキャラの合成で限界突破。装備もここから強化できるよ。', '強くなったキャラで、もっと先のステージを目指そう！'],
    target: HOME_TAB,
    advance: 'target',
  },
  {
    id: 'home_end',
    scene: 'Home',
    lines: ['これでひと通り。あとは、軍団長の好きに冒険して！', 'ホーム左の「放置報酬」は、ゲームを閉じている間もたまるよ。右の「ミッション」をこなせば、毎日ごほうびももらえるから、忘れずにね。', 'ルリは、ずっとここにいるから。'],
    advance: 'tap',
  },
];

/** Handed over when the last step is finished (not when the tutorial is skipped). */
export const TUTORIAL_REWARD: Reward[] = [
  { type: 'gems', amount: 100 },
  { type: 'item', item: 'exp_m', amount: 5 },
];

export const TUTORIAL_GUIDE_NAME = 'ルリ';
