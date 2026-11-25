# 同盟（アライアンス）サーバー設計書

プロジェクトの持ち主向け。ゲーム側の設計は `docs/ALLIANCE_DESIGN.md`。ここは、**サーバー（Firebase）で動かすための部分**。

> **状態：未検証。** Firebase プロジェクトがまだ無いので、ここに書いたルール・コード・Functions は、実際の Firestore には、
> 一度もつないでいない。型は通っている（ゲーム側）が、動作は、プロジェクトをつないで確かめる必要がある。
> 本番に出す前に、必ず、エミュレーター（下の「試し方」）で、ひと通り動かすこと。
>
> 例外：**同盟ミッションと同盟研究の分のルール**（`missionTotals` と、`alliances` の `fund` / `research`）は、Firestore エミュレーターで、75項目を試した
> （`tools/alliance/rules/alliance_depth.test.ts`。下の「ルールの試験」）。ほかの部分は、これまでどおり、未検証。

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
| `alliances/{同盟ID}` | `name, nameLower, emblem, description, level, exp, memberCount, memberMax, joinPolicy, minPlayerLevel, leaderName, leaderAuth, weekPoints, power, league, fund, research, createdAt, updatedAt` | ● 同盟長（設定）／メンバー（人数・寄付・`fund` の増え）／幹部以上（研究: `fund` の減りと `research`）／○ `power`・`league`。`fund`（同盟の資金）と `research`（`{battle, income, growth}`: 系統ごとの段）は、なければ 0 として読む（作るときには書かない） |
| `alliances/{id}/members/{認証uid}` | `playerId, name, level, power, role, contribution, weekContribution, weekId, coins, lastActiveAt, joinedAt, helper` | ● 本人（自分の情報・貢献）／同盟長（役職）／幹部以上（外す） |
| `…/members/{uid}/daily/{その日}` | 1日ごとの回数: `donGold, donMaterials, donGems, total, stages, answers, staminaSent, staminaReceived, lendCoinsClaimed, raidAttempts, updatedAt` | ● 本人（`raidAttempts` 以外）／○ `raidAttempts` |
| `…/members/{uid}/inbox/{id}` | 受け取り箱: `kind('stamina'\|'lend'), amount, fromAuth, fromName, at` | ● 同盟のメンバーが入れる／本人が消す |
| `alliances/{id}/requests/{認証uid}` | 参加申請: `playerId, name, level, power, at, status('pending'\|'approved')` | ● 本人が出す／幹部以上が承認 |
| `alliances/{id}/raid/{週ID}` | 今週のボス: `weekId, boss{id,name,art,heroClass,description}, maxHp, hp, startsAt, endsAt, defeatedAt, lastHitName, allianceLevel` | ○ |
| `…/raid/{週ID}/damage/{認証uid}` | 今週のダメージ: `damage, name, playerId, updatedAt` | ○ |
| `…/raid/{週ID}/hits/{id}` | 1回ごとの記録（監査用）: `authUid, damage, at` | ○ |
| `…/raid/{週ID}/claims/{認証uid}` | 報酬の受け取り済み: `at, rank` | ● 本人（1回だけ） |
| `alliances/{id}/tickets/{id}` | 挑戦の切符: `authUid, playerId, weekId, issuedAt, expiresAt, durationMs, maxDamage, used` | ○ |
| `alliances/{id}/missionTotals/{d2026-11-24 \| w2026-11-23}` | 同盟ミッションの掲示板（1日 = `d` + 4:00区切りの日付 / 1週間 = `w` + その週の月曜の日付。どちらも日本時間）: `kind('daily'\|'weekly'), members, goals[{id,metric,target}], progress{行動: 数}, by{認証uid: {行動: 数}}, claims{認証uid: [ミッションID]}, updatedAt` | ● メンバー（最初に足した人が作る。あとは、自分の `by` と `claims` だけ） |
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
| コレクショングループ `chat.sentAt` / `tickets.expiresAt` / `daily.updatedAt` / `missionTotals.updatedAt` / `members.role` | 単一フィールドの、コレクショングループ索引 | 掃除（古いものの削除）、同盟長の引き継ぎ（`role == leader`） |

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
| 同盟の資金 | `alliances.fund` は、寄付のバッチ（`daily` の `total` が +1 になる書き込み）で、1回に +300 まで増える。減るのは、研究のときだけ。 |
| 研究 | 同盟長・副長だけ。1回の書き込みで、1つの系統が 1段だけ上がり、資金は、その段の値段（15,000 〜 180,000）ちょうどだけ減る。必要な同盟Lv（2・3・5・7・9）に届いていて、資金が足りるときだけ。ほかの項目は、同時に変えられない。 |
| 同盟ミッションの掲示板 | 文書IDは、いまの期間のものだけ（昨日の分は、書けない）。作れるのはメンバーで、`members` は同盟の人数と同じ、目標は日3件・週1件まで、貢献は作った人の分だけ。足せるのは、自分の貢献（`by.{自分}`）で、**合計は、自分の貢献が増えた分と、ちょうど同じだけ**増える（行動ごと）。1人が1期間に足せる量には、行動ごとの上限（1日: stage 300・gacha 300・donate 13・raid 5・stamina 1,000・idle 10・enhance 200・helper 20。週は7倍）。受け取り（`claims.{自分}`）は、1回の書き込みで1つ、合計が目標に届いていて、自分の貢献が1以上のときだけ。取り消せない。削除は、誰にもできない。 |

