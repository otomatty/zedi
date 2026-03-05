# Railway development 環境 — 残作業計画書

**作成日:** 2026-02-28  
**最終更新:** 2026-02-28  
**目的:** development 環境を「全機能が動作する状態」にする

---

## 現在の状態

### サービス稼働状況（全て ✅ SUCCESS）

| サービス   | URL                                             |
| ---------- | ----------------------------------------------- |
| PostgreSQL | `postgres.railway.internal:5432`                |
| Redis      | `redis.railway.internal:6379`                   |
| API        | `https://api-development-b126.up.railway.app`   |
| Hocuspocus | `https://hocuspocus-development.up.railway.app` |

### 環境変数の状態（Polar まで ✅ 設定済み）

| 変数                     | 状態                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `DATABASE_URL`           | ✅ 設定済み（Railway 参照）                                       |
| `REDIS_URL`              | ✅ 設定済み（Railway 参照）                                       |
| `BETTER_AUTH_SECRET`     | ✅ 設定済み                                                       |
| `BETTER_AUTH_URL`        | ✅ 設定済み                                                       |
| `CORS_ORIGIN`            | ✅ 設定済み（`https://dev.zedi-note.app,http://localhost:30000`） |
| `PORT`                   | ✅ `3000`                                                         |
| `STORAGE_*`              | ✅ 設定済み                                                       |
| `GOOGLE_CLIENT_*`        | ✅ 設定済み                                                       |
| `GITHUB_CLIENT_*`        | ✅ 設定済み                                                       |
| `OPENAI_API_KEY`         | ✅ 設定済み                                                       |
| `ANTHROPIC_API_KEY`      | ✅ 設定済み                                                       |
| `GOOGLE_AI_API_KEY`      | ✅ 設定済み                                                       |
| `GOOGLE_CUSTOM_SEARCH_*` | ✅ 設定済み                                                       |
| `POLAR_ACCESS_TOKEN`     | ✅ 設定済み                                                       |
| `POLAR_WEBHOOK_SECRET`   | ✅ 設定済み                                                       |

### 完了済みタスク（タスク 0〜7）

- タスク 0: CORS_ORIGIN の修正
- タスク 1: Storage Bucket の作成
- タスク 2: Storage 環境変数の更新
- タスク 3: Google OAuth の設定
- タスク 4: GitHub OAuth の設定
- タスク 5: OAuth 環境変数の更新
- タスク 6: AI / 外部 API キーの設定
- タスク 7: Polar Webhook の設定（Polar Dashboard で Webhook URL 登録済み）

---

## 残作業一覧

| #   | タスク   | 種別             | 推定時間 | 状態                                       |
| --- | -------- | ---------------- | -------- | ------------------------------------------ |
| 8   | 動作検証 | 自動＋手動テスト | 1〜2時間 | **API 検証完了**（ブラウザ手動テスト待ち） |

**残り:** ブラウザでログインし、CRUD・アップロード・AI・リアルタイム・課金を手動確認する。

---

## タスク 8: 動作検証（次に実施）

以下「タスク 0〜7」は参照用（実施済み）。**次はタスク 8（動作検証）** に進む。

### 8.1 サービスの再デプロイ確認

環境変数の更新により自動再デプロイが走っている場合がある。デプロイ完了を確認:

```bash
railway link -p Zedi -e development
railway logs --service api --lines 10
railway logs --service hocuspocus --lines 10
```

### 8.2 ヘルスチェック

```bash
curl -s https://api-development-b126.up.railway.app/api/health
curl -s https://hocuspocus-development.up.railway.app/health
```

### 8.3 ローカルフロントエンドの接続

`.env` を以下に更新:

```
VITE_API_BASE_URL=https://api-development-b126.up.railway.app
VITE_REALTIME_URL=wss://hocuspocus-development.up.railway.app
```

```bash
npm run dev
```

### 8.4 動作確認チェックリスト

**認証（API レベル検証済み、ブラウザ手動テスト待ち）:**

