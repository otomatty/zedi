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
  createMockPageListRow,
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

describe("GET /api/notes/:noteId/pages", () => {
  it("lists pages filtered by pages.note_id ordered by updated_at desc", async () => {
    const mockNote = createMockNote();
    const row1 = createMockPageListRow({ page_id: "pg-1", page_title: "First" });
    const row2 = createMockPageListRow({
      page_id: "pg-2",
      page_title: "Second",
      page_updated_at: new Date("2026-02-01T00:00:00Z"),
    });
    const { app } = createTestApp([[mockNote], [row1, row2]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/pages`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { pages: Array<Record<string, unknown>> };
    expect(body.pages).toHaveLength(2);
    expect(body.pages[0]).toMatchObject({ page_id: "pg-1", page_title: "First" });
    expect(body.pages[0]).not.toHaveProperty("sort_order");
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
