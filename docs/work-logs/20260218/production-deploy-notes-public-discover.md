# 本番環境への適用: ノート公開・Discover・権限分離

本番環境に「ノート公開・Discover・権限分離」の変更を適用する際の**作業の流れ**と**各ステップの意味**をまとめます。

---

## 全体の流れ（3 段階）

| 順序  | 作業                                  | 目的                                                                                                     |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **1** | 本番 DB マイグレーション（006 → 007） | 本番 Aurora に `edit_permission`, `is_official`, `view_count` を追加。**API より先に**適用する必要あり。 |
| **2** | 本番 API（Lambda）のデプロイ          | Terraform で本番用に apply し、変更済みの `router.mjs` / `notes.mjs` を本番 Lambda に反映。              |
| **3** | 本番フロントのデプロイ                | ビルド → S3 アップロード → CloudFront 無効化で、新しい UI（Discover・2軸権限など）を配信。               |

**重要**: DB マイグレーションを**先に**行わないと、本番 API が新カラムを参照した時点で DB エラーになります。順序は守ってください。

---

## 1. 本番 DB マイグレーション

### やること

開発環境で実行したのと同じ **006** と **007** の SQL を、**本番用の Aurora クラスター**に対して RDS Data API で実行する。

### 前提

- 本番用の **CLUSTER_ARN** と **SECRET_ARN** が分かっていること。
- AWS CLI が**本番用の認証**（プロファイルまたは環境変数）で、RDS Data API を実行できること。

### 本番の ARN の取り方

本番 Terraform がすでに apply 済みなら、次のように取得できます。

```bash
cd terraform
terraform workspace select prod
terraform output -raw aurora_cluster_arn      # → CLUSTER_ARN に使う
terraform output -raw db_credentials_secret_arn  # → SECRET_ARN に使う
```

### 実行コマンド（本番向け）

プロジェクトルートで、上で取得した値を環境変数に渡して実行します。**必ず 006 → 007 の順**で行います。

```bash
cd db/aurora

# 本番の ARN を環境変数に設定（例: 上記 terraform output の結果を貼り付け）
export CLUSTER_ARN="arn:aws:rds:ap-northeast-1:XXXXXXXX:cluster:zedi-prod-..."
export SECRET_ARN="arn:aws:secretsmanager:ap-northeast-1:XXXXXXXX:secret:zedi-prod-..."
export DATABASE="zedi"
export AWS_REGION="ap-northeast-1"

# 006: edit_permission
SCHEMA_FILE=006_notes_edit_permission.sql node apply-data-api.mjs

# 007: is_official, view_count
SCHEMA_FILE=007_notes_official_and_view_count.sql node apply-data-api.mjs
```

- `apply-data-api.mjs` は**デフォルトでは開発用の ARN**を参照するため、本番用には **CLUSTER_ARN** と **SECRET_ARN** を**必ず**上書きしてください。
- 両方とも "Done: N OK, 0 failed" になれば成功です。

---

## 2. 本番 API（Lambda）のデプロイ

### やること

Terraform の本番 workspace で `terraform apply` を実行し、**API モジュール**が参照している Lambda のソース（`terraform/modules/api/lambda/`）を再パッケージして本番 Lambda にデプロイする。

### 前提

- 本番用の Terraform 変数（`environments/prod.tfvars`）が用意されていること。
- **本番用シークレット**（`environments/prod.secret.env`）が用意されていること。Cognito の Google/GitHub IdP を維持するには `TF_VAR_google_oauth_client_secret` と `TF_VAR_github_oauth_client_secret` が必須。未設定だと apply 後に「Login option is not available」になる（[トラブルシュート](../../guides/troubleshooting-cognito-google-callback.md) 参照）。
- 適用する人が、本番用 AWS アカウントで Terraform を実行する権限を持っていること。

### 重要: apply の前に必ず環境変数を渡す

本番で `terraform apply` を実行する**前**に、**必ず** `prod.secret.env` を読み込んで環境変数（`TF_VAR_*`）を渡してから apply すること。  
単に `source` しただけではシェルによっては terraform に変数が渡らないため、**Bash の場合は `set -a` で export してから読み込む**手順を推奨（[本番デプロイ・認証完了ログ](../20260208/prod-deploy-and-auth-complete.md)、[GitHub and Deploy Guide](../../guides/github-and-deploy-guide.md) も参照）。

### 実行手順（要約）

**Bash / Git Bash の場合:**

