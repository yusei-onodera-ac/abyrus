# 本物の課金 (App Store / StoreKit 2)

iOS アプリで、円で買う品 (お得パック・魔晶石・プレミアムパス) を、Apple のアプリ内課金で買えるようにした。
**Windows で作ったので、実機・Xcode・Apple のサーバー・Functions のデプロイは、どれも一度も通していない (未確認)。** 下の「3. 確かめたこと / 未確認」を読むこと。

- 買う → Apple が支払いを受ける → 署名つき取引 (JWS) をサーバーが確かめる → 品物を渡して**セーブ**する → そのあとで、Apple に「済んだ」と伝える (finish)。
- 品物を渡す前にアプリが落ちても、Apple が取引を覚えているので、次の起動で拾って、サーバーで確かめて、渡す。
- ウェブ・開発ビルドは、今までどおり (開発は無料で渡す TEST、ウェブの本番は何も渡さない)。iOS アプリだけが、本物になる。

## 1. 仕組み

```
ショップ / プレミアム画面
  └─ PaymentSystem.getGateway().purchase()            src/game/systems/PaymentSystem.ts
       └─ StoreKitGateway.purchase()                  src/game/systems/StoreKitPayment.ts
            ├─ プラグイン purchaseProduct (autoAcknowledgePurchases:false = プラグインに finish させない)
            │      └─ StoreKit 2: 支払い → 取引 + 署名 (jwsRepresentation)
            └─ サーバー verifyPurchase { productId, signedTransaction }        functions/src/purchases.ts
                   ├─ iapVerify.ts      署名の鎖・Bundle ID・環境・商品・種類・取り消し
                   └─ purchaseClaims.ts purchases/{取引ID} を uid に結びつける (別の uid は断る)
  ← 'paid' + receipt
  └─ 画面: PurchaseDelivery.deliver()  品物 + 取引 ID を shop.paid に記録  src/game/systems/PurchaseDelivery.ts
       └─ SaveSystem.save()
            └─ receipt.finish()   3 秒待ってから、プラグイン finishTransaction
```

起動のとき (`BootScene.create` → `startStorePayments`、**待たない**。ゲームは、ストアの返事を待たずに始まる):

1. 取引の監視 (`transactionUpdated`) を始める。Ask to Buy の承認など、あとから来る取引を拾う。
2. 未完了の取引を探す (`getUnfinishedTransactions`)。あれば、サーバーで確かめて、`PurchaseDelivery` で渡して、finish する。渡したら、いつもの受け取りポップアップ (確認ボタン) を、ホームかショップで出す (`ui/PurchaseNotices.ts`)。
3. ストアの価格の文字を取る (`getProducts`)。

### 失敗のときの扱い

| 起きたこと | 画面 | 取引は | 品物は |
|---|---|---|---|
| キャンセル | 何も出さない | 無い | 渡さない |
| 承認待ち (Ask to Buy) | 「承認待ちです…」 | あとで、承認されると届く | 承認されたとき、自動で渡す + ポップアップ |
| 失敗 | 「購入できませんでした」 | 無い | 渡さない |
| サーバーに届かない (お金は取られた) | 「手続きは済みました。確認でき次第…」 | 未完了のまま | 15 秒・1 分・5 分後に、もう一度。だめなら、次の起動で |
| サーバーが断った (Bundle ID・商品など) | 「購入できませんでした」 | 未完了のまま (**捨てない**。お金が取られているので) | 渡さない。設定を直して、次の起動で |
| 返金済みの取引 | 「購入できませんでした」 | finish して忘れる | 渡さない |
| 渡す前にアプリが落ちた | — | 未完了のまま | 次の起動で、サーバーで確かめて渡す (購入回数の制限は無視: 払った人には必ず渡す) |
| 渡して保存したあと、finish の前に落ちた | — | 未完了のまま | 渡さない (セーブが取引 ID を覚えている)。finish だけする |

- **二重に渡さない**: 取引 ID を、セーブの `shop.paid` に、新しい 50 個だけ (古いものから捨てる) 覚える。同じ取引が 2 回届いても、品物は 1 回。
- **finish を 3 秒遅らせる**: セーブは、WebView の `localStorage` に書く。書いた直後にアプリを強制終了すると、システムがディスクに書く前なので、失われるかもしれない (未確認)。その間に Apple が取引を忘れると、品物が消える。3 秒待てば、その間に落ちても、取引が残って、次の起動で渡し直せる (セーブに無ければ、もう一度渡す。あれば、finish だけ)。
- **購入回数の制限** (`limit`) は、今までどおり、**支払いの前**に、画面が見る。支払ったあとは、制限を見ずに渡す (数には数える)。

