/**
 * page_snapshots — ページバージョン履歴スナップショット
 * Page version history snapshots
 */
import { pgTable, uuid, text, bigint, timestamp, customType, index } from "drizzle-orm/pg-core";
import { pages } from "./pages.js";

const bytea = customType<{ data: Buffer; dpiType: string }>({
  dataType() {
    return "bytea";
  },
});

/**
 * `page_snapshots` テーブル定義。ページごとの履歴スナップショットを保持し、
 * 復元・比較・自動保存の基準データとして使う。
 * `page_snapshots` table definition for per-page history snapshots used by
 * restore, compare, and auto-save workflows.
 */
export const pageSnapshots = pgTable(
  "page_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    version: bigint("version", { mode: "number" }).notNull(),
    ydocState: bytea("ydoc_state").notNull(),
    contentText: text("content_text"),
    createdBy: text("created_by"),
    trigger: text("trigger", { enum: ["auto", "restore", "pre-restore"] })
      .notNull()
      .default("auto"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_page_snapshots_page_id").on(table.pageId),
    index("idx_page_snapshots_page_created").on(table.pageId, table.createdAt),
  ],
);

/**
 * 取得時のページスナップショット行型。
 * Selected row type for `page_snapshots`.
 */
export type PageSnapshot = typeof pageSnapshots.$inferSelect;
/**
 * 挿入時のページスナップショット行型。
 * Insert shape for `page_snapshots`.
 */
export type NewPageSnapshot = typeof pageSnapshots.$inferInsert;
