# Phase C1 作業ログ（Aurora DDL・REST API 基盤・ユーザー API）

**作業期間:** 2026-02-09  
**対象:** C1-1, C1-2, C1-3（Aurora DDL 作成・適用、REST API 基盤、ユーザー API）  
**前提ドキュメント:** [タスク細分化](rearchitecture-task-breakdown.md) / [リアーキテクチャ仕様書](../specs/zedi-rearchitecture-spec.md) / [データ構造仕様書](../specs/zedi-data-structure-spec.md)

---

## 1. 作業サマリー

| タスク | 内容 | 状態 | Issue | 紐づけコミット |
|--------|------|------|-------|----------------|
| **C1-1** | Aurora DDL 作成・適用 | 完了 | #16 | 37952d8 |
| **C1-2** | REST API 基盤 | 完了 | #17 | 5c7b0d9 |
| **C1-3** | ユーザー API | 完了 | #18 | 91c14e3 |
| **C1-4** | ページ・同期 API（メタデータ） | 完了 | - | 既存実装 |
| **C1-5** | ページ・コンテンツ API | 完了 | #20 | 3b2c3d5 |
| **C1-6** | ノート API | 完了 | - | 本作業 |

---

## 2. 実施内容の詳細

### 2.1 C1-1: Aurora DDL 作成・適用

- **成果物**
  - **DDL:** `db/aurora/001_schema.sql`  
    users, pages, notes, note_pages, note_members, links, ghost_links, page_contents, media の PostgreSQL 定義（zedi-data-structure-spec + 仕様 §14.2 準拠）
  - **拡張:** pg_bigm 有効化、`page_contents.content_text` に GIN (gin_bigm_ops) インデックス
  - **適用手段**
    - **Data API:** `db/aurora/apply-data-api.mjs`（psql 不要・VPC 不要）
    - **psql:** `db/aurora/apply.sh`（接続情報は Secrets Manager から取得）
  - **手順:** `db/aurora/README.md` に記載
- **適用結果**  
  dev の Aurora に対し、Data API 経由で 29 文を実行し、9 テーブル作成を完了済み。

### 2.2 C1-2: REST API 基盤

- **成果物**
  - **Terraform:** `terraform/modules/api/`  
    API Gateway HTTP API、Cognito JWT Authorizer、Lambda（Node 20）、ルート（`/api`, `/api/{proxy+}`, `GET /api/health`）
  - **Lambda ソース:** `terraform/modules/api/lambda/`  
    `index.mjs`（エントリ）、`responses.mjs`（CORS・成功/エラーレスポンス）、`router.mjs`（パス＋メソッドでディスパッチ）
  - **main.tf:** `module "api"` を追加。Cognito / DB の出力を渡す。
  - **output:** `api_invoke_url` をルート outputs に追加
- **認証**  
  全 `/api/*` は JWT 必須（`GET /api/health` のみ認証なし）。トークンは `Authorization: Bearer <id_token>`。claims は `requestContext.authorizer.jwt.claims` で取得。

### 2.3 C1-3: ユーザー API

- **成果物**
  - **RDS Data API ラッパー:** `terraform/modules/api/lambda/lib/db.mjs`  
    `execute(sql, params)`、`formatRecordsAs: "JSON"` で行配列取得
  - **ユーザーハンドラー:** `terraform/modules/api/lambda/handlers/users.mjs`  
    - `POST /api/users/upsert`: cognito_sub / email（JWT または body）で users を upsert、body で display_name / avatar_url を任意指定
    - `GET /api/users/:id`: ユーザー 1 件取得、なしなら 404
  - **ルーター:** 上記パスを `router.mjs` に追加。`index.mjs` で `body`・`pathParameters` をパースして context に渡す
  - **依存:** `@aws-sdk/client-rds-data` を lambda の package.json に追加
  - **デプロイ時:** `null_resource.lambda_npm` で apply 前に `npm ci` を実行し、ZIP に node_modules を含める（`terraform/modules/api/main.tf`）

### 2.4 C1-4: ページ・同期 API（メタデータ）

- **既存実装**（作業ログ作成時点でコード上は完了済み）
  - **ハンドラー:** `terraform/modules/api/lambda/handlers/syncPages.mjs`
  - **GET /api/sync/pages?since=** 自分のページの差分（pages, links, ghost_links）。since 省略時は全件。
  - **POST /api/sync/pages** ローカル変更の一括送信（LWW）。body: pages, links?, ghost_links?。競合は conflicts で返却。
  - **ルーター:** `router.mjs` に上記パスを登録済み。

