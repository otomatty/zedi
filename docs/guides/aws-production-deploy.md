# AWS 本番環境へのデプロイ手順

開発中のアプリを AWS 本番環境にデプロイするための手順です。  
フロント（Vite/React）は **S3 + CloudFront**、API・Realtime 等は **Terraform** で管理されています。  
**環境変数は `.env.production` にまとめて読み込む前提**で、一括デプロイ用スクリプトを用意しています。

---

## 全体の流れ

| 段階                  | 内容                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| **1. 初回のみ**       | Terraform で本番インフラ（VPC, Cognito, Aurora, API, CDN など）を構築          |
| **2. 環境変数の準備** | `.env.production.example` をコピーして `.env.production` を作成し、値を埋める  |
| **3. 毎回**           | `bun run deploy:prod` でビルド → S3 アップロード → CloudFront 無効化を一括実行 |

---

## 1. 初回：本番インフラの構築（Terraform）

本番用の S3・CloudFront・Cognito・API 等がまだない場合に実行します。

### 1.1 前提

- AWS CLI が設定済み（本番用の IAM で `terraform apply` 可能な権限）
- Terraform 1.0 以上
- 本番用の変数ファイルが用意されていること

### 1.2 本番用 workspace と変数

```bash
cd terraform
terraform workspace select prod   # または terraform workspace new prod
```

- **environments/prod.tfvars** … 本番用の公開パラメータ（ドメイン、リージョンなど）
- **environments/prod.secret.env** … 秘密情報（`TF_VAR_*`）。**Git にコミットしない**

Bash でシークレットを読み込む例:

```bash
set -a && source environments/prod.secret.env && set +a
```

### 1.3 plan と apply

```bash
terraform plan -var-file=environments/prod.tfvars
# 内容を確認してから
terraform apply -var-file=environments/prod.tfvars
```

これで CDN（S3 + CloudFront）、Cognito、API、Realtime 等の本番リソースが作成されます。

### 1.4 デプロイに必要な値を取得

フロントデプロイや GitHub Secrets の設定に使うため、以下を控えます。

```bash
terraform output -raw frontend_s3_bucket              # → 例: zedi-prod-frontend-123456789012
terraform output -raw cloudfront_distribution_id     # → 例: E30K53ZAPT4J6C
terraform output -raw cognito_hosted_ui_url          # → VITE_COGNITO_DOMAIN 用（https:// を除く）
terraform output -raw cognito_client_id              # → VITE_COGNITO_CLIENT_ID
terraform output -raw api_invoke_url                  # → 本番 API のベース URL
terraform output -raw websocket_url                   # → VITE_REALTIME_URL 用
```

---

## 2. 環境変数ファイルの準備（手動デプロイ時）

手動で `deploy:prod` を実行する場合は、**環境変数をファイルで読み込む**形にします。

1. **テンプレートをコピー**

   ```bash
   cp .env.production.example .env.production
   ```

   （Windows の場合は `copy .env.production.example .env.production`）

2. **`.env.production` を編集して値を埋める**
   - **VITE\_\*** … ビルド時にクライアントに埋め込まれる値（Cognito、API URL、Realtime URL など）
   - **PROD_FRONTEND_S3_BUCKET** … Terraform の `terraform output -raw frontend_s3_bucket`
   - **PROD_CLOUDFRONT_DISTRIBUTION_ID** … Terraform の `terraform output -raw cloudfront_distribution_id`

3. **AWS の認証**
   - `AWS_ACCESS_KEY_ID` と `AWS_SECRET_ACCESS_KEY` を環境変数または `~/.aws/credentials` で設定しておく（デプロイスクリプト実行時に AWS CLI が参照します）。

※ `.env.production` は Git にコミットされません（`.gitignore` 済み）。

---

## 3. フロントエンドのデプロイ

### 3.1 方法 A：環境変数読み込み + 一括デプロイ（手動・推奨）

`.env.production` を用意したうえで、次の一コマンドでビルド〜S3 アップロード〜CloudFront 無効化まで実行します。

```bash
bun run deploy:prod
```

- スクリプトが **`.env.production` を読み込み**、その内容を `bun run build` と AWS CLI に渡します。
- 別のファイルを使う場合: `ENV_FILE=.env.production.local bun run deploy:prod`

中身: `scripts/deploy/deploy-to-aws.ts`（環境変数読み込み → ビルド → S3 sync → CloudFront invalidation）

### 3.2 方法 B：GitHub Actions

main ブランチに push すると、`src/` や `package.json` など対象パスに変更があれば **Deploy Frontend (prod)** が自動で動きます。環境変数は GitHub Secrets から注入されます。

**手動でワークフローだけ実行する場合**

