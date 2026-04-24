/**
 * GET /api/notes/:noteId/search のテスト (Issue #718 Phase 5-2)。
 * Tests for the note-scoped search endpoint (Issue #718 Phase 5-2).
 *
 * Phase 1〜4 で個人 / ノートネイティブページの分離が入り、Phase 5-1 で
 * `/api/search?scope=own` に `p.note_id IS NULL` を強制した。Phase 5-2 では
 * 逆向きに「このノート内だけを検索する」エンドポイントを追加し、閲覧権限は
 * 既存 `getNoteRole` / `note_members` / `visibility` で解決する。
 *
 * Phase 5-2 introduces a note-scoped search counterpart so agents and the UI
 * can ask "only search this note" without leaking across scopes. Permissions
 * reuse `getNoteRole`, which already consults `note_members`, domain rules and
 * visibility.
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
  createTestApp,
  authHeaders,
} from "./setup.js";

const NOTE_ID = "note-test-001";

describe("GET /api/notes/:noteId/search", () => {
  it("returns 401 without auth header", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, { method: "GET" });

    expect(res.status).toBe(401);
  });

  it("returns empty results when q is missing (no search executed)", async () => {
    // q が無いときはロール解決も検索 SQL も走らせない（安価なガード）。
    // Cheap guard: skip role resolution and the search SQL when q is absent.
    const { app, chains } = createTestApp([]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    // 空クエリでは DB を一切叩かない。
    // No DB hits at all for an empty query.
    expect(chains).toHaveLength(0);
  });

  it("returns 404 when the note does not exist", async () => {
    const { app } = createTestApp([
      [], // findActiveNoteById → empty
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when caller has no role on a private note", async () => {
    // 非公開ノート + メンバーでもドメイン一致でもない → `role = null` で 403。
    // Private note, no member / domain match → `role = null`, hence 403.
    const privateNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app, chains } = createTestApp([
      [privateNote], // findActiveNoteById
      [], // member check
      [], // domain access
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
    // 403 では検索 SQL を実行してはならない（情報漏洩防止）。
    // The search SQL must not run on a 403 (avoid side-channel leaks).
    expect(chains.some((c) => c.startMethod === "execute")).toBe(false);
  });

  it("restricts SQL to pages joined via note_pages for this noteId", async () => {
    // ノートスコープ: `note_pages.note_id = :noteId` の inner join で絞り込み、
    // 他ノートや個人 /home のページが混ざらないことを SQL レベルで担保する。
    // Scope guard at the SQL layer: inner join through `note_pages` with
    // `note_id = :noteId` so pages from other notes (or personal /home) cannot
    // leak into the results.
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner
      { rows: [] }, // execute search
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("note_pages");
    expect(serialised).toContain("np.note_id");
    // SELECT 句に p.note_id を含め、呼び出し側がネイティブ / リンク済み個人ページを
    // 見分けられるようにする (Phase 5 契約)。
    // Expose `p.note_id` so callers can tell note-native vs linked personal.
    expect(serialised).toContain("p.note_id");
    // ILIKE による全文検索パターンが使われていること。
    // ILIKE search uses the escaped pattern.
    expect(serialised).toContain("ILIKE");
  });

  it("allows search for a viewer member of a private note", async () => {
    // メンバーシップが解決できれば private ノートでも検索可能。
    // Any resolved member role allows searching, even on a private note.
    const privateNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app, chains } = createTestApp([
      [privateNote], // findActiveNoteById
      [{ role: "viewer" }], // member check matches
      { rows: [] }, // execute search
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    expect(chains.some((c) => c.startMethod === "execute")).toBe(true);
  });

  it("allows guest search on a public note", async () => {
    // 公開ノートは `guest` ロールとして解決されるため、認証済みの非メンバーでも
    // 検索できる（閲覧できる以上、検索も許可する）。
    // Public notes resolve the caller to `guest`; since they can already read,
    // they are allowed to search. Mirrors `GET /:noteId/pages` semantics.
    const publicNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "public" });
    const { app } = createTestApp([
      [publicNote], // findActiveNoteById
      [], // member check
      [], // domain access → empty, falls through to visibility=public → guest
      { rows: [] }, // execute search
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
  });

  it("response rows carry note_id so callers can verify scope", async () => {
    // ノートスコープ検索でも `note_id` を露出させる (Phase 5 契約)。リンクされた
    // 個人ページ（`note_id IS NULL`）と、このノートのネイティブページ（`note_id`
    // = :noteId）を UI 側で見分けるための判定材料。
    //
    // Expose `note_id` on every row even for the note-scoped endpoint, so UI and
    // MCP callers can still tell a linked personal page (`note_id: null`) apart
    // from a note-native page (`note_id: NOTE_ID`). This matches the Phase 5
    // scope contract shared with `/api/search`.
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole → owner
      {
        rows: [
          {
            id: "page-native",
            title: "Native Page",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: NOTE_ID,
          },
          {
            id: "page-linked-personal",
            title: "Linked Personal",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: null,
          },
        ],
      },
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toHaveProperty("note_id", NOTE_ID);
    expect(body.results[1]).toHaveProperty("note_id", null);
  });

  it("honors limit query parameter (clamped between 1 and 100)", async () => {
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner
      { rows: [] }, // execute search
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&limit=500`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    // 500 を渡しても最大 100 にクランプされる。
    // Request for 500 is clamped to the 100 upper bound.
    expect(serialised).toContain("100");
    expect(serialised).not.toContain("500");
  });

  it("falls back to the default limit when the value is non-numeric", async () => {
    // `?limit=abc` → `Number("abc") = NaN` を素通しすると `LIMIT NaN` で
    // SQL が 500 になる。非数値は黙って既定値 20 に落として、クエリが壊れた
    // クライアントでもエラーにならないようにする。
    //
    // `?limit=abc` would previously flow through as `NaN`, breaking the SQL
    // with `LIMIT NaN` and 500-ing the request. Non-numeric input must fall
    // back to the default 20 so a malformed client query stays safe.
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner
      { rows: [] }, // execute search
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&limit=abc`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).not.toContain("NaN");
    expect(serialised).toContain("20");
  });

  it("truncates fractional limits to an integer before clamping", async () => {
    // 小数（`?limit=99.7`）がバインドされると Postgres の LIMIT は整数必須で
    // クエリが落ちる可能性がある。`Math.trunc` で整数化してから範囲に収める。
    // 既定値 20 への安易なフォールバックにすり替わっても検出できるよう、
    // 結果側に truncate 後の値 (99) が確かに出ていることまで検証する。
    //
    // Postgres `LIMIT` requires an integer, so a fractional value could error
    // out at the DB layer. Truncate before clamping to keep it a safe integer.
    // Positively assert the truncated value (99) lands in the query so a
    // silent fallback to the default 20 would be caught.
    const mockNote = createMockNote();
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner
      { rows: [] }, // execute search
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&limit=99.7`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    // 小数部は破棄され、整数の 99 が LIMIT に渡る。
    // Fractional part is dropped; integer 99 lands in LIMIT.
    expect(serialised).toContain("99");
    expect(serialised).not.toContain("99.7");
    // 既定値 20 へのフォールバックになっていないことも併せて確認する。
    // Also assert no silent fallback to the default 20.
    expect(serialised).not.toContain("20");
  });

  it("passes noteId into the WHERE clause so the scope cannot be bypassed", async () => {
    // URL に入ってきた noteId が SQL パラメータとして渡され、別ノートの
    // ページが混ざるような自由なクエリビルドになっていないことを確認する。
    // Confirm the URL `noteId` flows into the SQL parameters so the scope
    // cannot be flipped via query rewriting.
    const mockNote = createMockNote({ id: NOTE_ID });
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner
      { rows: [] }, // execute search
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(TEST_USER_ID),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain(NOTE_ID);
  });
});
