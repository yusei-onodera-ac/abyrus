# 同盟（アライアンス）サーバー設計書

プロジェクトの持ち主向け。ゲーム側の設計は `docs/ALLIANCE_DESIGN.md`。ここは、**サーバー（Firebase）で動かすための部分**。

> **状態：未検証。** Firebase プロジェクトがまだ無いので、ここに書いたルール・コード・Functions は、実際の Firestore には、
> 一度もつないでいない。型は通っている（ゲーム側）が、動作は、プロジェクトをつないで確かめる必要がある。
> 本番に出す前に、必ず、エミュレーター（下の「試し方」）で、ひと通り動かすこと。

## 全体

```
ゲーム (OnlineAllianceBackend.ts) ──直接読み書き──▶ Firestore  ◀── ルール (firestore.rules) が、書き込みを縛る
        │                                              ▲
        └──callable (beginRaid / finishRaid)──▶ Cloud Functions ──(Admin SDK: ルールの外)──┘
                                                      └ trigger / scheduled: 週の切り替え・集計・掃除
```

- 認証は、**匿名認証**（ランキングと同じ）。端末ごとに、認証 uid がひとつ。
- ゲームの「フレンドID」（`social.playerId`、8文字）は、`users/{認証uid}.playerId` と `playerIndex/{フレンドID}` で、結び付ける。
  画面とゲームのルールが使う `uid` は、すべて**フレンドID**。Firestore の文書のキーは、**認証 uid**。
- Firebase が設定されていなければ（`VITE_FIREBASE_*` が空）、ゲームは、これを一切読み込まず、疑似メンバーのローカル版で動く。

## データの形

`●` は、クライアントが書ける（ルールの範囲で）。`○` は、Cloud Functions（Admin SDK）だけが書く。

| パス | 中身 | 書く人 |
|---|---|---|
| `users/{認証uid}` | `playerId, name, level, power, allianceId, leftAt, updatedAt` | ● 本人 |
| `users/{認証uid}/invites/{同盟ID}` | 招待: `allianceName, emblem, fromAuth, fromName, at` | ● 幹部以上が、相手に書く／本人が消す |
| `users/{認証uid}/requestsOut/{同盟ID}` | 自分が出した申請の控え | ● 本人 |
| `playerIndex/{フレンドID}` | `{ authUid }`（先着。あとから変えられない） | ● 本人 |
| `allianceNames/{名前の正規形}` | `{ allianceId }`（名前の重複防止） | ● 同盟長（作成・改名・解散と同じバッチ） |
| `alliances/{同盟ID}` | `name, nameLower, emblem, description, level, exp, memberCount, memberMax, joinPolicy, minPlayerLevel, leaderName, leaderAuth, weekPoints, power, league, createdAt, updatedAt` | ● 同盟長（設定）／メンバー（人数・寄付）／○ `power`・`league` |
| `alliances/{id}/members/{認証uid}` | `playerId, name, level, power, role, contribution, weekContribution, weekId, coins, lastActiveAt, joinedAt, helper` | ● 本人（自分の情報・貢献）／同盟長（役職）／幹部以上（外す） |
| `…/members/{uid}/daily/{その日}` | 1日ごとの回数: `donGold, donMaterials, donGems, total, stages, answers, staminaSent, staminaReceived, lendCoinsClaimed, raidAttempts, updatedAt` | ● 本人（`raidAttempts` 以外）／○ `raidAttempts` |
| `…/members/{uid}/inbox/{id}` | 受け取り箱: `kind('stamina'\|'lend'), amount, fromAuth, fromName, at` | ● 同盟のメンバーが入れる／本人が消す |
| `alliances/{id}/requests/{認証uid}` | 参加申請: `playerId, name, level, power, at, status('pending'\|'approved')` | ● 本人が出す／幹部以上が承認 |
| `alliances/{id}/raid/{週ID}` | 今週のボス: `weekId, boss{id,name,art,heroClass,description}, maxHp, hp, startsAt, endsAt, defeatedAt, lastHitName, allianceLevel` | ○ |
| `…/raid/{週ID}/damage/{認証uid}` | 今週のダメージ: `damage, name, playerId, updatedAt` | ○ |
| `…/raid/{週ID}/hits/{id}` | 1回ごとの記録（監査用）: `authUid, damage, at` | ○ |
| `…/raid/{週ID}/claims/{認証uid}` | 報酬の受け取り済み: `at, rank` | ● 本人（1回だけ） |
| `alliances/{id}/tickets/{id}` | 挑戦の切符: `authUid, playerId, weekId, issuedAt, expiresAt, durationMs, maxDamage, used` | ○ |
| `alliances/{id}/lends/{貸した人uid}_{その日}` | 助っ人を貸した回数 `{ n }`（お礼は、1日3回まで） | ● メンバー |
| `alliances/{id}/chat/{id}` | `kind('text'\|'help'\|'system'), senderAuth, senderPlayerId, senderName, text, sentAt, help{what,helpers[],open}` | ● text / help ／○ system |
| `seasons/{週ID}/entries/{同盟ID}` | リーグ表の1行: `allianceId, name, emblem, league, groupId, power, points, raid, donation, stages, helpers, updatedAt` | ○ 作成／● 寄付・ステージ・助っ人のポイント／○ ボスのポイント |
| `seasons/{週ID}/results/{同盟ID}` | 結果: `rank, groupId, league, nextLeague, groupSize, points, promoted, demoted, at` | ○ |
| `seasons/{週ID}/claims/{同盟ID}_{認証uid}` | 結果の報酬の受け取り済み: `at, rank` | ● 本人（1回だけ） |
| `seasons/{週ID}/meta/{rollover,late}` | 集計済みの印・途中参加の組の数 | ○ |

