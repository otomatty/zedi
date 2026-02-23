# 現在の DB 実装に RLS を導入する場合の改善案

本ドキュメントは、現在の DB 関連実装を調査したうえで、RLS（Row Level Security）を導入する際の**具体的な改善方針・実装案**をまとめたものです。前提調査は [aurora-postgresql-rls-investigation.md](./aurora-postgresql-rls-investigation.md) を参照してください。

---

## 1. 現在の DB アクセス実装の整理

### 1.1 DB を利用するコンポーネント一覧

| コンポーネント                            | 接続方法                                                              | 利用テーブル                                                                                                  | ユーザー文脈                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **API Lambda** (handlers)                 | `terraform/modules/api/lambda/lib/db.mjs` の `execute()`              | users, pages, page_contents, notes, note_pages, note_members, links, ghost_links, media                       | JWT から cognito_sub → users で owner_id / email を解決し、全クエリに明示的に渡している |
| **sync スクリプト**                       | `@aws-sdk/client-rds-data` の `ExecuteStatementCommand` 直接          | 本番/開発 Aurora 間で users, pages, page_contents, notes, note_pages, note_members, links, ghost_links を同期 | 環境変数で CLUSTER_ARN / SECRET_ARN。マスターユーザー想定                               |
| **subscription Lambda**                   | 同様に ExecuteStatementCommand 直接                                   | subscriptions                                                                                                 | Webhook 用。エンドユーザー文脈なし                                                      |
| **ai-api Lambda**                         | `terraform/modules/ai-api/lambda/src/lib/db.ts` の `execute()`        | subscriptions, ai_models, ai_usage_logs 等                                                                    | 認証ユーザーの user_id で利用状況を記録・参照                                           |
| **thumbnail-api Lambda**                  | `terraform/modules/thumbnail-api/lambda/src/lib/db.ts` の `execute()` | subscriptions, pages / page_contents の可能性                                                                 | 認証ユーザー or バックエンド                                                            |
| **マイグレーション / apply-data-api.mjs** | AWS CLI `aws rds-data execute-statement`                              | 全 DDL                                                                                                        | マスターユーザー                                                                        |

### 1.2 API Lambda 内のハンドラ別アクセスパターン

| ハンドラ          | 認証                                                      | 主なテーブル                                                 | 条件の付け方                                                                                                                                                       |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **users.mjs**     | 必須（upsert）/ 任意（getById）                           | users                                                        | upsert: cognito_sub で ON CONFLICT。getById: id のみ（他ユーザー表示用）                                                                                           |
| **pages.mjs**     | 必須                                                      | pages, page_contents                                         | すべて `owner_id = :owner_id` または page 経由で owner 一致                                                                                                        |
| **syncPages.mjs** | 必須                                                      | pages, links, ghost_links                                    | すべて `owner_id = :owner_id`、links/ghost_links は「自分の page_id のみ」                                                                                         |
| **notes.mjs**     | 必須（一覧・作成・更新・削除）/ 任意（getNote, discover） | notes, note_pages, note_members, pages, users                | 自分のノート: owner_id / note_members.member_email。公開: visibility IN ('public','unlisted')。Discover: 認証なしで public 一覧。view_count 更新は認証なしでも実行 |
| **media.mjs**     | 必須                                                      | users, media                                                 | すべて owner_id。GET は row.owner_id !== ownerId で 403                                                                                                            |
| **search.mjs**    | 必須                                                      | users, note_pages, notes, note_members, pages, page_contents | owner_id + user_email で「アクセス可能なノート内のページ」のみ                                                                                                     |

### 1.3 特記事項

- **ゲスト・未認証アクセス:**
  - `GET /api/notes/:id` … 認証なしで public/unlisted のノートを閲覧可能。
  - `GET /api/notes/discover` … 認証なしで public ノート一覧。
  - `INCREMENT_VIEW_COUNT_SQL` … 認証なしで実行されている。
- **users テーブル:**
  - GET /api/users/:id は「他ユーザーの表示名・アバター」取得用のため、**任意の id で 1 行 SELECT 可能**である必要がある。
