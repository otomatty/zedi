/**
 * /api/pages — ページ CRUD + コンテンツ管理
 *
 * GET    /api/pages                       — 後方互換のページ一覧（Issue #823 以降は `Deprecation: true`）。
 *        新規実装は `GET /api/notes/me` → `GET /api/notes/:noteId/pages` を推奨。
 *        — Legacy page listing (sends `Deprecation: true` after issue #823).
 *        Prefer `GET /api/notes/me` then `GET /api/notes/:noteId/pages` for new clients.
 * GET    /api/pages/:id/content        — Y.Doc コンテンツ取得（`page_contents` 行が未作成の空ページは 200 + 空 ydoc）
 *        — Retrieve Y.Doc content (200 + empty `ydoc_state` when no `page_contents` row).
 * GET    /api/pages/:id/public-content — 読み取り専用のページ本文（ゲスト・viewer 用 / Y.Doc を返さない）
 *        — Read-only page text for guests / viewer-only callers (no Y.Doc bytes).
 * PUT    /api/pages/:id/content        — Y.Doc コンテンツ更新 (楽観的ロック) / Update with optimistic locking
 * PUT    /api/pages/:id                — ページメタデータ（タイトル等）更新 / Update page metadata (title, preview)
 * POST   /api/pages                    — 新規ページ作成 / Create page
 * DELETE /api/pages/:id                — ページ論理削除 / Soft-delete page
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, sql } from "drizzle-orm";
import * as Y from "yjs";
import { pages, pageContents, type Page } from "../schema/index.js";
import { authRequired, authOptional } from "../middleware/auth.js";
import type { AppEnv, Database } from "../types/index.js";
import { ensureDefaultNote, getDefaultNoteOrNull } from "../services/defaultNoteService.js";
import { getNoteRole, canEdit } from "./notes/helpers.js";
import { extractEmailDomain } from "../lib/freeEmailDomains.js";
import { maybeCreateSnapshot } from "../services/snapshotService.js";
import { assertPageViewAccess, assertPageEditAccess } from "../services/pageAccessService.js";
import { propagateTitleRename } from "../services/titleRenamePropagationService.js";
import { deleteThumbnailObject } from "../services/thumbnailGcService.js";
import { publishNoteEvent } from "../services/noteEventBroadcaster.js";
import { syncPageGraphFromStoredYDoc } from "../services/pageGraphSyncService.js";
import { applyWikiLinkMarksToYDoc } from "../services/ydocWikiLinkNormalizer.js";
import { pageRowToWindowItem } from "./notes/eventHelpers.js";

/**
 * 未 mark の `[[Title]]` プレーンテキストを `wikiLink` mark へ昇格させる
 * 「読み出し時の lazy migration」ヘルパー。Issue #880 Phase B 由来の
 * y-prosemirror `unexpectedCase` を二度と踏まないよう、サーバが返すバイト列の
 * 段階で確実に正規化済みにすることが目的。`marksApplied > 0` のときは楽観
 * ロックで page_contents を更新し、競合した場合は in-memory バッファだけ
 * 正規化したまま返す（次回保存で自然に追従する）。
 *
 * 楽観ロックでの永続化に成功した場合は、新しい `wikiLink` mark に対応する
 * `links` / `ghost_links` を再構築するため `tryGraphSync` を fire-and-forget
 * で呼ぶ。PR #887 のレビュー（CodeRabbit）で指摘された、GET 経路の lazy
 * migration ではグラフ同期が走らずバックリンクが古いまま残る問題への対応。
 *
 * Lazy migration helper for the GET path: ensures the bytes returned by
 * `/api/pages/:id/content` never contain unmarked `[[Title]]` plain text,
 * eliminating the y-prosemirror `unexpectedCase` boundary case from Issue
 * #880 Phase B. When marks are applied, persist with optimistic locking;
 * on lock conflict, return the normalized buffer in-memory only and let
 * the next save reconcile.
 *
 * When persistence succeeds, fire `tryGraphSync` so `links` / `ghost_links`
 * are rebuilt to reflect the newly added `wikiLink` marks (PR #887 review
 * by CodeRabbit: GET-side migration must not leave the graph stale).
 */
