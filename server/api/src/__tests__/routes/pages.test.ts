/**
 * pages ルートのテスト。Issue #889 Phase 4 で `GET/PUT /api/pages/:id/content`
 * を廃止して以降は、メタデータ系ルート（`PUT /api/pages/:id`・
 * `GET /api/pages/:id`・`GET /api/pages/:id/public-content`）と一覧 / 作成 /
 * 削除をカバーする。
 *
 * Tests for the pages routes. Issue #889 Phase 4 removed the `GET/PUT
 * /api/pages/:id/content` endpoints, so this suite now covers metadata-only
 * routes (`PUT /api/pages/:id`, `GET /api/pages/:id`,
 * `GET /api/pages/:id/public-content`) plus listing, creation, and deletion.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    c.set("userEmail", "tester@example.com");
    await next();
  },
  authOptional: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (userId) {
      c.set("userId", userId);
      c.set("userEmail", "tester@example.com");
    }
    await next();
  },
}));

vi.mock("../../services/defaultNoteService.js", () => ({
  ensureDefaultNote: vi.fn(async (_db: unknown, userId: string) => ({
    id: "default-note-mock",
    ownerId: userId,
    title: "Mockのノート",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: true,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  })),
  getDefaultNoteOrNull: vi.fn(async (_db: unknown, userId: string) => ({
    id: "default-note-mock",
    ownerId: userId,
    title: "Mockのノート",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: true,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  })),
}));

import { Hono } from "hono";
import pageRoutes from "../../routes/pages.js";
import { ensureDefaultNote, getDefaultNoteOrNull } from "../../services/defaultNoteService.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-test-123";
const PAGE_ID = "page-content-test-001";
/** pages.note_id と findActiveNoteById が参照するノート ID を一致させる。 */
const NOTE_ID = "note-access-test-001";

