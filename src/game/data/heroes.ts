import { emptyGear, type HeroClass, type HeroData, type Rarity } from '../types';
import { isHeroReleased } from './heroRelease';
import { MAX_SKILL_SLOTS } from './skills';
import { localized, tr } from '../i18n';

/** A roster slot: one fixed character with its own portrait, name and class.
 *  Gacha pulls and starter heroes are always instances of one of these. */
export interface HeroDefinition {
  id: string;
  name: string;
  heroClass: HeroClass;
  rarity: Rarity;
}

/** The names, in Japanese: the title and the given name together ("算盤王ガウス"). Read ALL_HEROES, not this: its `name` is looked up each time. */
const HERO_ROWS: HeroDefinition[] = [
  { id: 'gauss', name: '算盤王ガウス', heroClass: 'tank', rarity: 5 },
  { id: 'aria', name: '虚数姫アリア', heroClass: 'healer', rarity: 5 },
  { id: 'zeno', name: '無限桁のゼノ', heroClass: 'mage', rarity: 5 },
  { id: 'ren', name: '黒刃のレン', heroClass: 'warrior', rarity: 4 },
  { id: 'suzuna', name: '百矢のスズナ', heroClass: 'archer', rarity: 4 },
  { id: 'baron', name: '守壁のバロン', heroClass: 'tank', rarity: 4 },
  { id: 'kai', name: '業火のカイ', heroClass: 'mage', rarity: 3 },
  { id: 'mina', name: '疾風のミナ', heroClass: 'archer', rarity: 3 },
  { id: 'noa', name: '癒しのノア', heroClass: 'healer', rarity: 3 },
  { id: 'rei', name: '無冠のレイ', heroClass: 'warrior', rarity: 2 },
  { id: 'yuno', name: '夜事のユノ', heroClass: 'healer', rarity: 2 },
  { id: 'touma', name: '見習いのトウマ', heroClass: 'warrior', rarity: 1 },

  // Illustrated batch 1 ("強そう" — strong-looking), ★4-5.
  { id: 'sylva', name: '緑陣のシルヴァ', heroClass: 'warrior', rarity: 4 },
  { id: 'nova', name: '閃光のノヴァ', heroClass: 'archer', rarity: 4 },
  { id: 'kohaku', name: '疾爪のコハク', heroClass: 'warrior', rarity: 4 },
  { id: 'dias', name: '魔剣のディアス', heroClass: 'warrior', rarity: 4 },
  { id: 'astra', name: '星導のアストラ', heroClass: 'mage', rarity: 5 },
  { id: 'viara', name: '蠱毒の女王ヴィアラ', heroClass: 'mage', rarity: 5 },
  { id: 'ignis', name: '溶岩のイグニス', heroClass: 'tank', rarity: 4 },
  { id: 'shade', name: '冥灯のシェイド', heroClass: 'mage', rarity: 5 },
  { id: 'seira', name: '氷波のセイラ', heroClass: 'archer', rarity: 4 },

  // Illustrated batch 2 ("普通そう" — normal-looking), ★1-3.
  { id: 'mizuki', name: '新兵のミズキ', heroClass: 'warrior', rarity: 1 },
  { id: 'ald', name: '新米剣士アルド', heroClass: 'warrior', rarity: 1 },
  { id: 'pino', name: '歯車のピノ', heroClass: 'warrior', rarity: 1 },
  { id: 'garnet', name: '赤髪のガーネット', heroClass: 'warrior', rarity: 1 },
  { id: 'zayd', name: '双刃のザイド', heroClass: 'warrior', rarity: 1 },
  { id: 'ember', name: '火書のエンバー', heroClass: 'mage', rarity: 1 },
  { id: 'momo', name: '森番のモモ', heroClass: 'warrior', rarity: 2 },
  { id: 'lumi', name: '陽光のルミ', heroClass: 'healer', rarity: 2 },
  { id: 'fione', name: '氷刃のフィオネ', heroClass: 'warrior', rarity: 2 },
  { id: 'enju', name: '炎拳のエンジュ', heroClass: 'warrior', rarity: 2 },
  { id: 'fern', name: '森弓のフェルン', heroClass: 'archer', rarity: 2 },
  { id: 'kuroto', name: '影鎖のクロト', heroClass: 'warrior', rarity: 2 },
  { id: 'marin', name: '海賊のマリン', heroClass: 'archer', rarity: 2 },
  { id: 'celes', name: '聖琴のセレス', heroClass: 'healer', rarity: 3 },
  { id: 'toxar', name: '毒蛇のトクサル', heroClass: 'mage', rarity: 3 },
  { id: 'nyx', name: '夜魔のニクス', heroClass: 'mage', rarity: 3 },
  { id: 'morrigan', name: '狙撃のモリガン', heroClass: 'archer', rarity: 3 },

  // Illustrated batch 3 ("普通そう" — normal-looking, second drop), ★1-3.
  { id: 'brisa', name: '原野のブリサ', heroClass: 'warrior', rarity: 1 },
  { id: 'finn', name: '調合のフィン', heroClass: 'mage', rarity: 1 },
  { id: 'rin', name: '拳闘のリン', heroClass: 'warrior', rarity: 1 },
  { id: 'volt', name: '電撃のヴォルト', heroClass: 'warrior', rarity: 2 },
  { id: 'karna', name: '双撃のカルナ', heroClass: 'warrior', rarity: 2 },
  { id: 'mei', name: '双刃舞のメイ', heroClass: 'warrior', rarity: 2 },
  { id: 'raiga', name: '疾風のライガ', heroClass: 'warrior', rarity: 2 },
  { id: 'tia', name: '旋槍のティア', heroClass: 'warrior', rarity: 2 },
  { id: 'joker', name: '賭数のジョーカー', heroClass: 'mage', rarity: 2 },
  { id: 'elrin', name: '聖盾のエルリン', heroClass: 'tank', rarity: 3 },
  { id: 'fros', name: '氷晶のフロス', heroClass: 'mage', rarity: 3 },
  { id: 'noct', name: '星暦のノクト', heroClass: 'mage', rarity: 3 },

  // Illustrated batch 4 (2026-11): ★3 x20, ★4 x10 and the one ★6, who only comes out of the 特設ガチャ.
  { id: 'aion', name: '無限帝アイオーン', heroClass: 'mage', rarity: 6 },

  { id: 'kurenai', name: '紅蓮のクレナイ', heroClass: 'warrior', rarity: 4 },
  { id: 'sieg', name: '聖剣のジーク', heroClass: 'warrior', rarity: 4 },
  { id: 'thorne', name: '竜騎のソーン', heroClass: 'warrior', rarity: 4 },
  { id: 'gale', name: '蒼穹のゲイル', heroClass: 'archer', rarity: 4 },
  { id: 'ivy', name: '棘薔薇のアイヴィ', heroClass: 'archer', rarity: 4 },
  { id: 'lilith', name: '夜帳のリリス', heroClass: 'mage', rarity: 4 },
  { id: 'quartz', name: '水晶のクォーツ', heroClass: 'mage', rarity: 4 },
  { id: 'brann', name: '鉄壁のブラン', heroClass: 'tank', rarity: 4 },
  { id: 'raijin', name: '雷槌のライジン', heroClass: 'tank', rarity: 4 },
  { id: 'ouka', name: '桜花のオウカ', heroClass: 'healer', rarity: 4 },

  { id: 'haruka', name: '旅団のハルカ', heroClass: 'warrior', rarity: 3 },
  { id: 'jin', name: '傭兵のジン', heroClass: 'warrior', rarity: 3 },
  { id: 'sora', name: '空賊のソラ', heroClass: 'warrior', rarity: 3 },
  { id: 'gen', name: '武僧のゲン', heroClass: 'warrior', rarity: 3 },
  { id: 'rosa', name: '薔薇剣のローザ', heroClass: 'warrior', rarity: 3 },
  { id: 'taiga', name: '狼牙のタイガ', heroClass: 'warrior', rarity: 3 },
  { id: 'miru', name: '星読みのミル', heroClass: 'mage', rarity: 3 },
  { id: 'orga', name: '錬金のオルガ', heroClass: 'mage', rarity: 3 },
  { id: 'lune', name: '月影のルーネ', heroClass: 'mage', rarity: 3 },
  { id: 'felix', name: '召喚士のフェリクス', heroClass: 'mage', rarity: 3 },
  { id: 'tsubame', name: '燕のツバメ', heroClass: 'archer', rarity: 3 },
  { id: 'robin', name: '森賊のロビン', heroClass: 'archer', rarity: 3 },
  { id: 'ines', name: '砂漠のイネス', heroClass: 'archer', rarity: 3 },
  { id: 'kaede', name: '紅葉のカエデ', heroClass: 'archer', rarity: 3 },
  { id: 'gustav', name: '守衛のグスタフ', heroClass: 'tank', rarity: 3 },
  { id: 'bruno', name: '鍛冶のブルーノ', heroClass: 'tank', rarity: 3 },
  { id: 'doris', name: '修道盾のドリス', heroClass: 'tank', rarity: 3 },
  { id: 'lena', name: '薬草のレナ', heroClass: 'healer', rarity: 3 },
  { id: 'noel', name: '聖歌のノエル', heroClass: 'healer', rarity: 3 },
  { id: 'mimi', name: '獣医のミミ', heroClass: 'healer', rarity: 3 },

  // Illustrated batch 5 (2026-11): 80 more characters, doubling the roster (tools/art/newCharacters.mjs has the prompts of the pictures).

  // ★5 x6
  { id: 'phi', name: '黄金比の剣聖ファイ', heroClass: 'warrior', rarity: 5 },
  { id: 'tau', name: '円環の覇者タウ', heroClass: 'warrior', rarity: 5 },
  { id: 'prime', name: '孤高のプライム', heroClass: 'archer', rarity: 5 },
  { id: 'sigma', name: '総和の女帝シグマ', heroClass: 'tank', rarity: 5 },
  { id: 'delta', name: '裂界のデルタ', heroClass: 'archer', rarity: 5 },
  { id: 'serafina', name: '癒光の大司教セラフィナ', heroClass: 'healer', rarity: 5 },

  // ★4 x19
  { id: 'musashi', name: '二天のムサシ', heroClass: 'warrior', rarity: 4 },
  { id: 'hild', name: '戦乙女のヒルド', heroClass: 'warrior', rarity: 4 },
  { id: 'shaolan', name: '蒼龍のシャオラン', heroClass: 'warrior', rarity: 4 },
  { id: 'iris', name: '虹彩のイリス', heroClass: 'mage', rarity: 4 },
  { id: 'chrono', name: '時計塔のクロノ', heroClass: 'mage', rarity: 4 },
  { id: 'terra', name: '岩峰のテッラ', heroClass: 'mage', rarity: 4 },
  { id: 'somu', name: '夢喰いのソム', heroClass: 'mage', rarity: 4 },
  { id: 'nerei', name: '海渦のネレイ', heroClass: 'mage', rarity: 4 },
  { id: 'hawk', name: '鷹匠のホーク', heroClass: 'archer', rarity: 4 },
  { id: 'kreis', name: '重弩のクライス', heroClass: 'archer', rarity: 4 },
  { id: 'fiora', name: '妖精弓のフィオラ', heroClass: 'archer', rarity: 4 },
  { id: 'gran', name: '岩腕のグラン', heroClass: 'tank', rarity: 4 },
  { id: 'torta', name: '亀甲のトルタ', heroClass: 'tank', rarity: 4 },
  { id: 'magna', name: '鉄鬼のマグナ', heroClass: 'tank', rarity: 4 },
  { id: 'fleur', name: '花守のフルール', heroClass: 'healer', rarity: 4 },
  { id: 'shiro', name: '白狐のシロ', heroClass: 'healer', rarity: 4 },
  { id: 'rain', name: '恵雨のレイン', heroClass: 'healer', rarity: 4 },
  { id: 'weiss', name: '鴉面のヴァイス', heroClass: 'healer', rarity: 4 },
  { id: 'anju', name: '天使のアンジュ', heroClass: 'healer', rarity: 4 },

  // ★3 x30
  { id: 'dante', name: '賞金稼ぎのダンテ', heroClass: 'warrior', rarity: 3 },
  { id: 'hinata', name: '道場娘のヒナタ', heroClass: 'warrior', rarity: 3 },
  { id: 'ulf', name: '北海のウルフ', heroClass: 'warrior', rarity: 3 },
  { id: 'cecil', name: '落ち騎士のセシル', heroClass: 'warrior', rarity: 3 },
  { id: 'leona', name: '闘技場のレオナ', heroClass: 'warrior', rarity: 3 },
  { id: 'toro', name: '紅布のトーロ', heroClass: 'warrior', rarity: 3 },
  { id: 'skadi', name: '氷原のスカディ', heroClass: 'warrior', rarity: 3 },
  { id: 'bao', name: '酔拳のバオ', heroClass: 'warrior', rarity: 3 },
  { id: 'mike', name: '見習い魔女のミケ', heroClass: 'mage', rarity: 3 },
  { id: 'faust', name: '書庫のファウスト', heroClass: 'mage', rarity: 3 },
  { id: 'kon', name: '狐火のコン', heroClass: 'mage', rarity: 3 },
  { id: 'rook', name: '猟犬のルーク', heroClass: 'archer', rarity: 3 },
  { id: 'annie', name: '早撃ちのアニー', heroClass: 'archer', rarity: 3 },
  { id: 'hibari', name: '雲雀のヒバリ', heroClass: 'archer', rarity: 3 },
  { id: 'tengri', name: '草原のテンゲル', heroClass: 'archer', rarity: 3 },
  { id: 'isana', name: '銛打ちのイサナ', heroClass: 'archer', rarity: 3 },
  { id: 'cyril', name: '郵便屋のシリル', heroClass: 'archer', rarity: 3 },
  { id: 'moss', name: '苔石のモス', heroClass: 'tank', rarity: 3 },
  { id: 'grete', name: '鍋蓋のグレーテ', heroClass: 'tank', rarity: 3 },
  { id: 'ivan', name: '雪国のイワン', heroClass: 'tank', rarity: 3 },
  { id: 'teo', name: '従騎士のテオ', heroClass: 'tank', rarity: 3 },
  { id: 'amara', name: '砂漠盾のアマラ', heroClass: 'tank', rarity: 3 },
  { id: 'rhino', name: '突角のライノ', heroClass: 'tank', rarity: 3 },
  { id: 'ravi', name: '寺院のラヴィ', heroClass: 'tank', rarity: 3 },
  { id: 'pia', name: '野戦看護のピア', heroClass: 'healer', rarity: 3 },
  { id: 'hugo', name: '薬酒のユーゴ', heroClass: 'healer', rarity: 3 },
  { id: 'lotta', name: '流しのロッタ', heroClass: 'healer', rarity: 3 },
  { id: 'sachi', name: '湯治のサチ', heroClass: 'healer', rarity: 3 },
  { id: 'owen', name: '森医者のオーウェン', heroClass: 'healer', rarity: 3 },
  { id: 'tsumugi', name: '針仕事のツムギ', heroClass: 'healer', rarity: 3 },

  // ★2 x15
  { id: 'cain', name: '剣闘見習いのケイン', heroClass: 'warrior', rarity: 2 },
  { id: 'nene', name: '棒術のネネ', heroClass: 'warrior', rarity: 2 },
  { id: 'tobi', name: '魔法学生のトビ', heroClass: 'mage', rarity: 2 },
  { id: 'nel', name: '雪だるまのネル', heroClass: 'mage', rarity: 2 },
  { id: 'sparky', name: '発明家のスパーク', heroClass: 'mage', rarity: 2 },
  { id: 'mugi', name: '麦畑のムギ', heroClass: 'archer', rarity: 2 },
  { id: 'kei', name: '少年狩人のケイ', heroClass: 'archer', rarity: 2 },
  { id: 'lily', name: '羊飼いのリリー', heroClass: 'archer', rarity: 2 },
  { id: 'dote', name: '門番のドテ', heroClass: 'tank', rarity: 2 },
  { id: 'kuma', name: '熊頭巾のクマ', heroClass: 'tank', rarity: 2 },
  { id: 'hank', name: '木こりのハンク', heroClass: 'tank', rarity: 2 },
  { id: 'bell', name: '鐘つきのベル', heroClass: 'tank', rarity: 2 },
  { id: 'hana', name: '花売りのハナ', heroClass: 'healer', rarity: 2 },
  { id: 'miel', name: '蜂蜜のミエル', heroClass: 'healer', rarity: 2 },
  { id: 'tomo', name: '小司祭のトモ', heroClass: 'healer', rarity: 2 },

  // ★1 x10
  { id: 'nuts', name: '投石のナッツ', heroClass: 'archer', rarity: 1 },
  { id: 'rie', name: '森の少女リエ', heroClass: 'archer', rarity: 1 },
  { id: 'taka', name: '見習い猟師のタカ', heroClass: 'archer', rarity: 1 },
  { id: 'don', name: '木盾のドン', heroClass: 'tank', rarity: 1 },
  { id: 'rock', name: '石頭のロック', heroClass: 'tank', rarity: 1 },
  { id: 'pam', name: '見習い門番のパム', heroClass: 'tank', rarity: 1 },
  { id: 'yomo', name: '薬草摘みのヨモ', heroClass: 'healer', rarity: 1 },
  { id: 'mio', name: '見習い僧のミオ', heroClass: 'healer', rarity: 1 },
  { id: 'tiko', name: '見習い魔法使いのティコ', heroClass: 'mage', rarity: 1 },
  { id: 'ryo', name: '木刀のリョウ', heroClass: 'warrior', rarity: 1 },
  // Made ahead of time (2026-11, tools/art/newCharacters2.mjs): ★6 x10 and ★5 x20, released two at a time (data/heroRelease.ts).
  { id: 'omega', name: '終焉の覇王オメガ', heroClass: 'warrior', rarity: 6 },
  { id: 'alpha', name: '始源の剣姫アルファ', heroClass: 'warrior', rarity: 6 },
  { id: 'zero', name: '虚空の守護者ゼロ', heroClass: 'tank', rarity: 6 },
  { id: 'godel', name: '不完全の騎士ゲーデル', heroClass: 'tank', rarity: 6 },
  { id: 'euler', name: '螺旋の賢帝オイラー', heroClass: 'mage', rarity: 6 },
  { id: 'riemann', name: '零点の魔女リーマン', heroClass: 'mage', rarity: 6 },
  { id: 'cantor', name: '階梯のカントル', heroClass: 'archer', rarity: 6 },
  { id: 'fermat', name: '余白の狩人フェルマー', heroClass: 'archer', rarity: 6 },
  { id: 'pi', name: '円環の歌姫パイ', heroClass: 'healer', rarity: 6 },
  { id: 'noether', name: '対称の聖女ネーター', heroClass: 'healer', rarity: 6 },
  { id: 'lambda', name: '疾駆のラムダ', heroClass: 'warrior', rarity: 5 },
  { id: 'kappa', name: '剛断のカッパ', heroClass: 'warrior', rarity: 5 },
  { id: 'theta', name: '角度の剣士シータ', heroClass: 'warrior', rarity: 5 },
  { id: 'xi', name: '影走りのクシー', heroClass: 'warrior', rarity: 5 },
  { id: 'rho', name: '紅蓮の槍騎士ロー', heroClass: 'warrior', rarity: 5 },
  { id: 'psi', name: '精神の魔導師プサイ', heroClass: 'mage', rarity: 5 },
  { id: 'eta', name: '蒼穹の術者エータ', heroClass: 'mage', rarity: 5 },
  { id: 'nu', name: '流星弓のニュー', heroClass: 'archer', rarity: 5 },
  { id: 'mu', name: '微細のミュー', heroClass: 'archer', rarity: 5 },
  { id: 'chi', name: '交差射のカイ', heroClass: 'archer', rarity: 5 },
  { id: 'iota', name: '一矢のイオタ', heroClass: 'archer', rarity: 5 },
  { id: 'omicron', name: '小円の盾オミクロン', heroClass: 'tank', rarity: 5 },
  { id: 'upsilon', name: '大地の壁ウプシロン', heroClass: 'tank', rarity: 5 },
  { id: 'beta', name: '堅守のベータ', heroClass: 'tank', rarity: 5 },
  { id: 'gamma', name: '烈光の城壁ガンマ', heroClass: 'tank', rarity: 5 },
  { id: 'epsilon', name: '微光のイプシロン', heroClass: 'healer', rarity: 5 },
  { id: 'oasis', name: '泉の巫女オアシス', heroClass: 'healer', rarity: 5 },
  { id: 'aurum', name: '黄金の治癒師アウルム', heroClass: 'healer', rarity: 5 },
  { id: 'lumen', name: '灯火の看護師ルーメン', heroClass: 'healer', rarity: 5 },
  { id: 'pax', name: '平和の使徒パックス', heroClass: 'healer', rarity: 5 },
];

