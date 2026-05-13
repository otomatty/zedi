/**
 * `pdf_highlights` — Highlights captured on a `kind="pdf_local"` source.
 *
 * 「ローカル PDF 上のハイライト」を保持するテーブル。
 * 1 行 = 1 ハイライト。Excerpt-centric な派生ページとは 1:0..1 で対応する。
 * 一つのハイライトから派生したページの id を `derivedPageId` で持ち戻せる
 * が、正準の「派生 ↔ 出典」関係は `page_sources` 経由で表現する。
 *
 * One row = one highlight on a local PDF. With the excerpt-centric flow
 * (otomatty/zedi#389), a highlight maps to at most one derived Zedi page;
 * the canonical "page ↔ source" relation lives in `page_sources` and the
 * `derivedPageId` column on this table is a convenience back-pointer.
 */
import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { pages } from "./pages.js";
import { sources } from "./sources.js";

/**
 * PDF 上の矩形領域（ハイライト範囲）。PDF のポイント空間で表現する。
 * Bounding rect in PDF point space, used by viewer to render highlight quads.
 *
 * @property x1 - 左下 x（PDF user-space）。Bottom-left x.
 * @property y1 - 左下 y。Bottom-left y.
 * @property x2 - 右上 x。Top-right x.
 * @property y2 - 右上 y。Top-right y.
 */
export interface PdfHighlightRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 許容するハイライト色の列挙。UI と一致させる。
 * Allowed highlight colors (kept in sync with the toolbar UI).
 */
export const PDF_HIGHLIGHT_COLORS = ["yellow", "green", "blue", "red", "purple"] as const;
export type PdfHighlightColor = (typeof PDF_HIGHLIGHT_COLORS)[number];

/**
 * `pdf_highlights` テーブル定義。
 * Drizzle definition for the `pdf_highlights` table.
 *
 * @property id - ハイライトの一意 ID。Unique ID.
 * @property sourceId - 紐づく `sources.id`（`kind="pdf_local"`）。Owning source.
 * @property ownerId - 所有ユーザー ID（所有検索用に非正規化）。Denormalized owner.
 * @property derivedPageId - 派生 Zedi ページ ID（存在する場合）。Derived page id.
 * @property pdfPage - 1 始まりの PDF ページ番号。1-indexed PDF page.
 * @property rects - 選択範囲の矩形配列（複数行選択を 1 つにまとめる）。Rect array.
 * @property text - 抽出した本文テキスト。Extracted highlight text.
 * @property color - ハイライト色。Highlight color.
 * @property note - 任意のメモ（ハイライトに直接付与する短文）。Optional inline note.
 * @property createdAt - 作成時刻。Created at.
 * @property updatedAt - 更新時刻。Updated at.
 */
export const pdfHighlights = pgTable(
  "pdf_highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    derivedPageId: uuid("derived_page_id").references(() => pages.id, { onDelete: "set null" }),
    pdfPage: integer("pdf_page").notNull(),
    rects: jsonb("rects").$type<PdfHighlightRect[]>().notNull(),
    text: text("text").notNull(),
    color: text("color").notNull().default("yellow"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_pdf_highlights_source_id").on(table.sourceId, table.pdfPage),
    index("idx_pdf_highlights_owner_id").on(table.ownerId),
    index("idx_pdf_highlights_derived_page_id").on(table.derivedPageId),
  ],
);

/**
 * pdf_highlights テーブルの SELECT 型。
 * Select type for the pdf_highlights table.
 */
export type PdfHighlight = typeof pdfHighlights.$inferSelect;

/**
 * pdf_highlights テーブルの INSERT 型。
 * Insert type for the pdf_highlights table.
 */
export type NewPdfHighlight = typeof pdfHighlights.$inferInsert;
