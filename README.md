# ABYRUS

放置×ガチャ系RPG。無限算盤の暴走で生命の力が数値化された世界で、ゼロの子となって英雄を集め、万→億→兆と桁上がりするダメージの快感を追い求める。

## 起動方法

```bash
npm install
npm run dev       # http://localhost:5173 で起動(Vite dev server)
```

ビルド確認:

```bash
npm run build      # tsc による型チェック + vite build
npm run preview    # ビルド成果物をローカルでプレビュー
```

## 技術スタック

Vite + TypeScript + Phaser 3。キャラクターの見た目は固定ロスター(`src/game/data/heroes.ts`)ごとのイラスト素材を優先的に使い、素材が無いヒーローは `Phaser.GameObjects.Graphics` によるプロシージャル生成にフォールバックする。

## ディレクトリ構成 (`src/game/`)

```
scenes/       BootScene, HomeScene, BattleScene, GachaScene, RosterScene
systems/      BigNumber, BattleSystem, GachaSystem, ProgressionSystem, SaveSystem
characters/   CharacterGenerator(イラスト優先+4レイヤー合成フォールバック), AnimationController
data/         heroes.ts(固定ロスター12体の定義)
ui/           DamagePopup(オブジェクトプール), HeroCard, ResourceBar
types.ts      共有の型・定数(レアリティ色、職業ラベルなど)
```

キャラクターイラストを追加するには `public/assets/characters/<heroId>.png`(`heroId` は `heroes.ts` の `id`、例: `gauss.png`)を置くだけでよい。起動時に自動で読み込まれ、既存のプロシージャル生成から自動的にそのイラストへ切り替わる。まだ置かれていないヒーローはこれまで通りプロシージャル生成の見た目で表示され、ファイルが無くてもエラーにはならない。

## 実装済み機能(垂直スライス)

- **BigNumber**: mantissa × 10^exponent 表現で `Number.MAX_SAFE_INTEGER` を超える値を扱うクラス。表示は万/億/兆のような単位省略をせず、桁区切りカンマ付きの生の数字(例: `12,000,000`)のまま出す。
- **固定ロスター制のキャラクター生成**: ガチャは `heroes.ts` の12体から排出し、各ヒーローのイラスト素材(あれば)またはシード値から「オーラ→シルエット→武器→アクセサリ」の4レイヤーを `Graphics` で合成したフォールバック画像をテクスチャとしてキャッシュ。レアリティが上がるほどオーラの発光(焼き込み)とライブパーティクル(★3以上)の密度が増す。
- **バトルシステム**: 前衛3/後衛2のパーティ編成、SPDで駆動するリアルタイム行動順、放置中の自動攻撃、通常攻撃で溜まる必殺技ゲージをタップで手動発動。クリティカル時はカメラシェイク+フラッシュ+拡大ポップアップ。
- **ダメージポップアップ**: オブジェクトプール化した `Text` を再利用し、バウンドしながら浮き上がる演出。
- **ガチャシステム**: ★1〜★5(60/27/10/2.5/0.5%)の排出率テーブルを画面に明示(景品表示法の表示義務を意識)。1連/10連演出付き。排出ロジックは固定ロスターからレアリティ内抽選し、既に所持しているヒーローが出た場合はダブり分を少量のゴールドに変換(結果画面に明示)。
- **ステージ進行**: ステージごとに決定的に敵編成・報酬を生成し、クリアで次ステージを解放する簡易マップ。
- **セーブ**: `localStorage` に進行状況(所持英雄・編成・ゴールド・魔晶石・ステージ進捗)を保存/復元。

## 今後のTODO

- iOS化(Capacitor)時のApple IAP対応
- 敵/ステージのバリエーション拡充、ボス演出
- 必殺技の演出バリエーション(現状は単体大ダメージのみ)