function authHeaders() {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

function mockNoteRow() {
  return {
    id: NOTE_ID,
    ownerId: TEST_USER_ID,
    title: "Test note",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: false,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  };
}

/** PR 1b 以降の assertPage*Access が要求する SELECT 3 連を先頭に付ける。 */
function pageAccessPrefix(extraPageFields: Record<string, unknown> = {}) {
  return [
    [{ id: PAGE_ID, ownerId: TEST_USER_ID, noteId: NOTE_ID, ...extraPageFields }],
    [{ email: "tester@example.com" }],
    [mockNoteRow()],
  ];
}

function createPagesApp(dbResults: unknown[]) {
  const { db } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/pages", pageRoutes);
  return app;
}

function createPagesAppWithChains(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/pages", pageRoutes);
  return { app, chains };
}

describe("GET /api/pages/:id (single page metadata, Issue #860 Phase 6)", () => {
  /**
   * 単一ページ取得経路で返される metadata 行のテンプレート。実際の SELECT
   * カラムと並びを揃えるため、`createMockPageMetaRow` の戻り値をそのまま
   * `[row]` として createPagesApp に流す。
   *
   * Template for the single-page metadata row returned by the new GET route.
   * Mirrors the SELECT column set so the mock can be passed straight through
   * `createPagesApp` as `[row]`.
   */
  function createMockPageMetaRow(overrides: Record<string, unknown> = {}) {
    return {
      id: PAGE_ID,
      ownerId: TEST_USER_ID,
      noteId: NOTE_ID,
      sourcePageId: null,
      title: "Hello",
      contentPreview: "preview body",
      thumbnailUrl: "https://cdn.example/t.jpg",
      sourceUrl: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      isDeleted: false,
      ...overrides,
    };
  }

  it("returns the page metadata for the owner", async () => {
    const app = createPagesApp([
      [createMockPageMetaRow()], // page row
      [mockNoteRow()], // getNoteRole → findActiveNoteById (owner)
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      owner_id: TEST_USER_ID,
      note_id: NOTE_ID,
      title: "Hello",
      content_preview: "preview body",
      thumbnail_url: "https://cdn.example/t.jpg",
      source_url: null,
      is_deleted: false,
    });
  });

  it("returns 404 when the page row is missing or already soft-deleted", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when caller has no role on the owning note", async () => {
    const privateNote = {
      ...mockNoteRow(),
      ownerId: "other-user",
      visibility: "private" as const,
    };
    const app = createPagesApp([
      [createMockPageMetaRow({ ownerId: "other-user" })],
      [privateNote], // getNoteRole → findActiveNoteById (not owner)
      [], // member check
      [], // domain access check
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  it("allows guest access for pages on a public note (authOptional)", async () => {
    // 公開ノート配下のページは未ログインの guest からも取得できる。
    // `getNoteRole` は visibility=public に対して role=guest を返す。
    //
    // Public-note pages are reachable by unauthenticated callers; `getNoteRole`
    // resolves them as `guest` via the visibility branch.
    const publicNote = { ...mockNoteRow(), ownerId: "other-user", visibility: "public" as const };
    const app = createPagesApp([
      [createMockPageMetaRow({ ownerId: "other-user" })],
      [publicNote], // getNoteRole → findActiveNoteById (no userId/email → guest path)
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: PAGE_ID });
  });
});

describe("GET /api/pages", () => {
  it("returns 200 with Deprecation header and legacy listing shape (issue #823 shim)", async () => {
    const updatedAt = new Date("2026-03-01T12:00:00Z");
    const app = createPagesApp([
      {
        rows: [
          {
            id: "list-page-1",
            title: "Hello",
            content_preview: "pv",
            updated_at: updatedAt,
            note_id: "default-note-mock",
          },
        ],
      },
    ]);

    const res = await app.request("/api/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Deprecation")).toBe("true");
    const body = (await res.json()) as {
      pages: Array<{ id: string; title: string; note_id: string }>;
    };
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0]?.id).toBe("list-page-1");
    expect(body.pages[0]?.note_id).toBe("default-note-mock");
  });

  it("returns empty pages when default note is missing (no listing)", async () => {
    vi.mocked(getDefaultNoteOrNull).mockResolvedValueOnce(null);
    const app = createPagesApp([]);

    const res = await app.request("/api/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Deprecation")).toBe("true");
    const body = (await res.json()) as { pages: unknown[] };
    expect(body.pages).toEqual([]);
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([]);

    const res = await app.request("/api/pages", { method: "GET" });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/pages", () => {
  it("calls ensureDefaultNote when note_id omitted and returns 201", async () => {
    vi.mocked(ensureDefaultNote).mockClear();

    const createdAt = new Date("2026-03-01T12:00:00Z");
    const updatedAt = new Date("2026-03-01T12:00:01Z");
    const app = createPagesApp([
      [
        {
          id: "new-page-id",
          ownerId: TEST_USER_ID,
          noteId: "default-note-mock",
          title: null,
          contentPreview: null,
          sourcePageId: null,
          sourceUrl: null,
          thumbnailUrl: null,
          thumbnailObjectId: null,
          createdAt,
          updatedAt,
          isDeleted: false,
        },
      ],
    ]);

    const res = await app.request("/api/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Hello" }),
    });

    expect(res.status).toBe(201);
    expect(ensureDefaultNote).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as {
      id: string;
      owner_id: string;
      note_id: string;
    };
    expect(body.id).toBe("new-page-id");
    expect(body.owner_id).toBe(TEST_USER_ID);
    // Issue #889 Phase 3: クライアントが `/notes/:noteId/:pageId` へ遷移するため
    // POST レスポンスに `note_id` が含まれる必要がある。
    // Issue #889 Phase 3: clients navigate to `/notes/:noteId/:pageId`, so the
    // POST response must carry `note_id`.
    expect(body.note_id).toBe("default-note-mock");
  });

  it("returns 403 when note_id points to a note the caller cannot edit", async () => {
    const otherOwnerNote = {
      id: "foreign-note-id",
      ownerId: "other-user",
      title: "Someone else's note",
      visibility: "private" as const,
      editPermission: "owner_only" as const,
      isOfficial: false,
      isDefault: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };

    const app = createPagesApp([[otherOwnerNote], [], []]);

    const res = await app.request("/api/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Nope", note_id: "foreign-note-id" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when note_id does not exist", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request("/api/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Nope", note_id: "missing-note-id" }),
    });

    expect(res.status).toBe(404);
  });
});

