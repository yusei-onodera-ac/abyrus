# 足りない画像を作る (tools/art)

Vertex AI の Gemini 画像生成で、ゲームに足りない画像（129枚）を作ります。費用は Google Cloud の請求アカウントにかかり、
クレジットがあれば先にそれが使われます。目安（2K・1枚）: `gemini-3-pro-image`（既定・いちばんきれい）US$0.134、
`gemini-nano-banana-2.1` US$0.05。全部で、前者が約 US$17（約2,700円）、後者が約 US$6.5。

## 手順

1. 一度だけ: Vertex AI の API を有効にする（無料。使った分だけ課金）
   `gcloud services enable aiplatform.googleapis.com --project shiplabjapan`
   （クレジットが別のアカウント/プロジェクトにあるなら、そのアカウントで `gcloud auth login` して、
   以降は `--account <メール> --project <プロジェクトID>` を付ける。gcloud の既定のアカウントは変えない）
2. 試し撮り（13枚、約 US$1.7）
   `node tools/art/generate.mjs --pilot`
3. 見た目を確認する（ゲームにはまだ入らない）
   `python tools/art/process.py`  → `tools/art/out/` に完成品と `_sheet_<group>.png`（一覧）
4. よければ全部作る。1枚につき複数案を作って選ぶなら `--variants 3`
   `node tools/art/generate.mjs --group items,equipment,banners,bg_screen,bg_battle,bg_region,bg_story --yes`
   `node tools/art/generate.mjs --group village,decor --variants 3 --yes`
5. 案を比べる: `python tools/art/process.py --compare` → `_compare_<group>.png`。
   選んだ案は `tools/art/pick.json`（例: `{ "village_castle_1": 2 }`）に書く。書かなければ1番目。
6. ゲームに入れる
   `python tools/art/process.py --install`  → `public/assets/` に書き込み

## メモ

- 何を作るか、プロンプト、画風の参考画像: `manifest.mjs`（ここを直すと作り直せる。`--force` で再生成）。
- すでに raw がある画像は作り直さない。気に入らないものは `tools/art/raw/<id>.png` を消すか `--only <id> --force`。
- `--dry` で、何も送らずに中身と費用の見込みだけ表示。
- 村の建物は、前のレベル（`pick.json` で選んだ案）の画像を参考に次のレベルを作る（同じ建物が育っていくように）。
  なので、村は低いレベルから順に作る（同じ実行内で自動的にその順になる）。
- 地面に敷くひし形が画像の左右いっぱいになるよう頼み、後処理で図形の外接矩形に切り詰める。ずれる場合は `BuildingDef.art`（scale / dy）で調整。
- `tools/art/raw/` と `tools/art/out/` は git に入れない。
