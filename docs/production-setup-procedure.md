# Production 環境 構築作業手順書

> 作成日: 2026-03-02
> 対象: Railway + Cloudflare Pages + GitHub Actions

---

## 現状サマリ

### 完了済み

| 項目                         | 状態                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| Railway プロジェクト「Zedi」 | 作成済み                                                           |
| production 環境              | 作成済み                                                           |
| api-prod サービス            | 稼働中 (SUCCESS)                                                   |
| hocuspocus-prod サービス     | 稼働中 (SUCCESS)                                                   |
| Postgres-p3L9                | 稼働中 (PostgreSQL 17)                                             |
| Redis-GLIh                   | 稼働中 (本日追加)                                                  |
| REDIS_URL 接続               | api-prod, hocuspocus-prod 共に設定済み                             |
| カスタムドメイン             | api.zedi-note.app / realtime.zedi-note.app                         |
| Cloudflare DNS               | Terraform 管理済み                                                 |
| Cloudflare Pages             | zedi (prod) / zedi-dev (dev) 作成済み                              |
| CI ワークフロー              | ci.yml 正常動作                                                    |
| NODE_ENV=production          | 完了（api-prod / hocuspocus-prod に設定済み）                      |
| hocuspocus Redis 修正        | 完了（PR #173 作成済み。develop マージ後 main へマージで恒久反映） |

### 未完了・要対応

| 優先度 | 項目                                   | 影響                                                |
| ------ | -------------------------------------- | --------------------------------------------------- |
| **P1** | OAuth 認証情報 (placeholder)           | GitHub/Google ログイン不可                          |
| **P1** | ストレージ認証情報 (placeholder)       | メディアアップロード不可                            |
| **P1** | Polar 課金設定 未設定                  | Pro プラン購入不可                                  |
| **P2** | AI API キー 未設定                     | AI 機能（要約・検索等）利用不可                     |
| **P2** | GitHub Actions production 環境設定確認 | デプロイ自動化が正常動作するか確認                  |
| **P3** | Railway GitHub 連携設定確認            | main ブランチへのプッシュで自動デプロイされるか確認 |

---

## Phase 1: 緊急修正 (NODE_ENV + コード修正) — 完了

### 1-1. NODE_ENV=production の設定 — 完了

`NODE_ENV` が未設定のため、以下の重大な問題が発生していました（対応済み）:

- **認証**: Cookie が `sameSite: lax, secure: false` で設定され、クロスドメイン認証が失敗する
- **課金**: Polar が sandbox モードで動作し、本番決済ができない
- **セキュリティ**: development モードのセキュリティ設定が適用される

```bash
# api-prod に NODE_ENV を設定
railway variable set NODE_ENV=production --service api-prod

# hocuspocus-prod に NODE_ENV を設定
railway variable set NODE_ENV=production --service hocuspocus-prod
```

> 設定後、両サービスが自動再デプロイされる。ログで `Environment: production` を確認すること。  
> **確認済み**: api-prod / hocuspocus-prod ともに `Environment: production` を表示。

### 1-2. hocuspocus Redis 修正のコミット — 完了

`server/hocuspocus/src/index.ts` の `parseRedisOptions` 関数を修正済み。
`@hocuspocus/extension-redis` が `password` を `options` プロパティ内で受け取る仕様に合わせた。

```bash
git add server/hocuspocus/src/index.ts
git commit -m "fix: pass Redis password in options for @hocuspocus/extension-redis"
git push origin main
```

> Railway の GitHub 連携が有効なら自動デプロイされる。  
> **実施済み**: ブランチ保護のため `fix/hocuspocus-redis-auth` で PR #173 を作成。develop マージ後、main へマージすると恒久反映。

---

## Phase 2: Railway 環境変数の設定

### 2-1. OAuth 認証情報

GitHub と Google の OAuth アプリを **本番用に作成** し、以下を設定:

```bash
# GitHub OAuth (https://github.com/settings/applications/new)
# - Homepage URL: https://zedi-note.app
# - Callback URL: https://api.zedi-note.app/api/auth/callback/github
railway variable set GITHUB_CLIENT_ID=<実際の値> --service api-prod
railway variable set GITHUB_CLIENT_SECRET=<実際の値> --service api-prod

# Google OAuth (https://console.cloud.google.com/apis/credentials)
# - Authorized redirect URI: https://api.zedi-note.app/api/auth/callback/google
railway variable set GOOGLE_CLIENT_ID=<実際の値> --service api-prod
railway variable set GOOGLE_CLIENT_SECRET=<実際の値> --service api-prod
```

### 2-2. ストレージ (S3 互換)

メディアアップロード用の S3 互換ストレージを設定:

