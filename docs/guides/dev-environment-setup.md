# 開発環境セットアップガイド

本番環境と開発環境を分離し、開発者データを同期する方法について説明します。

> **CI/CD:** `develop` への push で dev インフラ自動適用、`main` への push で本番フルデプロイ。詳細は `.github/workflows/` を参照。

> **データベースについて:** 本番・開発ともに **Aurora (PostgreSQL)** です。特定ユーザーのデータのみ本番↔開発で同期する方法は [Aurora 開発・本番同期の実装方針](../plans/aurora-dev-prod-sync-plan.md) を参照してください。

## 概要

```
┌─────────────────┐                     ┌─────────────────┐
│   Production    │                     │   Development   │
├─────────────────┤                     ├─────────────────┤
│ Aurora (RDS)    │ ←── sync script ──→ │ Aurora (RDS)    │
│ Cognito (prod)  │     (Aurora 用)      │ Cognito (dev)   │
│ 全ユーザーデータ │                     │ 開発者データのみ │
└─────────────────┘                     └─────────────────┘
```

- **本番環境**: 全ユーザーのデータを含む
- **開発環境**: 開発者のデータのみ（テストデータで本番DBを圧迫しない）
- **同期スクリプト**: `scripts/sync/sync-aurora-dev-data.ts`。RDS Data API で本番↔開発を同期します。

## 1. 環境変数ファイルの設定

### Viteの環境変数優先順位

Viteは以下の順序で環境変数ファイルを読み込みます（上から優先度が高い順）：

1. **`.env.[mode].local`** - 最優先（例: `.env.development.local`）
2. **`.env.local`** - 全環境共通のローカル設定
3. **`.env.[mode]`** - モード固有（例: `.env.development`, `.env.production`）
4. **`.env`** - デフォルト

> **重要**: `.env.local` と `.env.development` が両方存在する場合、**`.env.local` の方が優先されます**。
>
> 環境を正しく分離するには、以下のいずれかの方法を取ってください：
>
> **方法1: `.env.local` を削除**
>
> ```bash
> rm .env.local
> ```
>
> **方法2: `.env.local` をバックアップ**
>
> ```bash
> mv .env.local .env.local.backup
> ```
>
> **方法3: モード固有のローカルファイルを使用（推奨）**
>
> ```bash
> # .env.local を削除し、代わりに以下を使用
> # .env.development.local  (開発環境用)
> # .env.production.local   (本番環境用)
> ```

### Terraform で dev インフラを適用する場合

開発用インフラ（Cognito・API・Realtime 等）は **`dev` ワークスペース**で管理しています。

**CI/CD（推奨）:** `develop` ブランチに push/マージすると GitHub Actions が自動で `terraform apply`、DB マイグレーション、Hocuspocus デプロイを実行します（`.github/workflows/deploy-dev.yml`）。

**ローカルで手動適用する場合:**

1. **シークレットを用意**: `terraform/environments/dev.secret.env.example` をコピーして `dev.secret.env` を作成し、`TF_VAR_google_oauth_client_secret` と `TF_VAR_github_oauth_client_secret` を設定する。
2. **適用**:
   ```bash
   cd terraform
   terraform workspace select dev
   set -a && source environments/dev.secret.env && set +a
   terraform plan -var-file=environments/dev.tfvars
   terraform apply -var-file=environments/dev.tfvars
   ```
3. 必要な値は `terraform output` で確認できる。`.env.development` の値はこの出力に合わせる。

### 開発環境（.env.development）

Cognito の開発用 User Pool および Aurora 開発用の接続情報を設定します。Terraform の出力や AWS コンソールから取得してください。

```bash
# Cognito（開発用 User Pool）
VITE_COGNITO_DOMAIN=your-dev-user-pool-domain.auth.ap-northeast-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=your_dev_client_id

# REST API（開発用 API Gateway / Lambda）
VITE_ZEDI_API_BASE_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com

# Realtime（開発用 Hocuspocus 等）
VITE_REALTIME_URL=ws://localhost:1234
```

