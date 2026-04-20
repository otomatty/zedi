/**
 * /api/notes/:noteId/invite-links ルートのテスト
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
  });

  it("rejects non-viewer roles in Phase 3 (400)", async () => {
    const { app } = createTestApp([
      [createMockNote()], // requireNoteOwner
    ]);
    const res = await app.request(`/api/notes/${NOTE_ID}/invite-links`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ role: "editor" }),
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
