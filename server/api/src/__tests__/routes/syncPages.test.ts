/**
 * POST /api/sync/pages — IDOR protection tests.
 * Verifies that links / ghost_links with non-owned source pages are skipped.
 *
 * links / ghost_links の source が自分のページでない場合に挿入がスキップされることを検証する。
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

import { Hono } from "hono";
import syncPagesRoute from "../../routes/syncPages.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-owner";
const OWNED_PAGE = "page-owned-001";
const OTHER_PAGE = "page-other-999";

function authHeaders() {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

function createSyncApp(dbResults: unknown[]) {
  const mock = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", mock.db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/sync/pages", syncPagesRoute);
  return { app, chains: mock.chains };
}

describe("POST /api/sync/pages — IDOR protection", () => {
  it("skips link insertion when source_id is not owned by the user", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const { app, chains } = createSyncApp([
      // 1: bulk page fetch (LWW pre-load)
      [{ id: OWNED_PAGE, ownerId: TEST_USER_ID, noteId: null, updatedAt: oldDate }],
      // 2: page update
      undefined,
      // 3: owned pages query for links
      [{ id: OWNED_PAGE }],
      // 4: delete existing links for OWNED_PAGE
      undefined,
      // 5: insert link (only the owned one)
      undefined,
    ]);

    const res = await app.request("/api/sync/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
        links: [
          { source_id: OWNED_PAGE, target_id: "target-a" },
          { source_id: OTHER_PAGE, target_id: "target-b" },
        ],
      }),
    });

    expect(res.status).toBe(200);

    const insertChains = chains.filter((c) => c.startMethod === "insert");
    // 1 page insert/update + 1 owned link insert = only 1 insert
    // The non-owned link must NOT produce an insert call.
    expect(insertChains.length).toBe(1);
  });

  it("skips ghost_link insertion when source_page_id is not owned by the user", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const { app, chains } = createSyncApp([
      // 1: bulk page fetch (LWW pre-load)
      [{ id: OWNED_PAGE, ownerId: TEST_USER_ID, noteId: null, updatedAt: oldDate }],
      // 2: page update
      undefined,
      // 3: owned pages query for ghost_links
      [{ id: OWNED_PAGE }],
      // 4: delete existing ghost_links for OWNED_PAGE
      undefined,
      // 5: insert ghost_link (only the owned one)
      undefined,
    ]);

    const res = await app.request("/api/sync/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
        ghost_links: [
          { link_text: "valid", source_page_id: OWNED_PAGE },
          { link_text: "malicious", source_page_id: OTHER_PAGE },
        ],
      }),
    });

    expect(res.status).toBe(200);

    const insertChains = chains.filter((c) => c.startMethod === "insert");
    expect(insertChains.length).toBe(1);
  });

  it("skips a page id that resolves to a note-native row on the server (issue #713)", async () => {
    // クライアント側 IndexedDB が個人ページとして持っている ID と同じ ID が、
    // サーバー側ではノートネイティブページ（`pages.note_id != null`）として
    // 存在するケースの防御。`update` も `insert` も走らないことを検証する。
    //
    // Defensive case: a client tries to LWW-sync an id that on the server is a
    // note-native page. Neither update nor insert should fire.
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const { app, chains } = createSyncApp([
      // 1: bulk fetch returns a note-native row for the requested id
      [{ id: OWNED_PAGE, ownerId: TEST_USER_ID, noteId: "some-note", updatedAt: oldDate }],
    ]);

    const res = await app.request("/api/sync/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        pages: [{ id: OWNED_PAGE, title: "client copy", updated_at: "2025-06-01T00:00:00Z" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { id: string; action: string }[] };
    expect(body.results).toEqual([{ id: OWNED_PAGE, action: "skipped" }]);

    expect(chains.filter((c) => c.startMethod === "insert")).toHaveLength(0);
    expect(chains.filter((c) => c.startMethod === "update")).toHaveLength(0);
  });

  it("collapses duplicate page ids in body to a single insert with the latest updated_at (PR #714 review)", async () => {
    // クライアントのリトライ等で同じ id が複数届いても、bulk-fetch スナップショット
    // を信じてループに無加工で流すと、新規 id の 2 回目で再 insert → PK 衝突 (500) や
    // 古い updated_at で順序逆転が起きる。dedupe + マップ更新で防ぐ。
    //
    // Duplicate ids in the payload must collapse to a single DML and pick the
    // latest `updated_at`, otherwise we either crash on PK conflict or
    // out-of-order LWW updates land on the row.
    const { app, chains } = createSyncApp([
      // 1: bulk fetch returns nothing (treat as new id)
      [],
      // 2: insert (the deduped occurrence)
      undefined,
    ]);

    const res = await app.request("/api/sync/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        pages: [
          { id: OWNED_PAGE, title: "older", updated_at: "2025-06-01T00:00:00Z" },
          { id: OWNED_PAGE, title: "newer", updated_at: "2025-06-02T00:00:00Z" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { id: string; action: string }[] };
    // 重複は畳み込まれるため、結果は 1 件のみ。
    // Duplicates collapse: results contain a single entry.
    expect(body.results).toEqual([{ id: OWNED_PAGE, action: "created" }]);

    const insertChains = chains.filter((c) => c.startMethod === "insert");
    expect(insertChains).toHaveLength(1);
    // 最新の `updated_at` (= "newer") が採用されることを確認する。
    // Newer payload (`title: "newer"`) wins via dedupe.
    const valuesOp = (insertChains[0]?.ops ?? []).find((op) => op.method === "values");
    const inserted = valuesOp?.args?.[0] as { title: string } | undefined;
    expect(inserted?.title).toBe("newer");
  });

  it("skips both links and ghost_links for non-owned pages in combined request", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const { app, chains } = createSyncApp([
      // 1: bulk page fetch (LWW pre-load)
      [{ id: OWNED_PAGE, ownerId: TEST_USER_ID, noteId: null, updatedAt: oldDate }],
      // 2: page update
      undefined,
      // 3: owned pages query for links
      [{ id: OWNED_PAGE }],
      // 4: delete existing links for OWNED_PAGE
      undefined,
      // 5: insert owned link
      undefined,
      // 6: owned pages query for ghost_links
      [{ id: OWNED_PAGE }],
      // 7: delete existing ghost_links for OWNED_PAGE
      undefined,
      // 8: insert owned ghost_link
      undefined,
    ]);

    const res = await app.request("/api/sync/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
        links: [
          { source_id: OWNED_PAGE, target_id: "target-a" },
          { source_id: OTHER_PAGE, target_id: "target-b" },
        ],
        ghost_links: [
          { link_text: "valid", source_page_id: OWNED_PAGE },
          { link_text: "malicious", source_page_id: OTHER_PAGE },
        ],
      }),
    });

    expect(res.status).toBe(200);

    const insertChains = chains.filter((c) => c.startMethod === "insert");
    // 1 owned link insert + 1 owned ghost_link insert = 2 inserts total
    expect(insertChains.length).toBe(2);
  });
});
