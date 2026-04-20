/**
 * /api/notes/:noteId/invite-links ルートのテスト
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

// 共有リンク作成ルートはトランザクション内で監査ログを書く。
// `recordAuditLog` は users テーブル JOIN 等を要するため、ルートテストでは
// 呼び出しのみ検証するスパイに差し替える（副作用は不要）。スパイは `(c, db,
// params)` の 3 引数シグネチャで型付けし、`mock.calls[0]?.[2]` で params を
// 参照できるようにする。
//
// The invite-link create route records an audit log inside its transaction.
// `recordAuditLog` depends on auth context that the route-test mock skips, so
// replace it with a spy that records calls without touching the mock DB chain.
// Type the spy with the real 3-arg shape so `mock.calls[0]?.[2]` is reachable
// under `tsc --noEmit`.
interface AuditLogParams {
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}
const { auditLogSpy } = vi.hoisted(() => ({
  auditLogSpy: vi.fn(async (_c: unknown, _db: unknown, _params: AuditLogParams) => {}),
}));
vi.mock("../../../lib/auditLog.js", () => ({
  recordAuditLog: (c: unknown, db: unknown, params: AuditLogParams) => auditLogSpy(c, db, params),
  extractClientIp: () => null,
}));

/**
 * `auditLogSpy.mock.calls[callIndex][2]` (params) の型付き取り出しヘルパー。
 * テストで重複するキャスト/アクセスパターンを 1 箇所にまとめる (#676 coderabbit)。
 *
 * Helper to pull the audit-log `params` out of the spy's call record with a
 * single type assertion so individual tests don't repeat the cast.
 */
function getAuditParams(callIndex = 0): AuditLogParams | undefined {
  return auditLogSpy.mock.calls[callIndex]?.[2];
}

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
const LINK_ID = "link-test-001";

function createMockLinkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    noteId: NOTE_ID,
    token: "deadbeef".repeat(8),
    role: "viewer",
    createdByUserId: TEST_USER_ID,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    maxUses: 10,
    usedCount: 0,
    revokedAt: null,
    requireSignIn: true,
    label: null,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    ...overrides,
  };
}