- [x] `/api/auth/sign-in/social` (Google) → 200, 正しい client_id で Google OAuth にリダイレクト
- [x] `/api/auth/sign-in/social` (GitHub) → 200, 正しい client_id で GitHub OAuth にリダイレクト
- [x] `/api/auth/get-session` → `null`（未ログイン時の正常応答）
- [ ] ブラウザで Google ソーシャルログインが完了する
- [ ] ブラウザで GitHub ソーシャルログインが完了する
- [ ] ログアウトが正常に動作する
- [ ] ページリロード後もログイン状態が維持される

**API（基本・エンドポイント検証済み）:**

- [x] `/api/health` → 200 `{"status":"ok"}`
- [x] `/api/notes` → 401（認証必須 = 正常）
- [x] `/api/search` → 401（認証必須 = 正常）
- [x] `/api/ai/models` → 200（認証不要の公開エンドポイント）
- [ ] ブラウザでページの作成・取得・削除が動作する
- [ ] ブラウザでノートの CRUD が動作する
- [ ] ブラウザで検索が日本語で動作する（3文字以上）

**ファイルアップロード:**

- [ ] ブラウザでメディアファイルのアップロードが動作する
- [ ] アップロードしたファイルが表示される

**AI:**

- [ ] ブラウザで AI チャット（SSE ストリーミング）が動作する
- [ ] レート制限が機能する（Redis）

**リアルタイム:**

- [x] Hocuspocus `/health` → 200
- [ ] ブラウザで Hocuspocus WebSocket 接続が確立する
- [ ] 複数ブラウザタブでの共同編集が機能する

**課金:**

- [ ] ブラウザで Polar チェックアウトページに遷移できる

### タスク 8 実施結果（実施日: 2026-03-01）

| 項目                   | 結果                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| 8.1 サービス確認       | ✅ API / Hocuspocus ともに起動確認済み                                         |
| 8.2 ヘルスチェック     | ✅ API → 200, Hocuspocus → 200                                                 |
| 8.3 .env               | ✅ Railway development 用に設定済み、`npm run dev` で localhost:30000 起動確認 |
| 8.4 API 検証           | ✅ 全エンドポイントが期待どおりのステータスコードを返す                        |
| 8.4 OAuth フロー       | ✅ Google/GitHub ともに正しい client_id でリダイレクト URL を生成              |
| 8.4 ブラウザ手動テスト | ⏳ ログイン後の CRUD・アップロード・AI・リアルタイム・課金は手動確認待ち       |

**修正した問題:**

1. **Hono ルーティング修正** (`server/api/src/app.ts`): `/api/auth/**` → `/api/auth/:path{.+}` に変更。Hono の `*` は単一セグメントしかマッチしないため、`/api/auth/sign-in/social` のような複数セグメントパスが 404 になっていた。
2. **OAuth 環境変数**: `GOOGLE_CLIENT_*` / `GITHUB_CLIENT_*` が `placeholder` のままだったため、正しい値に更新。

**注意:** Hocuspocus ログに `NOAUTH Authentication required`（Redis）が出力されている。`/health` は 200 のためプロセスは稼働しているが、Redis 拡張が無効の可能性あり。共同編集の動作確認時に不具合が出る場合は、Hocuspocus サービスの `REDIS_URL`（Railway 参照 `${{Redis.REDIS_URL}}`）を確認すること。

**重要:** `railway up` でローカルコードをデプロイしたが、`develop` ブランチへの push は未実施。GitHub からの再デプロイでルーティング修正が消えないよう、早めに push すること。

---

## 参照: タスク 0〜7（実施済み）

以下は環境変数設定時の手順を参照用に残している。

### タスク 0: CORS_ORIGIN の修正

開発環境では **Cloudflare Pages（dev.zedi-note.app）** と **ローカル開発（localhost:30000）** の両方から API にアクセスできるように、`CORS_ORIGIN` をカンマ区切りで指定する。

**方法 A: CLI で設定**

```bash
railway link -p Zedi -e development

railway variable set "CORS_ORIGIN=https://dev.zedi-note.app,http://localhost:30000" --service api
```

