/**
 * Link table between `pages` (mutable wiki entries) and `sources` (immutable
 * raw material). One source can inform many pages, and one page can cite many
 * sources — hence a many-to-many relation.
 *
 * ページ（可変の Wiki）と ソース（不変の素材）の多対多関連。
 * 1 つのソースが複数ページに影響しうるし、1 ページが複数ソースを引用する。
 *
 * @see https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
 */
import { pgTable, uuid, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { pages } from "./pages.js";
import { sources } from "./sources.js";

/**
 * ページ ↔ ソースの紐付け。section_anchor で「このソースはページ内のどこに
 * 反映されたか」を記録できる（未使用時は空文字で主キー衝突を防ぐ）。
 * Page ↔ source junction. `sectionAnchor` records which part of the page a
 * source informs; empty string when unknown.
 *
 * @property pageId - 対象ページ ID。Page ID.
 * @property sourceId - 対象ソース ID。Source ID.
 * @property sectionAnchor - ページ内アンカー（見出しスラッグ等。空文字可）。Section anchor (empty string allowed).
 * @property citationText - 実際に引用した抜粋テキスト。Excerpt cited from the source.
 * @property createdAt - リンク作成時刻。Linked at.
 */
export const pageSources = pgTable(
  "page_sources",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    sectionAnchor: text("section_anchor").notNull().default(""),
    citationText: text("citation_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pageId, table.sourceId, table.sectionAnchor] }),
    index("idx_page_sources_page_id").on(table.pageId),
    index("idx_page_sources_source_id").on(table.sourceId),
  ],
);

/**
 * page_sources テーブルの SELECT 型。
 * Select type for the page_sources table.
 */
export type PageSource = typeof pageSources.$inferSelect;

/**
 * page_sources テーブルの INSERT 型。
 * Insert type for the page_sources table.
 */
export type NewPageSource = typeof pageSources.$inferInsert;
