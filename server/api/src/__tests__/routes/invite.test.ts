/**
 * 招待受諾フロー API のテスト
 * Tests for invitation acceptance flow API
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

// ── Magic-link service mock ────────────────────────────────────────────────
// 招待メール救済フローのマジックリンク送信を差し替える。
// Replace the invitation rescue magic-link sender so tests don't hit Better Auth.
interface MagicLinkResult {
  sent: boolean;
  status?: number;
  error?: string;
}
const sendInvitationMagicLinkMock = vi.fn<(arg: unknown) => Promise<MagicLinkResult>>(async () => ({
  sent: true,
  status: 200,
}));
vi.mock("../../services/magicLinkService.js", () => ({
  sendInvitationMagicLink: (arg: unknown) => sendInvitationMagicLinkMock(arg),
}));

import inviteRoutes from "../../routes/invite.js";
import { errorHandler } from "../../middleware/errorHandler.js";

// ── Constants ──────────────────────────────────────────────────────────────

const TEST_USER_ID = "user-test-123";
const TEST_USER_EMAIL = "test@example.com";
const OTHER_USER_EMAIL = "other@example.com";
// Mock invitation token used as a URL path parameter in tests only.
// テスト用のモック招待トークン（URL パスパラメータとして使用）。本物のシークレットではない。
const TEST_TOKEN = "abc123def456"; // gitleaks:allow
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

// ── In-memory Redis mock (only the subset we use) ──────────────────────────

/**
 * email-link エンドポイントで使う Redis の最小実装。`eval`（Lua）と `ttl` のみ対応する。
 * サーバ側は incrWithExpire を Lua スクリプトで実装しており、
 * 初回 INCR 時のみ EXPIRE を設定する固定ウィンドウ挙動を再現する。
 *
 * Minimal Redis mock focused on the `eval` script used by incrWithExpire plus
 * `ttl` for retry-after computation. The EXPIRE is only set on the *first*
 * INCR so the mock mirrors the production fixed-window semantics.
 */
function createRedisMock() {
  const counters = new Map<string, number>();
  const ttls = new Map<string, number>();
  // 本番 Redis は「存在するが TTL 未設定」で `-1`、「キー不在」で `-2` を返す。
  // モックで両者を区別するために存在チェック用の Set を別に持つ。
  // Track key existence separately so `ttl()` can distinguish "key missing"
  // (-2) from "key exists, no TTL set" (-1), matching production Redis
  // semantics (see coderabbitai review on #668).
  const keys = new Set<string>();

  const api = {
    async eval(script: string, _numKeys: number, key: string, ttlArg: string): Promise<number> {
      // 本実装の Lua スクリプトに対応する JS ミラー / JS mirror of the prod Lua script.
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      keys.add(key);
      if (next === 1) {
        const ttlSec = Number.parseInt(ttlArg, 10);
        if (Number.isFinite(ttlSec)) ttls.set(key, ttlSec);
      }
      // script はテストで無視するが、万が一の typo 検出用に構造だけ確認する。
      if (!script.includes("incr")) throw new Error(`unexpected redis eval script: ${script}`);
      return next;
    },
    async ttl(key: string): Promise<number> {
      if (!keys.has(key)) return -2;
      return ttls.get(key) ?? -1;
    },
    _reset() {
      counters.clear();
      ttls.clear();
      keys.clear();
    },
    _incr(key: string): void {
      // テストから直接カウンタを積みたい場合の補助。EXPIRE は触らない。
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      keys.add(key);
    },
    _getCount(key: string): number {
      return counters.get(key) ?? 0;
    },
  };
  return api;
}

type RedisMock = ReturnType<typeof createRedisMock>;

