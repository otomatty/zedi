/**
 * /api/mcp ルートのテスト
 *
 * 検証対象:
 * - POST /api/mcp/authorize-code (Better Auth セッション必須, PKCE code 発行)
 * - POST /api/mcp/session (PKCE code + verifier → JWT 交換)
 * - POST /api/mcp/revoke (mcpReadRequired, 失効登録)
 * - POST /api/mcp/clip (mcpWriteRequired, clipAndCreate のラッパ)
 *
 * Tests for /api/mcp routes: PKCE code issuance, code exchange, revocation, and MCP clip endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../db/client.js", () => ({
  getDb: vi.fn(() => ({})),
}));

type AuthSession = Awaited<ReturnType<typeof import("../../auth.js").auth.api.getSession>>;
const mockSessionUser = {
  id: "user-1",
  email: "u@e.com",
  name: "",
  image: null as string | null,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: null as string | null,
};
vi.mock("../../auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// MCP middleware mock — bypass JWT verification, set userId from header.
// MCP ミドルウェアのモック: ヘッダから userId を取り出して context にセットする。
vi.mock("../../middleware/mcpAuth.js", () => ({
  mcpReadRequired: async (c: Context<AppEnv>, next: Next) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ message: "Bearer token required" }, 401);
    }
    c.set("userId", c.req.header("x-test-mcp-user-id") ?? "user-mcp-test");
    await next();
  },
  mcpWriteRequired: async (c: Context<AppEnv>, next: Next) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ message: "Bearer token required" }, 401);
    }
    if (c.req.header("x-test-mcp-scope") === "read-only") {
      return c.json({ message: "mcp:write scope required" }, 403);
    }
    c.set("userId", c.req.header("x-test-mcp-user-id") ?? "user-mcp-test");
    await next();
  },
}));

const mockConsumeMcpCode = vi.fn();
const mockVerifyPKCE = vi.fn();
const mockIsMcpRedirectUriAllowed = vi.fn();
const mockIssueMcpToken = vi.fn();
const mockStoreMcpCode = vi.fn();
const mockStoreMcpRevocation = vi.fn();
vi.mock("../../lib/mcpAuth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/mcpAuth.js")>();
  return {
    ...actual,
    consumeMcpCode: (...args: unknown[]) => mockConsumeMcpCode(...args),
    verifyPKCE: (...args: unknown[]) => mockVerifyPKCE(...args),
    isMcpRedirectUriAllowed: (...args: unknown[]) => mockIsMcpRedirectUriAllowed(...args),
    issueMcpToken: (...args: unknown[]) => mockIssueMcpToken(...args),
    storeMcpCode: (...args: unknown[]) => mockStoreMcpCode(...args),
    storeMcpRevocation: (...args: unknown[]) => mockStoreMcpRevocation(...args),
  };
});

vi.mock("../../lib/clipAndCreate.js", () => ({
  clipAndCreate: vi.fn().mockResolvedValue({
    page_id: "page-mcp-001",
    title: "Mock MCP Title",
    thumbnail_url: "https://example.com/mcp-thumb.png",
  }),
}));

vi.mock("../../lib/clipUrlPolicy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/clipUrlPolicy.js")>();
  return {
    ...actual,
    isClipUrlAllowedAfterDns: vi.fn().mockResolvedValue(true),
  };
});

import { Hono } from "hono";
import { auth } from "../../auth.js";
import mcpRoutes from "../../routes/mcp.js";

function createMcpApp(redis: AppEnv["Variables"]["redis"], db: AppEnv["Variables"]["db"]) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("redis", redis);
    c.set("db", db);
    await next();
  });
  app.route("/api/mcp", mcpRoutes);
  return app;
}

async function parseJsonOrText(res: Response): Promise<{ message?: string }> {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as { message?: string };
  } catch {
    return { message: raw };
  }
}

/**
 * rateLimit ミドルウェアが `incr` / `expire` を呼ぶため、テスト用の最小 Redis を用意する。
 * In-memory stand-in for the bits of ioredis that the rateLimit middleware exercises.
 */
function createMockRedis(): AppEnv["Variables"]["redis"] {
  const store = new Map<string, number>();
  return {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
    get: vi.fn(async (key: string) => {
      const v = store.get(key);
      return v === undefined ? null : String(v);
    }),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  } as unknown as AppEnv["Variables"]["redis"];
}

let mockRedis = createMockRedis();
const mockDb = {} as AppEnv["Variables"]["db"];

beforeEach(() => {
  mockRedis = createMockRedis();
  vi.mocked(auth.api.getSession).mockResolvedValue(null);
  mockConsumeMcpCode.mockReset();
  mockVerifyPKCE.mockReset();
  mockIsMcpRedirectUriAllowed.mockReset();
  mockIssueMcpToken.mockReset();
  mockStoreMcpCode.mockReset();
  mockStoreMcpRevocation.mockReset();
  mockStoreMcpCode.mockResolvedValue(undefined);
  mockStoreMcpRevocation.mockResolvedValue(1_700_000_000);
  mockIssueMcpToken.mockResolvedValue({
    access_token: "mock-mcp-jwt",
    expires_in: 30 * 24 * 3600,
  });
});

