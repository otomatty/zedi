# Aurora PostgreSQL DDL (Zedi)

Aurora Serverless v2 用のスキーマ定義です。

- **参照仕様:** `docs/specs/zedi-data-structure-spec.md` および `docs/specs/zedi-rearchitecture-spec.md` §14.2
- **タスク:** [C1-1] Aurora DDL 作成・適用

## テーブル一覧

| テーブル | 説明 |
|----------|------|
| users | ユーザー（Cognito 対応） |
| pages | ページ（メタデータ。本文は page_contents） |
| page_contents | Y.Doc 永続化（ydoc_state, content_text）＋全文検索 |
| notes | ノート（共有コンテナ） |
| note_pages | ノートとページの紐付け |
| note_members | ノートメンバー（招待・ロール） |
| links | ページ間リンク |
| ghost_links | 未作成リンク（original_target_page_id / original_note_id 含む） |
| media | メディア（S3 キー・メタデータ） |

## dev 環境への適用手順

### 前提

- Terraform で dev の Aurora クラスターが作成済みであること
- 接続情報は **Secrets Manager** の `zedi-dev-db-credentials` に格納されている

### 方法 A: Data API（psql 不要・VPC 不要）

AWS CLI が設定されていれば、ローカルからそのまま適用できます。

```bash
cd db/aurora
node apply-data-api.mjs
```

初回で 29 件の DDL が実行され、9 テーブル（users, pages, page_contents, notes, note_pages, note_members, links, ghost_links, media）が作成されます。他環境の場合は `CLUSTER_ARN` と `SECRET_ARN` を環境変数で指定してください。

**AI プラットフォーム用マイグレーション（002）:**

```bash
# 002 を適用（subscriptions, ai_models, ai_usage_logs, ai_monthly_usage, ai_tier_budgets）
SCHEMA_FILE=002_ai_platform.sql node apply-data-api.mjs
```

Aurora が auto-pause から復帰直後だと最初の文が失敗することがあります。その場合は `002_ai_platform_subscriptions_only.sql` で subscriptions のみ再適用し、`002_seed_ai_models.sql` で ai_models のシードを投入してください。

### 方法 B: psql（VPC 内などネットワーク接続がある場合）

#### 1. 接続情報の取得

```bash
aws secretsmanager get-secret-value \
  --secret-id zedi-dev-db-credentials \
  --query SecretString \
  --output text | jq -r '"postgresql://\(.username):\(.password)@\(.host):\(.port)/\(.dbname)"'
```

出力された URL をコピーする（パスワードに特殊文字が含まれる場合は URL エンコードが必要な場合あり）。

**注意:** Aurora は VPC 内のため、同じ VPC から接続するか、ポートフォワード／Bastion を利用してください。ローカルから直接接続できない場合は、Lambda や EC2 上で実行するか、AWS RDS Data API を使用してください。

#### 2. DDL の適用

**psql を使う場合:**

```bash
cd db/aurora
psql "<接続URL>" -f 001_schema.sql
```

**例（接続 URL を環境変数に設定した場合）:**

```bash
export DATABASE_URL="postgresql://zedi_admin:xxx@zedi-dev-cluster.xxx.ap-northeast-1.rds.amazonaws.com:5432/zedi"
psql "$DATABASE_URL" -f 001_schema.sql
```

#### 3. 確認

```sql
\dt
```

で `users`, `pages`, `page_contents`, `notes`, `note_pages`, `note_members`, `links`, `ghost_links`, `media` が作成されていることを確認してください。

## 拡張機能

- **pg_bigm:** 日本語全文検索用。Aurora PostgreSQL でサポート済み。`content_text` に GIN (gin_bigm_ops) インデックスを張っています。

## 再適用について

`001_schema.sql` は **CREATE TABLE** のみで、既存テーブルがある場合はエラーになります。初回セットアップ用です。スキーマ変更は別途マイグレーション（例: `002_xxx.sql`）として追加してください。