async function normalizeWikiLinksOnRead(
  db: Database,
  pageId: string,
  buffer: Buffer,
  version: number,
  updatedAt: Date | null,
): Promise<{ buffer: Buffer; version: number; updatedAt: Date | null }> {
  if (buffer.length === 0) {
    return { buffer, version, updatedAt };
  }
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(buffer));
    const { marksApplied } = applyWikiLinkMarksToYDoc(doc);
    if (marksApplied === 0) {
      return { buffer, version, updatedAt };
    }
    const normalized = Buffer.from(Y.encodeStateAsUpdate(doc));
    const now = new Date();
    // 楽観ロック: 我々が読んだ version と DB が一致するときだけ更新する。
    // 競合時は in-memory の正規化バッファだけ返し、永続化は次回の save に任せる。
    // Optimistic lock: only update when DB still sits at our observed version.
    // On conflict, return the in-memory normalized bytes; the next save by
    // the client will eventually persist a marked-up state.
    const updated = await db
      .update(pageContents)
      .set({
        ydocState: normalized,
        version: sql`${pageContents.version} + 1`,
        updatedAt: now,
      })
      .where(and(eq(pageContents.pageId, pageId), eq(pageContents.version, version)))
      .returning({ version: pageContents.version, updatedAt: pageContents.updatedAt });
    const row = updated[0];
    if (row) {
      // 永続化に成功した場合のみ `links` / `ghost_links` を再構築する。楽観
      // ロックが競合した場合は別経路の保存が同時に走っており、そちらが自分の
      // タイミングでグラフ同期を発火するためここからは呼ばない。
      // Trigger graph sync only when our optimistic-lock update actually wrote
      // the new bytes. On lock conflict, a concurrent writer owns the next
      // graph-sync invocation, so we stay silent here.
      tryGraphSync(db, pageId);
      return {
        buffer: normalized,
        version: row.version ?? version + 1,
        updatedAt: row.updatedAt ?? now,
      };
    }
    return { buffer: normalized, version, updatedAt };
  } catch (error) {
    console.error(`[WikiLinkNormalize] GET path failed for page=${pageId}:`, error);
    return { buffer, version, updatedAt };
  }
}

/**
 * PUT 経路用の defense-in-depth 正規化。クライアントが何らかの理由で未 mark の
 * `[[Title]]` を含む Y.Doc を送ってきても、永続化前に確実に mark 化してから
 * 保存する。`buffer.length === 0` のときはスキップ。失敗時は原文を返してログのみ。
 *
 * Defense-in-depth normalizer for the PUT path. Should the client ever send
 * a Y.Doc with unmarked `[[Title]]` text, normalize it before persistence so
 * subsequent loads never see the un-promoted form. No-op on empty buffers;
 * on error log and return the original buffer.
 */
