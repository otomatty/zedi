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
  createTestApp,
  authHeaders,
} from "./setup.js";
import { ifNoneMatchMatches } from "../../../routes/notes/crud.js";

/**
 * `GET /api/notes/:id` の ETag 計算で叩く
 * `MAX(pages.updated_at) + COUNT(*)` 集約クエリのモック行。
 *
 * Mock row for the pages-signal aggregate query that `GET /api/notes/:id`
 * runs while computing the ETag (Issue #853).
 */
function mockPagesSignal(maxUpdatedAt: Date | null = null, count = 0) {
  return [{ maxUpdatedAt, count }];
}

/**
 * `pg` ドライバが `timestamptz` を Date ではなく ISO 文字列のまま返してくる
 * 本番挙動を再現するためのモック。Issue #857 (PR #856 regression) で観測された
 * ケース: drizzle の `sql<Date | null>` テンプレートタグは型ヒントだけで、
 * ランタイムでは string がそのまま素通しされうる。
 *
 * Mocks the pg driver path where `timestamptz` aggregates arrive as raw ISO
 * strings instead of `Date` instances (Issue #857 / PR #856 regression).
 * drizzle's `sql<Date | null>` template tag is compile-time only and does
 * not decode the driver value, so the production runtime occasionally yields
 * a string here.
 */
function mockPagesSignalRaw(maxUpdatedAt: string | null = null, count = 0) {
  return [{ maxUpdatedAt, count }];
}

// ── ifNoneMatchMatches (Issue #853, PR #856 review) ─────────────────────────

