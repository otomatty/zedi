/**
 * 招待受諾フロー API のテスト
 * Tests for invitation acceptance flow API
 */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

// ── Auth mock ──────────────────────────────────────────────────────────────

vi.mock("../../middleware/auth.js", () => ({
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

import inviteRoutes from "../../routes/invite.js";
import { errorHandler } from "../../middleware/errorHandler.js";

// ── Constants ──────────────────────────────────────────────────────────────

const TEST_USER_ID = "user-test-123";
const TEST_USER_EMAIL = "test@example.com";
const OTHER_USER_EMAIL = "other@example.com";
const TEST_TOKEN = "abc123def456";
const NOTE_ID = "note-test-001";

// ── Mock DB (same proxy-based pattern as notes tests) ──────────────────────

interface ChainInfo {
  startMethod: string;
  startArgs: unknown[];
  ops: { method: string; args: unknown[] }[];
}

function createMockDb(results: unknown[]) {
  let chainIndex = 0;
  const chains: ChainInfo[] = [];

  function makeChainProxy(
    resultIdx: number,
    ops: { method: string; args: unknown[] }[],
  ): Promise<unknown> & Record<string, (...args: unknown[]) => unknown> {
    return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
      get(_, prop: string) {
        if (prop === "then") {
          const result = results[resultIdx];
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "catch") {
          const result = results[resultIdx];
          return (reject?: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
        }
        if (prop === "finally") {
          const result = results[resultIdx];
          return (fn?: () => void) => Promise.resolve(result).finally(fn);
        }
        return (...args: unknown[]) => {
          ops.push({ method: prop, args });
          return makeChainProxy(resultIdx, ops);
        };
      },
    }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  }

  const db = new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get(_, prop: string) {
      if (prop === "transaction") {
        return (fn: (tx: typeof db) => Promise<unknown>) => fn(db);
      }
      return (...args: unknown[]) => {
        const idx = chainIndex++;
        const ops: { method: string; args: unknown[] }[] = [];
        chains.push({ startMethod: prop, startArgs: args, ops });
        return makeChainProxy(idx, ops);
      };
    },
  });

  return { db, chains };
}

function createTestApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });

  app.onError(errorHandler);
  app.route("/api/invite", inviteRoutes);
  return { app, chains };
}

function authHeaders(userId = TEST_USER_ID, userEmail = TEST_USER_EMAIL) {
  return {
    "x-test-user-id": userId,
    "x-test-user-email": userEmail,
    "Content-Type": "application/json",
  };
}

// ── Mock Factories ─────────────────────────────────────────────────────────

function createMockInvitation(overrides: Record<string, unknown> = {}) {
  return {
    noteId: NOTE_ID,
    memberEmail: TEST_USER_EMAIL,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    usedAt: null,
    ...overrides,
  };
}

// ── GET /api/invite/:token ─────────────────────────────────────────────────

describe("GET /api/invite/:token", () => {
  it("should return invitation info for a valid token", async () => {
    const invitation = createMockInvitation();
    const noteRow = { title: "Test Note" };
    const memberRow = { invitedByUserId: "inviter-001", role: "editor" };
    const inviterRow = { name: "Alice" };

    const { app } = createTestApp([
      [invitation], // select noteInvitations
      [noteRow], // select notes (title)
      [memberRow], // select noteMembers (inviter + role)
      [inviterRow], // select users (inviter name)
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      noteId: NOTE_ID,
      noteTitle: "Test Note",
      inviterName: "Alice",
      role: "editor",
      memberEmail: TEST_USER_EMAIL,
      isExpired: false,
    });
  });

  it("should return isExpired: true for an expired invitation", async () => {
    const invitation = createMockInvitation({
      expiresAt: new Date("2020-01-01T00:00:00Z"), // past date
    });
    const noteRow = { title: "Expired Note" };
    const memberRow = { invitedByUserId: "inviter-001", role: "viewer" };
    const inviterRow = { name: "Bob" };

    const { app } = createTestApp([[invitation], [noteRow], [memberRow], [inviterRow]]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      isExpired: true,
    });
  });

  it("should return 404 for an invalid token", async () => {
    const { app } = createTestApp([
      [], // select noteInvitations → empty
    ]);

    const res = await app.request("/api/invite/invalid-token");

    expect(res.status).toBe(404);
  });

  it("should return default values when note or inviter not found", async () => {
    const invitation = createMockInvitation();

    const { app } = createTestApp([
      [invitation], // select noteInvitations
      [], // select notes → empty
      [], // select noteMembers → empty
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      noteTitle: "Untitled",
      inviterName: "Unknown",
      role: "viewer",
    });
  });
});

// ── POST /api/invite/:token/accept ─────────────────────────────────────────

describe("POST /api/invite/:token/accept", () => {
  it("should accept invitation when email matches", async () => {
    const invitation = createMockInvitation();
    const updatedMember = { role: "editor", status: "accepted" };

    const { app } = createTestApp([
      [invitation], // select noteInvitations
      [updatedMember], // update noteMembers → returning
      [], // update noteInvitations (used_at)
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      noteId: NOTE_ID,
      role: "editor",
      status: "accepted",
    });
  });

  it("should return 404 for an invalid token", async () => {
    const { app } = createTestApp([
      [], // select noteInvitations → empty
    ]);

    const res = await app.request("/api/invite/invalid-token/accept", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("should return 410 for an expired invitation", async () => {
    const invitation = createMockInvitation({
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    });

    const { app } = createTestApp([
      [invitation], // select noteInvitations
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(410);
  });

  it("should return 409 for an already used invitation", async () => {
    const invitation = createMockInvitation({
      usedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const { app } = createTestApp([
      [invitation], // select noteInvitations
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(409);
  });

  it("should return 400 when email does not match", async () => {
    const invitation = createMockInvitation({
      memberEmail: OTHER_USER_EMAIL, // different from TEST_USER_EMAIL
    });

    const { app } = createTestApp([
      [invitation], // select noteInvitations
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Please log in with the invited email address",
    });
  });

  it("should return 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });

  it("should handle case-insensitive email matching", async () => {
    const invitation = createMockInvitation({
      memberEmail: "TEST@EXAMPLE.COM", // uppercase
    });
    const updatedMember = { role: "viewer", status: "accepted" };

    const { app } = createTestApp([
      [invitation], // select noteInvitations
      [updatedMember], // update noteMembers → returning
      [], // update noteInvitations (used_at)
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: authHeaders(TEST_USER_ID, "test@example.com"), // lowercase
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "accepted",
    });
  });
});
