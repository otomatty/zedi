# Railway 移行 — 次ステップ作業計画書

**作成日:** 2026-02-28
**前提:** Railway サービスのデプロイと DNS レコードの設定が完了。本ドキュメントは残りの作業を整理したものである。

---

## 完了済み作業

| 作業                       |   development   |      production      |
| -------------------------- | :-------------: | :------------------: |
| PostgreSQL 作成            |  ✅ `Postgres`  |  ✅ `Postgres-p3L9`  |
| Redis 作成                 |   ✅ `Redis`    |  ❌ ボリューム制限   |
| API デプロイ               |    ✅ `api`     |    ✅ `api-prod`     |
| Hocuspocus デプロイ        | ✅ `hocuspocus` | ✅ `hocuspocus-prod` |
| Drizzle マイグレーション   |       ✅        |          ✅          |
| pg_trgm + GIN インデックス |       ✅        |          ✅          |
| ドメイン生成               |       ✅        |          ✅          |
| カスタムドメイン           |        —        |     ✅ 設定済み      |
| DNS レコード (Cloudflare)  |        —        |     ✅ 設定済み      |

**サービス URL:**

| 環境                  | API                                               | Hocuspocus                                          |
| --------------------- | ------------------------------------------------- | --------------------------------------------------- |
| development           | `https://api-development-b126.up.railway.app`     | `https://hocuspocus-development.up.railway.app`     |
| production            | `https://api-prod-production-1adc.up.railway.app` | `https://hocuspocus-prod-production.up.railway.app` |
| production (カスタム) | `https://api.zedi-note.app`                       | `https://realtime.zedi-note.app`                    |

---

## 残タスク一覧

| #   | タスク                                   | 種別           | 推定時間  | ブロッカー |
| --- | ---------------------------------------- | -------------- | --------- | ---------- |
| A   | Railway Pro プランへのアップグレード     | 手動           | 5分       | —          |
| B   | production Redis の作成                  | 自動化可       | 5分       | A          |
| C   | Storage Bucket の作成 (dev / prod)       | ダッシュボード | 10分      | —          |
| D   | Storage 環境変数の更新                   | CLI            | 5分       | C          |
| E   | OAuth プロバイダー設定 (Google / GitHub) | 手動           | 30分      | —          |
| F   | OAuth 環境変数の更新                     | CLI            | 5分       | E          |
| G   | AI / 外部 API キーの設定                 | CLI            | 15分      | —          |
| H   | GitHub Secrets / Variables の設定        | 手動           | 15分      | —          |
| I   | Cloudflare Pages セットアップ            | 手動           | 30分      | —          |
| J   | development 環境の動作検証               | 手動           | 1〜2時間  | D, F, G    |
| K   | カスタムドメインの SSL 確認              | 手動           | 5分       | DNS 伝播   |
| L   | deploy-dev.yml / deploy-prod.yml の修正  | コード         | 30分      | H          |
| M   | データ移行 (Aurora → Railway)            | 半自動         | 半日〜1日 | J          |
| N   | 本番切り替え & 検証                      | 手動           | 半日      | M          |
| O   | AWS リソース削除                         | 手動           | 半日      | N 後 1週間 |

---

## Phase 1: 環境の完成（推定: 1〜2時間）

DNS が完了したので、次は両環境を「本当に動作する状態」にする。現在は OAuth / Storage / AI キーがプレースホルダーのため、認証やファイルアップロードは動かない。

### A. Railway Pro プランへのアップグレード

**理由:** プロジェクトのボリューム上限が 3 に達しており、production に Redis を作成できない。

1. https://railway.com/account/billing を開く
2. Pro プラン（月額 $5）にアップグレード
3. ボリューム上限が拡張されることを確認

> **代替案:** Pro プランに移行しない場合は、development の Redis ボリュームを削除して production に移すことも可能だが、development 環境のデータが失われる。

### B. production Redis の作成

プランアップグレード後:

```bash
railway link -p Zedi -e production
railway deploy --template redis
```

作成後、api-prod に REDIS_URL を設定:

```bash
railway variable set "REDIS_URL=${{Redis.REDIS_URL}}" --service api-prod
```