- **バックエンド専用テーブル:**
  - subscriptions: Webhook が user_id をキーに INSERT/UPDATE。API では user_id で SELECT。
  - ai_models, ai_usage_logs, ai_monthly_usage, ai_tier_budgets: バックエンド or 認証ユーザー単位。
- **接続形態:**
  - すべて RDS Data API の **単発 ExecuteStatement**。トランザクション・セッション状態の共有は行っていない。

---

## 2. RLS 導入時の設計方針

### 2.1 セッション変数（current_setting）の設計

RLS ポリシーで参照するセッション変数を以下に統一する案です。

| 変数名            | 型      | 設定タイミング                 | 用途                                                 |
| ----------------- | ------- | ------------------------------ | ---------------------------------------------------- |
| `app.cognito_sub` | TEXT    | リクエスト開始時（JWT の sub） | users の「自分」解決用。未認証時は ''                |
| `app.owner_id`    | UUID    | users 検索後（users.id）       | 行の owner 制限の主キー。未認証時は ''               |
| `app.user_email`  | TEXT    | users 検索後（users.email）    | note_members の member_email 一致用。未認証時は ''   |
| `app.guest`       | BOOLEAN | 未認証時のみ 'true'            | 「認証なし＝公開データのみ」を明示する場合に利用可能 |

- リクエストごとに **1 トランザクション** を張り、その中で  
  `SET app.cognito_sub = ... ; SET app.owner_id = ... ; SET app.user_email = ...`  
  を実行したうえで、同一 `transactionId` で業務クエリを実行する。

### 2.2 テーブル単位の RLS ポリシー案

**対象:** エンドユーザーのデータが乗るテーブルのみ RLS を有効化する。

- **RLS を有効化するテーブル:**  
  users, pages, page_contents, notes, note_pages, note_members, links, ghost_links, media
- **RLS を有効化しないテーブル（現状のまま）:**  
  subscriptions, ai_models, ai_usage_logs, ai_monthly_usage, ai_tier_budgets 等
  - マイグレーション・Webhook・バックエンド Lambda は従来どおりマスター（または専用ロール）でアクセスし、RLS の影響を受けないようにする。

以下、テーブルごとのポリシー案です。いずれも「API 用ロール（例: `app_user`）」に適用する想定です。

#### users

- **SELECT:** 全行許可（他ユーザーの表示名・アバター表示のため）。  
  または「自分だけ」に限定する場合は `id = current_setting('app.owner_id')::uuid OR cognito_sub = current_setting('app.cognito_sub')`（未ログイン時は cognito_sub が空なので 0 件）。
- **INSERT:** 許可（初回 upsert。ON CONFLICT は cognito_sub ベース）。
- **UPDATE:** 自分の行のみ。  
  `USING (id = current_setting('app.owner_id')::uuid)` かつ `WITH CHECK` 同様。
- **DELETE:** 運用で削除しない前提ならポリシーなしで拒否でよい。

#### pages

- **SELECT / INSERT / UPDATE / DELETE:**  
  `owner_id = current_setting('app.owner_id')::uuid`
  - 未認証時は `app.owner_id` が空のため、ポリシーでは 0 件（NULL 比較で false）。

#### page_contents

- **SELECT / INSERT / UPDATE / DELETE:**  
  `page_id IN (SELECT id FROM pages WHERE owner_id = current_setting('app.owner_id')::uuid)`
  - pages の RLS と合わせて、実質「自分のページのコンテンツのみ」。

#### notes

- **SELECT:**
  - 自分のノート: `owner_id = current_setting('app.owner_id')::uuid`
  - メンバーとしてのノート:  
    `EXISTS (SELECT 1 FROM note_members nm WHERE nm.note_id = notes.id AND nm.member_email = current_setting('app.user_email') AND nm.is_deleted = FALSE)`
  - ゲスト（未認証）:  
    `current_setting('app.owner_id', true) = '' AND visibility = 'public'`
  - 上記を OR で結合した 1 本の USING 式、または 3 本の POLICY に分けても可。