**ルール内の数字**（EXP表・1日の上限・ポイントの上限・研究の値段と必要なLv・ミッションの行動ごとの上限）は、`onlineLogic.ts` と `data/allianceResearch.ts` / `data/allianceMissions.ts` に合わせてある。変えたら、
`node tools/alliance/check-sync.mjs`（下の「値の同期」）で、ずれを調べる。

### 守れないもの（と、その対策）

戦闘は、**クライアントで動く**。サーバーは、戦闘を再現しないので、次は、完全には、防げない。

| 守れないもの | 影響 | いまの対策 |
|---|---|---|
| ボスのダメージの申告 | 改造したクライアントが、大きなダメージを申告できる | ① 切符に、**上限**を刻む: `min(総合力 × 15, ボスの最大HP × 5%)`。どんな申告でも、1回で、ボスのHPの5%まで。② 1日の挑戦回数（3〜5回）は、サーバーが数える。③ 切符は、使い捨てで、戦闘の時間（40秒以上）が経たないと、結果を出せない。→ 1人の不正でも、1日に、最大でボスのHP の 15〜25% まで。 |
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

### ルールの試験（ミッション・研究の分）

`tools/alliance/rules/alliance_depth.test.ts`（75項目）が、Firestore エミュレーターに、実際の `firestore.rules` を読み込ませて、許されること・断られることを、1つずつ確かめる。
本番には、つながらない（`demo-` で始まるプロジェクトで、エミュレーターにしか、つながらない）。vitest と `@firebase/rules-unit-testing` が要る
（このリポジトリの `package.json` には入れていない。abyrus-admin の `npm run test:rules` と同じ道具）。この2つが入っているフォルダ（例：abyrus-admin を clone したもの）の `tests/` に、
テストファイルを置いて、そこから:

```
RULES_PATH=<このリポジトリ>/firestore.rules firebase emulators:exec --only firestore --project demo-abyrus-alliance-depth "vitest run"
```

