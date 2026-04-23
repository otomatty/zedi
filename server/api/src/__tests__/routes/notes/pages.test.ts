/**
 * ノートページ管理ルートのテスト
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    const userEmail = c.req.header("x-test-user-email");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    if (userEmail) c.set("userEmail", userEmail);
    await next();
  },
  authOptional: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    const userEmail = c.req.header("x-test-user-email");
    if (userId) c.set("userId", userId);
    if (userEmail) c.set("userEmail", userEmail);
    await next();
  },
}));

import {
  TEST_USER_ID,
  OTHER_USER_ID,
  createMockNote,
  createMockPageListRow,
  createTestApp,
  authHeaders,
} from "./setup.js";

const NOTE_ID = "note-test-001";

// ── POST /api/notes/:noteId/pages ───────────────────────────────────────────

describe("POST /api/notes/:noteId/pages", () => {
  it("should add a page and return { added: true, sort_order }", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole → findActiveNoteById (owner)
      [{ id: "pg-new", ownerId: TEST_USER_ID, noteId: null }], // page exists check
      [{ max: 2 }], // maxOrder query
      [], // insert notePages
      [], // update notes.updatedAt
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ page_id: "pg-new" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ added: true, sort_order: 3 });
  });

  it("should use provided sort_order when specified", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote],
      [{ id: "pg-new", ownerId: TEST_USER_ID, noteId: null }],
      [{ max: 5 }],
      [],
      [],
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ page_id: "pg-new", sort_order: 10 }),
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ added: true, sort_order: 10 });
  });

  it("should accept camelCase pageId as alias for page_id", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole → findActiveNoteById (owner)
      [{ id: "pg-camel", ownerId: TEST_USER_ID, noteId: null }], // page exists check
      [{ max: 0 }], // maxOrder query
      [], // insert notePages
      [], // update notes.updatedAt
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ pageId: "pg-camel" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("added", true);
  });

  it("should create a note-native page when title is provided without page_id (issue #713)", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole
      [{ id: "pg-created" }], // insert pages → returning (inside transaction)
      [{ max: 0 }], // maxOrder query (inside transaction)
      [], // insert notePages (inside transaction)
      [], // update notes.updatedAt (inside transaction)
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New Page" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("added", true);
    expect(body).toHaveProperty("sort_order");

    const insertCalls = chains.filter((c) => c.startMethod === "insert");
    const pageInsert = insertCalls[0];
    expect(pageInsert).toBeDefined();
    const valuesOp = pageInsert?.ops.find((op) => op.method === "values");
    // タイトル経路ではノートネイティブページとして作成されるため `noteId` が
    // 必ず埋まり、個人 /home（`note_id IS NULL` フィルタ）には現れない。
    // The title path creates a note-native page; `noteId` must be set so it
    // never appears on personal /home (which filters `note_id IS NULL`).
    expect(valuesOp?.args[0]).toMatchObject({
      ownerId: TEST_USER_ID,
      noteId: NOTE_ID,
      title: "New Page",
    });
  });

  it("should NOT set noteId when linking an existing personal page via page_id (issue #713)", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → findActiveNoteById (owner)
      [{ id: "pg-existing", ownerId: TEST_USER_ID, noteId: null }], // page exists check
      [{ max: 0 }], // maxOrder query
      [], // insert notePages
      [], // update notes.updatedAt
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ page_id: "pg-existing" }),
    });

    expect(res.status).toBe(200);
    // `page_id` 経路は既存個人ページをノートに「リンク」するだけで、ページ
    // 自体のスコープは変わらない。Phase 1 では pages テーブルへの insert は
    // 走らない（note_pages へのリンクのみ）。Phase 3 で copy エンドポイント
    // を別途追加する。
    // The `page_id` path only links an existing personal page into the note;
    // the page itself stays personal. In Phase 1 there is no insert into the
    // `pages` table — only the `note_pages` link row is touched. Phase 3
    // will add a separate copy endpoint.
    const insertCalls = chains.filter((c) => c.startMethod === "insert");
    expect(insertCalls).toHaveLength(1); // note_pages link only, no pages insert
  });

  it("should return 400 when neither page_id nor title is provided", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("should return 400 when title is empty string", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("title must be a non-empty string");
  });

  it("should return 400 when title is whitespace-only", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "   " }),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("title must be a non-empty string");
  });

  it("should return 400 when title is not a string", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: 123 }),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("title must be a non-empty string");
  });

  it("should return 404 when page does not exist", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole
      [], // page exists check → empty
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ page_id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });

  it("should return 400 when page_id refers to a note-native page (issue #713)", async () => {
    // 別ノートに所属するノートネイティブページを `page_id` 経由で別ノートに
    // リンクできてしまうと壊れたカード（list には出るが open すると 403）に
    // なるため拒否する。Phase 1 では個人ページ（`note_id IS NULL`）のみ
    // リンク可能。Phase 3 のコピーエンドポイントで取り込みを実装する。
    //
    // Reject note-native pages on the `page_id` link path (issue #713).
    // Otherwise a page already scoped to note A would surface in note B but
    // remain unauthorized for B's members. Only personal pages are linkable.
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole (owner)
      [{ id: "pg-native", ownerId: TEST_USER_ID, noteId: "another-note-id" }], // page exists, but note-native
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ page_id: "pg-native" }),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Only personal pages can be linked");
  });

  it("should return 403 when user has no edit permission", async () => {
    const privateNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "private",
    });
    const { app } = createTestApp([
      [privateNote], // getNoteRole → findActiveNoteById (not owner)
      [], // getNoteRole → member check (not a member, private → null)
      [], // getNoteRole → domain access check (no matching rule)
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ page_id: "pg-new" }),
    });

    expect(res.status).toBe(403);
  });

  it("should return 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: "pg-new" }),
    });

    expect(res.status).toBe(401);
  });
});

// ── POST /api/notes/:noteId/pages/copy-from-personal/:pageId ────────────────

describe("POST /api/notes/:noteId/pages/copy-from-personal/:pageId (issue #713 Phase 3)", () => {
  const SOURCE_PAGE_ID = "pg-source-personal";

  it("should copy a personal page into the note as a note-native page with sourcePageId set", async () => {
    const mockNote = createMockNote();
    const createdAt = new Date("2026-04-23T00:00:00Z");
    const updatedAt = new Date("2026-04-23T00:00:01Z");
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner
      [
        {
          id: SOURCE_PAGE_ID,
          ownerId: TEST_USER_ID,
          noteId: null,
          title: "Source Title",
          contentPreview: "preview",
          thumbnailUrl: "https://example.com/thumb.png",
          sourceUrl: "https://example.com/src",
        },
      ], // source page lookup
      [
        {
          id: "pg-copy-001",
          ownerId: TEST_USER_ID,
          noteId: NOTE_ID,
          sourcePageId: SOURCE_PAGE_ID,
          title: "Source Title",
          contentPreview: "preview",
          thumbnailUrl: "https://example.com/thumb.png",
          sourceUrl: "https://example.com/src",
          createdAt,
          updatedAt,
          isDeleted: false,
        },
      ], // insert pages → returning (full row, used in response payload)
      [{ ydocState: Buffer.from([1, 2, 3]), contentText: "body text" }], // source page_contents lookup
      [], // insert page_contents for new page
      [{ max: 4 }], // maxOrder notePages
      [], // insert notePages
      [], // update notes.updatedAt
    ]);

    const res = await app.request(
      `/api/notes/${NOTE_ID}/pages/copy-from-personal/${SOURCE_PAGE_ID}`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ created: true, page_id: "pg-copy-001", sort_order: 5 });
    // レスポンスにはクライアントが IDB に書き戻せる完全な新ページ行を含める
    // (issue #713 Phase 3 / Codex P1)。note_id は destination ノートを指す。
    // The response carries the full new page row so clients can write through
    // to IDB without a follow-up round trip. Issue #713 Phase 3 / Codex P1.
    expect(body).toHaveProperty("page");
    expect(body.page).toMatchObject({
      id: "pg-copy-001",
      owner_id: TEST_USER_ID,
      note_id: NOTE_ID,
      source_page_id: SOURCE_PAGE_ID,
      title: "Source Title",
      is_deleted: false,
    });

    // コピーされた pages 行は destination ノート下のノートネイティブページで、
    // `sourcePageId` が出自を指す。`noteId = NULL` のまま個人ホームに漏れない。
    // The copied pages row is a note-native page under the destination note,
    // with `sourcePageId` recording provenance. It never leaks to personal /home.
    const insertCalls = chains.filter((c) => c.startMethod === "insert");
    const pagesInsert = insertCalls[0];
    const pagesValues = pagesInsert?.ops.find((op) => op.method === "values");
    expect(pagesValues?.args[0]).toMatchObject({
      ownerId: TEST_USER_ID,
      noteId: NOTE_ID,
      sourcePageId: SOURCE_PAGE_ID,
      title: "Source Title",
      contentPreview: "preview",
      thumbnailUrl: "https://example.com/thumb.png",
      sourceUrl: "https://example.com/src",
    });

    // page_contents も同一トランザクションで新ページに複製される。
    // The page_contents row is duplicated into the new page in the same tx.
    const contentsInsert = insertCalls[1];
    const contentsValues = contentsInsert?.ops.find((op) => op.method === "values");
    expect(contentsValues?.args[0]).toMatchObject({
      pageId: "pg-copy-001",
      version: 1,
      contentText: "body text",
    });
  });

  it("should skip page_contents insert when the source page has no content row yet", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole
      [
        {
          id: SOURCE_PAGE_ID,
          ownerId: TEST_USER_ID,
          noteId: null,
          title: "Empty Page",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
        },
      ], // source page
      [
        {
          id: "pg-copy-empty",
          ownerId: TEST_USER_ID,
          noteId: NOTE_ID,
          sourcePageId: SOURCE_PAGE_ID,
          title: "Empty Page",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
          createdAt: new Date("2026-04-23T00:00:00Z"),
          updatedAt: new Date("2026-04-23T00:00:00Z"),
          isDeleted: false,
        },
      ], // insert pages → returning (full row)
      [], // source page_contents lookup → empty
      [{ max: 0 }], // maxOrder
      [], // insert notePages
      [], // update notes
    ]);

    const res = await app.request(
      `/api/notes/${NOTE_ID}/pages/copy-from-personal/${SOURCE_PAGE_ID}`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );

    expect(res.status).toBe(200);

    // page_contents への insert は走らない（元行なし）。insert は pages + notePages の 2 回だけ。
    // No page_contents insert when source has none; total inserts = pages + notePages.
    const insertCalls = chains.filter((c) => c.startMethod === "insert");
    expect(insertCalls).toHaveLength(2);
  });

  it("should return 403 when caller is not the owner of the source personal page", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole → owner of note
      [
        {
          id: SOURCE_PAGE_ID,
          ownerId: OTHER_USER_ID, // someone else's personal page
          noteId: null,
          title: "Not Yours",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
        },
      ],
    ]);

    const res = await app.request(
      `/api/notes/${NOTE_ID}/pages/copy-from-personal/${SOURCE_PAGE_ID}`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );

    expect(res.status).toBe(403);
  });

  it("should return 400 when the source page is note-native (not a personal page)", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole
      [
        {
          id: SOURCE_PAGE_ID,
          ownerId: TEST_USER_ID,
          noteId: "another-note-id", // already note-native
          title: "Note-Native",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
        },
      ],
    ]);

    const res = await app.request(
      `/api/notes/${NOTE_ID}/pages/copy-from-personal/${SOURCE_PAGE_ID}`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("personal page");
  });

  it("should return 403 when caller cannot edit the destination note", async () => {
    const privateNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "private",
    });
    const { app } = createTestApp([
      [privateNote], // findActiveNoteById
      [], // member check
      [], // domain access
    ]);

    const res = await app.request(
      `/api/notes/${NOTE_ID}/pages/copy-from-personal/${SOURCE_PAGE_ID}`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );

    expect(res.status).toBe(403);
  });
});

// ── POST /api/notes/:noteId/pages/:pageId/copy-to-personal ──────────────────

describe("POST /api/notes/:noteId/pages/:pageId/copy-to-personal (issue #713 Phase 3)", () => {
  const NOTE_PAGE_ID = "pg-note-native";

  it("should copy a note-native page into the caller's personal pages (noteId = NULL, sourcePageId set)", async () => {
    const mockNote = createMockNote();
    const createdAt = new Date("2026-04-23T00:00:00Z");
    const updatedAt = new Date("2026-04-23T00:00:01Z");
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner of the note
      [
        {
          id: NOTE_PAGE_ID,
          noteId: NOTE_ID,
          title: "Shared Note Page",
          contentPreview: "snippet",
          thumbnailUrl: null,
          sourceUrl: null,
        },
      ], // source page
      [
        {
          id: "pg-personal-copy",
          ownerId: TEST_USER_ID,
          noteId: null,
          sourcePageId: NOTE_PAGE_ID,
          title: "Shared Note Page",
          contentPreview: "snippet",
          thumbnailUrl: null,
          sourceUrl: null,
          createdAt,
          updatedAt,
          isDeleted: false,
        },
      ], // insert pages → returning (full row, used in response payload)
      [{ ydocState: Buffer.from([9, 9]), contentText: "note body" }], // source page_contents
      [], // insert page_contents for new page
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/${NOTE_PAGE_ID}/copy-to-personal`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ created: true, page_id: "pg-personal-copy" });
    // レスポンスに完全な新ページ行が含まれ、クライアントは IDB に書き戻せる
    // (issue #713 Phase 3 / Codex P1)。個人ページなので note_id は null。
    // The full new page row is carried so the client can write it through to
    // IDB immediately. Issue #713 Phase 3 / Codex P1. Personal page → note_id is null.
    expect(body.page).toMatchObject({
      id: "pg-personal-copy",
      owner_id: TEST_USER_ID,
      note_id: null,
      source_page_id: NOTE_PAGE_ID,
      title: "Shared Note Page",
      content_preview: "snippet",
      is_deleted: false,
    });

    // 個人ページとして作成されるため `noteId` は明示的に `null`（個人スコープ）で、
    // `sourcePageId` に出自のノートネイティブページ ID が入る。
    // Creates a personal page: `noteId` is explicitly `null` (personal scope),
    // with `sourcePageId` pointing back to the source note-native page.
    const insertCalls = chains.filter((c) => c.startMethod === "insert");
    const pagesInsert = insertCalls[0];
    const pagesValues = pagesInsert?.ops.find((op) => op.method === "values");
    const values = pagesValues?.args[0] as Record<string, unknown>;
    expect(values).toMatchObject({
      ownerId: TEST_USER_ID,
      sourcePageId: NOTE_PAGE_ID,
      title: "Shared Note Page",
      contentPreview: "snippet",
    });
    // `noteId` must be null for personal pages (`note_id IS NULL` filter relies on this).
    expect(values.noteId).toBeNull();

    // 個人ページはノートリストに入らないので `notePages` / `notes.updatedAt` は触らない。
    // Personal copies do not join the note list, so no notePages/notes update.
    expect(insertCalls).toHaveLength(2); // pages + page_contents only
    const updateCalls = chains.filter((c) => c.startMethod === "update");
    expect(updateCalls).toHaveLength(0);
  });

  it("should return 400 when the source page belongs to a different note", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole
      [
        {
          id: NOTE_PAGE_ID,
          noteId: "other-note-id", // mismatch with URL noteId
          title: "Foreign Page",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
        },
      ],
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/${NOTE_PAGE_ID}/copy-to-personal`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("does not belong");
  });

  it("should return 403 when caller has no role on the note (e.g. private / not a member)", async () => {
    const privateNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "private",
    });
    const { app } = createTestApp([
      [privateNote], // findActiveNoteById
      [], // member check
      [], // domain access
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/${NOTE_PAGE_ID}/copy-to-personal`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  it("should succeed for a guest role on public notes (any resolved role may copy to personal)", async () => {
    // 公開ノートでは `role = 'guest'` として解決されるため、閲覧できる以上
    // 個人コピーも許可する。脱退後も各自の個人コピーは残る、という仕様を反映。
    // Public notes resolve the caller to `guest`; since they can already view,
    // they are allowed to take a personal copy. Matches the spec that personal
    // copies outlive any later membership change.
    const publicNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "public",
    });
    const { app, chains } = createTestApp([
      [publicNote], // getNoteRole → findActiveNoteById
      [], // getNoteRole → member check (not a member)
      [], // getNoteRole → domain access check (no matching rule)
      [
        {
          id: NOTE_PAGE_ID,
          noteId: NOTE_ID,
          title: "Public Page",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
        },
      ], // source page lookup inside tx
      [
        {
          id: "pg-guest-copy",
          ownerId: TEST_USER_ID,
          noteId: null,
          sourcePageId: NOTE_PAGE_ID,
          title: "Public Page",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
          createdAt: new Date("2026-04-23T00:00:00Z"),
          updatedAt: new Date("2026-04-23T00:00:00Z"),
          isDeleted: false,
        },
      ], // insert pages → returning (full row)
      [], // source page_contents lookup → empty
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/${NOTE_PAGE_ID}/copy-to-personal`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ created: true, page_id: "pg-guest-copy" });

    // 元の note 側は更新しない：個人コピーは完全に独立したエンティティ。
    // The source note is untouched: the personal copy is wholly independent.
    expect(chains.filter((c) => c.startMethod === "update")).toHaveLength(0);
  });
});

// ── DELETE /api/notes/:noteId/pages/:pageId ─────────────────────────────────

describe("DELETE /api/notes/:noteId/pages/:pageId", () => {
  it("should detach a personal page (note_id IS NULL) without deleting the pages row", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole (owner)
      [{ id: "pg-001", noteId: null }], // page lookup inside tx
      [], // update notePages (soft delete)
      [], // update notes.updatedAt
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/pg-001`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ removed: true });

    // 個人ページは `note_pages` リンクと `notes.updatedAt` だけ更新する。
    // `pages` 自体は所有者の個人 /home に残るので update しない。
    // Personal page: only `note_pages` and `notes.updatedAt` get updated;
    // the `pages` row itself stays alive on the owner's /home.
    const updateCalls = chains.filter((c) => c.startMethod === "update");
    expect(updateCalls).toHaveLength(2);
  });

  it("should also tombstone the pages row when removing a note-native page (issue #713)", async () => {
    // ノートネイティブページ（`pages.note_id = noteId`）を `note_pages` だけ
    // 論理削除すると `pages` 行が孤児として残り、`/api/pages/:id/content` が
    // ノートロール経由で引き続き認可してしまう。同じトランザクションで
    // `pages.is_deleted = true` まで進めることを検証する。
    //
    // For note-native pages, tombstoning only `note_pages` would leave the
    // `pages` row alive and still authorized via the note role. Verify the
    // route updates `pages.is_deleted = true` in the same transaction.
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole (owner)
      [{ id: "pg-native", noteId: NOTE_ID }], // page lookup → note-native
      [], // update notePages (soft delete)
      [], // update pages (soft delete the orphan)
      [], // update notes.updatedAt
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/pg-native`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);

    const updateCalls = chains.filter((c) => c.startMethod === "update");
    expect(updateCalls).toHaveLength(3); // note_pages + pages + notes
  });

  it("should return 403 when user cannot edit", async () => {
    const privateNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "private",
    });
    const { app } = createTestApp([
      [privateNote], // getNoteRole (not owner)
      [], // member check (not a member)
      [], // domain access check (no matching rule)
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/pg-001`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });
});

// ── PUT /api/notes/:noteId/pages (reorder) ──────────────────────────────────

describe("PUT /api/notes/:noteId/pages", () => {
  it("should reorder pages and return { reordered: true }", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole (owner)
      [], // update notePages for page_ids[0]
      [], // update notePages for page_ids[1]
      [], // update notes.updatedAt
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ page_ids: ["pg-b", "pg-a"] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ reordered: true });

    const updateCalls = chains.filter((c) => c.startMethod === "update");
    expect(updateCalls.length).toBe(3);
  });

  it("should return 400 when page_ids is missing", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("should return 400 when page_ids is empty", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ page_ids: [] }),
    });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/notes/:noteId/pages ────────────────────────────────────────────

describe("GET /api/notes/:noteId/pages", () => {
  it("should return pages in { pages: [...] } format", async () => {
    const mockNote = createMockNote();
    const row1 = createMockPageListRow({ page_id: "pg-1", sort_order: 0 });
    const row2 = createMockPageListRow({ page_id: "pg-2", sort_order: 1, page_title: "Second" });

    const { app } = createTestApp([
      [mockNote], // getNoteRole (owner)
      [row1, row2], // select pages
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pages: Record<string, unknown>[] };

    expect(body).toHaveProperty("pages");
    expect(body.pages).toHaveLength(2);

    const first = body.pages[0];
    if (!first) throw new Error("expected at least one page");
    expect(first).toHaveProperty("page_id", "pg-1");
    expect(first).toHaveProperty("sort_order", 0);
    expect(first).toHaveProperty("added_by");
    expect(first).toHaveProperty("page_title");
    expect(first).toHaveProperty("page_content_preview");
    expect(first).toHaveProperty("page_thumbnail_url");
  });

  it("should return empty array when note has no pages", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole
      [], // select pages → empty
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      headers: authHeaders(),
    });

    const body = (await res.json()) as { pages: unknown[] };
    expect(body.pages).toHaveLength(0);
  });

  it("should return 403 for private note accessed by non-member", async () => {
    const privateNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "private",
    });
    const { app } = createTestApp([
      [privateNote], // getNoteRole (not owner)
      [], // member check (not a member)
      [], // domain access check (no matching rule)
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });
});
