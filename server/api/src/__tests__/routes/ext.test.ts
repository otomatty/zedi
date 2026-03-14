/**
 * /api/ext ルートのテスト（clip-and-create の SSRF 拒否・認証・成功）
 * Tests for ext routes: clip-and-create SSRF rejection, auth, success.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../db/client.js", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("../../auth.js", () => ({
  auth: { api: { getSession: async () => null } },
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

vi.mock("../../lib/clipAndCreate.js", () => ({
  clipAndCreate: vi.fn().mockResolvedValue({
    page_id: "page-mock-001",
    title: "Mock Title",
    thumbnail_url: "https://example.com/thumb.png",
  }),
}));

import { Hono } from "hono";
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

describe("POST /api/ext/clip-and-create", () => {
  const mockRedis = {} as AppEnv["Variables"]["redis"];
  const mockDb = {} as AppEnv["Variables"]["db"];

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
});
