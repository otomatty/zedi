# PR #94 レビュー指摘への対応方針

## 概要

PR #94 に対する CodeRabbit / Copilot / Gemini の指摘を整理し、対応の必要性と方針を検討した結果をまとめる。

---

## 1. 対応推奨（修正すべき）

### 1.1 db/aurora/004_plan_rename.sql — 文の実行順序（Critical）

**指摘:** `UPDATE subscriptions SET plan = 'pro'` を実行する時点で、`subscriptions_plan_check` がまだ `('free','paid')` のみを許可しているため、初回実行で失敗する。

**対応:** 文の順序を変更する。

```sql
-- 修正後
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
UPDATE subscriptions SET plan = 'pro' WHERE plan = 'paid';
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('free', 'pro'));
```

**判断:** 指摘は妥当。修正を実施する。

---

### 1.2 db/aurora/001_schema.sql — pgcrypto 拡張（Critical）

**指摘:** `gen_random_uuid()` は `pgcrypto` 拡張が必要。PostgreSQL 13+ では `gen_random_uuid()` が標準で使える場合もあるが、Aurora のバージョンによっては `pgcrypto` が必要。

**対応:** 拡張を明示的に有効化する。

```sql
CREATE EXTENSION IF NOT EXISTS pg_bigm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**判断:** 指摘は妥当。互換性のため追加する。

---

### 1.3 .github/rulesets/main-develop-branch-protection.json — レビュー必須（Medium）

**指摘:** `required_approving_review_count` が 0 のため、レビューなしでマージ可能。意図しないマージ防止のため 1 以上を推奨。

**対応:** `required_approving_review_count` を 1 に変更する。

**判断:** 指摘は妥当。セルフレビューでもマージ前チェックになるため、1 に変更する。

---

### 1.4 db/aurora/migrate.mjs — 失敗時の即時停止（Medium）

**指摘:** 文の実行が失敗してもループが続き、後続の文が実行される。部分適用が進み、ロールバックが難しくなる。

**対応:** 失敗時に `break` して即座にループを抜け、既存の `process.exit(1)` で終了する。

**判断:** 指摘は妥当。修正を実施する。

---

### 1.5 db/aurora/migrate.mjs — execSync のシェルクォート問題（Medium）

**指摘:** `execSync(\`bash -c '${cmd}'\`)` で、`cmd` 内の `$(cat '${escaped}')` のシングルクォートが外側のクォートを壊し、シェルパースエラーになる可能性がある。

**対応:** `execFileSync` と引数配列を使うか、`--cli-input-json file://...` で SQL を渡す方式に変更する。影響範囲が大きいため、別 PR での対応を推奨。

**判断:** 指摘は妥当。ただし現状のパスにシングルクォートが含まれない限り動作する。優先度は中。別 Issue で対応するか、本 PR で `execFileSync` ベースに書き換えるかを検討。

---

### 1.6 README.md — Markdown のタイポ（Low）

**指摘:** 90 行目で `` ` `` と記載されているが、コードブロックは ``` であるべき。

**対応:** 該当箇所を確認。`` ` `` が「インラインコード用のバッククォート 1 つ」の説明であれば、記述は意図通り。コードブロックの説明なら ``` に修正する。

**判断:** 文脈次第。該当行は「Markdown 記法の説明」であり、`` ` `` は単一バッククォートの説明として正しい可能性が高い。修正不要の可能性あり。要確認。

---

## 2. 対応検討（冪等性・リトライ）

### 2.1 db/aurora/006, 007 — ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS

**指摘:** マイグレーションがトランザクション外で文単位実行のため、途中失敗時にリトライすると `ADD COLUMN` / `CREATE INDEX` が重複エラーになる。

**対応:** `ADD COLUMN IF NOT EXISTS`、`CREATE INDEX IF NOT EXISTS` に変更する。

**判断:** 指摘は妥当。006, 007 は比較的影響が小さいため、本 PR で修正する。

---

### 2.2 db/aurora/002_ai_platform.sql — CREATE TABLE IF NOT EXISTS / ON CONFLICT

**指摘:** `CREATE TABLE` を `CREATE TABLE IF NOT EXISTS` に、`INSERT` を `ON CONFLICT DO NOTHING` 付きにすべき。

**対応:** 002 は初回スキーマ作成のため、通常は 1 回しか実行されない。ただし冪等にしておくと、部分適用後のリトライが安全になる。

**判断:** 002 は 001 の直後に実行される前提。001 が `CREATE TABLE` で冪等でないため、002 単体の冪等化だけでは不十分。001 も含めた設計見直しが必要。本 PR では 006, 007 の修正に留め、002 の冪等化は別 Issue とする。

---

## 3. 対応不要 or 別 Issue

### 3.1 db/aurora/migrate.mjs — トランザクションでラップ（Critical）

**指摘:** 各文を RDS Data API のトランザクション（BeginTransaction → ExecuteStatement(transactionId) → CommitTransaction）で実行すべき。

**判断:** 指摘は妥当だが、RDS Data API のトランザクション対応は migrate.mjs の大幅な変更になる。本 PR のスコープ外とし、別 Issue で対応する。

---

### 3.2 db/aurora/005_thumbnail_storage.sql — thumbnail_objects.user_id の FK

**指摘:** `thumbnail_objects.user_id` に `REFERENCES users(id) ON DELETE CASCADE` を追加すべき。

**判断:** 指摘は妥当。ただし `thumbnail_objects` は既に本番で使われている可能性があり、FK 追加は既存データの整合性確認が必要。別 PR で対応する。

---

### 3.3 db/aurora/003_ai_models_gemini3_gpt5_claude4.sql — gpt-5.2 のモデル ID

**指摘:** `gpt-5.2` は OpenAI 公式ドキュメントに記載がない。`gpt-5`, `gpt-5-mini`, `gpt-5-nano` のみ確認されている。

**判断:** 2026 年 2 月時点の情報に基づく指摘。`gpt-5.2` が将来のモデルやプレビューである可能性がある。現状のモデル一覧で動作しているなら、本 PR では変更せず、モデル追加・更新時に公式 ID を確認する運用とする。必要に応じて `gpt-5` 等に差し替える。

---

## 4. 実施する修正の一覧

| ファイル                                               | 修正内容                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `db/aurora/004_plan_rename.sql`                        | DROP → UPDATE → ADD の順に変更                                  |
| `db/aurora/001_schema.sql`                             | `CREATE EXTENSION IF NOT EXISTS pgcrypto` を追加                |
| `.github/rulesets/main-develop-branch-protection.json` | `required_approving_review_count: 1` に変更                     |
| `db/aurora/migrate.mjs`                                | 失敗時に `break` を追加                                         |
| `db/aurora/006_notes_edit_permission.sql`              | `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` に変更 |
| `db/aurora/007_notes_official_and_view_count.sql`      | `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` に変更 |

---

## 5. 別 Issue とする項目

- migrate.mjs: execSync のシェルクォート問題（execFileSync への書き換え）
- migrate.mjs: トランザクション対応
- 002_ai_platform.sql: 冪等性の強化
- 005_thumbnail_storage.sql: user_id の FK 追加
- 003: gpt-5.2 モデル ID の検証（運用で対応）