```bash
railway variable set STORAGE_ENDPOINT=<S3 エンドポイント URL> --service api-prod
railway variable set STORAGE_BUCKET_NAME=<バケット名> --service api-prod
railway variable set STORAGE_ACCESS_KEY=<アクセスキー> --service api-prod
railway variable set STORAGE_SECRET_KEY=<シークレットキー> --service api-prod
```

> dev 環境では Tigris (`t3.storageapi.dev`) を使用中。prod 用にも同様に作成するか、同じものを共有するか決定すること。

### 2-3. Polar 課金設定

```bash
# Polar ダッシュボード (https://polar.sh) から取得
railway variable set POLAR_ACCESS_TOKEN=<アクセストークン> --service api-prod
railway variable set POLAR_WEBHOOK_SECRET=<Webhook シークレット> --service api-prod
```

> Polar の Webhook URL を `https://api.zedi-note.app/api/webhook/polar` に設定すること。
> `NODE_ENV=production` が設定されていないと sandbox モードになるため、Phase 1-1 が前提。

### 2-4. AI API キー

```bash
# Google AI (Gemini)
railway variable set GOOGLE_AI_API_KEY=<キー> --service api-prod

# Google Custom Search (Web 検索機能用)
railway variable set GOOGLE_CUSTOM_SEARCH_API_KEY=<キー> --service api-prod
railway variable set GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<エンジンID> --service api-prod

# OpenAI (任意)
railway variable set OPENAI_API_KEY=<キー> --service api-prod

# Anthropic (任意)
railway variable set ANTHROPIC_API_KEY=<キー> --service api-prod

# OpenRouter (AI モデル価格同期用、任意)
railway variable set OPENROUTER_API_KEY=<キー> --service api-prod
```

### 2-5. その他

```bash
# AI モデル同期 API のシークレット
railway variable set SYNC_AI_MODELS_SECRET=<ランダム文字列> --service api-prod
```

---

## Phase 3: GitHub Actions 設定

### 3-1. production 環境の Secrets

GitHub リポジトリ Settings > Environments > `production` で以下を設定:

| Secret 名               | 値                                                        | 用途                            |
| ----------------------- | --------------------------------------------------------- | ------------------------------- |
| `DATABASE_URL`          | `postgresql://<user>:<password>@<host>:<port>/<database>` | マイグレーション実行 (外部 URL) |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API トークン                                   | Pages デプロイ                  |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID                                  | Pages デプロイ                  |

> `DATABASE_URL` にはRailway の **Public URL** (`DATABASE_PUBLIC_URL`) を使用すること。
> 内部 URL (`*.railway.internal`) は GitHub Actions からはアクセスできない。

### 3-2. production 環境の Variables

| Variable 名        | 値                             | 用途                             |
| ------------------ | ------------------------------ | -------------------------------- |
| `API_BASE_URL`     | `https://api.zedi-note.app`    | フロントエンド VITE_API_BASE_URL |
| `REALTIME_URL`     | `wss://realtime.zedi-note.app` | フロントエンド VITE_REALTIME_URL |
| `POLAR_MONTHLY_ID` | Polar Monthly Product ID       | フロントエンド                   |
| `POLAR_YEARLY_ID`  | Polar Yearly Product ID        | フロントエンド                   |

### 3-3. 動作確認

```bash
# main ブランチに空コミット or マージして、deploy-prod.yml が正常動作するか確認
# ワークフロー: migrate → deploy-frontend
```

---

## Phase 4: Railway GitHub 連携

### 4-1. api-prod の GitHub 連携確認

Railway Dashboard > Zedi > api-prod > Settings で以下を確認:

| 設定項目       | 値              |
| -------------- | --------------- |
| Source Repo    | `otomatty/zedi` |
| Branch         | `main`          |
| Root Directory | `/server/api`   |
| Auto Deploy    | ON              |

### 4-2. hocuspocus-prod の GitHub 連携確認

Railway Dashboard > Zedi > hocuspocus-prod > Settings で以下を確認:

| 設定項目       | 値                   |
| -------------- | -------------------- |
| Source Repo    | `otomatty/zedi`      |
| Branch         | `main`               |
| Root Directory | `/server/hocuspocus` |
| Auto Deploy    | ON                   |

> 現在の prod デプロイが CLI アップロード (`railway up`) ベースになっている可能性あり。
> GitHub 連携が設定されていれば、main への push で自動的にビルド・デプロイされる。

---

## Phase 5: 統合テスト

### 5-1. ヘルスチェック

```bash
# API ヘルスチェック
curl -s https://api.zedi-note.app/api/health

# Hocuspocus ヘルスチェック
curl -s https://realtime.zedi-note.app/health
```

### 5-2. 機能テスト