要るもの: Java（エミュレーターが使う）、`firebase-tools`。確かめている内容: 研究（幹部以上だけ・値段ちょうど・1段ずつ・必要な同盟Lv・資金が足りるとき・2系統同時や、ほかの項目の同時変更は不可）、資金（寄付1回で最大300）、
ミッション掲示板の作成（いまの期間のIDだけ・人数・目標の数と形・作った人の貢献だけ）、足す（自分の貢献が増えた分だけ合計が増える・上限・ほかの人の分は触れない・昨日の掲示板は閉じている）、受け取り（1回1つ・目標に届いたときだけ・貢献が1以上・取り消せない）。
わざとルールを壊して（幹部の条件を外す・値段を緩める・上限を10倍・人数の確認を外す・二重の受け取りの確認を外す）、テストが落ちることも確かめた。
「いまの時刻」は実時間なので、4:00（日本時間）の前後数秒に走らせると、1回だけ落ちることがある。週の境目（日曜の夜と月曜の朝）は、実時間でしか試せないので、`tools/alliance/check-sync.mjs` が、`mondayKey` の計算（`2026-11-29 23:59` は `2026-11-23`、`2026-11-30 0:00` は `2026-11-30`）を確かめている。

**サーバー版のコードごと、エミュレーターで通す試験**（`tools/alliance/rules/online_backend_e2e.ts`、29項目）：`OnlineAllianceBackend` を、Auth と Firestore のエミュレーターにつないで、
実際のルールで、作成 → 寄付（資金が増える）→ ミッションの報告（掲示板の作成と、足す）→ 受け取り（同盟コインが入る・2回目は断られる）→ 研究（資金・同盟Lv の確認・2系統）を、通す。
`node tools/alliance/rules/bundle_e2e.mjs <フォルダ>/e2e` でまとめて、`firebase emulators:exec --only firestore,auth --project demo-abyrus-alliance-depth "node e2e/alliance_online.mjs"` で動かす
（リポジトリの `firebase.json` に、エミュレーターの設定（auth 9099・firestore 8080）を足した。公開（deploy）には関係しない）。「E2E DONE」と出れば、全部通った。
このとき、これまで未検証だった**寄付のルール**（EXP・Lv・1日の回数の同時更新）も、本物のルールで通ることが分かった。

エミュレーターで分かったこと: ルールには「1リクエストで評価できる式は1,000まで」の上限がある。ミッションの掲示板のルール（行動8つ × 上限・合計の一致）は、そのために、短く書いてある（`missionStep`）。変えるときは、エミュレーターで確かめること。

### 値の同期

同じ数字が、3か所にある。変えたら、すべてそろえる。

| 値 | 場所 |
|---|---|
| EXP表・恩恵・寄付・ボスのHP・ダメージ上限・ポイント・昇降格・助っ人のお礼 | `src/game/alliance/onlineLogic.ts`（ゲーム）と `functions/src/constants.ts`（サーバー）。後者は、前者の写し |
| 1日の上限・EXP表・ポイントの上限・24時間の待ち | `firestore.rules`（数字を、直接書いてある） |
| 研究の値段・必要な同盟Lv・段の数 | `src/game/data/allianceResearch.ts`（ゲーム。ローカルも、同じ表）と `firestore.rules` の `researchCost` / `researchNeedLevel` |
| ミッションの行動と、1人の上限（1日。週は7倍）・目標の数 | `src/game/data/allianceMissions.ts`（ゲーム。ローカルも、同じ表）と `firestore.rules` の `missionStepsOk`。目標の数は、ルールには書かない（最初に足した人が、掲示板に書く） |

`node tools/alliance/check-sync.mjs` で、(1) ゲームとサーバーが、同じ答えを返すか、(2) ルールの数字が、`onlineLogic.ts` と合っているか、
(3) 日付・週・ポイントの基本の計算が、正しいか、(4) 研究の値段・必要なLv・ミッションの上限が、ルールと表で合っているかを、確かめる（66項目）。
ローカル版（fork L の `data/alliance.ts`）の表も、最終的に、`onlineLogic.ts` と、1か所にまとめる。

## 運用メモ