## 2. プラグインの選定

**選んだもの: `@capgo/native-purchases` 8.11.0** (版を固定。`package.json` は `"8.11.0"`、`^` なし。課金の道なので、読んだ版のまま動かす)。

| 条件 | 確かめたこと (npm と、パッケージの中身: Swift・型定義・README を読んだ) |
|---|---|
| 保守されている | 最新の公開 2026-11-26。この 1 か月で、8.9.7 → 8.11.0 まで 13 回出ている |
| StoreKit 2 | iOS 15 以上。`Product.purchase()` / `Transaction.updates` / `Transaction.unfinished` を使っている (Swift を読んだ) |
| Capacitor 8 | peerDependencies は `@capacitor/core >=8.0.0`。Package.swift は `capacitor-swift-pm` `from: 8.0.0` (このアプリは `8.6.2`) |
| 消耗型・自動更新しない定期購入 | どちらも `purchaseProduct` で買える。iOS では、取引の種類を、プラグインの側では分けない (StoreKit の `Product` を、そのまま買う) |
| 署名つき取引 (JWS) を渡せる | `purchaseProduct` の結果・未完了の一覧・アップデートの全部に、`jwsRepresentation` が入る (`StoreKit` の `VerificationResult.jwsRepresentation`) |
| 未完了の一覧・完了 | `getUnfinishedTransactions()`・`finishTransaction({ transactionId })`。`configure({ autoFinishTransactions:false })` か `capacitor.config.json` で、プラグインが勝手に finish しなくなる。すでに finish 済みの取引を finish しても、成功する |
| 価格の文字 | `getProducts()` の `priceString` (その国の通貨) |
| ライセンス | MPL-2.0 (ファイル単位のコピーレフト。手を入れずに使うので、問題ない見込み。公開前に法務で確認) |

使い方: JS の包み (`import ... from '@capgo/native-purchases'`) は**使わない**。Capacitor の `registerPlugin('NativePurchases')` で、同じネイティブのプラグインに、使う 6 つの呼び出しだけを、自前の型 (`StorePlugin`) で話しかける (`systems/NativeStore.ts`)。理由: ウェブのビルドに入らない・型検査と試験を、プラグインを入れなくても通せる・偽物に差し替えやすい。npm パッケージは、`cap sync` が Swift のコードを iOS のプロジェクトに入れるために入っている。

**捨てた候補**

| 候補 | 理由 |
|---|---|
| `@revenuecat/purchases-capacitor` 15.0.0 | 第三者の課金サービス。手数料・審査・プライバシー申告が増える (選ばない決まり)。機能は十分 |
| `@adapty/capacitor` 4.3.0 | 同上 (第三者のサービス) |
| `@nosslabs/iap` 8.5.0 | 上の `@capgo/native-purchases` の上に、第三者の検証サービス (Attesto) をつなぐ層 |
| `@ottimis/capacitor-iap` 8.0.0 | StoreKit 2・JWS は出るが、**プラグインが、取引を勝手に finish する** (起動時の `Transaction.unfinished` と、`Transaction.updates` の全部)。品物を保存する前に finish されると、落ちたときに取引が消える。未完了の一覧の呼び出しも無い。ライセンスの記載なし |
| `capacitor-plugin-cdv-purchase` 13.20.0 (`cordova-plugin-purchase` の Capacitor 版) | StoreKit 2・保守されている・Capacitor 8 に合う。ただ、商品・領収書・検証器をまとめる大きな仕組み (JS が約 500KB)。起動のたびに、finish 済みの自動更新しない定期購入まで届け直すので、自前の重複の防ぎ方が、もう 1 つ要る。必要なのは、買う・渡す・finish だけなので、見送った |
| `@mpgd/capacitor-storekit` 0.7.8 | 同じ作者のゲーム基盤 (`@mpgd/*`) が前提。「購入の証拠」を出すだけで、消耗型の一覧・finish の道が、基盤の側にある |
| `capacitor-native-purchases` 0.3.2 | 0.x。未完了の取引の一覧・finish が無い (API は、購入・現在の権利・最新の取引・復元) |