### 本番環境（.env.production）

本番用の Cognito / API / Realtime の URL を設定します。`.env.production.example` をコピーして値を埋めてください。

## 2. 開発者データ同期の設定（Aurora 用）

開発者のデータのみ本番↔開発で同期するには、`dev-user-mapping-aurora.json` を用意します。

### 設定ファイルの作成

```bash
cp scripts/sync/dev-user-mapping-aurora.example.json scripts/sync/dev-user-mapping-aurora.json
```

`scripts/sync/dev-user-mapping-aurora.json` を編集し、同期対象の開発者を追加します。`email` のみ指定するか、本番・開発の Cognito `sub` を直接指定できます。

### cognito_sub の取得

本番・開発の Aurora に接続するための環境変数（`PROD_AURORA_CLUSTER_ARN`, `PROD_AURORA_SECRET_ARN`, `DEV_AURORA_CLUSTER_ARN`, `DEV_AURORA_SECRET_ARN`）を設定したうえで：

```bash
bun run sync:aurora:resolve-cognito
```

表示された本番・開発の `cognito_sub` を `dev-user-mapping-aurora.json` の各開発者の `productionCognitoSub` / `developmentCognitoSub` にコピーしてください。

詳細は [scripts/sync/README.md](../../scripts/sync/README.md) および [Aurora 同期スクリプト仕様](../plans/aurora-sync-script-spec.md) を参照してください。

## 3. データ同期の実行

```bash
# ドライラン（変更しない）
bun run sync:aurora:dry

# 同期実行（設定の direction に従う。既定は dev-to-prod）
bun run sync:aurora:dev

# 本番 → 開発 のみ
bun run sync:aurora:prod-to-dev

# 開発 → 本番 のみ
bun run sync:aurora:dev-to-prod
```

## 4. 開発ワークフロー

### 日常の開発

```bash
# 開発サーバー起動（.env.development を自動使用）
bun run dev

# 本番データを開発環境に同期
bun run sync:aurora:prod-to-dev
```

### ビルド

```bash
# 本番ビルド（.env.production を使用）
bun run build

# 開発モードビルド（デバッグ用）
bun run build:dev
```

## 5. Git フックの有効化（任意）

コミット前に Terraform ファイルを自動でフォーマットし、CI の `terraform fmt -check` を通過させたい場合は、**1 回だけ** 以下を実行してください。

```bash
git config core.hooksPath .githooks
```

macOS / Linux では、初回に実行権を付与してください。

```bash
chmod +x .githooks/pre-commit
```

（Windows の Git Bash / WSL でも上記 `git config` で有効になります。）

これにより、`git commit` の直前に `terraform fmt -recursive` が実行され、変更された `.tf` / `.tfvars` が自動でステージされます。エディタの設定を共有しなくても、リポジトリ側でフォーマット品質を揃えられます。

- フックを実行したくない場合は `git commit --no-verify` でスキップできます。
- Terraform が未インストールの場合はフックは何も行いません。

## トラブルシューティング

### 「Configuration file not found」エラー

```bash
cp scripts/sync/dev-user-mapping-aurora.example.json scripts/sync/dev-user-mapping-aurora.json
```

編集して開発者（email または productionCognitoSub / developmentCognitoSub）を追加してください。

### 本番にユーザーが存在しない場合

本番 Aurora の `users` に開発者がいない場合は、Cognito で sub を確認し、次で手動投入できます（要 `PROD_AURORA_*` 環境変数）：

```bash
bun run sync:aurora:insert-user -- --email "your@example.com" --cognito-sub "..." --target prod
```

## セキュリティ注意事項

以下のファイルは `.gitignore` に含まれており、コミットされません：

- `.env.development`
- `.env.production`
- `scripts/sync/dev-user-mapping-aurora.json`

これらのファイルには認証情報が含まれるため、**絶対に Git にコミットしないでください**。
