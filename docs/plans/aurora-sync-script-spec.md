# Aurora 開発・本番 同期スクリプト 仕様書

**対象スクリプト:** `scripts/sync/sync-aurora-dev-data.ts`  
**前提:** [aurora-dev-prod-sync-plan.md](./aurora-dev-prod-sync-plan.md) の方針 A（RDS Data API）に基づく。

---

## 1. 目的・スコープ

- **目的:** 本番 Aurora と開発 Aurora の間で、**設定で指定したユーザー**のデータのみを同期する。
- **方向:** 本番→開発 / 開発→本番 / 双方向のいずれかをオプションで指定。
- **対象テーブル:** users, pages, page_contents, notes, note_pages, note_members, links, ghost_links, media（依存順でコピー）。

---

## 2. CLI

### 2.1 起動方法

```bash
bun run scripts/sync/sync-aurora-dev-data.ts [options]
# または package.json に script 追加後:
bun run sync:aurora:dev [options]
```

### 2.2 オプション

| オプション          | 説明                                                        | デフォルト                                  |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `--dry-run`         | 実際の書き込みを行わず、同期対象件数などのみ表示            | false                                       |
| `--verbose`         | 詳細ログ（対象ページIDやスキップ理由など）を表示            | false                                       |
| `--direction <dir>` | 同期方向: `prod-to-dev` \| `dev-to-prod` \| `bidirectional` | 設定ファイルの syncOptions.direction        |
| `--config <path>`   | マッピング設定ファイルのパス                                | `scripts/sync/dev-user-mapping-aurora.json` |

### 2.3 終了コード

- `0`: 正常終了（エラーなく同期または dry-run 完了）
- `1`: 設定エラー（ファイルなし・不正 JSON・必須環境変数不足）、ユーザー解決失敗、または DB 実行エラー

---

## 3. 設定ファイル

### 3.1 パス

- デフォルト: `scripts/sync/dev-user-mapping-aurora.json`
- `--config` で上書き可能。存在しない場合はエラーで終了し、`dev-user-mapping-aurora.example.json` をコピーして編集するよう案内する。

### 3.2 スキーマ（JSON）

```ts
interface DeveloperEntry {
  /** 表示・ログ用。email でユーザー検索する場合は検索キーにも使用 */
  email: string;
  /** 本番側の Cognito sub。省略時は email で本番 users を検索 */
  productionCognitoSub?: string;
  /** 開発側の Cognito sub。省略時は email で開発 users を検索（いなければ upsert で作成） */
  developmentCognitoSub?: string;
  description?: string;
}

interface SyncOptions {
  direction: "prod-to-dev" | "dev-to-prod" | "bidirectional";
  conflictResolution: "production-wins" | "development-wins" | "latest-wins";
  syncDeleted: boolean;
}

interface Config {
  developers: DeveloperEntry[];
  syncOptions?: Partial<SyncOptions>;
}
```

- **ユーザー解決ルール**
  - `productionCognitoSub` が指定されていれば、本番 DB の `users` を `cognito_sub = productionCognitoSub` で検索。
  - 未指定なら `email` で本番 `users` を検索。
  - 同様に開発側は `developmentCognitoSub` があればそれで検索、なければ `email` で検索。開発側に存在しなければ本番の行を元に `INSERT`（upsert）して開発側 `users.id` を確定する。
- **syncOptions 省略時:** direction: `dev-to-prod`, conflictResolution: `development-wins`, syncDeleted: `true`。

---

## 4. 環境変数

| 変数名                    | 必須                                | 説明                                               |
| ------------------------- | ----------------------------------- | -------------------------------------------------- |
| `PROD_AURORA_CLUSTER_ARN` | 本番→開発 or 双方向で本番を読む場合 | 本番 Aurora クラスター ARN                         |
| `PROD_AURORA_SECRET_ARN`  | 上に同じ                            | 本番 DB 認証情報の Secrets Manager ARN             |
| `DEV_AURORA_CLUSTER_ARN`  | 常に（開発を読む or 書く）          | 開発 Aurora クラスター ARN                         |
| `DEV_AURORA_SECRET_ARN`   | 常に                                | 開発 DB 認証情報の Secrets Manager ARN             |
| `PROD_AURORA_DATABASE`    | 任意                                | 本番 DB 名。省略時 `zedi`                          |
| `DEV_AURORA_DATABASE`     | 任意                                | 開発 DB 名。省略時 `zedi`                          |
| `AWS_REGION`              | 任意                                | RDS Data API のリージョン。省略時 `ap-northeast-1` |

---

## 5. 同期の流れ（1 ユーザーあたり）

### 5.1 方向の解釈