自作の Swift プラグインは、作っていない (上の候補で足りた)。

## 3. 確かめたこと / 未確認

**確かめたこと** (どれも、Windows の上で。Apple にも実機にも、つながっていない)

- クライアント: `node tools/tests/run.mjs payments` (95 項目)。偽のプラグイン・偽のサーバーで、キャンセル・承認待ち・失敗・サーバーに届かない・断られた・返金済み・二重付与・未完了の回復・プレミアムパスも同じ道・起動を待たせない・価格の表示・管理画面から足された品・ゲームの円の商品の一覧とストアの表・サーバーの許可リストが食い違わないこと。わざと壊して (finish を早める・重複の確認を外す・同時の処理を外す)、落ちることも確かめた。
- サーバー: `cd functions && npm test` (23 項目)。**自作の証明書の鎖** (ルート・中間・葉。Apple 独自の拡張も付けた) で署名した取引を、Apple 公式の `SignedDataVerifier` で検証: 正しいものが通ること、書き換え・別のルート・拡張なし・鎖の長さ・期限切れ・署名なし・Bundle ID の違い・環境の違い・商品の食い違い・種類の違い・返金済み・取引 ID なし・許可リストに無い品、が断られること。本物の Apple Root CA - G3 を信じる検証器が、自作の鎖を断ること。ルート証明書のファイルの SHA-256 が、Apple の公開値と同じこと。
- サーバー + Firestore: `cd functions && npm run test:emulator` (11 項目。Java と `firebase-tools` が要る。`demo-` のプロジェクトで、エミュレーターにしかつながらない)。取引の結びつけ (新規・同じ uid の再送・別の uid・同時に 4 人)、`verifyPurchase` の呼び出し (`onCall` の関数ごと)、そして**実際の `firestore.rules`** で、`purchases` が、サインインしていてもいなくても、本人の取引でも、読めない・一覧できない・書けない・消せないこと。わざとルールを開けて (`purchases` に `allow read`)、試験が落ちることも確かめた。**ルールは、変えていない。**
- `npx tsc --noEmit` (ゲーム・`functions/`)、`npm run i18n:check`、`vite build` (`@capacitor/core` が、別の塊になって、iOS のときだけ読まれる)、`npx cap update ios` (作業用のコピーで実行して、`ios/App/CapApp-SPM/Package.swift` にプラグインが入ること、`capacitor.config.json` の設定が `ios/App/App/capacitor.config.json` に届くことを見た)。

**未確認** (Mac・実機・Apple のサーバー・デプロイが要る)

- **Xcode でのビルド**: Package.swift に入れたプラグイン (`CapgoNativePurchases`) が、Xcode で解決・ビルドできるか。プラグインの `Package.swift` は、Xcode の SDK のファイルを読んで、StoreKit の新しい機能の有無を調べる作りで、それが SPM の中で動くか。
- **StoreKit・サンドボックス・TestFlight・審査**: 実際に買えるか。Apple の本物の署名つき取引と、本物のルート証明書で通るか。OCSP (証明書の失効の問い合わせ: `IAP_ONLINE_CHECKS`) が通るか。
- **プラグインの細部** (ソースを読んだだけ): `purchaseProduct` の結果に、本当に `jwsRepresentation` が入るか / キャンセルと承認待ちが、`"User cancelled"` `"Transaction pending"` というメッセージで返るか (`StoreKitPayment.ts` は、メッセージの文字で見分けている: 違っていれば、ただの「失敗」になる) / `autoFinishTransactions:false` の設定が、取引の監視より先に読まれるか (読まれないと、プラグインが取引を finish して、JS が受け取る前に消えうる。JS 側の `configure()` は、保険) / 起動直後の取引の知らせが、JS の監視が付く前に出て、失われうる (そのために、起動のとき `getUnfinishedTransactions` でも探している)。
- **`registerPlugin('NativePurchases')` で、ネイティブのプラグインに届くか** (JS の包みを使わない作りなので)。
- **Functions のデプロイ・Blaze プラン・パラメーター (`.env`) の読み込み・OCSP の外向きの通信**。
- `localStorage` に書いた直後の強制終了で、セーブが失われるか (上の「3 秒待つ」の根拠)。
- ホーム・ショップで出す、回復の受け取りポップアップの見た目と動き (ブラウザ・実機で見ていない。型は通っている)。

