/**
 * GET/PUT /api/pages/:id/content など pages ルートのテスト。
 * Tests for pages routes including empty page_contents handling on GET.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    c.set("userEmail", "tester@example.com");
    await next();
  },
  authOptional: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (userId) {
      c.set("userId", userId);
      c.set("userEmail", "tester@example.com");
    }
    await next();
  },
}));

vi.mock("../../services/defaultNoteService.js", () => ({
  ensureDefaultNote: vi.fn(async (_db: unknown, userId: string) => ({
    id: "default-note-mock",
    ownerId: userId,
    title: "Mockのノート",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: true,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  })),
  getDefaultNoteOrNull: vi.fn(async (_db: unknown, userId: string) => ({
    id: "default-note-mock",
    ownerId: userId,
    title: "Mockのノート",
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
import * as Y from "yjs";
import pageRoutes from "../../routes/pages.js";
import { ensureDefaultNote, getDefaultNoteOrNull } from "../../services/defaultNoteService.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-test-123";
const PAGE_ID = "page-content-test-001";
/** pages.note_id と findActiveNoteById が参照するノート ID を一致させる。 */
const NOTE_ID = "note-access-test-001";

function authHeaders() {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

function mockNoteRow() {
  return {
    id: NOTE_ID,
    ownerId: TEST_USER_ID,
    title: "Test note",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: false,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  };
}

/** PR 1b 以降の assertPage*Access が要求する SELECT 3 連を先頭に付ける。 */
function pageAccessPrefix(extraPageFields: Record<string, unknown> = {}) {
  return [
    [{ id: PAGE_ID, ownerId: TEST_USER_ID, noteId: NOTE_ID, ...extraPageFields }],
    [{ email: "tester@example.com" }],
    [mockNoteRow()],
  ];
}

function createPagesApp(dbResults: unknown[]) {
  const { db } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/pages", pageRoutes);
  return app;
}

function createPagesAppWithChains(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/pages", pageRoutes);
  return { app, chains };
}

describe("GET /api/pages/:id/content", () => {
  it("returns 200 with empty ydoc_state when page exists but page_contents row is missing", async () => {
    const app = createPagesApp([...pageAccessPrefix(), []]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ydoc_state: "",
      version: 0,
      content_text: null,
    });
    expect(body.updated_at).toBeUndefined();
  });

  it("returns 404 when page does not exist", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });

  // Issue #880 Phase B リグレッション対応: GET 時の lazy migration。
  // `[[Title]]` を含む未 mark の Y.Doc を読んだら、サーバが mark 化してから
  // 返し、楽観ロックで page_contents を更新する。
  // Issue #880 Phase B regression fix: lazy migration on GET. When a row
  // contains unmarked `[[Title]]`, the route normalizes before returning
  // and persists via optimistic lock.
  it("normalizes unmarked `[[Title]]` text on GET and bumps the version", async () => {
    // 未 mark の `[[Foo]]` を持つ Y.Doc を作る。
    // Build a Y.Doc carrying plain `[[Foo]]` (no wikiLink mark yet).
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const paragraph = new Y.XmlElement("paragraph");
    fragment.insert(0, [paragraph]);
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    text.insert(0, "see [[Foo]] for details");
    const buffer = Buffer.from(Y.encodeStateAsUpdate(doc));

    const app = createPagesApp([
      ...pageAccessPrefix(),
      // pageContents SELECT
      [
        {
          ydocState: buffer,
          version: 3,
          contentText: "see [[Foo]] for details",
          updatedAt: new Date("2026-05-16T10:00:00Z"),
        },
      ],
      // pageContents UPDATE (optimistic lock success)
      [{ version: 4, updatedAt: new Date("2026-05-16T10:00:01Z") }],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ydoc_state: string; version: number };
    expect(body.version).toBe(4);

    // Decode the returned bytes and confirm wikiLink mark is now present.
    const decoded = new Y.Doc();
    Y.applyUpdate(decoded, new Uint8Array(Buffer.from(body.ydoc_state, "base64")));
    const returnedFragment = decoded.getXmlFragment("default");
    let hasWikiLink = false;
    returnedFragment.toArray().forEach((node) => {
      if (node instanceof Y.XmlElement) {
        node.toArray().forEach((child) => {
          if (child instanceof Y.XmlText) {
            const delta = child.toDelta() as Array<{ attributes?: Record<string, unknown> }>;
            if (delta.some((s) => s.attributes?.wikiLink)) hasWikiLink = true;
          }
        });
      }
    });
    expect(hasWikiLink).toBe(true);
  });

  it("returns already-marked content as-is and does not consume an UPDATE chain", async () => {
    // wikiLink mark 済みの Y.Doc。GET 経路では正規化が no-op になり UPDATE を
    // 呼ばないため、UPDATE 結果はキューしない。
    // Already-marked Y.Doc — the GET path's normalization is a no-op so no
    // UPDATE chain should be consumed.
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const paragraph = new Y.XmlElement("paragraph");
    fragment.insert(0, [paragraph]);
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    text.insert(0, "[[Foo]]", {
      wikiLink: { title: "Foo", exists: true, referenced: false, targetId: "page-foo" },
    });
    const buffer = Buffer.from(Y.encodeStateAsUpdate(doc));

    const app = createPagesApp([
      ...pageAccessPrefix(),
      [
        {
          ydocState: buffer,
          version: 7,
          contentText: "[[Foo]]",
          updatedAt: new Date("2026-05-16T11:00:00Z"),
        },
      ],
      // Intentionally NOT queuing an UPDATE result; the handler must skip it.
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number };
    // Version is unchanged because the normalizer found nothing to do.
    expect(body.version).toBe(7);
  });
});

describe("GET /api/pages/:id (single page metadata, Issue #860 Phase 6)", () => {
  /**
   * 単一ページ取得経路で返される metadata 行のテンプレート。実際の SELECT
   * カラムと並びを揃えるため、`createMockPageMetaRow` の戻り値をそのまま
   * `[row]` として createPagesApp に流す。
   *
   * Template for the single-page metadata row returned by the new GET route.
   * Mirrors the SELECT column set so the mock can be passed straight through
   * `createPagesApp` as `[row]`.
   */
  function createMockPageMetaRow(overrides: Record<string, unknown> = {}) {
    return {
      id: PAGE_ID,
      ownerId: TEST_USER_ID,
      noteId: NOTE_ID,
      sourcePageId: null,
      title: "Hello",
      contentPreview: "preview body",
      thumbnailUrl: "https://cdn.example/t.jpg",
      sourceUrl: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      isDeleted: false,
      ...overrides,
    };
  }

  it("returns the page metadata for the owner", async () => {
    const app = createPagesApp([
      [createMockPageMetaRow()], // page row
      [mockNoteRow()], // getNoteRole → findActiveNoteById (owner)
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      owner_id: TEST_USER_ID,
      note_id: NOTE_ID,
      title: "Hello",
      content_preview: "preview body",
      thumbnail_url: "https://cdn.example/t.jpg",
      source_url: null,
      is_deleted: false,
    });
  });

  it("returns 404 when the page row is missing or already soft-deleted", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when caller has no role on the owning note", async () => {
    const privateNote = {
      ...mockNoteRow(),
      ownerId: "other-user",
      visibility: "private" as const,
    };
    const app = createPagesApp([
      [createMockPageMetaRow({ ownerId: "other-user" })],
      [privateNote], // getNoteRole → findActiveNoteById (not owner)
      [], // member check
      [], // domain access check
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  it("allows guest access for pages on a public note (authOptional)", async () => {
    // 公開ノート配下のページは未ログインの guest からも取得できる。
    // `getNoteRole` は visibility=public に対して role=guest を返す。
    //
    // Public-note pages are reachable by unauthenticated callers; `getNoteRole`
    // resolves them as `guest` via the visibility branch.
    const publicNote = { ...mockNoteRow(), ownerId: "other-user", visibility: "public" as const };
    const app = createPagesApp([
      [createMockPageMetaRow({ ownerId: "other-user" })],
      [publicNote], // getNoteRole → findActiveNoteById (no userId/email → guest path)
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: PAGE_ID });
  });
});

describe("GET /api/pages", () => {
  it("returns 200 with Deprecation header and legacy listing shape (issue #823 shim)", async () => {
    const updatedAt = new Date("2026-03-01T12:00:00Z");
    const app = createPagesApp([
      {
        rows: [
          {
            id: "list-page-1",
            title: "Hello",
            content_preview: "pv",
            updated_at: updatedAt,
            note_id: "default-note-mock",
          },
        ],
      },
    ]);

    const res = await app.request("/api/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Deprecation")).toBe("true");
    const body = (await res.json()) as {
      pages: Array<{ id: string; title: string; note_id: string }>;
    };
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0]?.id).toBe("list-page-1");
    expect(body.pages[0]?.note_id).toBe("default-note-mock");
  });

  it("returns empty pages when default note is missing (no listing)", async () => {
    vi.mocked(getDefaultNoteOrNull).mockResolvedValueOnce(null);
    const app = createPagesApp([]);

    const res = await app.request("/api/pages", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Deprecation")).toBe("true");
    const body = (await res.json()) as { pages: unknown[] };
    expect(body.pages).toEqual([]);
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([]);

    const res = await app.request("/api/pages", { method: "GET" });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/pages", () => {
  it("calls ensureDefaultNote when note_id omitted and returns 201", async () => {
    vi.mocked(ensureDefaultNote).mockClear();

    const createdAt = new Date("2026-03-01T12:00:00Z");
    const updatedAt = new Date("2026-03-01T12:00:01Z");
    const app = createPagesApp([
      [
        {
          id: "new-page-id",
          ownerId: TEST_USER_ID,
          noteId: "default-note-mock",
          title: null,
          contentPreview: null,
          sourcePageId: null,
          sourceUrl: null,
          thumbnailUrl: null,
          thumbnailObjectId: null,
          createdAt,
          updatedAt,
          isDeleted: false,
        },
      ],
    ]);

    const res = await app.request("/api/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Hello" }),
    });

    expect(res.status).toBe(201);
    expect(ensureDefaultNote).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { id: string; owner_id: string };
    expect(body.id).toBe("new-page-id");
    expect(body.owner_id).toBe(TEST_USER_ID);
  });

  it("returns 403 when note_id points to a note the caller cannot edit", async () => {
    const otherOwnerNote = {
      id: "foreign-note-id",
      ownerId: "other-user",
      title: "Someone else's note",
      visibility: "private" as const,
      editPermission: "owner_only" as const,
      isOfficial: false,
      isDefault: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };

    const app = createPagesApp([[otherOwnerNote], [], []]);

    const res = await app.request("/api/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Nope", note_id: "foreign-note-id" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when note_id does not exist", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request("/api/pages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Nope", note_id: "missing-note-id" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/pages/:id/content", () => {
  it("creates page_contents when expected_version is 0 and no row exists (aligns with GET version 0)", async () => {
    const ydocB64 = Buffer.from("hello").toString("base64");
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      [{ version: 1, pageId: PAGE_ID }],
      [],
      [{ id: "snap-1" }],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: ydocB64,
        expected_version: 0,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(1);
    // maybeCreateSnapshot の内部実装順に依存しないよう、スナップショット経路が走ったことだけ確認する。
    const methods = chains.map((chain) => chain.startMethod);
    expect(methods).toContain("insert");
  });

  it("accepts ydoc_state empty string for first save (matches GET when page_contents is missing)", async () => {
    const app = createPagesApp([
      ...pageAccessPrefix(),
      [{ version: 1, pageId: PAGE_ID }],
      [],
      [{ id: "snap-2" }],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: "",
        expected_version: 0,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(1);
  });

  it("returns 400 when ydoc_state is omitted (before DB access checks)", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        expected_version: 0,
      }),
    });

    expect(res.status).toBe(400);
  });

  // Issue #726: タイトル変更検出のため、PUT に title が含まれるとき pages.title
  // を SELECT してから UPDATE を行う。これにより伝播処理の起点になる。
  // Issue #860 Phase 4 (PR #867 review fix) で、メタデータが実際に変化したとき
  // だけ pages テーブルを UPDATE する最適化が入った。タイトルが変わるケースは
  // 引き続き SELECT + UPDATE の 2 段ステップを踏む。
  //
  // Issue #726: when PUT carries `title`, the route SELECTs the current
  // `pages.title` before UPDATE so the handler can detect a rename and
  // trigger background propagation. Issue #860 Phase 4 (PR #867 review)
  // additionally gates the metadata UPDATE on a real value diff; when the
  // title genuinely changes the SELECT + UPDATE pair is still issued.
  it("issues an extra SELECT and pages UPDATE for rename detection when body.title differs", async () => {
    const ydocB64 = Buffer.from("hello").toString("base64");
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      [{ version: 2, pageId: PAGE_ID }],
      // 現在のタイトルが "Old Title"、新タイトルが "New Title" なので
      // SELECT + UPDATE が実際に走る。
      // Current title "Old Title" ≠ new title "New Title", so the SELECT
      // detects a rename and the metadata UPDATE actually fires.
      [{ title: "Old Title", contentPreview: null }],
      [{ id: PAGE_ID, title: "New Title" }],
      [],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: ydocB64,
        expected_version: 1,
        title: "New Title",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(2);

    const selectChains = chains.filter((c) => c.startMethod === "select");
    expect(selectChains.length).toBeGreaterThanOrEqual(2);
    const updateChains = chains.filter((c) => c.startMethod === "update");
    expect(updateChains.length).toBeGreaterThanOrEqual(2);
  });

  // Issue #860 Phase 4 (PR #867 review): クライアントが現在値を round-trip した
  // だけの保存では、SSE が暴発しないように pages テーブルの UPDATE を skip する。
  // SELECT 1 回（現在値の取得）は走るが、metadata UPDATE は走らない。
  //
  // When the client round-trips unchanged title / content_preview values,
  // the route now skips the metadata UPDATE entirely so `page.updated` is
  // not broadcast on a no-op save.
  it("skips the pages metadata UPDATE when title/content_preview match current (PR #867)", async () => {
    const ydocB64 = Buffer.from("hello").toString("base64");
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      [{ version: 2, pageId: PAGE_ID }],
      [{ title: "Same Title", contentPreview: "Same Preview" }],
      [],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: ydocB64,
        expected_version: 1,
        title: "Same Title",
        content_preview: "Same Preview",
      }),
    });

    expect(res.status).toBe(200);
    // SELECT は現在値取得のため 1 回走るが、pages の UPDATE は走らない。
    // page_contents の UPDATE は走る (version bump)。
    // SELECT for current values still happens; the pages UPDATE is
    // skipped, while page_contents still updates (version bump).
    const updateChains = chains.filter((c) => c.startMethod === "update");
    // ノートアクセス可否を見るための SELECT が起点となる UPDATE も無いため、
    // 残るのは page_contents の version bump 1 件のみ。
    // The only UPDATE left is the page_contents version bump.
    expect(updateChains.length).toBe(1);
  });

  // Issue #880 Phase B リグレッション対応: PUT 経路でも defense-in-depth で
  // 未 mark の `[[Title]]` を `wikiLink` mark 化してから保存する。
  // Defense-in-depth: PUT path normalizes unmarked `[[Title]]` text before
  // persisting so future GETs never see raw brackets.
  it("normalizes unmarked `[[Title]]` text before persisting on PUT", async () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const paragraph = new Y.XmlElement("paragraph");
    fragment.insert(0, [paragraph]);
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    text.insert(0, "see [[Bar]] here");
    const ydocB64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");

    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      [{ version: 5, pageId: PAGE_ID }],
      [{ title: "T", contentPreview: "P" }],
      [],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({
        ydoc_state: ydocB64,
        expected_version: 4,
      }),
    });

    expect(res.status).toBe(200);

    // The page_contents UPDATE should have been called with a buffer where
    // `[[Bar]]` is now wikiLink-marked. Decode the buffer from the `set()` op
    // and confirm.
    const updateChain = chains.find(
      (c) => c.startMethod === "update" && c.ops.some((op) => op.method === "set"),
    );
    expect(updateChain).toBeDefined();
    const setOp = updateChain?.ops.find((op) => op.method === "set");
    expect(setOp).toBeDefined();
    const setPayload = setOp?.args[0] as { ydocState?: Buffer } | undefined;
    expect(setPayload?.ydocState).toBeInstanceOf(Buffer);
    if (!setPayload?.ydocState) return;

    const decoded = new Y.Doc();
    Y.applyUpdate(decoded, new Uint8Array(setPayload.ydocState));
    const decodedFragment = decoded.getXmlFragment("default");
    let hasWikiLink = false;
    decodedFragment.toArray().forEach((node) => {
      if (node instanceof Y.XmlElement) {
        node.toArray().forEach((child) => {
          if (child instanceof Y.XmlText) {
            const delta = child.toDelta() as Array<{ attributes?: Record<string, unknown> }>;
            if (delta.some((s) => s.attributes?.wikiLink)) hasWikiLink = true;
          }
        });
      }
    });
    expect(hasWikiLink).toBe(true);
  });
});

