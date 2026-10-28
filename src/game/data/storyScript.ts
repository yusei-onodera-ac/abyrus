/**
 * All story-mode script content for the Quest campaign: novel-game-style
 * dialogue arrays consumed by StoryScene. Pure data, following the same
 * convention as banners.ts/gachaBanners.ts/regions.ts - content lives here
 * so writers can extend/edit the story without touching scene code.
 *
 * No story-cutscene art exists yet. `background` below is a key into
 * STORY_BACKGROUNDS, a small placeholder gradient palette - StoryScene
 * paints a full-bleed gradient rectangle from it instead of an
 * illustration. Swapping in real backgrounds later means adding an image
 * loader keyed the same way applyBackground() already does for scene
 * backgrounds; no StoryScene logic needs to change. Likewise there is no
 * portrait art: `portrait` picks one of a few procedurally-drawn moods for
 * Ruri (the only character who gets a recurring portrait at all - per the
 * brief, the player stays a silent, unillustrated operator and every other
 * speaker is drawn as a plain silhouette bust).
 */

export type StoryCue = 'shake' | 'flashRed' | 'none';
export type RuriPortrait = 'normal' | 'worried' | 'determined' | 'blank';

export interface StoryLine {
  /** Empty string = pure narration line, drawn without a nameplate. */
  speaker: string;
  text: string;
  /** Key into STORY_BACKGROUNDS. */
  background: string;
  /** One-shot punctuation effect played when this line is shown. */
  cue?: StoryCue;
  /** Only meaningful when speaker === 'ルリ'; defaults to 'normal'. */
  portrait?: RuriPortrait;
}

export interface StoryScript {
  id: string;
  lines: StoryLine[];
}

/** Placeholder gradient backdrop palette - top/bottom colors for a
 *  full-bleed vertical gradient, standing in for real cutscene art. */
export const STORY_BACKGROUNDS: Record<string, { top: number; bottom: number }> = {
  forest_day: { top: 0x1b3a1f, bottom: 0x3f6b3a },
  forest_mist: { top: 0x2a1414, bottom: 0x5c2020 },
  wasteland: { top: 0x4a3a1f, bottom: 0x8a6a3a },
  frostpeak: { top: 0x1c2a3a, bottom: 0x4a7a8a },
  frostpeak_lab: { top: 0x14181f, bottom: 0x2a3a44 },
  ruins: { top: 0x2a1430, bottom: 0x4a2060 },
  ruins_miasma: { top: 0x1a0a14, bottom: 0x5c1030 },
  twilight_city: { top: 0x2a1830, bottom: 0x6b2d4a },
  twilight_tower: { top: 0x160a20, bottom: 0x3a1440 },
  tower_summit: { top: 0x0a0614, bottom: 0x3a1030 },
  collapse: { top: 0x0a0a0e, bottom: 0x2a1818 },
  dawn: { top: 0x2a2440, bottom: 0x8a6a7a },
};

// --- 地方1: 迷いの森 -------------------------------------------------------

const FOREST_INTRO: StoryScript = {
  id: 'forest_intro',
  lines: [
    { speaker: '', text: '鳥のさえずりが、ある日を境にぴたりと止んだ。', background: 'forest_day' },
    { speaker: '', text: '迷いの森の奥、軍団長の住む村に、見たことのない赤い霧が立ち込めていた。', background: 'forest_mist' },
    { speaker: 'ルリ', text: '……ねえ、様子がおかしいよ。森の動物たち、みんな目が赤く光ってる。', background: 'forest_mist', portrait: 'worried' },
    { speaker: 'ルリ', text: 'アタシ、ずっとこの森で軍団長と一緒にいたのに……なんで自分だけ平気なんだろ。', background: 'forest_mist', portrait: 'worried' },
    { speaker: 'ルリ', text: 'って、こんなこと言ってる暇ないか。とにかく、言葉が喋れるようになったのは好都合だよね!', background: 'forest_mist' },
    { speaker: 'ルリ', text: '軍団長、聞いてる? ――これから起きることを、ちゃんと言葉で伝えられるのはアタシだけなんだから。', background: 'forest_mist' },
    { speaker: '', text: '森の獣たちが、次々と理性を失っていく。原因は分からない。ただ確かなのは――これが"始まり"だということ。', background: 'forest_mist', cue: 'flashRed' },
    { speaker: 'ルリ', text: '逃げる? ううん、違うよね。軍団長の目、もう決まってる。', background: 'forest_mist', portrait: 'determined' },
    { speaker: 'ルリ', text: 'じゃあ決まり。アタシも付き合う。最後まで、ずっと。', background: 'forest_mist', portrait: 'determined' },
    { speaker: '', text: 'インコのルリと軍団長――奇妙な相棒の旅が、ここから始まる。', background: 'forest_mist' },
  ],
};

