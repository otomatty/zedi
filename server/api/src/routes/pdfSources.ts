/**
 * /api/sources/pdf — ローカル PDF をソースとして登録し、ハイライト CRUD と
 * 「ハイライトから派生ページを作る」フローを提供する。
 *
 * `/api/sources/pdf` — register a local PDF as a `kind="pdf_local"` source,
 * manage its highlights, and derive Zedi pages from highlights.
 *
 * 重要 / Important:
 *   元 PDF のファイルパス（実体）は決してサーバに渡らない。本ルートが受け取るのは
 *   ハッシュ・サイズ・ページ数・任意のメタ情報のみ。バイナリ送信は許容しない。
 *
 *   The original PDF path/bytes never reach the server. This route only
 *   accepts content hash, byte size, page count, and optional metadata. The
 *   Tauri-side local registry is the sole place that knows where the file
 *   actually lives on disk (issue otomatty/zedi#389).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { sources } from "../schema/sources.js";
import { pdfHighlights, PDF_HIGHLIGHT_COLORS } from "../schema/pdfHighlights.js";
import type { PdfHighlightColor, PdfHighlightRect } from "../schema/pdfHighlights.js";
import type { PdfSourceMetadata } from "../schema/sources.js";
import { pageSources } from "../schema/pageSources.js";
import { pages } from "../schema/pages.js";
import { ensureDefaultNote } from "../services/defaultNoteService.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

const PDF_SOURCE_KIND = "pdf_local" as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 矩形配列の入力バリデーション。
 * Runtime validation for an incoming highlight rect array.
 */
function validateRects(value: unknown): PdfHighlightRect[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HTTPException(400, { message: "rects must be a non-empty array" });
  }
  if (value.length > 64) {
    throw new HTTPException(400, { message: "rects has too many entries (max 64)" });
  }
  return value.map((raw, idx) => {
    if (typeof raw !== "object" || raw === null) {
      throw new HTTPException(400, { message: `rects[${idx}] must be an object` });
    }
    const r = raw as Record<string, unknown>;
    const x1 = Number(r.x1);
    const y1 = Number(r.y1);
    const x2 = Number(r.x2);
    const y2 = Number(r.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      throw new HTTPException(400, { message: `rects[${idx}] has non-finite coordinates` });
    }
    return { x1, y1, x2, y2 };
  });
}

/**
 * highlight color の入力バリデーション。
 * Validates `color` against the allowed enum.
 */
function validateColor(value: unknown): PdfHighlightColor {
  if (typeof value !== "string") {
    throw new HTTPException(400, { message: "color must be a string" });
  }
  if (!(PDF_HIGHLIGHT_COLORS as readonly string[]).includes(value)) {
    throw new HTTPException(400, {
      message: `color must be one of ${PDF_HIGHLIGHT_COLORS.join(", ")}`,
    });
  }
  return value as PdfHighlightColor;
}

/**
 * `sources` 行が当該ユーザー所有の PDF ソースか確認する。
 * Ensures the source row exists, is `kind="pdf_local"`, and is owned by the user.
 */
async function loadOwnedPdfSourceOrThrow(
  db: AppEnv["Variables"]["db"],
  sourceId: string,
  userId: string,
) {
  const [row] = await db
    .select({
      id: sources.id,
      kind: sources.kind,
      ownerId: sources.ownerId,
      displayName: sources.displayName,
    })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.ownerId, userId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "PDF source not found" });
  if (row.kind !== PDF_SOURCE_KIND) {
    throw new HTTPException(400, { message: "Source is not a local PDF" });
  }
  return row;
}

// ── POST /api/sources/pdf ───────────────────────────────────────────────────
// PDF ソース行を登録（再投入はハッシュで dedup）。サーバには絶対パスを渡さない。
// Register a PDF source row. Re-registration of the same file dedups via the
// `(owner, kind="pdf_local", content_hash)` partial unique index — no path
// fields are accepted.

