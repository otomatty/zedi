/**
 * GET/PUT /api/pages/:id/content など pages ルートのテスト。
 * Tests for pages routes including empty page_contents handling on GET.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
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
}));

import { Hono } from "hono";
import pageRoutes from "../../routes/pages.js";
import { ensureDefaultNote } from "../../services/defaultNoteService.js";
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

describe("GET /api/pages/:id/content", () => {
  it("returns 200 with empty ydoc_state when page exists but page_contents row is missing", async () => {
    const app = createPagesApp([...pageAccessPrefix(), []]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ydoc_state: "",
      version: 0,
      content_text: null,
    });
    expect(body.updated_at).toBeUndefined();
  });

  it("returns 404 when page does not exist", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/pages", () => {
  it("returns 410 Gone with Deprecation header (issue #823)", async () => {
    const app = createPagesApp([]);

    const res = await app.request("/api/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(410);
    expect(res.headers.get("Deprecation")).toBe("true");
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("issue #823");
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
    const body = (await res.json()) as { id: string; owner_id: string };
    expect(body.id).toBe("new-page-id");
    expect(body.owner_id).toBe(TEST_USER_ID);
  });
});

describe("PUT /api/pages/:id/content", () => {
  it("creates page_contents when expected_version is 0 and no row exists (aligns with GET version 0)", async () => {
    const ydocB64 = Buffer.from("hello").toString("base64");
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      [{ version: 1, pageId: PAGE_ID }],
      [],
      [{ id: "snap-1" }],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: ydocB64,
        expected_version: 0,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(1);
    // maybeCreateSnapshot の内部実装順に依存しないよう、スナップショット経路が走ったことだけ確認する。
    const methods = chains.map((chain) => chain.startMethod);
    expect(methods).toContain("insert");
  });

  it("accepts ydoc_state empty string for first save (matches GET when page_contents is missing)", async () => {
    const app = createPagesApp([
      ...pageAccessPrefix(),
      [{ version: 1, pageId: PAGE_ID }],
      [],
      [{ id: "snap-2" }],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: "",
        expected_version: 0,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(1);
  });

  it("returns 400 when ydoc_state is omitted (before DB access checks)", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        expected_version: 0,
      }),
    });

    expect(res.status).toBe(400);
  });

  // Issue #726: タイトル変更検出のため、PUT に title が含まれるとき pages.title
  // を SELECT してから UPDATE を行う。これにより伝播処理の起点になる。
  // Issue #726: when PUT carries `title`, the route SELECTs the current
  // `pages.title` before UPDATE so the handler can detect a rename and
  // trigger background propagation.
  it("issues an extra SELECT for rename detection when body.title is provided", async () => {
    const ydocB64 = Buffer.from("hello").toString("base64");
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      [{ version: 2, pageId: PAGE_ID }],
      [{ title: "Same Title" }],
      [],
      [],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: ydocB64,
        expected_version: 1,
        title: "Same Title",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(2);

    const selectChains = chains.filter((c) => c.startMethod === "select");
    expect(selectChains.length).toBeGreaterThanOrEqual(2);
    const updateChains = chains.filter((c) => c.startMethod === "update");
    expect(updateChains.length).toBeGreaterThanOrEqual(2);
  });
});