- **週ID** は、日本時間の ISO 週（`2026-W46`）。月曜 0:00 に変わる。ボスの週と、対抗戦のシーズンは、同じID。
- **1日**は、日本時間の 4:00 で変わる（`2026-11-11` のような形。月日の桁はそろえない）。ルールの `dayKey()` と、`onlineLogic.ts` の `dayKey()` が、同じ形。
- 数（ダメージなど）は、`number`（double）。1e300 まで入るので、足りる。足し算は、多少の誤差を許す（ゲーム内の表示には十分）。
- 同盟に入っているかの**本当の印**は、`alliances/{id}/members/{自分}` があること。`users/{自分}.allianceId` は、その控え
  （外された・解散されたあとは、古いまま残ることがある。ゲームが、次に開いたときに、直す）。

### 流れの例

- **入る（自由参加）**：1つの transaction で、メンバー文書を作る + 同盟の `memberCount` を +1 + 自分の `users.allianceId` を設定。
- **入る（承認制）**：`requests/{自分}` を作る → 幹部以上が `status: approved` にする → **本人が次に開いたとき**に、自分で入る
  （`users` 文書は、本人しか書けないので、承認する側は、印だけを付ける）。
- **寄付**：1つの transaction で、同盟の EXP・Lv・今週のポイント + 自分の貢献・コイン + 今日の回数 + リーグ表の寄付ポイントを、同時に更新。
- **ボスに挑む**：`beginRaid`（回数を1つ消費して、切符を発行）→ 60秒戦う → `finishRaid`（切符を確かめ、ダメージを上限で切って、ボスのHP・ダメージ・ポイントを、1つの transaction で更新）。
- **週の切り替え**（月曜 0:00）：`weeklyRollover` が、先週の順位・昇降格を決めて、新しいシーズンと新しいボスを作る。何度動いても同じ結果（「済み」の印を見る）。

## 索引（`firestore.indexes.json`）

| 対象 | 索引 | 使う場所 |
|---|---|---|
| `alliances` | `joinPolicy ↑, weekPoints ↓` | おすすめ（`joinPolicy in [open, approval]` を、今週のポイント順に） |
| `entries`（シーズンの下） | `groupId ↑, points ↓` | リーグ表（自分の組を、ポイント順に） |
| `entries` | `league ↑, power ↓` | 運用用（リーグごとの総合力順） |
| コレクショングループ `chat.sentAt` / `tickets.expiresAt` / `daily.updatedAt` / `members.role` | 単一フィールドの、コレクショングループ索引 | 掃除（古いものの削除）、同盟長の引き継ぎ（`role == leader`） |

名前の検索は、**前方一致**（`nameLower >= q` と `nameLower <= q + `）。部分一致は、Firestore ではできない。

## 守りの考え方（ルール）

**前提**：プレイヤーの手元の持ち物（ゴールド・素材・魔晶石）は、端末のセーブにあり、サーバーは検証できない。だから、守るのは、
「**他のプレイヤーと、みんなの共有の状態**」。1人が1日に与えられる影響に、上限を置く。

