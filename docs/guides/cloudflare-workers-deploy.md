# Cloudflare Workers デプロイガイド

このドキュメントでは、zedi プロジェクトの Cloudflare Workers（`ai-api` / `thumbnail-api`）をデプロイするための手順を説明します。

## 概要

| Worker | 用途 | 開発用名 | 本番用名 |
|--------|------|----------|----------|
| ai-api | AI チャット API | `zedi-ai-api-dev` | `zedi-ai-api` |
| thumbnail-api | サムネイル検索/生成 API | `zedi-thumbnail-api-dev` | `zedi-thumbnail-api` |

## 前提条件

- [Cloudflare アカウント](https://dash.cloudflare.com/sign-up)
- Node.js 20 以上
- npm または bun

---

## 1. Cloudflare API トークンの作成

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン
2. 右上のプロフィールアイコン → **My Profile**
3. 左メニューから **API Tokens** を選択
4. **Create Token** をクリック
5. **Edit Cloudflare Workers** テンプレートを選択（または Custom Token で以下の権限を付与）
   - `Account` → `Workers Scripts` → `Edit`
   - `Zone` → `Workers Routes` → `Edit`（カスタムドメインを使う場合）
6. トークンを作成し、安全な場所に保存

> ⚠️ トークンは一度しか表示されません。必ずコピーして保存してください。

---

## 2. ローカル環境からのデプロイ

### 2.1 wrangler のログイン（初回のみ）

```bash
npx wrangler login
```

ブラウザが開き、Cloudflare アカウントと連携されます。

### 2.2 開発環境へのデプロイ

各 Worker ディレクトリに移動してデプロイします。

```bash
# ai-api（開発）
cd workers/ai-api
npm install
npm run deploy

# thumbnail-api（開発）
cd ../thumbnail-api
npm install
npm run deploy
```

または、リポジトリ直下から：

```bash
npx wrangler deploy --config workers/ai-api/wrangler.toml --env ""
npx wrangler deploy --config workers/thumbnail-api/wrangler.toml --env ""
```

### 2.3 本番環境へのデプロイ

本番環境へのデプロイは、**セクション 3「本番環境へのデプロイ手順」** を参照してください。

簡易手順：

```bash
# ai-api（本番）
cd workers/ai-api
npx wrangler deploy --env production

# thumbnail-api（本番）
cd ../thumbnail-api
npx wrangler deploy --env production
```

> ⚠️ **重要**: 本番環境へのデプロイ前に、必ずシークレットの登録と動作確認を行ってください。詳細はセクション 3 を参照してください。

---

## 3. 本番環境へのデプロイ手順

本番環境へのデプロイは、開発環境での動作確認が完了してから実施してください。

### 3.1 デプロイ前チェックリスト

本番環境への初回デプロイ前に、以下を確認してください：

- [ ] 開発環境（`*-dev`）で動作確認済み
- [ ] 本番用シークレットの準備完了
- [ ] `wrangler.toml` の本番環境設定を確認
  - [ ] `[env.production]` セクションが正しく設定されている
  - [ ] `CORS_ORIGIN` が本番ドメインに設定されている
- [ ] GitHub Secrets が設定されている（自動デプロイを使用する場合）
- [ ] 本番環境の `.env.production` が更新されている

> ⚠️ **初回デプロイ時の注意**: 本番環境のWorkerは初回デプロイ時に作成されます。デプロイ後、必ず動作確認を行ってください。

### 3.2 本番用シークレットの登録

`.dev.vars` に記載されているシークレットは、本番環境では `wrangler secret put` で登録します。

#### thumbnail-api

```bash
cd workers/thumbnail-api

# 各シークレットを登録（対話形式で値を入力）
npx wrangler secret put GOOGLE_CUSTOM_SEARCH_API_KEY --env production
npx wrangler secret put GOOGLE_CUSTOM_SEARCH_ENGINE_ID --env production
npx wrangler secret put GOOGLE_GEMINI_API_KEY --env production
```

> 💡 **ヒント**: パイプを使って値を直接渡すこともできます（非推奨：コマンド履歴に残る可能性があります）
> ```bash
> echo "your_secret_value" | npx wrangler secret put SECRET_NAME --env production
> ```

#### ai-api

```bash
cd workers/ai-api

# Clerk認証設定（必須）
npx wrangler secret put CLERK_JWKS_URL --env production
# 例: https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json

# Clerk認証設定（オプション、必要に応じて）
npx wrangler secret put CLERK_ISSUER --env production
npx wrangler secret put CLERK_AUDIENCE --env production

# AI プロバイダーAPIキー（使用するプロバイダーのみ設定）
npx wrangler secret put OPENAI_API_KEY --env production
npx wrangler secret put ANTHROPIC_API_KEY --env production
npx wrangler secret put GOOGLE_AI_API_KEY --env production
```

#### シークレット一覧の確認

```bash
# thumbnail-api
cd workers/thumbnail-api
npx wrangler secret list --env production

# ai-api
cd workers/ai-api
npx wrangler secret list --env production
```

### 3.3 本番環境へのデプロイ実行

#### 方法1: 個別にデプロイ

```bash
# ai-api（本番）
cd workers/ai-api
npm install
npx wrangler deploy --env production

# thumbnail-api（本番）
cd ../thumbnail-api
npm install
npx wrangler deploy --env production
```

#### 方法2: リポジトリ直下からデプロイ

```bash
npx wrangler deploy --config workers/ai-api/wrangler.toml --env production
npx wrangler deploy --config workers/thumbnail-api/wrangler.toml --env production
```

### 3.4 デプロイ後の動作確認

#### ヘルスチェック

```bash
# ai-api
curl https://zedi-ai-api.saedgewell.workers.dev/
# 期待される出力: "zedi ai api"

# thumbnail-api
curl https://zedi-thumbnail-api.saedgewell.workers.dev/
# 期待される出力: "zedi thumbnail api"
```

#### API動作確認

```bash
# thumbnail-api: 画像検索テスト
curl "https://zedi-thumbnail-api.saedgewell.workers.dev/api/image-search?query=test&limit=5"

# ai-api: 認証が必要なため、フロントエンドからテスト
# ブラウザの開発者ツールでネットワークタブを確認
```

#### ログの確認

Cloudflare ダッシュボードから確認：

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン
2. **Workers & Pages** → 対象のWorkerを選択
3. **Logs** タブでリアルタイムログを確認

または、コマンドラインから：

```bash
# リアルタイムログの確認
npx wrangler tail --env production
```

### 3.5 ロールバック手順

問題が発生した場合、以前のバージョンにロールバックできます。

```bash
# デプロイ履歴の確認
npx wrangler deployments list --env production

# 特定のバージョンにロールバック
npx wrangler rollback <DEPLOYMENT_ID> --env production
```

### 3.6 トラブルシューティング

#### シークレットが見つからないエラー

```
Error: GOOGLE_CUSTOM_SEARCH_API_KEY is not configured
```

**対処法**: シークレットが正しく登録されているか確認

```bash
npx wrangler secret list --env production
```

#### CORS エラー

**対処法**: `wrangler.toml` の `CORS_ORIGIN` が本番ドメインに設定されているか確認

```toml
[env.production.vars]
CORS_ORIGIN = "https://zedi-note.app/"
```

#### 認証エラー（ai-api）

**対処法**: Clerk の設定を確認

```bash
# CLERK_JWKS_URL が正しく設定されているか確認
npx wrangler secret list --env production | grep CLERK
```

### 3.7 本番環境の環境変数設定

`.env.production` ファイルを更新して、本番環境のWorker URLを設定します。

```bash
# .env.production
VITE_AI_API_BASE_URL=https://zedi-ai-api.saedgewell.workers.dev
VITE_THUMBNAIL_API_BASE_URL=https://zedi-thumbnail-api.saedgewell.workers.dev
```

> ⚠️ **注意**: `.env.production` は本番ビルド時に使用されます。ビルドプロセスで正しく読み込まれることを確認してください。

---

## 4. 開発環境用シークレットの登録

開発環境のWorkerにもシークレットを登録する必要があります（`.dev.vars` はローカル開発サーバーでのみ使用されます）。

### thumbnail-api（開発環境）

```bash
cd workers/thumbnail-api

# 開発環境にシークレットを登録（--env を指定しない）
npx wrangler secret put GOOGLE_CUSTOM_SEARCH_API_KEY
npx wrangler secret put GOOGLE_CUSTOM_SEARCH_ENGINE_ID
npx wrangler secret put GOOGLE_GEMINI_API_KEY
```

### ai-api（開発環境）

```bash
cd workers/ai-api

# 開発環境にシークレットを登録
npx wrangler secret put CLERK_JWKS_URL
npx wrangler secret put OPENAI_API_KEY
# など、必要に応じて追加
```

> 💡 **注意**: 開発環境と本番環境は別々にシークレットを管理します。開発環境には `--env production` を**付けずに**登録してください。

---

## 5. GitHub Actions による自動デプロイ

`main` ブランチに `workers/**` 配下の変更がマージされると、自動的に本番環境へデプロイされます。

### 5.1 GitHub Secrets の設定

リポジトリの **Settings** → **Secrets and variables** → **Actions** で以下を追加：

| Secret 名 | 値 |
|-----------|-----|
| `CLOUDFLARE_API_TOKEN` | 手順 1 で作成した API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボードの URL から取得（`dash.cloudflare.com/<ACCOUNT_ID>/...`）|

### 5.2 ワークフローの動作

- **トリガー**: `main` ブランチへの push（`workers/**` または `.github/workflows/deploy-workers.yml` の変更時）
- **手動実行**: GitHub Actions の「Run workflow」からも実行可能（`workflow_dispatch`）

### 5.3 ワークフローファイル

`.github/workflows/deploy-workers.yml` で定義されています。

---

## 6. 環境の切り替え

### wrangler.toml の構成

```toml
# デフォルト（開発環境）
name = "zedi-ai-api-dev"
main = "src/index.ts"
compatibility_date = "2026-01-20"

[vars]
CORS_ORIGIN = "http://localhost:30000"

# 本番環境
[env.production]
name = "zedi-ai-api"

[env.production.vars]
CORS_ORIGIN = "https://zedi-note.app/"
```

### 環境の指定

| コマンド | デプロイ先 |
|----------|------------|
| `wrangler deploy` | 開発環境（`*-dev`） |
| `wrangler deploy --env production` | 本番環境 |
| `wrangler dev` | ローカル開発サーバー |

---

## 7. ローカル開発

### 開発サーバーの起動

```bash
cd workers/ai-api
npm run dev
# または
cd workers/thumbnail-api
npm run dev
```

デフォルトで `http://localhost:8787` で起動します。

### .dev.vars の使用

ローカル開発時は `.dev.vars` ファイルのシークレットが自動的に読み込まれます。

```
GOOGLE_CUSTOM_SEARCH_API_KEY=xxx
GOOGLE_GEMINI_API_KEY=xxx
```

> ⚠️ `.dev.vars` は `.gitignore` に含まれており、リポジトリにはコミットされません。

---

## 8. トラブルシューティング

### 「CLOUDFLARE_API_TOKEN が必要」エラー

非対話環境（CI など）では環境変数が必要です。

```bash
export CLOUDFLARE_API_TOKEN=your_token_here
npx wrangler deploy --env production
```

### 「Multiple environments are defined」警告

`--env` を明示的に指定してください。

```bash
# 開発環境
npx wrangler deploy --env ""

# 本番環境
npx wrangler deploy --env production
```

### デプロイ後の動作確認

```bash
# ヘルスチェック（例）
curl https://zedi-ai-api.your-subdomain.workers.dev/
curl https://zedi-thumbnail-api.your-subdomain.workers.dev/
```

---

## 9. カスタムドメインの設定（オプション）

Workers にカスタムドメインを設定する場合は、`wrangler.toml` に `routes` を追加します。

```toml
[env.production]
name = "zedi-ai-api"
routes = [
  { pattern = "api.zedi-note.app/ai/*", zone_name = "zedi-note.app" }
]
```

または Cloudflare ダッシュボードから Workers → 対象 Worker → **Triggers** → **Custom Domains** で設定できます。

---

## 参考リンク

- [Wrangler ドキュメント](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Workers 環境変数](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [GitHub Actions + Cloudflare Workers](https://developers.cloudflare.com/workers/ci-cd/github-actions/)
