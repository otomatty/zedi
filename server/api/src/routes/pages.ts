/**
 * /api/pages — ページ CRUD + コンテンツ管理
 *
 * GET    /api/pages                — 自分 (own) のページ一覧、または共有 (shared) を含めた一覧をページネーション取得
 *        — List the caller's pages (own, or own + shared via notes) with limit/offset pagination.
 * GET    /api/pages/:id/content — Y.Doc コンテンツ取得（`page_contents` 行が未作成の空ページは 200 + 空 ydoc）
 *        — Retrieve Y.Doc content (200 + empty `ydoc_state` when no `page_contents` row).
 * PUT    /api/pages/:id/content — Y.Doc コンテンツ更新 (楽観的ロック) / Update with optimistic locking
 * POST   /api/pages             — 新規ページ作成 / Create page
 * DELETE /api/pages/:id         — ページ論理削除 / Soft-delete page
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, sql } from "drizzle-orm";
import { pages, pageContents } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv, Database } from "../types/index.js";
import { maybeCreateSnapshot } from "../services/snapshotService.js";
import { assertPageViewAccess, assertPageEditAccess } from "../services/pageAccessService.js";

/**
 * ベストエフォートで自動スナップショットを作成する。失敗してもメイン処理には影響しない。
 * Best-effort auto-snapshot creation. Failures are logged but never propagate.
 */
async function tryAutoSnapshot(
  db: Database,
  pageId: string,
  ydocState: Buffer,
  contentText: string | null,
  version: number,
  userId: string,
): Promise<void> {
  try {
    await maybeCreateSnapshot(db, pageId, ydocState, contentText, version, userId);
  } catch (error) {
    console.error(`[Snapshot] Failed to create auto-snapshot for page ${pageId}:`, error);
  }
}

const app = new Hono<AppEnv>();

/**
 * PUT /content リクエストから pages テーブルの更新セットを構築し、変更があれば適用する。
 * Build and apply pages-table updates (title, content_preview, updated_at) from PUT body.
 */
async function applyPagesMetadataUpdate(
  db: { update: Database["update"] },
  pageId: string,
  body: { title?: string; content_preview?: string },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (body.title !== undefined) set.title = body.title;
  if (body.content_preview !== undefined) set.contentPreview = body.content_preview;
  if (Object.keys(set).length === 0) return;
  set.updatedAt = new Date();
  await db.update(pages).set(set).where(eq(pages.id, pageId));
}

