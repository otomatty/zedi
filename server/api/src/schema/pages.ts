import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

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
    sourcePageId: uuid("source_page_id"),
    title: text("title"),
    contentPreview: text("content_preview"),
    thumbnailUrl: text("thumbnail_url"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    /**
     * True for the special "wiki schema" page (at most one per owner).
     * Wiki の「憲法」ページを示すフラグ（オーナーごとに最大 1 つ）。
     */
    isSchema: boolean("is_schema").default(false).notNull(),
  },
  (table) => [
    index("idx_pages_owner_id").on(table.ownerId),
    index("idx_pages_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_pages_source_page_id").on(table.sourcePageId),
    index("idx_pages_is_deleted")
      .on(table.ownerId)
      .where(sql`NOT ${table.isDeleted}`),
  ],
);

/** Select type for the pages table. / pages テーブルの SELECT 型。 */
export type Page = typeof pages.$inferSelect;
/** Insert type for the pages table. / pages テーブルの INSERT 型。 */
export type NewPage = typeof pages.$inferInsert;
