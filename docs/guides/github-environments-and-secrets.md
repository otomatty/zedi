# GitHub Environments とシークレット設定（dev / prod）

`deploy-dev.yml` と `deploy-prod.yml` が動作するには、GitHub の **Environments** に **dev** と **prod** を作成し、各 Environment に必要な **Environment secrets** を登録する必要があります。

Repository secrets だけでは不十分です。ワークフローで `environment: dev` / `environment: prod` を指定しているため、**各 Environment に紐づくシークレット** が参照されます。

| 環境     | 必須シークレット数 | 備考                                               |
| -------- | ------------------ | -------------------------------------------------- |
| **dev**  | 4                  | AWS 2 + OAuth 2。サムネイル用は任意 2              |
| **prod** | 11                 | AWS 2 + OAuth 2 + VITE\_\* 7。サムネイル用は任意 2 |

---

## 1. 作業場所

1. リポジトリの **Settings** → **Environments**
2. Environment がなければ **New environment** で作成
3. 各 Environment を開き、**Environment secrets**（または **Secrets and variables** → **Secrets**）でシークレットを追加

---

## 2. dev 環境の設定

### 2.1 Environment の作成

- **Name:** `dev`（小文字の `dev` であること）
- 必要に応じて Protection rules（Required reviewers 等）を設定

### 2.2 必須シークレット

| シークレット名                      | 説明                                                |
| ----------------------------------- | --------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`                 | AWS IAM の Access Key ID（dev 用）                  |
| `AWS_SECRET_ACCESS_KEY`             | 上記キーに対応する Secret Access Key                |
| `TF_VAR_GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth クライアントシークレット（Cognito 用） |
| `TF_VAR_GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth クライアントシークレット（Cognito 用） |

### 2.3 任意シークレット

| シークレット名                                    | 説明                                              |
| ------------------------------------------------- | ------------------------------------------------- |
| `TF_VAR_THUMBNAIL_GOOGLE_CUSTOM_SEARCH_API_KEY`   | Google Custom Search API キー（サムネイル検索用） |
| `TF_VAR_THUMBNAIL_GOOGLE_CUSTOM_SEARCH_ENGINE_ID` | Google Custom Search の検索エンジン ID            |

### 2.4 トリガー

- **push** が **develop** ブランチに入ったとき
- または **workflow_dispatch**（手動実行）

---

## 3. prod 環境の設定

### 3.1 Environment の作成

- **Name:** `prod`（小文字の `prod` であること）
- 本番用のため、**Required reviewers** の設定を推奨

### 3.2 必須シークレット

#### AWS・Terraform 用（dev と同様）

| シークレット名                      | 説明                                                |
| ----------------------------------- | --------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`                 | AWS IAM の Access Key ID（prod 用）                 |
| `AWS_SECRET_ACCESS_KEY`             | 上記キーに対応する Secret Access Key                |
| `TF_VAR_GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth クライアントシークレット（Cognito 用） |
| `TF_VAR_GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth クライアントシークレット（Cognito 用） |

#### フロントエンドビルド用（prod のみ）

REST API（Zedi・AI HTTP・サムネイル）は **1 つのベース URL** で共通化しており、管理するシークレットを減らしています。

| シークレット名                     | 説明                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `VITE_COGNITO_DOMAIN`              | Cognito のドメイン（例: `xxx.auth.ap-northeast-1.amazoncognito.com`）                       |
| `VITE_COGNITO_CLIENT_ID`           | Cognito ユーザープールのクライアント ID                                                     |
| `VITE_COGNITO_REDIRECT_URI`        | ログイン後のリダイレクト URI                                                                |
| `VITE_COGNITO_LOGOUT_REDIRECT_URI` | ログアウト後のリダイレクト URI                                                              |
| `VITE_ZEDI_API_BASE_URL`           | **REST API 共通のベース URL**（Zedi API・AI API・サムネイル API のいずれもこの 1 つを参照） |
| `VITE_AI_WS_URL`                   | AI ストリーミング用 WebSocket の URL（`wss://...`）                                         |
| `VITE_REALTIME_URL`                | リアルタイム協調編集（Hocuspocus）の WebSocket URL                                          |