## 4. サーバー (`functions/`)

callable `verifyPurchase` (`functions/src/purchases.ts`。`index.ts` が、地域の設定 (東京) のあとに作る)。

- 入力: `{ productId: ゲームの商品 ID, signedTransaction: JWS }`。サインイン必須 (`request.auth.uid`。ランキングと同じ匿名サインイン)。
- 出力: `{ ok: true, value: { productId, transactionId, environment } }` か `{ ok: false, reason, message }` (同盟の callable と同じ形)。
- 確かめること (`functions/src/iapVerify.ts`。Apple 公式の `@apple/app-store-server-library` の `SignedDataVerifier`):
  1. 署名の鎖 (葉 → 中間 → **Apple Root CA - G3**。`functions/certs/AppleRootCA-G3.cer`) と、署名そのもの。
  2. Bundle ID が、設定のもの。
  3. 環境 (Sandbox / Production) が、設定の中にある。
  4. 商品 ID が許可リスト (`functions/src/products.ts`) にあり、署名された商品 ID が、そこから決まるストアの商品 ID と同じ。
  5. 取引の種類が、許可リストの種類と同じ (魔晶石・パックは `Consumable`、プレミアムパスは `Non-Renewing Subscription`)。
  6. 取り消し (返金) されていない (`revocationDate` が無い)。
- 取引の使い回し: `purchases/{取引ID}` を、Admin SDK の transaction で作る。まだ無ければ作る。同じ uid なら成功 (何度でも)。別の uid なら `used_by_other`。クライアントからは読めも書けもしない (ルールに `purchases` の `match` が無い = 拒否。ルールは、変えていない)。
- `reason`: `not_signed_in` `not_configured` `bad_input` `not_allowed` `bad_signature` `wrong_app` `wrong_environment` `wrong_product` `wrong_type` `bad_transaction` `revoked` `used_by_other` `retry` `error`。クライアントは、`retry` `error` `not_signed_in` (と、返事が無い・通信できない) を「あとで」、`revoked` を「返金済み: finish して忘れる」、それ以外を「断られた: 取引は残す」と見る。

### 設定 (関数のパラメーター。コードに決め打ちしていない)

| 名前 | 中身 |
|---|---|
| `IAP_BUNDLE_ID` | アプリの Bundle ID (Xcode の Bundle Identifier = `capacitor.config.json` の `appId`)。仮の `app.abyrus.game` は、本当の ID に変えてから |
| `IAP_APP_APPLE_ID` | App Store Connect の「Apple ID」(アプリ情報 → 一般情報の数字)。**Production を受けるときだけ**要る |
| `IAP_ENVIRONMENT` | 受ける環境。`Sandbox` / `Production` / `Production,Sandbox` (順に試す)。大文字小文字は問わない |
| `IAP_ONLINE_CHECKS` | 証明書の失効を Apple に問い合わせるか。既定 `true` (Apple の推奨)。通信が要る。止めるなら `false` |

- 全部空のままでも、デプロイできる。その間 `verifyPurchase` は、購入を全部 `not_configured` で断る (同盟など、ほかの関数のデプロイは止めない)。
- 値は `functions/.env.<Firebase プロジェクト ID>` に書く (`functions/.env.example` が見本。`.env` 類は git に入れない)。エミュレーターは `functions/.env.local`。
- **`Xcode` / `LocalTesting` は受けない** (Apple のライブラリは、この 2 つでは署名を確かめずに通してしまうので、コードで拒否している)。
- **環境の決め方**: Sandbox の取引は、Xcode から実機で動かしたとき・**TestFlight**・**App 審査** (審査員は Sandbox で課金を試す) で出る (Apple の資料で確かめること。未確認)。Production は、App Store で配ったあとの、本物の購入だけ。だから:
  - 開発・TestFlight のサーバー: `Sandbox`。
  - 公開するサーバー: `Production,Sandbox`。`Production` だけだと、審査員の課金が失敗して、審査に落ちうる。Sandbox を受ける代わりに、TestFlight の人と審査員は、課金なしで品物を受け取れる (サンドボックスの買い物は、お金が動かないので)。気になるなら、開発用と本番用で、Firebase のプロジェクトを分ける。

### 管理画面から足された円の商品

管理画面 (`shopProducts`) から足された円の商品は、**買えない**。許可リストにも、ストアの品にも無いので (サーバーは `not_allowed` で断る)。ゲームは、ストアに無い円の商品の札を「販売外」の押せないボタンにする (`PaymentSystem.canSell`)。管理画面から円の品を売るには:

