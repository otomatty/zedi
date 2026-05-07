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
     * 所属ノート ID。NULL は個人ページ（旧モデル）、値ありはそのノートに
     * 所属するノートネイティブページ。デフォルトノート移行（PR 1b）後は
     * NOT NULL に昇格させ、すべてのページがノート所属になる予定。
     * Issue #713 を参照。
     *
     * Owning note ID. NULL is a legacy "personal page"; a non-null value is a
     * note-native page. PR 1b will backfill personal pages into each user's
     * default note and promote this column to NOT NULL. See issue #713.
     */
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
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
     * Lookup of pages owned by a particular note (and an efficient predicate
     * for "personal pages only" via `note_id IS NULL` / `IS NOT NULL`).
     * 特定のノートに所属するページの引きと、`note_id IS NULL`/`IS NOT NULL` の
     * 部分述語に効くインデックス。
     */
    index("idx_pages_note_id").on(table.noteId),
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
