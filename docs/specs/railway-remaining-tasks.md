# Railway 移行 — 残タスク作業計画書

**作成日:** 2026-02-25
**最終更新:** 2026-02-27
**前提:** コード変更 (Phase 1〜7) は完了済み。本ドキュメントは、コード外のインフラ構築・設定・データ移行・検証タスクをまとめたものである。

**ツール:**

- Railway CLI v4.30.5（認証済み）
- Railway MCP Server（Cursor に設定済み）
- Railway Skills（インストール済み）

---

## 全体フロー

```text
Step 1: ローカル動作確認
  ↓
Step 2: Railway サービス作成 (development 環境) ← CLI で自動化
  ↓  PostgreSQL → Redis → Storage Bucket → API → Hocuspocus の順に作成
  ↓  作成と同時に環境変数も CLI で設定する
  ↓
Step 3: OAuth プロバイダー設定 (開発用コールバック URL 追加)
  ↓
Step 4: development 環境のデプロイ & 動作検証
  ↓
Step 5: Cloudflare Pages セットアップ
  ↓
Step 6: production 環境の構築 (Step 2 を本番用に繰り返す) ← CLI で自動化
  ↓
Step 7: データ移行 (Aurora → Railway PostgreSQL)
  ↓
Step 8: DNS 切り替え & 本番検証
  ↓
Step 9: 移行後タスク (AWS リソース削除等)
```

---

## コード変更の完了状況

| フェーズ | 内容                                                                  | 状態    |
| -------- | --------------------------------------------------------------------- | ------- |
| Phase 1  | 基盤準備 — ディレクトリ構造、Docker、railway.json                     | ✅ 完了 |
| Phase 2  | API 移行 — Hono Node.js、DB接続、Better Auth、全ルート移植            | ✅ 完了 |
| Phase 3  | フロントエンド移行 — Better Auth クライアント、useAuth、SSE           | ✅ 完了 |
| Phase 4  | Hocuspocus 移行 — Better Auth セッション検証                          | ✅ 完了 |
| Phase 6  | CI/CD — GitHub Actions ワークフロー書き換え                           | ✅ 完了 |
| Phase 7  | クリーンアップ — Terraform 削除、AWS 依存削除、pg_bigm → pg_trgm 移行 | ✅ 完了 |

---

## Railway 環境の現状

| 項目           | 状態                             |
| -------------- | -------------------------------- |
| プロジェクト   | `Zedi`（作成済み）               |
| 環境           | `production`, `development` 存在 |
| サービス       | 未作成                           |
| CLI 認証       | Akimasa Sugai でログイン済み     |
| MCP Server     | Cursor に設定済み                |
| Railway Skills | インストール済み                 |

---

## Step 1: ローカル動作確認

**推定: 0.5日**
**目的:** Railway にデプロイする前に、ローカルで全体が動くことを確認する。

### 1.1 依存関係のインストール

```bash
npm install
cd server/api && npm install
cd ../hocuspocus && npm install
```

### 1.2 docker-compose でバックエンドを起動

```bash
docker-compose -f docker-compose.dev.yml up --build
```

起動するサービス:

- **PostgreSQL** (localhost:5432) — 標準イメージ + pg_trgm 拡張
- **Redis** (localhost:6379) — セッション / レート制限
- **API** (localhost:3000) — Hono サーバー
- **Hocuspocus** (localhost:1234) — Y.js WebSocket

### 1.3 フロントエンドを起動

```bash
npm run dev
```

### 1.4 動作確認チェックリスト

- [ ] http://localhost:3000/api/health が `200` を返す
- [ ] http://localhost:5173 でフロントエンドが表示される
- [ ] Better Auth のエンドポイント (`/api/auth/session`) が応答する
- [ ] PostgreSQL に接続できる

---

## Step 2: Railway サービス作成 (development 環境)

**推定: 0.5日**
**目的:** Railway 上に全サービスを CLI で構築する。まず development 環境で動作確認してから production に進む。