1. App Store Connect に品を作る (消耗型)。
2. `src/game/data/storeProducts.ts` と `functions/src/products.ts` に、同じ行を足す (`tools/tests/payments.ts` が、食い違いを見つける)。
3. Functions をデプロイして、アプリを新しい版にする (ストアの審査が要る)。

つまり、円の品を足すのは、管理画面だけでは済まない。魔晶石・ゴールド・アイテム (魔晶石かゴールドで買うもの) は、今までどおり、管理画面だけで足せる。

## 5. App Store Connect でやること (あなた)

### 商品

- 種類: **消耗型 (Consumable)** が 10、**自動更新しない定期購入 (Non-Renewing Subscription)** が 1 (プレミアムパス)。
- **ストアの商品 ID** は、ゲームの商品 ID のハイフンをアンダースコアに替えたもの (`storeProductId()`。ゲームとサーバーに、同じ関数)。
- **未確認**: 「商品 ID に使える文字は、英数字・アンダースコア・ピリオド」という前提で決めた。App Store Connect で商品を作るとき、`gems_160` がそのまま受け付けられるか、確かめる。受け付けられなければ、`storeProductId()` を、ゲーム側 (`src/game/data/storeProducts.ts`) とサーバー側 (`functions/src/products.ts`) の両方で直す (試験が、両方の食い違いを見つける)。商品 ID は、作ったあとに変えられない。他のアプリの商品 ID と重なってはいけない (アカウント全体で一意か、確かめる)。重なりそうなら、`abyrus_` のような接頭辞を、この関数に足す。

| ゲームの商品 ID | ストアの商品 ID | 種類 | 日本の価格 (円・税込) | 中身 |
|---|---|---|---:|---|
| `pack-starter` | `pack_starter` | 消耗型 | 480 | 初心者パック: 魔晶石 300・ゴールド 20,000・フェーズ素材 3 (1 回限り) |
| `pack-limited` | `pack_limited` | 消耗型 | 1,220 | ゴージャスパック: 魔晶石 700・ゴールド 100,000・フェーズ素材 8 (月 1 回。2026-12-31 まで) |
| `pack-weekly` | `pack_weekly` | 消耗型 | 980 | ウィークリーパック: 魔晶石 420・ゴールド 50,000・フェーズ素材 5 (週 1 回) |
| `pack-daily` | `pack_daily` | 消耗型 | 160 | デイリーお得パック: 魔晶石 60・スタミナ 30 (日 1 回) |
| `gems-50` | `gems_50` | 消耗型 | 160 | 魔晶石 50 |
| `gems-160` | `gems_160` | 消耗型 | 480 | 魔晶石 160 (おまけ 10 を含む) |
| `gems-330` | `gems_330` | 消耗型 | 980 | 魔晶石 330 (おまけ 30) |
| `gems-850` | `gems_850` | 消耗型 | 2,440 | 魔晶石 850 (おまけ 100) |
| `gems-1800` | `gems_1800` | 消耗型 | 4,900 | 魔晶石 1,800 (おまけ 250) |
| `gems-3800` | `gems_3800` | 消耗型 | 9,800 | 魔晶石 3,800 (おまけ 600) |
| `premium-pass` | `premium_pass` | 自動更新しない定期購入 | 1,500 | プレミアムパス 30 日間 (毎日 魔晶石 35、2 倍速、連戦、放置報酬の上限アップ。買うたびに、加入特典パック: 魔晶石 60・フェーズ素材 3・経験値素材(中) 5・装備強化素材 200) |

- 値段と中身の元は `src/game/data/shop.ts` と `src/game/data/premium.ts` (管理画面で変えた値は、ここには反映されない。ストアの価格は、ストア側で決まる)。
- **価格は、Apple の価格表のどれに当たるかを、App Store Connect で必ず確かめる** (私は確かめていない)。1,220 円・1,500 円・2,440 円が、価格表にあるか。無ければ、近い額にして、ゲームの表示 (`shop.ts` / `premium.ts`)・法務の文面 (`legal.ts`)・この表を、そろえる。
- 日本以外の国の価格は、ストア側の設定 (国ごとの価格の自動換算か、手で決めるか) で決める。ゲームは、ストアが返す、その国の通貨の価格の文字を出す (取れなければ、円)。
- 表示名・説明は、日本語と英語。**審査用のスクリーンショット**が、商品ごとに要る。
- 「有料 App の契約」(Paid Apps Agreement)・銀行口座・税の情報が、有効になっていないと、課金が動かないはず (未確認: 確かめる)。
- 初めての課金は、アプリの版と一緒に審査に出す。

