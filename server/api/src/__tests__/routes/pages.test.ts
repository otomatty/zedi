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

import { Hono } from "hono";
import pageRoutes from "../../routes/pages.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-test-123";
const PAGE_ID = "page-content-test-001";

function authHeaders() {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
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
    const app = createPagesApp([[{ id: PAGE_ID, ownerId: TEST_USER_ID }], []]);

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
    const app = createPagesApp([[], []]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/pages", () => {
  it("returns 200 with paginated own pages by default", async () => {
    const updatedAt = new Date("2026-01-01T00:00:00Z").toISOString();
    const { app, chains } = createPagesAppWithChains([
      {
        rows: [
          { id: "page-a", title: "A", content_preview: null, updated_at: updatedAt },
          { id: "page-b", title: "B", content_preview: "preview", updated_at: updatedAt },
        ],
      },
    ]);

    const res = await app.request("/api/pages?limit=2&offset=0", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pages: Array<Record<string, unknown>> };
    expect(body.pages).toHaveLength(2);
    expect(body.pages[0]).toMatchObject({ id: "page-a", title: "A" });
    expect(body.pages[1]).toMatchObject({ id: "page-b", title: "B" });
    // 単一の execute 呼び出しで完結する。
    // The endpoint resolves with a single execute() call.
    expect(chains.filter((c) => c.startMethod === "execute")).toHaveLength(1);
  });

  it("returns 200 with empty array when caller has no pages", async () => {
    const app = createPagesApp([{ rows: [] }]);

    const res = await app.request("/api/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pages: unknown[] };
    expect(body.pages).toEqual([]);
  });

  it("returns 200 with shared pages when scope=shared", async () => {
    const updatedAt = new Date("2026-02-01T00:00:00Z").toISOString();
    const app = createPagesApp([
      {
        rows: [
          {
            id: "page-shared",
            title: "Shared",
            content_preview: null,
            updated_at: updatedAt,
          },
        ],
      },
    ]);

    const res = await app.request("/api/pages?scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pages: Array<Record<string, unknown>> };
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0]).toMatchObject({ id: "page-shared" });
  });

  it("scope=shared predicate includes note-owner access through note_pages for linked personal pages too", async () => {
    const { app, chains } = createPagesAppWithChains([{ rows: [] }]);

    const res = await app.request("/api/pages?scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    // ノートオーナーは通常 note_members 行を持たないため、shared predicate には
    // `note_pages -> notes.owner_id` 経路が必要。これで note-native page だけでなく
    // linked personal page も listing と `assertPageViewAccess` で整合する。
    // Verify the shared predicate contains the note-owner branch via note_pages,
    // so linked personal pages remain visible to note owners too.
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("note_pages");
    expect(serialised).toContain("np.page_id = p.id");
    expect(serialised).toContain("n.owner_id");
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([{ rows: [] }]);

    const res = await app.request("/api/pages", { method: "GET" });

    expect(res.status).toBe(401);
  });

  it("clamps limit/offset to safe ranges", async () => {
    const app = createPagesApp([{ rows: [] }]);

    const res = await app.request("/api/pages?limit=999&offset=-5", {
      method: "GET",
      headers: authHeaders(),
    });

    // 不正な値でも 200 を返し、内部で clamp する。
    // Even with out-of-range params, the endpoint clamps to safe defaults and returns 200.
    expect(res.status).toBe(200);
  });

  it("falls back to defaults when limit/offset are non-numeric", async () => {
    const app = createPagesApp([{ rows: [] }]);

    // `Number("abc")` だと NaN が SQL に渡って失敗するため、`parseInt + || default` でガードしている。
    // Guards against `NaN` reaching SQL when params can't be parsed as integers.
    const res = await app.request("/api/pages?limit=abc&offset=xyz", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
  });

  it("selects p.note_id so callers can distinguish personal vs note-native pages in mixed listings", async () => {
    const { app, chains } = createPagesAppWithChains([{ rows: [] }]);

    const res = await app.request("/api/pages?scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    // `scope=shared` は note-native ページも返すため、`zedi_list_pages` MCP ツールや
    // クライアントは行ごとに `note_id` を見て個人 / ノートネイティブを判別する。
    // SELECT に `p.note_id` が残っていることを保証する（PR #727 / #719 リグレッション）。
    // The mixed `scope=shared` listing must surface `note_id` so callers (e.g. the
    // `zedi_list_pages` MCP tool) can bucket personal vs note-native rows.
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("p.note_id");
  });

  it("filters out internal special pages (special_kind, is_schema) by default", async () => {
    const { app, chains } = createPagesAppWithChains([{ rows: [] }]);

    const res = await app.request("/api/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    // execute() に渡された SQL チャンクに special_kind / is_schema の除外句が
    // 含まれていることを検証する（Drizzle sql テンプレートの queryChunks を文字列化）。
    // Verify the SQL passed to execute() contains the special-kind exclusion clause.
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("special_kind IS NULL");
    expect(serialised).toContain("is_schema = false");
  });

  it("includes internal special pages when include_special=true", async () => {
    const { app, chains } = createPagesAppWithChains([{ rows: [] }]);

    const res = await app.request("/api/pages?include_special=true", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).not.toContain("special_kind IS NULL");
    expect(serialised).not.toContain("is_schema = false");
  });
});

describe("PUT /api/pages/:id/content", () => {
  it("creates page_contents when expected_version is 0 and no row exists (aligns with GET version 0)", async () => {
    const ydocB64 = Buffer.from("hello").toString("base64");
    const { app, chains } = createPagesAppWithChains([
      [{ id: PAGE_ID, ownerId: TEST_USER_ID }],
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
      [{ id: PAGE_ID, ownerId: TEST_USER_ID }],
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

  it("returns 400 when ydoc_state is omitted", async () => {
    const app = createPagesApp([[{ id: PAGE_ID, ownerId: TEST_USER_ID }]]);

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
      // 1. access check select
      [{ id: PAGE_ID, ownerId: TEST_USER_ID }],
      // 2. UPDATE page_contents (optimistic version path)
      [{ version: 2, pageId: PAGE_ID }],
      // 3. SELECT pages.title in applyPagesMetadataUpdate (rename detection)
      //    Same title as body → no propagation triggered.
      [{ title: "Same Title" }],
      // 4. UPDATE pages (title + updatedAt)
      [],
      // 5. auto-snapshot select (empty → no snapshot)
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

    // applyPagesMetadataUpdate must have issued the extra SELECT for the
    // pages.title read. The shape includes access-check SELECT + title-read
    // SELECT (+ auto-snapshot SELECT), and at least one UPDATE chain.
    // リネーム検出のため pages.title を読む SELECT が増えること。
    const selectChains = chains.filter((c) => c.startMethod === "select");
    expect(selectChains.length).toBeGreaterThanOrEqual(2);
    const updateChains = chains.filter((c) => c.startMethod === "update");
    // UPDATE page_contents + UPDATE pages
    expect(updateChains.length).toBeGreaterThanOrEqual(2);
  });
});