const FOREST_OUTRO: StoryScript = {
  id: 'forest_outro',
  lines: [
    { speaker: '', text: '森の奥――最後の獣を退けた時、ルリは何かに気づいたように羽を震わせた。', background: 'forest_mist' },
    { speaker: 'ルリ', text: 'この赤い瘴気、森の外にも繋がってる……。風に乗って、どこまでも流れていってるみたい。', background: 'forest_mist', portrait: 'worried' },
    { speaker: 'ルリ', text: 'つまりこれ、森だけの話じゃなかったってこと。', background: 'forest_mist' },
    { speaker: '', text: '村の外れに立つと、灰色の荒野が地平線まで続いていた。瘴気の匂いは、そこにも確かに届いている。', background: 'wasteland' },
    { speaker: 'ルリ', text: '――行くしかないよね。原因を突き止めるまで、きっとどこにも安全な場所なんてない。', background: 'wasteland', portrait: 'determined' },
    { speaker: 'ルリ', text: '軍団長、荒野までついてきてよね。アタシの翼じゃ、長旅はちょっと心細いし。', background: 'wasteland' },
    { speaker: '', text: '迷いの森を後にし、二人は灰塵の荒野へと足を踏み出した。', background: 'wasteland' },
  ],
};

// --- 地方2: 灰塵の荒野 -----------------------------------------------------

const WASTELAND_INTRO: StoryScript = {
  id: 'wasteland_intro',
  lines: [
    { speaker: '', text: '灰色の砂塵が舞う荒野。隊商の荷馬車が列をなし、猟師ギルドの旗がはためいていた。', background: 'wasteland' },
    { speaker: '猟師ギルド長', text: 'また新顔か。……森から来たのか? なら話が早い。この荒野でも獣どもが牙を剥き始めてる。', background: 'wasteland' },
    { speaker: 'ルリ', text: 'やっぱり森だけじゃなかった。じゃあこれ、自然に起きてることなの?', background: 'wasteland', portrait: 'worried' },
    { speaker: '猟師ギルド長', text: '違うな。俺たちは長年この荒野で獣を見てきた。これは――人の手が入った"何か"の仕業だ。', background: 'wasteland' },
    { speaker: '猟師ギルド長', text: '噛まれても死なない傷から、奇妙な赤い結晶が見つかる。あれを俺たちは「狂化因子」と呼んでる。', background: 'wasteland' },
    { speaker: 'ルリ', text: '狂化因子……。じゃあ、誰かがこれをばら撒いてるってこと?', background: 'wasteland' },
    { speaker: '猟師ギルド長', text: 'さあな。だがその出どころを辿れば、山の方に何かあるという噂だ。古い施設があったはずだ。', background: 'wasteland' },
    { speaker: 'ルリ', text: '軍団長、聞いた? 山……行くしかないね。', background: 'wasteland', portrait: 'determined' },
    { speaker: '', text: '荒野の獣たちを退けながら、二人は因子の出どころを追い始める。', background: 'wasteland' },
  ],
};

