# GitHub Environment 設定値の取得方法

**目的:** `development` および `production` 環境に登録する Secrets と Variables の値を、どこから・どのように取得するかをまとめたドキュメント。

**関連:** `docs/plans/20260302/environment-audit-report.md`、`docs/plans/20260302/develop-cicd-parity-work-plan.md`

---

## 1. 一覧

### 1.1 Environment Secrets（development / production 共通 + Terraform 用）

| Secret                  | 取得元     | セクション                        |
| ----------------------- | ---------- | --------------------------------- |
| `DATABASE_URL`          | Railway    | [§2.1](#21-database_url)          |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare | [§2.2](#22-cloudflare_api_token)  |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare | [§2.3](#23-cloudflare_account_id) |
| `TF_API_TOKEN`          | Terraform  | [§2.4](#24-tf_api_token)          |

**注:** `RAILWAY_TOKEN` は不要（Railway の GitHub 連携でデプロイするため）。`TF_API_TOKEN` は Terraform Cloud を GitHub Actions から実行する environment に登録する。

### 1.2 Environment Variables（development / production 共通）

| Variable           | 取得元  | セクション                                    |
| ------------------ | ------- | --------------------------------------------- |
| `API_BASE_URL`     | Railway | [§3.1](#31-api_base_url)                      |
| `REALTIME_URL`     | Railway | [§3.2](#32-realtime_url)                      |
| `POLAR_MONTHLY_ID` | Polar   | [§3.3](#33-polar_monthly_id--polar_yearly_id) |
| `POLAR_YEARLY_ID`  | Polar   | [§3.3](#33-polar_monthly_id--polar_yearly_id) |

---

## 2. Environment Secrets の取得方法

### 2.1 DATABASE_URL

**用途:** drizzle-kit migrate（DB マイグレーション）の接続文字列。

**取得元:** Railway Dashboard

**手順:**

1. [Railway Dashboard](https://railway.com/) にログイン
2. **Zedi** プロジェクトを開く
3. **development** または **production** 環境を選択
4. **Postgres** サービス（または PostgreSQL データベース）をクリック
5. **Variables** タブを開く
6. **Settings** → **Networking** → **TCP Proxy** が有効であることを確認
7. **GitHub Actions 用**: Railway の `DATABASE_PUBLIC_URL` の**値**をコピーし、GitHub の Environment secret として `DATABASE_URL` という**名前**で登録する。内部用の `DATABASE_URL` を誤ってコピーしないこと

**形式例:** `postgresql://user:PASSWORD@host.proxy.rlwy.net:PORT/dbname`

**GitHub Secrets 登録時の注意:**

- パスワードに `$`, `@`, `#`, `&` などの特殊文字が含まれる場合、GitHub Actions で誤解釈されることがあります
- パスワード部分を URL エンコードしてから登録すると回避できます（例: `$` → `%24`, `@` → `%40`）
- コピー時に前後の空白・改行が入らないように注意

**注意:** development と production では**別のデータベース**の URL を使用する。環境を間違えないこと。

---

### 2.2 CLOUDFLARE_API_TOKEN

**用途:** Cloudflare Pages へのデプロイ（wrangler pages deploy）。

**取得元:** Cloudflare Dashboard

**手順:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 右サイドバー下部の **My Profile** → **API Tokens**
3. **Create Token** をクリック
4. **Custom token** を選択、またはテンプレート「Edit Cloudflare Workers」をベースにする
5. 権限を設定:

- **Account** → **Cloudflare Pages** → **Edit**

6. **Account Resources** で対象のアカウントを選択
7. **Continue to summary** → **Create Token**
8. **表示されたトークンをコピー**（この画面を閉じると二度と表示されない）

**参考:** [Cloudflare: Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

---

### 2.3 CLOUDFLARE_ACCOUNT_ID

**用途:** wrangler が Cloudflare API を呼ぶ際のアカウント識別子。

**取得元:** Cloudflare Dashboard

**手順:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 任意のドメイン（例: zedi-note.app）を選択
3. 右サイドバーの **API** セクションに **Account ID** が表示される
4. または Workers & Pages のページを開くと、URL に含まれる: `dash.cloudflare.com/{ACCOUNT_ID}/...`

**形式:** 32 文字の英数字（例: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`）

**注意:** 同一 Cloudflare アカウント内なら、development と production で同じ Account ID を使用する。

---

### 2.4 TF_API_TOKEN

**用途:** GitHub Actions から Terraform Cloud（HCP Terraform）に対して `terraform init` / `plan` / `apply` を実行する際の認証。

**取得元:** Terraform Cloud

**手順:**

1. [Terraform Cloud](https://app.terraform.io/) にログイン
2. 右上のユーザーメニュー → **User settings**
3. **Tokens** を開く
4. **Create an API token** をクリック
5. 分かりやすい名前を付けて発行し、表示されたトークンをコピーする
6. GitHub の Terraform を実行する各 Environment secret（`development` と `production`）に `TF_API_TOKEN` の名前で登録する

**用途補足:**

- GitHub Actions では `TF_TOKEN_app_terraform_io` 環境変数として渡す
- Cloudflare Provider 用には、同一の `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を **TF_VAR_cloudflare_api_token** / **TF_VAR_cloudflare_account_id** として各 Terraform workflow（shared / dev / prod）で渡している
- `deploy-prod.yml` の Apply Cloudflare (Prod)、`deploy-dev.yml` の Apply Cloudflare (Dev)、および `terraform-cloudflare-*.yml` の plan/apply で使用する

---

## 3. Environment Variables の取得方法

### 3.1 API_BASE_URL

**用途:** フロントエンドビルド時に `VITE_API_BASE_URL` として埋め込む API の URL。

**取得元:** Railway Dashboard またはサービス URL

| 環境        | 値の例                                                    |
| ----------- | --------------------------------------------------------- |
| development | `https://api-development-b126.up.railway.app`             |
| production  | `https://api.zedi-note.app` または Railway の公開ドメイン |

**手順:**

1. [Railway Dashboard](https://railway.com/) → Zedi プロジェクト
2. 対象環境（development / production）を選択
3. **api** サービスをクリック
4. **Settings** → **Networking** → **Public Networking** のドメインを確認
5. `https://` を付けた URL をコピー

**カスタムドメイン:** production で `api.zedi-note.app` などを使用している場合は、その値を設定する。

---

### 3.2 REALTIME_URL

**用途:** フロントエンドビルド時に `VITE_REALTIME_URL` として埋め込む Hocuspocus の WebSocket URL。

**取得元:** Railway Dashboard またはサービス URL

| 環境        | 値の例                                                       |
| ----------- | ------------------------------------------------------------ |
| development | `wss://hocuspocus-development.up.railway.app`                |
| production  | `wss://realtime.zedi-note.app` または Railway の公開ドメイン |

**手順:**

1. [Railway Dashboard](https://railway.com/) → Zedi プロジェクト
2. 対象環境を選択
3. **hocuspocus** サービスをクリック
4. **Settings** → **Networking** → **Public Networking** のドメインを確認
5. プロトコルは `**wss://`\*\*（HTTPS の場合は `wss`、HTTP の場合は `ws`）

**注意:** Hocuspocus は HTTP で動いていても、フロントが HTTPS で配信される場合は `wss://` が必要。Railway のデフォルトドメインは HTTPS なので `wss://` を使用する。

---

### 3.3 POLAR_MONTHLY_ID / POLAR_YEARLY_ID

**用途:** フロントエンドビルド時に Pro プラン（月額/年額）のチェックアウト用プロダクト ID を埋め込む。

**取得元:** [Polar Dashboard](https://polar.sh/)

**手順:**

1. [Polar Dashboard](https://polar.sh/) にログイン
2. **Products** を開く
3. Pro プランの月額・年額プロダクトを選択
4. 各プロダクトの **ID** をコピー

- URL や詳細ページに表示される（例: `prod_xxxxx` 形式）

**環境別:**

| 環境        | Polar のモード | 備考                                                 |
| ----------- | -------------- | ---------------------------------------------------- |
| development | Sandbox        | Sandbox のプロダクト ID を使用。本番課金は発生しない |
| production  | Production     | 本番のプロダクト ID を使用                           |

**詳細:** `docs/specs/polar-setup.md` を参照。

---

## 4. 設定の流れ（チェックリスト）

### development 環境

- [ ] `DATABASE_URL` — Railway → development の Postgres
- [ ] `CLOUDFLARE_API_TOKEN` — Cloudflare → API Tokens
- [ ] `CLOUDFLARE_ACCOUNT_ID` — Cloudflare Dashboard の Account ID
- [ ] `API_BASE_URL` — Railway → api サービスの公開 URL（development）
- [ ] `REALTIME_URL` — Railway → hocuspocus サービスの公開 URL（development、`wss://`）
- [ ] `POLAR_MONTHLY_ID` — Polar Sandbox → 月額プロダクト ID
- [ ] `POLAR_YEARLY_ID` — Polar Sandbox → 年額プロダクト ID

### production 環境

- [ ] `DATABASE_URL` — Railway → production の Postgres
- [ ] `CLOUDFLARE_API_TOKEN` — 上記と同じトークンを流用可能
- [ ] `CLOUDFLARE_ACCOUNT_ID` — 上記と同じ ID を流用可能
- [ ] `API_BASE_URL` — Railway → api サービスの公開 URL（production）
- [ ] `REALTIME_URL` — Railway → hocuspocus サービスの公開 URL（production、`wss://`）
- [ ] `POLAR_MONTHLY_ID` — Polar Production → 月額プロダクト ID
- [ ] `POLAR_YEARLY_ID` — Polar Production → 年額プロダクト ID

---

## 5. 関連ドキュメント

| ドキュメント                 | パス                                                   |
| ---------------------------- | ------------------------------------------------------ |
| Environment 監査・方針       | `docs/plans/20260302/environment-audit-report.md`      |
| develop CI/CD 作業計画       | `docs/plans/20260302/develop-cicd-parity-work-plan.md` |
| Railway 開発環境セットアップ | `docs/specs/railway-dev-setup.md`                      |
| Polar セットアップ           | `docs/specs/polar-setup.md`                            |
