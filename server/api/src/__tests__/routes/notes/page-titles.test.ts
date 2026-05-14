/**
 * `GET /api/notes/:noteId/page-titles` のテスト（Issue #860 Phase 6）。
 *
 * Tests for `GET /api/notes/:noteId/page-titles` (Issue #860 Phase 6).
 *
 * Phase 6 では note shell から `pages[]` を撤去するのに合わせ、wiki link や
 * AI chat scope が必要とする「ノート全ページの id / title / is_deleted /
 * updated_at」だけを返す軽量エンドポイントを追加する。
 *
 * Phase 6 drops `pages[]` from the note shell response, so wiki-link and
 * AI-chat scopes need a lightweight endpoint that returns only
 * `id / title / is_deleted / updated_at` for every page in the note.
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

/**
 * `pages` テーブルから `id / title / is_deleted / updated_at` のみを返す
 * モック行を組み立てる。
 *
 * Builds a mock row matching the `id / title / is_deleted / updated_at`
 * shape selected by the page-titles route.
 */
function buildTitleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pg-1",
    title: "First",
    isDeleted: false,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/**
 * `MAX(updated_at) + COUNT(*)` 集約クエリのモック結果（ETag 用）。
 *
 * Mock row for the `MAX(updated_at) + COUNT(*)` aggregate (used by the ETag).
 */
function mockTitlesSignal(maxUpdatedAt: Date | null = null, count = 0) {
  return [{ maxUpdatedAt, count }];
}

describe("GET /api/notes/:noteId/page-titles", () => {
  it("returns items with id/title/is_deleted/updated_at for the owner", async () => {
    const mockNote = createMockNote();
    const row1 = buildTitleRow({ id: "pg-1", title: "First" });
    const row2 = buildTitleRow({
      id: "pg-2",
      title: "Second",
      updatedAt: new Date("2026-02-01T00:00:00Z"),
    });
    const { app } = createTestApp([
      [mockNote], // getNoteRole → findActiveNoteById (owner)
      mockTitlesSignal(row2.updatedAt as Date, 2), // ETag signal
      [row1, row2], // titles query
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: "pg-1",
      title: "First",
      is_deleted: false,
    });
    expect(body.items[0]).toHaveProperty("updated_at");
    // 余計なフィールドを返さないことを確認する（payload を最小限に保つ契約）。
    // Payload contract: only the four documented fields are returned.
    expect(body.items[0]).not.toHaveProperty("content_preview");
    expect(body.items[0]).not.toHaveProperty("thumbnail_url");
    expect(body.items[0]).not.toHaveProperty("owner_id");
  });

  it("allows guest access on public notes (authOptional)", async () => {
    // 公開ノートでは未ログインの guest でも title-index を取得できる。
    // wiki link UI が公開ノート閲覧時にも動作するための前提。
    //
    // Public visibility lets unauthenticated callers fetch the title index so
    // wiki-link and AI-chat features keep working when viewing a public note.
    const publicNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "public" });
    const row = buildTitleRow();
    const { app } = createTestApp([
      [publicNote], // getNoteRole
      mockTitlesSignal(row.updatedAt as Date, 1),
      [row],
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/page-titles`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("returns 404 when the note does not exist", async () => {
    const { app } = createTestApp([
      [], // getNoteRole → findActiveNoteById → null
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when caller has no role on a private note", async () => {
    const privateNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([
      [privateNote], // getNoteRole → findActiveNoteById
      [], // member check
      [], // domain access check
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
      headers: authHeaders(TEST_USER_ID, TEST_USER_EMAIL),
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 when private note is accessed unauthenticated", async () => {
    const privateNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([[privateNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/page-titles`);

    // authOptional + getNoteRole: anon ユーザーは role が解決しないので 403。
    // 一貫性のため、`/pages` (Phase 1) と同じく 403 を返す。
    //
    // authOptional + getNoteRole: anon callers resolve no role, so 403 (same
    // semantics as `/pages` from Phase 1).
    expect(res.status).toBe(403);
  });

  describe("ETag / 304", () => {
    it("includes a weak ETag and revalidation headers on 200", async () => {
      const mockNote = createMockNote();
      const row = buildTitleRow();
      const { app } = createTestApp([
        [mockNote],
        mockTitlesSignal(row.updatedAt as Date, 1),
        [row],
      ]);

      const res = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("ETag")).toMatch(/^W\/".+"$/);
      expect(res.headers.get("Cache-Control")).toContain("private");
      expect(res.headers.get("Vary")).toContain("Cookie");
    });

    it("returns 304 when If-None-Match matches and skips the title query", async () => {
      const mockNote = createMockNote();
      const row = buildTitleRow();
      const { app, chains } = createTestApp([
        [mockNote], // request 1: getNoteRole
        mockTitlesSignal(row.updatedAt as Date, 1), // request 1: signal
        [row], // request 1: title query
        [mockNote], // request 2: getNoteRole
        mockTitlesSignal(row.updatedAt as Date, 1), // request 2: signal
      ]);

      const res1 = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
        headers: authHeaders(),
      });
      const etag = res1.headers.get("ETag");
      if (!etag) throw new Error("ETag missing");

      const chainsBefore = chains.length;
      const res2 = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
        headers: { ...authHeaders(), "If-None-Match": etag },
      });

      expect(res2.status).toBe(304);
      expect(await res2.text()).toBe("");
      // 304 経路は role 解決 + signal 集約のみで、title 本体クエリはスキップ。
      // 304 path: only role resolution + signal aggregate run; the title query is skipped.
      expect(chains.length - chainsBefore).toBe(2);
    });

    it("changes ETag when MAX(updated_at) shifts even if note row is unchanged", async () => {
      const mockNote = createMockNote();
      const { app } = createTestApp([
        [mockNote],
        mockTitlesSignal(new Date("2026-01-01T00:00:00Z"), 1),
        [],
        [mockNote],
        mockTitlesSignal(new Date("2026-03-10T08:00:00Z"), 1),
        [],
      ]);

      const res1 = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
        headers: authHeaders(),
      });
      const res2 = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
        headers: authHeaders(),
      });

      expect(res1.headers.get("ETag")).toBeTruthy();
      expect(res2.headers.get("ETag")).toBeTruthy();
      expect(res1.headers.get("ETag")).not.toBe(res2.headers.get("ETag"));
    });

    it("changes ETag when count shifts (page added or hard-deleted)", async () => {
      const mockNote = createMockNote();
      const sameTs = new Date("2026-01-01T00:00:00Z");
      const { app } = createTestApp([
        [mockNote],
        mockTitlesSignal(sameTs, 1),
        [],
        [mockNote],
        mockTitlesSignal(sameTs, 2),
        [],
      ]);

      const res1 = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
        headers: authHeaders(),
      });
      const res2 = await app.request(`/api/notes/${NOTE_ID}/page-titles`, {
        headers: authHeaders(),
      });

      expect(res1.headers.get("ETag")).not.toBe(res2.headers.get("ETag"));
    });
  });
});