const WASTELAND_OUTRO: StoryScript = {
  id: 'wasteland_outro',
  lines: [
    { speaker: '猟師ギルド長', text: 'ここまでよく凌いだな。……山嶺に向かうなら、これを持っていけ。古い地図だ。', background: 'wasteland' },
    { speaker: 'ルリ', text: '「共生研究院」……って書いてある。動物と人間の共生を研究してた機関、だよね?', background: 'wasteland' },
    { speaker: '猟師ギルド長', text: 'ああ。随分前に解散したはずだが……まだ山の奥に、施設の残骸が残ってるという話もある。', background: 'wasteland' },
    { speaker: 'ルリ', text: 'そこに、因子の出どころがあるかもしれない。', background: 'wasteland', portrait: 'determined' },
    { speaker: '', text: '荒野を抜け、二人は蒼氷の山嶺を目指した。', background: 'frostpeak' },
  ],
};

// --- 地方3: 蒼氷の山嶺 -----------------------------------------------------

const FROSTPEAK_INTRO: StoryScript = {
  id: 'frostpeak_intro',
  lines: [
    { speaker: '', text: '吹雪の中にそびえる山嶺。白く凍りついた尾根の先に、崩れかけた施設の輪郭が見えた。', background: 'frostpeak' },
    { speaker: 'ルリ', text: 'あれが……共生研究院の跡? こんな山奥に。', background: 'frostpeak', portrait: 'worried' },
    { speaker: '', text: '施設の壁には、色褪せた看板――「動物と人間、真の共生を目指して」。', background: 'frostpeak_lab' },
    { speaker: 'ルリ', text: '真の共生、か。……なんだか、今の状況とは正反対の言葉に聞こえるね。', background: 'frostpeak_lab' },
    { speaker: '', text: '施設の奥深くには、まだ何かが息づいているような気配があった。', background: 'frostpeak_lab' },
    { speaker: 'ルリ', text: 'ここの研究院、トップに立ってた人がいたはずなんだけど……施設のどこにも名前が残ってない。', background: 'frostpeak_lab' },
    { speaker: 'ルリ', text: 'ただ、昔ここで働いてたっていう人たちは、みんな同じ呼び方をしてたらしい。「教授」って。', background: 'frostpeak_lab' },
    { speaker: 'ルリ', text: '教授……。軍団長、この施設の奥で、きっとその人に繋がる何かが見つかるはずだよ。', background: 'frostpeak_lab', portrait: 'determined' },
  ],
};

const FROSTPEAK_OUTRO: StoryScript = {
  id: 'frostpeak_outro',
  lines: [
    { speaker: '', text: '施設の最深部、崩れた研究室に、使い込まれた実験記録が山のように積まれていた。', background: 'frostpeak_lab' },
    { speaker: 'ルリ', text: 'これ……因子の培養記録だ。日付はどんどん新しくなってる。つまり――今も、どこかで続けられてるってこと。', background: 'frostpeak_lab', portrait: 'worried' },
    { speaker: '', text: '記録の最後のページには、一枚の地図が挟まれていた。示す先は、さらに南――古い遺跡。', background: 'frostpeak_lab' },
    { speaker: 'ルリ', text: '「遺跡」……。教授は今、そこにいるのかもしれない。', background: 'frostpeak_lab' },
    { speaker: 'ルリ', text: '軍団長、ここまで来たらもう後には戻れないよ。――それでも、行くんだよね?', background: 'frostpeak_lab', portrait: 'determined' },
    { speaker: '', text: '蒼氷の山嶺を越え、二人は瘴気の遺跡へと向かった。', background: 'ruins' },
  ],
};

// --- 地方4: 瘴気の遺跡 -----------------------------------------------------

const RUINS_INTRO: StoryScript = {
  id: 'ruins_intro',
  lines: [
    { speaker: '', text: '遺跡に近づくほど、空気は重く、赤黒い瘴気が地を這うように漂っていた。', background: 'ruins' },
    { speaker: 'ルリ', text: '……うっ、濃い。ここの瘴気、今までとは比べ物にならないよ。', background: 'ruins', portrait: 'worried' },
    { speaker: 'ルリ', text: '軍団長は平気? アタシ、ちょっとだけ……頭の奥がぼんやりする。', background: 'ruins', portrait: 'worried' },
    { speaker: '', text: '遺跡の最深部に、教授がいる。その確信だけを頼りに、二人は瘴気の底へと踏み込んでいく。', background: 'ruins' },
    { speaker: 'ルリ', text: '――大丈夫。ここまで来たんだから、最後まで付き合うよ。', background: 'ruins', portrait: 'determined' },
  ],
};