- `prod-to-dev`: 本番をソース、開発をターゲット。1 回だけ実行。
- `dev-to-prod`: 開発をソース、本番をターゲット。1 回だけ実行。
- `bidirectional`: まず prod-to-dev を実行し、続けて dev-to-prod を実行（同じスクリプト内で順に実行）。

### 5.2 ユーザー解決

1. ソース DB で対象ユーザーを取得: `productionCognitoSub` または `email` で `users` を検索 → `sourceUserId` (UUID)。
2. ターゲット DB で対象ユーザーを取得または作成: `developmentCognitoSub` または `email` で検索。存在しなければソースの `users` 行を元に `INSERT ... ON CONFLICT (cognito_sub) DO NOTHING` または `ON CONFLICT (email) DO NOTHING` の後、再度 SELECT して `targetUserId` を取得。

### 5.3 テーブル別同期順序とルール

| 順序 | テーブル      | 内容                                                                                                                               |
| ---- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | users         | ターゲットにいなければ upsert（上記で実施済みのため、ここではスキップ可能）。                                                      |
| 2    | pages         | `owner_id = sourceUserId` の行を取得。競合時は conflictResolution に従う。INSERT 時は `owner_id = targetUserId`、`id` はそのまま。 |
| 3    | page_contents | 上記 pages の `id` 一覧に紐づく行をコピー。`page_id` はそのまま。BYTEA は RDS Data API の blob で受け渡し。                        |
| 4    | notes         | `owner_id = sourceUserId` の行をコピー。`owner_id = targetUserId` に差し替え。`id` はそのまま。                                    |
| 5    | note_pages    | コピーした notes/pages に紐づく行。`added_by_user_id` がソースユーザーなら targetUserId に差し替え。                               |
| 6    | note_members  | 上記 notes に紐づく行。`invited_by_user_id` がソースユーザーなら targetUserId に差し替え。                                         |
| 7    | links         | 対象ユーザーのページを source に持つ行。`source_id`/`target_id` はそのまま。                                                       |
| 8    | ghost_links   | 対象ユーザーのページを `source_page_id` に持つ行。そのままコピー。                                                                 |
| 9    | media         | `owner_id = sourceUserId` の行をコピー。`owner_id = targetUserId` に差し替え。                                                     |

### 5.4 競合解決（pages / notes の updated_at）

- **latest-wins:** ターゲットに同じ id がある場合、ソースの `updated_at` と比較し、ソースが新しい場合のみ上書き。
- **production-wins:** 方向が prod-to-dev のとき常にソースで上書き。dev-to-prod のときは上書きしない（または「開発で上書き」の意味で常にソースで上書き）。
- **development-wins:** 方向が dev-to-prod のとき常にソースで上書き。prod-to-dev のときは上書きしない。

実装では「現在の方向」に応じて、production-wins なら「ソースが本番のときだけ上書き」、development-wins なら「ソースが開発のときだけ上書き」と解釈する。

### 5.5 削除フラグ

- `syncDeleted: true` のときは `is_deleted = true` のページ・ノートも同期する。
- `syncDeleted: false` のときは `is_deleted = false` のもののみ取得・コピーする。

### 5.6 冪等性

- 各テーブルで `INSERT ... ON CONFLICT ... DO UPDATE` または `DO NOTHING` を使い、同じスクリプトを複数回実行しても安全にする。pages/notes は conflictResolution に応じて `DO UPDATE SET ... updated_at = EXCLUDED.updated_at` で上書きするか、`DO NOTHING` でスキップする。

---

## 6. RDS Data API まわり

- **リトライ:** `DatabaseResumingException` 発生時、最大 4 回まで 1s, 2s, 3s, 4s のバックオフでリトライする。
- **バッチ:** 1 リクエストで大量に行を返す/書く場合は、pages は 100 件ずつ、page_contents は 50 件ずつ（BYTEA 考慮）など、適宜バッチ分割する。
- **パラメータ:** 名前付きパラメータ `:name` 形式。UUID は文字列で渡し、SQL 側で `CAST(:id AS uuid)` を使用。日時は ISO 8601 文字列で `CAST(:at AS timestamptz)`。BYTEA は RDS Data API の `blobValue`（Base64）を使用。

---

## 7. 出力

- **通常:** 各開発者ごとに「Pages: N synced, M skipped」のような行数サマリを表示。最後に「Sync Complete」。
- **--verbose:** スキップしたページ id や、競合で上書きしなかった理由などをログ出力。
- **--dry-run:** 実際の DB 書き込みは行わず、同期対象件数（pages, notes, links など）のみ表示。

---

## 8. セキュリティ・運用

- 設定ファイル `dev-user-mapping-aurora.json` は `.gitignore` に含め、リポジトリにコミットしない。
- 本番の `PROD_AURORA_*` はローカルまたは信頼できる CI のみで使用し、ログに ARN を出力しない（--verbose でもマスクするか省略する）。