// ── PUT /api/pages/:id (metadata only, post-`local` cleanup) ────────────────
//
// `local` モード廃止後、タイトル等のメタデータ更新は Y.Doc 経路 (`PUT /content`)
// を介さず、この新エンドポイントで行う。`applyPagesMetadataUpdate` を再利用する
// ため SSE 通知・タイトル伝播のゲーティングは PUT /content と同等に動作する。
//
// After retiring the `local` collaboration mode, page metadata updates flow
// through this new endpoint instead of riding on the Y.Doc payload. The
// helpers (`applyPagesMetadataUpdate`, `tryPropagateTitleRename`,
// `emitPageUpdatedIfChanged`) are reused so the SSE-emit and title-propagation
// invariants match the legacy `PUT /:id/content` path.
describe("PUT /api/pages/:id (metadata only)", () => {
  it("returns 200 and updates the title when body.title differs from current", async () => {
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      // applyPagesMetadataUpdate: SELECT current title + preview
      [{ title: "Old Title", contentPreview: null }],
      // applyPagesMetadataUpdate: UPDATE pages.returning()
      [
        {
          id: PAGE_ID,
          ownerId: TEST_USER_ID,
          noteId: NOTE_ID,
          title: "New Title",
          contentPreview: null,
          updatedAt: new Date("2026-05-16T10:00:00Z"),
          isDeleted: false,
        },
      ],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New Title" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      title: "New Title",
      content_preview: null,
      updated_at: "2026-05-16T10:00:00.000Z",
    });
    const updateChains = chains.filter((c) => c.startMethod === "update");
    expect(updateChains.length).toBe(1);
  });

  // 同じ値を round-trip した場合は `applyPagesMetadataUpdate` が UPDATE を skip し、
  // `metadataChanged: false` で返す。SSE 通知も走らない。
  //
  // Round-tripping the current values must be a no-op: the helper skips the
  // UPDATE and returns `metadataChanged: false`, so no SSE broadcast fires.
  it("skips the UPDATE when title matches current value (PR #867 invariant)", async () => {
    const { app, chains } = createPagesAppWithChains([
      ...pageAccessPrefix(),
      [{ title: "Same Title", contentPreview: "Same Preview" }],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "Same Title", content_preview: "Same Preview" }),
    });

    expect(res.status).toBe(200);
    const updateChains = chains.filter((c) => c.startMethod === "update");
    expect(updateChains.length).toBe(0);
  });

  it("returns 400 when body has neither title nor content_preview", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when the page does not exist (via assertPageEditAccess)", async () => {
    // assertPageEditAccess → getPageOwnership → SELECT pages: empty
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: "x" }),
    });

    expect(res.status).toBe(404);
  });
});