### 2.1 development 環境にリンク

```bash
railway link -p Zedi -e development
```

### 2.2 PostgreSQL の作成

```bash
railway add -d postgres
```

> **デプロイ完了の確認:** `railway service status` で PostgreSQL が `Running` になるまで待つ。

**pg_trgm 拡張の有効化（ダッシュボード）:**

PostgreSQL の拡張インストールは CLI では実行できないため、以下のいずれかで対応する:

- **方法 A（推奨）:** Railway Dashboard → PostgreSQL サービス → Data タブ → Extensions で `pg_trgm` を有効化
- **方法 B:** `railway connect Postgres` で psql に接続し、`CREATE EXTENSION IF NOT EXISTS pg_trgm;` を実行

### 2.3 Redis の作成

```bash
railway add -d redis
```

### 2.4 Storage Bucket の作成（ダッシュボード）

Storage Bucket は CLI からの作成に対応していないため、ダッシュボードで作成する:

1. Railway Dashboard → Project Canvas → 右クリック → 「Add New Service」→ 「Bucket」
2. リージョンを選択（API サービスに近いリージョン）
3. 表示名を `media` に設定
4. 「Credentials」タブで以下の値を確認:
   - `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `BUCKET`

### 2.5 API サービスの作成

```bash
railway add --repo otomatty/zedi --service api
```

> **重要:** Root Directory の設定は CLI ではできないため、ダッシュボードで設定する:
> Railway Dashboard → `api` サービス → Settings → Source → Root Directory を `/server/api` に変更

**ドメインの生成:**

```bash
railway domain --service api --port 3000
```

### 2.6 API サービスの環境変数設定

サービス間参照と基本変数を一括設定:

```bash
railway variable set \
  "PORT=3000" \
  "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  "REDIS_URL=\${{Redis.REDIS_URL}}" \
  "STORAGE_ENDPOINT=\${{media.ENDPOINT}}" \
  "STORAGE_ACCESS_KEY=\${{media.ACCESS_KEY_ID}}" \
  "STORAGE_SECRET_KEY=\${{media.SECRET_ACCESS_KEY}}" \
  "STORAGE_BUCKET_NAME=\${{media.BUCKET}}" \
  "CORS_ORIGIN=http://localhost:5173" \
  --service api \
  --skip-deploys
```

Better Auth の設定:

```bash
# シークレットの生成
BETTER_AUTH_SECRET=$(openssl rand -base64 32)

# API ドメインは railway domain で生成済みのものを使用
railway variable set \
  "BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}" \
  "BETTER_AUTH_URL=https://<api-の-railway-ドメイン>" \
  --service api \
  --skip-deploys
```

OAuth（Step 3 完了後に設定）:

```bash
railway variable set \
  "GOOGLE_CLIENT_ID=<値>" \
  "GOOGLE_CLIENT_SECRET=<値>" \
  "GITHUB_CLIENT_ID=<値>" \
  "GITHUB_CLIENT_SECRET=<値>" \
  --service api \
  --skip-deploys
```

AI / 外部 API キー（AWS Secrets Manager から取得して設定）:

```bash
# まず AWS から既存の値を取得
aws secretsmanager get-secret-value \
  --secret-id <AI_SECRETS_ARN> \
  --query SecretString --output text | jq .

# 取得した値を設定
railway variable set \
  "OPENAI_API_KEY=<値>" \
  "ANTHROPIC_API_KEY=<値>" \
  "GOOGLE_AI_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<値>" \
  "POLAR_ACCESS_TOKEN=<値>" \
  "POLAR_WEBHOOK_SECRET=<値>" \
  --service api \
  --skip-deploys
