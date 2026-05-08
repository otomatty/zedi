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

/** PR 1b: GET/POST sync は ensureDefaultNote を先に叩く。モックしてチェーンをページ同期クエリに寄せる。 */
vi.mock("../../services/defaultNoteService.js", () => ({
  ensureDefaultNote: vi.fn(async () => ({
    id: "sync-default-note-id",
    ownerId: "user-owner",
    title: "Default",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: true,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  })),
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

describe("GET /api/sync/pages — link_type in response (issue #725 Phase 1)", () => {
  it("returns link_type on each links row and ghost_links row", async () => {
    const now = new Date("2025-06-01T00:00:00Z");
    const { app } = createSyncApp([
      // 1: pages query
      [
        {
          id: OWNED_PAGE,
          owner_id: TEST_USER_ID,
          title: "P",
          content_preview: null,
          thumbnail_url: null,
          source_url: null,
          source_page_id: null,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        },
      ],
      // 2: links query
      [
        { sourceId: OWNED_PAGE, targetId: "t-wiki", linkType: "wiki", createdAt: now },
        { sourceId: OWNED_PAGE, targetId: "t-tag", linkType: "tag", createdAt: now },
      ],
      // 3: ghost_links query
      [
        {
          linkText: "ghost-wiki",
          sourcePageId: OWNED_PAGE,
          linkType: "wiki",
          createdAt: now,
          originalTargetPageId: null,
          originalNoteId: null,
        },
        {
          linkText: "ghost-tag",
          sourcePageId: OWNED_PAGE,
          linkType: "tag",
          createdAt: now,
          originalTargetPageId: null,
          originalNoteId: null,
        },
      ],
    ]);

    const res = await app.request("/api/sync/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      links: Array<{ source_id: string; target_id: string; link_type: string }>;
      ghost_links: Array<{ link_text: string; source_page_id: string; link_type: string }>;
    };
    expect(body.links.map((l) => l.link_type).sort()).toEqual(["tag", "wiki"]);
    expect(body.ghost_links.map((g) => g.link_type).sort()).toEqual(["tag", "wiki"]);
  });
});

describe("POST /api/sync/pages — IDOR protection", () => {
  it("skips link insertion when source_id is not owned by the user", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const { app, chains } = createSyncApp([
      // 1: bulk page fetch (LWW pre-load)
      [
        {
          id: OWNED_PAGE,
          ownerId: TEST_USER_ID,
          noteId: "sync-default-note-id",
          updatedAt: oldDate,
        },
      ],
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
      [
        {
          id: OWNED_PAGE,
          ownerId: TEST_USER_ID,
          noteId: "sync-default-note-id",
          updatedAt: oldDate,
        },
      ],
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

  // ── Issue #725 Phase 1: link_type support ────────────────────────────
  // `link_type` は WikiLink (`'wiki'`) とタグ (`'tag'`) を区別する識別子。
  // 1) 既存クライアント互換: `link_type` 省略 → `'wiki'` として扱う。
  // 2) タグ同期時に WikiLink を巻き添え削除しないよう、DELETE は
  //    `(source_id, link_type)` ごとにスコープされる。
  // 3) 同一 source の wiki と tag は独立エッジとして両立する。
  //
  // `link_type` distinguishes WikiLink (`'wiki'`) from Tag (`'tag'`). The
  // server must (1) default to `'wiki'` for legacy bodies, (2) scope DELETE
  // per `(source_id, link_type)` so tag sync cannot wipe wiki edges, and
  // (3) accept wiki + tag edges on the same source pair simultaneously.
  describe("link_type support (issue #725 Phase 1)", () => {
    it("defaults link_type to 'wiki' when omitted in body.links (legacy client compat)", async () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const { app, chains } = createSyncApp([
        [
          {
            id: OWNED_PAGE,
            ownerId: TEST_USER_ID,
            noteId: "sync-default-note-id",
            updatedAt: oldDate,
          },
        ],
        undefined,
        [{ id: OWNED_PAGE }],
        undefined,
        undefined,
      ]);

      const res = await app.request("/api/sync/pages", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
          links: [{ source_id: OWNED_PAGE, target_id: "target-a" }],
        }),
      });

      expect(res.status).toBe(200);

      const insertChains = chains.filter((c) => c.startMethod === "insert");
      expect(insertChains).toHaveLength(1);
      const valuesOp = (insertChains[0]?.ops ?? []).find((op) => op.method === "values");
      const inserted = valuesOp?.args?.[0] as { linkType?: string } | undefined;
      expect(inserted?.linkType).toBe("wiki");
    });

    it("scopes DELETE per (source_id, link_type) when body.links mixes wiki + tag (no wiki wipeout)", async () => {
      // 同一 source に wiki と tag が混在する push。wiki 用 DELETE と tag 用
      // DELETE がそれぞれ独立に発行されること、INSERT も 2 件（各 link_type）
      // になることを検証する。
      //
      // Mixed wiki + tag push for the same source: verify one DELETE per
      // `(source_id, link_type)` pair and one INSERT per row.
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const { app, chains } = createSyncApp([
        [
          {
            id: OWNED_PAGE,
            ownerId: TEST_USER_ID,
            noteId: "sync-default-note-id",
            updatedAt: oldDate,
          },
        ],
        undefined,
        [{ id: OWNED_PAGE }],
        undefined, // DELETE wiki
        undefined, // DELETE tag
        undefined, // INSERT wiki link
        undefined, // INSERT tag link
      ]);

      const res = await app.request("/api/sync/pages", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
          links: [
            { source_id: OWNED_PAGE, target_id: "target-wiki", link_type: "wiki" },
            { source_id: OWNED_PAGE, target_id: "target-tag", link_type: "tag" },
          ],
        }),
      });

      expect(res.status).toBe(200);

      const deleteChains = chains.filter((c) => c.startMethod === "delete");
      // 1 DELETE per (source, link_type) pair = 2
      expect(deleteChains).toHaveLength(2);

      const insertChains = chains.filter((c) => c.startMethod === "insert");
      // page UPDATE + 2 link INSERTs。page UPDATE は insert chain には
      // 含まれないので、期待する insert は 2 件（wiki + tag）。
      // Page UPDATE is not counted as an insert chain; expect 2 link INSERTs
      // (one wiki + one tag).
      expect(insertChains).toHaveLength(2);
      const insertedLinkTypes = insertChains
        .map((ch) => {
          const valuesOp = ch.ops.find((op) => op.method === "values");
          return (valuesOp?.args?.[0] as { linkType?: string } | undefined)?.linkType;
        })
        .sort();
      expect(insertedLinkTypes).toEqual(["tag", "wiki"]);
    });

    it("does not touch existing tag edges when body.links contains only wiki (scoped DELETE)", async () => {
      // tag エッジを持つページに対して wiki のみ push したとき、tag 用 DELETE が
      // 発行されないことで既存 tag エッジが残ることを検証する。
      //
      // Push only wiki edges → server must not issue a tag DELETE, leaving
      // existing tag edges untouched.
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const { app, chains } = createSyncApp([
        [
          {
            id: OWNED_PAGE,
            ownerId: TEST_USER_ID,
            noteId: "sync-default-note-id",
            updatedAt: oldDate,
          },
        ],
        undefined,
        [{ id: OWNED_PAGE }],
        undefined, // DELETE wiki only
        undefined, // INSERT wiki
      ]);

      const res = await app.request("/api/sync/pages", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
          links: [{ source_id: OWNED_PAGE, target_id: "target-a", link_type: "wiki" }],
        }),
      });

      expect(res.status).toBe(200);
      const deleteChains = chains.filter((c) => c.startMethod === "delete");
      // 単一 (source, wiki) ペアのみ → DELETE は 1 回だけ
      expect(deleteChains).toHaveLength(1);
    });

    it("accepts link_type='tag' on ghost_links and defaults to 'wiki' when omitted", async () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const { app, chains } = createSyncApp([
        [
          {
            id: OWNED_PAGE,
            ownerId: TEST_USER_ID,
            noteId: "sync-default-note-id",
            updatedAt: oldDate,
          },
        ],
        undefined,
        [{ id: OWNED_PAGE }],
        undefined, // DELETE ghost wiki
        undefined, // DELETE ghost tag
        undefined, // INSERT ghost wiki
        undefined, // INSERT ghost tag
      ]);

      const res = await app.request("/api/sync/pages", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
          ghost_links: [
            { link_text: "legacy", source_page_id: OWNED_PAGE },
            { link_text: "newtag", source_page_id: OWNED_PAGE, link_type: "tag" },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const insertChains = chains.filter((c) => c.startMethod === "insert");
      expect(insertChains).toHaveLength(2);
      const insertedTypes = insertChains
        .map((ch) => {
          const valuesOp = ch.ops.find((op) => op.method === "values");
          return (valuesOp?.args?.[0] as { linkType?: string } | undefined)?.linkType;
        })
        .sort();
      expect(insertedTypes).toEqual(["tag", "wiki"]);
    });

    it("rejects unknown link_type values with 400", async () => {
      const { app } = createSyncApp([]);

      const res = await app.request("/api/sync/pages", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          pages: [{ id: OWNED_PAGE, title: "My Page", updated_at: "2025-06-01T00:00:00Z" }],
          links: [{ source_id: OWNED_PAGE, target_id: "target-a", link_type: "totally-bogus" }],
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  it("skips both links and ghost_links for non-owned pages in combined request", async () => {
    const oldDate = new Date("2024-01-01T00:00:00Z");
    const { app, chains } = createSyncApp([
      // 1: bulk page fetch (LWW pre-load)
      [
        {
          id: OWNED_PAGE,
          ownerId: TEST_USER_ID,
          noteId: "sync-default-note-id",
          updatedAt: oldDate,
        },
      ],
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