- **週の切り替えを、やり直す**：`seasons/{新しい週}/meta/rollover` を消して、`weeklyRollover` を、もう一度動かす（先週の結果は、上書きされる）。
- **ボスのHPと報酬の調整**：`raidBossHp`・`raidReward`（`onlineLogic.ts` と `constants.ts`）。HP は、同盟の総合力に比例する。
- **同盟の強制解散・メンバーの調整**：Firebase コンソールか、Admin SDK で、文書を直接変える（クライアントのルールの外）。
- **リーグ表の名前**：`entries.name` は、週の頭に写したもの。週の途中の改名は、次の週から反映される。
- **掃除**：`cleanup` が、毎日、古いチャット（30日）・切符（期限切れ1日後）・1日ごとの文書（14日）・ミッションの掲示板（14日）を消す。
- **ミッションの目標・報酬を変える**：`data/allianceMissions.ts` の表を直すだけ。すでにできている今日・今週の掲示板は、できたときの目標のまま（報酬は、表の新しい値）。
  研究の値段・効果は、`data/allianceResearch.ts`（値段と必要Lvは、ルールの `researchCost` / `researchNeedLevel` も）。
- **解散した同盟の下のデータ**：`onAllianceDeleted` が、消す。残ったメンバーの `users.allianceId` は、本人が次に開いたときに、直る。

## ミッション・研究のルールを公開するとき（持ち主の作業。ここでは、公開していない）

1. **ルールの置き場**：Firebase プロジェクトは、ゲームと管理画面（abyrus-admin）で共用で、ルールは、1プロジェクトに1つだけ公開できる。
   このリポジトリの `firestore.rules` は、管理画面の分も含んだ全部。**abyrus-admin の `firestore.rules` にも、同じ内容を写す**こと（管理画面の側から公開すると、
   写していないほうの分が消える）。管理画面の節（`// 管理画面` 以下）は、abyrus-admin の側が正なので、そちらに変更が入っていれば、それも取り込んでから写す。
2. 公開する前に、エミュレーターで試験する（上の「ルールの試験」。75項目が通ること）。`node tools/alliance/check-sync.mjs` も通すこと。
3. 公開：`firebase deploy --only firestore:rules,firestore:indexes`（索引に、`missionTotals.updatedAt` の分が増えた。数分かかる）。
4. 古い掲示板の掃除（`cleanup`）を使うなら、Functions も公開：`firebase deploy --only functions`（この変更は `cleanup` に1行だけ。Blaze プランが要る）。
   公開しなくても、ゲームは動く（掲示板が、たまっていくだけ）。
5. 公開したあとの確認：2つの端末（または、2つの同盟メンバー）で、ミッション画面を開いて、片方の行動が、もう片方の進みに出ること。同盟長で、研究が進むこと。

## 未検証・未実装

- すべて、実際の Firestore・Functions では、動かしていない。ルール・索引・Functions は、読み合わせだけ（ミッション・研究のルールは、エミュレーターで試験済み）。
- ミッションと研究の Online 側（`OnlineAllianceBackend` の `reportMissions` / `claimMission` / `researchUp`）は、エミュレーターで通した（上の「ルールの試験」。メンバー1人だけの動き。
  2人以上が同時に足す競合は、transaction に任せていて、試していない）。ミッションの掲示板は、リアルタイムの購読には、入れていない（開き直すと、最新になる。読み取りを減らすため）。
- ミッションの目標の数は、最初に足した人が決めるので、改造したクライアントが、小さな目標を書けてしまう（報酬は端末のセーブに入るので、ほかの持ち物と同じ限界）。
- ルールの `get / exists` の回数は、1リクエストあたりの上限（バッチは20）に収まる想定だが、本番で確かめる。
- 4:00（1日の切り替え）の、前後数秒に書くと、手元とサーバーの日付がずれて、1回だけ失敗することがある（もう一度で通る）。
- ゲーム側を、エミュレーターに向けるつなぎは、未実装。
- 戦闘のサーバー再現、App Check、チャットの頻度制限、通報・ミュートは、入っていない。
- 同盟チャットの、古いメッセージの続き読み込み（ページング）は、最新50件のみ。