| テスト項目            | 確認内容                                                     |
| --------------------- | ------------------------------------------------------------ |
| ユーザー登録/ログイン | GitHub OAuth / Google OAuth で認証できる                     |
| ノート作成・編集      | TipTap エディタが正常動作する                                |
| リアルタイム同期      | WebSocket 接続が `wss://realtime.zedi-note.app` に確立される |
| メディアアップロード  | 画像等のファイルアップロードが S3 に保存される               |
| AI 機能               | AI チャット・要約等が動作する                                |
| Pro プラン            | Polar での購入フローが本番モードで動作する                   |
| Cookie / セッション   | HTTPS で secure cookie が正しく設定される                    |

### 5-3. ログ確認

```bash
railway logs --service api-prod --lines 50
railway logs --service hocuspocus-prod --lines 50
```

出力に以下が含まれることを確認:

- `Environment: production`
- `[Redis] Extension enabled`
- エラーログが出ていないこと

---

## 補足: 環境変数 比較表 (dev vs prod)

| 変数名                           | dev      | prod        | 状態       |
| -------------------------------- | -------- | ----------- | ---------- |
| `DATABASE_URL`                   | 設定済み | 設定済み    | OK         |
| `REDIS_URL`                      | 設定済み | 設定済み    | OK         |
| `BETTER_AUTH_SECRET`             | 設定済み | 設定済み    | OK         |
| `BETTER_AUTH_URL`                | 設定済み | 設定済み    | OK         |
| `CORS_ORIGIN`                    | 設定済み | 設定済み    | OK         |
| `PORT`                           | 3000     | 3000        | OK         |
| `NODE_ENV`                       | (未設定) | 設定済み    | 完了       |
| `GITHUB_CLIENT_ID`               | 設定済み | placeholder | **要設定** |
| `GITHUB_CLIENT_SECRET`           | 設定済み | placeholder | **要設定** |
| `GOOGLE_CLIENT_ID`               | 設定済み | placeholder | **要設定** |
| `GOOGLE_CLIENT_SECRET`           | 設定済み | placeholder | **要設定** |
| `STORAGE_ENDPOINT`               | 設定済み | placeholder | **要設定** |
| `STORAGE_BUCKET_NAME`            | 設定済み | placeholder | **要設定** |
| `STORAGE_ACCESS_KEY`             | 設定済み | placeholder | **要設定** |
| `STORAGE_SECRET_KEY`             | 設定済み | placeholder | **要設定** |
| `GOOGLE_AI_API_KEY`              | 設定済み | 未設定      | **要設定** |
| `GOOGLE_CUSTOM_SEARCH_API_KEY`   | 設定済み | 未設定      | **要設定** |
| `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` | 設定済み | 未設定      | **要設定** |
| `OPENAI_API_KEY`                 | 設定済み | 未設定      | **要設定** |
| `ANTHROPIC_API_KEY`              | 設定済み | 未設定      | **要設定** |
| `OPENROUTER_API_KEY`             | 設定済み | 未設定      | 任意       |
| `POLAR_ACCESS_TOKEN`             | 設定済み | 未設定      | **要設定** |
| `POLAR_WEBHOOK_SECRET`           | 設定済み | 未設定      | **要設定** |
| `SYNC_AI_MODELS_SECRET`          | 設定済み | 未設定      | **要設定** |

### hocuspocus-prod 変数

| 変数名             | dev      | prod     | 状態 |
| ------------------ | -------- | -------- | ---- |
| `DATABASE_URL`     | 設定済み | 設定済み | OK   |
| `REDIS_URL`        | 設定済み | 設定済み | OK   |
| `API_INTERNAL_URL` | 設定済み | 設定済み | OK   |
| `PORT`             | 1234     | 1234     | OK   |

---

## アーキテクチャ図

```text
                          ┌─────────────────────────────────────┐
                          │        GitHub (otomatty/zedi)       │
                          │                                     │
                          │  main ──────┬──── push ────────────────→ GitHub Actions
                          │             │                       │     deploy-prod.yml
                          │             │                       │     ├─ migrate (Drizzle)
                          │             ▼                       │     └─ deploy-frontend
                          │    Railway GitHub Integration       │          ↓
                          │    ├─ api-prod (auto deploy)        │     Cloudflare Pages
                          │    └─ hocuspocus-prod (auto deploy) │     (zedi-note.app)
                          └─────────────────────────────────────┘

┌─────────────────┐      ┌─────────────────────────────────────────────┐
│  Cloudflare     │      │              Railway (production)           │
│                 │      │                                             │
│  zedi-note.app  │─────→│  api-prod         (api.zedi-note.app:3000)  │
│  (Pages SPA)    │      │  hocuspocus-prod  (realtime...:1234)        │
│                 │      │  Postgres-p3L9    (internal:5432)           │
│  DNS:           │      │  Redis-GLIh       (internal:6379)           │
│  api.→Railway   │      │                                             │
│  realtime.→Rail │      └─────────────────────────────────────────────┘
└─────────────────┘
```