- **INSERT:**  
  `WITH CHECK (owner_id = current_setting('app.owner_id')::uuid)`
- **UPDATE / DELETE:**  
  `USING (owner_id = current_setting('app.owner_id')::uuid)`
  - オーナーのみ変更・削除。メンバーの編集は note_pages / note_members 経由。

#### note_pages

- **SELECT:** 対象ノートが見える場合のみ。  
  `EXISTS (SELECT 1 FROM notes n WHERE n.id = note_pages.note_id AND (n.owner_id = current_setting('app.owner_id')::uuid OR EXISTS (SELECT 1 FROM note_members nm WHERE nm.note_id = n.id AND nm.member_email = current_setting('app.user_email') AND nm.is_deleted = FALSE) OR (current_setting('app.owner_id', true) = '' AND n.visibility = 'public')))`
  - 実装が重い場合は、**notes の RLS に任せず**「note_id が現在セッションで見えている notes の id に含まれる」ようなサブクエリで簡略化するか、RLS は「note の owner または note_members の editor」に限定し、公開ノートの note_pages はアプリ層でだけ制御するなどのトレードオフが可能。
- **INSERT / UPDATE / DELETE:**  
  ノートの編集権（owner または editor メンバー）をポリシーで表現するか、アプリ層のみで制御するかは要件次第。RLS でやる場合は、notes の「編集可能」条件（owner または editor）を EXISTS で書く必要がある。

#### note_members

- **SELECT:** 上記と同様「そのノートが見えている場合のみ」。
- **INSERT / UPDATE / DELETE:** ノートのオーナーのみ許可するのが簡単。  
  `EXISTS (SELECT 1 FROM notes n WHERE n.id = note_members.note_id AND n.owner_id = current_setting('app.owner_id')::uuid)`
  - メンバーによる role 変更は、ポリシーで editor を許可するか、アプリ層に任せるかで選択。

#### links

- **SELECT / INSERT / UPDATE / DELETE:**  
  `source_id IN (SELECT id FROM pages WHERE owner_id = current_setting('app.owner_id')::uuid) AND target_id IN (SELECT id FROM pages WHERE owner_id = current_setting('app.owner_id')::uuid)`
  - 自分のページ同士のリンクのみ。

#### ghost_links

- **SELECT / INSERT / UPDATE / DELETE:**  
  `source_page_id IN (SELECT id FROM pages WHERE owner_id = current_setting('app.owner_id')::uuid)`
  - 自分のページに紐づく ghost_links のみ。

#### media

- **SELECT / INSERT / UPDATE / DELETE:**  
  `owner_id = current_setting('app.owner_id')::uuid`
  - 既存の「owner のみ」と一致。

### 2.3 実行方式: トランザクション vs 関数

- **推奨: トランザクション方式**
  - リクエスト開始時に `BeginTransaction` → `SET app.cognito_sub`, `app.owner_id`, `app.user_email`（未認証時は ''）→ 既存の `execute()` をすべて同じ `transactionId` で実行 → 最後に `CommitTransaction`（エラー時は Rollback）。
  - 既存の「ハンドラ内で複数回 execute() を呼ぶ」形を活かしつつ、**db.mjs に「コンテキスト付き実行」を追加**するだけで対応しやすい。
  - 既存 SQL はそのまま使い回せる（WHERE に owner_id を渡すパターンは二重の防御として残す）。
- **代替: 関数方式**
  - 各エンドポイントごとに「SET + メインクエリ」をまとめた PostgreSQL 関数を作り、Data API からは 1 回の `execute_statement` でその関数を呼ぶ。
  - トランザクションを意識しなくてよい一方、既存の多数の SQL を関数に寄せると変更量が大きい。新規エンドポイントや、特に分離したい処理から部分的に採用するのが現実的。

---

## 3. 実装上の改善項目（具体的な変更案）

### 3.1 DB 層: `db.mjs` の拡張

**ファイル:** `terraform/modules/api/lambda/lib/db.mjs`

