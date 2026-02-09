# Turso エクスポート形式（C2-1）

**目的:** Phase C2 データ移行のため、Turso（LibSQL）の全テーブルを一括エクスポートする際の形式を定義する。

## 1. 対象テーブルと順序

エクスポート対象は次の 6 テーブル（現行 Turso スキーマ。`src/lib/turso.ts` および `db/schema.sql` 準拠）。

| 順序 | テーブル | 説明 |
|------|----------|------|
| 1 | pages | ページ（id, user_id, title, content, content_preview, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted） |
| 2 | links | ページ間リンク（source_id, target_id, created_at） |
| 3 | ghost_links | 未作成リンク（link_text, source_page_id, created_at） |
| 4 | notes | ノート（id, owner_user_id, title, visibility, created_at, updated_at, is_deleted） |
| 5 | note_pages | ノート‐ページ紐付け（note_id, page_id, added_by_user_id, created_at, updated_at, is_deleted） |
| 6 | note_members | ノートメンバー（note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted） |

- **users テーブルは Turso に存在しない**。C2-2 で Cognito sub / email から users を生成する。
- **ID は現行のまま**（TEXT / nanoid 相当）。C2-2 で UUID へのマッピングを行う。

## 2. 出力形式

- **ファイル:** 1 つの JSON ファイル（例: `turso-export-YYYYMMDD-HHmmss.json`）。
- **構造:**

```json
{
  "exported_at": "2026-02-09T12:00:00.000Z",
  "source": "turso",
  "tables": {
    "pages": [ { "id": "...", "user_id": "...", ... } ],
    "links": [ ... ],
    "ghost_links": [ ... ],
    "notes": [ ... ],
    "note_pages": [ ... ],
    "note_members": [ ... ]
  }
}
```

- **型の扱い:**
  - SQLite の `INTEGER`（created_at, updated_at, is_deleted）は JSON の number または string のまま（C2-2 で TIMESTAMPTZ 等に変換）。
  - `vector_embedding`（BLOB）は Base64 文字列で出力する（移行で使わない場合は C2-2 で捨て可能）。
  - それ以外の TEXT はそのまま文字列。

## 3. 利用方法

- **エクスポート実行:** `node export-turso.mjs`（環境変数 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` を設定）。
- **出力先:** 実行時のカレントディレクトリ、または `--out-dir` で指定したディレクトリに 1 ファイル出力。
- **C2-2 以降:** この JSON を読み込み、ID 変換・users 生成・Tiptap → Y.Doc 変換・Aurora インポートに利用する。

## 4. 参照

- [zedi-data-structure-spec.md](../../../docs/specs/zedi-data-structure-spec.md) … 移行先（Aurora）のエンティティ定義
- [turso-to-aurora-migration-decisions.md](../../../docs/plans/20260208/turso-to-aurora-migration-decisions.md) … 移行方針
- [rearchitecture-task-breakdown.md](../../../docs/plans/20260209/rearchitecture-task-breakdown.md) … C2-1 タスク定義