describe("ifNoneMatchMatches", () => {
  const etag = 'W/"abc123"';

  it("returns false for missing header", () => {
    expect(ifNoneMatchMatches(undefined, etag)).toBe(false);
    expect(ifNoneMatchMatches("", etag)).toBe(false);
  });

  it("matches exact weak ETag", () => {
    expect(ifNoneMatchMatches('W/"abc123"', etag)).toBe(true);
  });

  it("matches when header omits the W/ prefix (weak comparison)", () => {
    expect(ifNoneMatchMatches('"abc123"', etag)).toBe(true);
  });

  it("matches case-insensitively on the W/ prefix", () => {
    expect(ifNoneMatchMatches('w/"abc123"', etag)).toBe(true);
  });

  it("matches one tag in a comma-separated list", () => {
    expect(ifNoneMatchMatches('W/"other", W/"abc123", W/"foo"', etag)).toBe(true);
  });

  it("matches the wildcard `*`", () => {
    expect(ifNoneMatchMatches("*", etag)).toBe(true);
    expect(ifNoneMatchMatches("  *  ", etag)).toBe(true);
  });

  it("does not match a different ETag", () => {
    expect(ifNoneMatchMatches('W/"different"', etag)).toBe(false);
  });

  it("ignores empty tokens in a list", () => {
    expect(ifNoneMatchMatches(', ,W/"abc123",', etag)).toBe(true);
    expect(ifNoneMatchMatches(", ,", etag)).toBe(false);
  });
});

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
  it("should return a flat note shell without pages[] (Issue #860 Phase 6)", async () => {
    // Issue #860 Phase 6: ノートシェルから `pages[]` を撤去した。一覧表示は
    // `GET /api/notes/:noteId/pages` (cursor pagination) を、wiki link / AI
    // chat scope のような全ページタイトルが必要な経路は
    // `GET /api/notes/:noteId/page-titles` を使う。
    //
    // Issue #860 Phase 6: the note shell no longer carries `pages[]`. UI
    // page lists fetch from the cursor-paginated `/pages` endpoint, and
    // full-set title consumers fetch from `/page-titles`.
    const mockNote = createMockNote();

    const { app } = createTestApp([
      [mockNote], // getNoteRole → findActiveNoteById (owner)
      mockPagesSignal(new Date("2026-01-01T00:00:00Z"), 1), // ETag pages signal
    ]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty("id", mockNote.id);
    expect(body).not.toHaveProperty("note");
    expect(body).toHaveProperty("current_user_role", "owner");
    expect(body).not.toHaveProperty("pages");
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
      mockPagesSignal(), // ETag pages signal
      [], // viewCount update (fire-and-forget)
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
      mockPagesSignal(), // ETag pages signal
      [], // viewCount update (fire-and-forget)
    ]);

    const res = await app.request("/api/notes/note-public");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.current_user_role).toBe("guest");
  });

  it("should not include pages[] on the note shell response", async () => {
    // Phase 6 で `pages[]` を撤去した契約を明示的に固定する。consumer 側で
    // 残存フィールド読み取りを誤って復活させないためのガードでもある。
    //
    // Lock down the Phase 6 contract: no `pages[]` field appears on the note
    // shell. Also guards against a future regression that re-introduces the
    // field for a single consumer.
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote],
      mockPagesSignal(new Date("2026-01-01T00:00:00Z"), 3),
    ]);

    const res = await app.request(`/api/notes/${mockNote.id}`, {
      headers: authHeaders(),
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("pages");
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
      const { app } = createTestApp([
        [mockNote],
        mockPagesSignal(new Date("2026-01-01T00:00:00Z"), 1),
      ]);

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
      const updatedAt = new Date("2026-01-01T00:00:00Z");
      const { app, chains } = createTestApp([
        [mockNote], // first request: getNoteRole
        mockPagesSignal(updatedAt, 1), // first request: ETag pages signal
        [mockNote], // second request: getNoteRole
        mockPagesSignal(updatedAt, 1), // second request: ETag pages signal
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
      // 304 経路で消費するのは getNoteRole + pages signal の 2 件のみ。
      // viewCount UPDATE はスキップされる（Phase 6 で pages 本体クエリは
      // そもそも note shell から消えたため、200 経路でも走らない）。
      //
      // Only role resolution + pages signal aggregate run on the 304 path;
      // the viewCount update is skipped. The pages list query was removed
      // from the note shell entirely in Phase 6, so it does not run on
      // either path.
      expect(chains.length - chainsBefore).toBe(2);
    });

    it("should produce a different ETag after note.updatedAt changes", async () => {
      const firstNote = createMockNote({ updatedAt: new Date("2026-01-01T00:00:00Z") });
      const updatedNote = createMockNote({ updatedAt: new Date("2026-02-15T12:34:56Z") });
      const { app } = createTestApp([
        [firstNote],
        mockPagesSignal(), // ETag pages signal
        [updatedNote],
        mockPagesSignal(), // ETag pages signal
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

    it("should bust client caches across the v2 → v3 response shape change (Issue #860 Phase 6)", async () => {
      // Phase 6 で note shell から pages[] を撤去するのに合わせて
      // RESPONSE_VERSION を v2 → v3 に bump した。古い v2 ETag を `If-None-Match`
      // に乗せて来たクライアントが 304 で旧 body を再利用しないことを確認する。
      // 同じ note row / pages signal でも、version が違えば ETag は別物になる。
      //
      // Phase 6 bumped RESPONSE_VERSION from v2 to v3 alongside dropping
      // `pages[]`. A client cached on the v2 wire shape must not get a 304
      // back for its stale `If-None-Match` validator, otherwise it would
      // revive the obsolete body. The version salt makes the ETag diverge
      // even when the note row and pages signal are identical.
      const mockNote = createMockNote();
      const updatedAt = new Date("2026-01-01T00:00:00Z");
      const { app } = createTestApp([[mockNote], mockPagesSignal(updatedAt, 1)]);

      // v2 era の ETag を完全な憶測としてではなく、現行 (v3) 経路から外れる
      // ことだけを保証したいので、明らかに別 hash を `If-None-Match` に流す。
      // The exact v2 hash is irrelevant — we only need to prove that a
      // foreign validator does not match the v3 ETag, so any well-formed
      // weak ETag works as a stand-in for "what an old client cached".
      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: { ...authHeaders(), "If-None-Match": 'W/"v2-cached-hash"' },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("id", mockNote.id);
      expect(body).not.toHaveProperty("pages");
      expect(res.headers.get("ETag")).toMatch(/^W\/".+"$/);
    });

    it("should produce a different ETag when the same note row is viewed under a different role", async () => {
      // PR #856 review (CodeRabbit minor): role が ETag に効いていることを示すには、
      // 同一の note row を異なる auth 文脈で取得して比較する必要がある。
      // 異なる note id 同士の比較では noteId だけで ETag が変わるため、
      // role を `makeNoteETag` から外しても test が通ってしまう。
      //
      // To verify the role actually contributes to the ETag we must read the
      // *same* note row under two different auth contexts. Comparing distinct
      // note ids would still pass even if `role` were dropped from the hash
      // because `noteId` alone differentiates them.
      const sharedPublicNote = createMockNote({
        id: "note-shared",
        // ownerId は createMockNote のデフォルト (TEST_USER_ID) なので、
        // authHeaders() を付けたリクエストはオーナーとして扱われる。
        // ownerId stays at the default `TEST_USER_ID`, so a request with
        // `authHeaders()` resolves to the owner.
        visibility: "public",
      });
      const pagesSignal = mockPagesSignal(new Date("2026-01-01T00:00:00Z"), 3);

      const { app } = createTestApp([
        // First GET: authed user is the OWNER (single role-resolution query)
        [sharedPublicNote],
        pagesSignal,
        // Second GET: anonymous viewer → guest role on the SAME note row.
        // No userEmail → getNoteRole skips member/domain checks for guests.
        [sharedPublicNote],
        pagesSignal,
        [], // viewCount update (fire-and-forget, runs only for non-owner)
      ]);

      const resOwner = await app.request(`/api/notes/${sharedPublicNote.id}`, {
        headers: authHeaders(),
      });
      const resGuest = await app.request(`/api/notes/${sharedPublicNote.id}`);

      const etagOwner = resOwner.headers.get("ETag");
      const etagGuest = resGuest.headers.get("ETag");

      expect(etagOwner).toBeTruthy();
      expect(etagGuest).toBeTruthy();
      // Same note row + same pages signal → only `role` differs. ETags must
      // still diverge, which proves role is mixed into the hash.
      expect(etagOwner).not.toBe(etagGuest);
    });

    it("should change ETag when a page is edited even if notes.updated_at is unchanged", async () => {
      // Codex P1 (#856 review): ページ単体編集 (Hocuspocus 経由の本文保存・
      // `PUT /api/pages/:id` 等) で `notes.updated_at` が動かなくても、ETag は
      // 変わるべき。pages signal (MAX(updated_at), COUNT) を ETag のハッシュ
      // 入力に混ぜることで保証する。
      //
      // Codex P1 (#856 review): editing a page via routes that do not bump
      // `notes.updated_at` (Hocuspocus-driven content saves, title renames via
      // `PUT /api/pages/:id`) must still shift the ETag. Verified by sending
      // the same note row twice with different `MAX(pages.updated_at)` values.
      const mockNote = createMockNote();
      const { app } = createTestApp([
        [mockNote],
        mockPagesSignal(new Date("2026-01-01T00:00:00Z"), 1),
        [mockNote],
        mockPagesSignal(new Date("2026-03-10T08:00:00Z"), 1),
      ]);

      const res1 = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });
      const res2 = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });

      const etag1 = res1.headers.get("ETag");
      const etag2 = res2.headers.get("ETag");
      expect(etag1).toBeTruthy();
      expect(etag2).toBeTruthy();
      expect(etag1).not.toBe(etag2);
    });

    it("should return 304 when If-None-Match is a list and one entry matches", async () => {
      // RFC 7232 §3.2: 複数バリデータがカンマ区切りで送られるケース。1 件でも
      // 現在の ETag に一致すれば 304 を返さなければならない（PR #856
      // CodeRabbit nitpick: クライアントが正規化・列挙してくる場合に備える）。
      //
      // RFC 7232 §3.2: clients may send a comma-separated list of validators
      // and the server must 304 if any one of them matches the current ETag.
      const mockNote = createMockNote();
      const updatedAt = new Date("2026-01-01T00:00:00Z");
      const { app } = createTestApp([
        [mockNote],
        mockPagesSignal(updatedAt, 1),
        [mockNote],
        mockPagesSignal(updatedAt, 1),
      ]);

      const res1 = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });
      const etag = res1.headers.get("ETag");
      if (!etag) throw new Error("ETag header missing");

      const res2 = await app.request(`/api/notes/${mockNote.id}`, {
        headers: {
          ...authHeaders(),
          "If-None-Match": `W/"stale-1", ${etag}, W/"stale-2"`,
        },
      });

      expect(res2.status).toBe(304);
    });

    it("should return 304 when If-None-Match is the wildcard `*`", async () => {
      const mockNote = createMockNote();
      const { app } = createTestApp([[mockNote], mockPagesSignal()]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: { ...authHeaders(), "If-None-Match": "*" },
      });

      expect(res.status).toBe(304);
    });

    it("should ignore a stale If-None-Match and return 200 with a fresh body", async () => {
      const mockNote = createMockNote();
      const { app } = createTestApp([
        [mockNote],
        mockPagesSignal(new Date("2026-01-01T00:00:00Z"), 1),
      ]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: { ...authHeaders(), "If-None-Match": 'W/"definitely-stale"' },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("id", mockNote.id);
      expect(res.headers.get("ETag")).toBeTruthy();
    });

    // ── Issue #857 (PR #856 regression) ────────────────────────────────
    // drizzle の `sql<Date | null>`MAX(...)`` は型ヒントだけで、本番の pg
    // ドライバ経路では集約値が ISO 文字列のまま返ってくる場合がある。修正前は
    // `makeNoteETag` 内の `.getTime()` が落ちて 500 になっていた。
    // 修正は (A) query 側で `.mapWith()` により Date 化、(B) ETag ヘルパー側で
    // `Date | string | null` を受けて defensive に正規化、の二段構え。
    //
    // drizzle's `sql<Date | null>`MAX(...)`` is compile-time only and the pg
    // driver path can yield the aggregate as a raw ISO string. Pre-fix code
    // threw `TypeError` inside `makeNoteETag` and returned 500. The fix has
    // two layers: (A) the query coerces via `.mapWith()`, and (B) the ETag
    // helper defensively accepts `Date | string | null`.
    it("should compute ETag without throwing when MAX(pages.updated_at) is returned as a string (Issue #857)", async () => {
      const mockNote = createMockNote();
      const { app } = createTestApp([
        [mockNote],
        mockPagesSignalRaw("2026-01-01T00:00:00.000Z", 1),
      ]);

      const res = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("ETag")).toMatch(/^W\/".+"$/);
    });

    it("should produce the same ETag whether MAX(pages.updated_at) is a Date or an ISO string (Issue #857)", async () => {
      // 同一の瞬間を `Date` で渡したケースと `string` で渡したケースで
      // ETag が一致することを確認する。境界正規化が effective であることの確認。
      // Verifies that the boundary normalization renders driver representation
      // irrelevant: the same instant must hash to the same ETag whether the
      // mock yields a `Date` or an ISO string.
      const mockNote = createMockNote();
      const sameInstant = new Date("2026-01-01T00:00:00.000Z");
      const { app } = createTestApp([
        [mockNote],
        mockPagesSignal(sameInstant, 1),
        [mockNote],
        mockPagesSignalRaw("2026-01-01T00:00:00.000Z", 1),
      ]);

      const resDate = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });
      const resString = await app.request(`/api/notes/${mockNote.id}`, {
        headers: authHeaders(),
      });

      const etagDate = resDate.headers.get("ETag");
      const etagString = resString.headers.get("ETag");
      expect(etagDate).toBeTruthy();
      expect(etagString).toBeTruthy();
      expect(etagDate).toBe(etagString);
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