function normalizeWikiLinksOnWrite(pageId: string, buffer: Buffer): Buffer {
  if (buffer.length === 0) return buffer;
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(buffer));
    const { marksApplied } = applyWikiLinkMarksToYDoc(doc);
    if (marksApplied === 0) return buffer;
    return Buffer.from(Y.encodeStateAsUpdate(doc));
  } catch (error) {
    console.error(`[WikiLinkNormalize] PUT path failed for page=${pageId}:`, error);
    return buffer;
  }
}

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
 * 本文保存後に、現在の Y.Doc から `links` / `ghost_links` を再構築する
 * (issue #880 Phase C)。本文保存のレスポンスはブロックしないよう
 * fire-and-forget。失敗は本文保存とは独立にログに残す。
 *
 * Fire-and-forget rebuild of `links` / `ghost_links` from the just-saved
 * Y.Doc (issue #880 Phase C). Failures are logged but do not block the
 * content save response.
 */
function tryGraphSync(db: Database, pageId: string): void {
  void syncPageGraphFromStoredYDoc(db, pageId).catch((error) => {
    console.error(`[PageGraphSync] Background graph sync crashed for page ${pageId}:`, error);
  });
}

/**
 * Issue #860 Phase 4: PUT /content で title / content_preview が「実際に」変わった
 * ときだけ `page.updated` をノート購読者へ配信する。クライアントが現在値を
 * 毎回ラウンドトリップする実装でも spam しないよう、`applyPagesMetadataUpdate`
 * の戻り値 `metadataChanged` で判定する。`updatedRow` も同じ helper の
 * `.returning()` から渡るため、ここでは追加 SELECT を発生させない
 * （gemini-code-assist + coderabbitai review on PR #867）。
 *
 * Emit `page.updated` only when the metadata actually changed compared to the
 * current row. A client that round-trips the unchanged values on every save
 * must not trigger a broadcast — the helper's `metadataChanged` flag gates
 * that. The `updatedRow` comes from `applyPagesMetadataUpdate`'s
 * `.returning()`, so this path stays SELECT-free (gemini-code-assist and
 * coderabbitai reviews on PR #867).
 */
function emitPageUpdatedIfChanged(metadataChanged: boolean, updatedRow: Page | null): void {
  if (!metadataChanged || !updatedRow || updatedRow.isDeleted) return;
  publishNoteEvent({
    type: "page.updated",
    note_id: updatedRow.noteId,
    page: pageRowToWindowItem(updatedRow),
  });
}

/**
 * PUT /content リクエストから pages テーブルの更新セットを構築し、変更があれば適用する。
 * タイトル更新を検出した場合は旧タイトルを返して呼び出し側から伝播処理を
 * 起動できるようにする（issue #726）。
 *
 * Issue #860 Phase 4 で 2 つの戻り値を追加した:
 * - `metadataChanged`: 現在値と比較して title または content_preview が
 *   実際に変わったかどうか。クライアントが現在値をエコーバックするセーブ
 *   フローで SSE がスパムしないように、emit 側でこのフラグを参照する
 *   （coderabbitai major on PR #867）。
 * - `updatedRow`: `.returning()` の結果。emit 側で追加 SELECT せずに
 *   そのまま payload に流せる（gemini-code-assist medium on PR #867）。
 *
 * Build and apply pages-table updates (title, content_preview, updated_at)
 * from the PUT body. Returns:
 * - `renamed` — old/new title pair when the title meaningfully changed
 *   (issue #726).
 * - `metadataChanged` — whether title or content_preview actually differs
 *   from the current row. Used by the Issue #860 Phase 4 SSE emit to avoid
 *   broadcasting `page.updated` on round-tripped values
 *   (coderabbitai review on PR #867).
 * - `updatedRow` — the post-update row returned by `.returning()` so the
 *   emit path does not need a follow-up SELECT
 *   (gemini-code-assist review on PR #867).
 */
async function applyPagesMetadataUpdate(
  db: { select: Database["select"]; update: Database["update"] },
  pageId: string,
  body: { title?: string; content_preview?: string },
): Promise<{
  renamed: { oldTitle: string; newTitle: string } | null;
  metadataChanged: boolean;
  updatedRow: Page | null;
}> {
  let renamed: { oldTitle: string; newTitle: string } | null = null;

  // タイトル変化検知に加えて Phase 4 で content_preview の変化検知も必要
  // なので、両方をまとめて 1 回の SELECT で取り出す。
  // Title (for rename propagation) and content_preview (for SSE emit
  // gating) are both compared against the current row, so fetch them in a
  // single SELECT instead of two.
  let currentTitle: string | null = null;
  let currentPreview: string | null = null;
  if (body.title !== undefined || body.content_preview !== undefined) {
    const current = await db
      .select({ title: pages.title, contentPreview: pages.contentPreview })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    currentTitle = current[0]?.title ?? null;
    currentPreview = current[0]?.contentPreview ?? null;
  }

  if (body.title !== undefined) {
    const previousTrimmed = typeof currentTitle === "string" ? currentTitle.trim() : "";
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

  // 実際に値が異なるカラムだけを set に積む。これにより:
  // 1. クライアントがエコーバックしただけのセーブで UPDATE が走らない。
  // 2. UPDATE が走らなければ updatedRow も null になり、emit もスキップされる。
  // Only stage columns whose new value really differs from the current row.
  // Skipping no-op UPDATEs avoids spurious `updated_at` churn and ensures
  // the SSE emit path is gated on real changes (coderabbitai PR #867).
  const set: Record<string, unknown> = {};
  if (body.title !== undefined && body.title !== currentTitle) {
    set.title = body.title;
  }
  if (body.content_preview !== undefined && body.content_preview !== currentPreview) {
    set.contentPreview = body.content_preview;
  }
  if (Object.keys(set).length === 0) {
    return { renamed, metadataChanged: false, updatedRow: null };
  }
  set.updatedAt = new Date();
  const updated = await db.update(pages).set(set).where(eq(pages.id, pageId)).returning();
  return { renamed, metadataChanged: true, updatedRow: updated[0] ?? null };
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
  const rawBuffer =
    row.ydocState instanceof Buffer
      ? row.ydocState
      : typeof row.ydocState === "string"
        ? Buffer.from(row.ydocState, "base64")
        : Buffer.from(row.ydocState as unknown as ArrayBufferLike);

  // Issue #880 Phase B リグレッション対応: 未 mark の `[[Title]]` プレーン
  // テキストをサーバ側で `wikiLink` mark に昇格させる。`local` モード経路は
  // Hocuspocus を通らないため、ここが lazy migration の入口になる。
  // Issue #880 Phase B regression fix: lazily migrate unmarked `[[Title]]`
  // text on read. The `local` collaboration mode bypasses Hocuspocus, so
  // this is the entry point for that path.
  const normalized = await normalizeWikiLinksOnRead(
    db,
    pageId,
    rawBuffer,
    row.version ?? 0,
    row.updatedAt ?? null,
  );
  const ydocBase64 = normalized.buffer.toString("base64");

  return c.json({
    ydoc_state: ydocBase64,
    version: normalized.version,
    content_text: row.contentText,
    updated_at: normalized.updatedAt?.toISOString(),
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

  // クライアントから届いたバイト列を defense-in-depth で正規化。万一未 mark の
  // `[[Title]]` テキストが含まれていれば、永続化前に `wikiLink` mark を適用する。
  // Defense-in-depth: normalize the incoming Y.Doc bytes so unmarked
  // `[[Title]]` text never persists, even if the client sends it.
  const rawYdocBuffer = Buffer.from(body.ydoc_state, "base64");
  const ydocBuffer = normalizeWikiLinksOnWrite(pageId, rawYdocBuffer);

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

        const { renamed, metadataChanged, updatedRow } = await applyPagesMetadataUpdate(
          tx,
          pageId,
          body,
        );

        return {
          done: true as const,
          version: insertedRow.version ?? 1,
          renamed,
          metadataChanged,
          updatedRow,
        };
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
        // Issue #880 Phase C: 本文保存と同じトリガーでリンクグラフを再構築する。
        // Issue #880 Phase C: rebuild outgoing edges from the saved Y.Doc.
        tryGraphSync(db, pageId);
        // Issue #860 Phase 4: メタデータが実際に変化したときだけ通知。
        // Issue #860 Phase 4: emit only when metadata really changed.
        emitPageUpdatedIfChanged(firstSave.metadataChanged, firstSave.updatedRow);
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

    const {
      renamed,
      metadataChanged,
      updatedRow: metadataRow,
    } = await applyPagesMetadataUpdate(db, pageId, body);

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

    // Issue #880 Phase C: 楽観的ロック成功経路でもグラフ再構築を発火する。
    // Issue #880 Phase C: trigger graph rebuild on the optimistic-lock path.
    tryGraphSync(db, pageId);

    // Issue #860 Phase 4: optimistic-lock 経路のメタデータ変化を通知。
    // Notify subscribers from the optimistic-lock path as well.
    emitPageUpdatedIfChanged(metadataChanged, metadataRow);

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

  const {
    renamed,
    metadataChanged,
    updatedRow: metadataRow,
  } = await applyPagesMetadataUpdate(db, pageId, body);

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

  // Issue #880 Phase C: UPSERT 経路（楽観的ロック未使用）でも graph 再構築する。
  // Issue #880 Phase C: trigger graph rebuild on the UPSERT path too.
  tryGraphSync(db, pageId);

  // Issue #860 Phase 4: UPSERT 経路（楽観的ロック未使用）でも emit。
  // Issue #860 Phase 4: emit from the UPSERT path too (no optimistic lock).
  emitPageUpdatedIfChanged(metadataChanged, metadataRow);

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

  // Issue #860 Phase 4: 新規ページを所属ノート購読者に通知。本ルートは Web
  // Clipper / `/notes/me` 系の創出経路でも使われるため、`/api/notes/:noteId/pages`
  // の POST と同じ event を出してフロント側のキャッシュ更新を一本化する。
  // Issue #860 Phase 4: emit `page.added` so subscribers (including the
  // `/api/notes/:noteId/events` consumers) update their cached windows
  // without a refetch. This route is shared by Web Clipper and `/notes/me`
  // flows, so emitting here keeps the cache patch behavior identical to
  // `POST /api/notes/:noteId/pages`.
  publishNoteEvent({
    type: "page.added",
    note_id: row.noteId,
    page: pageRowToWindowItem(row),
  });

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

// ── GET /pages/:id (single page metadata) ───────────────────────────────────
/**
 * `GET /api/pages/:pageId` — 単一ページのメタデータを返す（Issue #860 Phase 6）。
 *
 * Phase 6 で `GET /api/notes/:noteId` から `pages[]` を撤去したため、
 * NotePageView などが「単一ページの所有者・所属ノート・ソース URL 等」を
 * 取得する経路が必要になった。この route はノートシェルとも cursor pagination
 * の `/notes/:noteId/pages` window とも独立した、id 直アクセスの軽量経路。
 *
 * `authOptional` + `getNoteRole` を採用し、公開 / unlisted ノート配下の
 * ページであれば未ログインの guest からも 200 で返す（`/notes/:noteId/pages`
 * と整合）。private ノート配下のページは role が解決しない呼び出し元に対して
 * 403 を返す。
 *
 * `GET /api/pages/:pageId` returns single-page metadata (Issue #860 Phase 6).
 *
 * Phase 6 dropped `pages[]` from `GET /api/notes/:noteId`, so consumers like
 * `NotePageView` lost the existing "look up one page's owner / source url /
 * note id" path. This route fills that gap with an id-direct lookup that is
 * independent of the note shell and the cursor-paginated `/pages` window.
 *
 * Auth model is `authOptional` + `getNoteRole`: guests can read pages of
 * public / unlisted notes without sign-in (consistent with `/pages`),
 * while private-note pages still 403 for callers without a resolved role.
 */
app.get("/:id", authOptional, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const rows = await db
    .select({
      id: pages.id,
      ownerId: pages.ownerId,
      noteId: pages.noteId,
      sourcePageId: pages.sourcePageId,
      title: pages.title,
      contentPreview: pages.contentPreview,
      thumbnailUrl: pages.thumbnailUrl,
      sourceUrl: pages.sourceUrl,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
      isDeleted: pages.isDeleted,
    })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new HTTPException(404, { message: "Page not found" });

  // 所属ノートに対する role が解決しない呼び出し元はアクセス不可。owner /
  // editor / viewer / guest のいずれかが付けば 200 で返す（owner だけに絞ると
  // 共有ノートの member や public ノートの guest が読めなくなる）。
  //
  // The caller must hold *some* role on the owning note. Restricting to
  // owner-only would cut off note members and public-note guests; the
  // visibility check inside `getNoteRole` already gates anonymous access to
  // private notes correctly.
  const { role } = await getNoteRole(row.noteId, userId, userEmail, db);
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  return c.json({
    id: row.id,
    owner_id: row.ownerId,
    note_id: row.noteId,
    source_page_id: row.sourcePageId,
    title: row.title,
    content_preview: row.contentPreview ?? null,
    thumbnail_url: row.thumbnailUrl,
    source_url: row.sourceUrl,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    is_deleted: row.isDeleted,
  });
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
      noteId: pages.noteId,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  await db
    .update(pages)
    .set({ isDeleted: true, thumbnailObjectId: null, updatedAt: new Date() })
    .where(eq(pages.id, pageId));

  // Issue #860 Phase 4: 削除を所属ノート購読者に通知。`noteId` は同じ
  // SELECT で取得済みのため追加クエリは発生しない。
  // Issue #860 Phase 4: notify subscribers of the owning note. The note id
  // came from the earlier SELECT so no extra round trip is needed.
  if (target?.noteId) {
    publishNoteEvent({ type: "page.deleted", note_id: target.noteId, page_id: pageId });
  }

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

// ── PUT /pages/:id (metadata only) ──────────────────────────────────────────
/**
 * `PUT /api/pages/:pageId` — ページのメタデータ（タイトル / `content_preview`）だけを
 * 更新する。Y.Doc 本体は Hocuspocus WebSocket 経由で更新されるため、本ルートで
 * バイト列を受け付けることはない。
 *
 * `local` コラボレーションモード廃止（REST 経由で Y.Doc を同期する経路の削除）に
 * 伴い、タイトル変更を REST から行いたいクライアント向けに独立した経路として
 * 用意した。既存の `applyPagesMetadataUpdate` / `tryPropagateTitleRename` /
 * `emitPageUpdatedIfChanged` を再利用するため、`PUT /:id/content` 経路と同じ整合性
 * （タイトル伝播・SSE 通知のゲーティング）が保たれる。
 *
 * `PUT /api/pages/:pageId` updates page metadata only (title and
 * content_preview). The Y.Doc payload is owned by Hocuspocus and is never
 * accepted here.
 *
 * Introduced when the `local` collaboration mode was retired so callers that
 * need to rename a page via REST have a stable endpoint. Reuses
 * `applyPagesMetadataUpdate`, `tryPropagateTitleRename`, and
 * `emitPageUpdatedIfChanged` so the title-propagation and SSE-emit invariants
 * stay identical to the legacy `PUT /:id/content` path.
 *
 * @returns 200 + `{ id, title, content_preview, updated_at }` on success.
 *          400 when the body is empty (neither `title` nor `content_preview`).
 *          403 / 404 from `assertPageEditAccess` when the caller cannot edit.
 */
app.put("/:id", authRequired, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    title?: string;
    content_preview?: string;
  }>();

  // 型バリデーション: ヘルパー (`applyPagesMetadataUpdate`) は `body.title.trim()`
  // を呼ぶので、文字列以外が混ざると runtime 500 になる。境界で 400 に倒す。
  // Validate field types so malformed payloads (e.g. `{ "title": 123 }`)
  // are surfaced as 400 instead of crashing inside `applyPagesMetadataUpdate`'s
  // `.trim()` call.
  if (body.title !== undefined && typeof body.title !== "string") {
    throw new HTTPException(400, { message: "`title` must be a string" });
  }
  if (body.content_preview !== undefined && typeof body.content_preview !== "string") {
    throw new HTTPException(400, { message: "`content_preview` must be a string" });
  }

  if (body.title === undefined && body.content_preview === undefined) {
    throw new HTTPException(400, {
      message: "At least one of `title` or `content_preview` is required",
    });
  }

  await assertPageEditAccess(db, pageId, userId);

  const { renamed, metadataChanged, updatedRow } = await applyPagesMetadataUpdate(db, pageId, body);

  if (renamed) {
    tryPropagateTitleRename(db, pageId, renamed.oldTitle, renamed.newTitle);
  }
  emitPageUpdatedIfChanged(metadataChanged, updatedRow);

  // no-op (現在値と同値を送信) のときは UPDATE がスキップされて `updatedRow` が
  // null になる。クライアントのキャッシュを null で上書きしないよう、現在値を
  // SELECT して返す。追加 SELECT は no-op パスのみ発生する。
  // No-op saves (request body echoes the current values) skip the UPDATE and
  // leave `updatedRow` null. To avoid responding with null fields that would
  // clobber a client cache, fall back to fetching the current row. The extra
  // SELECT only fires on the no-op path.
  let title: string | null;
  let contentPreview: string | null;
  let updatedAt: Date;
  if (updatedRow) {
    title = updatedRow.title;
    contentPreview = updatedRow.contentPreview;
    updatedAt = updatedRow.updatedAt;
  } else {
    const current = await db
      .select({
        title: pages.title,
        contentPreview: pages.contentPreview,
        updatedAt: pages.updatedAt,
      })
      .from(pages)
      .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
      .limit(1);
    const row = current[0];
    if (!row) {
      // `assertPageEditAccess` の直後に同じ id が論理削除される競合は通常
      // 起きないが、起きた場合はクライアントが再同期できるよう 404 を返す。
      // `assertPageEditAccess` already proved the row exists; reaching here
      // means a concurrent delete raced us. Surface 404 so the client
      // resyncs cleanly instead of seeing a half-formed response.
      throw new HTTPException(404, { message: "Page not found" });
    }
    title = row.title;
    contentPreview = row.contentPreview;
    updatedAt = row.updatedAt;
  }

  return c.json({
    id: pageId,
    title,
    content_preview: contentPreview,
    updated_at: updatedAt.toISOString(),
  });
});

// ── GET /pages/:id/public-content (read-only for guests / viewers) ──────────
/**
 * `GET /api/pages/:pageId/public-content` — 読み取り専用のページ本文 API。
 * `page_contents.content_text` と派生情報のみ返し、Y.Doc バイト列は返さない。
 *
 * `local` モード廃止後、編集者は Hocuspocus WebSocket 経由でページを開くが、
 * 未ログインの guest（public / unlisted ノートを覗いている読者）や viewer ロールの
 * メンバーは WebSocket 接続を張らずに REST で本文だけ読みたい。本ルートはその
 * 経路を提供する。Y.Doc バイト列を返さないため、編集セッションは絶対に始まらない。
 *
 * 認証は `authOptional`。所属ノートに対する `getNoteRole` で role を解決し、
 * `null`（private / restricted ノートを未認可で要求した等）の場合は 403 を返す。
 *
 * `GET /api/pages/:pageId/public-content` returns the rendered plain text of
 * a page without exposing the underlying Y.Doc bytes. Used by read-only
 * viewers — anonymous guests on public/unlisted notes and signed-in viewer
 * members — who do not need to participate in the realtime editing session.
 *
 * `authOptional` so guests on public/unlisted notes can hit it. `getNoteRole`
 * gates private/restricted notes by returning 403 when no role is resolved.
 *
 * @returns 200 + `{ id, title, content_text, content_preview, version, updated_at }`.
 *          404 when the page row is missing or already soft-deleted.
 *          403 when no role is resolved on the owning note.
 */
app.get("/:id/public-content", authOptional, async (c) => {
  const pageId = c.req.param("id");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const rows = await db
    .select({
      id: pages.id,
      noteId: pages.noteId,
      title: pages.title,
      contentPreview: pages.contentPreview,
      updatedAt: pages.updatedAt,
    })
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new HTTPException(404, { message: "Page not found" });

  // 所属ノートに対する role が解決しない呼び出し元はアクセス不可。owner /
  // editor / viewer / guest のいずれかが付けば 200 で返す（`GET /api/pages/:id`
  // と同じ判定）。
  // The caller must hold some role on the owning note. The visibility check
  // inside `getNoteRole` already gates anonymous access to private notes
  // correctly (mirrors `GET /api/pages/:id`).
  const { role } = await getNoteRole(row.noteId, userId, userEmail, db);
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const contentRows = await db
    .select({
      contentText: pageContents.contentText,
      version: pageContents.version,
      updatedAt: pageContents.updatedAt,
    })
    .from(pageContents)
    .where(eq(pageContents.pageId, pageId))
    .limit(1);

  const content = contentRows[0];

  // 未ログインゲストはエッジで短期キャッシュ可能（同じ public ノートを多数が
  // 開く想定）、ログイン済みは個人スコープに留める。
  // Guests can be cached briefly at the edge (many readers on the same public
  // note); logged-in viewers stay private.
  c.header(
    "Cache-Control",
    userId ? "private, must-revalidate" : "public, max-age=60, must-revalidate",
  );

  return c.json({
    id: pageId,
    title: row.title ?? null,
    content_text: content?.contentText ?? null,
    content_preview: row.contentPreview ?? null,
    version: content?.version ?? 0,
    updated_at: (content?.updatedAt ?? row.updatedAt).toISOString(),
  });
});

export default app;
