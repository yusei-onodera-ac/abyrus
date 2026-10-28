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
