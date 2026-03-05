/**
 * Notes API Route Tests (TDD)
 *
 * These tests verify the EXPECTED behavior after bug fixes.
 * They should FAIL against the current (broken) implementation,
 * then PASS after applying the fixes.
 *
 * Bugs addressed:
 *   1. GET /api/notes/:noteId returns nested { note, role } instead of flat response
 *   2. GET /api/notes returns { own, shared } instead of flat array
 *   3. GET /api/notes/:noteId doesn't include pages
 *   4. POST /api/notes doesn't add creator to note_members
 *   5. Public note endpoints use authRequired instead of authOptional
 */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

// ── Mock auth middleware ────────────────────────────────────────────────────
// Must be before the route import so vi.mock is hoisted.
vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    const userEmail = c.req.header("x-test-user-email");
    if (!userId) {
      return c.json({ message: "Unauthorized" }, 401);
    }
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

import noteRoutes from "../../routes/notes.js";

// ── Constants ───────────────────────────────────────────────────────────────
const TEST_USER_ID = "user-test-123";
const TEST_USER_EMAIL = "test@example.com";
const OTHER_USER_ID = "user-other-456";

// ── Mock data factories ────────────────────────────────────────────────────

function createMockNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-test-001",
    ownerId: TEST_USER_ID,
    title: "Test Note",
    visibility: "private",
    editPermission: "owner_only",
    isOfficial: false,
    viewCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    isDeleted: false,
    ...overrides,
  };
}

function createMockPageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "page-test-001",
    ownerId: TEST_USER_ID,
    sourcePageId: null,
    title: "Test Page",
    contentPreview: "Preview content...",
    thumbnailUrl: null,
    sourceUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    isDeleted: false,
    sortOrder: 0,
    addedByUserId: TEST_USER_ID,
    addedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ── Mock DB factory ─────────────────────────────────────────────────────────
// Creates a proxy-based mock of the Drizzle database that returns
// pre-defined results in sequential order for each query chain.

interface ChainInfo {
  startMethod: string;
  startArgs: unknown[];
  ops: { method: string; args: unknown[] }[];
}

function createMockDb(results: unknown[]) {
  let chainIndex = 0;
  const chains: ChainInfo[] = [];

  function makeChainProxy(
    resultIdx: number,
    ops: { method: string; args: unknown[] }[],
  ): Promise<unknown> & Record<string, (...args: unknown[]) => unknown> {
    return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
      get(_, prop: string) {
        if (prop === "then") {
          const result = results[resultIdx];
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "catch") {
          const result = results[resultIdx];
          return (reject?: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
        }
        if (prop === "finally") {
          const result = results[resultIdx];
          return (fn?: () => void) => Promise.resolve(result).finally(fn);
        }
        return (...args: unknown[]) => {
          ops.push({ method: prop, args });
          return makeChainProxy(resultIdx, ops);
        };
      },
    }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  }

  const db = new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get(_, prop: string) {
      return (...args: unknown[]) => {
        const idx = chainIndex++;
        const ops: { method: string; args: unknown[] }[] = [];
        chains.push({ startMethod: prop, startArgs: args, ops });
        return makeChainProxy(idx, ops);
      };
    },
  });

  return { db, chains };
}

// ── Test app factory ────────────────────────────────────────────────────────

function createTestApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });

  app.route("/api/notes", noteRoutes);
  return { app, chains };
}