/** The dramatic high point of the whole campaign: heavy miasma briefly
 *  robs Ruri of speech (the first time since the forest), and the
 *  Professor's identity/ideology are laid out directly, setting up the
 *  "bond, not tolerance" answer the ending pays off. */
const RUINS_OUTRO: StoryScript = {
  id: 'ruins_outro',
  lines: [
    { speaker: '', text: '遺跡の最奥――赤黒い瘴気が渦を巻く部屋の中心に、一つの影があった。', background: 'ruins_miasma' },
    { speaker: '???', text: '……また一人、辿り着いたか。この深さまで来たのは、お前たちで何人目だろうな。', background: 'ruins_miasma' },
    { speaker: 'ルリ', text: 'あなたが……教授?', background: 'ruins_miasma', portrait: 'worried' },
    { speaker: '教授', text: 'さて、何と答えればいいのか。だが、お前たちがここまで追ってきた"答え"には違いない。', background: 'ruins_miasma' },
    { speaker: '教授', text: '動物と人間の共生――そんなものは幻想だ。本当の共生とは、因子による完全な管理のことを言う。', background: 'ruins_miasma' },
    { speaker: 'ルリ', text: '管理……? それはただの支配じゃない! あなたがやってるのは、ただ獣たちを狂わせてるだけだ!', background: 'ruins_miasma', portrait: 'determined' },
    { speaker: '教授', text: '狂わせている、のではない。"解放"しているのだよ。理性という鎖から。', background: 'ruins_miasma' },
    { speaker: '', text: 'その言葉と同時に、部屋いっぱいの瘴気が渦を巻き、ルリに向かって押し寄せた。', background: 'ruins_miasma', cue: 'flashRed' },
    { speaker: '', text: 'ルリ――!', background: 'ruins_miasma', cue: 'shake' },
    { speaker: 'ルリ', text: '……っ、ぁ……。', background: 'ruins_miasma', cue: 'shake', portrait: 'blank' },
    { speaker: '', text: 'ルリの瞳から色が消え、言葉を失ったように、ただ羽をこわばらせて震えている。', background: 'ruins_miasma' },
    { speaker: '教授', text: 'ほう。……お前だけは因子をその身に受けても狂わなかった個体か。興味深い。何がお前を抑えている?', background: 'ruins_miasma' },
    { speaker: '', text: '軍団長は答えの代わりに、ルリを守るようにそっと手を伸ばした。', background: 'ruins_miasma' },
    { speaker: '', text: '――しばらくして、ルリの瞳に少しずつ光が戻る。', background: 'ruins_miasma' },
    { speaker: 'ルリ', text: '……あ、れ? 軍団長……? ごめん、ちょっと、意識が遠くに行ってた、かも。', background: 'ruins_miasma', portrait: 'worried' },
    { speaker: '教授', text: '……戻ったか。……面白い。だが、それがいつまで持つか見ものだな。', background: 'ruins_miasma' },
    { speaker: '', text: '教授はそれ以上語らず、瘴気の奥へと姿を消した。残されたのは、重い沈黙だけ。', background: 'ruins_miasma' },
    { speaker: 'ルリ', text: '……軍団長。アタシ、大丈夫だから。むしろ――あいつの言ってること、絶対に認めない。', background: 'ruins_miasma', portrait: 'determined' },
    { speaker: '', text: '瘴気の遺跡を越え、二人は教授が因子をばら撒いたという黄昏の都へと急ぐ。', background: 'twilight_city' },
  ],
};

// --- 地方5: 黄昏の都 -------------------------------------------------------