### サンドボックスのテスター

App Store Connect → ユーザとアクセス → Sandbox → テスター で、テスト用の Apple アカウントを作る (自分の本物の Apple ID とは別。メールアドレスは、ほかの Apple ID に使われていないもの)。実機で、そのアカウントを、サンドボックスのアカウントとして入れる (設定アプリの、App Store か「開発者」の中。iOS の版で場所が違う。未確認)。お金は動かない。

## 6. Mac での試験の手順

1. `git clone` / 取り込み、`git lfs pull`、`npm ci`、`.env` に `VITE_FIREBASE_*` (ないと、本物の課金は始まらず、ショップは「準備中」のまま)。
2. `npm run ios:sync` (ゲームのビルド + `cap sync ios`。プラグインが、`ios/App/CapApp-SPM/Package.swift` に入っているので、Xcode が取りに行く)。`npm run ios:open`。
3. Xcode: Team を選ぶ。**Bundle Identifier を本当の ID に** (`capacitor.config.json` の `appId` も同じに。`IAP_BUNDLE_ID` も同じに)。
4. **Signing & Capabilities → + Capability → In-App Purchase** を足す。
5. Functions: 実機から試すには、サーバーが要る (次の 7)。サーバーが無くても、**価格の文字・購入ダイアログ・キャンセル**は、見られる。
6. (任意) StoreKit の設定ファイル: Xcode で New → File → StoreKit Configuration File → 「App Store Connect と同期」で、商品を取り込む。Scheme → Run → Options → StoreKit Configuration に選ぶ。お金は動かず、Ask to Buy や返金も、Xcode の Debug → StoreKit → Manage Transactions で試せる。**ただし、これで買った取引は、Apple ではなく Xcode の署名で、環境が `Xcode`: サーバーは受けない** (`bad_signature`)。品物を渡すところまで通すには、Sandbox が要る。
7. Sandbox で、実機で、順に:
   - 魔晶石 (消耗型) を買う: 確認の価格が、その国の通貨 → 支払い → 品物が届く → 受け取りのポップアップ。
   - キャンセルする: 何も起きない。
   - プレミアムパスを買う → 30 日 → もう一度買う → +30 日 (自動更新しないので、勝手に増えない)。
   - **未完了の取引の回復**: Functions の `IAP_ENVIRONMENT` を空にして (または Bundle ID をわざと間違えて) デプロイし、買う (お金は動かない)。品物は届かず、取引が残る。設定を戻してデプロイし、**アプリを強制終了して、起動し直す**。ホームかショップで、「購入の品が届きました」のポップアップが出て、品物が 1 回だけ届く。もう一度起動し直しても、増えない。
   - 支払いの直後 (サーバーの返事を待っている 1〜2 秒) に、アプリを強制終了して、起動し直す: 届く。
   - 承認待ち (Ask to Buy。Xcode の StoreKit のテストか、ファミリー共有の子どものアカウント): 「承認待ちです」と出て、承認すると、自動で届く。
   - 同じ取引が、別の端末・別のアプリのデータ (別の匿名サインイン) から来ても、届かない (`used_by_other`)。
   - 返金 (Sandbox・Xcode の Manage Transactions): 返金された取引は、渡さない。
8. TestFlight で数人に配る (TestFlight の課金は、Sandbox の環境のはず。未確認)。

## 7. Functions のデプロイ (**あなたの許可が要る。私はしていない**)

