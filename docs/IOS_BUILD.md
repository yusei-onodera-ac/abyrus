# iOS 版をつくる

ゲームを、Capacitor で iOS アプリ (WKWebView) に包みます。Xcode のプロジェクトは `ios/` にあります（Windows で作ってあります）。
**ビルドと署名は Mac の Xcode が要ります。** この PC (Windows) では、プロジェクトの生成と更新まで。

状態 (2026-11): プロジェクトを作っただけ。**実機で動かしたことは一度もありません。** 下の「まだのこと」を読んでください。

## 要るもの
- Mac と Xcode（App Store の最新の安定版）。Mac がないときは、クラウドの Mac（GitHub Actions の macOS、Codemagic など）
- Apple Developer Program（年額）。実機で動かすだけなら無料の Apple ID でもできる（7日で切れる）が、TestFlight と App Store には要る
- Node.js と Git LFS（`git lfs install`、クローンしたら `git lfs pull`。絵と声の本体は LFS）

## 手順（Mac で）
1. `git clone`、`git lfs pull`、`npm ci`
2. `npm run ios:sync` — ゲームをビルドして（`dist/`）、`ios/App/App/public` にコピーする（400MB 以上。コミットしない: `ios/.gitignore` が除外済み）
3. `npm run ios:open` — Xcode が開く
4. Xcode の App ターゲット → Signing & Capabilities で、Team を選ぶ。**Bundle Identifier は仮の `app.abyrus.game`**: 本当の ID に変える
   （`capacitor.config.json` の `appId` も同じに。決めてから `npm run ios:sync` をもう一度）
5. 実機をつないで ▶︎（Run）。TestFlight は、Product → Archive → Distribute App

ゲームを直したら、2 をやり直すだけ（Xcode のプロジェクトは変わらない）。

## 入れてあるもの
- `capacitor.config.json`: アプリ名 ABYRUS、`webDir: dist`、余白なし・スクロールなし・背景 `#0a0b12`
- 画面は縦向きだけ（`ios/App/App/Info.plist`）
- メモリの備え: キャラの大きい絵は、出すときだけ読む（`src/game/characters/HeroArt.ts`）。起動直後のテクスチャは約 564MB
  （キャラの小さい絵が約 126MB、残りは背景・村・敵・UI）。全員の大きい絵を読むと約 1.4GB が上乗せになる作りだったのを、直した

## まだのこと（ストアに出す前に要る）
- **実機のメモリと動き**: 一度も測っていない。Xcode の Debug navigator（Memory）か、Safari の Web インスペクタ（Mac の Safari →
  開発 → 実機 → ABYRUS）で、ホーム → 編成 → 詳細 → ガチャ → 戦闘と進めて、最大値を見る。古い iPhone（RAM 3〜4GB）で落ちないか
- **課金**: Apple のアプリ内課金 (StoreKit) につなぐ。いまの `PaymentSystem` は偽の決済（開発ビルドは無料で渡す、本番は何も渡さない）。
  魔晶石などデジタルの品は、App Store の規約でアプリ内課金が必須
- **広告**: `AdSystem` に本物の広告 SDK をつなぐ（いまは偽）
- **アイコンと起動画面**: Capacitor の仮のまま。`ios/App/App/Assets.xcassets`（AppIcon 1024px、Splash）を差し替える
- **音**: WKWebView は、画面に触れる前の自動再生を止める。BGM・声が、最初のタップのあとに鳴るか確かめる
- **ストアの審査**: プライバシーポリシーの URL、年齢レーティング、App Privacy（収集するデータ）、プライバシーマニフェスト
  (`PrivacyInfo.xcprivacy`)、ガチャの確率の表示（済み）、アカウント削除（設定にある）。規約の【】の空欄を埋める（`data/legal.ts`）
- **通知・オフライン・ノッチの余白**: 余白は FIT（720x1280 を縦横比を保って収める）なので、細長い画面では上下に黒帯が出る。
  見た目を決めてから直す
- Bundle ID・Team・署名・バージョン番号は、あなたが決める
