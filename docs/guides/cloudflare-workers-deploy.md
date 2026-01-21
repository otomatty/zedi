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

```bash
# ai-api（本番）
cd workers/ai-api
npx wrangler deploy --env production

# thumbnail-api（本番）
cd ../thumbnail-api
npx wrangler deploy --env production
```

または、リポジトリ直下から：

```bash
npx wrangler deploy --config workers/ai-api/wrangler.toml --env production
npx wrangler deploy --config workers/thumbnail-api/wrangler.toml --env production
```

---

## 3. 本番用シークレットの登録

`.dev.vars` に記載されているシークレットは、本番環境では `wrangler secret put` で登録します。

### thumbnail-api

```bash
cd workers/thumbnail-api

# 各シークレットを登録（対話形式で値を入力）
npx wrangler secret put GOOGLE_CUSTOM_SEARCH_API_KEY --env production
npx wrangler secret put GOOGLE_CUSTOM_SEARCH_ENGINE_ID --env production
npx wrangler secret put GOOGLE_GEMINI_API_KEY --env production
```

### ai-api

```bash
cd workers/ai-api

# 必要なシークレットを登録（例）
npx wrangler secret put OPENAI_API_KEY --env production
npx wrangler secret put JWT_SECRET --env production
# など、必要に応じて追加
```

### シークレット一覧の確認

```bash
npx wrangler secret list --env production
```

---

## 4. GitHub Actions による自動デプロイ

`main` ブランチに `workers/**` 配下の変更がマージされると、自動的に本番環境へデプロイされます。

### 4.1 GitHub Secrets の設定

リポジトリの **Settings** → **Secrets and variables** → **Actions** で以下を追加：

| Secret 名 | 値 |
|-----------|-----|
| `CLOUDFLARE_API_TOKEN` | 手順 1 で作成した API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボードの URL から取得（`dash.cloudflare.com/<ACCOUNT_ID>/...`）|

### 4.2 ワークフローの動作

- **トリガー**: `main` ブランチへの push（`workers/**` または `.github/workflows/deploy-workers.yml` の変更時）
- **手動実行**: GitHub Actions の「Run workflow」からも実行可能（`workflow_dispatch`）

### 4.3 ワークフローファイル

`.github/workflows/deploy-workers.yml` で定義されています。

---

## 5. 環境の切り替え

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

## 6. ローカル開発

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

## 7. トラブルシューティング

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

## 8. カスタムドメインの設定（オプション）

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