function createTestAppWithRedis(dbResults: unknown[], redis: RedisMock) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    c.set("redis", redis as unknown as AppEnv["Variables"]["redis"]);
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
    // JOIN クエリで1回のDB呼び出し / Single joined query result
    const joinedRow = {
      noteId: NOTE_ID,
      memberEmail: TEST_USER_EMAIL,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: null,
      noteTitle: "Test Note",
      role: "editor",
      inviterName: "Alice",
    };

    const { app } = createTestApp([
      [joinedRow], // single joined select
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
      isUsed: false,
    });
  });

  it("should return isUsed: true for an already accepted invitation", async () => {
    const joinedRow = {
      noteId: NOTE_ID,
      memberEmail: TEST_USER_EMAIL,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: new Date("2026-03-01T00:00:00Z"),
      noteTitle: "Used Note",
      role: "viewer",
      inviterName: "Alice",
    };

    const { app } = createTestApp([[joinedRow]]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      isUsed: true,
      isExpired: false,
    });
  });

  it("should return isExpired: true for an expired invitation", async () => {
    const joinedRow = {
      noteId: NOTE_ID,
      memberEmail: TEST_USER_EMAIL,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
      usedAt: null,
      noteTitle: "Expired Note",
      role: "viewer",
      inviterName: "Bob",
    };

    const { app } = createTestApp([[joinedRow]]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      isExpired: true,
    });
  });

  it("should return 404 for an invalid token", async () => {
    const { app } = createTestApp([
      [], // select → empty (no matching token)
    ]);

    const res = await app.request("/api/invite/invalid-token");

    expect(res.status).toBe(404);
  });

  it("should return default values when note or member is null (LEFT JOIN)", async () => {
    // LEFT JOIN でノート・メンバーが見つからない場合 null が返る
    const joinedRow = {
      noteId: NOTE_ID,
      memberEmail: TEST_USER_EMAIL,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: null,
      noteTitle: null,
      role: null,
      inviterName: null,
    };

    const { app } = createTestApp([
      [joinedRow], // single joined select with nulls
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
    const claimed = { noteId: NOTE_ID, memberEmail: TEST_USER_EMAIL };
    const updatedMember = { role: "editor", status: "accepted" };

    const { app } = createTestApp([
      [invitation], // select noteInvitations
      [claimed], // update noteInvitations (claim) → returning
      [updatedMember], // update noteMembers → returning
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

  it("should return 404 when member record was soft-deleted", async () => {
    const invitation = createMockInvitation();
    const claimed = { noteId: NOTE_ID, memberEmail: TEST_USER_EMAIL };

    const { app } = createTestApp([
      [invitation], // select noteInvitations
      [claimed], // claim invitation
      [], // update noteMembers → returning empty (soft-deleted)
    ]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Member record not found",
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

  it("should return 400 when user email is missing", async () => {
    const invitation = createMockInvitation();
    const { app } = createTestApp([[invitation]]);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/accept`, {
      method: "POST",
      headers: {
        "x-test-user-id": TEST_USER_ID,
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Could not determine your email address. Please log in again.",
    });
  });

  it("should handle case-insensitive email matching", async () => {
    const invitation = createMockInvitation({
      memberEmail: "TEST@EXAMPLE.COM", // uppercase
    });
    const claimed = { noteId: NOTE_ID, memberEmail: "TEST@EXAMPLE.COM" };
    const updatedMember = { role: "viewer", status: "accepted" };

    const { app } = createTestApp([
      [invitation], // select noteInvitations
      [claimed], // claim invitation (returning row)
      [updatedMember], // update noteMembers → returning
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

// ── POST /api/invite/:token/email-link ─────────────────────────────────────

describe("POST /api/invite/:token/email-link", () => {
  beforeEach(() => {
    sendInvitationMagicLinkMock.mockClear();
    sendInvitationMagicLinkMock.mockResolvedValue({ sent: true, status: 200 });
  });

  function createInvitationRow(overrides: Record<string, unknown> = {}) {
    return {
      memberEmail: TEST_USER_EMAIL,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: null,
      locale: "ja" as const,
      ...overrides,
    };
  }

  it("202 を返し、招待先メール宛にマジックリンクを送信する", async () => {
    const redis = createRedisMock();
    // 6 回分の invitation select を積む（最初の1回だけ使う）
    // Provide 6 invitation selects for the whole describe block's needs.
    const { app } = createTestAppWithRedis([[createInvitationRow()]], redis);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      sent: true,
      memberEmail: TEST_USER_EMAIL,
      retryAfterSec: 5 * 60,
    });
    expect(sendInvitationMagicLinkMock).toHaveBeenCalledTimes(1);
    expect(sendInvitationMagicLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: TEST_USER_EMAIL,
        callbackURL: expect.stringContaining(`/invite?token=${TEST_TOKEN}`),
        locale: "ja",
      }),
    );
  });

  it("無効なトークンは 404 を返す", async () => {
    const redis = createRedisMock();
    const { app } = createTestAppWithRedis([[]], redis);

    const res = await app.request("/api/invite/invalid-token/email-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(404);
    expect(sendInvitationMagicLinkMock).not.toHaveBeenCalled();
  });

  it("期限切れトークンは 410 を返す（accept エンドポイントと同じ意味論）", async () => {
    const redis = createRedisMock();
    const invitation = createInvitationRow({
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    const { app } = createTestAppWithRedis([[invitation]], redis);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(410);
    expect(sendInvitationMagicLinkMock).not.toHaveBeenCalled();
  });

  it("使用済みトークンは 409 を返す", async () => {
    const redis = createRedisMock();
    const invitation = createInvitationRow({
      usedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const { app } = createTestAppWithRedis([[invitation]], redis);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(409);
    expect(sendInvitationMagicLinkMock).not.toHaveBeenCalled();
  });

  it("5 分ウィンドウ内の 2 回目の呼び出しは 429 (short) を返し送信しない", async () => {
    const redis = createRedisMock();
    // 2 回分の invitation select を積む（毎回先頭の配列が消費される）
    const { app } = createTestAppWithRedis(
      [[createInvitationRow()], [createInvitationRow()]],
      redis,
    );

    const first = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(first.status).toBe(202);

    const second = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(second.status).toBe(429);
    const body = (await second.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "RATE_LIMIT_EXCEEDED",
      scope: "short",
    });
    expect(second.headers.get("Retry-After")).toBe(String(5 * 60));
    expect(sendInvitationMagicLinkMock).toHaveBeenCalledTimes(1);
  });

  it("1 日 5 回の上限を超えた 6 回目は 429 (daily) を返す", async () => {
    const redis = createRedisMock();
    // 1日ウィンドウだけ 5 を超えるよう、短期ウィンドウは都度スキップ済みに見せかける。
    // 短期ウィンドウのカウントを毎回リセットして「5 分ウィンドウは空」と想定する。
    // Provide 6 invitation rows for 6 requests.
    const rows: unknown[] = [];
    for (let i = 0; i < 6; i++) rows.push([createInvitationRow()]);
    const { app } = createTestAppWithRedis(rows, redis);

    const shortKey = `ratelimit:invite-email-link:5min:${TEST_TOKEN}`;

    // 1 回目〜5 回目は 202 を返す（各呼び出し前に短期ウィンドウをリセット）
    for (let i = 0; i < 5; i++) {
      redis._reset();
      // 直前の呼び出しまでに累積した daily カウントを復元
      // Restore the daily counter so rolling the short window doesn't reset it.
      const dailyKey = `ratelimit:invite-email-link:day:${TEST_TOKEN}`;
      for (let n = 0; n < i; n++) redis._incr(dailyKey);

      const res = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(202);
      expect(redis._getCount(shortKey)).toBe(1);
    }

    // 6 回目: daily が 6 になり 429 (daily) を返す
    redis._reset();
    const dailyKey = `ratelimit:invite-email-link:day:${TEST_TOKEN}`;
    for (let n = 0; n < 5; n++) redis._incr(dailyKey);
    const sixth = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(sixth.status).toBe(429);
    const body = (await sixth.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "RATE_LIMIT_EXCEEDED",
      scope: "daily",
    });
    expect(sendInvitationMagicLinkMock).toHaveBeenCalledTimes(5);
  });

  it("短期ウィンドウで弾かれたリクエストは日次カウンタを消費しない（DoS 防止）", async () => {
    const redis = createRedisMock();
    // 1 回目のリクエスト + 4 回分の短期拒否用に 5 回分の invitation を積む。
    const rows: unknown[] = [];
    for (let i = 0; i < 5; i++) rows.push([createInvitationRow()]);
    const { app } = createTestAppWithRedis(rows, redis);

    const shortKey = `ratelimit:invite-email-link:5min:${TEST_TOKEN}`;
    const dailyKey = `ratelimit:invite-email-link:day:${TEST_TOKEN}`;

    // 1 回目: 202。short=1, daily=1。
    const first = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(first.status).toBe(202);
    expect(redis._getCount(dailyKey)).toBe(1);

    // 2〜5 回目は短期ウィンドウで全て拒否。daily は 1 のまま。
    for (let i = 0; i < 4; i++) {
      const res = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(429);
      expect(redis._getCount(dailyKey)).toBe(1);
    }

    // short は 5 まで積まれているはず（毎回 INCR される）。
    expect(redis._getCount(shortKey)).toBe(5);
    // magicLink サービスは 1 回だけ呼ばれる。
    expect(sendInvitationMagicLinkMock).toHaveBeenCalledTimes(1);
  });

  it("TTL は初回 INCR 時のみ付与され、再送でスライディングウィンドウ化しない", async () => {
    const redis = createRedisMock();
    const { app } = createTestAppWithRedis(
      [[createInvitationRow()], [createInvitationRow()]],
      redis,
    );

    // 1 回目: 新規作成で TTL=5min を付与。
    await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const shortKey = `ratelimit:invite-email-link:5min:${TEST_TOKEN}`;
    expect(await redis.ttl(shortKey)).toBe(5 * 60);

    // TTL を手で進めたことにする（残り 60 秒）。2 回目のリクエストで TTL が再延長
    // されないことを確認する（スライディングウィンドウでは 300 秒に戻ってしまう）。
    redis._reset();
    // カウンタを 1 に戻し、TTL は 60 秒の想定で再現。
    redis._incr(shortKey);
    // eval は新規作成のみ EXPIRE するため、TTL は更新されない想定。
    // TTL を検証するため、mock のマップを直接操作する代わりに再設定は行わない。
    const second = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(second.status).toBe(429);
    // 2 回目は c != 1 なので EXPIRE は走らず、TTL は付与されない。モックは本番 Redis と
    // 同様に「キー存在・TTL 未設定」で -1 を返すため、この値で TTL 未更新を検証する。
    // Second INCR returns c != 1, so EXPIRE is skipped. The mock mirrors real
    // Redis semantics: -1 for an existing key without TTL, confirming the
    // window was not extended.
    expect(await redis.ttl(shortKey)).toBe(-1);
  });

  it("Redis が無い環境ではレート制限を適用せずに送信する", async () => {
    const { app } = createTestApp([
      [createInvitationRow()],
      [createInvitationRow()],
      [createInvitationRow()],
    ]);

    for (let i = 0; i < 3; i++) {
      const res = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(202);
    }
    expect(sendInvitationMagicLinkMock).toHaveBeenCalledTimes(3);
  });

  it("magicLinkService が失敗したら 502 を返す", async () => {
    sendInvitationMagicLinkMock.mockResolvedValueOnce({
      sent: false,
      error: "simulated failure",
    });
    const redis = createRedisMock();
    const { app } = createTestAppWithRedis([[createInvitationRow()]], redis);

    const res = await app.request(`/api/invite/${TEST_TOKEN}/email-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(502);
  });
});
