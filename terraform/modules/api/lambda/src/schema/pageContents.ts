/**
 * Drizzle ORM Schema: page_contents
 * Source: db/aurora/001_schema.sql — page_contents テーブル (Y.Doc persistence)
 */
import { pgTable, uuid, text, bigint, timestamp, customType } from "drizzle-orm/pg-core";
import { pages } from "./pages";

/**
 * PostgreSQL BYTEA 型のカスタムタイプ
 * ydoc_state は Y.Doc のバイナリ永続化に使用
 */
const bytea = customType<{ data: Buffer; dpiType: string }>({
  dataType() {
    return "bytea";
  },
});

export const pageContents = pgTable("page_contents", {
  pageId: uuid("page_id")
    .primaryKey()
    .references(() => pages.id, { onDelete: "cascade" }),
  ydocState: bytea("ydoc_state").notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  contentText: text("content_text"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Note: pg_bigm の GIN インデックス (idx_page_contents_text_bigm) は
// Drizzle ORM では直接定義できないため、SQL マイグレーションで管理する

export type PageContent = typeof pageContents.$inferSelect;
export type NewPageContent = typeof pageContents.$inferInsert;
