/**
 * lib/mcpAuth.ts のユニットテスト
 * Unit tests for MCP auth helpers (PKCE, one-time code, JWT issue/verify, scope checks).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Make env vars deterministic before importing module under test.
// 環境変数を決定的にしてからモジュールを読み込む。
// NOTE: The secret below is a dummy value used only in unit tests.
// 以下のシークレットはユニットテスト専用のダミー値。
process.env.BETTER_AUTH_SECRET = "dummy-unit-test-secret"; // gitleaks:allow
process.env.MCP_REDIRECT_URI_ALLOW = "http://127.0.0.1:,https://app.zedi.example/";

import {
  verifyPKCE,
  storeMcpCode,
  consumeMcpCode,
  isMcpRedirectUriAllowed,
  issueMcpToken,
  verifyMcpToken,
  hasScope,
  MCP_SCOPE_READ,
  MCP_SCOPE_WRITE,
  MCP_JWT_AUDIENCE,
} from "../../lib/mcpAuth.js";
import { createHash } from "node:crypto";

/**
 * Minimal Redis-like in-memory mock used by store/consume tests.
 * 簡易インメモリ Redis モック（テスト用）。
 */
function createMockRedis() {
  const store = new Map<string, { value: string; expireAt: number }>();
  return {
    setex: vi.fn(async (key: string, ttl: number, value: string) => {
      store.set(key, { value, expireAt: Date.now() + ttl * 1000 });
      return "OK" as const;
    }),
    getdel: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      store.delete(key);
      return entry.value;
    }),
    _store: store,
  };
}

describe("verifyPKCE", () => {
  it("returns true when SHA256(verifier) base64url equals challenge", () => {
    const verifier = "abc123verifier-value";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPKCE(verifier, challenge)).toBe(true);
  });

  it("returns false on mismatch", () => {
    expect(verifyPKCE("abc", "not-the-hash")).toBe(false);
  });

  it("returns false on empty inputs", () => {
    expect(verifyPKCE("", "x")).toBe(false);
    expect(verifyPKCE("x", "")).toBe(false);
  });
});

describe("storeMcpCode / consumeMcpCode", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("stores code with mcp:code: prefix and TTL, then retrieves payload atomically", async () => {
    await storeMcpCode(
      redis as unknown as import("ioredis").Redis,
      "code-xyz",
      "user-1",
      "challenge-xyz",
      "http://127.0.0.1:5173/callback",
    );

    expect(redis.setex).toHaveBeenCalledOnce();
    const setexCall = redis.setex.mock.calls[0];
    if (!setexCall) throw new Error("setex was not called");
    const [key, ttl, raw] = setexCall;
    expect(key).toMatch(/^mcp:code:code-xyz$/);
    expect(typeof ttl).toBe("number");
    expect(ttl).toBeGreaterThan(0);
    const parsed = JSON.parse(raw) as {
      userId: string;
      codeChallenge: string;
      redirectUri: string;
    };
    expect(parsed).toEqual({
      userId: "user-1",
      codeChallenge: "challenge-xyz",
      redirectUri: "http://127.0.0.1:5173/callback",
    });

    const consumed = await consumeMcpCode(redis as unknown as import("ioredis").Redis, "code-xyz");
    expect(consumed).toEqual({
      userId: "user-1",
      codeChallenge: "challenge-xyz",
      redirectUri: "http://127.0.0.1:5173/callback",
    });

    // Re-consumption must return null (atomic delete-on-get).
    // 2 回目は null（取得と削除が原子的）。
    const second = await consumeMcpCode(redis as unknown as import("ioredis").Redis, "code-xyz");
    expect(second).toBeNull();
  });

  it("returns null for unknown code", async () => {
    const result = await consumeMcpCode(redis as unknown as import("ioredis").Redis, "missing");
    expect(result).toBeNull();
  });

  it("returns null when stored JSON is malformed", async () => {
    await redis.setex("mcp:code:bad", 60, "{not-json");
    const result = await consumeMcpCode(redis as unknown as import("ioredis").Redis, "bad");
    expect(result).toBeNull();
  });

  it("returns null when required fields are missing", async () => {
    await redis.setex("mcp:code:partial", 60, JSON.stringify({ userId: "u1" }));
    const result = await consumeMcpCode(redis as unknown as import("ioredis").Redis, "partial");
    expect(result).toBeNull();
  });
});

