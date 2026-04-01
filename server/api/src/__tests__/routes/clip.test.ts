/**
 * /api/clip ルートのテスト（fetch の SSRF 拒否・認証）
 * Tests for clip routes: fetch SSRF rejection and auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type AuthSession = Awaited<ReturnType<typeof import("../../auth.js").auth.api.getSession>>;

vi.mock("../../db/client.js", () => ({
  getDb: vi.fn(() => ({})),
}));

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

import { auth } from "../../auth.js";
import { Hono } from "hono";
import { errorHandler } from "../../middleware/errorHandler.js";
import clipRoutes from "../../routes/clip.js";
import type { AppEnv } from "../../types/index.js";

function createClipApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/api/clip", clipRoutes);
  return app;
}

describe("POST /api/clip/fetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: mockSessionUser } as AuthSession);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 401 when session is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when url is missing", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for localhost (SSRF protection)", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost/page" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/URL not allowed|only public http/i);
  });

  it("returns 400 for 127.0.0.1 (SSRF protection)", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:8080/" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/URL not allowed|only public http/i);
  });

  it("returns 200 with html when fetch succeeds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>hi</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch;

    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://8.8.8.8/article" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { html?: string; url?: string; content_type?: string };
    expect(body.html).toBe("<html>hi</html>");
    expect(body.content_type).toBe("text/html");
  });
});