```

> **`--skip-deploys` について:** 環境変数を設定するたびに自動デプロイが走るのを防ぐ。全変数の設定が完了してから手動でデプロイする。

### 2.7 Hocuspocus サービスの作成

```bash
railway add --repo otomatty/zedi --service hocuspocus
```

> **Root Directory の設定（ダッシュボード）:**
> Railway Dashboard → `hocuspocus` サービス → Settings → Source → Root Directory を `/server/hocuspocus` に変更

**ドメインの生成:**

```bash
railway domain --service hocuspocus --port 1234
```

### 2.8 Hocuspocus サービスの環境変数設定

```bash
railway variable set \
  "PORT=1234" \
  "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  "REDIS_URL=\${{Redis.REDIS_URL}}" \
  "API_INTERNAL_URL=http://api.railway.internal:3000" \
  --service hocuspocus \
  --skip-deploys
```

> **Private Networking:** `api.railway.internal` は Railway の内部 DNS 名。API サービスのサービス名が `api` の場合に自動解決される。

### 2.9 Drizzle マイグレーションの実行

```bash
cd server/api

# DATABASE_URL を Railway から取得して実行
DATABASE_URL=$(railway variable list --service Postgres -k | grep DATABASE_URL | cut -d= -f2-)
DATABASE_URL="${DATABASE_URL}" npx drizzle-kit generate
DATABASE_URL="${DATABASE_URL}" npx drizzle-kit migrate
```

> **外部接続:** Railway PostgreSQL に外部接続するには、ダッシュボードの PostgreSQL サービス → Settings → Networking → TCP Proxy を有効にする。

### 2.10 pg_trgm GIN インデックスの作成

```bash
railway connect Postgres
```

psql シェルで以下を実行:

```sql
CREATE INDEX IF NOT EXISTS idx_page_contents_text_trgm
  ON page_contents USING gin (content_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pages_title_trgm
  ON pages USING gin (title gin_trgm_ops);
```

### 2.11 デプロイ

```bash
# API サービスのデプロイ
railway up --service api --detach

# Hocuspocus サービスのデプロイ
railway up --service hocuspocus --detach
```

**ビルドログの確認:**

```bash
railway logs --service api --build --lines 50
railway logs --service hocuspocus --build --lines 50
```

**ヘルスチェック:**

```bash
curl https://<api-ドメイン>/api/health
curl https://<hocuspocus-ドメイン>/health
```

### Step 2 でダッシュボードが必要な操作まとめ

| 操作                                    | 理由                                     |
| --------------------------------------- | ---------------------------------------- |
| Storage Bucket の作成                   | CLI 未対応                               |
| Root Directory の設定 (api, hocuspocus) | CLI 未対応                               |
| pg_trgm 拡張の有効化                    | CLI 未対応（`railway connect` で代替可） |
| TCP Proxy の有効化                      | CLI 未対応                               |

---

## Step 3: OAuth プロバイダーの設定

**推定: 0.5日**
**目的:** Google / GitHub ソーシャルログインのコールバック URL を更新する。

### 3.1 Google OAuth

[Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials:

1. 既存の OAuth 2.0 クライアント ID を編集（または新規作成）
2. **承認済みリダイレクト URI** に追加:
   - `https://<api-の-railway-ドメイン>/api/auth/callback/google`（development）
   - `http://localhost:3000/api/auth/callback/google`（ローカル開発）
   - `https://api.zedi-note.app/api/auth/callback/google`（production、後で追加可）
3. **承認済みの JavaScript オリジン** に追加:
   - `https://<api-の-railway-ドメイン>`
   - `http://localhost:5173`
   - `http://localhost:3000`
4. Client ID / Client Secret を取得
5. CLI で環境変数を設定:

```bash
railway variable set \
  "GOOGLE_CLIENT_ID=<Client ID>" \
  "GOOGLE_CLIENT_SECRET=<Client Secret>" \
  --service api
```

### 3.2 GitHub OAuth

[GitHub](https://github.com/settings/developers) > Settings > Developer settings > OAuth Apps:

1. 既存アプリを編集（または新規作成）
2. **Homepage URL**: `http://localhost:5173`
3. **Authorization callback URL**: `https://<api-の-railway-ドメイン>/api/auth/callback/github`
4. Client ID / Client Secret を取得
5. CLI で環境変数を設定:

```bash
railway variable set \
  "GITHUB_CLIENT_ID=<Client ID>" \
  "GITHUB_CLIENT_SECRET=<Client Secret>" \
  --service api
```

> **注意:** GitHub OAuth App は callback URL を1つしか設定できない。development / production で切り替えるか、2つの OAuth App を作成する。

### 3.3 Polar Webhook URL

Polar Dashboard > Settings > Webhooks:

1. Webhook URL: `https://<api-の-railway-ドメイン>/api/webhooks/polar`
2. Webhook Secret は Step 2.6 で設定済み

---

## Step 4: development 環境のテスト

**推定: 0.5日**
**目的:** production に進む前に development 環境で全機能が動作することを確認する。

### 4.1 ローカルフロントエンドからの接続テスト

`.env` を Railway の development API URL に変更:

```bash
VITE_API_BASE_URL=https://<api-の-railway-ドメイン>
VITE_REALTIME_URL=wss://<hocuspocus-の-railway-ドメイン>
```

```bash
npm run dev
```

### 4.2 デプロイ状態の確認（CLI）

```bash
railway service status
railway logs --service api --lines 20
railway logs --service hocuspocus --lines 20
```

### 4.3 動作確認チェックリスト

**認証:**

- [ ] Google ソーシャルログインが機能する
- [ ] GitHub ソーシャルログインが機能する
- [ ] ログアウトが正常に動作する
- [ ] セッション Cookie が正しく設定される
- [ ] ページリロード後もログイン状態が維持される

**API:**

- [ ] `/api/health` が 200 を返す
- [ ] ページの作成・取得・削除が動作する
- [ ] ノートの CRUD が動作する
- [ ] 検索 (pg_trgm + ILIKE) が日本語で動作する（3文字以上入力）
- [ ] メディアアップロード (presigned URL) が動作する
- [ ] サムネイル画像検索・生成・コミットが動作する

**AI:**

- [ ] AI チャット (非ストリーミング) が動作する
- [ ] AI チャット (SSE ストリーミング) が動作する
- [ ] 使用量のトラッキングが正しい
- [ ] レート制限 (Redis) が機能する

**リアルタイム:**

- [ ] Hocuspocus WebSocket 接続が確立する
- [ ] 複数ブラウザでの共同編集が機能する
- [ ] ドキュメントの永続化 (PostgreSQL) が動作する

**課金:**

- [ ] Polar チェックアウトが動作する
- [ ] Webhook が正しく処理される

---

## Step 5: Cloudflare Pages セットアップ

**推定: 0.5日**
**目的:** フロントエンドを Cloudflare Pages にデプロイする。

### 5.1 プロジェクト作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) > Workers & Pages > Create
2. 「Pages」タブ → 「Connect to Git」
3. GitHub リポジトリ `otomatty/zedi` を選択
4. ビルド設定:
   - **Framework preset**: None
   - **Build command**: `npm ci && npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. 環境変数 (Production):

```dotenv
VITE_API_BASE_URL=https://api.zedi-note.app
VITE_REALTIME_URL=wss://realtime.zedi-note.app
VITE_POLAR_PRO_MONTHLY_PRODUCT_ID=<Polar から取得>
VITE_POLAR_PRO_YEARLY_PRODUCT_ID=<Polar から取得>
```

### 5.2 カスタムドメイン設定

1. Pages プロジェクト > Custom domains
2. `zedi-note.app` を追加
3. DNS レコードを設定（Cloudflare DNS なら自動）

---

## Step 6: production 環境の構築

**推定: 0.5日**
**目的:** Step 2 と同じ手順を production 環境で CLI から実施する。

### 6.1 production 環境にリンク

```bash
railway link -p Zedi -e production
```

### 6.2 サービスの一括作成

```bash
# PostgreSQL
railway add -d postgres

# Redis
railway add -d redis

# Storage Bucket → ダッシュボードで作成（Step 2.4 と同手順）

# API サービス
railway add --repo otomatty/zedi --service api-prod
# → ダッシュボードで Root Directory を /server/api に設定

# Hocuspocus サービス
railway add --repo otomatty/zedi --service hocuspocus-prod
# → ダッシュボードで Root Directory を /server/hocuspocus に設定
```

### 6.3 ドメインの設定

**Railway 自動ドメイン:**

```bash
railway domain --service api-prod --port 3000
railway domain --service hocuspocus-prod --port 1234
```

**カスタムドメイン:**

```bash
railway domain api.zedi-note.app --service api-prod --port 3000
railway domain realtime.zedi-note.app --service hocuspocus-prod --port 1234
```

> カスタムドメインを設定すると、必要な DNS レコード（CNAME）が表示される。Cloudflare DNS にそのレコードを追加する。

### 6.4 環境変数の設定

development との差分に注意して設定:

```bash
# Better Auth (production 用の別シークレット)
BETTER_AUTH_SECRET_PROD=$(openssl rand -base64 32)

railway variable set \
  "PORT=3000" \
  "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  "REDIS_URL=\${{Redis.REDIS_URL}}" \
  "STORAGE_ENDPOINT=\${{media.ENDPOINT}}" \
  "STORAGE_ACCESS_KEY=\${{media.ACCESS_KEY_ID}}" \
  "STORAGE_SECRET_KEY=\${{media.SECRET_ACCESS_KEY}}" \
  "STORAGE_BUCKET_NAME=\${{media.BUCKET}}" \
  "BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET_PROD}" \
  "BETTER_AUTH_URL=https://api.zedi-note.app" \
  "CORS_ORIGIN=https://zedi-note.app,https://admin.zedi-note.app" \
  --service api-prod \
  --skip-deploys
```

```bash
# OAuth / AI / Polar キー（development と同じ値を再設定）
railway variable set \
  "GOOGLE_CLIENT_ID=<値>" \
  "GOOGLE_CLIENT_SECRET=<値>" \
  "GITHUB_CLIENT_ID=<値>" \
  "GITHUB_CLIENT_SECRET=<値>" \
  "OPENAI_API_KEY=<値>" \
  "ANTHROPIC_API_KEY=<値>" \
  "GOOGLE_AI_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<値>" \
  "POLAR_ACCESS_TOKEN=<値>" \
  "POLAR_WEBHOOK_SECRET=<値>" \
  --service api-prod \
  --skip-deploys
```

```bash
# Hocuspocus
railway variable set \
  "PORT=1234" \
  "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  "REDIS_URL=\${{Redis.REDIS_URL}}" \
  "API_INTERNAL_URL=http://api.railway.internal:3000" \
  --service hocuspocus-prod \
  --skip-deploys
```

| 変数              | development                                        | production                                          |
| ----------------- | -------------------------------------------------- | --------------------------------------------------- |
| `BETTER_AUTH_URL` | `https://<dev-api-ドメイン>`                       | `https://api.zedi-note.app`                         |
| `CORS_ORIGIN`     | `https://dev.zedi-note.app,http://localhost:30000` | `https://zedi-note.app,https://admin.zedi-note.app` |

| `BETTER_AUTH_SECRET` | 開発用の値 | **別のランダム値** |

### 6.4.1 管理画面用 CORS（本番）

本番 API の `CORS_ORIGIN` には管理者ドメイン `https://admin.zedi-note.app` を必ず含める。上記 6.4 の設定例のとおり `https://zedi-note.app,https://admin.zedi-note.app` とする。

### 6.5 OAuth コールバック URL の追加

Step 3 の手順で production 用のコールバック URL を追加:

- Google: `https://api.zedi-note.app/api/auth/callback/google`
- GitHub: `https://api.zedi-note.app/api/auth/callback/github`
- Polar Webhook: `https://api.zedi-note.app/api/webhooks/polar`

### 6.6 GitHub Secrets / Variables の設定

GitHub リポジトリの Settings > Secrets and variables > Actions:

**Secrets:**

| 名前                    | 値                                   | 用途                   |
| ----------------------- | ------------------------------------ | ---------------------- |
| `RAILWAY_TOKEN`         | Railway Dashboard > Account > Tokens | Railway CLI デプロイ   |
| `PROD_DATABASE_URL`     | production の PostgreSQL 接続 URL    | CI/CD マイグレーション |
| `DEV_DATABASE_URL`      | development の PostgreSQL 接続 URL   | CI/CD マイグレーション |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Dashboard で生成          | Pages デプロイ         |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard で確認          | Pages デプロイ         |

**Variables:**

| 名前                | 値                             |
| ------------------- | ------------------------------ |
| `PROD_API_BASE_URL` | `https://api.zedi-note.app`    |
| `PROD_REALTIME_URL` | `wss://realtime.zedi-note.app` |
| `POLAR_MONTHLY_ID`  | Polar 月額プロダクト ID        |
| `POLAR_YEARLY_ID`   | Polar 年額プロダクト ID        |

### 6.7 Drizzle マイグレーション & インデックス作成

```bash
cd server/api

# production の DATABASE_URL を使用
DATABASE_URL="<production の DATABASE_URL>" npx drizzle-kit generate
DATABASE_URL="<production の DATABASE_URL>" npx drizzle-kit migrate
```

```bash
# pg_trgm インデックスの作成
railway link -p Zedi -e production
railway connect Postgres
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_page_contents_text_trgm
  ON page_contents USING gin (content_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pages_title_trgm
  ON pages USING gin (title gin_trgm_ops);
```

### 6.8 デプロイ & 確認

```bash
railway up --service api-prod --detach
railway up --service hocuspocus-prod --detach

# ビルドログ確認
railway logs --service api-prod --build --lines 50
railway logs --service hocuspocus-prod --build --lines 50

# ヘルスチェック
curl https://api.zedi-note.app/api/health
curl https://realtime.zedi-note.app/health
```

### 6.9 バックアップ設定（ダッシュボード）

1. PostgreSQL Volume → Backups タブ
2. **production:** Daily + Weekly
3. **development:** Weekly のみ

---

## Step 7: データ移行

**推定: 1日**
**目的:** Aurora のデータを Railway PostgreSQL に移行する。

### 7.1 Aurora のバックアップ取得

```bash
pg_dump \
  --host=<aurora-cluster-endpoint> \
  --port=5432 \
  --username=<username> \
  --dbname=zedi \
  --format=custom \
  --file=zedi-aurora-backup.dump
```

### 7.2 Railway PostgreSQL へのインポート

```bash
pg_restore \
  --host=<railway-postgres-host> \
  --port=<railway-postgres-port> \
  --username=<username> \
  --dbname=railway \
  --data-only \
  --disable-triggers \
  zedi-aurora-backup.dump
```

### 7.3 ユーザーデータの Better Auth マッピング

```bash
railway connect Postgres
```

```sql
INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
SELECT
  id::text,
  COALESCE(display_name, email),
  email,
  true,
  avatar_url,
  created_at,
  updated_at
FROM users
ON CONFLICT (id) DO NOTHING;

INSERT INTO "account" (id, user_id, account_id, provider_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  id::text,
  cognito_sub,
  CASE
    WHEN cognito_sub LIKE 'google_%' THEN 'google'
    WHEN cognito_sub LIKE 'GitHub_%' THEN 'github'
    ELSE 'google'
  END,
  created_at,
  updated_at
FROM users
WHERE cognito_sub IS NOT NULL
ON CONFLICT DO NOTHING;
```

> **最大リスク: UUID → TEXT の型変換**
>
> Better Auth の `user.id` は TEXT 型だが、既存テーブルの `owner_id` は UUID 型の FK。
> 対応方針:
>
> 1. 既存 UUID の `users.id` を文字列として `user.id` にコピー
> 2. FK の型を UUID → TEXT に変更するマイグレーションを追加
> 3. または Better Auth の id 生成を UUID にカスタマイズする

### 7.4 S3 → Railway Storage Buckets のファイル移行

```bash
aws s3 sync s3://<media-bucket> ./s3-media-backup/
aws s3 sync s3://<thumbnail-bucket> ./s3-thumbnail-backup/

aws s3 sync ./s3-media-backup/ s3://<railway-bucket-name>/ \
  --endpoint-url https://storage.railway.app
aws s3 sync ./s3-thumbnail-backup/ s3://<railway-bucket-name>/ \
  --endpoint-url https://storage.railway.app
```

### 7.5 データ整合性チェック

```bash
railway connect Postgres
```

```sql
SELECT 'user' AS table_name, COUNT(*) FROM "user"
UNION ALL SELECT 'pages', COUNT(*) FROM pages
UNION ALL SELECT 'notes', COUNT(*) FROM notes
UNION ALL SELECT 'page_contents', COUNT(*) FROM page_contents
UNION ALL SELECT 'media', COUNT(*) FROM media
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions;
```

---

## Step 8: 本番デプロイ & DNS 切り替え

**推定: 0.5日**

### 8.1 DNS TTL の事前短縮

```
api.zedi-note.app      TTL=300 (5分)
realtime.zedi-note.app TTL=300 (5分)
```

### 8.2 デプロイ

1. `main` ブランチにコードをマージ
2. GitHub Actions `deploy-prod.yml` が自動実行:
   - Drizzle マイグレーション
   - Railway に API / Hocuspocus をデプロイ
   - Cloudflare Pages にフロントエンドをデプロイ

### 8.3 DNS 切り替え

1. `api.zedi-note.app` → Railway CNAME に切り替え
2. `realtime.zedi-note.app` → Railway CNAME に切り替え
3. `zedi-note.app` → Cloudflare Pages（Step 5 で設定済み）

### 8.4 本番動作確認

Step 4.3 のチェックリストを production 環境で再実施する。

**CLI での確認:**

```bash
railway link -p Zedi -e production
railway service status
railway logs --service api-prod --lines 20 --filter "@level:error"
railway logs --service hocuspocus-prod --lines 20 --filter "@level:error"
```

---

## Step 9: 移行後タスク

**推定: 0.5日**

### 9.1 ユーザーへの通知

- 全ユーザーに Google/GitHub での再ログインが必要であることを通知
- Cognito セッションは使えなくなる

### 9.2 モニタリング設定

Railway のメトリクス・ログ監視を設定:

```bash
# エラーログの監視
railway logs --service api-prod --filter "@level:error" --since 1h
railway logs --service hocuspocus-prod --filter "@level:error" --since 1h
```

### 9.3 AWS リソースの段階的削除

**安定稼働確認後（最低1週間）:**

1. CloudFront ディストリビューションの無効化
2. API Gateway の無効化
3. Lambda 関数の削除
4. ECS Fargate サービスの削除
5. Aurora Serverless v2 の停止 → 最終バックアップ → 削除
6. ElastiCache Redis の削除
7. Cognito User Pool の削除（全ユーザーの再認証完了後）
8. S3 バケットの空化 → 削除
9. VPC / NAT Gateway / その他リソースの削除
10. Terraform State ファイルのアーカイブ

---

## タイムライン総括

| Step     | 作業                       | 推定所要時間 | 自動化度         |
| -------- | -------------------------- | ------------ | ---------------- |
| 1        | ローカル動作確認           | 0.5日        | —                |
| 2        | Railway セットアップ (dev) | 0.5日        | CLI で大部分自動 |
| 3        | OAuth 設定                 | 0.5日        | 手動（外部SaaS） |
| 4        | development 環境テスト     | 0.5日        | 手動テスト       |
| 5        | Cloudflare Pages           | 0.5日        | 手動（初回のみ） |
| 6        | production 環境構築        | 0.5日        | CLI で大部分自動 |
| 7        | データ移行                 | 1日          | 半自動           |
| 8        | DNS 切り替え & 本番検証    | 0.5日        | 手動             |
| 9        | 移行後タスク               | 0.5日        | 手動             |
| **合計** |                            | **約5日**    |                  |

> Step 2, 6 は CLI 活用により、旧計画から各 0.5日 短縮。

---

## CLI コマンド早見表

```bash
# プロジェクトのリンク
railway link -p Zedi -e <environment>

# データベース追加
railway add -d postgres
railway add -d redis

# GitHub リポジトリからサービス追加
railway add --repo <owner/repo> --service <name>

# 環境変数の設定（デプロイをスキップ）
railway variable set "KEY=VALUE" --service <name> --skip-deploys

# 環境変数の確認
railway variable list --service <name>

# ドメインの生成
railway domain --service <name> --port <port>

# カスタムドメインの設定
railway domain <domain> --service <name> --port <port>

# デプロイ
railway up --service <name> --detach

# ログ確認
railway logs --service <name> --lines <n>
railway logs --service <name> --build --lines <n>
railway logs --service <name> --filter "@level:error" --since 1h

# DB 接続
railway connect <service>

# サービスの状態確認
railway service status

# 再デプロイ
railway service redeploy --service <name>
```

---

## 注意事項・リスク

1. **UUID → TEXT の FK 変換**: Better Auth は `user.id` を TEXT 型で管理する。既存テーブルの `owner_id` 等は UUID 型。マイグレーション時に型変換が必要。これが最大の技術リスク。
2. **日本語全文検索の精度**: `pg_trgm` は 3-gram のため 1-2文字ではインデックスが効かないが、Zedi はフロントエンドで3文字以上を必須にしているため影響なし。
3. **既存ユーザーの再認証**: Cognito セッションは使えなくなるため、全ユーザーが Google/GitHub で再ログインする必要がある。
4. **ダウンタイム**: DNS 切り替え中に数分〜数時間のダウンタイムが発生する可能性がある。事前に TTL を短縮し、メンテナンスウィンドウを設定すること。
5. **Hocuspocus の WebSocket 認証**: Better Auth セッショントークンの取得方法の確認が必要。
6. **Root Directory 設定**: monorepo のため API と Hocuspocus それぞれでダッシュボードから Root Directory を設定すること。CLI では未対応。
7. **CLI の `--skip-deploys` フラグ**: 環境変数を複数回に分けて設定する場合、最後の1回以外は `--skip-deploys` を付けて不要な中間デプロイを防ぐ。

---

## 参考リンク

- [Railway ドキュメント](https://docs.railway.com/)
- [Railway CLI リファレンス](https://docs.railway.com/reference/cli-api)
- [Railway MCP Server](https://github.com/railwayapp/railway-mcp-server)
- [Railway Skills](https://github.com/railwayapp/railway-skills)
- [Railway Config as Code](https://docs.railway.com/guides/config-as-code)
- [Railway Private Networking](https://docs.railway.com/guides/private-networking)
- [Railway Variable References](https://docs.railway.com/guides/variables#referencing-another-services-variable)
- [Railway Storage Buckets](https://docs.railway.com/guides/storage-buckets)
- [Railway Volumes & Backups](https://docs.railway.com/reference/volumes)
- [Cloudflare Pages ドキュメント](https://developers.cloudflare.com/pages/)
- [Better Auth ドキュメント](https://www.better-auth.com/)
- [Drizzle ORM ドキュメント](https://orm.drizzle.team/)