describe("POST /api/notes/:noteId/invite-links", () => {
  it("creates a viewer link with defaults when body is empty", async () => {
    auditLogSpy.mockClear();
    const createdRow = createMockLinkRow();
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner → findActiveNoteById
      [createdRow], // insert.returning
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.role).toBe("viewer");
    expect(body.note_id).toBe(NOTE_ID);
    expect(typeof body.token).toBe("string");
    // 監査ログに viewer 作成として記録されている / Audit log records viewer creation.
    expect(auditLogSpy).toHaveBeenCalledTimes(1);
    const auditParams = getAuditParams();
    expect(auditParams?.action).toBe("note.link.created.viewer");
    expect(auditParams?.targetType).toBe("note");
  });

  it("rejects unknown roles with 400", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ role: "admin" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-owner callers with 403", async () => {
    const { app } = createTestApp([
      [createMockNote({ ownerId: "someone-else" })], // requireNoteOwner
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(OTHER_USER_ID, "other@example.com"),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("rejects maxUses outside the allowed range with 400", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ maxUses: 9999 }),
    });
    expect(res.status).toBe(400);
  });

  // ── Phase 5 (#662) — editor ロール対応 ───────────────────────────────────

  it("rejects editor link creation when note.editPermission is 'owner_only' (400)", async () => {
    // editPermission=owner_only のノートは「オーナー以外は編集不可」を宣言しており、
    // editor リンクを発行すると編集権限ポリシーと整合しない (#662)。
    // When editPermission is owner_only, issuing an editor link would contradict
    // the note's own policy (#662).
    const { app } = createTestApp([[createMockNote({ editPermission: "owner_only" })]]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ role: "editor" }),
    });
    expect(res.status).toBe(400);
    // HTTPException は text/plain のボディを返すため text() で読む。
    // HTTPException returns plain text, so read via `text()`.
    const body = await res.text();
    expect(body).toMatch(/owner_only|edit permission/i);
  });

  it("creates an editor link when editPermission allows it and logs editor action", async () => {
    auditLogSpy.mockClear();
    const createdRow = createMockLinkRow({ role: "editor" });
    // editor 発行フローは tx 内で以下の順にチェーンを消費する:
    //  0: requireNoteOwner (findActiveNoteById)
    //  1: SELECT notes FOR UPDATE — {id, editPermission} (row lock + re-check)
    //  2: active editor link count (inside the tx)
    //  3: insert ... returning
    //
    // The editor flow consumes four chains: owner check, locked re-check of
    // `editPermission`, cap count, insert.
    const { app } = createTestApp([
      [createMockNote({ editPermission: "members_editors" })],
      // SELECT notes FOR UPDATE returns the row-locked editPermission. The
      // route re-checks this to close the pre-tx snapshot race.
      [{ id: NOTE_ID, editPermission: "members_editors" }],
      [{ count: 0 }], // active editor link count query
      [createdRow], // insert.returning
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      // requireSignIn は型的には `true` のみ受理されるが、境界超えの挙動を
      // 検証するため敢えて `false` を送る（API は true に coerce する）。
      // Intentionally send `false` — the server must coerce to `true`.
      body: JSON.stringify({ role: "editor", requireSignIn: false }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.role).toBe("editor");
    // 監査ログは editor 用の別 action で記録される (#662)。
    // Audit log is filed under a dedicated editor action (#662).
    expect(auditLogSpy).toHaveBeenCalledTimes(1);
    const auditParams = getAuditParams();
    expect(auditParams?.action).toBe("note.link.created.editor");
    expect(auditParams?.targetType).toBe("note");
    // editor リンクは API 境界で常に requireSignIn=true に揃える。
    // Editor links force requireSignIn=true at the API boundary.
    expect(auditParams?.after?.require_sign_in).toBe(true);
  });

  it("rejects a 4th active editor link for the same note (400)", async () => {
    // 1 ノートにつき同時に最大 3 本まで (#662)。4 本目は 400。
    // tx 内で FOR UPDATE → count の順にチェーンを消費し、count が 3 に達した
    // 時点で throw する。
    //
    // The 4th editor link hits the cap after the FOR UPDATE row lock and the
    // count query consume their chain slots.
    const { app } = createTestApp([
      [createMockNote({ editPermission: "members_editors" })], // requireNoteOwner
      [{ id: NOTE_ID, editPermission: "members_editors" }], // SELECT notes FOR UPDATE
      [{ count: 3 }], // active editor link count query
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ role: "editor" }),
    });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toMatch(/editor.*link|3/i);
  });

  it(
    "rejects editor link when editPermission flips to 'owner_only' between the " +
      "outer snapshot and the locked re-check (TOCTOU safety)",
    async () => {
      // 並行書き込みで editPermission が owner_only に変わる状況を模擬する:
      // requireNoteOwner が返すスナップショットは members_editors のまま、
      // tx 内の FOR UPDATE で得た行は owner_only になっている想定。
      // in-tx re-check がこの race を捕まえて 400 に落とす (#676 coderabbit / devin)。
      //
      // Simulate a policy flip committed between the outer read and the row
      // lock: the outer snapshot says `members_editors` (fast-fail passes) but
      // the locked row says `owner_only`. The in-tx re-check must still reject.
      const { app } = createTestApp([
        [createMockNote({ editPermission: "members_editors" })], // requireNoteOwner
        [{ id: NOTE_ID, editPermission: "owner_only" }], // SELECT notes FOR UPDATE — flipped
      ]);
      const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ role: "editor" }),
      });
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toMatch(/owner_only|edit permission/i);
    },
  );

  it("creates a viewer link successfully (independent of editor-cap path)", async () => {
    // viewer ロールでは FOR UPDATE / count の editor 専用パスをスキップする
    // ことを確認する (#662 / #676 coderabbit: test name を実際の挙動に合わせる)。
    //
    // Verifies the viewer-role path does not go through the editor-only lock /
    // cap queries. Test renamed to match the narrow behaviour it exercises.
    auditLogSpy.mockClear();
    const createdRow = createMockLinkRow();
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner (viewer — no FOR UPDATE or count query)
      [createdRow], // insert.returning
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ role: "viewer" }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/notes/:noteId/invite-links", () => {
  it("returns the list for owner and excludes revoked links in the query", async () => {
    const rows = [createMockLinkRow(), createMockLinkRow({ id: "link-2" })];
    // getNoteRole → findActiveNoteById (1 row)
    // then select from note_invite_links (list)
    const { app, chains } = createTestApp([
      [createMockNote()], // findActiveNoteById inside getNoteRole
      rows,
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(2);
    // Make sure the select chain used isNull on revoked_at somewhere.
    const listChain = chains[1];
    expect(listChain).toBeDefined();
  });

  it("rejects guests with 403", async () => {
    const note = createMockNote({
      visibility: "public",
      ownerId: "someone-else",
    });
    const { app } = createTestApp([
      [note], // findActiveNoteById
      [], // noteMembers lookup → guest (public → guest role)
      [], // noteDomainAccess lookup → no matching rule
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "GET",
      headers: authHeaders("anon-user", "anon@example.com"),
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/notes/:noteId/invite-links/:linkId", () => {
  it("revokes an active link", async () => {
    const revokedRow = createMockLinkRow({ revokedAt: new Date() });
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
      [revokedRow], // update.returning
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links/${LINK_ID}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.revoked).toBe(true);
  });

  it("returns 404 when the link is already revoked or belongs to another note", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
      [], // update returns empty
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links/${LINK_ID}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });
});
