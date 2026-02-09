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
| `GET /api/sync/pages?since=` | 必須 | 自分のページのメタデータ差分（pages, links, ghost_links）。`since` は ISO8601（省略時は全件） |
| `POST /api/sync/pages` | 必須 | ローカル変更の一括送信（LWW）。body: `pages`, `links?`, `ghost_links?`。競合は `conflicts` で返却 |
| `GET /api/pages/:id/content` | 必須 | Y.Doc 状態の取得（base64 + version）。自分のページのみ |
| `PUT /api/pages/:id/content` | 必須 | Y.Doc 状態の保存。body: `ydoc_state` (base64), `content_text?`, `version?`（楽観的ロック） |
| `POST /api/pages` | 必須 | ページ作成。body: `id?`, `title?`, `content_preview?`, `source_page_id?`, `thumbnail_url?`, `source_url?` |
| `DELETE /api/pages/:id` | 必須 | ページ論理削除（is_deleted = true） |
| `GET /api/notes` | 必須 | 自分がアクセス可能なノート一覧（owner または member） |
| `GET /api/notes/:id` | 必須 | ノート詳細 + ページ一覧 |
| `POST /api/notes` | 必須 | ノート作成。body: `id?`, `title?`, `visibility?` |
| `PUT /api/notes/:id` | 必須 | ノート更新（オーナーのみ）。body: `title?`, `visibility?` |
| `DELETE /api/notes/:id` | 必須 | ノート論理削除（オーナーのみ） |
| `POST /api/notes/:id/pages` | 必須 | 既存ページ追加 `{ "pageId": "uuid" }` または新規ページ作成 `{ "title": "..." }`（owner_id = notes.owner_id） |
| `DELETE /api/notes/:id/pages/:pageId` | 必須 | ノートからページを削除（論理削除） |
| `GET /api/notes/:id/members` | 必須 | メンバー一覧 |
| `POST /api/notes/:id/members` | 必須 | メンバー招待（オーナーのみ）。body: `member_email`, `role?` |
| `DELETE /api/notes/:id/members/:email` | 必須 | メンバー削除（オーナーのみ、論理削除） |
| `GET /api/search?q=&scope=shared` | 必須 | 共有ノートの全文検索（自分がアクセス可能なノート内のページを title / content_text で LIKE 検索、pg_bigm） |
| その他 `/api/*` | 必須 | 404 |

## デプロイ

ルートで `terraform apply` を実行すると、api モジュール内で **`npm ci` が自動実行**され（`package.json` / `package-lock.json` 変更時）、そのあと `lambda/` が ZIP されて Lambda にデプロイされます。手動で `npm install` する必要はありません。

## 環境変数（Lambda）

- `ENVIRONMENT`: dev / prod
- `AURORA_DATABASE_NAME`, `DB_CREDENTIALS_SECRET`, `AURORA_CLUSTER_ARN`: RDS Data API 用（users / sync/pages で使用）