/** Every character in the game, released or not: the 30 made ahead of time (the last block) come out two at a time (data/heroRelease.ts).
 *  `name` is read through tr() each time ("Gauss, the Abacus King": i18n/data/heroesEn.ts); use `heroShortOf` where a card is narrow. */
export const ALL_HEROES: HeroDefinition[] = HERO_ROWS.map((row) => localized('hero', row.id, row, ['name']));

/** A character's name as the data holds it, in Japanese whatever the language is now (for the text that is built from names at load time). */
export function heroNameJa(heroId: string): string | undefined {
  return HERO_ROWS.find((h) => h.id === heroId)?.name;
}

/** A character's name in the current language. `hero.name` of a copy the player owns is the Japanese the save was made with (a save keeps
 *  what it was given), so a screen reads the name through here, by the character's id. */
export function heroNameOf(hero: { heroId: string; name: string }): string {
  return tr('hero', hero.heroId, 'name', hero.name);
}

/** The short form for a narrow place (a roster card, a grid cell, a list row): the given name alone in English ("Gauss"); in Japanese the
 *  whole name, as before (it is short already). */
export function heroShortOf(hero: { heroId: string; name: string }): string {
  return tr('hero', hero.heroId, 'short', heroNameOf(hero));
}

/** The same for a character's definition (`def.name` is already in the current language). */
export function defShort(def: HeroDefinition): string {
  return heroShortOf({ heroId: def.id, name: def.name });
}

