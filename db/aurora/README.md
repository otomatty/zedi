# Aurora PostgreSQL DDL (Zedi)

Aurora Serverless v2 用のスキーマ定義とマイグレーションです。

- **参照仕様:** `docs/specs/zedi-data-structure-spec.md` および `docs/specs/zedi-rearchitecture-spec.md` §14.2
- **タスク:** [C1-1] Aurora DDL 作成・適用

## テーブル一覧

### 001_schema.sql（初期スキーマ）

| テーブル      | 説明                                                            |
| ------------- | --------------------------------------------------------------- |
| users         | ユーザー（Cognito 対応）                                        |
| pages         | ページ（メタデータ。本文は page_contents）                      |
| page_contents | Y.Doc 永続化（ydoc_state, content_text）＋全文検索              |
| notes         | ノート（共有コンテナ）                                          |
| note_pages    | ノートとページの紐付け                                          |
| note_members  | ノートメンバー（招待・ロール）                                  |
| links         | ページ間リンク                                                  |
| ghost_links   | 未作成リンク（original_target_page_id / original_note_id 含む） |
| media         | メディア（S3 キー・メタデータ）                                 |

### 002_ai_platform.sql（AI プラットフォーム）

| テーブル         | 説明                             |
| ---------------- | -------------------------------- |
| subscriptions    | サブスクリプション（free / pro） |
| ai_models        | AI モデル定義                    |
| ai_usage_logs    | AI 利用ログ                      |
| ai_monthly_usage | 月次 AI 利用量                   |
| ai_tier_budgets  | ティア別バジェット               |

### 005_thumbnail_storage.sql（サムネイル）

| テーブル              | 説明                         |
| --------------------- | ---------------------------- |
| thumbnail_tier_quotas | ティア別サムネイルクォータ   |
| thumbnail_objects     | サムネイルオブジェクト（S3） |

## マイグレーションファイル一覧

| ファイル                                 | 内容                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| `001_schema.sql`                         | 初期スキーマ（9 テーブル + インデックス + pg_bigm）   |
| `002_ai_platform.sql`                    | AI プラットフォーム（5 テーブル）                     |
| `002_ai_platform_subscriptions_only.sql` | subscriptions のみ再作成（Aurora 再開後のリトライ用） |
| `002_seed_ai_models.sql`                 | ai_models 初期データ投入                              |
| `003_ai_models_gemini3_gpt5_claude4.sql` | AI モデル更新（旧モデル無効化 + 新モデル追加）        |
| `004_plan_rename.sql`                    | プラン名 paid → pro リネーム + billing_interval 追加  |
| `005_thumbnail_storage.sql`              | サムネイルストレージ（2 テーブル）                    |
| `006_notes_edit_permission.sql`          | notes に edit_permission カラム追加                   |
| `007_notes_official_and_view_count.sql`  | notes に is_official, view_count カラム追加           |

## マイグレーションの適用

### 前提

- Terraform で Aurora クラスターが作成済みであること
- AWS CLI が設定済みであること（`aws configure` 等）
- `CLUSTER_ARN` と `SECRET_ARN` を環境変数で設定すること

### migrate.mjs（RDS Data API 経由・VPC 不要）

番号付き SQL ファイル（`001_*.sql` ～）を自動で検出し、未適用のものだけ順次実行します。
適用済みファイルは `_schema_migrations` テーブルで管理されます。

```bash
cd db/aurora

export CLUSTER_ARN=$(cd ../../terraform && terraform output -raw aurora_cluster_arn)
export SECRET_ARN=$(cd ../../terraform && terraform output -raw db_credentials_secret_arn)

node migrate.mjs
```

| コマンド                          | 説明                                            |
| --------------------------------- | ----------------------------------------------- |
| `node migrate.mjs`                | 未適用のマイグレーションをすべて適用            |
| `node migrate.mjs --dry-run`      | 適用対象を表示（実行しない）                    |
| `node migrate.mjs --status`       | 各ファイルの適用状態を表示                      |
| `node migrate.mjs --baseline 007` | 001〜007 を「適用済み」として記録（実行しない） |

### CI/CD での利用

`deploy-dev.yml` / `deploy-prod.yml` で Terraform Apply 後に自動実行されます。
`CLUSTER_ARN` と `SECRET_ARN` は Terraform output から自動的に渡されます。

## 拡張機能

- **pg_bigm:** 日本語全文検索用。Aurora PostgreSQL でサポート済み。`page_contents.content_text` に GIN (gin_bigm_ops) インデックスを張っています。

## 新しいマイグレーションの追加

1. `NNN_description.sql`（NNN は 3 桁の連番）としてファイルを作成する
2. `migrate.mjs` が自動的に検出・適用する（`/^\d{3}_.*\.sql$/` にマッチするファイルが対象）
3. 既存テーブルの変更は `ALTER TABLE` で記述する（`CREATE TABLE` は初回のみ）
