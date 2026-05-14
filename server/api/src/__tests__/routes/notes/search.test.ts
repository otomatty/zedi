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
  it("returns 403 (not 401) for an unauthenticated request to a private note (Issue #860 Phase 5)", async () => {
    // Issue #860 Phase 5 で `authRequired` → `authOptional` + `getNoteRole` に
    // 変えた。匿名アクセスで private ノートを叩くと、role が解決しないため 403
    // を返す（公開 / unlisted は guest として 200 になる別ケース）。
    //
    // Issue #860 Phase 5 switched the route to `authOptional` + `getNoteRole`,
    // so anon callers no longer hit the auth middleware's blanket 401. They
    // instead reach role resolution, which returns no role on a private note
    // → 403 (public / unlisted resolve to `guest` and return 200; covered
    // separately).
    const privateNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([
      [privateNote], // findActiveNoteById
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, { method: "GET" });

    expect(res.status).toBe(403);
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
    const body = (await res.json()) as { results: unknown[]; next_cursor: string | null };
    expect(body.results).toEqual([]);
    expect(body.next_cursor).toBeNull();
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

  it("restricts SQL to pages where p.note_id matches path noteId (issue #823)", async () => {
    // ノートスコープ: `pages.note_id = :noteId` で直接フィルタする（note_pages 廃止）。
    // Scope guard: filter `pages.note_id` to the path param (`note_pages` removed).
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
    expect(serialised).not.toContain("note_pages");
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
            updated_at_iso: "2026-04-01T00:00:00.000000Z",
          },
          {
            id: "page-linked-personal",
            title: "Linked Personal",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: null,
            updated_at_iso: "2026-04-01T00:00:00.000000Z",
          },
        ],
      },
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<Record<string, unknown>>;
      next_cursor: string | null;
    };
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toHaveProperty("note_id", NOTE_ID);
    expect(body.results[1]).toHaveProperty("note_id", null);
    // Issue #860 Phase 5: cursor は内部 helper フィールドなので公開レスポンスに
    // 漏らさないことを確認する（payload を肥大化させないための契約）。
    // Issue #860 Phase 5: the cursor-helper `updated_at_iso` is internal and
    // must not leak into the public response.
    expect(body.results[0]).not.toHaveProperty("updated_at_iso");
    expect(body.next_cursor).toBeNull();
  });

  it("honors limit query parameter (clamped between 1 and 100)", async () => {
    // Issue #860 Phase 5: cursor pagination 用に `limit + 1` 件取得するため、
    // `?limit=500` (clamp して 100) は SQL 上は `LIMIT 101` になる。500 が
    // どこにも現れないことと、clamp 後の整数 (100 または 101) のいずれかが
    // 出ていることを確認する。
    //
    // Issue #860 Phase 5: the route fetches `limit + 1` to detect whether a
    // `next_cursor` is needed, so a request clamped to 100 lands as
    // `LIMIT 101`. Assert the original 500 never appears and the clamped
    // value (100) or its `+1` (101) is present.
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
    expect(serialised).not.toContain("500");
    expect(/\b101\b/.test(serialised)).toBe(true);
  });

  it("falls back to the default limit when the value is non-numeric", async () => {
    // `?limit=abc` → `Number("abc") = NaN` を素通しすると `LIMIT NaN` で
    // SQL が 500 になる。非数値は黙って既定値 20 に落として、クエリが壊れた
    // クライアントでもエラーにならないようにする。Issue #860 Phase 5 で
    // `limit + 1` 取得になった後でも、20 → SQL 21 で同じガード契約を維持。
    //
    // `?limit=abc` would previously flow through as `NaN`, breaking the SQL
    // with `LIMIT NaN` and 500-ing the request. Non-numeric input must fall
    // back to the default 20 so a malformed client query stays safe. After
    // Issue #860 Phase 5 added the `limit + 1` fetch the SQL value is 21.
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
    // limit + 1 = 21 が SQL に渡る。
    // limit + 1 = 21 lands in the SQL.
    expect(/\b21\b/.test(serialised)).toBe(true);
  });

  it("truncates fractional limits to an integer before clamping", async () => {
    // 小数（`?limit=99.7`）がバインドされると Postgres の LIMIT は整数必須で
    // クエリが落ちる可能性がある。`Math.trunc` で整数化してから範囲に収める。
    // Issue #860 Phase 5 で `limit + 1` 取得になった後は SQL 値 100 を期待する
    // （99.7 → 99 → +1 = 100）。
    //
    // Postgres `LIMIT` requires an integer, so a fractional value could error
    // out at the DB layer. Truncate before clamping to keep it a safe integer.
    // After Issue #860 Phase 5's `limit + 1` fetch, the SQL value is 100
    // (99.7 → 99 → +1).
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
    expect(serialised).not.toContain("99.7");
    // limit + 1 = 100 が SQL に渡る。
    // limit + 1 = 100 lands in the SQL.
    expect(/\b100\b/.test(serialised)).toBe(true);
  });

  it("emits next_cursor when more rows are available than the requested limit (Issue #860 Phase 5)", async () => {
    // limit + 1 件返ってきたときに next_cursor を発行し、最後の表示行の
    // (updated_at, id) を base64url で返す。pg `to_char(...)` の値を保持して
    // いるのでマイクロ秒精度が失われない。
    //
    // The route requests `limit + 1` rows; if all `limit + 1` come back the
    // last visible row's `(updated_at, id)` becomes the `next_cursor`. The
    // value comes from pg `to_char(...)` so microsecond precision survives.
    const mockNote = createMockNote();
    const microIso = "2026-04-01T12:34:56.123456Z";
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
      title: `Result ${i}`,
      content_preview: null,
      updated_at: new Date(microIso).toISOString(),
      note_id: NOTE_ID,
      content_text: null,
      updated_at_iso: microIso,
    }));
    const { app } = createTestApp([
      [mockNote], // getNoteRole → owner
      { rows }, // execute search returns limit+1 = 3 rows for limit=2
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&limit=2`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ id: string }>;
      next_cursor: string | null;
    };
    // 表示は limit (2) 件まで、3 件目は捨てる。
    // Visible items are clamped to `limit`; the +1 row only signals that
    // pagination should continue.
    expect(body.results).toHaveLength(2);
    expect(body.next_cursor).not.toBeNull();
    if (body.next_cursor === null) throw new Error("expected cursor");
    const decoded = JSON.parse(Buffer.from(body.next_cursor, "base64url").toString("utf8")) as {
      updatedAt: string;
      id: string;
    };
    // 最後の表示行 (index=1) の updated_at_iso と id が cursor に詰まる。
    // The cursor encodes the last visible row's (updated_at_iso, id).
    expect(decoded.updatedAt).toBe(microIso);
    const lastVisible = rows[1];
    if (!lastVisible) throw new Error("expected lastVisible row");
    expect(decoded.id).toBe(lastVisible.id);
  });

  it("returns null next_cursor when the result fits the requested limit", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole → owner
      {
        rows: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            title: "Only",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: NOTE_ID,
            content_text: null,
            updated_at_iso: "2026-04-01T00:00:00.000000Z",
          },
        ],
      },
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&limit=20`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: unknown[];
      next_cursor: string | null;
    };
    expect(body.results).toHaveLength(1);
    expect(body.next_cursor).toBeNull();
  });

  it("rejects malformed cursor payloads with 400", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    // base64url("{}") はデコード成功するが updatedAt / id を欠く → 400。
    // base64url("{}") decodes but lacks the required fields → 400.
    const badCursor = Buffer.from("{}", "utf8").toString("base64url");
    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&cursor=${badCursor}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
  });

  it("rejects cursor whose id is not a UUID with 400", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const cursor = Buffer.from(
      JSON.stringify({ updatedAt: "2026-04-01T00:00:00.000000Z", id: "not-a-uuid" }),
      "utf8",
    ).toString("base64url");

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&cursor=${cursor}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
  });

  it("threads cursor (updated_at, id) into the WHERE clause for keyset pagination", async () => {
    // cursor を渡すと、SQL に `(updated_at, id)` の keyset 比較が乗る。
    // chains.execute の serialised SQL に cursor 値が含まれることを確認する。
    //
    // When a cursor is supplied, the SQL gains a `(updated_at, id)` keyset
    // predicate. Verify the cursor's components flow into the SQL parameters.
    const mockNote = createMockNote();
    const cursorPayload = {
      updatedAt: "2026-04-01T12:34:56.123456Z",
      id: "33333333-3333-4333-8333-333333333333",
    };
    const cursor = Buffer.from(JSON.stringify(cursorPayload), "utf8").toString("base64url");
    const { app, chains } = createTestApp([
      [mockNote], // getNoteRole → owner
      { rows: [] }, // execute
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/search?q=hello&cursor=${cursor}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain(cursorPayload.updatedAt);
    expect(serialised).toContain(cursorPayload.id);
    // keyset で `<` 比較を作るため `::timestamptz` キャストが乗る。
    // The keyset predicate uses `::timestamptz` casts on the cursor timestamp.
    expect(serialised).toContain("::timestamptz");
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