**方法 B: CLI が使えない場合（ダッシュボードで設定）**

CLI で `railway variable set` を実行しても出力がなく終了する場合は、Railway ダッシュボードから設定する。

1. ブラウザで [railway.com](https://railway.com) にログインする。
2. プロジェクト **Zedi** を開く。
3. 左上の環境切り替えで **development** を選択する。
4. キャンバス上で **api** サービスをクリックする。
5. 上部タブの **Variables** を開く。
6. 既存の `CORS_ORIGIN` がある場合は行の右側の **⋯** → **Edit** で値を変更する。ない場合は **New Variable** をクリックする。
7. 変数名: `CORS_ORIGIN`  
   値: `https://dev.zedi-note.app,http://localhost:30000`  
   （カンマ区切り、スペースは入れてもよい）
8. **Add** または **Update** で保存する。
9. 画面に表示される **Staged changes** を確認し、**Deploy**（または **Redeploy**）を実行する。変数変更後は自動で再デプロイされる場合もある。

これで `https://dev.zedi-note.app` と `http://localhost:30000` の両方から API にアクセスできる。

---

## タスク 1: Storage Bucket の作成

**操作場所:** Railway Dashboard

1. https://railway.com → Zedi プロジェクト → **development** 環境を選択
2. Project Canvas 上で右クリック → 「Add New Service」→ 「Bucket」
3. 設定:
   - **リージョン:** API サービスと近いリージョン（`asia-southeast1` 推奨）
   - **表示名:** `media`
4. 作成完了後、「Credentials」タブを開く
5. 以下の 4 つの値をメモする:

| 項目                | 用途                      |
| ------------------- | ------------------------- |
| `ENDPOINT`          | S3 互換エンドポイント URL |
| `ACCESS_KEY_ID`     | アクセスキー              |
| `SECRET_ACCESS_KEY` | シークレットキー          |
| `BUCKET`            | バケット名                |

---

## タスク 2: Storage 環境変数の更新

タスク 1 で取得した値でプレースホルダーを置き換える。

```bash
railway link -p Zedi -e development

railway variable set \
  "STORAGE_ENDPOINT=<ENDPOINT の値>" \
  "STORAGE_ACCESS_KEY=<ACCESS_KEY_ID の値>" \
  "STORAGE_SECRET_KEY=<SECRET_ACCESS_KEY の値>" \
  "STORAGE_BUCKET_NAME=<BUCKET の値>" \
  --service api
```

> 変数更新後、API サービスが自動で再デプロイされる。

---

## タスク 3: Google OAuth の設定

**操作場所:** [Google Cloud Console](https://console.cloud.google.com/)

APIs & Services → Credentials → 既存の OAuth 2.0 クライアント ID を編集（または新規作成）

### 承認済みリダイレクト URI に追加

```
https://api-development-b126.up.railway.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

### 承認済みの JavaScript オリジンに追加

```
https://api-development-b126.up.railway.app
http://localhost:30000
http://localhost:3000
```

**取得するもの:** Client ID と Client Secret

> production 用の URI（`https://api.zedi-note.app/...`）はこの段階で一緒に追加しても構わない。

---

## タスク 4: GitHub OAuth の設定

**操作場所:** [GitHub Developer Settings](https://github.com/settings/developers) → OAuth Apps

**development 用の OAuth App を作成（または既存を編集）:**

| 項目                       | 値                                                                     |
| -------------------------- | ---------------------------------------------------------------------- |
| Application name           | `Zedi (dev)`                                                           |
| Homepage URL               | `http://localhost:30000`                                               |
| Authorization callback URL | `https://api-development-b126.up.railway.app/api/auth/callback/github` |

**取得するもの:** Client ID と Client Secret

> GitHub OAuth App は callback URL を 1 つしか設定できないため、production 用には別の OAuth App が必要。

---

## タスク 5: OAuth 環境変数の更新

タスク 3, 4 で取得した値を設定する。

```bash
railway link -p Zedi -e development

railway variable set \
  "GOOGLE_CLIENT_ID=<Google の Client ID>" \
  "GOOGLE_CLIENT_SECRET=<Google の Client Secret>" \
  "GITHUB_CLIENT_ID=<GitHub の Client ID>" \
  "GITHUB_CLIENT_SECRET=<GitHub の Client Secret>" \
  --service api
```

---

## タスク 6: AI / 外部 API キーの設定

### 6a. 既存の値を AWS Secrets Manager から取得

```bash
# AI 関連のシークレット
aws secretsmanager get-secret-value \
  --secret-id <AI_SECRETS_ARN> \
  --query SecretString --output text | jq .

# Polar 関連のシークレット
aws secretsmanager get-secret-value \
  --secret-id <POLAR_SECRET_ARN> \
  --query SecretString --output text | jq .
```

### 6b. Railway に設定

```bash
railway link -p Zedi -e development

railway variable set \
  "OPENAI_API_KEY=<値>" \
  "ANTHROPIC_API_KEY=<値>" \
  "GOOGLE_AI_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<値>" \
  "POLAR_ACCESS_TOKEN=<値>" \
  "POLAR_WEBHOOK_SECRET=<値>" \
  --service api
```

> **AWS CLI が使えない場合:** AWS Console → Secrets Manager から直接値を確認する。

---

## タスク 7: Polar Webhook URL の更新

**操作場所:** [Polar Dashboard](https://polar.sh/) → Settings → Webhooks

| 項目        | 値                                                               |
| ----------- | ---------------------------------------------------------------- |
| Webhook URL | `https://api-development-b126.up.railway.app/api/webhooks/polar` |
| Secret      | タスク 6 で設定した `POLAR_WEBHOOK_SECRET` と同じ値              |

---

## 作業フロー図

```
✅ タスク 0〜7: 完了済み（環境変数は Polar まで全て設定済み）
         ↓
→ タスク 8: 動作検証（次に実施）
```

---

## 補足: 環境変数の最終状態（✅ 達成済み）

タスク 0〜7 完了後、`api` サービスの環境変数は以下の状態になっている:

| 変数                             | 値の種別                                           |
| -------------------------------- | -------------------------------------------------- |
| `PORT`                           | `3000`                                             |
| `DATABASE_URL`                   | Railway 内部参照（自動）                           |
| `REDIS_URL`                      | Railway 内部参照（自動）                           |
| `BETTER_AUTH_SECRET`             | ランダム文字列（設定済み）                         |
| `BETTER_AUTH_URL`                | `https://api-development-b126.up.railway.app`      |
| `CORS_ORIGIN`                    | `https://dev.zedi-note.app,http://localhost:30000` |
| `STORAGE_ENDPOINT`               | Storage Bucket のエンドポイント                    |
| `STORAGE_ACCESS_KEY`             | Storage Bucket のアクセスキー                      |
| `STORAGE_SECRET_KEY`             | Storage Bucket のシークレットキー                  |
| `STORAGE_BUCKET_NAME`            | Storage Bucket のバケット名                        |
| `GOOGLE_CLIENT_ID`               | Google OAuth Client ID                             |
| `GOOGLE_CLIENT_SECRET`           | Google OAuth Client Secret                         |
| `GITHUB_CLIENT_ID`               | GitHub OAuth Client ID                             |
| `GITHUB_CLIENT_SECRET`           | GitHub OAuth Client Secret                         |
| `OPENAI_API_KEY`                 | OpenAI API キー                                    |
| `ANTHROPIC_API_KEY`              | Anthropic API キー                                 |
| `GOOGLE_AI_API_KEY`              | Google AI API キー                                 |
| `GOOGLE_CUSTOM_SEARCH_API_KEY`   | Google Custom Search API キー                      |
| `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` | Google Custom Search Engine ID                     |
| `POLAR_ACCESS_TOKEN`             | Polar アクセストークン                             |
| `POLAR_WEBHOOK_SECRET`           | Polar Webhook シークレット                         |
