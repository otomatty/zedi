/**
 * ノートページ管理ルートのテスト（Issue #823: pages.note_id 直接モデル）
 * Tests for note page routes after issue #823 (`pages.note_id` ownership).
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
  TEST_USER_EMAIL,
  createMockNote,
  createTestApp,
  authHeaders,
} from "./setup.js";

const NOTE_ID = "note-test-001";

describe("POST /api/notes/:noteId/pages", () => {
  it("returns 400 when page_id linking is attempted (issue #823)", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ page_id: "pg-any" }),
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("page_id linking is removed");
  });

  it("returns 400 when pageId camelCase alias is used", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ pageId: "pg-any" }),
    });

    expect(res.status).toBe(400);
  });

  it("creates a page from title and returns created + sort_order 0", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote],
      [{ id: "pg-created", ownerId: TEST_USER_ID, noteId: NOTE_ID, title: "New Page" }],
      [],
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New Page" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      created: true,
      page_id: "pg-created",
      sort_order: 0,
    });

    const insertChains = chains.filter((c) => c.startMethod === "insert");
    expect(insertChains.length).toBeGreaterThanOrEqual(1);
    const valuesOp = insertChains[0]?.ops.find((op) => op.method === "values");
    expect(valuesOp?.args[0]).toMatchObject({
      ownerId: TEST_USER_ID,
      noteId: NOTE_ID,
      title: "New Page",
    });
  });

  it("returns 400 when title is missing", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when title is empty", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const resEmpty = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "" }),
    });
    expect(resEmpty.status).toBe(400);
  });

  it("returns 400 when title is whitespace-only", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const resWs = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "   " }),
    });
    expect(resWs.status).toBe(400);
  });

  it("returns 403 when caller cannot edit the note", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([[mockNote], [], []]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "POST",
      headers: authHeaders(TEST_USER_ID, TEST_USER_EMAIL),
      body: JSON.stringify({ title: "Nope" }),
    });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/notes/:noteId/pages (Issue #860 Phase 1 cursor window)", () => {
  /**
   * `pages.ts` の新しい SELECT に合わせたページ行を生成する。
   * `updatedAtIso` は本番経路で pg `to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
   * から返るマイクロ秒精度の ISO 文字列。
   *
   * Builds a page row matching the new SELECT in `pages.ts`. `updatedAtIso`
   * is the microsecond-precision ISO string produced by pg
   * `to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` in the real path.
   */
  function buildPageRow(overrides: Record<string, unknown> = {}) {
    const updatedAt = (overrides.updatedAt as Date | undefined) ?? new Date("2026-01-01T00:00:00Z");
    return {
      id: "pg-1",
      ownerId: TEST_USER_ID,
      noteId: NOTE_ID,
      sourcePageId: null,
      title: "First",
      contentPreview: "preview body...",
      thumbnailUrl: "https://cdn.example/thumb-1.jpg",
      sourceUrl: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt,
      // Default mirrors `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` (microseconds).
      // 既定値は pg の `to_char` 出力（マイクロ秒精度の ISO 文字列）を模倣する。
      updatedAtIso: `${updatedAt.toISOString().replace("Z", "")}000Z`,
      isDeleted: false,
      ...overrides,
    };
  }

  it("returns items with content_preview/thumbnail nulled by default", async () => {
    const mockNote = createMockNote();
    const row1 = buildPageRow({ id: "pg-1", title: "First" });
    const row2 = buildPageRow({
      id: "pg-2",
      title: "Second",
      updatedAt: new Date("2026-02-01T00:00:00Z"),
    });
    const { app } = createTestApp([[mockNote], [row1, row2]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown>>;
      next_cursor: string | null;
    };
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
    expect(body.items[0]).toMatchObject({ id: "pg-1", title: "First" });
    // `?include=` を指定していない場合は preview / thumbnail は必ず null になる。
    // When `?include=` is omitted, preview and thumbnail must come back as null.
    expect(body.items[0]?.content_preview).toBeNull();
    expect(body.items[0]?.thumbnail_url).toBeNull();
  });

  it("includes content_preview when ?include=preview is set", async () => {
    const mockNote = createMockNote();
    const row = buildPageRow({ id: "pg-1", contentPreview: "hello preview" });
    const { app } = createTestApp([[mockNote], [row]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages?include=preview`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items[0]?.content_preview).toBe("hello preview");
    expect(body.items[0]?.thumbnail_url).toBeNull();
  });

  it("includes thumbnail_url when ?include=thumbnail is set", async () => {
    const mockNote = createMockNote();
    const row = buildPageRow({
      id: "pg-1",
      contentPreview: "hello preview",
      thumbnailUrl: "https://cdn.example/t.jpg",
    });
    const { app } = createTestApp([[mockNote], [row]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages?include=thumbnail`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items[0]?.thumbnail_url).toBe("https://cdn.example/t.jpg");
    expect(body.items[0]?.content_preview).toBeNull();
  });

  it("emits next_cursor when more rows are available", async () => {
    const mockNote = createMockNote();
    // `next_cursor` を出すには limit+1 件返す必要がある。
    // The route emits `next_cursor` only when limit+1 rows come back.
    const rows = Array.from({ length: 3 }, (_, i) =>
      buildPageRow({
        id: `pg-${i}`,
        title: `Page ${i}`,
        updatedAt: new Date(`2026-03-0${i + 1}T00:00:00Z`),
      }),
    );
    const { app } = createTestApp([[mockNote], rows]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages?limit=2`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown>>;
      next_cursor: string | null;
    };
    expect(body.items).toHaveLength(2);
    expect(typeof body.next_cursor).toBe("string");
    expect(body.next_cursor && body.next_cursor.length).toBeGreaterThan(0);
  });

  it("returns null next_cursor when result fits the page", async () => {
    const mockNote = createMockNote();
    const rows = [buildPageRow({ id: "pg-only" })];
    const { app } = createTestApp([[mockNote], rows]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages?limit=5`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown>>;
      next_cursor: string | null;
    };
    expect(body.items).toHaveLength(1);
    expect(body.next_cursor).toBeNull();
  });

  it("rejects malformed cursor payloads with 400", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote], []]);

    // base64url("{}") はデコード自体は成功するが updatedAt / id を欠くため 400 になる。
    // `base64url("{}")` decodes cleanly but lacks updatedAt/id, so the route rejects it as 400.
    const badCursor = Buffer.from("{}", "utf8").toString("base64url");
    const res = await app.request(`/api/notes/${NOTE_ID}/pages?cursor=${badCursor}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
  });

  it("rejects cursor whose id is not a UUID with 400", async () => {
    // `cursor.id` が UUID として不正だと pg `uuid` キャストが 22P02 を投げて
    // 500 になるため、ルート側で先に 400 に倒す必要がある（coderabbitai review on #865）。
    //
    // A non-UUID `cursor.id` would otherwise reach the pg `uuid` cast and
    // surface as a `22P02` 500. The route should 400 it up front instead
    // (coderabbitai review on PR #865).
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote], []]);

    const cursor = Buffer.from(
      JSON.stringify({ updatedAt: "2026-01-01T00:00:00.000000Z", id: "not-a-uuid" }),
      "utf8",
    ).toString("base64url");

    const res = await app.request(`/api/notes/${NOTE_ID}/pages?cursor=${cursor}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
  });

  it("preserves microsecond precision in next_cursor (no Date.toISOString truncation)", async () => {
    // pg は `timestamp with time zone` をマイクロ秒精度で持つが、JS Date は
    // ミリ秒まで。ルートは pg 側の `to_char(...)` を `updatedAtIso` として
    // 受け取り、それをそのまま cursor に詰めるため、マイクロ秒桁が失われない
    // ことを確認する（gemini-code-assist + codex on PR #865）。
    //
    // Postgres stores `timestamp with time zone` at microsecond precision,
    // but JS `Date` truncates to milliseconds. The route receives the
    // microsecond ISO string from pg via `to_char(...)` as `updatedAtIso`
    // and copies it verbatim into the cursor, which the assertion verifies
    // (gemini-code-assist + codex on PR #865).
    const microIso = "2026-04-01T12:34:56.123456Z";
    const mockNote = createMockNote();
    const rows = [
      buildPageRow({ id: "11111111-1111-4111-8111-111111111111", updatedAtIso: microIso }),
      buildPageRow({ id: "22222222-2222-4222-8222-222222222222", updatedAtIso: microIso }),
    ];
    const { app } = createTestApp([[mockNote], rows]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages?limit=1`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { next_cursor: string | null };
    const nextCursor = body.next_cursor;
    expect(nextCursor).not.toBeNull();
    if (nextCursor === null) throw new Error("expected next_cursor to be present");
    const decoded = JSON.parse(Buffer.from(nextCursor, "base64url").toString("utf8")) as {
      updatedAt: string;
      id: string;
    };
    expect(decoded.updatedAt).toBe(microIso);
  });

  it("allows guest access on public notes (authOptional)", async () => {
    // Public visibility では getNoteRole が認証なしでも guest として解決する。
    // Public visibility → getNoteRole resolves caller as `guest` even without auth.
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "public" });
    const row = buildPageRow();
    const { app } = createTestApp([[mockNote], [row]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "GET",
      // 認証ヘッダなし: 未ログインリクエスト。
      // No x-test-user-id header → unauthenticated request.
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items).toHaveLength(1);
  });

  it("returns 403 when caller has no note role", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([[mockNote], [], []]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "GET",
      headers: authHeaders(TEST_USER_ID, TEST_USER_EMAIL),
    });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/notes/:noteId/pages/:pageId", () => {
  it("soft-deletes page when it belongs to the note", async () => {
    const mockNote = createMockNote();
    const pageId = "pg-del-1";
    const { app, chains } = createTestApp([[mockNote], [{ id: pageId, noteId: NOTE_ID }], [], []]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/${pageId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ removed: true });

    const updates = chains.filter((c) => c.startMethod === "update");
    expect(updates.length).toBe(2);
  });

  it("returns 400 when page belongs to another note", async () => {
    const mockNote = createMockNote();
    const pageId = "pg-other-note";
    const { app } = createTestApp([[mockNote], [{ id: pageId, noteId: "other-note-id" }]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/${pageId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when page id missing", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote], []]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/missing-page`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/notes/:noteId/pages (reorder noop)", () => {
  it("returns reordered true and only bumps notes.updated_at", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([[mockNote], []]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ page_ids: ["a", "b"] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ reordered: true });

    const updates = chains.filter((c) => c.startMethod === "update");
    expect(updates).toHaveLength(1);
  });

  it("returns 400 when page_ids missing", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe("Removed routes (404)", () => {
  it("copy-from-personal is not registered", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/copy-from-personal/pg-x`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("copy-to-personal is not registered", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages/pg-x/copy-to-personal`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });
});
