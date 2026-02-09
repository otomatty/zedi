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
| `POST /api/media/upload` | 必須 | Presigned URL 発行。body: `file_name?`, `content_type?`。返却: `upload_url`, `media_id`, `s3_key`, `expires_in`。クライアントは upload_url に PUT 後、confirm を呼ぶ。 |
| `POST /api/media/confirm` | 必須 | アップロード完了確認。body: `media_id`, `s3_key`, `file_name?`, `content_type?`, `file_size?`, `page_id?`。media テーブルに登録。 |
| その他 `/api/*` | 必須 | 404 |

## デプロイ

ルートで `terraform apply` を実行すると、api モジュール内で **`npm ci` が自動実行**され（`package.json` / `package-lock.json` 変更時）、そのあと `lambda/` が ZIP されて Lambda にデプロイされます。手動で `npm install` する必要はありません。

### dev 環境のみデプロイ

```bash
# ルート (terraform/) で実行。事前に database モジュールで Aurora + Secrets が作成済みであること
terraform apply -var-file=environments/dev.tfvars -target=module.api
```

デプロイ後、`terraform output api_invoke_url`（または `module.api.outputs.invoke_url`）で API のベース URL を確認できます。

### prod 環境

```bash
terraform apply -var-file=environments/prod.tfvars -target=module.api
```

## テスト（C1-9）

Lambda ハンドラーをモックイベントで実行し、ルーティング・認証・エラーレスポンスを検証します。

```bash
cd lambda && node test-api.mjs
```

成功時は `7/7 tests passed.`、失敗時は exit code 1。DB や S3 は使用しないため、未設定の環境でも実行可能です。ルーティング確認のみの場合は `node run-local.mjs` も利用できます。

## 環境変数（Lambda）

Terraform で Lambda に渡される変数（ルートの `module.api` に渡す値は `module.database` / `module.security` の出力を参照）:

- `ENVIRONMENT`: dev / prod
- `AURORA_DATABASE_NAME`, `DB_CREDENTIALS_SECRET`, `AURORA_CLUSTER_ARN`: RDS Data API 用（`module.database` の出力。users / sync/pages / notes / search / media confirm で使用）
- `MEDIA_BUCKET`: メディアアップロード用 S3 バケット名（API モジュール内で作成したバケットの id）
