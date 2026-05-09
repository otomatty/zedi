/**
 * /api/pages — ページ CRUD + コンテンツ管理
 *
 * GET    /api/pages                — 後方互換のページ一覧（Issue #823 以降は `Deprecation: true`）。
 *        新規実装は `GET /api/notes/me` → `GET /api/notes/:noteId/pages` を推奨。
 *        — Legacy page listing (sends `Deprecation: true` after issue #823).
 *        Prefer `GET /api/notes/me` then `GET /api/notes/:noteId/pages` for new clients.
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
import { ensureDefaultNote, getDefaultNoteOrNull } from "../services/defaultNoteService.js";
import { getNoteRole, canEdit } from "./notes/helpers.js";
import { extractEmailDomain } from "../lib/freeEmailDomains.js";
import { maybeCreateSnapshot } from "../services/snapshotService.js";
import { assertPageViewAccess, assertPageEditAccess } from "../services/pageAccessService.js";
import { propagateTitleRename } from "../services/titleRenamePropagationService.js";
import { deleteThumbnailObject } from "../services/thumbnailGcService.js";

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
 * タイトル変更を検出した際に WikiLink / タグを他ページへ伝播させる
 * (issue #726)。リネーム本体のレスポンスはブロックしないよう fire-and-forget
 * で呼び出す。失敗時はログのみ。
 *
 * Fire-and-forget propagation of a title rename into referencing documents
 * and ghost-link promotion (issue #726). The caller is not blocked; failures
 * are logged but do not affect the main response.
 */
function tryPropagateTitleRename(
  db: Database,
  pageId: string,
  oldTitle: string,
  newTitle: string,
): void {
  void propagateTitleRename(db, pageId, oldTitle, newTitle).catch((error) => {
    console.error(
      `[RenamePropagation] Background propagation crashed for ${pageId} ` +
        `(${oldTitle} → ${newTitle}):`,
      error,
    );
  });
}

/**
 * PUT /content リクエストから pages テーブルの更新セットを構築し、変更があれば適用する。
 * タイトル更新を検出した場合は旧タイトルを返して呼び出し側から伝播処理を
 * 起動できるようにする（issue #726）。
 *
 * Build and apply pages-table updates (title, content_preview, updated_at)
 * from the PUT body. When the title is being changed, return the old / new
 * title pair so the caller can kick off rename propagation once the row
 * update is durable (issue #726).
 */
async function applyPagesMetadataUpdate(
  db: { select: Database["select"]; update: Database["update"] },
  pageId: string,
  body: { title?: string; content_preview?: string },
): Promise<{ renamed: { oldTitle: string; newTitle: string } | null }> {
  let renamed: { oldTitle: string; newTitle: string } | null = null;

  if (body.title !== undefined) {
    const current = await db
      .select({ title: pages.title })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    const previousRaw = current[0]?.title ?? null;
    const previousTrimmed = typeof previousRaw === "string" ? previousRaw.trim() : "";
    const nextTrimmed = body.title.trim();
    // 正規化（小文字化）して比較することで "Foo" → "foo" のような表記揺れだけの
    // 変更は伝播をスキップする。`wikiLinkUtils` / `tagUtils` の照合も同一正規化。
    // Normalize for comparison so "Foo" → "foo" — a change that wouldn't
    // affect matching — does not trigger propagation. Mirrors the client-side
    // `wikiLinkUtils` / `tagUtils` normalization.
    if (
      previousTrimmed.length > 0 &&
      nextTrimmed.length > 0 &&
      previousTrimmed.toLowerCase() !== nextTrimmed.toLowerCase()
    ) {
      renamed = { oldTitle: previousTrimmed, newTitle: nextTrimmed };
    }
  }

  const set: Record<string, unknown> = {};
  if (body.title !== undefined) set.title = body.title;
  if (body.content_preview !== undefined) set.contentPreview = body.content_preview;
  if (Object.keys(set).length === 0) return { renamed };
  set.updatedAt = new Date();
  await db.update(pages).set(set).where(eq(pages.id, pageId));
  return { renamed };
}

