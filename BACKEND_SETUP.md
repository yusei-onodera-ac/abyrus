# 無限モード グローバルランキング セットアップ

Infinite Mode（Event タブの「無限モード」）のグローバルランキングは
[Firebase](https://firebase.google.com/)（Firestore + Anonymous Authentication）を
使っています。このドキュメントは、Firebase を一度も使ったことがない人向けに、
無料枠で動くプロジェクトを作って `.env` に値を貼るまでの手順を説明します。

**この設定をしなくてもゲームは普通に動きます。** `.env` が無い/空のままだと、
無限モードの画面は「ランキング準備中」と表示し、この端末だけのベストスコア
（ローカル保存）だけを使います。クラッシュしたり、プレイ自体がブロックされたり
することはありません。

所要時間はだいたい 10 分、クレジットカードの登録も不要です（Firestore の
無料枠である Spark プランのままで十分動きます）。

---

## 1. Firebase プロジェクトを作る

1. [Firebase コンソール](https://console.firebase.google.com/) を開き、
   Google アカウントでログインします。
2. 「プロジェクトを作成」（Add project / Create a project）をクリック。
3. プロジェクト名を入力します（例: `abyrus-leaderboard`）。何でも構いません。
4. Google Analytics の有効化を聞かれますが、**オフで構いません**
   （「このプロジェクトでは Google アナリティクスを有効にしない」を選択）。
5. 「プロジェクトを作成」をクリックし、作成が終わるまで待ちます。

## 2. ウェブアプリを追加して config 値を取得する

1. プロジェクトのトップページで、ウェブのアイコン（`</>`）をクリックして
   「ウェブアプリを追加」します。
2. アプリのニックネームを入力（例: `abyrus-web`）。Firebase Hosting の設定は
   チェックしなくて構いません。
3. 「アプリを登録」をクリックすると、`firebaseConfig` というオブジェクトが
   表示されます。次のような形です:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "abyrus-leaderboard.firebaseapp.com",
     projectId: "abyrus-leaderboard",
     storageBucket: "abyrus-leaderboard.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890",
   };
   ```

4. このリポジトリのルートに `.env.example` をコピーして `.env` を作り、
   上の値をそれぞれ対応する変数に貼り付けます（引用符は付けません）:

   ```bash
   cp .env.example .env
   ```

   ```ini
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=abyrus-leaderboard.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=abyrus-leaderboard
   VITE_FIREBASE_STORAGE_BUCKET=abyrus-leaderboard.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
   VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
   ```

   `.env` は `.gitignore` 済みなので、コミットされる心配はありません。
   この値はあとでいつでもコンソールの「プロジェクトの設定」(⚙️アイコン) →
   「マイアプリ」から見返せます。

## 3. Firestore データベースを作る

1. 左側メニューの「構築」(Build) → 「Firestore Database」を開きます。
2. 「データベースの作成」をクリック。
3. ロケーションは好きなリージョンで構いません（例: `asia-northeast1` =
   東京）。あとから変更できないので、プレイヤーに近い場所を選ぶと多少速く
   なります。
4. セキュリティルールのモードは **「本番環境モード」**（production mode）を
   選びます（下の手順 5 で、ここに専用のルールを貼るので問題ありません）。
5. 「有効にする」をクリックして完了を待ちます。

## 4. Anonymous Authentication を有効にする

ランキードキュメントの所有者を「このプレイヤー」だと区別するために、
サインアップ不要の匿名認証を使います。

1. 左側メニューの「構築」→「Authentication」を開きます。
2. 「始める」(Get started) をクリック。
3. 「Sign-in method」タブで一覧から **「匿名」(Anonymous)** を選び、
   有効にして保存します。

## 5. セキュリティルールを貼る

> **いまの正は、このリポジトリの `firestore.rules` です（ランキング + 同盟 + 管理画面の管理者・ショップ・プレミアムを、1つにまとめてあります）。**
> 下のコードは、ランキングだけだった頃の説明用です。**これを貼ると、同盟と管理画面のルールが消えます。貼らないでください。**
> 公開するのは `firestore.rules` の全文（Firebase コンソールのルール欄に貼る、または `firebase deploy --only firestore:rules`）。
> 順番: ① Firebase コンソールで `admins/{管理者の認証uid}` のドキュメントを作る（中身は空でよい）→ ② 公開する。
> ①より先に公開すると、管理画面に入れなくなります。公開したあとは `node tools/check/remote_shop.mjs` で、ショップが読めることを確かめます。

これが唯一の「本物のバックエンド」の部分です。クライアントが書き込める
内容を以下のルールで制限しています:

- 誰でも読み取りはできる（ランキング表示のため）。
- 1 人のプレイヤー（匿名認証の uid）が書き込めるのは**自分の 1 件だけ**。
  他人のドキュメントを書き換えることはできません。
- 新しいスコアは、今までの自分のベストより**下がることはできません**
  （リトライで意図せず下書きしても安全）。
- スコアや生存時間などの値は、明らかに異常な値（負の数や極端に大きい数）
  だと拒否されます。
- 削除は誰にも許可しません。

1. Firestore の「ルール」(Rules) タブを開きます。
2. 既存の内容を全て削除し、以下をそのまま貼り付けます。
3. 「公開」(Publish) をクリックします。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /infiniteModeScores/{entryId} {
      allow read: if true;

      allow create: if request.auth != null
        && request.auth.uid == entryId
        && isValidEntry(request.resource.data);

      allow update: if request.auth != null
        && request.auth.uid == entryId
        && isValidEntry(request.resource.data)
        && request.resource.data.score >= resource.data.score;

      allow delete: if false;
    }

    function isValidEntry(data) {
      return data.score is number
        && data.score >= 0
        && data.score <= 100000000
        && data.survivalSeconds is number
        && data.survivalSeconds >= 0
        && data.survivalSeconds <= 86400
        && data.enemiesDefeated is number
        && data.enemiesDefeated >= 0
        && data.enemiesDefeated <= 1000000
        && data.difficultyReached is number
        && data.difficultyReached >= 0
        && data.playerName is string
        && data.playerName.size() <= 24
        && data.updatedAt == request.time;
    }
  }
}
```

索引（インデックス）について: ランキング上位の取得（スコア降順）も、
自分の順位の計算（自分より高いスコアの件数）も、どちらも `score` 1 列への
単一フィールドクエリなので、Firestore が自動で作る単一フィールド索引だけで
動きます。複合索引を自分で作る必要はありません。

## 6. 動作確認

1. `.env` を保存したら、開発サーバーを再起動します（Vite は起動時にだけ
   `.env` を読むため）:

   ```bash
   npm run dev
   ```

2. Event タブ（無限モード）を開き、「読み込み中…」が
   「ランキング準備中」ではなく、「まだ記録がありません。最初の挑戦者に
   なろう!」や実際の順位表に変わっていれば接続成功です。
3. 一度プレイしてランを終えると、結果画面に送信結果
   （「グローバル順位 N位」など）が表示されます。
4. Firebase コンソールの Firestore Database → データタブに
   `infiniteModeScores` コレクションが作られ、1 件ドキュメントが
   増えていれば成功です。

## うまくいかないとき

- 画面に「ランキング準備中」のまま変わらない場合: `.env` の 6 つの値が
  すべて埋まっているか、開発サーバーを再起動したかを確認してください。
- 「ランキングへの送信に失敗しました」と出る場合: Firestore のルールを
  正しく貼って「公開」したか、Authentication で「匿名」を有効にしたかを
  確認してください。
- ビルド/デプロイ環境（本番サーバーや CI）では、同じ 6 つの
  `VITE_FIREBASE_*` 環境変数をそのビルド環境のシークレット/環境変数設定に
  も登録してください（`.env` はローカル専用で、リポジトリには含まれません）。

## ショップ商品・プレミアムパスの値段（運営の管理画面から読む）

ゲームは、起動時に1回だけ、運営の管理画面 (abyrus-admin) が Firestore に書いた次の2か所を読みます
（`src/game/systems/RemoteShopConfig.ts`）。`VITE_FIREBASE_*` がそろっていないとき、取得に失敗したとき
（オフライン・ルール・形式の違い・8秒で返らない）は、何も言わずに `src/game/data/shop.ts` と `premium.ts` の
静的データのまま動きます。例外は投げません。

- `shopProducts/{商品id}`: `{ name, description, group: 'pack'|'gems'|'gold'|'item', priceCurrency: 'yen'|'gems'|'gold',
  priceAmount, goods: [{type, amount}], bonus?, limitPeriod?, limitCount?, badge?, startsAt?, endsAt?, category? }`
- `config/premium`: `{ yen, durationDays, dailyGems, battleSpeed, idleCapHours, joinPack: [{type, amount, item?, rarity?}] }`

決まり:
- 1つ1つ検めて、形が正しくないもの（型・範囲・ゲームが知らない素材）は捨てます。正しいものだけを使います。
- 商品は group ごとに静的データと入れ替えます。ある group に正しい商品が1つもなければ、その group は静的データのままです。
  並びは、静的データにある id は静的データの順、新しい id はそのあとに id 順。
- 商品の **ドキュメントid が購入回数の数え方の鍵**です（`SaveData.shop.purchases`）。今ある商品の id は変えないでください
  （`pack-starter`、`gems-50` など）。
- プレミアムは1項目ずつ検めて、正しい項目だけ上書きします。`joinPack` は、正しい報酬が1つ以上あるときだけ入れ替えます。
- 読むだけです（サインイン不要）。ルールで `shopProducts/*` と `config/*` を「誰でも読み取り可、書き込みは管理者のみ」にしてください。
  このリポジトリの `firestore.rules` に、管理画面側（abyrus-admin のコミット 36bd365）のルールを写して、1つにまとめてあります。
  管理画面側のルールを変えたら、こちらにも同じ変更を入れてください（片方だけ公開すると、もう片方の分が消えます）。

確かめ方（読むだけ。書き込みはしない）: `node tools/check/remote_shop.mjs`。本番の `shopProducts` と `config/premium` を、
ゲームと同じ読み方（サインインなし）で読んで、ゲームが使うもの・捨てるもの・静的データにあってサーバーにない id を一覧にする。
読めない (403) ときは、ルールが「誰でも読み取り可」になっていない、という意味。管理画面でルールを公開したあと、商品を登録したあとに、まず実行する。

## お知らせ・メンテナンス（運営の管理画面から読む）

ショップと同じやり方（起動時に1回、サインインなしで読む。失敗しても黙って、いつもの動きのまま）です。

| 管理画面 | Firestore | ゲームでの動き |
|---|---|---|
| お知らせ | `announcements/{id}` `{ title, body, publishedDate: "YYYY-MM-DD", active }` | お知らせの一覧の先頭に出る（新しい順、最大20件）。`active` が true のものだけ。**公開日の0時（日本時間）から**出る（先の日付で書いておける）。タイトル60文字・本文2000文字まで。決まりに合わないものは、その1件だけ出さない。画像なし（文字だけ）。 |
| メンテナンス | `config/maintenance` `{ enabled, message }` | `enabled` が **ちょうど true** のとき、起動のあと、ホームの代わりに「メンテナンス中」の画面を出す。30秒ごと・ボタンで確かめ直し、終わったら本来の画面へ進む。メッセージは300文字まで（空・長すぎは、ふつうの文）。 |

- **メンテナンスは「開く側」に倒してあります**: 読めない（通信なし・ルール・タイムアウト・ドキュメントなし・形が違う）ときは、メンテナンス**ではない**として進みます。通信の不調で全員を締め出さないためです。起動時に待つのは、最大2.5秒。
- 開発のときは、アドレスに `?nomaint` を付けるとメンテナンスの確認を飛ばします（開発サーバーと DEV のみ）。
- **ルールの公開が要ります**（このリポジトリの `firestore.rules`）: `announcements` は `active == true` のものだけ誰でも読める（ゲームは `where('active','==',true)` で聞く）、`config/maintenance` は誰でも読める・書くのは管理者だけで中身を検める。公開するまでは、読めない（403）ので、何も変わりません。
- メンテナンスの中身を管理画面のフォームが書くときは `updatedAt` も付く（ルールは許している）。

### ログインボーナス（毎月の1〜31日の報酬）

`loginBonusDays/{day}` `{ day: 1〜31, reward, note? }`（**ドキュメントidが日そのもの** `"1"`〜`"31"`。`day` と一致しないと保存できません）を、起動時に1回、全部読みます（`systems/RemoteLoginBonus.ts`）。**`day` に当たる日だけ**、
ゲームに書いてある報酬（`data/loginBonus.ts`）の代わりにその報酬が出ます。ない日は、書いてある報酬のままです。

- `reward` はゲームの報酬と同じ形: `{ type: gems|gold|stamina|phaseMaterials|skillEssence, amount }`、`{ type: item, item: exp_s|exp_m|exp_l|exp_xl|equip_essence, amount }`、
  `{ type: equipment, rarity: 1〜5, amount }`。数量は整数で 1〜10億。**魔晶石だけは 10万まで**（桁の打ち間違いを止めるため）。
- 決まりに合わないドキュメントは、その1件だけ使いません（念のため、同じ日が2つあるときは、idが小さいほう）（昔の「7日サイクル」の形 `dayNumber` / `rewardType` も使いません）。
- 毎月同じ表を使います（月ごとの表はありません）。すでに受け取った日は、直しても戻りません。
- ルール: `loginBonusDays` は誰でも読める。書くのは管理者だけで、中身を検める（報酬は、プレミアムパスの入会パックと同じ検査）。**公開するまでは読めない（403）ので、書いてある報酬のまま。**

### プレゼント・メール（全員に送る分）

管理画面の「プレゼント」「メール」のうち、**配布対象が「全プレイヤー」で、ステータスが「送信済み」**のものを、ゲームが起動時に1回読みます
（`systems/RemoteInbox.ts`）。ゲーム自身の一覧（`data/gifts.ts`・`data/mails.ts`）に足されるので、ホームに着いたときの配り方（1つのセーブに1回）
そのままで、プレゼントBOX・メールBOXに届きます。

| 管理画面 | Firestore | ゲームでの動き |
|---|---|---|
| プレゼント | `gifts/{id}` `{ title, message, rewardType: gold\|gem, rewardAmount, recipientType: all, status: sent, endsAt?, expireDays? }` | プレゼントBOXに届く。魔晶石は10万、ゴールドは10億まで。受け取れる期間は、`endsAt` か `expireDays`、なければ30日。 |
| メール | `mail/{id}` `{ subject, body, recipientType: all, status: sent, hasReward?, rewardType?, rewardAmount? }` | メールBOXに届く。本文は2000文字まで。報酬を付けたメールは、プレゼントBOXにも同じ報酬が届く。 |

- **配るのは魔晶石（`gem`）とゴールドだけ**です（今のプレゼントは、その2つだけ）。「アイテム」は配れないので、そのプレゼントは出ません。
  報酬を付けたメールの報酬が「アイテム」・数量の間違い（0・上限超え）のときは、**メールも出しません**（約束した報酬を渡せないメールを出さないため）。
- **特定のプレイヤー宛て（`specific`）は、配りません**。1人ずつ届ける仕組みが、まだゲームにありません。
- **ドキュメントid が、配ったかどうかの鍵**です。**配ったあとに直しても、もう一度は配られません**。もう一度送るときは、新しいドキュメントを作ります。
  あとから始めた人にも、「送信済み」のものは届きます（期限の `endsAt` を過ぎたものは届かない）。
- 時刻のないメールは、最後に保存した時刻（なければゲームが初めて見た時刻）が、送った時刻になります。
- ルール: `gifts` と `mail` は、`status == 'sent' && recipientType == 'all'` のものだけ誰でも読める（ゲームはその条件で聞く）。下書き・個別宛て・書き込みは管理者だけ。
  **公開するまでは読めない（403）ので、何も届きません。**
