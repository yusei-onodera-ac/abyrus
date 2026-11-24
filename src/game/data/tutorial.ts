import type { Reward } from './rewards';
import type { RuriPortrait } from './storyScript';
import { tr, trList } from '../i18n';
import { NAME_STEP_LINES_JA } from './transferText';

/**
 * チュートリアル: the pet (ルリ) walks a new player through the game, in text and - when
 * the file exists - voice (`public/assets/voice/<step id>.mp3`). One step is one thing
 * she says; the steps run in order, each on the screen it names. Edit this list to
 * change what she says or where she points.
 *
 *  - advance 'tap'    the player taps to go on (a highlighted `target` is only shown)
 *  - advance 'target' the player has to press the highlighted spot, which then does its
 *                     normal job (so the step is finished by doing the thing)
 *  - advance 'name'   the player types their name (or carries their data over from another
 *                     device instead): only the very first step of a brand-new save, and it can
 *                     not be skipped (see TutorialSystem.confirmName / ui/TutorialOverlay.ts)
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
  advance: 'tap' | 'target' | 'name';
  /** Her expression while she says it (default 'normal'). */
  mood?: RuriPortrait;
}

const HOME_TAB: TutorialRect = { x: 288, y: 1156, w: 144, h: 124 };

/** The steps with `lines` read through trList each time (English in i18n/data/tutorialEn.ts; the voice stays Japanese). */
function localizeSteps(steps: TutorialStep[]): TutorialStep[] {
  return steps.map((step) => {
    const ja = step.lines;
    return {
      ...step,
      get lines() {
        return trList('tutorial', step.id, 'lines', ja);
      },
    };
  });
}

export const TUTORIAL_STEPS: TutorialStep[] = localizeSteps([
  {
    // No voice file for this one (public/assets/voice/name_entry.mp3 is simply not played if it is missing).
    id: 'name_entry',
    mood: 'happy',
    scene: 'Home',
    lines: [...NAME_STEP_LINES_JA],
    advance: 'name',
  },
  {
    id: 'home_welcome',
    mood: 'happy',
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
    mood: 'flying',
    scene: 'StageSelect',
    lines: ['出撃するとスタミナを使うよ。「出撃」を押して、戦いに行こう！'],
    target: { x: 392, y: 684, w: 216, h: 74 },
    advance: 'target',
  },
  {
    id: 'battle_basic',
    mood: 'determined',
    scene: 'Battle',
    lines: ['戦いは自動で進むよ。画面の下に並んだキャラのゲージがたまったら、そのアイコンをタップでスキル発動！', '右下の「オート」を押せば、たまった瞬間に自動で撃ってくれるよ。'],
    target: { x: 628, y: 944, w: 80, h: 80 },
    advance: 'tap',
  },
  {
    id: 'battle_result',
    mood: 'happy',
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
    mood: 'happy',
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
    mood: 'determined',
    scene: 'EnhanceHub',
    lines: ['経験値素材でレベルアップ、フェーズ素材や同じキャラの合成で限界突破。装備もここから強化できるよ。', '強くなったキャラで、もっと先のステージを目指そう！'],
    target: HOME_TAB,
    advance: 'target',
  },
  {
    id: 'home_end',
    mood: 'happy',
    scene: 'Home',
    lines: ['これでひと通り。あとは、軍団長の好きに冒険して！', 'ホーム左の「放置報酬」は、ゲームを閉じている間もたまるよ。その下の「ミッション」をこなせば、ごほうびももらえるから、忘れずにね。', 'ルリは、ずっとここにいるから。'],
    advance: 'tap',
  },
]);

/**
 * 村のチュートリアル: a second, short track. It runs on the first visit to the 村 once the main tutorial is over
 * (finished or skipped), and teaches only the village. Every step is a 'tap' one (the lit spots are pointed at, not
 * pressed), so it never gets in the way of the village's own popups. Voices: `public/assets/voice/<step id>.mp3`.
 */