const TWILIGHT_INTRO: StoryScript = {
  id: 'twilight_intro',
  lines: [
    { speaker: '', text: '黄昏に染まる都――至るところで獣が暴れ、人々が逃げ惑っていた。', background: 'twilight_city' },
    { speaker: 'ルリ', text: 'ひどい……。教授はもう、ここにまで因子をばら撒いたんだ。', background: 'twilight_city', portrait: 'worried' },
    { speaker: '', text: '都の中心にそびえる塔から、赤黒い瘴気が絶えず吹き上がっている。', background: 'twilight_tower' },
    { speaker: 'ルリ', text: 'あの塔……教授はきっとあそこにいる。要人を人質にして、都を支配するつもりなのかもしれない。', background: 'twilight_tower' },
    { speaker: 'ルリ', text: '軍団長、ここの獣たちを一匹でも減らせば、逃げられる人が増える。まずは、できることから。', background: 'twilight_city', portrait: 'determined' },
    { speaker: '', text: '二人は混乱の都を駆け、塔へと続く道を切り開いていく。', background: 'twilight_city' },
  ],
};

const TWILIGHT_OUTRO: StoryScript = {
  id: 'twilight_outro',
  lines: [
    { speaker: '', text: '都を覆っていた瘴気が、ようやく晴れ始めた。塔の入り口まで、もう道を阻むものはない。', background: 'twilight_tower' },
    { speaker: 'ルリ', text: 'ここまで来た……。塔のてっぺんに、教授がいる。', background: 'twilight_tower', portrait: 'determined' },
    { speaker: 'ルリ', text: '軍団長。――ここからは、もう引けないよ。最後まで、ちゃんと見届けよう。', background: 'twilight_tower' },
    { speaker: '', text: '「狂化の塔」。因子の全てが生まれたその場所へ、二人は足を踏み入れる。', background: 'tower_summit' },
  ],
};

// --- 最終決戦 --------------------------------------------------------------

const FINAL_INTRO: StoryScript = {
  id: 'final_intro',
  lines: [
    { speaker: '', text: '塔の最奥。赤黒い瘴気が渦巻く広間の中央に、教授が立っていた。', background: 'tower_summit' },
    { speaker: '教授', text: 'ここまで来たか。――だが、私自身が戦う必要などない。', background: 'tower_summit' },
    { speaker: '教授', text: '因子で満たした獣たちを、好きなだけ解放できるのだからな。', background: 'tower_summit' },
    { speaker: '', text: '教授が手を掲げると、周囲の瘴気から次々と狂獣たちの気配が立ち上がる。', background: 'tower_summit', cue: 'flashRed' },
    { speaker: 'ルリ', text: '来るよ、軍団長……! 何匹来ても、ここで止める!', background: 'tower_summit', portrait: 'determined' },
    { speaker: '教授', text: '無駄な抵抗だ。……いや、好きにするといい。せめて、見るに値する最後であることを期待しよう。', background: 'tower_summit' },
  ],
};

// --- エンディング -----------------------------------------------------------

const ENDING: StoryScript = {
  id: 'ending',
  lines: [
    { speaker: '', text: '最後の咆哮が消え、塔の中は静寂に包まれた。', background: 'collapse' },
    { speaker: '', text: '教授の姿は、崩れ落ちる瘴気の奥へと消えていった。生きているのか、それとも――誰にも分からない。', background: 'collapse' },
    { speaker: 'ルリ', text: '……終わった、のかな。', background: 'collapse', portrait: 'worried' },
    { speaker: '', text: '施設はゆっくりと崩れ始めている。けれど、因子はすでに世界中の野生動物にばら撒かれてしまった後だった。', background: 'collapse' },
    { speaker: 'ルリ', text: 'ねえ軍団長。アタシ、ずっと考えてたことがあるんだ。', background: 'collapse' },
    { speaker: 'ルリ', text: 'なんで自分だけ、因子を浴びても狂わなかったのか。……耐性があったとか、そういうことじゃない気がする。', background: 'collapse' },
    { speaker: 'ルリ', text: 'きっと、軍団長と一緒にいたから。――絆があれば、因子にだって抗えるんだよ。', background: 'dawn', portrait: 'determined' },
    { speaker: 'ルリ', text: '教授は「因子による管理こそ真の共生だ」って言ってたけど……違う。本当の答えは、ずっとシンプルだったんだ。', background: 'dawn' },
    { speaker: '', text: 'ルリは今も変わらず、人の言葉で笑っている。', background: 'dawn' },
    { speaker: 'ルリ', text: 'でも、まだ世界中に狂暴化した獣が残ってる。……私たちの旅は、終わらないね。', background: 'dawn' },
    { speaker: 'ルリ', text: 'だったら、行こう。一匹残らず、ちゃんと向き合って。――今度はアタシたちのやり方で。', background: 'dawn', portrait: 'determined' },
    { speaker: '', text: '軍団長とルリの旅は、新しい形でまだ続いていく。', background: 'dawn' },
  ],
};

