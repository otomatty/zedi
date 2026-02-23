# 開発・本番 Aurora 間の特定ユーザーデータ同期 調査・実装方針

**日付:** 2026-02-16  
**前提:** 本番・開発ともに DB は Turso から Aurora (PostgreSQL) へ移行済み。

---

## 1. 現在の実装状況

### 1.1 既存の同期スクリプト（Turso 前提）

| 項目       | 内容                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| スクリプト | `scripts/sync/sync-dev-data.ts`                                                                        |
| 接続       | `@libsql/client` で Turso (libsql) に接続                                                              |
| 認証情報   | `.env.production` / `.env.development` の `VITE_TURSO_DATABASE_URL`, `VITE_TURSO_AUTH_TOKEN`           |
| マッピング | `scripts/sync/dev-user-mapping.json` で **Clerk** の `productionUserId` / `developmentUserId` を紐付け |
| 同期対象   | `pages`, `links`, `ghost_links`（Turso スキーマ: TEXT id, INTEGER 日時）                               |

**結論:** 本番・開発が Aurora に移行したため、このスクリプトは **現状のままでは利用できない**（Turso 用であり、Aurora のスキーマ・接続方式と一致しない）。

### 1.2 Aurora 側の構成

- **接続:** VPC 内の Aurora Serverless v2。ローカルからは **RDS Data API** で接続可能（既存: `db/aurora/apply-data-api.mjs`, `scripts/migration/list-aurora-users.mjs`, `import-to-aurora.mjs`）。
- **認証:** Cognito。Aurora の `users` は `cognito_sub`, `email` で一意。
- **スキーマ:** `db/aurora/001_schema.sql` 参照。主なテーブル:
  - `users` (id UUID, cognito_sub, email, ...)
  - `pages` (id UUID, owner_id → users.id, content_preview, ...)
  - `page_contents` (page_id, ydoc_state BYTEA, content_text, ...)
  - `notes`, `note_pages`, `note_members`
  - `links`, `ghost_links`
  - `media`

本番と開発で **別々の Aurora クラスター**（別々の Terraform 環境）であり、それぞれ `CLUSTER_ARN` / `SECRET_ARN` が異なる。

---

## 2. 実装方針の選択肢

### 2.1 方針 A: 新規スクリプトで Aurora 同士を RDS Data API で同期（推奨）

- **接続:** 本番用・開発用の 2 組の `CLUSTER_ARN` / `SECRET_ARN` を環境変数で指定し、既存と同様に **RDS Data API** で両方の Aurora に接続する。
- **ユーザー特定:** Turso/Clerk の代わりに、次のいずれかで「同期対象ユーザー」を特定する。
  - **email:** 本番・開発の `users` を email で検索し、それぞれの `users.id` を取得。同一人物を同じ email で登録している前提。
  - **cognito_sub:** 本番と開発で同じ Cognito User Pool を使う場合は `cognito_sub` が一致するため、それでユーザーを特定可能。
  - **明示マッピング:** 本番の `users.id`（または cognito_sub）と開発の `users.id`（または cognito_sub）を設定ファイルで明示的に紐付ける。
- **同期対象テーブルと順序:**
  1. **users** … 開発側にいなければ upsert（email / cognito_sub で判定）。
  2. **pages** … 対象ユーザーの `owner_id` のページをコピー。`owner_id` は開発側の `users.id` に差し替え。
  3. **page_contents** … 上記 pages に紐づく行をそのままコピー（page_id はそのまま）。
  4. **notes** … 対象ユーザーが owner のノートをコピー。`owner_id` を開発側に差し替え。
  5. **note_pages** … 上記 notes/pages に紐づく行をコピー（note_id, page_id はそのまま）。
  6. **note_members** … 対象ノートのメンバー。`invited_by_user_id` は開発側ユーザーにマッピング可能なら差し替え。
  7. **links** … 対象ユーザーのページに紐づくリンクをコピー（source_id, target_id は page_id をそのまま使うため変更不要）。
  8. **ghost_links** … 同様に source_page_id が対象のページのものをコピー。
  9. **media** … 対象ユーザーの `owner_id` のメディアをコピー。`owner_id` を開発側に差し替え。

- **競合解決:** 既存と同様に `updated_at` ベースの「latest-wins」や「production-wins」などをオプションで選択可能にするとよい。

### 2.2 方針 B: Bastion / DATABASE_URL で psql 接続

- **接続:** `db/aurora/apply.sh` と同様に、本番・開発それぞれに `DATABASE_URL`（または Secrets Manager から取得した接続文字列）で **psql / node-postgres** 接続する。
- **メリット:** 大量データのバルク COPY や複雑なトランザクションが書きやすい。
- **デメリット:** VPC アクセス（Bastion や VPN）が必要で、ローカル実行環境の前提が増える。
- **評価:** 運用で Bastion が標準であれば検討の価値あり。まずは RDS Data API で足りるか試し、必要なら B を検討するのが現実的。

### 2.3 方針 C: 手動エクスポート／インポート

