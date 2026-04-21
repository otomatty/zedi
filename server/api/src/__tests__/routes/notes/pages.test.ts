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
      [{ id: "pg-new", ownerId: TEST_USER_ID }], // page exists check
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
      [{ id: "pg-new", ownerId: TEST_USER_ID }],
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
      [{ id: "pg-camel", ownerId: TEST_USER_ID }], // page exists check
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

  it("should create a new page when title is provided without page_id", async () => {
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
    expect(valuesOp?.args[0]).toMatchObject({
      ownerId: TEST_USER_ID,
      title: "New Page",
    });
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

// ── DELETE /api/notes/:noteId/pages/:pageId ─────────────────────────────────

describe("DELETE /api/notes/:noteId/pages/:pageId", () => {
  it("should remove a page and return { removed: true }", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole (owner)
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