上記のうち URL 系の値は、Terraform 適用後に [§6 値の取得方法](#6-値の取得方法prod-の-vite_) を参照してください。

### 3.3 任意シークレット

| シークレット名                                    | 説明                                   |
| ------------------------------------------------- | -------------------------------------- |
| `TF_VAR_THUMBNAIL_GOOGLE_CUSTOM_SEARCH_API_KEY`   | Google Custom Search API キー          |
| `TF_VAR_THUMBNAIL_GOOGLE_CUSTOM_SEARCH_ENGINE_ID` | Google Custom Search の検索エンジン ID |

### 3.4 トリガー

- **push** が **main** ブランチに入ったとき
- または **workflow_dispatch**（手動実行）

---

## 4. チェックリスト

### dev

- [ ] Environment **dev** を作成した
- [ ] `AWS_ACCESS_KEY_ID` を **dev** の Environment secrets に追加した
- [ ] `AWS_SECRET_ACCESS_KEY` を **dev** の Environment secrets に追加した
- [ ] `TF_VAR_GOOGLE_OAUTH_CLIENT_SECRET` を **dev** に追加した
- [ ] `TF_VAR_GITHUB_OAUTH_CLIENT_SECRET` を **dev** に追加した
- [ ] （任意）サムネイル用の 2 つのシークレットを **dev** に追加した

### prod

- [ ] Environment **prod** を作成した
- [ ] 上記 4 つの AWS・Terraform 用シークレットを **prod** に追加した
- [ ] フロントエンド用の 7 つの `VITE_*` シークレットを **prod** に追加した（Cognito 4 + API 1 + WebSocket 2）
- [ ] （任意）サムネイル用の 2 つのシークレットを **prod** に追加した
- [ ] （推奨）**prod** に Required reviewers を設定した

---

## 5. 注意事項

- **シークレット名は大文字・小文字を含め、上記と完全に一致させる**必要があります（例: `AWS_ACCESS_KEY_ID` であって `aws_access_key_id` ではない）。
- dev と prod では **別の AWS 認証情報**（別 IAM ユーザー／ロール）を使うことを推奨します。
- 本番用の `VITE_*` の値は、Terraform で作成された Cognito / API Gateway 等の実際の URL に合わせて設定してください（取得方法は次節参照）。

---

## 6. 値の取得方法（prod の VITE\_\*）

Terraform を **prod** ワークスペースで適用したあと、以下で値を取得できます。`terraform -chdir=terraform workspace select prod` のうえで実行してください。

| シークレット名                     | 取得方法                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_ZEDI_API_BASE_URL`           | `terraform output -raw api_invoke_url`（例: `https://xxx.execute-api.ap-northeast-1.amazonaws.com`）                                         |
| `VITE_AI_WS_URL`                   | `terraform output -raw ai_api_websocket_url`（例: `wss://xxx.execute-api.ap-northeast-1.amazonaws.com/production`）                          |
| `VITE_REALTIME_URL`                | `terraform output -raw websocket_url`（本番ではカスタムドメインの場合は `wss://realtime.zedi-note.app` 等に差し替え）                        |
| `VITE_COGNITO_DOMAIN`              | `terraform output -raw cognito_hosted_ui_url` の `https://` を除いた値（例: `zedi-prod-123456789012.auth.ap-northeast-1.amazoncognito.com`） |
| `VITE_COGNITO_CLIENT_ID`           | `terraform output -raw cognito_client_id`                                                                                                    |
| `VITE_COGNITO_REDIRECT_URI`        | 本番フロントの URL + コールバックパス（例: `https://zedi-note.app/auth/callback`）                                                           |
| `VITE_COGNITO_LOGOUT_REDIRECT_URI` | 本番フロントのルート URL（例: `https://zedi-note.app`）                                                                                      |

AWS 認証情報（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`）は IAM でアクセスキーを作成して取得します。Google / GitHub の OAuth クライアントシークレットは、それぞれ GCP Console の認証情報・GitHub の OAuth App 設定から取得または再生成します。

---

## 7. 関連ワークフロー・ドキュメント

- `.github/workflows/deploy-dev.yml` — develop への push で dev デプロイ
- `.github/workflows/deploy-prod.yml` — main への push で prod デプロイ
- `docs/guides/dev-environment-setup.md` — ローカル開発環境のセットアップ
- `docs/guides/aws-production-deploy.md` — 本番デプロイの概要
- `docs/guides/iam-policies-for-deploy.md` — dev / prod 用 IAM ユーザーに必要なポリシー
