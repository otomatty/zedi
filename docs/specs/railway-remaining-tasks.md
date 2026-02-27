# Railway 移行 — 残タスク作業計画書

**作成日:** 2026-02-25
**最終更新:** 2026-02-25
**前提:** コード変更 (Phase 1〜7) は完了済み。本ドキュメントは、コード外のインフラ構築・設定・データ移行・検証タスクをまとめたものである。

---

## 全体フロー

```
Step 1: ローカル動作確認
  ↓
Step 2: Railway プロジェクト作成 (development 環境)
  ↓  PostgreSQL → Redis → Storage Bucket → API → Hocuspocus の順に作成
  ↓  作成と同時に環境変数も設定する
  ↓
Step 3: OAuth プロバイダー設定 (開発用コールバック URL 追加)
  ↓
Step 4: development 環境のデプロイ & 動作検証
  ↓  ここで全機能をテストする
  ↓
Step 5: Cloudflare Pages セットアップ
  ↓
Step 6: production 環境の構築 (Step 2〜3 を本番用に繰り返す)
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

## Step 1: ローカル動作確認

**推定: 0.5日**
**目的:** Railway にデプロイする前に、ローカルで全体が動くことを確認する。

### 1.1 依存関係のインストール

3つのディレクトリでそれぞれ `npm install` を実行する:

```bash
# ルート（フロントエンド）
npm install

# API サーバー
cd server/api && npm install

# Hocuspocus サーバー
cd server/hocuspocus && npm install
```

### 1.2 docker-compose でバックエンドを起動

```bash
docker-compose -f docker-compose.dev.yml up --build
```

これにより以下が起動する:

- **PostgreSQL** (localhost:5432) — 標準イメージ + pg_trgm 拡張
- **Redis** (localhost:6379) — セッション / レート制限
- **API** (localhost:3000) — Hono サーバー
- **Hocuspocus** (localhost:1234) — Y.js WebSocket

### 1.3 フロントエンドを起動

別ターミナルで:

```bash
npm run dev
```

### 1.4 動作確認チェックリスト

- [ ] http://localhost:3000/api/health が `200` を返す
- [ ] http://localhost:5173 でフロントエンドが表示される
- [ ] Better Auth のエンドポイント (`/api/auth/session`) が応答する
- [ ] PostgreSQL に接続できる (`psql postgres://zedi:zedi_dev@localhost:5432/zedi`)

> **トラブルシューティング:** `docker-compose up` で PostgreSQL が起動しない場合、既にローカルで 5432 ポートを使っているプロセスがないか確認する。

---

## Step 2: Railway プロジェクトセットアップ (development 環境)

**推定: 1日**
**目的:** Railway 上に全サービスを構築する。**まず development 環境で動作確認してから production に進む。**

### 2.1 プロジェクト作成

