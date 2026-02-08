# Phase B 実装状況（既存ユーザー移行）

**日付:** 2026-02-08  
**前提:** Phase A 完了（Clerk パッケージ削除済み）

---

## 1. 現在の実装状況

### 1.1 認証・DB

| 項目 | 状態 |
|------|------|
| 認証 | Cognito OAuth（Google/GitHub）に移行済み。`CognitoAuthProvider` / `useAuth` で `userId` は Cognito の `sub`。 |
| DB（Turso） | 現状の `user_id` は **Clerk の userId**（`user_xxxx` 形式）のまま。 |
| メール | Turso には **ユーザーテーブルもメールも存在しない**。Clerk ダッシュボードから取得するか、手動で一覧を用意する必要あり。 |

### 1.2 user_id を参照しているテーブル・カラム

| テーブル | カラム | 用途 |
|----------|--------|------|
| `pages` | `user_id` | ページの所有者（Clerk userId） |
| `notes` | `owner_user_id` | ノートの所有者（Clerk userId） |
| `note_pages` | `added_by_user_id` | ノートにページを追加したユーザー（Clerk userId） |
| `note_members` | `invited_by_user_id` | ノートメンバーを招待したユーザー（Clerk userId） |

移行時は上記 4 カラムを、マッピング表に基づいて Clerk userId → Cognito `sub` に一括 UPDATE する。

### 1.3 既存の関連資産

- **dev-user-mapping**: `scripts/sync/dev-user-mapping.example.json` は **本番↔開発の Clerk userId マッピング**用。Phase B では **Clerk userId → Cognito sub** のマッピングを新たに作成する。
- **Turso 接続**: `scripts/sync/backfill-content-preview.ts` と同様に、`.env.development` / `.env.production` の `VITE_TURSO_DATABASE_URL` と `VITE_TURSO_AUTH_TOKEN` で Turso に接続可能。

---

## 2. Phase B タスクと進捗

| # | タスク | 状態 | メモ |
|---|--------|------|------|
| B1 | Clerk 側のユーザー一覧の取得 | **完了** | `scripts/migration/list-clerk-users.ts` で Turso から distinct user_id を取得。結果: 1 件（`user_37axfEra8z81aMdhOhBMcXMpWeU`, pages 1331, notes 3）。一覧は `docs/plans/20260208/clerk-users-to-migrate.json`。メールは DB にないため手動で補完。 |
| B2 | マッピング取得手順の作成 | **完了** | user-migration-mapping.md に手順を記載。1 ユーザーでサインインし sub 取得。 |
| B3 | マッピング表の作成 | **完了** | clerk-to-cognito-mapping.json / clerk_to_cognito_mapping.csv を作成・更新。 |
| B4 | DB 更新スクリプトの作成 | **完了** | scripts/migration/update-user-ids-to-cognito.ts（--dry-run 対応）。 |
| B5 | 移行の実行 | **完了** | 開発 DB で B4 実行。アプリでページ・ノート表示を確認。 |

---

## 3. 次のアクション

1. **B1 完了**: `scripts/migration/list-clerk-users.ts` を実行し、移行対象の Clerk user_id 一覧（および件数）を取得。
2. **メールの扱い**: 開発ユーザーのみであれば、誰がどの user_id かは手動で把握可能。本番に複数ユーザーがいる場合は Clerk ダッシュボードのエクスポートまたは手動一覧で「user_id, メール or 備考」を用意。
3. **マッピング検討**: 取得した一覧を元に、B2/B3 の手順・マッピング表フォーマットを決める。
