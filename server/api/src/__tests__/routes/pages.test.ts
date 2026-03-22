/**
 * GET/PUT /api/pages/:id/content など pages ルートのテスト。
 * Tests for pages routes including empty page_contents handling on GET.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

import { Hono } from "hono";
import pageRoutes from "../../routes/pages.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-test-123";
const PAGE_ID = "page-content-test-001";

function authHeaders() {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

function createPagesApp(dbResults: unknown[]) {
  const { db } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/pages", pageRoutes);
  return app;
}

describe("GET /api/pages/:id/content", () => {
  it("returns 200 with empty ydoc_state when page exists but page_contents row is missing", async () => {
    const app = createPagesApp([[{ id: PAGE_ID, ownerId: TEST_USER_ID }], []]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ydoc_state: "",
      version: 0,
      content_text: null,
    });
    expect(body.updated_at).toBeUndefined();
  });

  it("returns 404 when page does not exist", async () => {
    const app = createPagesApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth header", async () => {
    const app = createPagesApp([[], []]);

    const res = await app.request(`/api/pages/${PAGE_ID}/content`, {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });
});