export const VILLAGE_TUTORIAL_STEPS: TutorialStep[] = localizeSteps([
  {
    id: 'village_welcome',
    mood: 'happy',
    scene: 'Village',
    lines: ['ここが、軍団長の村だよ！ 建物を建てて、育てていくの。', 'お店が稼いだ「売上」が、ゴールドになるんだよ。村が大きいほど、放置報酬も増えるよ。'],
    advance: 'tap',
  },
  {
    id: 'village_header',
    scene: 'Village',
    lines: ['左上が、村のレベルと建築員の数。建築員が空いていれば、同時に工事ができるよ。', 'その下の「売上」は、お店が1時間に稼ぐゴールドだよ。'],
    target: { x: 12, y: 140, w: 274, h: 62 },
    advance: 'tap',
  },
  {
    id: 'village_materials',
    scene: 'Village',
    lines: ['木材・鉄・石は、建築に使う素材。ここにだけ表示されるよ。', '放置報酬、曜日ダンジョン、クエストで集まるし、伐採所や採石場、鉱山を建てれば自分でも増やせるよ。'],
    target: { x: 292, y: 140, w: 352, h: 62 },
    advance: 'tap',
  },
  {
    id: 'village_build',
    mood: 'determined',
    scene: 'Village',
    lines: ['「建築」を押すと、建てる物を選べるよ。', 'ゴールドと素材が足りれば、好きな場所に置ける。置いたら ✓ で決定！ 工事には時間がかかるけど、魔晶石で急ぐこともできるよ。'],
    target: { x: 4, y: 1162, w: 202, h: 114 },
    advance: 'tap',
  },
  {
    id: 'village_buildings',
    scene: 'Village',
    lines: ['建物をタップすると、強化・移動・撤去のボタンが出るよ。', 'お城を強くすると、建てられる数と、建物の最大レベルが増える！ まずはお城から育てよう。'],
    advance: 'tap',
  },
  {
    id: 'village_raid',
    mood: 'worried',
    scene: 'Village',
    lines: ['ときどき、獣が村を襲いに来るよ。柵と門を強くしておけば、防げるの。', '襲撃が来たら「迎え撃つ」で戦えるよ。壊されても、素材で直せるから安心してね。'],
    advance: 'tap',
  },
  {
    id: 'village_quests',
    scene: 'Village',
    lines: ['「依頼」は、毎日の村のお仕事。こなすと、素材がもらえるよ。'],
    target: { x: 284, y: 1182, w: 152, h: 92 },
    advance: 'tap',
  },
  {
    id: 'village_goals',
    scene: 'Village',
    lines: ['「目標」を達成すると、魔晶石がもらえるよ。', '村を育てる道しるべにしてね。'],
    target: { x: 648, y: 140, w: 62, h: 62 },
    advance: 'tap',
  },
  {
    id: 'village_claim',
    scene: 'Village',
    lines: ['「受け取る」で、たまった売上のゴールドをもらえるよ。', 'ゲームを閉じている間もたまるから、ときどき来てね！'],
    target: { x: 516, y: 1162, w: 196, h: 114 },
    advance: 'tap',
  },
  {
    id: 'village_end',
    mood: 'happy',
    scene: 'Village',
    lines: ['あとは、軍団長の好きなように！ 道を敷いたり、木や花、噴水で飾ったりして、自分だけの村を作ってね。'],
    advance: 'tap',
  },
]);

/** Handed over when the last village step is finished. */
export const VILLAGE_TUTORIAL_REWARD: Reward[] = [{ type: 'gems', amount: 30 }];

/** Handed over when the last step is finished (not when the tutorial is skipped). */
export const TUTORIAL_REWARD: Reward[] = [
  { type: 'gems', amount: 100 },
  { type: 'item', item: 'exp_m', amount: 5 },
];

/** The guide's name as shown: use `tutorialGuideName()` (the English is "Luri"). */
export const TUTORIAL_GUIDE_NAME = 'ルリ'; // i18n-ignore
export const tutorialGuideName = (): string => tr('tutorial', 'guide', 'name', TUTORIAL_GUIDE_NAME);