| 守るもの | どう守るか |
|---|---|
| 他人のデータ | 自分の `users` / メンバー文書しか書けない。役職の変更は、同盟長だけ。外せるのは、同盟長（全員）と幹部（メンバーのみ）。 |
| 同盟の人数 | 人数は、入る人が +1、抜ける人・外す人が -1。上限 (`memberMax`) を超えられない。 |
| 同盟Lv・EXP | 寄付のバッチでしか増えない。1回で +300 まで。Lv は1つずつ、EXP が足りる（あと300で届く）ときだけ上がる。同じバッチで「今日の寄付回数」が +1 される（1日13回まで）。 |
| 1日の回数 | `daily/{その日}` のドキュメントIDが「今日」でないと、書けない。回数は、減らせない。上限つき。 |
| ボスへのダメージ | **クライアントは書けない**。`finishRaid` が、サーバー側の切符（`tickets`）で確かめて書く。 |
| 同じ報酬を2回 | `claims/{自分}` は、作成だけ可（更新・削除は不可）。作れるのは、ダメージを与えていて、撃破済み／週の終了後のとき。 |
| 同盟名の重複 | `allianceNames/{名前}` の作成が、同盟の作成・改名と同じバッチに、縛られる。 |
| 24時間の待ち | `users.leftAt` は、本人が「いまの時刻」にしか、できない（消せない）。入るときに、ルールが確かめる。 |
| チャット | 本人の名前で、text / help だけ。system は、サーバーだけ。 |
| 受け取り箱 | メンバーが、決まった額（スタミナ10・コイン5）だけ入れられる。受け取る側が、1日の上限（スタミナ10個・コイン15）を、自分の `daily` で数える。 |

**ルール内の数字**（EXP表・1日の上限・ポイントの上限）は、`onlineLogic.ts` と合わせてある。変えたら、
`node tools/alliance/check-sync.mjs`（下の「値の同期」）で、ずれを調べる。

### 守れないもの（と、その対策）

戦闘は、**クライアントで動く**。サーバーは、戦闘を再現しないので、次は、完全には、防げない。

| 守れないもの | 影響 | いまの対策 |
|---|---|---|
| ボスのダメージの申告 | 改造したクライアントが、大きなダメージを申告できる | ① 切符に、**上限**を刻む: `min(総合力 × 80, ボスの最大HP × 5%)`。どんな申告でも、1回で、ボスのHPの5%まで。② 1日の挑戦回数（3〜5回）は、サーバーが数える。③ 切符は、使い捨てで、戦闘の時間（40秒以上）が経たないと、結果を出せない。→ 1人の不正でも、1日に、最大でボスのHP の 15〜25% まで。 |
| 総合力の申告 | 切符の上限（①の前半）が、大きくなる | ①の後半（HP の5%）が、どんな申告にも効く。 |
| 寄付・コインの支払い | 払わずに、寄付したことにできる（ゴールド・魔晶石は、端末にある） | 1日の回数と、1回の増え幅に、上限。EXP・ポイントは、1人が1日に与えられる量が決まっている。 |
| 助っ人の写し | 強すぎる助っ人を登録できる | 形（項目の型と大きさ）だけを検証。借りる側の戦闘は、ローカルで動く。 |
| フレンドIDの先取り | 他人のIDを、先に、自分の認証uidに結び付けられる（`playerIndex` は先着） | IDは、ランダムな8文字（約1兆通り）で、本人が公開したときだけ分かる。被害は、同盟への招待が届かないことに留まる。 |
| チャットの連投 | 荒らしができる | ルールでは、頻度を縛れない。必要なら、App Check と、Functions での頻度制限を足す。 |

**完全に防ぐ唯一の方法**は、戦闘を、サーバー（Functions）で、再現すること（パーティの写しを送り、サーバーが、BattleEngine と同じ計算を回す）。
いまの `BattleEngine` は、乱数と時刻に依存するので、決定的にする改造が要る。最初の公開に、必要になったら、別の仕事として行う。

## 費用の目安（1,000人が毎日遊ぶとき、おおよそ）

| 項目 | 見積もり |
|---|---|
| 同盟画面を開く（`load`） | 1回あたり、読み取り 60〜130。15秒のキャッシュと、リアルタイムの購読（変化があった文書だけ読む）で、減らしている。1人が1日に4回開くと、約300。 |
| 書き込み | 寄付1回で5文書。チャット・助っ人・支援を含めて、1人が1日に、約100。 |
| 1日の合計 | 読み取り約30〜100万、書き込み約10万 |
| 月額 | Firestore の従量課金で、**おおよそ US$15〜40**（地域・実際の遊び方で変わる。公式の料金表で確かめること） |

- **Blaze（従量課金）プランが必要**：Cloud Functions のデプロイに、要る。無料枠（Spark）では、Functions は、デプロイできない。
  予算アラート（たとえば月 US$20）を、必ず設定すること。
- Spark のままだと、Functions を使う、ボスへの挑戦（`beginRaid` / `finishRaid`）と、週の切り替えが動かない。ほかの機能は、動く。

## セットアップ

1. **プロジェクト**：ランキングに使っている Firebase プロジェクト（`BACKEND_SETUP.md`）を、そのまま使える。なければ、同じ手順で作る。
   「プロジェクトの設定 → 使用量と請求額」から、**Blaze に変更**して、予算アラートを設定する。
2. **Firestore**：作っていなければ、作る（本番環境モード）。地域は、**`asia-northeast1`（東京）**。
   Functions のトリガーは、Firestore と同じ地域でしか、動かない（`functions/src/index.ts` の `setGlobalOptions` の `region` と、合わせる）。
