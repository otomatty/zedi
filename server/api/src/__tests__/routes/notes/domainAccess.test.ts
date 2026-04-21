/**
 * `/api/notes/:noteId/domain-access` ルートのテスト。
 *
 * Route tests for the domain-scoped access endpoints (issue #663).
 *
 * モック DB は `setup.ts` のプロキシを使い、チェーン順に結果を流し込む。
 * 監査ログは `auditLog.js` をスパイに差し替えて呼び出しのみを検証する
 * （`inviteLinks.test.ts` と同じパターン）。
 *
 * The mock DB comes from `setup.ts`; audit logging is spied the same way as
 * in `inviteLinks.test.ts` so the tx short-circuits cleanly.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

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
 * `auditLogSpy.mock.calls[i][2]` (params) を型付きで取り出すヘルパー。
 * Typed accessor for the audit-log params captured by the spy.
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
const ACCESS_ID = "access-test-001";

/**
 * Mock row for `note_domain_access` SELECT results.
 * `note_domain_access` SELECT 結果のデフォルトモック行。
 */
function createMockDomainAccessRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCESS_ID,
    noteId: NOTE_ID,
    domain: "example.com",
    role: "viewer",
    createdByUserId: TEST_USER_ID,
    verifiedAt: null,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    isDeleted: false,
    ...overrides,
  };
}

// ── POST /api/notes/:noteId/domain-access ──────────────────────────────────

describe("POST /api/notes/:noteId/domain-access", () => {
  it("creates a viewer domain rule and records audit log", async () => {
    auditLogSpy.mockClear();
    const created = createMockDomainAccessRow();
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner → findActiveNoteById
      [created], // insert.returning
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain: "example.com" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: ACCESS_ID,
      note_id: NOTE_ID,
      domain: "example.com",
      role: "viewer",
    });
    expect(auditLogSpy).toHaveBeenCalledTimes(1);
    const params = getAuditParams();
    expect(params?.action).toBe("note.domain.created");
    expect(params?.targetType).toBe("note");
    expect(params?.targetId).toBe(NOTE_ID);
    expect(params?.after?.domain).toBe("example.com");
  });

  it("lower-cases and strips a leading @ from the domain input", async () => {
    // `@EXAMPLE.COM` は `example.com` として保存される (#663 バリデーション仕様)。
    // Verify the `@EXAMPLE.COM` input is stored as `example.com`.
    const created = createMockDomainAccessRow({ domain: "example.com" });
    const { app, chains } = createTestApp([
      [createMockNote()], // requireNoteOwner
      [created], // insert.returning
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain: "@EXAMPLE.COM", role: "editor" }),
    });

    expect(res.status).toBe(201);
    const insertChain = chains.find((c) => c.startMethod === "insert");
    const valuesOp = insertChain?.ops.find((op) => op.method === "values");
    const valuesArg = (valuesOp?.args[0] ?? {}) as Record<string, unknown>;
    expect(valuesArg.domain).toBe("example.com");
    expect(valuesArg.role).toBe("editor");
  });

  it("rejects a free-webmail domain with 400", async () => {
    // gmail.com はフリーメール拒否リストに含まれるため 400 で拒否される (#663)。
    // gmail.com is on the deny-list and must be rejected before insert.
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain: "gmail.com" }),
    });

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toMatch(/free email|gmail/i);
  });

  it("rejects missing domain with 400", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("rejects malformed domains with 400", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain: "not-a-domain" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects unknown roles with 400", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain: "example.com", role: "admin" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects non-owner callers with 403", async () => {
    const { app } = createTestApp([
      [createMockNote({ ownerId: "someone-else" })], // requireNoteOwner → not owner
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain: "example.com" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects invalid JSON body with 400", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "POST",
      headers: authHeaders(),
      body: "{bad json}",
    });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/notes/:noteId/domain-access ───────────────────────────────────

describe("GET /api/notes/:noteId/domain-access", () => {
  it("returns the list for the owner", async () => {
    const rows = [
      createMockDomainAccessRow(),
      createMockDomainAccessRow({ id: "access-2", domain: "acme.co.jp", role: "editor" }),
    ];
    const { app } = createTestApp([
      [createMockNote()], // getNoteRole → findActiveNoteById (owner)
      rows,
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      id: ACCESS_ID,
      note_id: NOTE_ID,
      domain: "example.com",
      role: "viewer",
    });
    expect(body[1]?.role).toBe("editor");
  });

  it("rejects guests with 403", async () => {
    const note = createMockNote({ visibility: "public", ownerId: "someone-else" });
    const { app } = createTestApp([
      [note], // findActiveNoteById in getNoteRole
      [], // noteMembers lookup → empty
      [], // noteDomainAccess lookup → empty (so fall through to visibility=guest)
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "GET",
      headers: authHeaders("anon-user", "anon@example.com"),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when note does not exist", async () => {
    const { app } = createTestApp([
      [], // findActiveNoteById → null
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/notes/:noteId/domain-access/:id ────────────────────────────

describe("DELETE /api/notes/:noteId/domain-access/:id", () => {
  it("soft-deletes the rule and records audit log", async () => {
    auditLogSpy.mockClear();
    const existingRow = createMockDomainAccessRow({ isDeleted: true });
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
      [existingRow], // update.returning
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access/${ACCESS_ID}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ removed: true, id: ACCESS_ID });

    expect(auditLogSpy).toHaveBeenCalledTimes(1);
    const params = getAuditParams();
    expect(params?.action).toBe("note.domain.deleted");
    expect(params?.targetType).toBe("note");
    expect(params?.before?.domain).toBe("example.com");
  });

  it("returns 404 when the rule is already removed or belongs to another note", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
      [], // update.returning → empty
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access/${ACCESS_ID}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("rejects non-owner callers with 403", async () => {
    const { app } = createTestApp([
      [createMockNote({ ownerId: OTHER_USER_ID })], // requireNoteOwner → not owner
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/domain-access/${ACCESS_ID}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });
});