interface RegisterPdfSourceBody {
  /** PDF バイト列の SHA-256 16進文字列。SHA-256 hex of the PDF bytes. */
  sha256?: string;
  /** PDF のバイトサイズ。Byte size of the PDF. */
  byteSize?: number;
  /** PDF の総ページ数（pdfjs から取得）。Total PDF page count from pdf.js. */
  pageCount?: number;
  /** ユーザーに表示するファイル名。Filename shown in UI. */
  displayName?: string;
  /** 任意のメタデータ（PDF Info / XMP 由来）。Free-form metadata. */
  metadata?: PdfSourceMetadata;
}

app.post("/pdf", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  let body: RegisterPdfSourceBody;
  try {
    body = await c.req.json<RegisterPdfSourceBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  if (typeof body.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(body.sha256)) {
    throw new HTTPException(400, { message: "sha256 must be a 64-char hex string" });
  }
  const sha256 = body.sha256.toLowerCase();
  const byteSize = typeof body.byteSize === "number" && body.byteSize >= 0 ? body.byteSize : null;
  const pageCount =
    typeof body.pageCount === "number" && body.pageCount > 0 && Number.isInteger(body.pageCount)
      ? body.pageCount
      : null;
  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim().slice(0, 255)
      : null;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;

  const now = new Date();

  // 既存ソースを先に SELECT。本実装は ON CONFLICT DO NOTHING + 再 SELECT で
  // 並行登録にも収束する（既存 ingest.ts と同じ流儀）。
  // Pre-flight SELECT + ON CONFLICT DO NOTHING + re-SELECT mirrors the ingest
  // route so concurrent registrations converge on a single winner.
  const [existing] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.ownerId, userId),
        eq(sources.kind, PDF_SOURCE_KIND),
        eq(sources.contentHash, sha256),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ sourceId: existing.id, deduped: true });
  }

  const [inserted] = await db
    .insert(sources)
    .values({
      ownerId: userId,
      kind: PDF_SOURCE_KIND,
      url: null,
      title: displayName,
      contentHash: sha256,
      excerpt: null,
      extractedAt: now,
      createdAt: now,
      displayName,
      byteSize,
      pageCount,
      metadata,
    })
    .onConflictDoNothing()
    .returning({ id: sources.id });

  if (inserted) {
    return c.json({ sourceId: inserted.id, deduped: false }, 201);
  }

  // Race lost — pick up the winner.
  const [winner] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.ownerId, userId),
        eq(sources.kind, PDF_SOURCE_KIND),
        eq(sources.contentHash, sha256),
      ),
    )
    .limit(1);
  if (!winner) throw new HTTPException(500, { message: "Failed to register PDF source" });
  return c.json({ sourceId: winner.id, deduped: true });
});

// ── PATCH /api/sources/pdf/:sourceId/page-count ─────────────────────────────
// `register_pdf_source` で page_count が分からないケース向けに、後追いで pdfjs
// 取得値を反映する補助エンドポイント。
// Helper used after pdf.js has loaded the document and learned its page count
// (the Rust side does not parse PDFs to keep dependencies minimal).

app.patch("/pdf/:sourceId/page-count", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const sourceId = c.req.param("sourceId");
  await loadOwnedPdfSourceOrThrow(db, sourceId, userId);

  let body: { pageCount?: unknown };
  try {
    body = await c.req.json<{ pageCount?: unknown }>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const pageCount = Number(body.pageCount);
  if (!Number.isInteger(pageCount) || pageCount <= 0 || pageCount > 100_000) {
    throw new HTTPException(400, { message: "pageCount must be a positive integer" });
  }

  await db.update(sources).set({ pageCount }).where(eq(sources.id, sourceId));
  return c.json({ sourceId, pageCount });
});

// ── GET /api/sources/pdf/:sourceId/highlights ───────────────────────────────

app.get("/pdf/:sourceId/highlights", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const sourceId = c.req.param("sourceId");
  await loadOwnedPdfSourceOrThrow(db, sourceId, userId);

  const rows = await db
    .select()
    .from(pdfHighlights)
    .where(eq(pdfHighlights.sourceId, sourceId))
    .orderBy(pdfHighlights.pdfPage, pdfHighlights.createdAt);

  return c.json({ highlights: rows });
});