describe("isMcpRedirectUriAllowed", () => {
  it("accepts exact origin match", () => {
    expect(isMcpRedirectUriAllowed("https://app.zedi.example/callback")).toBe(true);
  });

  it("accepts 127.0.0.1 with any port when prefix http://127.0.0.1: is allowed", () => {
    expect(isMcpRedirectUriAllowed("http://127.0.0.1:5173/callback")).toBe(true);
    expect(isMcpRedirectUriAllowed("http://127.0.0.1:59123/cb")).toBe(true);
  });

  it("rejects evil origins", () => {
    expect(isMcpRedirectUriAllowed("https://evil.example/x")).toBe(false);
  });

  it("rejects malformed URL", () => {
    expect(isMcpRedirectUriAllowed("not a url")).toBe(false);
  });
});

describe("issueMcpToken / verifyMcpToken", () => {
  it("issues a JWT with subject, mcp scopes, audience, and expiration", async () => {
    const { access_token, expires_in } = await issueMcpToken("user-42", [
      MCP_SCOPE_READ,
      MCP_SCOPE_WRITE,
    ]);
    expect(typeof access_token).toBe("string");
    expect(access_token.split(".").length).toBe(3);
    expect(expires_in).toBeGreaterThan(0);

    const payload = await verifyMcpToken(access_token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-42");
    expect(payload?.aud).toBe(MCP_JWT_AUDIENCE);
    expect(payload?.scope).toEqual(expect.arrayContaining([MCP_SCOPE_READ, MCP_SCOPE_WRITE]));
  });

  it("rejects tokens signed with the wrong secret", async () => {
    const { access_token } = await issueMcpToken("user-42", [MCP_SCOPE_READ]);
    const originalSecret = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "dummy-other-secret"; // gitleaks:allow
    try {
      const payload = await verifyMcpToken(access_token);
      expect(payload).toBeNull();
    } finally {
      process.env.BETTER_AUTH_SECRET = originalSecret;
    }
  });

  it("rejects ext-audience tokens (audience isolation)", async () => {
    // Forge a token with the wrong audience by hand-signing with jose.
    // 別 audience のトークンは拒否されることを確認（ext と MCP の分離）。
    const { SignJWT } = await import("jose");
    const secretValue = process.env.BETTER_AUTH_SECRET ?? "";
    const secret = new TextEncoder().encode(secretValue);
    const forged = await new SignJWT({ scope: [MCP_SCOPE_READ] })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setAudience("zedi-extension")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(secret);
    const payload = await verifyMcpToken(forged);
    expect(payload).toBeNull();
  });

  it("rejects tokens missing any MCP scope", async () => {
    const { SignJWT } = await import("jose");
    const secretValue = process.env.BETTER_AUTH_SECRET ?? "";
    const secret = new TextEncoder().encode(secretValue);
    const forged = await new SignJWT({ scope: ["unrelated:scope"] })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setAudience(MCP_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(secret);
    const payload = await verifyMcpToken(forged);
    expect(payload).toBeNull();
  });

  it("returns null for garbage token", async () => {
    expect(await verifyMcpToken("not-a-jwt")).toBeNull();
  });
});

describe("hasScope", () => {
  it("returns true when payload contains the requested scope", () => {
    expect(
      hasScope(
        { sub: "u", scope: [MCP_SCOPE_READ, MCP_SCOPE_WRITE], aud: MCP_JWT_AUDIENCE, exp: 0 },
        MCP_SCOPE_WRITE,
      ),
    ).toBe(true);
  });

  it("returns false when scope is missing", () => {
    expect(
      hasScope(
        { sub: "u", scope: [MCP_SCOPE_READ], aud: MCP_JWT_AUDIENCE, exp: 0 },
        MCP_SCOPE_WRITE,
      ),
    ).toBe(false);
  });
});