// --- エクストラ: 各地方の一言導入 -------------------------------------------
// 新規の長尺ストーリーは不要 - 後日談への軽い導入のみ。

const EXTRA_INTROS: StoryScript[] = [
  {
    id: 'extra_forest',
    lines: [
      { speaker: '', text: '迷いの森にはまだ、因子を浴びて狂暴化したままの獣が残っている。', background: 'forest_mist' },
      { speaker: 'ルリ', text: 'この森で一番手強いのは……噂の大鹿だよね。軍団長、仕上げに行こっか。', background: 'forest_mist', portrait: 'determined' },
    ],
  },
  {
    id: 'extra_wasteland',
    lines: [
      { speaker: '', text: '荒野にも、因子に取り憑かれた獣たちの縄張りが残っていた。', background: 'wasteland' },
      { speaker: 'ルリ', text: '女王蠍、だっけ。あの荒野で一番恐れられてる狂獣。片付けよう。', background: 'wasteland', portrait: 'determined' },
    ],
  },
  {
    id: 'extra_frostpeak',
    lines: [
      { speaker: '', text: '蒼氷の山嶺、かつての研究院跡にも狂獣の気配が残っている。', background: 'frostpeak' },
      { speaker: 'ルリ', text: '山の王だったっていう白い虎……まだ目覚めてるみたいだね。', background: 'frostpeak', portrait: 'determined' },
    ],
  },
  {
    id: 'extra_ruins',
    lines: [
      { speaker: '', text: '瘴気の遺跡には、今も教授が育てた古い因子の残滓が渦巻いている。', background: 'ruins' },
      { speaker: 'ルリ', text: 'あの竜、骨だけなのにやけに生き生きしてるよね……行くよ、軍団長。', background: 'ruins', portrait: 'determined' },
    ],
  },
  {
    id: 'extra_twilight',
    lines: [
      { speaker: '', text: '黄昏の都にも、暴れたまま取り残された狂獣がいる。', background: 'twilight_city' },
      { speaker: 'ルリ', text: '都を走り回ってた大狼、まだ誰も止められてないんだって。私たちで決着をつけよう。', background: 'twilight_city', portrait: 'determined' },
    ],
  },
];

const REGION_INTRO_SCRIPTS: StoryScript[] = [FOREST_INTRO, WASTELAND_INTRO, FROSTPEAK_INTRO, RUINS_INTRO, TWILIGHT_INTRO];
const REGION_OUTRO_SCRIPTS: StoryScript[] = [FOREST_OUTRO, WASTELAND_OUTRO, FROSTPEAK_OUTRO, RUINS_OUTRO, TWILIGHT_OUTRO];

export function getRegionIntroScript(regionIndex: number): StoryScript {
  return REGION_INTRO_SCRIPTS[regionIndex];
}

export function getRegionOutroScript(regionIndex: number): StoryScript {
  return REGION_OUTRO_SCRIPTS[regionIndex];
}

export function getExtraIntroScript(regionIndex: number): StoryScript {
  return EXTRA_INTROS[regionIndex];
}

export function getFinalIntroScript(): StoryScript {
  return FINAL_INTRO;
}

export function getEndingScript(): StoryScript {
  return ENDING;
}