1. GitHub リポジトリ → **Actions** → **Deploy Frontend (prod)**
2. **Run workflow** → ブランチ **main** で **Run workflow**

**初回前に必須：GitHub Secrets の設定**

リポジトリの **Settings → Secrets and variables → Actions** に以下を登録します。

| Secret 名                           | 説明                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| **AWS_ACCESS_KEY_ID**               | 本番 S3 に書き込める IAM のアクセスキー                                |
| **AWS_SECRET_ACCESS_KEY**           | 上記のシークレットキー                                                 |
| **PROD_FRONTEND_S3_BUCKET**         | `terraform output -raw frontend_s3_bucket` の値                        |
| **PROD_CLOUDFRONT_DISTRIBUTION_ID** | `terraform output -raw cloudfront_distribution_id` の値                |
| **VITE_COGNITO_DOMAIN**             | Cognito ホスト（`cognito_hosted_ui_url` から `https://` を除いたもの） |
| **VITE_COGNITO_CLIENT_ID**          | `terraform output -raw cognito_client_id` の値                         |

推奨（アプリの動作に必要に応じて）:

- **VITE_COGNITO_REDIRECT_URI** … 例: `https://zedi-note.app/auth/callback`
- **VITE_COGNITO_LOGOUT_REDIRECT_URI** … 例: `https://zedi-note.app`
- **VITE_AI_API_BASE_URL** … 本番 AI API の URL
- **VITE_THUMBNAIL_API_BASE_URL** … 本番サムネイル API の URL
- **VITE_REALTIME_URL** … 本番 WebSocket URL（`terraform output -raw websocket_url`）

### 3.3 方法 C：手動でビルドと AWS コマンドを分けて実行

環境変数は `.env.production` を用意したうえで、従来どおり手順を分ける場合です。

1. **ビルド**（Vite が `.env.production` を自動読み込み）

   ```bash
   bun run build
   ```

2. **S3 にアップロード**

   ```bash
   aws s3 sync dist/ s3://<PROD_FRONTEND_S3_BUCKET>/ --delete
   ```

   `<PROD_FRONTEND_S3_BUCKET>` は `terraform output -raw frontend_s3_bucket` で確認できます。

3. **CloudFront のキャッシュを無効化**
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id <PROD_CLOUDFRONT_DISTRIBUTION_ID> \
     --paths "/*"
   ```
   `<PROD_CLOUDFRONT_DISTRIBUTION_ID>` は `terraform output -raw cloudfront_distribution_id` で確認できます。

※ AWS CLI は本番用のプロファイルまたは環境変数で認証しておいてください。

---

## 4. カスタムドメイン（zedi-note.app など）の場合

- Terraform の **cdn** モジュールで `domain_name` と `attach_custom_domain` を設定すると、CloudFront に ACM 証明書を紐付けできます。
- DNS（CNAME）は Cloudflare 等で手動設定するか、Terraform の Route53 モジュールで管理します。
- 詳細: `docs/work-logs/20260208/frontend-cdn-and-cloudflare-summary.md`

---

## 5. 参照ドキュメント

| ドキュメント                                                                                                         | 内容                                                      |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [docs/guides/github-and-deploy-guide.md](./github-and-deploy-guide.md)                                               | GitHub 運用・フロントデプロイ・Terraform・Secrets の詳細  |
| [docs/guides/env-variables-guide.md](./env-variables-guide.md)                                                       | VITE\_\* の一覧と本番の目安                               |
| [docs/plans/20260208/aws-frontend-deploy-terraform-plan.md](../plans/20260208/aws-frontend-deploy-terraform-plan.md) | フロントデプロイの設計                                    |
| [.github/workflows/deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml)                                 | デプロイワークフローの定義                                |
| [.env.production.example](../../.env.production.example)                                                             | 本番用環境変数テンプレート                                |
| [scripts/deploy/deploy-to-aws.ts](../../scripts/deploy/deploy-to-aws.ts)                                             | 環境変数読み込み＋ビルド＋S3＋CloudFront の一括スクリプト |

---

## 6. よく使うコマンド早見

| やりたいこと                                     | コマンド例                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 本番 Terraform の状態確認                        | `cd terraform && terraform workspace select prod && terraform plan -var-file=environments/prod.tfvars` |
| 本番 S3 バケット名を確認                         | `terraform -chdir=terraform output -raw frontend_s3_bucket`（prod 選択済み前提）                       |
| 本番 CloudFront 配信 ID を確認                   | `terraform -chdir=terraform output -raw cloudfront_distribution_id`（prod 選択済み前提）               |
| 手動でフロントを本番デプロイ（環境変数読み込み） | `.env.production` を用意して `bun run deploy:prod`                                                     |
