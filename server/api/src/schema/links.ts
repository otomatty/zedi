import { pgTable, uuid, text, timestamp, primaryKey, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pages } from "./pages.js";
import { notes } from "./notes.js";

/**
 * Link type discriminator shared by `links` and `ghost_links`.
 * `links` / `ghost_links` で共有するリンク種別の列挙。
 *
 * - `"wiki"`: WikiLink (`[[Title]]`) — legacy behavior; default for existing rows.
 * - `"tag"`:  Hashtag (`#name`) — added in issue #725 (Phase 1).
 */
export type LinkType = "wiki" | "tag";

/**
 * Allowed string values for the `link_type` column. Used by Postgres `CHECK`
 * constraints and application-side validation.
 *
 * `link_type` カラムに許容される文字列値。Postgres の CHECK 制約および
 * アプリ側のバリデーションで使用する。
 */
export const LINK_TYPES: readonly LinkType[] = ["wiki", "tag"] as const;

export /**
 *
 */
const links = pgTable(
  "links",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    // `link_type` は WikiLink (`[[...]]`) とタグ (`#...`) を区別する識別子。
    // 既存データは `'wiki'` として埋める（issue #725 マイグレーション参照）。
    // Discriminates WikiLink (`[[...]]`) vs. Tag (`#...`). Existing rows are
    // backfilled to `'wiki'` — see migration for issue #725.
    linkType: text("link_type").$type<LinkType>().notNull().default("wiki"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // (source, target, link_type) が主キー。同じページ対でも WikiLink 参照と
    // タグ参照を独立に記録できるよう、`link_type` を主キーに含める。
    // Include `link_type` in the primary key so the same page pair can carry
    // an independent wiki-link edge and tag edge without collision.
    primaryKey({ columns: [table.sourceId, table.targetId, table.linkType] }),
    index("idx_links_source_id").on(table.sourceId),
    index("idx_links_target_id").on(table.targetId),
    index("idx_links_link_type").on(table.linkType),
    check("links_no_self_ref", sql`${table.sourceId} != ${table.targetId}`),
    check("links_link_type_valid", sql`${table.linkType} IN ('wiki', 'tag')`),
  ],
);

/**
 *
 */
export type Link = typeof links.$inferSelect;
/**
 *
 */
export type NewLink = typeof links.$inferInsert;

export /**
 *
 */
const ghostLinks = pgTable(
  "ghost_links",
  {
    linkText: text("link_text").notNull(),
    sourcePageId: uuid("source_page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    // `link_type` は WikiLink とタグの未実体参照を区別する識別子（`links` と同じ契約）。
    // Same discriminator as `links`; lets a single `link_text` simultaneously
    // represent a wiki-link ghost and a tag ghost without key collision.
    linkType: text("link_type").$type<LinkType>().notNull().default("wiki"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    originalTargetPageId: uuid("original_target_page_id").references(() => pages.id, {
      onDelete: "set null",
    }),
    originalNoteId: uuid("original_note_id").references(() => notes.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.linkText, table.sourcePageId, table.linkType] }),
    index("idx_ghost_links_link_text").on(table.linkText),
    index("idx_ghost_links_source_page_id").on(table.sourcePageId),
    index("idx_ghost_links_link_type").on(table.linkType),
    check("ghost_links_link_type_valid", sql`${table.linkType} IN ('wiki', 'tag')`),
  ],
);

/**
 *
 */
export type GhostLink = typeof ghostLinks.$inferSelect;
/**
 *
 */
export type NewGhostLink = typeof ghostLinks.$inferInsert;