// ── GET /pages ──────────────────────────────────────────────────────────────
// `scope=shared` の場合、`/api/search` と同じ認可ロジック
// (own + 受諾済みノートメンバー + note owner) を流用する。
// When `scope=shared`, reuses the same authorization model as `/api/search`
// (own pages + accepted note members + note owners).
app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  // クエリパラメータは整数として明示的にパースする。`Number("abc")` だと NaN が SQL に渡るため。
  // Parse query params as integers — `Number("abc")` would propagate NaN into SQL.
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20", 10) || 20, 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
  const scope = c.req.query("scope") === "shared" ? "shared" : "own";

  // アクセス制御だけを変数化して SELECT 文の重複を避ける。
  // `shared` は `services/pageAccessService.ts` と同じ正規の認可モデルを採用:
  //   - notes が未削除であること
  //   - note_members.status = 'accepted' (招待を受諾済み) であること
  //   - note_members / note_pages が未削除であること
  // 大規模データセットでもプランナーが効きやすい EXISTS + JOIN を使う。
  // Vary only the access predicate to avoid duplicating the SELECT.
  // `shared` mirrors the canonical authorization model from `services/pageAccessService.ts`:
  //   the linked note must be active, the membership must be accepted, and the join rows
  //   must not be soft-deleted. EXISTS + JOIN keeps the planner happy on large datasets.
  // `own` スコープは個人ページ（`pages.note_id IS NULL`）のみを返す。
  // ノートネイティブページ（issue #713）は、ノート画面または `scope=shared`
  // 経由でのみアクセスする。`shared` 経由の場合は (a) note_members 経由の
  // メンバーシップ、または (b) `note_pages -> notes.owner_id = userId` 経由の
  // オーナーシップで含まれる。オーナー経路を note-native page だけに限定すると、
  // linked personal page が listing から消えて `assertPageViewAccess` と非対称になる。
  // `getNoteRole` の解決順 (owner → member → ...) と listing predicate を揃える。
  //
  // The `own` scope returns personal pages only (`pages.note_id IS NULL`).
  // Note-native pages (issue #713) are accessed via the note view or
  // `scope=shared`. `shared` includes them either through (a) `note_members`
  // membership or (b) note ownership reached through `note_pages`. That owner
  // branch must cover linked personal pages too; otherwise owners could open
  // them via `assertPageViewAccess` while the listing hides them.
  const accessFilter =
    scope === "shared"
      ? sql`(
          (p.owner_id = ${userId} AND p.note_id IS NULL)
          OR EXISTS (
            SELECT 1 FROM note_pages np
            JOIN notes n ON n.id = np.note_id
            JOIN note_members nm ON nm.note_id = np.note_id
            JOIN "user" u ON u.email = nm.member_email
            WHERE np.page_id = p.id
              AND u.id = ${userId}
              AND nm.status = 'accepted'
              AND nm.is_deleted = false
              AND np.is_deleted = false
              AND n.is_deleted = false
          )
          OR EXISTS (
            SELECT 1 FROM note_pages np
            JOIN notes n ON n.id = np.note_id
            WHERE np.page_id = p.id
              AND np.is_deleted = false
              AND n.owner_id = ${userId}
              AND n.is_deleted = false
          )
        )`
      : sql`p.owner_id = ${userId} AND p.note_id IS NULL`;

  // Wiki の内部システムページ（`special_kind` が `__index__` / `__log__`、
  // および `is_schema = true` のスキーマページ）は通常一覧から除外する。
  // クライアントがそれらを編集するための専用 UI が別にあるため、`/api/pages`
  // で返すと NotFound 化したり、ヘッダ付きカードの中に編集不能な行が混ざる。
  // include_special=true を指定したクライアントのみオプトインで取得できる。
  // Hide internal/system pages (special_kind set or is_schema=true) from the
  // generic listing; clients that need them can opt in with include_special=true.
  const includeSpecial = c.req.query("include_special") === "true";
  const specialKindFilter = includeSpecial
    ? sql`TRUE`
    : sql`p.special_kind IS NULL AND p.is_schema = false`;

  // `note_id` を返すことで、`scope=shared` で混在 listing を受け取った
  // クライアントが個人ページ（`note_id IS NULL`）とノートネイティブページを
  // 区別できる。MCP の `zedi_list_pages` ツールはこれに依存している。
  // Surface `note_id` so callers receiving mixed `scope=shared` results (e.g.
  // the `zedi_list_pages` MCP tool) can distinguish personal vs note-native.
  const result = await db.execute(sql`
    SELECT p.id, p.title, p.content_preview, p.updated_at, p.note_id
    FROM pages p
    WHERE p.is_deleted = false
      AND ${specialKindFilter}
      AND ${accessFilter}
    ORDER BY p.updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return c.json({ pages: result.rows });
});

// ── GET /pages/:id/content ──────────────────────────────────────────────────
app.get("/:id/content", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  // 個人ページは所有者のみ、ノートネイティブページはノートのロール解決
  // （member / domain / public guest）が成立すれば閲覧可。Issue #713 を参照。
  // Personal pages: owner only. Note-native pages: any resolved note role
  // (member / domain / public guest) may view. See issue #713.
  await assertPageViewAccess(db, pageId, userId);

  // コンテンツ取得
  const content = await db
    .select()
    .from(pageContents)
    .where(eq(pageContents.pageId, pageId))
    .limit(1);

  const row = content[0];
  if (!row) {
    return c.json({
      ydoc_state: "",
      version: 0,
      content_text: null,
    });
  }
  const ydocBase64 =
    row.ydocState instanceof Buffer
      ? row.ydocState.toString("base64")
      : typeof row.ydocState === "string"
        ? row.ydocState
        : Buffer.from(row.ydocState as unknown as ArrayBufferLike).toString("base64");

  return c.json({
    ydoc_state: ydocBase64,
    version: row.version,
    content_text: row.contentText,
    updated_at: row.updatedAt?.toISOString(),
  });
});

// ── PUT /pages/:id/content ──────────────────────────────────────────────────
app.put("/:id/content", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    ydoc_state: string; // base64-encoded Y.Doc state
    expected_version?: number;
    content_text?: string;
    content_preview?: string;
    title?: string;
  }>();

  // Allow "" so clients can round-trip GET (empty ydoc_state) with PUT + expected_version.
  // GET が ydoc_state: "" を返した場合もそのまま初回保存できるようにする。
  if (body.ydoc_state === undefined || body.ydoc_state === null) {
    throw new HTTPException(400, { message: "ydoc_state is required" });
  }

  // 個人ページは所有者のみ、ノートネイティブページは note ロール / editPermission
  // で判定する。Issue #713 を参照。
  // Personal pages: owner only. Note-native pages: note role + editPermission
  // (`canEdit`). See issue #713.
  await assertPageEditAccess(db, pageId, userId);

  const ydocBuffer = Buffer.from(body.ydoc_state, "base64");

  // UPSERT page_contents with optimistic locking
  if (body.expected_version != null) {
    // First save after GET returned version 0 with no row: insert the initial row.
    // GET が page_contents 未作成で version:0 を返した契約に合わせ、expected_version:0 で初回 INSERT を許容する。
    if (body.expected_version === 0) {
      const firstSave = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(pageContents)
          .values({
            pageId,
            ydocState: ydocBuffer,
            version: 1,
            contentText: body.content_text ?? null,
          })
          .onConflictDoNothing({ target: pageContents.pageId })
          .returning();

        if (!inserted.length) {
          return { done: false as const };
        }

        const insertedRow = inserted[0];
        if (!insertedRow) throw new HTTPException(500, { message: "Insert failed" });

        await applyPagesMetadataUpdate(tx, pageId, body);

        return { done: true as const, version: insertedRow.version ?? 1 };
      });

      if (firstSave.done) {
        void tryAutoSnapshot(
          db,
          pageId,
          ydocBuffer,
          body.content_text ?? null,
          firstSave.version,
          userId,
        );
        return c.json({ version: firstSave.version });
      }
    }

    // 楽観的ロック: expected_version と一致する場合のみ更新
    const updated = await db
      .update(pageContents)
      .set({
        ydocState: ydocBuffer,
        version: sql`${pageContents.version} + 1`,
        contentText: body.content_text ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(pageContents.pageId, pageId), eq(pageContents.version, body.expected_version)))
      .returning();

    if (!updated.length) {
      // バージョン不一致: 現在のバージョンを返す
      const current = await db
        .select({ version: pageContents.version })
        .from(pageContents)
        .where(eq(pageContents.pageId, pageId))
        .limit(1);

      throw new HTTPException(409, {
        message: `Version conflict. Current version: ${current[0]?.version ?? 0}`,
      });
    }

    const updatedRow = updated[0];
    if (!updatedRow) throw new HTTPException(500, { message: "Update failed" });

    await applyPagesMetadataUpdate(db, pageId, body);

    void tryAutoSnapshot(
      db,
      pageId,
      ydocBuffer,
      body.content_text ?? null,
      updatedRow.version ?? 0,
      userId,
    );

    return c.json({ version: updatedRow.version ?? 0 });
  }

  // No optimistic locking: UPSERT
  const result = await db
    .insert(pageContents)
    .values({
      pageId,
      ydocState: ydocBuffer,
      version: 1,
      contentText: body.content_text ?? null,
    })
    .onConflictDoUpdate({
      target: pageContents.pageId,
      set: {
        ydocState: ydocBuffer,
        version: sql`${pageContents.version} + 1`,
        contentText: body.content_text ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await applyPagesMetadataUpdate(db, pageId, body);

  const resultRow = result[0];
  if (!resultRow) throw new HTTPException(500, { message: "Upsert failed" });

  void tryAutoSnapshot(
    db,
    pageId,
    ydocBuffer,
    body.content_text ?? null,
    resultRow.version ?? 0,
    userId,
  );

  return c.json({ version: resultRow.version });
});

// ── POST /pages ─────────────────────────────────────────────────────────────
app.post("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    title?: string;
    content_preview?: string;
    source_page_id?: string;
    source_url?: string;
    thumbnail_url?: string | null;
  }>();

  const result = await db
    .insert(pages)
    .values({
      ownerId: userId,
      title: body.title ?? null,
      contentPreview: body.content_preview ?? null,
      sourcePageId: body.source_page_id ?? null,
      sourceUrl: body.source_url ?? null,
      thumbnailUrl: body.thumbnail_url ?? null,
    })
    .returning();

  const row = result[0];
  if (!row) throw new HTTPException(500, { message: "Insert failed" });
  return c.json(
    {
      id: row.id,
      owner_id: row.ownerId,
      source_page_id: row.sourcePageId ?? null,
      title: row.title ?? null,
      content_preview: row.contentPreview ?? null,
      thumbnail_url: row.thumbnailUrl ?? null,
      source_url: row.sourceUrl ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      is_deleted: row.isDeleted,
    },
    201,
  );
});

// ── DELETE /pages/:id ───────────────────────────────────────────────────────
app.delete("/:id", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  // ノートネイティブページの削除はノート編集権限で判定する。
  // Note-native page deletion is governed by the note's edit permission.
  // See issue #713.
  await assertPageEditAccess(db, pageId, userId);

  await db
    .update(pages)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(pages.id, pageId));

  return c.json({ id: pageId, deleted: true });
});

export default app;
