/**
 * `GET /api/notes/:noteId/tags` のテスト。
 * Tests for note-wide tag aggregation endpoint.
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
  TEST_USER_EMAIL,
  OTHER_USER_ID,
  createMockNote,
  createTestApp,
  authHeaders,
} from "./setup.js";

const NOTE_ID = "note-test-001";

function mockTagsSignal(overrides: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        pages_max_updated_at: new Date("2026-01-01T00:00:00Z"),
        pages_count: 3,
        links_max_created_at: new Date("2026-02-01T00:00:00Z"),
        links_count: 2,
        ghost_max_created_at: null,
        ghost_count: 0,
        none_count: 1,
        ...overrides,
      },
    ],
  };
}

function mockTagRows() {
  return {
    rows: [
      {
        name_lower: "rust",
        display_name: "Rust",
        page_count: 2,
        resolved: true,
      },
      {
        name_lower: "todo",
        display_name: "todo",
        page_count: 1,
        resolved: false,
      },
    ],
  };
}

describe("GET /api/notes/:noteId/tags", () => {
  it("returns aggregated tags for the note owner", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote], mockTagsSignal(), mockTagRows()]);

    const res = await app.request(`/api/notes/${NOTE_ID}/tags`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ name: string; page_count: number; resolved: boolean }>;
      none_count: number;
      total_pages: number;
    };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ name: "Rust", page_count: 2, resolved: true });
    expect(body.none_count).toBe(1);
    expect(body.total_pages).toBe(3);
    expect(res.headers.get("ETag")).toMatch(/^W\/".+"$/);
    expect(res.headers.get("Cache-Control")).toContain("private");
  });

  it("allows guest access on public notes (authOptional)", async () => {
    const publicNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "public" });
    const { app } = createTestApp([
      [publicNote],
      mockTagsSignal({ pages_count: 1, none_count: 0 }),
      { rows: [] },
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/tags`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total_pages: number };
    expect(body.items).toEqual([]);
    expect(body.total_pages).toBe(1);
  });

  it("returns 404 when the note does not exist", async () => {
    const { app } = createTestApp([[]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/tags`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller has no role on a private note", async () => {
    const privateNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([[privateNote], [], []]);

    const res = await app.request(`/api/notes/${NOTE_ID}/tags`, {
      headers: authHeaders(TEST_USER_ID, TEST_USER_EMAIL),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when private note is accessed unauthenticated", async () => {
    const privateNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([[privateNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/tags`);
    expect(res.status).toBe(403);
  });

  describe("ETag / 304", () => {
    it("returns 304 when If-None-Match matches and skips the tag query", async () => {
      const mockNote = createMockNote();
      const { app, chains } = createTestApp([
        [mockNote],
        mockTagsSignal(),
        mockTagRows(),
        [mockNote],
        mockTagsSignal(),
      ]);

      const res1 = await app.request(`/api/notes/${NOTE_ID}/tags`, {
        headers: authHeaders(),
      });
      const etag = res1.headers.get("ETag");
      if (!etag) throw new Error("ETag missing");

      const chainsBefore = chains.length;
      const res2 = await app.request(`/api/notes/${NOTE_ID}/tags`, {
        headers: { ...authHeaders(), "If-None-Match": etag },
      });

      expect(res2.status).toBe(304);
      expect(await res2.text()).toBe("");
      expect(chains.length - chainsBefore).toBe(2);
    });
  });
});