function authHeaders(userId = TEST_USER_ID, userEmail = TEST_USER_EMAIL) {
  return {
    "x-test-user-id": userId,
    "x-test-user-email": userEmail,
    "Content-Type": "application/json",
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Notes API Routes", () => {
  // ────────────────────────────────────────────────────────────────────────
  // POST /api/notes — ノート作成
  // ────────────────────────────────────────────────────────────────────────
  describe("POST /api/notes", () => {
    it("should return the created note in flat format with snake_case keys", async () => {
      const mockNote = createMockNote();
      const { app } = createTestApp([
        [mockNote], // db.insert(notes).values(...).returning()
        [], // db.insert(noteMembers).values(...)
      ]);

      const res = await app.request("/api/notes", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title: "Test Note", visibility: "private" }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;

      // Flat response — NOT wrapped in { note: ... }
      expect(body).toHaveProperty("id", mockNote.id);
      expect(body).not.toHaveProperty("note");

      // snake_case keys
      expect(body).toHaveProperty("owner_id");
      expect(body).toHaveProperty("edit_permission");
      expect(body).toHaveProperty("is_official");
      expect(body).toHaveProperty("view_count");
      expect(body).toHaveProperty("created_at");
      expect(body).toHaveProperty("updated_at");
      expect(body).toHaveProperty("is_deleted");
    });

    it("should automatically add the creator to note_members", async () => {
      const mockNote = createMockNote();
      const { app, chains } = createTestApp([
        [mockNote], // db.insert(notes)
        [], // db.insert(noteMembers)
      ]);

      await app.request("/api/notes", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title: "Test Note", visibility: "private" }),
      });

      const insertCalls = chains.filter((c) => c.startMethod === "insert");
      expect(insertCalls.length).toBeGreaterThanOrEqual(2);

      const memberInsert = insertCalls[1];
      if (!memberInsert) throw new Error("expected at least 2 insert calls");
      const valuesCall = memberInsert.ops.find((op) => op.method === "values");
      if (!valuesCall) throw new Error("expected values call");
      const valuesArg = (valuesCall.args[0] ?? {}) as Record<string, unknown>;
      expect(valuesArg).toMatchObject({
        noteId: mockNote.id,
        memberEmail: TEST_USER_EMAIL,
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // GET /api/notes/:noteId — ノート詳細取得
  // ────────────────────────────────────────────────────────────────────────
  describe("GET /api/notes/:noteId", () => {
    it("should return a flat response with current_user_role and pages (snake_case)", async () => {
      const mockNote = createMockNote();
      const mockPage = createMockPageRow();

      const { app } = createTestApp([
        [mockNote], // getNoteRole: note lookup (owner → no member check)
        [mockPage], // pages query
      ]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      // Flat response — NOT wrapped in { note: ... }
      expect(body).toHaveProperty("id", mockNote.id);
      expect(body).not.toHaveProperty("note");

      // current_user_role
      expect(body).toHaveProperty("current_user_role", "owner");

      // pages array
      expect(body).toHaveProperty("pages");
      expect(Array.isArray(body.pages)).toBe(true);

      // snake_case keys
      expect(body).toHaveProperty("owner_id");
      expect(body).toHaveProperty("edit_permission");
      expect(body).toHaveProperty("is_official");
      expect(body).toHaveProperty("view_count");
      expect(body).toHaveProperty("created_at");
      expect(body).toHaveProperty("updated_at");
      expect(body).toHaveProperty("is_deleted");
    });

    it("should return current_user_role 'owner' for the note creator", async () => {
      const mockNote = createMockNote();
      const { app } = createTestApp([
        [mockNote], // getNoteRole: note lookup
        [], // pages query (empty)
      ]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as Record<string, unknown>;

      expect(body.current_user_role).toBe("owner");
    });

    it("should return current_user_role 'guest' for public notes viewed by non-member", async () => {
      const publicNote = createMockNote({
        id: "note-public",
        ownerId: OTHER_USER_ID,
        visibility: "public",
      });

      const { app } = createTestApp([
        [publicNote], // getNoteRole: note lookup (not owner)
        [], // getNoteRole: member check (not a member)
        [], // viewCount update
        [], // pages query
      ]);

      const res = await app.request("/api/notes/note-public", {
        headers: authHeaders(),
      });
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.current_user_role).toBe("guest");
    });

    it("should allow unauthenticated access to public notes (authOptional)", async () => {
      const publicNote = createMockNote({
        id: "note-public",
        ownerId: OTHER_USER_ID,
        visibility: "public",
      });

      const { app } = createTestApp([
        [publicNote], // getNoteRole: note lookup (no userId → not owner, no email → skip member check, public → guest)
        [], // viewCount update
        [], // pages query
      ]);

      // No auth headers
      const res = await app.request("/api/notes/note-public");

      expect(res.status).not.toBe(401);
      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.current_user_role).toBe("guest");
    });

    it("should include page data in snake_case within pages array", async () => {
      const mockNote = createMockNote();
      const mockPage = createMockPageRow({
        id: "page-abc",
        title: "Page Title",
        contentPreview: "Some preview",
      });

      const { app } = createTestApp([
        [mockNote], // getNoteRole
        [mockPage], // pages query
      ]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.pages).toHaveLength(1);

      const page = (body.pages as Record<string, unknown>[])[0];
      expect(page).toHaveProperty("id", "page-abc");
      expect(page).toHaveProperty("owner_id");
      expect(page).toHaveProperty("source_page_id");
      expect(page).toHaveProperty("content_preview");
      expect(page).toHaveProperty("thumbnail_url");
      expect(page).toHaveProperty("source_url");
      expect(page).toHaveProperty("sort_order");
      expect(page).toHaveProperty("added_by_user_id");
      expect(page).toHaveProperty("added_at");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // GET /api/notes — ノート一覧
  // ────────────────────────────────────────────────────────────────────────
  describe("GET /api/notes", () => {
    it("should return a flat array with role, page_count, member_count", async () => {
      const note1 = createMockNote({ id: "note-1", title: "Note 1" });
      const note2 = createMockNote({ id: "note-2", title: "Note 2" });

      const { app } = createTestApp([
        [note1, note2], // own notes
        [], // member data (no shared notes)
        // shared notes query SKIPPED (no member data)
        [
          // page counts
          { noteId: "note-1", count: 3 },
          { noteId: "note-2", count: 1 },
        ],
        [
          // member counts
          { noteId: "note-1", count: 2 },
          { noteId: "note-2", count: 1 },
        ],
      ]);

      const res = await app.request("/api/notes", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>[];

      // Should be a flat array, NOT { own: [...], shared: [...] }
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);

      // Each item should have role, page_count, member_count
      const first = body[0];
      if (!first) throw new Error("expected at least one note");
      expect(first).toHaveProperty("role", "owner");
      expect(first).toHaveProperty("page_count");
      expect(typeof first.page_count).toBe("number");
      expect(first).toHaveProperty("member_count");
      expect(typeof first.member_count).toBe("number");

      // snake_case keys
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("owner_id");
      expect(first).toHaveProperty("edit_permission");
      expect(first).toHaveProperty("is_official");
      expect(first).toHaveProperty("view_count");
      expect(first).toHaveProperty("created_at");
      expect(first).toHaveProperty("updated_at");
      expect(first).toHaveProperty("is_deleted");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // GET /api/notes/discover — 公開ノート一覧
  // ────────────────────────────────────────────────────────────────────────
  describe("GET /api/notes/discover", () => {
    it("should allow unauthenticated access (authOptional)", async () => {
      const publicNote = createMockNote({
        id: "note-public",
        visibility: "public",
        isOfficial: true,
        ownerId: OTHER_USER_ID,
      });
      const mockOwner = {
        id: OTHER_USER_ID,
        displayName: "Other User",
        avatarUrl: null,
      };

      const { app } = createTestApp([
        [publicNote], // notes query
        [mockOwner], // users query
      ]);

      // No auth headers
      const res = await app.request("/api/notes/discover");

      expect(res.status).not.toBe(401);
      expect(res.status).toBe(200);
    });
  });
});