/**
 * The characters in the game right now: ALL_HEROES without the ones that are not out yet (data/heroRelease.ts). The gacha pools, the 図鑑,
 * the pictures that are loaded at start-up and so on all read this one. It is rebuilt IN PLACE by applyHeroReleases - once when this file
 * is loaded, and again by Boot with the game's clock (so a development `?date=` is honoured).
 */
export const HERO_ROSTER: HeroDefinition[] = [];

/** Puts into HERO_ROSTER the characters that are out at `now`. Returns how many there are. */
export function applyHeroReleases(now = Date.now()): number {
  HERO_ROSTER.splice(0, HERO_ROSTER.length, ...ALL_HEROES.filter((h) => isHeroReleased(h.id, now)));
  return HERO_ROSTER.length;
}
applyHeroReleases();

/** Any character, out or not (a save may hold one whose day has not come on this device's clock). */
export function getHeroDefinition(heroId: string): HeroDefinition | undefined {
  return ALL_HEROES.find((h) => h.id === heroId);
}

export function getHeroesByRarity(rarity: Rarity): HeroDefinition[] {
  return HERO_ROSTER.filter((h) => h.rarity === rarity);
}

/** Deterministic 32-bit hash so every copy of a roster hero always draws the
 *  same procedural fallback portrait (used as the legacy `seed` field),
 *  instead of a new random one on every gacha pull. */
export function heroSeedFromId(heroId: string): number {
  let hash = 0;
  for (let i = 0; i < heroId.length; i++) {
    hash = (Math.imul(hash, 31) + heroId.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function createHeroInstance(heroId: string, instanceId: string, level = 1, exp = 0): HeroData {
  const def = getHeroDefinition(heroId);
  if (!def) throw new Error(`Unknown hero id: ${heroId}`);
  return {
    id: instanceId,
    heroId: def.id,
    seed: heroSeedFromId(def.id),
    rarity: def.rarity,
    heroClass: def.heroClass,
    name: def.name,
    level,
    exp,
    phase: 1,
    gear: emptyGear(),
    skillLevels: Array(MAX_SKILL_SLOTS).fill(1),
  };
}
