import { describe, it, expect, vi, beforeEach } from "vitest";
import { jsonRequest } from "../helpers/setup";
import { createApp } from "../../app";

vi.mock("../../db/client", () => ({
  getDb: vi.fn(() => {
    const self: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of [
      "select",
      "from",
      "where",
      "insert",
      "values",
      "update",
      "set",
      "delete",
      "onConflictDoUpdate",
      "onConflictDoNothing",
      "orderBy",
      "offset",
      "$dynamic",
      "innerJoin",
      "leftJoin",
    ]) {
      self[m] = vi.fn().mockReturnValue(self);
    }
    self.limit = vi.fn().mockResolvedValue([]);
    self.returning = vi.fn().mockResolvedValue([]);
    self.execute = vi.fn().mockResolvedValue({ rows: [] });
    self.then = vi.fn((r?: ((v: unknown) => unknown) | null) => Promise.resolve([]).then(r));
    return self;
  }),
}));
vi.mock("../../env", () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: "*",
    MEDIA_BUCKET: "b",
    AI_SECRETS_ARN: "a",
    RATE_LIMIT_TABLE: "r",
    THUMBNAIL_SECRETS_ARN: "a",
    THUMBNAIL_BUCKET: "b",
    THUMBNAIL_CLOUDFRONT_URL: "https://t",
    ENVIRONMENT: "test",
    POLAR_SECRET_ARN: "a",
    COGNITO_USER_POOL_ID: "p",
    COGNITO_REGION: "us-east-1",
    AURORA_CLUSTER_ARN: "a",
    DB_CREDENTIALS_SECRET: "a",
    AURORA_DATABASE_NAME: "zedi",
  })),
  resetEnvCache: vi.fn(),
}));
vi.mock("../../middleware/auth", () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
  authOptional: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
}));

describe("Clip API — authenticated flows", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  describe("POST /api/clip/fetch", () => {
    it("returns 400 when url is missing", async () => {
      const res = await jsonRequest(app, "POST", "/api/clip/fetch", {});
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty url", async () => {
      const res = await jsonRequest(app, "POST", "/api/clip/fetch", { url: "  " });
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid URL", async () => {
      const res = await jsonRequest(app, "POST", "/api/clip/fetch", { url: "not-a-url" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-http protocol", async () => {
      const res = await jsonRequest(app, "POST", "/api/clip/fetch", { url: "ftp://example.com" });
      expect(res.status).toBe(400);
    });

    it("fetches HTML from a valid URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com",
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve("<html>Hello</html>"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const res = await jsonRequest(app, "POST", "/api/clip/fetch", {
        url: "https://example.com",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { html: string; url: string };
      expect(body.html).toBe("<html>Hello</html>");
      expect(body.url).toBe("https://example.com");

      vi.unstubAllGlobals();
    });

    it("returns 502 when fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          headers: new Headers(),
        }),
      );

      const res = await jsonRequest(app, "POST", "/api/clip/fetch", {
        url: "https://example.com/broken",
      });

      expect(res.status).toBe(502);

      vi.unstubAllGlobals();
    });
  });
});
