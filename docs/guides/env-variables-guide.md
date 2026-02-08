# .env 設定ガイド

フロントエンド（Vite）で参照する環境変数の一覧と取得方法です。

---

## 必須（Cognito 認証）

| 変数名 | 説明 | 取得方法 | 例（開発） |
|--------|------|----------|-------------|
| **VITE_COGNITO_DOMAIN** | Cognito の OAuth ドメイン（ホストのみ。`https://` は付けない） | Terraform: `terraform -chdir=terraform output -raw cognito_hosted_ui_url` の値から `https://` を除いたもの | `zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com` |
| **VITE_COGNITO_CLIENT_ID** | Cognito アプリクライアント ID | Terraform: `terraform -chdir=terraform output -raw cognito_client_id` | `3oace2ln47tv6btvftfkkt5qm1` |

**開発環境で Terraform をまだ apply していない場合**  
`docs/work-logs/20260131/aws-connection-summary.md` の「1.1 Cognito」の表を参照してください（Hosted UI の URL から `https://` を除いたものが Domain、Client ID はそのまま）。

---

## 任意（Cognito）

| 変数名 | 説明 | 省略時の動き |
|--------|------|----------------|
| **VITE_COGNITO_REDIRECT_URI** | OAuth コールバック URL | ブラウザの `window.location.origin + '/auth/callback'` を使用 |
| **VITE_COGNITO_LOGOUT_REDIRECT_URI** | ログアウト後のリダイレクト先 | `window.location.origin` を使用 |

**明示的に設定する場合の例**

- 開発: `http://localhost:30000/auth/callback` / `http://localhost:30000`
- 本番: `https://zedi-note.app/auth/callback` / `https://zedi-note.app`

※ Terraform の `cognito_callback_urls` / `cognito_logout_urls` に同じ URL を登録しておく必要があります。

---

## その他（アプリ機能用）

| 変数名 | 説明 | 取得方法・例 |
|--------|------|----------------|
| **VITE_TURSO_DATABASE_URL** | Turso DB の URL | [Turso](https://turso.tech/app) のダッシュボード |
| **VITE_TURSO_AUTH_TOKEN** | Turso 用 JWT またはトークン（フォールバック用） | Turso ダッシュボード / 既存の Clerk JWT の代替 |
| **VITE_AI_API_BASE_URL** | AI API（Workers 等）のベース URL | 例: `https://zedi-ai-api-dev.xxx.workers.dev` |
| **VITE_THUMBNAIL_API_BASE_URL** | サムネイル API のベース URL | 利用している API の URL |
| **VITE_REALTIME_URL** | Hocuspocus WebSocket URL | Terraform: `terraform -chdir=terraform output -raw websocket_url`。開発ローカル: `ws://localhost:1234` |
| **VITE_E2E_TEST** | E2E テスト時は `true` | 通常は未設定。E2E 時のみ `true` でモック認証を使用 |

---

## 開発用 .env の例

```env
# Cognito（必須）
VITE_COGNITO_DOMAIN=zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=3oace2ln47tv6btvftfkkt5qm1

# 開発でポート 30000 を使う場合（任意）
VITE_COGNITO_REDIRECT_URI=http://localhost:30000/auth/callback
VITE_COGNITO_LOGOUT_REDIRECT_URI=http://localhost:30000

# Turso
VITE_TURSO_DATABASE_URL=libsql://your-db.turso.io
VITE_TURSO_AUTH_TOKEN=your-token

# API（必要に応じて）
VITE_AI_API_BASE_URL=https://your-ai-api.workers.dev
VITE_THUMBNAIL_API_BASE_URL=https://your-thumbnail-api.workers.dev

# リアルタイム（ローカル Hocuspocus または AWS ALB）
VITE_REALTIME_URL=ws://localhost:1234
# または
# VITE_REALTIME_URL=ws://zedi-dev-alb-xxxxx.ap-northeast-1.elb.amazonaws.com
```

※ 上記の Cognito の値は `docs/work-logs/20260131/aws-connection-summary.md` の dev 環境の例です。実際の値は `terraform output` または AWS コンソールで確認してください。

---

## 本番用の目安

- **VITE_COGNITO_DOMAIN** / **VITE_COGNITO_CLIENT_ID**: 本番用 Terraform（例: `prod.tfvars`）で apply した User Pool の Hosted UI ドメイン・クライアント ID。
- **VITE_COGNITO_REDIRECT_URI**: `https://zedi-note.app/auth/callback`
- **VITE_COGNITO_LOGOUT_REDIRECT_URI**: `https://zedi-note.app`
- **VITE_REALTIME_URL**: 本番の WebSocket URL（例: `wss://realtime.zedi-note.app`）

---

## Terraform から値を取り出すコマンド例

```bash
cd terraform

# Cognito Hosted UI URL（先頭の https:// を除いた部分が VITE_COGNITO_DOMAIN）
terraform output -raw cognito_hosted_ui_url

# Cognito Client ID
terraform output -raw cognito_client_id

# WebSocket URL（Hocuspocus）
terraform output -raw websocket_url
```

`cognito_hosted_ui_url` が `https://zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com` の場合、  
**VITE_COGNITO_DOMAIN** には `zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com` を設定します。
