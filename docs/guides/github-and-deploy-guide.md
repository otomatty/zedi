# GitHub 運用・デプロイガイド

GitHub で開発を進め、本番（zedi-note.app）に反映するまでの流れと、Terraform・Cloudflare を触るときの手順です。

---

## 1. フロントエンドを本番にデプロイする

### 1.1 自動デプロイ（GitHub Actions）

main ブランチに push すると、**対象パス**（`src/`, `public/`, `index.html`, `vite.config.ts`, `package.json`, `package-lock.json`）に変更があった場合に **Deploy Frontend (prod)** ワークフローが動きます。

- ビルド（本番用 VITE_* は GitHub Secrets から注入）
- S3 へアップロード（`zedi-prod-frontend-590183877893`）
- CloudFront のキャッシュ無効化（`/*`）

**手動でデプロイだけ実行したい場合**

1. GitHub リポジトリ → **Actions** → **Deploy Frontend (prod)**
2. **Run workflow** → ブランチを **main** にし、**Run workflow** をクリック

**初回前に必要なこと：GitHub Secrets の設定**（§2 参照）

---

### 1.2 手動デプロイ（ローカルから CLI）

自動デプロイを使わず、ローカルからデプロイする場合の手順です。

1. **本番用の環境変数でビルド**

   ```bash
   # プロジェクトルートで。.env.production または環境変数で本番用 VITE_* を設定してから
   bun run build
   ```

2. **S3 にアップロード**

   ```bash
   aws s3 sync dist/ s3://zedi-prod-frontend-590183877893/ --delete
   ```

3. **CloudFront のキャッシュを無効化**

   ```bash
   aws cloudfront create-invalidation --distribution-id E30K53ZAPT4J6C --paths "/*"
   ```

※ AWS CLI はあらかじめ本番用の認証（プロファイルまたは環境変数）で設定しておく。

---

## 2. GitHub Secrets の設定（デプロイ用）

**Deploy Frontend (prod)** を動かすには、リポジトリの **Settings → Secrets and variables → Actions** に以下を登録します。

### 2.1 必須

| Secret 名 | 説明 | 例・取得方法 |
|-----------|------|----------------------|
| **AWS_ACCESS_KEY_ID** | 本番 S3 に書き込める IAM のアクセスキー | IAM ユーザーで発行 |
| **AWS_SECRET_ACCESS_KEY** | 上記のシークレットキー | 同上 |
| **PROD_FRONTEND_S3_BUCKET** | 本番フロント用 S3 バケット名 | `zedi-prod-frontend-590183877893` |
| **PROD_CLOUDFRONT_DISTRIBUTION_ID** | CloudFront 配信 ID（無効化用） | `E30K53ZAPT4J6C` |
| **VITE_COGNITO_DOMAIN** | 本番 Cognito のホスト（https:// なし） | Terraform: `terraform output -raw cognito_hosted_ui_url` から `https://` を除く |
| **VITE_COGNITO_CLIENT_ID** | 本番 Cognito のクライアント ID | Terraform: `terraform output -raw cognito_client_id` |

### 2.2 本番アプリ動作に必要なもの（推奨）

| Secret 名 | 説明 | 例 |
|-----------|------|-----|
| **VITE_COGNITO_REDIRECT_URI** | 本番コールバック URL | `https://zedi-note.app/auth/callback` |
| **VITE_COGNITO_LOGOUT_REDIRECT_URI** | 本番ログアウト後 URL | `https://zedi-note.app` |
| **VITE_TURSO_DATABASE_URL** | 本番 Turso DB URL | libsql://... |
| **VITE_TURSO_AUTH_TOKEN** | 本番 Turso 用トークン | （利用する場合） |
| **VITE_AI_API_BASE_URL** | 本番 AI API の URL | Workers 等の URL |
| **VITE_THUMBNAIL_API_BASE_URL** | 本番サムネイル API の URL | 同上 |
| **VITE_REALTIME_URL** | 本番 WebSocket URL | `wss://...` または `ws://...`（本番 ALB 等） |

※ 未設定の項目はビルド時に空になり、アプリ側のフォールバックや未使用の場合は動作する場合があります。本番で使う機能に応じて設定してください。