- **現状:**  
  `execute(sql, params)` のみ。単発の `ExecuteStatementCommand`。トランザクションなし。
- **変更案:**
  1. **トランザクション API の追加**
     - `BeginTransactionCommand` → `transactionId` 取得。
     - `ExecuteStatementCommand` に `transactionId` を渡すオーバーロード（または共通化した内部関数）。
     - `CommitTransactionCommand` / `RollbackTransactionCommand`。
  2. **コンテキスト付き実行の追加**
     - `withDbContext(claims, options, async (run) => { ... })` のようなラッパーを用意。
       - 内部で: BeginTransaction → 必要なら users から owner_id / email 取得（1 回の run(sql, params)）→ `SET app.cognito_sub`, `app.owner_id`, `app.user_email` を実行 → 呼び出し側に `run(sql, params)` を渡す。
       - 未認証（claims なし or sub なし）の場合は `app.owner_id = ''`, `app.user_email = ''`, `app.cognito_sub = ''` のみ SET。
     - ハンドラ側は、これまで `execute(...)` を呼んでいた箇所を、`withDbContext` に包み、その中では `run(...)` を呼ぶように変更。
  3. **後方互換**
     - 既存の `execute()` はそのまま残し、RLS を有効化したうえで「API 用には withDbContext のみ使う」運用にすると、マイグレーション・sync・他 Lambda は従来どおり `execute()` 相当（別クライアント・別認証）で RLS をバイパスできる。

### 3.2 認証・コンテキストの流れ（API Lambda）

1. ルーティングで JWT 検証。claims（sub, email 等）を取得。
2. ハンドラの入り口で `withDbContext(claims, {}, async (run) => { ... })` を開始。
3. `withDbContext` 内:
   - `BeginTransaction`
   - claims?.sub があれば:
     - `run('SELECT id, email FROM users WHERE cognito_sub = :cognito_sub', { cognito_sub: claims.sub })` で 1 行取得。
     - 取得した id / email で `run('SELECT set_config(...)')` 相当で `app.owner_id`, `app.user_email`, `app.cognito_sub` を SET（複数文は Data API の 1 リクエストで複数実行できないため、SET は 1 文にまとめるか、複数回 run する）。
   - なければ:
     - `app.owner_id = ''`, `app.user_email = ''`, `app.cognito_sub = ''` を SET。
4. ハンドラ本処理では、従来の `execute(sql, params)` をすべて `run(sql, params)` に置き換え（同一 transactionId で実行）。
5. 正常終了で `CommitTransaction`、例外で `RollbackTransaction`。

※ `run()` の引数は現在の `execute(sql, params)` と同一にすると、ハンドラの変更は「execute → run」の置換が中心になる。

### 3.3 ユーザー解決の「最初の 1 クエリ」と RLS

- `withDbContext` の最初に「cognito_sub で users を 1 件取得」するが、この時点ではまだ `app.owner_id` を SET していない。
- したがって **users テーブル**には、
  - 「cognito_sub で検索する SELECT」を許可するポリシーが必要。
  - 例: `USING (cognito_sub = current_setting('app.cognito_sub', true)) OR current_setting('app.cognito_sub', true) = ''`
  - 流れとしては「先に SET app.cognito_sub = claims.sub」→ そのあと「SELECT id, email FROM users WHERE cognito_sub = current_setting('app.cognito_sub')」→ 取得した id/email で `app.owner_id`, `app.user_email` を SET、とすると、users の RLS は「cognito_sub が一致する行のみ見える」でよい。
- 未認証の場合は `app.cognito_sub = ''` のままなので、users の SELECT は 0 行（または「空のときは見せない」ポリシー）とし、そのあと `app.owner_id` / `app.user_email` は空のままにする。

### 3.4 他 Lambda・スクリプトとの役割分担

- **subscription Lambda / マイグレーション / sync スクリプト:**
  - これまでどおり **マスターユーザー（または RLS をバイパスするロール）** で接続。
  - subscriptions 等には RLS を張らないため、既存の SQL のままでよい。
