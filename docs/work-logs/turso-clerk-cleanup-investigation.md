# Turso / Clerk 削除に向けた現状調査

**目的:** Turso と Clerk を廃止し、関連する記述・ファイルを削除してクリーンな状態にする。  
**調査日:** 2026-02-16

---

## 1. 実装状況サマリ

| 区分                 | 状況                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **アプリ本体**       | 認証は Cognito、DB は Aurora (API) に移行済み。`turso.ts` / `useTurso.ts` / `localDatabase.ts` は既に削除済み（C3-11）。 |
| **Clerk パッケージ** | `@clerk/clerk-react` は既に package.json から削除済み（Phase A）。                                                       |
| **残存**             | 環境変数・型定義・コメント・ドキュメント・**Turso/Clerk 専用スクリプト**・一部 CSS に参照が残存。                        |

---

## 2. 修正すべき箇所一覧

### 2.1 環境変数・型定義（必須）

| ファイル                      | 対応                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| **`.env.example`**            | `VITE_TURSO_DATABASE_URL` / `VITE_TURSO_AUTH_TOKEN` と Turso のコメントを削除。                   |
| **`.env.production.example`** | Turso のセクション（`# Turso（AWS に移行済み…）` と 2 行）を削除。                                |
| **`src/vite-env.d.ts`**       | `VITE_TURSO_DATABASE_URL` / `VITE_TURSO_AUTH_TOKEN` を削除。`VITE_CLERK_PUBLISHABLE_KEY` を削除。 |

### 2.2 ソースコード内のコメント・CSS（推奨）

| ファイル                                                     | 対応                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **`src/lib/api/apiClient.ts`**                               | 先頭コメントの「Replaces direct Turso connection」を「All /api/\* routes require Cognito JWT」などに簡略化。                     |
| **`src/hooks/usePageQueries.ts`**                            | 「reduce Turso Rows Read」→「minimize data transfer」などに変更。                                                                |
| **`src/lib/pageRepository.ts`**                              | 「Turso (remote)」「Turso Rows Read」などの Turso 言及を削除または「libsql (local/test)」に統一。                                |
| **`src/lib/pageRepository/StorageAdapterPageRepository.ts`** | 「Replaces Turso/sql.js」→「Uses StorageAdapter + API」などに変更。                                                              |
| **`src/index.css`**                                          | **Clerk 用クラス**（503–524 行目）を削除: `.cl-socialButtonsProviderIcon__github`, `.cl-socialButtonsBlockButton__github` など。 |
| **`src/hooks/useAuth.ts`**                                   | 「former Clerk useAuth/useUser」はそのままでも可。削除する場合は「Cognito auth hook」のみに。                                    |

### 2.3 Turso/Clerk 専用スクリプト（削除推奨）

これらは **Turso または Clerk に依存**しており、Aurora 移行後は使用しない。

| パス                                                  | 説明                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **`scripts/migration/export-turso/`**                 | フォルダごと削除（export-turso.mjs, README.md, EXPORT_FORMAT.md）。                                                     |
| **`scripts/migration/list-clerk-users.ts`**           | Turso から Clerk user_id 一覧取得。削除。                                                                               |
| **`scripts/migration/update-user-ids-to-cognito.ts`** | Turso の user_id を Clerk→Cognito に更新。削除。                                                                        |
| **`scripts/sync/sync-dev-data.ts`**                   | Turso 本番↔開発同期（README で「未使用」と記載）。削除。                                                                |
| **`scripts/sync/compare-databases.ts`**               | Turso 本番/開発 DB 比較。削除。                                                                                         |
| **`scripts/sync/backfill-content-preview.ts`**        | Turso の pages に content_preview をバックフィル。削除。                                                                |
| **`scripts/sync/dev-user-mapping.example.json`**      | Clerk 用 productionUserId/developmentUserId の例。削除可（Aurora 用は dev-user-mapping-aurora.example.json のみ残す）。 |
| **`scripts/sync/dev-user-mapping.schema.json`**       | 上記の JSON スキーマ。削除可。                                                                                          |

**参照:** `scripts/migration/transform-for-aurora/` は Turso エクスポート JSON を入力に使うため、export-turso を削除するなら「移行完了済みのアーカイブ」として残すか、必要に応じて削除。

### 2.4 package.json のスクリプト削除

以下を `package.json` の `scripts` から削除する。