### 2.5 C1-5: ページ・コンテンツ API

- **成果物**
  - **ハンドラー:** `terraform/modules/api/lambda/handlers/pages.mjs`
    - **GET /api/pages/:id/content** 自分のページの page_contents から ydoc_state（base64）, version を返す。未保存なら 404。
    - **PUT /api/pages/:id/content** body: ydoc_state (base64), content_text?, version?。version 指定時は楽観的ロック（不一致で 409）。
    - **POST /api/pages** ページ作成。body: id?, title?, content_preview?, source_page_id?, thumbnail_url?, source_url?。id 省略時は DB で UUID 生成。
    - **DELETE /api/pages/:id** 論理削除（is_deleted = true）。自分のページのみ。
  - **ルーター:** GET/PUT /api/pages/:id/content, POST /api/pages, DELETE /api/pages/:id を `router.mjs` に追加。
  - **BYTEA 扱い:** ydoc_state は SQL の `encode(ydoc_state, 'base64')` / `decode(:ydoc_state_b64, 'base64')` で文字列パラメータのみ使用（db.mjs 変更なし）。
- **動作確認**
  - `lambda/run-local.mjs` を追加。`node run-local.mjs` で GET /api/health, GET /api/me, GET /api/pages/:id/content のルーティングをローカル確認（DB 未設定時は pages は 500）。

### 2.6 C1-6: ノート API

- **成果物**
  - **ハンドラー:** `terraform/modules/api/lambda/handlers/notes.mjs`
    - **GET /api/notes** 自分がアクセス可能なノート一覧（owner または note_members で member_email = 現在ユーザー）。
    - **GET /api/notes/:id** ノート詳細 + ページ一覧（note_pages JOIN pages、is_deleted 除外）。
    - **POST /api/notes** ノート作成。body: id?, title?, visibility?。
    - **PUT /api/notes/:id** ノート更新（オーナーのみ）。body: title?, visibility?。
    - **DELETE /api/notes/:id** 論理削除（オーナーのみ）。
    - **POST /api/notes/:id/pages** 既存ページ追加 `{ pageId }` または新規ページ作成 `{ title }`（owner_id = notes.owner_id）。オーナーまたは editor メンバーのみ。
    - **DELETE /api/notes/:id/pages/:pageId** ノートからページを削除（論理削除）。オーナーまたは editor のみ。
    - **GET /api/notes/:id/members** メンバー一覧。アクセス可能なユーザーのみ。
    - **POST /api/notes/:id/members** メンバー招待（オーナーのみ）。body: member_email, role? (viewer|editor)。
    - **DELETE /api/notes/:id/members/:email** メンバー削除（オーナーのみ、論理削除）。
  - **ルーター:** 上記を `router.mjs` に `/api/notes` 配下で追加。`run-local.mjs` に GET /api/notes を追加。

### 2.7 デプロイ（prod）

- **環境:** prod（`terraform apply -var-file=environments/prod.tfvars -target=module.api`）
- **対応した事象**
  - Secrets Manager の `zedi-prod-db-credentials` が削除予定だったため、`aws secretsmanager restore-secret` で復元
  - 上記シークレットを `terraform import module.database.aws_secretsmanager_secret.db_credentials zedi-prod-db-credentials` で state に取り込み
- **結果**  
  Lambda（zedi-prod-api）、API Gateway、JWT Authorizer、ルート、IAM が作成され、`GET /api/health` で 200 を確認済み。

---

## 3. 成果物一覧（パス）

| 種別 | パス | 備考 |
|------|------|------|
| DDL | `db/aurora/001_schema.sql` | 全テーブル定義 |
| DDL 適用 | `db/aurora/apply-data-api.mjs` | Data API で実行 |
| DDL 適用 | `db/aurora/apply.sh` | psql + Secrets Manager |
| 説明 | `db/aurora/README.md` | テーブル一覧・適用手順 |
| Terraform API モジュール | `terraform/modules/api/main.tf` | Lambda, API GW, Authorizer, null_resource |
| Terraform API モジュール | `terraform/modules/api/variables.tf`, `outputs.tf` | 変数・出力 |
| Lambda エントリ | `terraform/modules/api/lambda/index.mjs` | ハンドラー・body/claims 渡し |
| Lambda 共通 | `terraform/modules/api/lambda/responses.mjs` | CORS・success/error |
| Lambda ルート | `terraform/modules/api/lambda/router.mjs` | パス・メソッドでディスパッチ |
| Lambda DB | `terraform/modules/api/lambda/lib/db.mjs` | RDS Data API 実行 |
| Lambda ユーザー | `terraform/modules/api/lambda/handlers/users.mjs` | upsert / getById |
| Lambda 同期 | `terraform/modules/api/lambda/handlers/syncPages.mjs` | GET/POST /api/sync/pages |
| Lambda ページ | `terraform/modules/api/lambda/handlers/pages.mjs` | content GET/PUT, pages POST/DELETE |
| Lambda ノート | `terraform/modules/api/lambda/handlers/notes.mjs` | notes CRUD, pages, members |
| Lambda ローカル確認 | `terraform/modules/api/lambda/run-local.mjs` | モックイベントでルーティング確認 |
| API モジュール説明 | `terraform/modules/api/README.md` | ルート・デプロイ・環境変数 |

