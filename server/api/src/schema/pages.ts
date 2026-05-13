import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { notes } from "./notes.js";

/**
 * Special page kinds that stand apart from normal wiki entries.
 *
 * `__index__` は AI がカテゴリ別に生成するカテゴリ目次ページ、
 * `__log__` は将来の活動ログ表示用の予約。`null` 相当（通常ページ）は
 * カラム値 NULL で表現する。
 *
 * Reserved page kinds; `__index__` is the category table-of-contents page,
 * `__log__` is reserved for a future activity-log view. Normal pages leave
 * the column NULL.
 */
export type PageSpecialKind = "__index__" | "__log__";

/**
 * ページの種別分類。`user` は通常のユーザー作成ページ、`welcome` は新規
 * ユーザー向けに自動生成される「Zedi (ツェディ) の使い方」ページ（オーナー
 * あたり最大 1 件）、`update_notice` は機能追加時に自動配信される更新情報
 * ページ。
 *
 * Page classification. `user` is a normal user-created page, `welcome` is the
 * auto-generated onboarding page (at most one per owner), and `update_notice`
 * is an auto-delivered release note.
 */
export type PageKind = "user" | "welcome" | "update_notice";

/**
 * Wiki pages table. Holds mutable Wiki entries owned by a user.
 * 可変の Wiki ページテーブル（各ユーザーが所有）。
 */
export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * 所属ノート ID。すべてのページはちょうど 1 つのノートに属する（Issue #823）。
     * ユーザーの「個人スペース」はデフォルトノート（`notes.is_default`）のページ群。
     *
     * Owning note ID. Every page belongs to exactly one note (issue #823). A
     * user's personal space is the page set under their default note.
     */
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    sourcePageId: uuid("source_page_id"),
    title: text("title"),
    contentPreview: text("content_preview"),
    thumbnailUrl: text("thumbnail_url"),
    /**
     * 紐づく `thumbnail_objects.id`。ページ削除時にこの ID を辿って S3
     * オブジェクトと DB 行を GC する。サムネイル無しページや古いページは
     * NULL のまま。FK は持たない（GC は API 経路で明示的に扱う方針）。
     *
     * Reference to `thumbnail_objects.id`. DELETE /pages/:id uses this to
     * garbage-collect the S3 blob and DB row. NULL when the page has no
     * thumbnail or predates this column. No FK by design — see
     * `drizzle/0021_add_pages_thumbnail_object_id.sql`.
     */
    thumbnailObjectId: uuid("thumbnail_object_id"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    /**
     * True for the special "wiki schema" page (at most one per owner).
     * Wiki の「憲法」ページを示すフラグ（オーナーごとに最大 1 つ）。
     */
    isSchema: boolean("is_schema").default(false).notNull(),
    /**
     * Kind of special page (`__index__`, `__log__`). NULL for normal pages.
     * A partial unique index keeps at most one row per (owner, kind).
     *
     * 特殊ページの種別（`__index__`・`__log__`）。通常ページは NULL。
     * 部分ユニークインデックスによりオーナーごとに各 kind 最大 1 行。
     */
    specialKind: text("special_kind").$type<PageSpecialKind>(),
    /**
     * ページ種別の分類。通常は `user`。セットアップ完了時に自動生成される
     * ウェルカムページは `welcome`、機能追加時に自動配信される更新情報は
     * `update_notice`。
     *
     * Page classification. Defaults to `user`. Auto-generated onboarding
     * pages are `welcome`, and release-note pages are `update_notice`.
     */
    kind: text("kind").$type<PageKind>().notNull().default("user"),
  },
  (table) => [
    index("idx_pages_owner_id").on(table.ownerId),
    index("idx_pages_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_pages_source_page_id").on(table.sourcePageId),
    index("idx_pages_is_deleted")
      .on(table.ownerId)
      .where(sql`NOT ${table.isDeleted}`),
    index("idx_pages_owner_special_kind").on(table.ownerId, table.specialKind),
    index("idx_pages_owner_kind").on(table.ownerId, table.kind),
    /**
     * `thumbnail_object_id` 引きインデックス。DELETE /pages/:id で
     * thumbnail GC を実行する際の小さな確認クエリでも有効。
     *
     * Lookup index for `thumbnail_object_id`. Used by the small confirmation
     * query in DELETE /pages/:id when garbage-collecting thumbnails.
     */
    index("idx_pages_thumbnail_object_id").on(table.thumbnailObjectId),
    /**
     * Lookup of pages by owning note (`pages.note_id`).
     * 所属ノート別のページ引き用インデックス。
     */
    index("idx_pages_note_id").on(table.noteId),
    /**
     * `GET /api/notes/:id` のページ列挙クエリ
     * (`WHERE note_id = $1 AND is_deleted = false ORDER BY updated_at DESC`)
     * 専用の部分複合インデックス。ソフト削除行を除外してインデックスサイズを
     * 最小化しつつ、ノート単位のソートをインメモリではなくインデックススキャン
     * で解決する。Issue #850。
     *
     * Partial composite index that backs the page listing in
     * `GET /api/notes/:id`
     * (`WHERE note_id = $1 AND is_deleted = false ORDER BY updated_at DESC`).
     * Excluding soft-deleted rows keeps the index small and lets the
     * note-scoped sort run as an index scan instead of an in-memory sort.
     * Issue #850.
     */
    index("idx_pages_note_active_updated")
      .on(table.noteId, table.updatedAt.desc())
      .where(sql`${table.isDeleted} = false`),
    /**
     * `GET /api/notes/:noteId/pages` (Issue #860 Phase 1) の keyset cursor
     * pagination 用部分複合インデックス。
     * `ORDER BY updated_at DESC, id DESC` を index-only でスキャンし、
     * `(updated_at, id)` 二値の cursor 突合（`updated_at = $1 AND id < $2` の
     * tie-break 経路）も index 内で解決できるよう、`id DESC` まで含める。
     *
     * Partial composite index that backs the keyset cursor pagination on
     * `GET /api/notes/:noteId/pages` (Issue #860 Phase 1). Extending the
     * existing `(note_id, updated_at DESC)` order with `id DESC` lets the
     * `(updated_at, id)` tie-break predicate stay inside the index instead
     * of falling back to a heap re-check / sort.
     */
    index("idx_pages_note_active_updated_id")
      .on(table.noteId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.isDeleted} = false`),
    /**
     * オーナーごとに有効なウェルカムページは最大 1 件であることを担保する部分
     * ユニーク index。`welcomePageService.insertWelcomePage` の `onConflictDoNothing`
     * が target としてこの index に依拠している。実 DDL は
     * `drizzle/0018_add_onboarding_and_page_kind.sql` を参照。
     *
     * Partial unique index that enforces "at most one live welcome page per
     * owner". The `onConflictDoNothing` call in
     * `welcomePageService.insertWelcomePage` targets this exact index. The
     * actual DDL lives in `drizzle/0018_add_onboarding_and_page_kind.sql`.
     */
    uniqueIndex("idx_pages_unique_welcome_per_owner")
      .on(table.ownerId)
      .where(sql`${table.kind} = 'welcome' AND ${table.isDeleted} = false`),
  ],
);

/** Select type for the pages table. / pages テーブルの SELECT 型。 */
export type Page = typeof pages.$inferSelect;
/** Insert type for the pages table. / pages テーブルの INSERT 型。 */
export type NewPage = typeof pages.$inferInsert;