3. **Authentication**：「匿名」を有効にする（ランキングで済んでいれば、不要）。
4. **道具**：`npm install -g firebase-tools` → `firebase login` → このリポジトリのルートで `firebase use --add`（プロジェクトを選ぶ。`.firebaserc` ができる）。
5. **Functions の準備**：`cd functions && npm install && npm run build`（型を通す。ここで出たエラーは、直す）。
6. **ルールと索引のデプロイ**：`firebase deploy --only firestore:rules,firestore:indexes`
   - ルールは、ランキングのルールを**含んでいる**（書き換わらない）。索引ができるまで、数分かかる。
7. **Functions のデプロイ**：`firebase deploy --only functions`
8. **`.env`**：`VITE_FIREBASE_*`（ランキングと同じ）が入っていればよい。Functions を東京以外に置いたときだけ、`VITE_FIREBASE_FUNCTIONS_REGION` を足す。
   ビルド・デプロイ環境にも、同じ変数を登録する。
9. **確かめる**（本番の前に、エミュレーターで）：下の「試し方」。

### 試し方（エミュレーター）

```
firebase emulators:start --only firestore,functions,auth
```
ゲームを、エミュレーターに向けるには、`connectFirestoreEmulator` などを、開発時だけ足す必要がある（未実装）。まずは、
Firebase コンソールの「ルール プレイグラウンド」で、`firestore.rules` の主な操作（入る・寄付・役職・外す）を、試すのが早い。
確かめる項目：
- 作成 → 自由参加で入る → 寄付（金・素材・魔晶石）→ 抜ける。
- 承認制の申請 → 承認 → 本人が開いて、入る。招待 → 承認。
- 幹部が、メンバーを外せる／幹部を外せない。同盟長が、抜けられない（ほかに人がいるとき）。
- 同じ日に、寄付の上限を超えられない。他人の `daily` を書けない。
- ボスへの挑戦：`beginRaid` → 60秒後に `finishRaid`（上限で切られる）。早すぎる提出は、断られる。
- 週の切り替え（`weeklyRollover` を、手動で1回実行）：結果の文書と、新しいリーグ表の行ができる。

### 値の同期

同じ数字が、3か所にある。変えたら、すべてそろえる。

| 値 | 場所 |
|---|---|
| EXP表・恩恵・寄付・ボスのHP・ダメージ上限・ポイント・昇降格・助っ人のお礼 | `src/game/alliance/onlineLogic.ts`（ゲーム）と `functions/src/constants.ts`（サーバー）。後者は、前者の写し |
| 1日の上限・EXP表・ポイントの上限・24時間の待ち | `firestore.rules`（数字を、直接書いてある） |

`node tools/alliance/check-sync.mjs` で、(1) ゲームとサーバーが、同じ答えを返すか、(2) ルールの数字が、`onlineLogic.ts` と合っているか、
(3) 日付・週・ポイントの基本の計算が、正しいかを、確かめる（50項目）。
ローカル版（fork L の `data/alliance.ts`）の表も、最終的に、`onlineLogic.ts` と、1か所にまとめる。

## 運用メモ

- **週の切り替えを、やり直す**：`seasons/{新しい週}/meta/rollover` を消して、`weeklyRollover` を、もう一度動かす（先週の結果は、上書きされる）。
- **ボスのHPと報酬の調整**：`raidBossHp`・`raidReward`（`onlineLogic.ts` と `constants.ts`）。HP は、同盟の総合力に比例する。
- **同盟の強制解散・メンバーの調整**：Firebase コンソールか、Admin SDK で、文書を直接変える（クライアントのルールの外）。
- **リーグ表の名前**：`entries.name` は、週の頭に写したもの。週の途中の改名は、次の週から反映される。
- **掃除**：`cleanup` が、毎日、古いチャット（30日）・切符（期限切れ1日後）・1日ごとの文書（14日）を消す。
- **解散した同盟の下のデータ**：`onAllianceDeleted` が、消す。残ったメンバーの `users.allianceId` は、本人が次に開いたときに、直る。

## 未検証・未実装

- すべて、実際の Firestore・Functions では、動かしていない。ルール・索引・Functions は、読み合わせだけ。
- ルールの `get / exists` の回数は、1リクエストあたりの上限（バッチは20）に収まる想定だが、本番で確かめる。
- 4:00（1日の切り替え）の、前後数秒に書くと、手元とサーバーの日付がずれて、1回だけ失敗することがある（もう一度で通る）。
- ゲーム側を、エミュレーターに向けるつなぎは、未実装。
- 戦闘のサーバー再現、App Check、チャットの頻度制限、通報・ミュートは、入っていない。
- 同盟チャットの、古いメッセージの続き読み込み（ページング）は、最新50件のみ。