describe("POST /api/mcp/authorize-code", () => {
  beforeEach(() => {
    mockIsMcpRedirectUriAllowed.mockReturnValue(true);
  });

  it("returns 401 when Better Auth session is missing", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: "http://127.0.0.1:5173/cb",
        code_challenge: "ch",
        scopes: ["mcp:read", "mcp:write"],
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when redirect_uri or code_challenge is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uri: "http://127.0.0.1:5173/cb" }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/code_challenge|required/i);
  });

  it("returns 400 when redirect_uri is not allowed", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    mockIsMcpRedirectUriAllowed.mockReturnValue(false);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: "https://evil.example/cb",
        code_challenge: "ch",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/redirect_uri|not allowed/i);
  });

  it("returns 400 when scopes contain unknown values", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: "http://127.0.0.1:5173/cb",
        code_challenge: "ch",
        scopes: ["mcp:read", "filesystem:write"],
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/scope/i);
  });

  it("returns 200 with code and state on success", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: "http://127.0.0.1:5173/cb",
        code_challenge: "ch",
        state: "xyz",
        scopes: ["mcp:read", "mcp:write"],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; state?: string };
    expect(typeof body.code).toBe("string");
    expect((body.code as string).length).toBeGreaterThan(0);
    expect(body.state).toBe("xyz");
    expect(mockStoreMcpCode).toHaveBeenCalledOnce();
  });
});

describe("POST /api/mcp/session", () => {
  it("returns 400 when grant_type is not authorization_code", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "password",
        code: "c",
        code_verifier: "v",
        redirect_uri: "http://127.0.0.1:5173/cb",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/grant_type|authorization_code/i);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code: "c" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is invalid or expired", async () => {
    mockIsMcpRedirectUriAllowed.mockReturnValue(true);
    mockConsumeMcpCode.mockResolvedValue(null);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "bad",
        code_verifier: "v",
        redirect_uri: "http://127.0.0.1:5173/cb",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when redirect_uri does not match stored", async () => {
    mockIsMcpRedirectUriAllowed.mockReturnValue(true);
    mockConsumeMcpCode.mockResolvedValue({
      userId: "user-1",
      codeChallenge: "ch",
      redirectUri: "http://127.0.0.1:5173/cb",
    });
    mockVerifyPKCE.mockReturnValue(true);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "c",
        code_verifier: "v",
        redirect_uri: "http://127.0.0.1:9999/other",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/mismatch|redirect_uri/i);
  });

  it("returns 400 when PKCE verification fails", async () => {
    mockIsMcpRedirectUriAllowed.mockReturnValue(true);
    mockConsumeMcpCode.mockResolvedValue({
      userId: "user-1",
      codeChallenge: "ch",
      redirectUri: "http://127.0.0.1:5173/cb",
    });
    mockVerifyPKCE.mockReturnValue(false);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "c",
        code_verifier: "wrong",
        redirect_uri: "http://127.0.0.1:5173/cb",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 with access_token on success", async () => {
    mockIsMcpRedirectUriAllowed.mockReturnValue(true);
    mockConsumeMcpCode.mockResolvedValue({
      userId: "user-1",
      codeChallenge: "ch",
      redirectUri: "http://127.0.0.1:5173/cb",
    });
    mockVerifyPKCE.mockReturnValue(true);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "c",
        code_verifier: "v",
        redirect_uri: "http://127.0.0.1:5173/cb",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    expect(body.access_token).toBe("mock-mcp-jwt");
    expect(body.expires_in).toBe(30 * 24 * 3600);
    expect(mockIssueMcpToken).toHaveBeenCalledWith(
      "user-1",
      expect.arrayContaining(["mcp:read", "mcp:write"]),
    );
  });
});