---

## 4. デプロイ結果（参照用）

- **prod API ベース URL:** `https://gf2b3exazg.execute-api.ap-northeast-1.amazonaws.com/`
- **確認済み:** `GET /api/health` → 200
- **利用可能エンドポイント（要 JWT）:** `GET /api/me`, `POST /api/users/upsert`, `GET /api/users/:id`, `GET/POST /api/sync/pages`, `GET/PUT /api/pages/:id/content`, `POST /api/pages`, `DELETE /api/pages/:id`, `GET/POST/PUT/DELETE /api/notes`, `GET/POST/DELETE /api/notes/:id/pages`, `GET/POST/DELETE /api/notes/:id/members`

---

## 5. 今後の作業（タスク細分化に沿った順序）

### 5.1 Phase C1 の残り

| # | タスク | 内容 | 依存 |
|---|--------|------|------|
| C1-7 | 検索 API | GET /api/search?q=&scope=shared（pg_bigm） | C1-1 |
| C1-8 | メディア API | POST /api/media/upload（Presigned URL）、POST /api/media/confirm | C1-1, C1-2 |
| C1-9 | API テスト・デプロイ | 統合テスト、dev デプロイ、環境変数・Secrets 整備 | C1-3〜C1-8 |

### 5.2 Phase C2: データ移行

- C2-1 Turso エクスポート → C2-2 ID 変換・users 生成 → C2-3 Tiptap JSON → Y.Doc → C2-4 content_text → C2-5 Aurora インポート 等（タスク細分化 §2 参照）

### 5.3 Phase C3: クライアント移行（Web）

- C3-1 StorageAdapter インターフェース → C3-2 IndexedDBStorageAdapter → C3-3 API クライアント → 同期・PageRepository・検索の差し替え 等（タスク細分化 §2 参照）

### 5.4 Phase C4: Hocuspocus 永続化

- C4-1 Aurora 永続化、C4-2 Redis、C4-3 認可の統一

---

## 6. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| [rearchitecture-task-breakdown.md](rearchitecture-task-breakdown.md) | タスク細分化・Phase C/D/E 一覧・推奨実施順序 |
| [zedi-rearchitecture-spec.md](../specs/zedi-rearchitecture-spec.md) | リアーキテクチャ仕様の正本（§13 API、§14 サーバー、§16 移行計画） |
| [zedi-data-structure-spec.md](../specs/zedi-data-structure-spec.md) | DB スキーマ・エンティティ定義（users, pages, notes 等） |
| [turso-to-aurora-migration-decisions.md](20260208/turso-to-aurora-migration-decisions.md) | Turso → Aurora 移行の決定事項 |
| [phase-c-work-breakdown.md](20260208/phase-c-work-breakdown.md) | Phase C の位置づけ・概要 |
| [db/aurora/README.md](../../db/aurora/README.md) | Aurora DDL の適用手順 |
| [terraform/modules/api/README.md](../../terraform/modules/api/README.md) | REST API モジュールのルート・デプロイ・環境変数 |
| [.github/ISSUE_TEMPLATE/rearchitecture_task.md](../../.github/ISSUE_TEMPLATE/rearchitecture_task.md) | リアーキテクチャ用 Issue テンプレート |

---

## 7. コミット・Issue 対応一覧

| コミット | 内容 | クローズした Issue |
|----------|------|--------------------|
| 37952d8 | feat: add initial Aurora PostgreSQL schema and application scripts | #16 [C1-1] |
| 5c7b0d9 | feat(api): add REST API module with Lambda, API Gateway, and Cognito integration | #17 [C1-2] |
| 91c14e3 | feat(api): enhance Lambda module with user management and automatic npm installation | #18 [C1-3] |

---

**以上、Phase C1 の C1-1〜C1-6 までの作業ログとする。次は C1-7（検索 API）に進む。**