// ── GET /api/pages/:id/public-content (read-only for guests / viewers) ─────
//
// `local` モード廃止後、編集者は Hocuspocus 経由で Y.Doc を扱うが、未ログインの
// ゲスト（public / unlisted ノートの読者）や viewer ロールの閲覧者は WebSocket を
// 張らずに `content_text` だけを REST で取得する。本ルートは Y.Doc バイト列を
// 返さないことで、誤って編集セッションを開始できないようにする。
//
// After retiring the `local` mode, editors flow through Hocuspocus while
// guests (public/unlisted readers) and viewer-role members fetch
// `content_text` via REST without spinning up a WebSocket. The endpoint
// deliberately omits Y.Doc bytes so a read-only consumer cannot start an
// editing session by accident.
describe("GET /api/pages/:id/public-content", () => {
  it("returns the rendered text and version for the owner", async () => {
    const app = createPagesApp([
      // page row (SELECT pages)
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Hello",
          contentPreview: "preview body",
          updatedAt: new Date("2026-05-16T09:00:00Z"),
        },
      ],
      // getNoteRole → findActiveNoteById (owner short-circuit)
      [mockNoteRow()],
      // page_contents SELECT
      [
        {
          contentText: "Hello world",
          version: 7,
          updatedAt: new Date("2026-05-16T10:00:00Z"),
        },
      ],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      title: "Hello",
      content_text: "Hello world",
      content_preview: "preview body",
      version: 7,
      updated_at: "2026-05-16T10:00:00.000Z",
    });
    expect(res.headers.get("cache-control")).toBe("private, must-revalidate");
  });

  it("returns content_text=null and version=0 when page_contents row is missing", async () => {
    const app = createPagesApp([
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Blank",
          contentPreview: null,
          updatedAt: new Date("2026-05-16T11:00:00Z"),
        },
      ],
      [mockNoteRow()],
      [], // page_contents not yet inserted
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      content_text: null,
      version: 0,
      // falls back to pages.updated_at when page_contents is missing
      updated_at: "2026-05-16T11:00:00.000Z",
    });
  });

  it("returns 404 when the page row is missing or already soft-deleted", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when caller has no role on the owning private note", async () => {
    const privateNote = { ...mockNoteRow(), ownerId: "other-user", visibility: "private" as const };
    const app = createPagesApp([
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Secret",
          contentPreview: null,
          updatedAt: new Date(),
        },
      ],
      [privateNote], // note row
      [], // member SELECT empty
      [], // domain SELECT empty
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  // 未ログインゲストでも public ノート配下のページは閲覧できる。
  // `getNoteRole` は visibility=public に対して role=guest を返す。
  // エッジでの短期キャッシュを許す Cache-Control を確認する。
  //
  // Unauthenticated guests can read pages on public notes. `getNoteRole`
  // resolves them as `guest` via the visibility branch. The route returns a
  // short edge-cacheable `Cache-Control` for that case.
  it("allows guest access to a public-note page with edge-cacheable Cache-Control", async () => {
    const publicNote = { ...mockNoteRow(), ownerId: "other-user", visibility: "public" as const };
    const app = createPagesApp([
      [
        {
          id: PAGE_ID,
          noteId: NOTE_ID,
          title: "Public",
          contentPreview: "edge ok",
          updatedAt: new Date("2026-05-16T08:00:00Z"),
        },
      ],
      [publicNote],
      [
        {
          contentText: "Public body",
          version: 2,
          updatedAt: new Date("2026-05-16T09:00:00Z"),
        },
      ],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/public-content`, {
      method: "GET",
      // no auth header → guest path
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: PAGE_ID,
      content_text: "Public body",
      version: 2,
    });
    expect(res.headers.get("cache-control")).toBe("public, max-age=60, must-revalidate");
  });
});