- 本番で対象ユーザーのデータを SQL や既存マイグレーションスクリプトでエクスポートし、開発用 Aurora にインポートする運用にする。
- **評価:** 一回きりや頻度が低い場合はあり。毎日のように「特定ユーザーだけ同期」したい場合は A の自動スクリプトの方がよい。

---

## 3. 推奨: 方針 A の具体的な実装イメージ

### 3.1 設定ファイル（Aurora 用マッピング）

既存の `dev-user-mapping.json` を **Aurora/Cognito 用**に拡張するか、別ファイル（例: `dev-user-mapping-aurora.json`）を用意する。

**案 1: email で同一ユーザーとみなす（本番・開発で同じ email でログインしている場合）**

```json
{
  "developers": [
    {
      "email": "developer@example.com",
      "description": "Main developer account"
    }
  ],
  "syncOptions": {
    "direction": "prod-to-dev",
    "conflictResolution": "production-wins",
    "syncDeleted": true
  }
}
```

**案 2: 本番・開発で cognito_sub または users.id を明示する**

```json
{
  "developers": [
    {
      "email": "developer@example.com",
      "productionCognitoSub": "ap-northeast-1:xxxx-prod",
      "developmentCognitoSub": "ap-northeast-1:yyyy-dev",
      "description": "Main developer account"
    }
  ],
  "syncOptions": { ... }
}
```

- スクリプト内で「本番 Aurora の `users` を productionCognitoSub（または email）で検索 → users.id 取得」「開発 Aurora の `users` を developmentCognitoSub（または email）で検索または upsert → users.id 取得」とし、その 2 つの UUID をマッピングとして使う。

### 3.2 環境変数（接続先の切り替え）

- 本番 Aurora: `PROD_AURORA_CLUSTER_ARN`, `PROD_AURORA_SECRET_ARN`（および任意で `PROD_AURORA_DATABASE`）
- 開発 Aurora: `DEV_AURORA_CLUSTER_ARN`, `DEV_AURORA_SECRET_ARN`（および任意で `DEV_AURORA_DATABASE`）

既存の `list-aurora-users.mjs` や `import-to-aurora.mjs` は dev の ARN を既定値で持っているため、本番用は別名の環境変数で明示的に渡す形にすると安全。

### 3.3 新規スクリプトの配置と既存との関係

- **新規:** 例として `scripts/sync/sync-aurora-dev-data.ts`（または `.mjs`）を追加し、RDS Data API で「本番 Aurora → 開発 Aurora」または「開発 → 本番」の一方向／双方向をオプションで選択できるようにする。
- **既存の `sync-dev-data.ts`:** Turso 用のまま残し、Aurora 移行後は「参照用・レガシー」として残すか、コメントで「Aurora の場合は sync-aurora-dev-data を使用すること」と案内する。

### 3.4 実装時の注意点

- **RDS Data API の制限:** 1 リクエストあたりのペイロードサイズやレスポンス行数に制限があるため、`page_contents` の BYTEA や大量の pages を扱う場合は **バッチ分割**（例: 100 件ずつ SELECT / INSERT）が必要。
- **Aurora の auto-pause:** 復帰直後に `DatabaseResumingException` が出る場合がある。既存の `terraform/modules/api/lambda/lib/db.mjs` と同様に、リトライ＋ディレイを入れるとよい。
- **冪等性:** `INSERT ... ON CONFLICT DO UPDATE` や、存在チェックしてから upsert する形にし、同じスクリプトを何度実行しても安全にする。
- **セキュリティ:** 本番の `SECRET_ARN` やマッピングファイルは `.gitignore` 済みのままにし、ローカルや CI の秘密情報としてのみ扱う。

---

## 4. ドキュメント・運用の更新

- **`docs/guides/dev-environment-setup.md`**
  - 「Turso」を前提にした説明を、**Aurora が開発・本番の DB である**前提に更新する。
  - 開発者データ同期については「特定ユーザーだけ同期する場合は `scripts/sync/sync-aurora-dev-data` と Aurora 用マッピングを参照」と記載し、本ドキュメント（`docs/plans/aurora-dev-prod-sync-plan.md`）へのリンクを張る。
- **`scripts/sync/README.md`**（存在しなければ作成）
  - Turso 用 `sync-dev-data.ts` と Aurora 用スクリプトの役割の違い、必要な環境変数、マッピングファイルの例を簡潔にまとめる。

---

## 5. 実装状況

- **仕様書:** [aurora-sync-script-spec.md](./aurora-sync-script-spec.md)
- **スクリプト:** `scripts/sync/sync-aurora-dev-data.ts`（実装済み）
- **設定例:** `scripts/sync/dev-user-mapping-aurora.example.json`
- **npm スクリプト:** `sync:aurora:dev`, `sync:aurora:dry`, `sync:aurora:prod-to-dev`, `sync:aurora:dev-to-prod` など（package.json 参照）

以上で、開発環境と本番環境のデータを「特定ユーザーだけ」同期する方法は、**Aurora 同士を RDS Data API で繋ぐスクリプト（方針 A）** で実現している。