// ── POST /api/sources/pdf/:sourceId/highlights ──────────────────────────────

interface CreateHighlightBody {
  pdfPage?: unknown;
  rects?: unknown;
  text?: unknown;
  color?: unknown;
  note?: unknown;
}

app.post("/pdf/:sourceId/highlights", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const sourceId = c.req.param("sourceId");
  await loadOwnedPdfSourceOrThrow(db, sourceId, userId);

  let body: CreateHighlightBody;
  try {
    body = await c.req.json<CreateHighlightBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const pdfPage = Number(body.pdfPage);
  if (!Number.isInteger(pdfPage) || pdfPage <= 0) {
    throw new HTTPException(400, { message: "pdfPage must be a positive integer" });
  }
  const rects = validateRects(body.rects);
  if (typeof body.text !== "string" || !body.text.trim()) {
    throw new HTTPException(400, { message: "text is required" });
  }
  const text = body.text.slice(0, 10_000);
  const color: PdfHighlightColor = body.color === undefined ? "yellow" : validateColor(body.color);
  const note = typeof body.note === "string" ? body.note.slice(0, 4_000) : null;

  const [row] = await db
    .insert(pdfHighlights)
    .values({
      sourceId,
      ownerId: userId,
      pdfPage,
      rects,
      text,
      color,
      note,
    })
    .returning();
  if (!row) throw new HTTPException(500, { message: "Failed to create highlight" });

  return c.json({ highlight: row }, 201);
});

// ── PATCH /api/sources/pdf/:sourceId/highlights/:highlightId ─────────────────

app.patch("/pdf/:sourceId/highlights/:highlightId", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const sourceId = c.req.param("sourceId");
  const highlightId = c.req.param("highlightId");
  await loadOwnedPdfSourceOrThrow(db, sourceId, userId);

  let body: { color?: unknown; note?: unknown };
  try {
    body = await c.req.json<{ color?: unknown; note?: unknown }>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.color !== undefined) patch.color = validateColor(body.color);
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") {
      throw new HTTPException(400, { message: "note must be a string or null" });
    }
    patch.note = body.note === null ? null : (body.note as string).slice(0, 4_000);
  }
  if (Object.keys(patch).length === 1) {
    throw new HTTPException(400, { message: "no patchable fields supplied" });
  }

  const [row] = await db
    .update(pdfHighlights)
    .set(patch)
    .where(
      and(
        eq(pdfHighlights.id, highlightId),
        eq(pdfHighlights.sourceId, sourceId),
        eq(pdfHighlights.ownerId, userId),
      ),
    )
    .returning();
  if (!row) throw new HTTPException(404, { message: "Highlight not found" });
  return c.json({ highlight: row });
});

// ── DELETE /api/sources/pdf/:sourceId/highlights/:highlightId ───────────────

app.delete("/pdf/:sourceId/highlights/:highlightId", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const sourceId = c.req.param("sourceId");
  const highlightId = c.req.param("highlightId");
  await loadOwnedPdfSourceOrThrow(db, sourceId, userId);

  const deleted = await db
    .delete(pdfHighlights)
    .where(
      and(
        eq(pdfHighlights.id, highlightId),
        eq(pdfHighlights.sourceId, sourceId),
        eq(pdfHighlights.ownerId, userId),
      ),
    )
    .returning({ id: pdfHighlights.id });
  if (deleted.length === 0) throw new HTTPException(404, { message: "Highlight not found" });
  return c.json({ deleted: deleted[0]?.id });
});

// ── POST /api/sources/pdf/:sourceId/highlights/:highlightId/derive-page ─────
// 出典付きの新規 Zedi ページを 1 トランザクションで作る。
// Create a derived Zedi page in one transaction:
//   1. INSERT pages
//   2. INSERT page_sources (carries "pdf:v1:<highlightId>")
//   3. UPDATE pdf_highlights.derived_page_id