- **ai-api / thumbnail-api:**
  - 現在は同一 DB 認証情報（マスター）を使っている想定。
  - RLS を「ユーザーデータ用テーブルだけ」に限定し、subscriptions / ai\_\* には RLS を張らなければ、これらの Lambda は変更不要。
  - 将来的に「API 用には app_user のみ」にする場合は、API Lambda 用の Secrets と、バックエンド用の Secrets を分離する構成が望ましい。

### 3.5 マイグレーション（DDL）の追加

- **新規ファイル例:** `db/aurora/008_rls.sql`
  - 対象テーブルごとに `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
  - 必要に応じて `ALTER TABLE ... FORCE ROW LEVEL SECURITY;`（テーブルオーナーにも RLS を適用する場合）。
  - 上記ポリシー案に沿った `CREATE POLICY ... ON ... FOR ... TO app_user USING (...)` を列挙。
- **app_user ロール:**
  - 008 で `CREATE ROLE app_user WITH LOGIN PASSWORD '...';` および必要な GRANT。
  - 本番ではパスワードを Secrets Manager で管理し、Terraform または手動で API Lambda 用の Secret を切り替える。

---

## 4. 導入ステップ（推奨順序）

1. **設計の確定**
   - セッション変数名・テーブルごとのポリシー（特に notes / note_pages / note_members の「公開」「ゲスト」）を確定。
   - 二重防御として、既存の WHERE 条件は残すかどうか方針を決める。
2. **app_user と 008_rls.sql の作成**
   - RLS を有効化するテーブルとポリシーのみ適用。まだ API はマスターのままでもよい。
   - 開発環境で 008 を適用し、既存 API（マスター接続）が RLS でブロックされないことを確認（テーブルオーナーはデフォルトでバイパスするため、この時点では影響なし）。
3. **db.mjs の拡張**
   - `withDbContext` とトランザクション実行を実装。
   - テストで「SET → run(SELECT current_setting('app.owner_id'))」などでセッション変数が維持されることを確認。
4. **API Lambda の切り替え**
   - API 用に app_user の認証情報を Secrets Manager に登録し、API Lambda の環境変数をその Secret に切り替え。
   - 各ハンドラを `withDbContext(claims, {}, async (run) => { ... })` と `run()` に順次移行。
   - 移行後、開発環境で一覧・作成・更新・削除・ゲスト閲覧・Discover を網羅的にテスト。
5. **本番適用**
   - 008 を本番 Aurora に適用 → API の Secret を app_user に切り替え → 動作確認。
   - ロールバック手順（008 のポリシー削除・RLS 無効化、Secret をマスターに戻す）を事前に用意する。

---

## 5. まとめ

| 項目                 | 内容                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **対象テーブル**     | users, pages, page*contents, notes, note_pages, note_members, links, ghost_links, media に RLS を導入。subscriptions / ai*\* は現状のまま。 |
| **セッション変数**   | app.cognito_sub, app.owner_id, app.user_email をトランザクション開始直後に SET。未認証時は空文字。                                          |
| **実行方式**         | リクエスト単位で 1 トランザクションを張り、その中で SET 後に既存の SQL を `run()` で実行（推奨）。                                          |
| **DB 層変更**        | db.mjs に withDbContext とトランザクション対応を追加。既存 execute() は後方互換のため残す。                                                 |
| **アプリ層変更**     | 各ハンドラを withDbContext で包み、execute → run に置換。既存の WHERE 条件は二重防御として残すことを推奨。                                  |
| **他コンポーネント** | マイグレーション・sync・subscription・ai-api 等はマスター（または RLS 非対象テーブルのみ触る）のまま変更不要。                              |
| **ロール分離**       | 本格運用では API 用に app_user を用意し、API Lambda のみその認証情報を使用すると、RLS の効果が明確になる。                                  |

この方針で進めれば、現在の「API 層で owner_id / user_email を必ず付けている」実装を活かしつつ、DB 側でも行レベルでガードをかけられるようになります。
