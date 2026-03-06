/**
 * ノートメンバー管理ルートのテスト
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
  OTHER_USER_EMAIL,
  createMockNote,
  createMockMember,
  createTestApp,
  authHeaders,
} from "./setup.js";

const NOTE_ID = "note-test-001";

// ── POST /api/notes/:noteId/members ─────────────────────────────────────────

describe("POST /api/notes/:noteId/members", () => {
  it("should add a member and return the added member (NoteMemberItem)", async () => {
    const mockNote = createMockNote();
    const addedMember = createMockMember({
      noteId: NOTE_ID,
      memberEmail: OTHER_USER_EMAIL,
      role: "editor",
    });
    const { app, chains } = createTestApp([
      [mockNote], // requireNoteOwner → findActiveNoteById (owner)
      [addedMember], // insert noteMembers with .returning()
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ member_email: OTHER_USER_EMAIL, role: "editor" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      note_id: NOTE_ID,
      member_email: OTHER_USER_EMAIL,
      role: "editor",
      invited_by_user_id: TEST_USER_ID,
    });
    expect(body).toHaveProperty("created_at");
    expect(body).toHaveProperty("updated_at");

    const insertCall = chains.find((c) => c.startMethod === "insert");
    expect(insertCall).toBeDefined();
    const insert = insertCall as NonNullable<typeof insertCall>;
    const valuesOp = insert.ops.find((op) => op.method === "values");
    const valuesArg = (valuesOp?.args[0] ?? {}) as Record<string, unknown>;
    expect(valuesArg).toMatchObject({
      noteId: NOTE_ID,
      memberEmail: OTHER_USER_EMAIL,
      role: "editor",
      invitedByUserId: TEST_USER_ID,
    });
  });

  it("should default role to 'viewer' when not specified", async () => {
    const mockNote = createMockNote();
    const addedMember = createMockMember({ role: "viewer" });
    const { app, chains } = createTestApp([[mockNote], [addedMember]]);

    await app.request(`/api/notes/${NOTE_ID}/members`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ member_email: OTHER_USER_EMAIL }),
    });

    const insertCall = chains.find((c) => c.startMethod === "insert");
    expect(insertCall).toBeDefined();
    const insert = insertCall as NonNullable<typeof insertCall>;
    const valuesOp = insert.ops.find((op) => op.method === "values");
    const valuesArg = (valuesOp?.args[0] ?? {}) as Record<string, unknown>;
    expect(valuesArg.role).toBe("viewer");
  });

  it("should return 400 when member_email is missing", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("should return 403 when non-owner tries to add members", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID });
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner (owner mismatch → 403)
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ member_email: "someone@example.com" }),
    });

    expect(res.status).toBe(403);
  });

  it("should return 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_email: OTHER_USER_EMAIL }),
    });

    expect(res.status).toBe(401);
  });
});

// ── DELETE /api/notes/:noteId/members/:memberEmail ──────────────────────────

describe("DELETE /api/notes/:noteId/members/:memberEmail", () => {
  it("should remove a member and return { removed: true }", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner (owner)
      [], // update noteMembers (soft delete)
    ]);

    const encoded = encodeURIComponent(OTHER_USER_EMAIL);
    const res = await app.request(`/api/notes/${NOTE_ID}/members/${encoded}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ removed: true });
  });

  it("should return 403 when non-owner tries to remove", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID });
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner (owner mismatch)
    ]);

    const encoded = encodeURIComponent("target@example.com");
    const res = await app.request(`/api/notes/${NOTE_ID}/members/${encoded}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  it("should return 404 when note does not exist", async () => {
    const { app } = createTestApp([
      [], // requireNoteOwner → findActiveNoteById → null → 404
    ]);

    const encoded = encodeURIComponent(OTHER_USER_EMAIL);
    const res = await app.request(`/api/notes/${NOTE_ID}/members/${encoded}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });
});

// ── PUT /api/notes/:noteId/members/:memberEmail ─────────────────────────────

describe("PUT /api/notes/:noteId/members/:memberEmail", () => {
  it("should update member role and return updated NoteMemberItem", async () => {
    const mockNote = createMockNote();
    const updatedRow = createMockMember({
      noteId: NOTE_ID,
      memberEmail: OTHER_USER_EMAIL,
      role: "editor",
    });
    const { app, chains } = createTestApp([
      [mockNote], // requireNoteOwner
      [updatedRow], // update noteMembers with .returning()
    ]);

    const encoded = encodeURIComponent(OTHER_USER_EMAIL);
    const res = await app.request(`/api/notes/${NOTE_ID}/members/${encoded}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ role: "editor" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      note_id: NOTE_ID,
      member_email: OTHER_USER_EMAIL,
      role: "editor",
      invited_by_user_id: TEST_USER_ID,
    });
    expect(body).toHaveProperty("created_at");
    expect(body).toHaveProperty("updated_at");

    const updateCall = chains.find((c) => c.startMethod === "update");
    expect(updateCall).toBeDefined();
    const setOp = updateCall?.ops.find((op) => op.method === "set");
    expect((setOp?.args[0] as Record<string, unknown>)?.role).toBe("editor");
  });

  it("should return 400 when role is missing", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const encoded = encodeURIComponent(OTHER_USER_EMAIL);
    const res = await app.request(`/api/notes/${NOTE_ID}/members/${encoded}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("should return 403 when non-owner tries to update", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID });
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner (owner mismatch)
    ]);

    const encoded = encodeURIComponent(OTHER_USER_EMAIL);
    const res = await app.request(`/api/notes/${NOTE_ID}/members/${encoded}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ role: "editor" }),
    });

    expect(res.status).toBe(403);
  });

  it("should return 400 for invalid role", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // requireNoteOwner
    ]);

    const encoded = encodeURIComponent(OTHER_USER_EMAIL);
    const res = await app.request(`/api/notes/${NOTE_ID}/members/${encoded}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(400);
  });
});

// ── GET /api/notes/:noteId/members ──────────────────────────────────────────

describe("GET /api/notes/:noteId/members", () => {
  it("should return a flat array of NoteMemberItem with snake_case keys", async () => {
    const mockNote = createMockNote();
    const member1 = createMockMember({
      noteId: NOTE_ID,
      memberEmail: OTHER_USER_EMAIL,
      role: "editor",
    });
    const member2 = createMockMember({
      noteId: NOTE_ID,
      memberEmail: "third@example.com",
      role: "viewer",
    });

    const { app } = createTestApp([
      [mockNote], // getNoteRole (owner)
      [member1, member2], // select noteMembers
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    const first = body[0];
    expect(first).toBeDefined();
    expect(first).toMatchObject({
      note_id: NOTE_ID,
      member_email: OTHER_USER_EMAIL,
      role: "editor",
      invited_by_user_id: TEST_USER_ID,
    });
    expect(first).toHaveProperty("created_at");
    expect(first).toHaveProperty("updated_at");
    expect(first).not.toHaveProperty("members");

    const second = body[1];
    expect(second).toMatchObject({
      note_id: NOTE_ID,
      member_email: "third@example.com",
      role: "viewer",
    });
  });

  it("should return empty array when note has no members", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([
      [mockNote], // getNoteRole
      [], // select noteMembers → empty
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      headers: authHeaders(),
    });

    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("should return 403 for private note accessed by non-member", async () => {
    const privateNote = createMockNote({
      ownerId: OTHER_USER_ID,
      visibility: "private",
    });
    const { app } = createTestApp([
      [privateNote], // getNoteRole (not owner)
      [], // member check (not a member, private → null)
    ]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  it("should return 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/notes/${NOTE_ID}/members`, {
      headers: {},
    });

    expect(res.status).toBe(401);
  });
});