> **注意:** Redis のサービス名を確認し、変数参照の名前を合わせること。

### C. Storage Bucket の作成

**development と production それぞれで作成する。**

1. Railway Dashboard → Zedi プロジェクト
2. 環境を選択（development / production）
3. Project Canvas 上で右クリック → 「Add New Service」→ 「Bucket」
4. リージョン: `asia-southeast1`（既存サービスと同じリージョン）
5. 表示名: `media`
6. 作成後、「Credentials」タブで以下の値をメモ:
   - `ENDPOINT`
   - `ACCESS_KEY_ID`
   - `SECRET_ACCESS_KEY`
   - `BUCKET`

### D. Storage 環境変数の更新

Bucket 作成後、プレースホルダーを実際の値に置き換える:

```bash
# development
railway link -p Zedi -e development
railway variable set \
  "STORAGE_ENDPOINT=<ENDPOINT>" \
  "STORAGE_ACCESS_KEY=<ACCESS_KEY_ID>" \
  "STORAGE_SECRET_KEY=<SECRET_ACCESS_KEY>" \
  "STORAGE_BUCKET_NAME=<BUCKET>" \
  --service api

# production
railway link -p Zedi -e production
railway variable set \
  "STORAGE_ENDPOINT=<ENDPOINT>" \
  "STORAGE_ACCESS_KEY=<ACCESS_KEY_ID>" \
  "STORAGE_SECRET_KEY=<SECRET_ACCESS_KEY>" \
  "STORAGE_BUCKET_NAME=<BUCKET>" \
  --service api-prod
```

> 変数を更新すると自動で再デプロイされる。`--skip-deploys` は不要。

---

## Phase 2: 外部サービス連携（推定: 1時間）

### E. OAuth プロバイダー設定

#### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. 既存の OAuth 2.0 クライアント ID を編集
3. **承認済みリダイレクト URI** に追加:

| URI                                                                    | 用途         |
| ---------------------------------------------------------------------- | ------------ |
| `https://api-development-b126.up.railway.app/api/auth/callback/google` | development  |
| `https://api.zedi-note.app/api/auth/callback/google`                   | production   |
| `http://localhost:3000/api/auth/callback/google`                       | ローカル開発 |

4. **承認済みの JavaScript オリジン** に追加:

| オリジン                                      | 用途         |
| --------------------------------------------- | ------------ |
| `https://api-development-b126.up.railway.app` | development  |
| `https://api.zedi-note.app`                   | production   |
| `http://localhost:5173`                       | ローカル開発 |
| `http://localhost:3000`                       | ローカル開発 |

5. Client ID / Client Secret をメモ

#### GitHub OAuth