1. [Railway Dashboard](https://railway.com/dashboard) にログイン
2. 「New Project」→「Empty Project」をクリック
3. プロジェクト名を `zedi` に設定
4. 左上の環境セレクターで `production` が作成されている。`+ New Environment` で `development` を追加
5. **`development` 環境を選択した状態で**以降の手順を実施する

### 2.2 PostgreSQL の作成

1. Project Canvas 上で右クリック → 「Add New Service」→ 「Database」を選択
2. 「PostgreSQL」を選ぶ
3. 自動的に Volume 付きの PostgreSQL がデプロイされる
4. **デプロイが完了するまで待つ**（1-2分）

**デプロイ完了後:** 5. PostgreSQL サービスをクリック → 「Variables」タブを開く 6. `DATABASE_URL` の値をメモする（後の手順で使用）7. Database → Config にある「pg_trgm」をインストール

```

> **pg_trgm について:** PostgreSQL 標準同梱のトライグラム拡張。Zedi の全文検索（`ILIKE`）を GIN インデックスで高速化する。Zedi はフロントエンドで検索を3文字以上に制限しているため、pg_trgm のインデックスは常に有効に機能する。

### 2.3 Redis の作成

1. Project Canvas 上で右クリック → 「Add New Service」→ 「Database」を選択
2. 「Redis」を選ぶ
3. 自動デプロイを待つ

### 2.4 Storage Bucket の作成

1. Project Canvas 上で右クリック → 「Add New Service」→ 「Bucket」を選択
2. リージョンを選択（変更不可。`us-west-2` 等、API サービスに近いリージョン）
3. 表示名を `media` に設定

**作成後:**
4. 「Credentials」タブで以下の値を確認しておく:
- `ENDPOINT` — S3 エンドポイント（例: `https://t3.storageapi.dev`）
- `ACCESS_KEY_ID` — S3 アクセスキー
- `SECRET_ACCESS_KEY` — S3 シークレットキー
- `BUCKET` — バケット名

### 2.5 API サービスの作成

1. Project Canvas 上で右クリック → 「Add New Service」→ 「GitHub Repo」を選択
2. リポジトリ `otomatty/zedi` を選択
3. **重要:** サービスの「Settings」タブを開き:
- サービス名を `api` に変更
- 「Source」セクション → 「Root Directory」を `/server/api` に設定
- これにより `server/api/railway.json` が自動検出され、Dockerfile ビルドが設定される
4. 「Settings」→「Networking」→「Generate Domain」で公開ドメインを生成
5. **まだデプロイしない**（環境変数の設定が先）

#### API サービスの環境変数設定

「Variables」タブで以下を設定する:

**Railway 変数参照（サービス間接続）:**
```

PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
STORAGE_ENDPOINT=${{media.ENDPOINT}}
STORAGE_ACCESS_KEY=${{media.ACCESS_KEY_ID}}
STORAGE_SECRET_KEY=${{media.SECRET_ACCESS_KEY}}
STORAGE_BUCKET_NAME=${{media.BUCKET}}

```

> **注意:** 変数参照の `${{サービス名.変数名}}` のサービス名は、Railway Canvas 上のサービス名と一致させる。PostgreSQL のデフォルト名は `Postgres` だが、名前を変更した場合はそれに合わせる。

**Better Auth:**
```

BETTER_AUTH_SECRET=<ランダム文字列を生成: openssl rand -base64 32>
BETTER_AUTH_URL=https://<api-の-railway-ドメイン>

```

**OAuth（Step 3 で取得後に設定）:**
```

GOOGLE_CLIENT_ID=<後で設定>
GOOGLE_CLIENT_SECRET=<後で設定>
GITHUB_CLIENT_ID=<後で設定>
GITHUB_CLIENT_SECRET=<後で設定>

```

**CORS:**
```

CORS_ORIGIN=http://localhost:5173

````
> development 環境ではフロントエンドをローカルから接続するため `localhost` を指定。production では `https://zedi-note.app` に変更する。

**AI / 外部 API キー:**

AWS Secrets Manager から既存の値を取得して設定:
```bash
# AI Secrets
aws secretsmanager get-secret-value --secret-id <AI_SECRETS_ARN> --query SecretString --output text | jq .

# Polar Secrets
aws secretsmanager get-secret-value --secret-id <POLAR_SECRET_ARN> --query SecretString --output text | jq .

# Thumbnail Secrets
aws secretsmanager get-secret-value --secret-id <THUMBNAIL_SECRETS_ARN> --query SecretString --output text | jq .
````

```
OPENAI_API_KEY=<取得した値>
ANTHROPIC_API_KEY=<取得した値>
GOOGLE_AI_API_KEY=<取得した値>
GOOGLE_CUSTOM_SEARCH_API_KEY=<取得した値>
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<取得した値>
POLAR_ACCESS_TOKEN=<取得した値>
POLAR_WEBHOOK_SECRET=<取得した値>
```

### 2.6 Hocuspocus サービスの作成

1. Project Canvas 上で右クリック → 「Add New Service」→ 「GitHub Repo」を選択
2. **同じ**リポジトリ `otomatty/zedi` を選択
3. サービス名を `hocuspocus` に変更
4. 「Settings」→ 「Source」→ 「Root Directory」を `/server/hocuspocus` に設定
5. 「Settings」→ 「Networking」→ 「Generate Domain」で公開ドメインを生成

#### Hocuspocus サービスの環境変数設定

```
PORT=1234
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
API_INTERNAL_URL=http://api.railway.internal:3000
```

> **Private Networking:** `api.railway.internal` は Railway の内部 DNS 名。API サービスのサービス名が `api` の場合に自動解決される。外部トラフィックを経由しないため高速。

### 2.7 Drizzle マイグレーションの実行

全サービスのデプロイ前に、データベーススキーマを作成する:

```bash
cd server/api

# Railway PostgreSQL の DATABASE_URL を使用
DATABASE_URL="<2.2 でメモした DATABASE_URL>" npx drizzle-kit generate
DATABASE_URL="<2.2 でメモした DATABASE_URL>" npx drizzle-kit migrate
```

> **接続先の確認:** Railway の PostgreSQL に外部接続するには、PostgreSQL サービスの「Settings」→「Networking」→「TCP Proxy」を有効にする。有効にすると外部アクセス用の URL が表示される。

### 2.8 pg_trgm GIN インデックスの作成

Drizzle スキーマには pg_trgm のインデックス定義が含まれていないため、手動で作成する:

```sql
-- PostgreSQL の「Data」タブまたは psql で実行
CREATE INDEX IF NOT EXISTS idx_page_contents_text_trgm
  ON page_contents USING gin (content_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pages_title_trgm
  ON pages USING gin (title gin_trgm_ops);
```

### 2.9 デプロイの実行

環境変数を設定済みの API と Hocuspocus を手動デプロイする:

1. 各サービスの「Settings」→「Deploy」→ 「Deploy Now」をクリック（または、設定完了後に自動デプロイが走る場合はそれを待つ）
2. **ビルドログを確認**して正常にビルドされたことを確認
3. ヘルスチェック:
   - API: `https://<api-ドメイン>/api/health` → `200`
   - Hocuspocus: `https://<hocuspocus-ドメイン>/health` → `200`

---

## Step 3: OAuth プロバイダーの設定

**推定: 0.5日**
**目的:** Google / GitHub ソーシャルログインのコールバック URL を更新する。

### 3.1 Google OAuth

[Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials:

1. 既存の OAuth 2.0 クライアント ID を編集（または新規作成）
2. **承認済みリダイレクト URI** に追加:
   - `https://<api-の-railway-ドメイン>/api/auth/callback/google` （development 用）
   - `http://localhost:3000/api/auth/callback/google` （ローカル開発用）
   - `https://api.zedi-note.app/api/auth/callback/google` （production 用、後で追加でも可）
3. **承認済みの JavaScript オリジン** に追加:
   - `https://<api-の-railway-ドメイン>`
   - `http://localhost:5173`
   - `http://localhost:3000`
4. Client ID / Client Secret を取得
5. **Railway の API サービスの環境変数に設定:**
   - `GOOGLE_CLIENT_ID` = 取得した Client ID
   - `GOOGLE_CLIENT_SECRET` = 取得した Client Secret

### 3.2 GitHub OAuth

[GitHub](https://github.com/settings/developers) > Settings > Developer settings > OAuth Apps:

1. 既存アプリを編集（または新規作成）
2. **Homepage URL**: `http://localhost:5173`（development。production 用に後で変更）
3. **Authorization callback URL**: `https://<api-の-railway-ドメイン>/api/auth/callback/github`
4. Client ID / Client Secret を取得
5. **Railway の API サービスの環境変数に設定:**
   - `GITHUB_CLIENT_ID` = 取得した Client ID
   - `GITHUB_CLIENT_SECRET` = 取得した Client Secret

> **注意:** GitHub OAuth App は callback URL を1つしか設定できない。development / production で切り替えるか、2つの OAuth App を作成する。

### 3.3 Polar Webhook URL

Polar Dashboard > Settings > Webhooks:

1. 新しい Webhook URL を追加: `https://<api-の-railway-ドメイン>/api/webhooks/polar`
2. Webhook Secret は既に環境変数 `POLAR_WEBHOOK_SECRET` に設定済み

---

## Step 4: development 環境のテスト

**推定: 0.5日**
**目的:** production に進む前に development 環境で全機能が動作することを確認する。

### 4.1 ローカルフロントエンドからの接続テスト

`.env` の `VITE_API_BASE_URL` を Railway の development API URL に変更:

```bash
# .env (ローカル)
VITE_API_BASE_URL=https://<api-の-railway-ドメイン>
VITE_REALTIME_URL=wss://<hocuspocus-の-railway-ドメイン>
```

フロントエンドを起動して手動テスト:

```bash
npm run dev
```

### 4.2 動作確認チェックリスト

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
   - **Root directory**: `/`（デフォルト）
5. 環境変数を設定 (Production):
   ```
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
**目的:** Step 2〜3 と同じ手順を production 環境で実施する。

### 6.1 Railway 環境の切り替え

Railway Dashboard の環境セレクターで `production` を選択する。

### 6.2 サービスの作成

Step 2 と同じ手順で以下を作成:

1. **PostgreSQL** → pg_trgm 有効化
2. **Redis**
3. **Storage Bucket** (`media`)
4. **API サービス** (GitHub Repo、Root Directory: `/server/api`)
5. **Hocuspocus サービス** (GitHub Repo、Root Directory: `/server/hocuspocus`)

### 6.3 環境変数の設定

Step 2.5 / 2.6 と同じ変数を設定する。ただし以下が異なる:

| 変数                 | development                  | production                  |
| -------------------- | ---------------------------- | --------------------------- |
| `BETTER_AUTH_URL`    | `https://<dev-api-ドメイン>` | `https://api.zedi-note.app` |
| `CORS_ORIGIN`        | `http://localhost:5173`      | `https://zedi-note.app`     |
| `BETTER_AUTH_SECRET` | 開発用の値                   | **別のランダム値を生成**    |

> **セキュリティ:** `BETTER_AUTH_SECRET` は production と development で**必ず異なる値**を使う。

### 6.4 OAuth コールバック URL の追加

Step 3 の手順で、production 用のコールバック URL を追加:

- Google: `https://api.zedi-note.app/api/auth/callback/google`
- GitHub: `https://api.zedi-note.app/api/auth/callback/github`
- Polar Webhook: `https://api.zedi-note.app/api/webhooks/polar`

### 6.5 カスタムドメインの設定

**API サービス:**

1. Railway > api サービス > Settings > Networking > Custom Domain
2. `api.zedi-note.app` を追加
3. DNS に CNAME レコードを設定:
   ```
   api.zedi-note.app → <railway-が-表示する-cname-先>
   ```

**Hocuspocus サービス:**

1. Railway > hocuspocus サービス > Settings > Networking > Custom Domain
2. `realtime.zedi-note.app` を追加
3. DNS に CNAME レコードを設定:
   ```
   realtime.zedi-note.app → <railway-が-表示する-cname-先>
   ```

### 6.6 GitHub Secrets / Variables の設定

GitHub リポジトリの Settings > Secrets and variables > Actions に設定:

**Secrets:**
| 名前 | 値 | 用途 |
|---|---|---|
| `RAILWAY_TOKEN` | Railway Dashboard > Account > Tokens で生成 | Railway CLI デプロイ |
| `PROD_DATABASE_URL` | production の PostgreSQL 接続 URL | CI/CD マイグレーション |
| `DEV_DATABASE_URL` | development の PostgreSQL 接続 URL | CI/CD マイグレーション |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard で生成 | Pages デプロイ |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard で確認 | Pages デプロイ |

**Variables:**
| 名前 | 値 |
|---|---|
| `PROD_API_BASE_URL` | `https://api.zedi-note.app` |
| `PROD_REALTIME_URL` | `wss://realtime.zedi-note.app` |
| `POLAR_MONTHLY_ID` | Polar 月額プロダクト ID |
| `POLAR_YEARLY_ID` | Polar 年額プロダクト ID |

### 6.7 Drizzle マイグレーション & インデックス作成

Step 2.7〜2.8 と同じ手順を production の PostgreSQL に対して実行:

```bash
cd server/api
DATABASE_URL="<production の DATABASE_URL>" npx drizzle-kit generate
DATABASE_URL="<production の DATABASE_URL>" npx drizzle-kit migrate
```

```sql
CREATE INDEX IF NOT EXISTS idx_page_contents_text_trgm
  ON page_contents USING gin (content_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pages_title_trgm
  ON pages USING gin (title gin_trgm_ops);
```

### 6.8 バックアップ設定

1. Canvas 上の PostgreSQL Volume をクリック → Backups タブ
2. **production:** Daily + Weekly
3. **development:** Weekly のみ
4. 参考: [Railway Backups ドキュメント](https://docs.railway.app/volumes/backups)

---

## Step 7: データ移行

**推定: 1日**
**目的:** Aurora のデータを Railway PostgreSQL に移行する。

### 7.1 Aurora のバックアップ取得

```bash
# VPN / 踏み台サーバー経由で Aurora に直接接続して pg_dump
pg_dump \
  --host=<aurora-cluster-endpoint> \
  --port=5432 \
  --username=<username> \
  --dbname=zedi \
  --format=custom \
  --file=zedi-aurora-backup.dump
```

> **注意:** Aurora Serverless v2 は通常 RDS Data API 経由だが、VPC 内からは直接接続も可能。

### 7.2 Railway PostgreSQL へのインポート

```bash
# Railway PostgreSQL にデータのみリストア（スキーマは Drizzle で作成済み）
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

Aurora の `users` テーブルから Better Auth の `user` テーブルにデータを移行する:

```sql
-- 既存ユーザーを Better Auth の user テーブルにマッピング
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

-- Cognito の外部アカウントを account テーブルに移行
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
> Better Auth の `user.id` は TEXT 型だが、既存テーブル (`pages`, `notes` 等) の `owner_id` は UUID 型の FK で `users.id` を参照している。
>
> 対応方針:
>
> 1. 既存 UUID の `users.id` を文字列として `user.id` にコピー
> 2. 他テーブルの FK (`owner_id` 等) を UUID → TEXT に変更するマイグレーションを追加
> 3. または、Better Auth の id 生成を UUID にカスタマイズする

### 7.4 S3 → Railway Storage Buckets のファイル移行

```bash
# AWS S3 からローカルにダウンロード
aws s3 sync s3://<media-bucket> ./s3-media-backup/
aws s3 sync s3://<thumbnail-bucket> ./s3-thumbnail-backup/

# Railway Storage Bucket にアップロード (S3 互換 CLI で接続)
aws s3 sync ./s3-media-backup/ s3://<railway-bucket-name>/ \
  --endpoint-url https://storage.railway.app
aws s3 sync ./s3-thumbnail-backup/ s3://<railway-bucket-name>/ \
  --endpoint-url https://storage.railway.app
```

### 7.5 データ整合性チェック

```sql
-- レコード数比較（Aurora と Railway の両方で実行して一致を確認）
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

DNS 切り替えの**数時間前**に TTL を短く設定:

```
api.zedi-note.app      TTL=300 (5分)
realtime.zedi-note.app TTL=300 (5分)
```

### 8.2 デプロイ

1. `main` ブランチにコードをマージ
2. GitHub Actions `deploy-prod.yml` が自動で:
   - Drizzle マイグレーション実行
   - Railway に API / Hocuspocus をデプロイ
   - Cloudflare Pages にフロントエンドをデプロイ

### 8.3 DNS 切り替え

1. `api.zedi-note.app` → Railway CNAME に切り替え
2. `realtime.zedi-note.app` → Railway CNAME に切り替え
3. `zedi-note.app` → Cloudflare Pages（Step 5 で設定済み）

### 8.4 本番動作確認

Step 4.2 のチェックリストを production 環境で再実施する。

---

## Step 9: 移行後タスク

**推定: 0.5日**

### 9.1 ユーザーへの通知

- 全ユーザーに Google/GitHub での再ログインが必要であることを通知
- Cognito セッションは使えなくなる

### 9.2 モニタリング設定

- Railway のメトリクス・ログ監視を設定
- エラーレート、レスポンスタイム、メモリ使用量を監視

### 9.3 AWS リソースの段階的削除

**安定稼働確認後（最低1週間）:**

1. CloudFront ディストリビューションの無効化
2. API Gateway の無効化
3. Lambda 関数の削除
4. ECS Fargate サービスの削除
5. Aurora Serverless v2 の停止 → 最終バックアップ → 削除
6. ElastiCache Redis の削除
7. Cognito User Pool の削除（全ユーザーの再認証が完了してから）
8. S3 バケットの空化 → 削除
9. VPC / NAT Gateway / その他リソースの削除
10. Terraform State ファイルのアーカイブ

---

## タイムライン総括

| Step     | 作業                       | 推定所要時間 |
| -------- | -------------------------- | ------------ |
| 1        | ローカル動作確認           | 0.5日        |
| 2        | Railway セットアップ (dev) | 1日          |
| 3        | OAuth 設定                 | 0.5日        |
| 4        | development 環境テスト     | 0.5日        |
| 5        | Cloudflare Pages           | 0.5日        |
| 6        | production 環境構築        | 0.5日        |
| 7        | データ移行                 | 1日          |
| 8        | DNS 切り替え & 本番検証    | 0.5日        |
| 9        | 移行後タスク               | 0.5日        |
| **合計** |                            | **約5.5日**  |

---

## 注意事項・リスク

1. **UUID → TEXT の FK 変換**: Better Auth は `user.id` を TEXT 型で管理する。既存テーブルの `owner_id` 等は UUID 型。マイグレーション時に型変換が必要。これが最大の技術リスク。
2. **日本語全文検索の精度**: `pg_trgm` は 3-gram のため、理論上は1-2文字でインデックスが効かないが、**Zedi はフロントエンドで3文字以上を必須にしている**ため影響なし。
3. **既存ユーザーの再認証**: Cognito セッションは使えなくなるため、全ユーザーが Google/GitHub で再ログインする必要がある。
4. **ダウンタイム**: DNS 切り替え中に数分〜数時間のダウンタイムが発生する可能性がある。事前に TTL を短縮し、メンテナンスウィンドウを設定すること。
5. **Hocuspocus の WebSocket 認証**: Better Auth セッショントークンの取得方法 (`useCollaboration.ts`, `useEditorSetup.ts`) の修正が未完了の可能性あり。Cookie からトークンを取得するロジックの確認が必要。
6. **Railway の Root Directory 設定**: monorepo 構成のため、API と Hocuspocus それぞれで Root Directory の設定を忘れないこと。設定しないと `railway.json` が検出されずビルドに失敗する。

---

## 参考リンク

- [Railway ドキュメント](https://docs.railway.app/)
- [Railway Config as Code](https://docs.railway.app/config-as-code)
- [Railway Private Networking](https://docs.railway.app/guides/private-networking)
- [Railway Variable References](https://docs.railway.app/variables#referencing-another-services-variable)
- [Railway Storage Buckets](https://docs.railway.com/guides/storage-buckets)
- [Railway Volumes & Backups](https://docs.railway.app/volumes/backups)
- [Cloudflare Pages ドキュメント](https://developers.cloudflare.com/pages/)
- [Better Auth ドキュメント](https://www.better-auth.com/)
- [Drizzle ORM ドキュメント](https://orm.drizzle.team/)