```bash
cd terraform
terraform workspace select prod

# 本番用シークレットを環境変数に export（必須）
set -a && source environments/prod.secret.env && set +a

terraform plan -var-file=environments/prod.tfvars
# 変更内容を確認し、API Lambda の更新が含まれることを確認

terraform apply -var-file=environments/prod.tfvars
# プロンプトで yes を入力して適用
```

**PowerShell の場合（環境変数を渡してから apply）:**

```powershell
cd terraform
terraform workspace select prod

# 本番用シークレットを環境変数に読み込む
Get-Content environments/prod.secret.env | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim(), 'Process')
  }
}

terraform plan -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

- `prod.secret.env` が無い場合は `terraform/environments/prod.secret.env.example` をコピーして `prod.secret.env` を作成し、GCP / GitHub の Client Secret を記入する。
- `plan` で **aws_lambda_function.main (api)** の `source_code_hash` が変わっていることを確認できれば、今回の router.mjs / notes.mjs の変更がデプロイされます。
- `apply` 後、本番 API の URL は変わらないので、フロントの `VITE_ZEDI_API_BASE_URL` の変更は不要です。

---

## 3. 本番フロントのデプロイ

### やること

Vite で本番用にビルドし、成果物を**本番 S3 バケット**にアップロードし、**本番 CloudFront** のキャッシュを無効化する。

### 前提

- プロジェクトルートに **`.env.production`** があり、少なくとも次の値が設定されていること。
  - `PROD_FRONTEND_S3_BUCKET` … 本番フロント用 S3 バケット名
  - `PROD_CLOUDFRONT_DISTRIBUTION_ID` … 本番 CloudFront の Distribution ID
  - `VITE_ZEDI_API_BASE_URL` … 本番 API の URL（例: `terraform output -raw api_invoke_url`）
  - その他、`VITE_COGNITO_*` や `VITE_REALTIME_URL` など、本番用に必要な VITE\_\* 変数
- AWS CLI が**本番用の認証**で、該当 S3 への書き込みと CloudFront の無効化ができること。

### 実行コマンド（手動デプロイ）

```bash
# プロジェクトルートで
bun run deploy:prod
```

- スクリプトが `.env.production` を読み込み、`bun run build` → `aws s3 sync dist/ ...` → `aws cloudfront create-invalidation ...` を順に実行します。
- 詳細: [docs/guides/aws-production-deploy.md](../../guides/aws-production-deploy.md)

### 別の方法: GitHub Actions

`main` ブランチへ push すると、対象ファイルに変更があれば **Deploy Frontend (prod)** ワークフローが動きます。その場合は、GitHub Secrets に本番用の値（S3 バケット、CloudFront ID、VITE\_\* など）が登録されている必要があります。

---

## 作業順序のまとめ

1. **本番 DB**: `CLUSTER_ARN` / `SECRET_ARN` を本番に合わせて 006 → 007 を実行。
2. **本番 API**: `terraform workspace select prod` の上で、**必ず `prod.secret.env` を読み込んでから** `terraform apply -var-file=environments/prod.tfvars`（Bash: `set -a && source environments/prod.secret.env && set +a` してから apply）。
3. **本番フロント**: `.env.production` を用意した上で `bun run deploy:prod`（または main への push で GitHub Actions に任せる）。

この順で行えば、本番環境にも「ノート公開・Discover・権限分離」の変更が安全に反映されます。

---

## 参照ドキュメント

| ドキュメント                                                                                                      | 内容                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [docs/guides/aws-production-deploy.md](../../guides/aws-production-deploy.md)                                     | 本番インフラ・フロントデプロイの全体手順                                                   |
| [docs/guides/github-and-deploy-guide.md](../../guides/github-and-deploy-guide.md)                                 | Terraform 本番運用・シークレット読み込み                                                   |
| [docs/guides/troubleshooting-cognito-google-callback.md](../../guides/troubleshooting-cognito-google-callback.md) | IdP 未作成・「Login option is not available」の対処（§A: set -a で export してから apply） |
| [docs/work-logs/20260208/prod-deploy-and-auth-complete.md](../20260208/prod-deploy-and-auth-complete.md)          | 本番デプロイ・認証完了時の手順（prod.secret.env を export してから apply）                 |
| [terraform/environments/prod.secret.env.example](../../../terraform/environments/prod.secret.env.example)         | 本番用シークレットのテンプレート（TF*VAR*\*）                                              |