// ── PUT /api/pages/:id (metadata only) ─────────────────────────────────────
//
// Issue #889 Phase 4 で `local` モードと `PUT /api/pages/:id/content` を廃止
// したため、タイトル等のメタデータ更新は本ルートへ一本化されている。
// `applyPagesMetadataUpdate` を経由するため、SSE 通知・タイトル伝播の
// ゲーティングは旧 `/content` 経路と同等に動作する。
//
// Issue #889 Phase 4 retired the `local` mode and the
// `PUT /api/pages/:id/content` route, so page metadata updates flow through
// this endpoint exclusively. The shared `applyPagesMetadataUpdate` helper
// keeps the SSE-emit and title-propagation invariants consistent with the
// old `/content` path.
describe("PUT /api/pages/:id (metadata only)", () => {
  it("returns 200 and updates the title when body.title differs from current", async () => {
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      // applyPagesMetadataUpdate: SELECT current title + preview
      [{ title: "Old Title", contentPreview: null }],
      // applyPagesMetadataUpdate: UPDATE pages.returning()
      [
        {
          id: PAGE_ID,
          ownerId: TEST_USER_ID,
          noteId: NOTE_ID,
          title: "New Title",
          contentPreview: null,
          updatedAt: new Date("2026-05-16T10:00:00Z"),
          isDeleted: false,
        },
      ],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New Title" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      title: "New Title",
      content_preview: null,
      updated_at: "2026-05-16T10:00:00.000Z",
    });
    const updateChains = chains.filter((c) => c.startMethod === "update");
    expect(updateChains.length).toBe(1);
  });

  // 同じ値を round-trip した場合は `applyPagesMetadataUpdate` が UPDATE を skip し、
  // `metadataChanged: false` で返す。SSE 通知も走らない。さらに、レスポンスは
  // 現在値 (DB に保存された値) を必ず含み、`null` で返してクライアントの
  // キャッシュを壊さないこと (PR #888 レビューフィードバック)。
  //
  // Round-tripping the current values must be a no-op: the helper skips the
  // UPDATE and returns `metadataChanged: false`, so no SSE broadcast fires.
  // The response must echo the current persisted values rather than nulls so
  // clients trusting the response do not clobber valid cache entries
  // (PR #888 review feedback from gemini-code-assist, codex, coderabbitai).
  it("skips the UPDATE but echoes current metadata when title matches (PR #888 review)", async () => {
    const sameUpdatedAt = new Date("2026-05-16T11:00:00Z");
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      // applyPagesMetadataUpdate の現在値取得 SELECT
      [{ title: "Same Title", contentPreview: "Same Preview" }],
      // no-op 経路の現在値再取得 SELECT (`updated_at` を含む)
      [
        {
          title: "Same Title",
          contentPreview: "Same Preview",
          updatedAt: sameUpdatedAt,
        },
      ],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Same Title", content_preview: "Same Preview" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      title: "Same Title",
      content_preview: "Same Preview",
      updated_at: sameUpdatedAt.toISOString(),
    });
    const updateChains = chains.filter((c) => c.startMethod === "update");
    expect(updateChains.length).toBe(0);
  });

  it("returns 400 when body has neither title nor content_preview", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  // 非文字列が混ざった場合に `applyPagesMetadataUpdate` の `.trim()` で 500 に
  // 落ちないこと (PR #888 review by coderabbitai)。境界で 400 に倒す。
  //
  // Malformed payloads with non-string fields must be rejected at the route
  // boundary (400) instead of crashing inside the metadata helper's
  // `.trim()` call (PR #888 review by coderabbitai).
  it("returns 400 when title is not a string", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: 123 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when content_preview is not a string", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ content_preview: 42 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when the page does not exist (via assertPageEditAccess)", async () => {
    // assertPageEditAccess → getPageOwnership → SELECT pages: empty
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "x" }),
    });

    expect(res.status).toBe(404);
  });
});

