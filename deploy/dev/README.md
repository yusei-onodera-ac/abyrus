# Dev 環境（GCP Cloud Run）

ビルドしたゲーム（`dist/`）を nginx で配信する、ブラウザ用の Dev 環境です。
ユーザー名とパスワード（nginx の Basic 認証）を付けています。

```
bash deploy/dev/deploy.sh                  # 自分のPCからだけ開ける（非公開）
PUBLIC=1 bash deploy/dev/deploy.sh         # URL を知っている人がログイン画面まで来られる（スマホ用）
```

Git Bash から実行します。PowerShell から実行するときは、`bash` と打つと WSL の bash が選ばれて
`gcloud` のログインが見えなくなるので、Git の bash.exe を指定します。

```powershell
$env:PUBLIC = "1"
& "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe" deploy/dev/deploy.sh
```

- プロジェクト `shiplabjapan`、リージョン `asia-northeast1`、サービス名 `abyrus-dev`
  （`GCP_PROJECT` / `GCP_REGION` / `SERVICE` で変更できます）。
- ユーザー名は `abyrus`、パスワードは毎回ランダムで、デプロイの最後に表示されます
  （`DEV_USER` / `DEV_PASSWORD` で固定できます）。
- 非公開のままのときは、`gcloud run services proxy abyrus-dev --project shiplabjapan --region asia-northeast1 --port 8088`
  を動かして、`http://localhost:8088` を開きます。
- ランキング用の `VITE_FIREBASE_*`（`BACKEND_SETUP.md`）は、手元の `.env` にあればビルドに入ります。
  なければ「ランキング準備中」のままです。
- 使わない間は、インスタンスが 0 になるので、料金はほとんどかかりません。
