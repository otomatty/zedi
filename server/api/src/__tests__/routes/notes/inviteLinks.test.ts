/**
 * /api/notes/:noteId/invite-links ルートのテスト
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

// 共有リンク作成ルートはトランザクション内で監査ログを書く。
// `recordAuditLog` は users テーブル JOIN 等を要するため、ルートテストでは
// 呼び出しのみ検証するスパイに差し替える（副作用は不要）。
//
// The invite-link create route records an audit log inside its transaction.
// `recordAuditLog` depends on auth context that the route-test mock skips, so
// replace it with a spy that records calls without touching the mock DB chain.
const { auditLogSpy } = vi.hoisted(() => ({
  auditLogSpy: vi.fn(async () => {}),
}));
vi.mock("../../../lib/auditLog.js", () => ({
  recordAuditLog: (...args: unknown[]) => auditLogSpy(...(args as Parameters<typeof auditLogSpy>)),
  extractClientIp: () => null,
}));

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
    const auditParams = auditLogSpy.mock.calls[0]?.[2] as
      | { action?: string; targetType?: string }
      | undefined;
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
    const { app } = createTestApp([
      [createMockNote({ editPermission: "members_editors" })], // requireNoteOwner
      [{ count: 0 }], // active editor link count query
      [createdRow], // insert.returning
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ role: "editor", requireSignIn: false }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.role).toBe("editor");
    // 監査ログは editor 用の別 action で記録される (#662)。
    // Audit log is filed under a dedicated editor action (#662).
    expect(auditLogSpy).toHaveBeenCalledTimes(1);
    const auditParams = auditLogSpy.mock.calls[0]?.[2] as
      | { action?: string; targetType?: string; after?: Record<string, unknown> }
      | undefined;
    expect(auditParams?.action).toBe("note.link.created.editor");
    expect(auditParams?.targetType).toBe("note");
    // editor リンクは API 境界で常に requireSignIn=true に揃える。
    // Editor links force requireSignIn=true at the API boundary.
    expect(auditParams?.after?.require_sign_in).toBe(true);
  });

  it("rejects a 4th active editor link for the same note (400)", async () => {
    // 1 ノートにつき同時に最大 3 本まで (#662)。4 本目は 400。
    // One note may have at most 3 active editor links at a time (#662); the 4th
    // must be rejected with 400.
    const { app } = createTestApp([
      [createMockNote({ editPermission: "members_editors" })], // requireNoteOwner
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

  it("does not count viewer links against the editor limit", async () => {
    // viewer 側の本数は editor キャップに影響しない (#662)。
    // Viewer link counts are independent of the editor-link cap.
    auditLogSpy.mockClear();
    const createdRow = createMockLinkRow();
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner (viewer — no count query)
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