// ── GET /pages ──────────────────────────────────────────────────────────────
// Issue #823: 一覧は `pages.note_id` モデルで再実装。MCP `zedi_list_pages` 等の後方互換のため
// 200 で返しつつ `Deprecation: true` を付与する。新規クライアントはノート配下エンドポイントへ。
//
// Issue #823: reimplemented listing on `pages.note_id`. Keeps HTTP 200 for MCP / legacy callers
// while setting `Deprecation: true`; new clients should use note-scoped routes.
app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const userEmailRaw = c.get("userEmail");
  const db = c.get("db");

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20", 10) || 20, 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
  const scope = c.req.query("scope") === "shared" ? "shared" : "own";
  const includeSpecial = c.req.query("include_special") === "true";

  const specialKindFilter = includeSpecial
    ? sql`TRUE`
    : sql`p.special_kind IS NULL AND p.is_schema = false`;

  c.header("Deprecation", "true");

  const normalizedEmail = typeof userEmailRaw === "string" ? userEmailRaw.trim().toLowerCase() : "";
  const emailDomain = extractEmailDomain(normalizedEmail);

  const domainBranch =
    emailDomain !== null
      ? sql`OR EXISTS (
          SELECT 1
          FROM notes n
          INNER JOIN note_domain_access nda ON nda.note_id = n.id
          WHERE n.id = p.note_id
            AND n.is_deleted = false
            AND nda.is_deleted = false
            AND nda.domain = ${emailDomain}
        )`
      : sql``;

  let accessFilter;

  if (scope === "own") {
    const defaultNote = await getDefaultNoteOrNull(db, userId);
    if (!defaultNote) {
      return c.json({ pages: [] });
    }
    accessFilter = sql`p.note_id = ${defaultNote.id}`;
  } else {
    accessFilter = sql`(
      EXISTS (
        SELECT 1 FROM notes n
        WHERE n.id = p.note_id AND n.is_deleted = false AND n.owner_id = ${userId}
      )
      OR EXISTS (
        SELECT 1
        FROM notes n
        INNER JOIN note_members nm ON nm.note_id = n.id
        INNER JOIN "user" u ON LOWER(u.email) = LOWER(nm.member_email)
        WHERE n.id = p.note_id
          AND u.id = ${userId}
          AND nm.status = 'accepted'
          AND nm.is_deleted = false
          AND n.is_deleted = false
      )
      ${domainBranch}
    )`;
  }

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

  // すべてのページはノート所属。閲覧は `getNoteRole(pages.note_id)` が成立すれば可。
  // Every page belongs to a note; viewing requires a resolved note role on `pages.note_id`.
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

  // 編集はノートロール + `editPermission` (`canEdit`) で判定する。
  // Editing requires note role + `canEdit` against the owning note.
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

        const { renamed } = await applyPagesMetadataUpdate(tx, pageId, body);

        return { done: true as const, version: insertedRow.version ?? 1, renamed };
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
        if (firstSave.renamed) {
          tryPropagateTitleRename(
            db,
            pageId,
            firstSave.renamed.oldTitle,
            firstSave.renamed.newTitle,
          );
        }
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

    const { renamed } = await applyPagesMetadataUpdate(db, pageId, body);

    void tryAutoSnapshot(
      db,
      pageId,
      ydocBuffer,
      body.content_text ?? null,
      updatedRow.version ?? 0,
      userId,
    );

    if (renamed) {
      tryPropagateTitleRename(db, pageId, renamed.oldTitle, renamed.newTitle);
    }

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

  const { renamed } = await applyPagesMetadataUpdate(db, pageId, body);

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

  if (renamed) {
    tryPropagateTitleRename(db, pageId, renamed.oldTitle, renamed.newTitle);
  }

  return c.json({ version: resultRow.version });
});

// ── POST /pages ─────────────────────────────────────────────────────────────
app.post("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    /** 省略時は呼び出し元のデフォルトノート（マイノート）へ所属させる。 */
    note_id?: string | null;
    title?: string;
    content_preview?: string;
    source_page_id?: string;
    source_url?: string;
    thumbnail_url?: string | null;
    /**
     * 紐づく thumbnail_objects.id。Web Clipper など URL からページを作る
     * フローで保存したサムネイルを指す。DELETE 時にこの ID で GC する。
     *
     * The owning `thumbnail_objects.id`. Set when the page was created from
     * a URL (e.g. Web Clipper) and the thumbnail was committed via
     * `/api/thumbnail/commit`. DELETE /pages/:id uses this id to GC.
     */
    thumbnail_object_id?: string | null;
  }>();

  let resolvedNoteId =
    typeof body.note_id === "string" && body.note_id.trim() !== "" ? body.note_id.trim() : null;
  if (!resolvedNoteId) {
    const defaultNote = await ensureDefaultNote(db, userId);
    resolvedNoteId = defaultNote.id;
  } else {
    const userEmail = c.get("userEmail");
    const { role, note } = await getNoteRole(resolvedNoteId, userId, userEmail, db);
    if (!note) throw new HTTPException(404, { message: "Note not found" });
    if (!role || !canEdit(role, note)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
  }

  const result = await db
    .insert(pages)
    .values({
      ownerId: userId,
      noteId: resolvedNoteId,
      title: body.title ?? null,
      contentPreview: body.content_preview ?? null,
      sourcePageId: body.source_page_id ?? null,
      sourceUrl: body.source_url ?? null,
      thumbnailUrl: body.thumbnail_url ?? null,
      thumbnailObjectId: body.thumbnail_object_id ?? null,
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

  // ページ削除は所属ノートの編集権限で判定する。
  // Page deletion is governed by edit permission on the owning note.
  await assertPageEditAccess(db, pageId, userId);

  // GC 対象のサムネイル ID とページオーナーを取りつつ、ページを soft-delete する。
  // `thumbnail_object_id` も同時に NULL にして、DB 上は「サムネイルが
  // 紐づいていないページ」になるようにする（復元時に死んだ ID を残さない）。
  //
  // Capture the linked thumbnail id and the page owner, then soft-delete in
  // one shot. Clearing `thumbnail_object_id` keeps the row consistent — if
  // the page is ever restored we don't want it pointing at a now-collected
  // blob. We capture `ownerId` because thumbnails are owner-scoped: in a
  // shared note, the user performing the deletion (`userId`) may differ
  // from the page owner, and `deleteThumbnailObject` matches on the
  // thumbnail's owner predicate. Passing the actor's id would orphan the
  // blob and silently keep burning the real owner's quota.
  const [target] = await db
    .select({
      thumbnailObjectId: pages.thumbnailObjectId,
      ownerId: pages.ownerId,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  await db
    .update(pages)
    .set({ isDeleted: true, thumbnailObjectId: null, updatedAt: new Date() })
    .where(eq(pages.id, pageId));

  // GC は best-effort。サムネイル削除が S3 障害などで失敗しても、ページ削除
  // 自体は成功させる（ユーザーから見て「削除できなかった」状態を作らない）。
  //
  // GC is best-effort: a thumbnail delete failure must not roll back the page
  // soft-delete from the user's perspective. `deleteThumbnailObject` already
  // logs S3 failures so a sweeper can reclaim orphans.
  if (target?.thumbnailObjectId && target.ownerId) {
    await deleteThumbnailObject(target.thumbnailObjectId, target.ownerId, db);
  }

  return c.json({ id: pageId, deleted: true });
});

export default app;
