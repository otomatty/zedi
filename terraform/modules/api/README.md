# Zedi REST API Module (C1-2)

API Gateway HTTP API + Lambda + Cognito JWT Authorizer の基盤です。

## 構成

- **API Gateway HTTP API**: `/api`, `/api/{proxy+}` を Lambda にルーティング
- **Cognito JWT Authorizer**: `Authorization: Bearer <id_token>` を検証（`/api/health` は認証なし）
- **Lambda**: Node 20、ルーター + 共通エラーハンドリング（`lambda/` 配下）

## ルート

| パス | 認証 | 説明 |
|------|------|------|
| `GET /api/health` | 不要 | ヘルスチェック |
| `GET /api/me` | 必須 | 現在ユーザー（JWT claims の sub, email） |
| `POST /api/users/upsert` | 必須 | Cognito sub/email から users を upsert（body: display_name?, avatar_url?） |
| `GET /api/users/:id` | 必須 | ユーザー情報取得 |
| その他 `/api/*` | 必須 | 404 |

## デプロイ

ルートで `terraform apply` を実行すると、api モジュール内で **`npm ci` が自動実行**され（`package.json` / `package-lock.json` 変更時）、そのあと `lambda/` が ZIP されて Lambda にデプロイされます。手動で `npm install` する必要はありません。

## 環境変数（Lambda）

- `ENVIRONMENT`: dev / prod
- `AURORA_DATABASE_NAME`, `DB_CREDENTIALS_SECRET`, `AURORA_CLUSTER_ARN`: RDS Data API 用（users API で使用）