**Terraform から値を確認する例**

```bash
cd terraform
terraform workspace select prod
terraform output -raw cognito_hosted_ui_url   # → https:// を除いたものが VITE_COGNITO_DOMAIN
terraform output -raw cognito_client_id
terraform output -raw cloudfront_domain_name # 参考（CNAME 先）
```

---

## 3. Terraform を変更するとき

本番（prod）のインフラを変える場合は、以下を守ってください。

### 3.1 基本の流れ

1. **workspace を選ぶ**

   ```bash
   cd terraform
   terraform workspace select prod   # 本番を触る場合
   # または
   terraform workspace select default  # dev の場合
   ```

2. **シークレットを読み込む（本番のみ）**

   ```bash
   source environments/prod.secret.env   # Bash の場合
   # Windows CMD の場合は set で TF_VAR_* を設定
   ```

3. **plan で確認してから apply**

   ```bash
   terraform plan -var-file=environments/prod.tfvars
   # 問題なければ
   terraform apply -var-file=environments/prod.tfvars
   ```

- **prod.secret.env** はリポジトリに含めず、手元だけで管理する（.gitignore 済み）。
- 本番の apply は state ロックに注意。長時間止まった場合は `terraform force-unlock <Lock ID>` の利用を検討（他に apply している人がいないことを確認してから）。

### 3.2 主な変数ファイル

| ファイル | 用途 |
|----------|------|
| **environments/prod.tfvars** | 本番用の公開パラメータ（ドメイン、インスタンス数など） |
| **environments/prod.secret.env** | 本番用の秘密（TF_VAR_*）。Git にコミットしない |
| **environments/dev.tfvars** | 開発用 |

---

## 4. Cloudflare を変更するとき

- **現状**：zedi-note.app の DNS（CNAME など）は Cloudflare ダッシュボードで手動編集。
- **今後**：DNS を Terraform で管理する場合は `docs/plans/20260208/cloudflare-dns-terraform-plan.md` のとおり Cloudflare Provider を導入する。

本番用 CNAME（@ と www → CloudFront）のメモは `docs/work-logs/20260208/frontend-cdn-and-cloudflare-summary.md` の「2.4 本番用 CNAME」にあります。

---

## 5. ブランチ・PR の流れ（目安）

- **develop** などで機能開発 → PR で **main** にマージ。
- main へのマージ後、フロントの対象パスに変更があれば **Deploy Frontend (prod)** が走り、本番に反映される。
- Terraform の変更も main（または運用ブランチ）にマージし、手元または CI で `terraform plan` / `apply` を実行。本番の apply 時は必ず `prod` workspace と `prod.tfvars` を使用する。

※ ブランチ戦略の詳細は `docs/guides/branch-strategy.md` があれば参照。

---

## 6. よく使うコマンド早見

| やりたいこと | コマンド例 |
|--------------|------------|
| 本番の Terraform 状態を確認 | `cd terraform && terraform workspace select prod && terraform plan -var-file=environments/prod.tfvars` |
| 本番の CloudFront ドメイン名を確認 | `terraform -chdir=terraform output -raw cloudfront_domain_name`（prod 選択済み前提） |
| 手動でフロントを本番デプロイ | `bun run build` → `aws s3 sync dist/ s3://zedi-prod-frontend-590183877893/ --delete` → `aws cloudfront create-invalidation --distribution-id E30K53ZAPT4J6C --paths "/*"` |
| 本番 Cognito の値を確認 | `terraform -chdir=terraform output cognito_hosted_ui_url cognito_client_id`（prod 選択済み前提） |

---

## 7. 参照ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| docs/guides/env-variables-guide.md | VITE_* の一覧と本番の目安 |
| docs/work-logs/20260208/frontend-cdn-and-cloudflare-summary.md | CDN・Cloudflare の詳細と CNAME メモ |
| docs/work-logs/20260208/work-summary-and-next-steps.md | 作業サマリーと今後の進め方 |
| docs/plans/20260208/aws-frontend-deploy-terraform-plan.md | フロントデプロイの設計 |
| .github/workflows/deploy-frontend.yml | デプロイワークフローの定義 |