interface DerivePageBody {
  /** 派生ページを作るノート ID（省略時は default note）。Target note id, defaults to user's default note. */
  noteId?: string | null;
  /** ページタイトル（クライアントの buildDerivedPageTitle の結果を渡す）。Page title. */
  title?: string;
  /** 検索用プレビュー（先頭 120 字）。Search preview, first 120 chars. */
  contentPreview?: string;
  /** クライアント側で組み立てた Tiptap JSON 文字列。後続の初回オープン時に seed する。
   *  Stringified Tiptap JSON to seed the new page's content on first open. */
  templateContent?: string;
}

app.post(
  "/pdf/:sourceId/highlights/:highlightId/derive-page",
  authRequired,
  rateLimit(),
  async (c) => {
    const userId = c.get("userId");
    const db = c.get("db");
    const sourceId = c.req.param("sourceId");
    const highlightId = c.req.param("highlightId");
    await loadOwnedPdfSourceOrThrow(db, sourceId, userId);

    const [highlightRow] = await db
      .select()
      .from(pdfHighlights)
      .where(
        and(
          eq(pdfHighlights.id, highlightId),
          eq(pdfHighlights.sourceId, sourceId),
          eq(pdfHighlights.ownerId, userId),
        ),
      )
      .limit(1);
    if (!highlightRow) throw new HTTPException(404, { message: "Highlight not found" });
    if (highlightRow.derivedPageId) {
      // 既に派生ページがあるので冪等に既存 ID を返す。
      // Idempotent: a derived page already exists.
      return c.json({ pageId: highlightRow.derivedPageId, alreadyDerived: true });
    }

    let body: DerivePageBody = {};
    try {
      body = await c.req.json<DerivePageBody>();
    } catch {
      // body 省略を許容（必須フィールド無し）。Body is optional.
    }

    const requestedNoteId =
      typeof body.noteId === "string" && body.noteId.trim() !== "" ? body.noteId.trim() : null;
    const title =
      typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 255) : null;
    const contentPreview =
      typeof body.contentPreview === "string"
        ? body.contentPreview.slice(0, 240)
        : highlightRow.text.slice(0, 240);

    // ノート所属を解決（default に寄せる）。ノート権限の細かなチェックは
    // /api/pages POST と同等のロジックを将来 import で共有してもよい。
    // Resolve note membership; default to the user's default note.
    const resolvedNoteId: string = requestedNoteId ?? (await ensureDefaultNote(db, userId)).id;

    const sectionAnchor = `pdf:v1:${highlightRow.id}`;

    // 1 トランザクションで全ての書き込みを行い、いずれかの失敗で全体を巻き戻す。
    // Perform all writes in one transaction so a failure rolls everything back.
    const result = await db.transaction(async (tx) => {
      const [page] = await tx
        .insert(pages)
        .values({
          ownerId: userId,
          noteId: resolvedNoteId,
          title,
          contentPreview,
          sourceUrl: null,
        })
        .returning({
          id: pages.id,
          title: pages.title,
          contentPreview: pages.contentPreview,
          createdAt: pages.createdAt,
        });
      if (!page) {
        throw new HTTPException(500, { message: "Failed to create derived page" });
      }

      // page_sources は冪等に登録（同一 sectionAnchor の再投入を許容）。
      // Idempotently insert the page_sources row.
      await tx
        .insert(pageSources)
        .values({
          pageId: page.id,
          sourceId,
          sectionAnchor,
          citationText: highlightRow.text.slice(0, 4_000),
        })
        .onConflictDoNothing();

      await tx
        .update(pdfHighlights)
        .set({ derivedPageId: page.id, updatedAt: new Date() })
        .where(eq(pdfHighlights.id, highlightRow.id));

      return page;
    });

    return c.json(
      {
        pageId: result.id,
        noteId: resolvedNoteId,
        sectionAnchor,
        // テンプレートは v1 では echo するだけ。クライアントが「派生直後の初回オープン」で
        // pageContents へ seed する責務を担う。
        // v1 echoes the template back; the client is responsible for seeding
        // it into pageContents on the first open of the new page.
        templateContent: body.templateContent ?? null,
        title: result.title ?? null,
        contentPreview: result.contentPreview ?? null,
        createdAt: result.createdAt.toISOString(),
      },
      201,
    );
  },
);

export default app;
