/**
 * Raw sources for the LLM Wiki pattern.
 *
 * A `source` is an immutable record of an external artifact (URL, conversation,
 * etc.) ingested into the user's Wiki. Unlike a `page`, a source is never
 * rewritten by the AI — it preserves the original provenance so that pages can
 * trace back to where their claims came from.
 *
 * LLM Wiki パターンの不変ソース層。
 * URL / 会話などクリップ済みの元資料を保持する。ページ（pages）は AI により
 * 書き換わるが、sources は不変で出典トレースに使う。
 *
 * @see https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
 */
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/**
 * 外部から取り込んだ素材（URL / 会話 等）。不変・AI による書き換え対象外。
 * External material ingested from URL or conversation. Immutable.
 *
 * @property id - ソースの一意 ID。Unique ID.
 * @property ownerId - 所有ユーザー ID。Owner user ID.
 * @property kind - ソース種別。"url" | "conversation"（将来拡張可能）。Source kind.
 * @property url - 取得元 URL（kind="url" のとき）。Source URL (when kind="url").
 * @property title - ソースのタイトル（OGP / Readability 抽出）。Source title.
 * @property contentHash - 本文の SHA-256 等。重複検出用。Content hash for dedup.
 * @property excerpt - 先頭の要約プレビュー（重い本文を別カラムに分けず軽量化）。Short excerpt.
 * @property extractedAt - 抽出を行った時刻。When extraction happened.
 * @property createdAt - レコード作成時刻。Row created at.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("url"),
    url: text("url"),
    title: text("title"),
    contentHash: text("content_hash"),
    excerpt: text("excerpt"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sources_owner_id").on(table.ownerId),
    index("idx_sources_kind").on(table.kind),
    // content_hash lookup for dedup（同 hash のソースがあれば再利用する）
    // Index for content-hash dedup lookups.
    index("idx_sources_owner_content_hash").on(table.ownerId, table.contentHash),
    // URL lookup（ユーザーごとに同 URL が複数回クリップされうるので non-unique）
    // URL lookup (non-unique; same URL may be clipped multiple times).
    index("idx_sources_owner_url").on(table.ownerId, table.url),
    // URL が存在するときのみ (owner, url, hash) を一意とする部分ユニーク制約
    // Partial unique index: only when url is not null.
    uniqueIndex("uq_sources_owner_url_hash")
      .on(table.ownerId, table.url, table.contentHash)
      .where(sql`${table.url} IS NOT NULL`),
    // URL が無いソース（kind="conversation" 等）は (owner, kind, content_hash) で
    // 一意にする。これが無いと並行 ingest が同一 contentHash で同じ会話を二重に
    // 挿入し、`onConflictDoNothing` での再 SELECT 経路が機能しない。
    // Partial unique index for sources without a URL (e.g. kind="conversation"):
    // ensures (owner, kind, content_hash) is unique so concurrent inserts
    // converge via ON CONFLICT DO NOTHING + re-SELECT.
    uniqueIndex("uq_sources_owner_kind_hash_when_url_null")
      .on(table.ownerId, table.kind, table.contentHash)
      .where(sql`${table.url} IS NULL AND ${table.contentHash} IS NOT NULL`),
  ],
);

/**
 * sources テーブルの SELECT 型。
 * Select type for the sources table.
 */
export type Source = typeof sources.$inferSelect;

/**
 * sources テーブルの INSERT 型。
 * Insert type for the sources table.
 */
export type NewSource = typeof sources.$inferInsert;
