# Aurora PostgreSQL における RLS（Row Level Security）の利用可否調査

## 結論

**Aurora PostgreSQL では RLS（Row Level Security）を利用できます。**

- PostgreSQL 標準機能（9.5 以降）のため、Aurora PostgreSQL 互換エディションでそのまま利用可能です。
- プロビジョンド／Aurora Serverless v2 のどちらでも利用可能です。
- **RDS Data API** 経由でも RLS を適用したクエリが可能で、AWS 公式ブログで実装パターンが紹介されています。

---

## 1. 公式・ドキュメントからの根拠

### 1.1 AWS 公式

- **Amazon Aurora PostgreSQL のセキュリティ**  
  [Security with Amazon Aurora PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.Security.html)
  - IAM・SSL/TLS・ロール／権限の説明が中心。RLS は PostgreSQL 標準機能として、Aurora の制限外で利用可能。

- **RDS Data API で RLS を適用する方法（推奨）**  
  [Enforce row-level security with the RDS Data API](https://aws.amazon.com/blogs/database/enforce-row-level-security-with-the-rds-data-api/)
  - Aurora PostgreSQL + RDS Data API で RLS を有効にし、マルチテナント分離する手順を解説。
  - ポイント:
    - テーブルに `CREATE POLICY` でポリシーを定義（例: `tenant_id = current_setting('tenant.id')::integer`）。
    - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` で RLS を有効化。
    - RDS Data API は**リクエストごとに別コネクション**になり得るため、**セッション変数**（`current_setting`）を使う場合は次のいずれかが必要:
      - **トランザクション**で `begin_transaction` → `SET tenant.id = X` → 本クエリ → `commit_transaction` とし、同一セッションで実行する。
      - または **PostgreSQL 関数**内で `EXECUTE format('SET "tenant.id" = %s', p_tenant_id)` してから `RETURN QUERY SELECT ...` し、Data API からはその関数を 1 回呼ぶ。

- **マルチテナントと RLS**  
  [Multi-tenant data isolation with PostgreSQL Row Level Security](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security)
  - RLS によるテナント分離の考え方と、Aurora PostgreSQL での利用が前提として述べられている。

### 1.2 PostgreSQL 公式

- [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` で有効化。
  - `CREATE POLICY` で USING / WITH CHECK を定義。
  - テーブルオーナーはデフォルトで RLS をバイパス可能（`FORCE ROW LEVEL SECURITY` でオーナーにも適用可能）。

---

## 2. 現在の Zedi アプリの実装状況

### 2.1 データベース（Aurora）

- **スキーマ:** `db/aurora/001_schema.sql` および 002〜007 のマイグレーション。
- **RLS:** 未使用。
  - `ENABLE ROW LEVEL SECURITY` や `CREATE POLICY` は定義されていません。
- **接続:** すべて **RDS Data API**（`ExecuteStatementCommand`）経由。
  - 例: `terraform/modules/api/lambda/lib/db.mjs`、sync スクリプト、`db/aurora/apply-data-api.mjs` など。

### 2.2 アクセス制御の実装

アクセス制御は**アプリケーション層（Lambda API）**で行われています。

- **認証:** Cognito JWT から `cognito_sub` を取得し、`users` テーブルで `owner_id`（UUID）と `email` を解決。
- **すべてのクエリ**で、その `owner_id` / `user_email` を明示的に条件に含めています。
  - 例:
    - `pages`: `WHERE owner_id = :owner_id`
    - `notes`: `WHERE owner_id = :owner_id OR note_members 経由でメンバー`、または `visibility IN ('public','unlisted')` で公開ノート
    - `syncPages.mjs`, `notes.mjs`, `pages.mjs`, `search.mjs`, `media.mjs` などで同様のパターン

つまり、「RLS は使っていないが、API 層で必ず user に紐づく条件を付けている」状態です。

### 2.3 RDS Data API の利用方法

- `db.mjs` の `execute(sql, params)` は**トランザクション未使用**で、1 リクエスト 1 回の `ExecuteStatement` のみ。
- そのため、現状のまま RLS で `current_setting('app.user_id')` などを参照する方式を入れると、**SET とクエリが別リクエストになり、セッションが共有されず RLS が効かない**可能性があります。

---

## 3. RLS を導入する場合のポイント

1. **ポリシー設計**
   - 例: `pages` なら `USING (owner_id = current_setting('app.owner_id')::uuid)` のようなポリシーを定義。
   - `notes` は `owner_id` + `note_members` + `visibility` の組み合わせなので、ポリシー式が複雑になるか、関数でまとめる検討が必要。

2. **RDS Data API との組み合わせ**
   - **トランザクションを使う:**  
     `begin_transaction` → `SET app.owner_id = :owner_id` → 業務クエリ → `commit_transaction` とし、同一トランザクション内で SET とクエリを実行する。
     - 現在の `db.mjs` は 1 文実行のみなので、トランザクション対応（または「SET + 実行」をまとめるラッパー）の変更が必要。
   - **関数を使う:**  
     `SELECT my_get_pages(:owner_id)` のように、関数内で `SET app.owner_id = ...` してから SELECT する。
     - Data API からは 1 回の `execute_statement` で済み、セッション変数が確実に同じコネクションで使われる。

3. **既存 API との両立**
   - 既存の「すべての SQL に `owner_id` 等を明示的に渡す」実装は、RLS を有効にしたうえで**防御を二重にする**形で残すことが可能（ベストプラクティスとして AWS ブログでも推奨）。
   - テーブルオーナー（マスターユーザー）はデフォルトで RLS をバイパスするため、マイグレーションや管理用スクリプトは従来どおり実行できます。

4. **Aurora のバージョン**
   - RLS は PostgreSQL 9.5 以降の標準機能のため、現在利用中の Aurora PostgreSQL のバージョンで利用可能です。
   - RDS Data API のサポートは Aurora PostgreSQL 13.11 以上など、エンジンバージョンに依存するため、Data API 利用時は [Data API の対応バージョン](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.Aurora_Fea_Regions_DB-eng.Feature.Data_API.html) を確認してください。

---

## 4. まとめ

| 項目               | 内容                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLS の利用可否** | ✅ Aurora PostgreSQL で利用可能（PostgreSQL 標準機能）。RDS Data API 経由でも利用可能。                                                                                       |
| **現在の Zedi**    | RLS は未使用。アクセス制御は Lambda API 層で `owner_id` / `note_members` / `visibility` を条件に実装済み。                                                                    |
| **RLS 導入時**     | セッション変数（`current_setting`）を使う場合は、RDS Data API において**トランザクション内で SET してからクエリ**するか、**PostgreSQL 関数内で SET + クエリ**する必要がある。 |

RLS を有効にすると、アプリのバグや漏れがあっても DB 側で行レベルが守られるため、セキュリティの多層化として検討する価値があります。

---

## 5. さらに詳しい「RLS 導入時の改善案」

現在の DB 関連実装（各 Lambda ハンドラ・db.mjs・sync スクリプト・他モジュールの DB 利用）を詳しく調査し、**RLS を導入する場合の具体的な改善方針・実装案**を別ドキュメントにまとめました。

- **[aurora-rls-implementation-proposal.md](./aurora-rls-implementation-proposal.md)**
  - DB を利用する全コンポーネントの整理
  - テーブルごとの RLS ポリシー案（users / pages / notes / note_members 等）
  - セッション変数（app.owner_id, app.user_email 等）の設計
  - db.mjs の拡張（トランザクション・withDbContext）とハンドラ側の変更方針
  - マイグレーション（008_rls.sql）と app_user ロールの扱い
  - 導入ステップと他 Lambda・スクリプトとの役割分担

現状の実装に RLS を組み込む際は、上記提案を参照して進めるのがよいです。
