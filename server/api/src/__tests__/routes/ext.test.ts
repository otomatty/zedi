/**
 * /api/ext ルートのテスト（clip-and-create の SSRF 拒否・認証・成功、session / authorize-code）
 * Tests for ext routes: clip-and-create SSRF rejection, auth, success; session and authorize-code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

// youtube-transcript は CJS/ESM 互換性問題があるのでモック
// Mock youtube-transcript (CJS/ESM compatibility workaround)
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn().mockResolvedValue([]),
  },
}));

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

vi.mock("../../middleware/extAuth.js", () => ({
  extAuthRequired: async (c: Context<AppEnv>, next: Next) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ message: "Bearer token required" }, 401);
    }
    const userId = c.req.header("x-test-ext-user-id") ?? "user-ext-test";
    c.set("userId", userId);
    await next();
  },
}));

const mockConsumeExtensionCode = vi.fn();
const mockVerifyPKCE = vi.fn();
const mockIsRedirectUriAllowed = vi.fn();
const mockIssueExtensionToken = vi.fn();
const mockStoreExtensionCode = vi.fn();
vi.mock("../../lib/extAuth.js", () => ({
  consumeExtensionCode: (...args: unknown[]) => mockConsumeExtensionCode(...args),
  verifyPKCE: (...args: unknown[]) => mockVerifyPKCE(...args),
  isRedirectUriAllowed: (...args: unknown[]) => mockIsRedirectUriAllowed(...args),
  issueExtensionToken: (...args: unknown[]) => mockIssueExtensionToken(...args),
  storeExtensionCode: (...args: unknown[]) => mockStoreExtensionCode(...args),
}));

const mockClipAndCreate = vi.fn().mockResolvedValue({
  page_id: "page-mock-001",
  title: "Mock Title",
  thumbnail_url: "https://example.com/thumb.png",
});
vi.mock("../../lib/clipAndCreate.js", () => ({
  clipAndCreate: (...args: unknown[]) => mockClipAndCreate(...args),
}));

const mockResolveAiConfigForRequest = vi.fn();
vi.mock("../../lib/aiAccessHelpers.js", () => ({
  resolveAiConfigForRequest: (...args: unknown[]) => mockResolveAiConfigForRequest(...args),
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
import extRoutes from "../../routes/ext.js";

function createExtApp(redis: AppEnv["Variables"]["redis"], db: AppEnv["Variables"]["db"]) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("redis", redis);
    c.set("db", db);
    await next();
  });
  app.route("/api/ext", extRoutes);
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

describe("POST /api/ext/clip-and-create", () => {
  const mockRedis = {} as AppEnv["Variables"]["redis"];
  const mockDb = {} as AppEnv["Variables"]["db"];

  beforeEach(() => {
    mockClipAndCreate.mockClear();
    mockResolveAiConfigForRequest.mockReset();
    mockResolveAiConfigForRequest.mockResolvedValue(null);
  });

  it("returns 401 when Authorization Bearer is missing", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/article" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when url is missing", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const raw = await res.text();
    const msg = (() => {
      try {
        const j = JSON.parse(raw) as { message?: string };
        return j.message ?? raw;
      } catch {
        return raw;
      }
    })();
    expect(msg).toMatch(/url/i);
  });

  it("returns 400 when url is empty string", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({ url: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for localhost (SSRF protection)", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({ url: "http://localhost/admin" }),
    });
    expect(res.status).toBe(400);
    const raw = await res.text();
    const msg = (() => {
      try {
        const j = JSON.parse(raw) as { message?: string };
        return j.message ?? raw;
      } catch {
        return raw;
      }
    })();
    expect(msg).toMatch(/URL not allowed|only public http/i);
  });

  it("returns 400 for 127.0.0.1 (SSRF protection)", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({ url: "http://127.0.0.1:3000/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for private IP 192.168.x.x (SSRF protection)", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({ url: "https://192.168.1.1/router" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for private IP 10.x.x.x (SSRF protection)", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({ url: "http://10.0.0.1/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 with page_id when url is allowed and clipAndCreate succeeds", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({ url: "https://example.com/article" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { page_id?: string; title?: string; thumbnail_url?: string };
    expect(body.page_id).toBe("page-mock-001");
    expect(body.title).toBe("Mock Title");
    expect(body.thumbnail_url).toBe("https://example.com/thumb.png");
  });

  it("does not resolve AI config for non-YouTube URLs even when provider/model are present", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({
        url: "https://example.com/article",
        provider: "openai",
        model: "openai:gpt-4o-mini",
      }),
    });

    expect(res.status).toBe(200);
    expect(mockResolveAiConfigForRequest).not.toHaveBeenCalled();
    expect(mockClipAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/article",
        aiProvider: undefined,
        aiModel: undefined,
        aiApiKey: undefined,
      }),
    );
  });

  it("resolves AI config for YouTube URLs before clipAndCreate", async () => {
    mockResolveAiConfigForRequest.mockResolvedValue({
      provider: "openai",
      apiModelId: "gpt-4o-mini",
      apiKey: "test-api-key",
      internalModelId: "openai:gpt-4o-mini",
      tier: "free",
      modelInfo: {
        provider: "openai",
        apiModelId: "gpt-4o-mini",
        inputCostUnits: 1,
        outputCostUnits: 1,
      },
    });

    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/clip-and-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
        "x-test-ext-user-id": "user-1",
      },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        provider: "openai",
        model: "openai:gpt-4o-mini",
      }),
    });

    expect(res.status).toBe(200);
    expect(mockResolveAiConfigForRequest).toHaveBeenCalledWith({
      userId: "user-1",
      db: mockDb,
      provider: "openai",
      model: "openai:gpt-4o-mini",
    });
    expect(mockClipAndCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        aiProvider: "openai",
        aiModel: "gpt-4o-mini",
        aiApiKey: "test-api-key",
      }),
    );
  });
});

describe("POST /api/ext/session", () => {
  const mockRedis = {} as AppEnv["Variables"]["redis"];
  const mockDb = {} as AppEnv["Variables"]["db"];

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    mockStoreExtensionCode.mockResolvedValue(undefined);
    mockIssueExtensionToken.mockResolvedValue({
      access_token: "mock-access-token",
      expires_in: 604800,
    });
  });

  it("returns 400 when grant_type is not authorization_code", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "password",
        code: "code1",
        code_verifier: "verifier",
        redirect_uri: "https://x.chromiumapp.org/",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/grant_type|authorization_code/i);
  });

  it("returns 400 when code, code_verifier or redirect_uri is missing", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        redirect_uri: "https://x.chromiumapp.org/",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/code|code_verifier|redirect_uri|required/i);
  });

  it("returns 400 when redirect_uri is not allowed", async () => {
    mockIsRedirectUriAllowed.mockReturnValue(false);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "c",
        code_verifier: "v",
        redirect_uri: "https://evil.com/",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/redirect_uri|not allowed/i);
  });

  it("returns 400 when code is invalid or expired", async () => {
    mockIsRedirectUriAllowed.mockReturnValue(true);
    mockConsumeExtensionCode.mockResolvedValue(null);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "bad-code",
        code_verifier: "v",
        redirect_uri: "https://x.chromiumapp.org/",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/Invalid|expired|code/i);
  });

  it("returns 400 when redirect_uri does not match stored", async () => {
    mockIsRedirectUriAllowed.mockReturnValue(true);
    mockConsumeExtensionCode.mockResolvedValue({
      userId: "user-1",
      codeChallenge: "ch",
      redirectUri: "https://x.chromiumapp.org/",
    });
    mockVerifyPKCE.mockReturnValue(true);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "c",
        code_verifier: "v",
        redirect_uri: "https://other.chromiumapp.org/",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/redirect_uri|mismatch/i);
  });

  it("returns 400 when PKCE verification fails", async () => {
    mockIsRedirectUriAllowed.mockReturnValue(true);
    mockConsumeExtensionCode.mockResolvedValue({
      userId: "user-1",
      codeChallenge: "ch",
      redirectUri: "https://x.chromiumapp.org/",
    });
    mockVerifyPKCE.mockReturnValue(false);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "c",
        code_verifier: "wrong-verifier",
        redirect_uri: "https://x.chromiumapp.org/",
      }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/PKCE/i);
  });

  it("returns 200 with access_token when code and PKCE are valid", async () => {
    mockIsRedirectUriAllowed.mockReturnValue(true);
    mockConsumeExtensionCode.mockResolvedValue({
      userId: "user-1",
      codeChallenge: "ch",
      redirectUri: "https://x.chromiumapp.org/",
    });
    mockVerifyPKCE.mockReturnValue(true);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: "c",
        code_verifier: "v",
        redirect_uri: "https://x.chromiumapp.org/",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    expect(body.access_token).toBe("mock-access-token");
    expect(body.expires_in).toBe(604800);
  });
});

describe("GET /api/ext/authorize-code", () => {
  const mockRedis = {} as AppEnv["Variables"]["redis"];
  const mockDb = {} as AppEnv["Variables"]["db"];

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    mockStoreExtensionCode.mockResolvedValue(undefined);
    mockIsRedirectUriAllowed.mockReturnValue(true);
  });

  it("returns 401 when session is missing", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request(
      "/api/ext/authorize-code?redirect_uri=https://x.chromiumapp.org/&code_challenge=ch&state=s",
      { method: "GET" },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when redirect_uri or code_challenge is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request(
      "/api/ext/authorize-code?redirect_uri=https://x.chromiumapp.org/",
      {
        method: "GET",
      },
    );
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/redirect_uri|code_challenge|required/i);
  });

  it("returns 400 when redirect_uri is not allowed", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    mockIsRedirectUriAllowed.mockReturnValue(false);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request(
      "/api/ext/authorize-code?redirect_uri=https://evil.com/&code_challenge=ch&state=s",
      { method: "GET" },
    );
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/redirect_uri|not allowed/i);
  });

  it("returns 200 with code and state when session and params are valid", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request(
      "/api/ext/authorize-code?redirect_uri=https://x.chromiumapp.org/&code_challenge=ch&state=st",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; state?: string };
    expect(typeof body.code).toBe("string");
    expect(body.code).toBeDefined();
    expect((body.code as string).length).toBeGreaterThan(0);
    expect(body.state).toBe("st");
  });
});

describe("POST /api/ext/authorize-code", () => {
  const mockRedis = {} as AppEnv["Variables"]["redis"];
  const mockDb = {} as AppEnv["Variables"]["db"];

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    mockStoreExtensionCode.mockResolvedValue(undefined);
    mockIsRedirectUriAllowed.mockReturnValue(true);
  });

  it("returns 401 when session is missing", async () => {
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: "https://x.chromiumapp.org/",
        code_challenge: "ch",
        state: "s",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when redirect_uri or code_challenge is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uri: "https://x.chromiumapp.org/" }),
    });
    expect(res.status).toBe(400);
    const body = await parseJsonOrText(res);
    expect(body.message).toMatch(/redirect_uri|code_challenge|required/i);
  });

  it("returns 200 with code and state when session and body are valid", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
    const app = createExtApp(mockRedis, mockDb);
    const res = await app.request("/api/ext/authorize-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: "https://x.chromiumapp.org/",
        code_challenge: "ch",
        state: "st",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; state?: string };
    expect(typeof body.code).toBe("string");
    expect(body.code).toBeDefined();
    expect((body.code as string).length).toBeGreaterThan(0);
    expect(body.state).toBe("st");
  });
});
