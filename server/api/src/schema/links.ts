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

/**
 * Directed page-to-page reference graph. Rows represent `[[WikiLink]]` or
 * `#tag` edges depending on `link_type`. The composite primary key is
 * `(source_id, target_id, link_type)` so a page pair can carry independent
 * wiki and tag edges simultaneously. Self-references are rejected via a
 * CHECK constraint.
 *
 * ページ間の有向参照グラフ。`link_type` により `[[WikiLink]]` と `#tag` の
 * 両方を同じテーブルに格納する。主キーは `(source_id, target_id, link_type)`
 * とし、同一ページ対でも種別ごとに独立したエッジを持てる。自己参照は CHECK
 * 制約で拒否する。
 */
export const links = pgTable(
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

/** Row type for SELECT queries against `links`. / `links` の SELECT 行型。 */
export type Link = typeof links.$inferSelect;
/** Row type for INSERT into `links`. / `links` への INSERT 行型。 */
export type NewLink = typeof links.$inferInsert;

/**
 * Unresolved link/tag references (ghost edges). Rows are written when the
 * target text does not yet map to a page in the source's scope. They are
 * upgraded to `links` rows once a matching page appears. `link_type` mirrors
 * the `links` table so wiki-link and tag ghosts are tracked independently.
 *
 * 未解決のリンク／タグ参照（ゴーストエッジ）。対象テキストが同スコープの
 * ページに解決できないときに登録し、一致するページが現れたら `links` に
 * 昇格する。`link_type` は `links` と対応し、WikiLink とタグのゴーストを
 * 独立に追跡する。
 */
export const ghostLinks = pgTable(
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

/** Row type for SELECT queries against `ghost_links`. / `ghost_links` の SELECT 行型。 */
export type GhostLink = typeof ghostLinks.$inferSelect;
/** Row type for INSERT into `ghost_links`. / `ghost_links` への INSERT 行型。 */
export type NewGhostLink = typeof ghostLinks.$inferInsert;