- **Blaze プラン** (従量課金) が要る。Cloud Functions のデプロイと、外への通信 (Apple の OCSP への問い合わせ) に。Blaze かどうかは、私には分からない。
- `functions/` は、同盟の関数と同じ場所にあり、**同盟の関数も、一度もデプロイされていない**。課金だけ出すなら `firebase deploy --only functions:verifyPurchase`。先に、`cd functions && npm install && npm run build && npm test` (型と試験)。
- 設定: `functions/.env.<プロジェクト ID>` に `IAP_*` (4. の表)。入れ忘れても、デプロイはできるが、課金は `not_configured` で断られる。
- 地域: `asia-northeast1` (東京。Firestore と同じ。`functions/src/index.ts` の `setGlobalOptions`)。クライアントの既定 (`VITE_FIREBASE_FUNCTIONS_REGION`) も東京。
- **Firestore のルールは、変えなくてよい**。`purchases` は、Admin SDK (ルールの外) だけが書く。ルールの公開 (`firebase deploy --only firestore:rules`) は、このPRでは要らない。
- 手順の注意: 本番の Firebase プロジェクトへの操作は、あなたの許可と、管理画面側のリポジトリ (ルールの写し) の同期が要る (`docs/RELEASE_CHECKLIST.md`)。開発用のプロジェクトで、先に試すとよい。
- 呼び出し 1 回あたり: Firestore の読み 1 + 書き 1 (transaction)、Apple の OCSP の問い合わせ (15 分のキャッシュ)。App Check は、まだ。

## 8. 「復元」ボタンは要るか (審査の判断材料。**決めつけない。あなたに聞く点**)

- 消耗型 (魔晶石・パック): 復元の対象にならない (Apple は、消耗型の復元を求めない、と私は理解している。未確認)。
- プレミアムパス (自動更新しない定期購入): Apple のガイドライン 3.1.1 は「復元できる課金には、復元の手段を付ける」と求めている (文面は、App Store 審査ガイドラインで確かめること)。自動更新しない定期購入が、この「復元できる課金」に入るかは、私には断定できない。
- このゲームでは、プレミアムの期限は、**端末のセーブ**にある。機種変更は、データ引き継ぎ (`transfer`) で、期限ごと移る。
- 今の作りで「復元」を付けても、別の端末では効かない: サーバーは、取引を、**最初に確かめた匿名サインイン (uid) に結びつける** (`used_by_other`)。別の端末は、別の uid。付けるなら、結びつけの付け替えの設計も要る (別の仕事)。
- 決めてほしい: (a) 付けずに出して、審査で言われたら足す / (b) 先に付ける (結びつけの設計から) / (c) 審査に問い合わせる。

## 9. 次の仕事 (今回は作っていない)

- **返金の通知 (App Store Server Notifications V2)**: Apple が、返金・取り消しを、サーバーの URL (HTTP の関数) に知らせる。`SignedDataVerifier.verifyAndDecodeNotification` で確かめて、`purchases/{取引ID}` に印を付ける。品物 (セーブは端末にある) を取り戻すには、次の起動で、クライアントが、返金済みの取引をサーバーに聞く仕組みが要る。App Store Connect に、通知の URL (本番と Sandbox) を入れる。
- 「復元」と、別の端末への付け替え (8.)。
- App Check (同盟・課金への、アプリ以外からの呼び出しの抑え)。
- Android (Google Play Billing): プラグインは対応しているが、`android/` が無い。
- App Privacy: `purchases/{取引ID}` に、uid・商品・日時を保存する。「購入履歴」の申告が要るか、確かめる (`docs/RELEASE_CHECKLIST.md`)。

## 10. あなたに聞きたい点

1. **価格**: 1,220 円・1,500 円・2,440 円は、Apple の価格表にあるか。無ければ、どの額にするか。
2. **公開のサーバーが、Sandbox の取引も受けて**よいか (`Production,Sandbox`。審査員と TestFlight の人は、課金なしで品物を受け取れる)。それとも、開発用と本番用で、Firebase のプロジェクトを分けるか。
3. **日本以外の国で配るとき**の価格の文面: ストアの価格の文字 ("$4.99" など) を出すようにしたが、「税込」の札・「表示価格はすべて消費税込みです。」・規約 (`legal.ts`) は、日本の話のまま、触っていない。他の国の人に出して、よいか (法務の確認)。
4. 「復元」ボタン (8.)。
5. 管理画面から円の品を足す運用 (4.): ストア・コード・デプロイが要るので、足せなくてよいか。
6. 匿名サインインが変わる (アプリの入れ直し・データ消去) と、回復の途中だった取引は、新しい uid では、受け取れない (`used_by_other`)。この小さな穴を許してよいか。
7. 商品 ID の接頭辞 (`abyrus_` など) を付けるか (5. の「未確認」)。
8. `purchases/{取引ID}` に、uid・商品・環境・日時を保存してよいか (プライバシーの申告・ポリシーへの反映)。