// ── GET /api/pages/:id/public-content (read-only for guests / viewers) ─────
//
// `local` モード廃止後、編集者は Hocuspocus 経由で Y.Doc を扱うが、未ログインの
// ゲスト（public / unlisted ノートの読者）や viewer ロールの閲覧者は WebSocket を
// 張らずに `content_text` だけを REST で取得する。本ルートは Y.Doc バイト列を
// 返さないことで、誤って編集セッションを開始できないようにする。
//
// After retiring the `local` mode, editors flow through Hocuspocus while
// guests (public/unlisted readers) and viewer-role members fetch
// `content_text` via REST without spinning up a WebSocket. The endpoint
// deliberately omits Y.Doc bytes so a read-only consumer cannot start an
// editing session by accident.
describe("GET /api/pages/:id/public-content", () => {
  it("returns the rendered text and version for the owner", async () => {
    const app = createPagesApp([
      // page row (SELECT pages)
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Hello",
          contentPreview: "preview body",
          updatedAt: new Date("2026-05-16T09:00:00Z"),
        },
      ],
      // getNoteRole → findActiveNoteById (owner short-circuit)
      [mockNoteRow()],
      // page_contents SELECT
      [
        {
          contentText: "Hello world",
          version: 7,
          updatedAt: new Date("2026-05-16T10:00:00Z"),
        },
      ],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      title: "Hello",
      content_text: "Hello world",
      content_preview: "preview body",
      version: 7,
      updated_at: "2026-05-16T10:00:00.000Z",
    });
    expect(res.headers.get("cache-control")).toBe("private, must-revalidate");
  });

  it("returns content_text=null and version=0 when page_contents row is missing", async () => {
    const app = createPagesApp([
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Blank",
          contentPreview: null,
          updatedAt: new Date("2026-05-16T11:00:00Z"),
        },
      ],
      [mockNoteRow()],
      [], // page_contents not yet inserted
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      content_text: null,
      version: 0,
      // falls back to pages.updated_at when page_contents is missing
      updated_at: "2026-05-16T11:00:00.000Z",
    });
  });

  it("returns 404 when the page row is missing or already soft-deleted", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when caller has no role on the owning private note", async () => {
    const privateNote = { ...mockNoteRow(), ownerId: "other-user", visibility: "private" as const };
    const app = createPagesApp([
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Secret",
          contentPreview: null,
          updatedAt: new Date(),
        },
      ],
      [privateNote], // note row
      [], // member SELECT empty
      [], // domain SELECT empty
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  // 未ログインゲストでも public ノート配下のページは閲覧できる。
  // `getNoteRole` は visibility=public に対して role=guest を返す。
  // エッジでの短期キャッシュを許す Cache-Control を確認する。
  //
  // Unauthenticated guests can read pages on public notes. `getNoteRole`
  // resolves them as `guest` via the visibility branch. The route returns a
  // short edge-cacheable `Cache-Control` for that case.
  it("allows guest access to a public-note page with edge-cacheable Cache-Control", async () => {
    const publicNote = { ...mockNoteRow(), ownerId: "other-user", visibility: "public" as const };
    const app = createPagesApp([
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Public",
          contentPreview: "edge ok",
          updatedAt: new Date("2026-05-16T08:00:00Z"),
        },
      ],
      [publicNote],
      [
        {
          contentText: "Public body",
          version: 2,
          updatedAt: new Date("2026-05-16T09:00:00Z"),
        },
      ],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      // no auth header → guest path
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      content_text: "Public body",
      version: 2,
    });
    expect(res.headers.get("cache-control")).toBe("public, max-age=60, must-revalidate");
  });
});