1. [GitHub Developer Settings](https://github.com/settings/developers) → OAuth Apps
2. **development 用**と **production 用**で 2つの OAuth App を作成する（GitHub は callback URL を1つしか設定できないため）:

| 項目         | development 用                                                         | production 用                                        |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| App name     | `Zedi (dev)`                                                           | `Zedi`                                               |
| Homepage URL | `http://localhost:5173`                                                | `https://zedi-note.app`                              |
| Callback URL | `https://api-development-b126.up.railway.app/api/auth/callback/github` | `https://api.zedi-note.app/api/auth/callback/github` |

3. 各 App の Client ID / Client Secret をメモ

### F. OAuth 環境変数の更新

```bash
# development（Google + GitHub dev 用の値）
railway link -p Zedi -e development
railway variable set \
  "GOOGLE_CLIENT_ID=<Google Client ID>" \
  "GOOGLE_CLIENT_SECRET=<Google Client Secret>" \
  "GITHUB_CLIENT_ID=<GitHub dev Client ID>" \
  "GITHUB_CLIENT_SECRET=<GitHub dev Client Secret>" \
  --service api

# production（Google + GitHub prod 用の値）
railway link -p Zedi -e production
railway variable set \
  "GOOGLE_CLIENT_ID=<Google Client ID>" \
  "GOOGLE_CLIENT_SECRET=<Google Client Secret>" \
  "GITHUB_CLIENT_ID=<GitHub prod Client ID>" \
  "GITHUB_CLIENT_SECRET=<GitHub prod Client Secret>" \
  --service api-prod
```

### G. AI / 外部 API キーの設定

AWS Secrets Manager から既存の値を取得:

```bash
aws secretsmanager get-secret-value \
  --secret-id <AI_SECRETS_ARN> \
  --query SecretString --output text | jq .
```

取得した値を両環境に設定:

```bash
# development
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

# production（同じ値を設定）
railway link -p Zedi -e production
railway variable set \
  "OPENAI_API_KEY=<値>" \
  "ANTHROPIC_API_KEY=<値>" \
  "GOOGLE_AI_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_API_KEY=<値>" \
  "GOOGLE_CUSTOM_SEARCH_ENGINE_ID=<値>" \
  "POLAR_ACCESS_TOKEN=<値>" \
  "POLAR_WEBHOOK_SECRET=<値>" \
  --service api-prod
```

### Polar Webhook URL の更新

Polar Dashboard → Settings → Webhooks:

| 環境        | Webhook URL                                                      |
| ----------- | ---------------------------------------------------------------- |
| development | `https://api-development-b126.up.railway.app/api/webhooks/polar` |
| production  | `https://api.zedi-note.app/api/webhooks/polar`                   |

---

## Phase 3: CI/CD とフロントエンド（推定: 1時間）

### H. GitHub Secrets / Variables の設定

GitHub リポジトリ `otomatty/zedi` → Settings → Secrets and variables → Actions:

**Secrets:**

| 名前                    | 値の取得方法                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `RAILWAY_TOKEN`         | Railway Dashboard → Account → Tokens → 新規作成                                                          |
| `PROD_DATABASE_URL`     | Railway Dashboard → `Postgres-p3L9` → Settings → Networking → TCP Proxy の公開 URL（`*.proxy.rlwy.net`） |
| `DEV_DATABASE_URL`      | Railway Dashboard → `Postgres` → Settings → Networking → TCP Proxy の公開 URL（`*.proxy.rlwy.net`）      |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Dashboard → My Profile → API Tokens → 新規作成                                                |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → アカウントホーム → 右サイドバー                                                   |

**Variables:**

| 名前                | 値                             |
| ------------------- | ------------------------------ |
| `PROD_API_BASE_URL` | `https://api.zedi-note.app`    |
| `PROD_REALTIME_URL` | `wss://realtime.zedi-note.app` |
| `POLAR_MONTHLY_ID`  | Polar Dashboard から取得       |
| `POLAR_YEARLY_ID`   | Polar Dashboard から取得       |

### I. Cloudflare Pages セットアップ

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Create
2. 「Pages」タブ → 「Connect to Git」
3. GitHub リポジトリ `otomatty/zedi` を選択
4. ビルド設定:

| 項目                   | 値                        |
| ---------------------- | ------------------------- |
| Framework preset       | None                      |
| Build command          | `npm ci && npm run build` |
| Build output directory | `dist`                    |
| Root directory         | `/`                       |

5. 環境変数 (Production):

| 名前                                | 値                             |
| ----------------------------------- | ------------------------------ |
| `VITE_API_BASE_URL`                 | `https://api.zedi-note.app`    |
| `VITE_REALTIME_URL`                 | `wss://realtime.zedi-note.app` |
| `VITE_POLAR_PRO_MONTHLY_PRODUCT_ID` | Polar から取得                 |
| `VITE_POLAR_PRO_YEARLY_PRODUCT_ID`  | Polar から取得                 |

6. カスタムドメイン: Pages プロジェクト → Custom domains → `zedi-note.app` を追加

### K. カスタムドメインの SSL 確認

DNS レコード設定済みのため、SSL 証明書が発行されているか確認:

```bash
curl -s https://api.zedi-note.app/api/health
curl -s https://realtime.zedi-note.app/health
```

失敗する場合は `docs/specs/dns-records-setup.md` のトラブルシューティングを参照。

### L. CI/CD ワークフローの修正（要コード変更）

**問題:** `deploy-prod.yml` が `--service api` / `--service hocuspocus` を使っているが、production のサービス名は `api-prod` / `hocuspocus-prod`。

**修正箇所:**

`.github/workflows/deploy-prod.yml`:

```diff
- run: railway up ./server/api --service api --environment production -d
+ run: railway up ./server/api --service api-prod --environment production -d
```

```diff
- run: railway up ./server/hocuspocus --service hocuspocus --environment production -d
+ run: railway up ./server/hocuspocus --service hocuspocus-prod --environment production -d
```

`.github/workflows/deploy-dev.yml` は修正不要（development のサービス名は `api` / `hocuspocus` で正しい）。

---

## Phase 4: 動作検証（推定: 1〜2時間）

### J. development 環境の動作検証

ローカルの `.env` を更新:

```
VITE_API_BASE_URL=https://api-development-b126.up.railway.app
VITE_REALTIME_URL=wss://hocuspocus-development.up.railway.app
```

```bash
npm run dev
```

**動作確認チェックリスト:**

- [ ] **認証:** Google ソーシャルログインが機能する
- [ ] **認証:** GitHub ソーシャルログインが機能する
- [ ] **認証:** ログアウトが正常に動作する
- [ ] **認証:** ページリロード後もログイン状態が維持される
- [ ] **API:** `/api/health` が 200 を返す
- [ ] **API:** ページの作成・取得・削除が動作する
- [ ] **API:** ノートの CRUD が動作する
- [ ] **API:** 検索が日本語で動作する（3文字以上）
- [ ] **API:** メディアアップロードが動作する
- [ ] **AI:** AI チャット（SSE ストリーミング）が動作する
- [ ] **AI:** レート制限が機能する
- [ ] **リアルタイム:** Hocuspocus WebSocket 接続が確立する
- [ ] **リアルタイム:** 複数ブラウザでの共同編集が機能する
- [ ] **課金:** Polar チェックアウトが動作する

---

## Phase 5: データ移行（推定: 半日〜1日）

Phase 4 の動作検証が完了してから実施する。

詳細は `docs/specs/railway-remaining-tasks.md` の Step 7 を参照。

### 概要

1. Aurora PostgreSQL から `pg_dump` でバックアップ取得
2. Railway PostgreSQL に `pg_restore` でデータのみインポート
3. ユーザーデータを Better Auth テーブルにマッピング（SQL）
4. S3 のメディアファイルを Railway Storage Bucket に `aws s3 sync` でコピー
5. レコード数の整合性チェック

### 最大リスク

- **UUID → TEXT の FK 変換:** Better Auth の `user.id` は TEXT 型だが、既存テーブルの `owner_id` は UUID 型の FK。マイグレーションで型変換が必要。

---

## Phase 6: 本番切り替え（推定: 半日）

詳細は `docs/specs/railway-remaining-tasks.md` の Step 8 を参照。

1. DNS TTL を 300秒に短縮（切り替え数時間前）
2. `main` ブランチにコードをマージ → GitHub Actions 自動デプロイ
3. `api.zedi-note.app` / `realtime.zedi-note.app` の DNS を Railway に向ける
4. `zedi-note.app` が Cloudflare Pages を指していることを確認
5. Phase 4 のチェックリストを production 環境で再実施

---

## Phase 7: 移行後（推定: 1週間の監視 + 半日の作業）

1. 全ユーザーに Google/GitHub での再ログインを通知
2. Railway のメトリクス・ログ監視
3. 安定稼働確認後（最低1週間）、AWS リソースを段階的に削除

---

## 推奨作業順序

```
今すぐ実施可能（並行作業可）:
  ├── A. Railway Pro アップグレード → B. Redis 作成
  ├── C. Storage Bucket 作成 → D. Storage 環境変数更新
  ├── E. OAuth 設定 → F. OAuth 環境変数更新
  ├── G. AI キー設定
  ├── H. GitHub Secrets 設定
  └── K. カスタムドメイン SSL 確認
         ↓
全環境変数の設定完了後:
  ├── I. Cloudflare Pages セットアップ
  └── L. CI/CD ワークフロー修正
         ↓
  J. development 動作検証
         ↓
  M. データ移行
         ↓
  N. 本番切り替え
         ↓
  O. AWS リソース削除（1週間後）
```

> **ポイント:** A〜H は依存関係がないため並行して進められる。全ての環境変数が実値に置き換わった時点で J（動作検証）に進む。
