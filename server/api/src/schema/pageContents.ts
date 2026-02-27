import { pgTable, uuid, text, bigint, timestamp, customType } from "drizzle-orm/pg-core";
import { pages } from "./pages.js";

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

export type PageContent = typeof pageContents.$inferSelect;
export type NewPageContent = typeof pageContents.$inferInsert;