- `migration:list-clerk-users`, `migration:list-clerk-users:csv`, `migration:list-clerk-users:json`
- `migration:update-user-ids`, `migration:update-user-ids:dry`
- `sync:dev`, `sync:dev:dry`, `sync:dev:verbose`, `sync:dev:prod-to-dev`, `sync:dev:dev-to-prod`
- `backfill:preview`, `backfill:preview:dry`, `backfill:preview:verbose`, `backfill:preview:force`

**`@libsql/client`:** 単体テストの `testDatabase.ts` および `PageRepository` / `noteRepository` の型で **in-memory クライアント**としてまだ使用。Turso 用スクリプトを削除しても、テスト用には残す想定で問題なし。

### 2.5 ドキュメントの更新・削除

| 種別                           | ファイル                                              | 対応                                                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **削除**                       | **`docs/troubleshooting/turso-sync-errors.md`**       | Turso 同期エラー用。削除。                                                                                                                                                                                                                                                  |
| **削除**                       | **`docs/troubleshooting/turso-support-request.md`**   | Turso サポート用。削除。                                                                                                                                                                                                                                                    |
| **削除**                       | **`docs/troubleshooting/turso-jwks-issue-report.md`** | Turso JWKS 用。削除。                                                                                                                                                                                                                                                       |
| **削除**                       | **`docs/troubleshooting/turso-jwks-check.md`**        | 同上。削除。                                                                                                                                                                                                                                                                |
| **更新**                       | **`README.md`**                                       | ・.env 例から Turso を削除<br>・「トラブルシューティング」の Turso リンクを削除<br>・Tech Stack の Database を「Aurora (API) / libsql (local)」などに変更<br>・Roadmap の「Turso リアルタイム同期」を削除または「Aurora 同期」に変更<br>・Acknowledgments から Turso を削除 |
| **更新**                       | **`docs/work-logs/env-production-checklist.md`**      | VITE*TURSO*_ / VITE*CLERK*_ の行を削除。                                                                                                                                                                                                                                    |
| **更新**                       | **`docs/guides/dev-environment-setup.md`**            | 「1. Turso 開発データベースの作成」「2. Clerk 開発インスタンスの作成」および Turso/Clerk の環境変数・手順を削除。Aurora + Cognito のみに統一。                                                                                                                              |
| **更新**                       | **`scripts/sync/README.md`**                          | Turso 用の表・手順を削除。Aurora 同期のみ記載。dev-user-mapping（Clerk）の記述を削除。                                                                                                                                                                                      |
| **参照用に残す or 冒頭に注記** | **`docs/guides/turso-to-aurora-migration.md`**        | 移行手順は完了済み。アーカイブとして残す場合は「移行完了のため実行不要」と注記。                                                                                                                                                                                            |
| **参照用**                     | **`docs/plans/` 配下の work-log / 決定事項**          | 過去の移行記録のため、そのまま残してよい。必要なら「Turso/Clerk は廃止済み」と先頭に一文追加。                                                                                                                                                                              |

### 2.6 .gitignore

- **`scripts/migration/export-turso/output/`** … export-turso を削除するなら、この行も削除してよい。
- **`scripts/sync/dev-user-mapping.json`** … Turso 用 sync-dev-data 削除後も、同名ファイルを別用途で使わないなら残してよい（Aurora 用は dev-user-mapping-aurora.json）。

---

## 3. 依存関係（package.json）

| パッケージ               | 対応                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **`@clerk/clerk-react`** | 既に削除済み。追加対応不要。                                                                               |
| **`@libsql/client`**     | 単体テストの in-memory クライアントおよび型で使用中のため **残す**。Turso 用スクリプト削除後も削除しない。 |

---

## 4. 作業の進め方（推奨順）

1. **環境変数・型定義** … .env.example / .env.production.example / vite-env.d.ts を修正。
2. **ソースのコメント・CSS** … apiClient, usePageQueries, pageRepository, StorageAdapterPageRepository, index.css, useAuth を修正。
3. **Turso/Clerk スクリプト削除** … 上記スクリプト・フォルダを削除し、package.json の該当 scripts を削除。
4. **ドキュメント** … README / env-production-checklist / dev-environment-setup / scripts/sync/README を更新し、troubleshooting の Turso 系 4 ファイルを削除。
5. **.gitignore** … export-turso 関連を削除（スクリプト削除と同時で可）。

この順で進めれば、Turso と Clerk に関する記述とファイルを整理し、クリーンな状態にできます。