describe("POST /api/mcp/clip", () => {
  it("returns 401 without Bearer", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when token has read-only scope", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/clip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer t",
        "x-test-mcp-scope": "read-only",
      },
      body: JSON.stringify({ url: "https://example.com/x" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when url is missing", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for SSRF (localhost)", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({ url: "http://localhost/admin" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 with page info when clipAndCreate succeeds", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/clip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer t",
        "x-test-mcp-user-id": "user-mcp-1",
      },
      body: JSON.stringify({ url: "https://example.com/article" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { page_id?: string; title?: string };
    expect(body.page_id).toBe("page-mcp-001");
    expect(body.title).toBe("Mock MCP Title");
  });
});

describe("POST /api/mcp/revoke", () => {
  it("returns 401 without Bearer", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    expect(mockStoreMcpRevocation).not.toHaveBeenCalled();
  });

  it("records the revocation in Redis and returns 200", async () => {
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer t",
        "x-test-mcp-user-id": "user-revoke-42",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revoked?: boolean };
    expect(body.revoked).toBe(true);
    expect(mockStoreMcpRevocation).toHaveBeenCalledOnce();
    expect(mockStoreMcpRevocation).toHaveBeenCalledWith(mockRedis, "user-revoke-42");
  });
});

describe("POST /api/mcp/revoke-session", () => {
  it("returns 401 when no Better Auth session is present", async () => {
    // デバイス紛失等のユーザー操作用エンドポイント。セッションなしは 401。
    // Session-protected endpoint for UI-driven revocation; no session → 401.
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/revoke-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    expect(mockStoreMcpRevocation).not.toHaveBeenCalled();
  });

  it("records the revocation in Redis when called with a valid user session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { ...mockSessionUser, id: "user-session-7" },
    } as AuthSession);
    const res = await createMcpApp(mockRedis, mockDb).request("/api/mcp/revoke-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revoked?: boolean };
    expect(body.revoked).toBe(true);
    expect(mockStoreMcpRevocation).toHaveBeenCalledOnce();
    expect(mockStoreMcpRevocation).toHaveBeenCalledWith(mockRedis, "user-session-7");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting / レート制限
//
// MCP ルートは外部 Claude Code クライアントが叩くため、既定の tier リミットとは別に
// エンドポイントごとの short-window な制限を掛ける (#562)。
//
// /api/mcp/* endpoints enforce per-endpoint short-window limits; exceeding them
// yields 429 with Retry-After + a RATE_LIMIT_EXCEEDED body that MCP clients can
// surface to the user.
// ─────────────────────────────────────────────────────────────────────────────
describe("rate limiting (#562)", () => {
  it("POST /api/mcp/clip returns 429 with Retry-After once the per-user limit is exceeded", async () => {
    const app = createMcpApp(mockRedis, mockDb);
    // 30/min/user. 30 回まで通して 31 回目で 429。
    // Limit is 30/min/user; the 31st call in the window must fail.
    let firstLimited: Response | null = null;
    for (let i = 0; i < 31; i++) {
      const res = await app.request("/api/mcp/clip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer t",
          "x-test-mcp-user-id": "user-ratelimit-clip",
        },
        body: JSON.stringify({ url: "https://example.com/a" }),
      });
      if (res.status === 429 && !firstLimited) {
        firstLimited = res;
        break;
      }
      expect(res.status).toBe(200);
    }
    if (!firstLimited) throw new Error("expected a 429 but never hit the limit");
    expect(firstLimited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(firstLimited.headers.get("X-RateLimit-Limit")).toBe("30");
    const body = (await firstLimited.json()) as {
      error?: string;
      retry_after?: number;
      message?: string;
    };
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(typeof body.retry_after).toBe("number");
    expect(body.message).toMatch(/retry in \d+ seconds/i);
  });

  it("POST /api/mcp/clip keeps separate buckets for different users", async () => {
    const app = createMcpApp(mockRedis, mockDb);
    // ユーザー A を上限まで使い切ってもユーザー B は影響を受けない。
    // Burning user A's bucket must not bleed into user B's.
    for (let i = 0; i < 30; i++) {
      const res = await app.request("/api/mcp/clip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer t",
          "x-test-mcp-user-id": "user-a",
        },
        body: JSON.stringify({ url: "https://example.com/a" }),
      });
      expect(res.status).toBe(200);
    }
    const res = await app.request("/api/mcp/clip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer t",
        "x-test-mcp-user-id": "user-b",
      },
      body: JSON.stringify({ url: "https://example.com/a" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/mcp/session returns 429 once the per-IP limit is exceeded", async () => {
    mockIsMcpRedirectUriAllowed.mockReturnValue(true);
    mockConsumeMcpCode.mockResolvedValue(null);
    const app = createMcpApp(mockRedis, mockDb);
    let firstLimited: Response | null = null;
    // session は 10/min/IP。認証前ルートなので userId は無く IP でキー付けされる。
    // /session is unauthenticated so the bucket is keyed by IP (10/min).
    for (let i = 0; i < 11; i++) {
      const res = await app.request("/api/mcp/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.7",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: "c",
          code_verifier: "v",
          redirect_uri: "http://127.0.0.1:5173/cb",
        }),
      });
      if (res.status === 429) {
        firstLimited = res;
        break;
      }
    }
    expect(firstLimited).not.toBeNull();
    expect(firstLimited?.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(firstLimited?.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  it("POST /api/mcp/authorize-code is rate limited per user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    mockIsMcpRedirectUriAllowed.mockReturnValue(true);
    const app = createMcpApp(mockRedis, mockDb);
    let firstLimited: Response | null = null;
    // authorize-code は 20/min/user。
    // Limit: 20/min/user.
    for (let i = 0; i < 21; i++) {
      const res = await app.request("/api/mcp/authorize-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uri: "http://127.0.0.1:5173/cb",
          code_challenge: "ch",
        }),
      });
      if (res.status === 429) {
        firstLimited = res;
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(firstLimited).not.toBeNull();
    expect(firstLimited?.headers.get("X-RateLimit-Limit")).toBe("20");
  });
});
