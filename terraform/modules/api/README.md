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
| その他 `/api/*` | 必須 | 404（C1-3 以降で実装） |

## デプロイ

ルートで `terraform apply` を実行すると、`modules/api/lambda` が ZIP され Lambda にデプロイされます。Lambda のソースを変更した場合は `terraform apply` で再デプロイされます。

## 環境変数（Lambda）

- `ENVIRONMENT`: dev / prod
- `AURORA_DATABASE_NAME`, `DB_CREDENTIALS_SECRET`, `AURORA_CLUSTER_ARN`: C1-3 以降で RDS Data API 用
