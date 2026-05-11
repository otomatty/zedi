/**
 * ノート CRUD + 一覧 + discover ルートのテスト
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
  TEST_USER_EMAIL,
  OTHER_USER_ID,
  createMockNote,
  createMockPageRow,
  createTestApp,
  authHeaders,
} from "./setup.js";

// ── POST /api/notes ─────────────────────────────────────────────────────────

describe("POST /api/notes", () => {
  it("should return the created note in flat format with snake_case keys", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // insert notes → returning
      [], // insert noteMembers
    ]);

    const res = await app.request("/api/notes", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Test Note", visibility: "private" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty("id", mockNote.id);
    expect(body).not.toHaveProperty("note");
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
      [mockNote], // insert notes
      [], // insert noteMembers
    ]);

    await app.request("/api/notes", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Test Note" }),
    });

    const insertCalls = chains.filter((c) => c.startMethod === "insert");
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);

    expect(insertCalls[1]).toBeDefined();
    const memberInsert = insertCalls[1] as (typeof insertCalls)[number];
    const valuesCall = memberInsert.ops.find((op) => op.method === "values");
    expect(valuesCall).toBeDefined();
    const valuesArg = ((valuesCall as NonNullable<typeof valuesCall>).args[0] ?? {}) as Record<
      string,
      unknown
    >;
    expect(valuesArg).toMatchObject({
      noteId: mockNote.id,
      memberEmail: TEST_USER_EMAIL,
    });
  });

  it("should return 401 without auth headers", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No Auth" }),
    });

    expect(res.status).toBe(401);
  });

  it("should return 403 when non-admin sets is_official true on create", async () => {
    const { app } = createTestApp([[{ role: "user" }]]);

    const res = await app.request("/api/notes", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Fake official", is_official: true }),
    });

    expect(res.status).toBe(403);
  });

  it("should allow admin to create note with is_official true", async () => {
    const mockNote = createMockNote({ isOfficial: true });
    const { app } = createTestApp([[{ role: "admin" }], [mockNote], []]);

    const res = await app.request("/api/notes", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Official", is_official: true }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.is_official).toBe(true);
  });

  it("should return 400 when is_official is not a boolean on create", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/notes", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Bad", is_official: "true" }),
    });

    expect(res.status).toBe(400);
  });
});

// ── PUT /api/notes/:noteId ──────────────────────────────────────────────────

describe("PUT /api/notes/:noteId", () => {
  it("should update and return the note with snake_case keys", async () => {
    const mockNote = createMockNote();
    const updatedNote = createMockNote({ title: "Updated Title" });
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner → findActiveNoteById
      [updatedNote], // update notes → returning
    ]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Updated Title" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("id", mockNote.id);
    expect(body).toHaveProperty("owner_id");
    expect(body).toHaveProperty("edit_permission");
  });

  it("should return 403 when non-owner tries to update", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID });
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner → findActiveNoteById (owner mismatch → 403)
    ]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Hacked" }),
    });

    expect(res.status).toBe(403);
  });

  it("should return 403 when non-admin changes is_official", async () => {
    const mockNote = createMockNote({ isOfficial: false });
    const { app } = createTestApp([[mockNote], [{ role: "user" }]]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ is_official: true }),
    });

    expect(res.status).toBe(403);
  });

  it("should return 403 when non-admin sends is_official even if equal to current (TOCTOU)", async () => {
    const mockNote = createMockNote({ isOfficial: true });
    const { app } = createTestApp([[mockNote], [{ role: "user" }]]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Renamed", is_official: true }),
    });

    expect(res.status).toBe(403);
  });

  it("should allow admin to set is_official from false to true on update", async () => {
    const mockNote = createMockNote({ isOfficial: false });
    const updatedNote = createMockNote({ isOfficial: true });
    const { app } = createTestApp([[mockNote], [{ role: "admin" }], [updatedNote]]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ is_official: true }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.is_official).toBe(true);
  });

  it("should allow admin to set is_official from true to false on update", async () => {
    const mockNote = createMockNote({ isOfficial: true });
    const updatedNote = createMockNote({ isOfficial: false });
    const { app } = createTestApp([[mockNote], [{ role: "admin" }], [updatedNote]]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ is_official: false }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.is_official).toBe(false);
  });

  it("should return 400 when is_official is not a boolean on update", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ is_official: 1 }),
    });

    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/notes/:noteId ───────────────────────────────────────────────

describe("DELETE /api/notes/:noteId", () => {
  it("should soft-delete and return { deleted: true }", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner → findActiveNoteById
      [], // update notes (soft delete)
    ]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ deleted: true });
  });

  it("should return 403 when non-owner tries to delete", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID });
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner (owner mismatch → 403)
    ]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  it("should return 404 when note does not exist", async () => {
    const { app } = createTestApp([
      [], // requireNoteOwner → findActiveNoteById → null → 404
    ]);

    const res = await app.request("/api/notes/nonexistent", {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("should return 400 when trying to delete a default note", async () => {
    // デフォルトノート（マイノート）はユーザーの個人スペースなので削除拒否。
    // 拒否時には soft-delete UPDATE が走らないことも併せて検証し、
    // 「拒否したのに更新は適用された」の取りこぼしを防ぐ。
    // The default note is the user's personal space; deletion is rejected.
    // Also assert no `update` chain fires so we lock down the contract that
    // a rejected delete leaves the row untouched.
    const defaultNote = createMockNote({ isDefault: true });
    const { app, chains } = createTestApp([
      [defaultNote], // requireNoteOwner → findActiveNoteById (owner)
    ]);

    const res = await app.request(`/api/notes/${defaultNote.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
    // HTTPException は text/plain でメッセージを返すため res.text() で検証する。
    // HTTPException returns the message as text/plain, so assert via res.text().
    const body = await res.text();
    expect(body).toMatch(/default note/i);
    // soft-delete UPDATE が走っていないことを確認する。
    // Verify the soft-delete UPDATE chain did not execute.
    expect(chains.some((c) => c.startMethod === "update")).toBe(false);
  });
});

// ── GET /api/notes/:noteId ──────────────────────────────────────────────────

describe("GET /api/notes/:noteId", () => {
  it("should return a flat response with current_user_role and pages (snake_case)", async () => {
    const mockNote = createMockNote();
    const mockPage = createMockPageRow();

    const { app } = createTestApp([
      [mockNote], // getNoteRole → findActiveNoteById (owner)
      [mockPage], // pages query
    ]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty("id", mockNote.id);
    expect(body).not.toHaveProperty("note");
    expect(body).toHaveProperty("current_user_role", "owner");
    expect(body).toHaveProperty("pages");
    expect(Array.isArray(body.pages)).toBe(true);
    expect(body).toHaveProperty("owner_id");
    expect(body).toHaveProperty("edit_permission");
    expect(body).toHaveProperty("is_official");
  });

  it("should return current_user_role 'guest' for public notes viewed by non-member", async () => {
    const publicNote = createMockNote({
      id: "note-public",
      ownerId: OTHER_USER_ID,
      visibility: "public",
    });

    const { app } = createTestApp([
      [publicNote], // getNoteRole → findActiveNoteById (not owner)
      [], // getNoteRole → member check (not a member)
      [], // getNoteRole → domain access check (no matching rule)
      [], // viewCount update
      [], // pages query
    ]);

    const res = await app.request("/api/notes/note-public", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.current_user_role).toBe("guest");
  });

  it("should allow unauthenticated access to public notes (authOptional)", async () => {
    const publicNote = createMockNote({
      id: "note-public",
      ownerId: OTHER_USER_ID,
      visibility: "public",
    });

    const { app } = createTestApp([
      [publicNote], // getNoteRole (no userId, no email → guest)
      [], // viewCount update
      [], // pages query
    ]);

    const res = await app.request("/api/notes/note-public");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.current_user_role).toBe("guest");
  });

  it("should include page data in snake_case within pages array", async () => {
    const mockNote = createMockNote();
    const mockPage = createMockPageRow({ id: "page-abc", title: "Page Title" });

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
    // Issue #849 移行措置: レスポンス軽量化のため `content_preview` は常に `null`。
    // Migration step for #849: `content_preview` is always `null` on the wire.
    expect(page).toHaveProperty("content_preview", null);
    expect(page).toHaveProperty("thumbnail_url");
    expect(page).toHaveProperty("note_id", mockNote.id);
  });

  it("should return 404 for non-existent note", async () => {
    const { app } = createTestApp([
      [], // getNoteRole → findActiveNoteById → null
    ]);

    const res = await app.request("/api/notes/nonexistent", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("should return 403 for private note accessed by non-member", async () => {
    const privateNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "private",
    });

    const { app } = createTestApp([
      [privateNote], // getNoteRole → findActiveNoteById
      [], // getNoteRole → member check (not a member, private → null)
      [], // getNoteRole → domain access check (no matching rule)
    ]);

    const res = await app.request(`/api/notes/${privateNote.id}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  // ── ETag / 304 (Issue #853) ────────────────────────────────────────
  describe("ETag / 304 conditional GET", () => {
    it("should include an ETag header on a 200 response", async () => {
      const mockNote = createMockNote();
      const mockPage = createMockPageRow();
      const { app } = createTestApp([[mockNote], [mockPage]]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const etag = res.headers.get("ETag");
      expect(etag).toBeTruthy();
      expect(etag).toMatch(/^W\/".+"$/);
      expect(res.headers.get("Cache-Control")).toContain("private");
      expect(res.headers.get("Vary")).toContain("Cookie");
    });

    it("should return 304 with an empty body when If-None-Match matches", async () => {
      const mockNote = createMockNote();
      const mockPage = createMockPageRow();
      const { app, chains } = createTestApp([
        [mockNote], // first request: getNoteRole
        [mockPage], // first request: pages query
        [mockNote], // second request: getNoteRole only (no pages query)
      ]);

      const res1 = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });
      const etag = res1.headers.get("ETag");
      expect(etag).toBeTruthy();
      if (!etag) throw new Error("ETag header missing");

      const chainsBefore = chains.length;
      const res2 = await app.request(`/api/notes/${mockNote.id}`, {
        headers: { ...authHeaders(), "If-None-Match": etag },
      });

      expect(res2.status).toBe(304);
      expect(await res2.text()).toBe("");
      // pages クエリも viewCount UPDATE も走らないので、新規に消費される
      // chain は getNoteRole の 1 件のみ。
      // Only the role-resolution DB query runs on the 304 path; pages query
      // and viewCount update are both skipped.
      expect(chains.length - chainsBefore).toBe(1);
    });

    it("should produce a different ETag after note.updatedAt changes", async () => {
      const firstNote = createMockNote({ updatedAt: new Date("2026-01-01T00:00:00Z") });
      const updatedNote = createMockNote({ updatedAt: new Date("2026-02-15T12:34:56Z") });
      const { app } = createTestApp([
        [firstNote],
        [], // pages query
        [updatedNote],
        [], // pages query
      ]);

      const res1 = await app.request(`/api/notes/${firstNote.id}`, {
        headers: authHeaders(),
      });
      const etag1 = res1.headers.get("ETag");

      const res2 = await app.request(`/api/notes/${updatedNote.id}`, {
        headers: authHeaders(),
      });
      const etag2 = res2.headers.get("ETag");

      expect(etag1).toBeTruthy();
      expect(etag2).toBeTruthy();
      expect(etag1).not.toBe(etag2);
    });

    it("should produce a different ETag when the same note is viewed under a different role", async () => {
      const ownerNote = createMockNote();
      const viewerNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "public" });
      const { app } = createTestApp([
        // Owner GET
        [ownerNote],
        [], // pages
        // Guest GET on a different (public) note id
        [viewerNote], // findActiveNoteById
        [], // member check
        [], // domain access check
        [], // viewCount update
        [], // pages query
      ]);

      const resOwner = await app.request(`/api/notes/${ownerNote.id}`, {
        headers: authHeaders(),
      });
      const etagOwner = resOwner.headers.get("ETag");

      const resGuest = await app.request(`/api/notes/${viewerNote.id}`, {
        headers: authHeaders(),
      });
      const etagGuest = resGuest.headers.get("ETag");

      expect(etagOwner).toBeTruthy();
      expect(etagGuest).toBeTruthy();
      // 異なるロール (owner vs guest) + 異なる note は別 ETag になる。
      // Different role (and different note id) must yield distinct ETags.
      expect(etagOwner).not.toBe(etagGuest);
    });

    it("should ignore a stale If-None-Match and return 200 with a fresh body", async () => {
      const mockNote = createMockNote();
      const mockPage = createMockPageRow();
      const { app } = createTestApp([[mockNote], [mockPage]]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: { ...authHeaders(), "If-None-Match": 'W/"definitely-stale"' },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("id", mockNote.id);
      expect(res.headers.get("ETag")).toBeTruthy();
    });
  });
});

// ── GET /api/notes ──────────────────────────────────────────────────────────

describe("GET /api/notes", () => {
  it("should return a flat array with role, page_count, member_count", async () => {
    const note1 = createMockNote({ id: "note-1", title: "Note 1" });
    const note2 = createMockNote({ id: "note-2", title: "Note 2" });

    const { app } = createTestApp([
      [note1, note2], // own notes
      [], // member data (no shared notes)
      [
        { noteId: "note-1", count: 3 },
        { noteId: "note-2", count: 1 },
      ], // page counts
      [
        { noteId: "note-1", count: 2 },
        { noteId: "note-2", count: 1 },
      ], // member counts
    ]);

    const res = await app.request("/api/notes", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    expect(body[0]).toBeDefined();
    const first = body[0] as Record<string, unknown>;
    expect(first).toHaveProperty("role", "owner");
    expect(first).toHaveProperty("page_count");
    expect(typeof first.page_count).toBe("number");
    expect(first).toHaveProperty("member_count");
    expect(typeof first.member_count).toBe("number");
    expect(first).toHaveProperty("owner_id");
    expect(first).toHaveProperty("edit_permission");
  });

  it("should return 401 without auth", async () => {
    const { app } = createTestApp([]);
    const res = await app.request("/api/notes");
    expect(res.status).toBe(401);
  });
});

// ── GET /api/notes/discover ─────────────────────────────────────────────────

describe("GET /api/notes/discover", () => {
  it("should allow unauthenticated access and return { official, notes }", async () => {
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
      [], // page counts query
    ]);

    const res = await app.request("/api/notes/discover");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { official: unknown[]; notes: unknown[] };
    expect(body).toHaveProperty("official");
    expect(body).toHaveProperty("notes");
    expect(Array.isArray(body.official)).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);
    expect(body.official).toHaveLength(1);
    expect(body.notes).toHaveLength(0);
  });

  it("should include owner info and page_count in each item", async () => {
    const publicNote = createMockNote({
      id: "note-pub",
      visibility: "public",
      isOfficial: false,
      ownerId: OTHER_USER_ID,
    });
    const mockOwner = {
      id: OTHER_USER_ID,
      displayName: "Author",
      avatarUrl: "https://example.com/avatar.png",
    };

    const { app } = createTestApp([
      [publicNote], // notes query
      [mockOwner], // users query
      [{ noteId: "note-pub", count: 5 }], // page counts
    ]);

    const res = await app.request("/api/notes/discover");
    const body = (await res.json()) as { official: unknown[]; notes: Record<string, unknown>[] };

    const item = body.notes[0];
    expect(item).toBeDefined();
    expect(item).toHaveProperty("owner_display_name", "Author");
    expect(item).toHaveProperty("owner_avatar_url", "https://example.com/avatar.png");
    expect(item).toHaveProperty("page_count", 5);
    expect(item).toHaveProperty("edit_permission");
  });
});
