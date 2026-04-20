/**
 * /api/invite-links ルートのテスト
 * Tests for the public invite-links routes.
 */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

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

const redeemInviteLinkMock = vi.fn();
vi.mock("../../services/inviteLinkService.js", async () => {
  const actual = await vi.importActual<object>("../../services/inviteLinkService.js");
  return {
    ...actual,
    redeemInviteLink: (arg: unknown) => redeemInviteLinkMock(arg),
  };
});

import inviteLinkRoutes from "../../routes/inviteLinks.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createMockDb } from "../createMockDb.js";

function createTestApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/invite-links", inviteLinkRoutes);
  return { app, chains };
}

// Test-only token used as a URL path param; not a real secret.
// テスト用のパスパラメータ（本物のシークレットではない）。
const TOKEN = "tok-abc123"; // gitleaks:allow

describe("GET /api/invite-links/:token", () => {
  it("returns 404 when the token is unknown", async () => {
    const { app } = createTestApp([
      [], // single select → empty
    ]);
    const res = await app.request(`/api/invite-links/${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it("returns preview data with status=valid for an active link", async () => {
    const row = {
      id: "00000000-0000-0000-0000-00000000aaaa",
      noteId: "11111111-1111-1111-1111-111111111111",
      role: "viewer",
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 10,
      usedCount: 2,
      revokedAt: null,
      requireSignIn: true,
      label: "Slack 用",
      noteTitle: "Test Note",
      inviterName: "Alice",
    };
    const { app } = createTestApp([[row]]);
    const res = await app.request(`/api/invite-links/${TOKEN}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("valid");
    expect(body.noteId).toBe(row.noteId);
    expect(body.role).toBe("viewer");
    expect(body.remainingUses).toBe(8);
  });

  it("returns status=revoked without rejecting the preview call", async () => {
    const row = {
      id: "00000000-0000-0000-0000-00000000aaaa",
      noteId: "note",
      role: "viewer",
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: null,
      usedCount: 0,
      revokedAt: new Date(Date.now() - 60_000),
      requireSignIn: true,
      label: null,
      noteTitle: "Test Note",
      inviterName: "Alice",
    };
    const { app } = createTestApp([[row]]);
    const res = await app.request(`/api/invite-links/${TOKEN}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("revoked");
  });

  it("returns status=expired when expiresAt is in the past", async () => {
    const row = {
      id: "00000000-0000-0000-0000-00000000aaaa",
      noteId: "note",
      role: "viewer",
      expiresAt: new Date(Date.now() - 60_000),
      maxUses: null,
      usedCount: 0,
      revokedAt: null,
      requireSignIn: true,
      label: null,
      noteTitle: "Test Note",
      inviterName: "Alice",
    };
    const { app } = createTestApp([[row]]);
    const res = await app.request(`/api/invite-links/${TOKEN}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("expired");
  });
});

describe("POST /api/invite-links/:token/redeem", () => {
  it("returns 401 without a session", async () => {
    const { app } = createTestApp([]);
    const res = await app.request(`/api/invite-links/${TOKEN}/redeem`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when the user has no email in the session", async () => {
    const { app } = createTestApp([]);
    const res = await app.request(`/api/invite-links/${TOKEN}/redeem`, {
      method: "POST",
      headers: { "x-test-user-id": "u1" },
    });
    expect(res.status).toBe(400);
  });

  it("maps service not_found to 404", async () => {
    redeemInviteLinkMock.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const { app } = createTestApp([]);
    const res = await app.request(`/api/invite-links/${TOKEN}/redeem`, {
      method: "POST",
      headers: { "x-test-user-id": "u1", "x-test-user-email": "u1@example.com" },
    });
    expect(res.status).toBe(404);
  });

  it("maps service revoked/expired/exhausted to 410", async () => {
    for (const reason of ["revoked", "expired", "exhausted"] as const) {
      redeemInviteLinkMock.mockResolvedValueOnce({ ok: false, reason });
      const { app } = createTestApp([]);
      const res = await app.request(`/api/invite-links/${TOKEN}/redeem`, {
        method: "POST",
        headers: { "x-test-user-id": "u1", "x-test-user-email": "u1@example.com" },
      });
      expect(res.status).toBe(410);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe(reason);
    }
  });

  it("returns 200 with membership info on success", async () => {
    redeemInviteLinkMock.mockResolvedValueOnce({
      ok: true,
      noteId: "note-1",
      role: "viewer",
      isNewRedemption: true,
      alreadyMember: false,
    });
    const { app } = createTestApp([]);
    const res = await app.request(`/api/invite-links/${TOKEN}/redeem`, {
      method: "POST",
      headers: { "x-test-user-id": "u1", "x-test-user-email": "u1@example.com" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      noteId: "note-1",
      role: "viewer",
      isNewRedemption: true,
      alreadyMember: false,
      status: "accepted",
    });
  });
});
