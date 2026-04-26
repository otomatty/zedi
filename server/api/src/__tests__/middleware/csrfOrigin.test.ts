/**
 * `middleware/csrfOrigin.ts` のユニットテスト。
 *
 * - 状態変更メソッド (POST/PUT/PATCH/DELETE) は Origin / Referer を検証する。
 * - 安全メソッド (GET/HEAD/OPTIONS) は素通りする。
 * - CORS_ORIGIN が未設定 / "*" のときは検証をスキップする (=後続のヘッダで拒否)。
 * - 除外パス (/api/webhooks/*, /api/ext/session, /api/ext/clip-and-create) は検査されない。
 *
 * Unit tests for the `csrfOriginCheck` Hono middleware. Verifies that
 * mutation requests are gated by Origin / Referer matching the CORS allow-list,
 * while safe methods, excluded paths, and wildcard CORS configurations bypass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { csrfOriginCheck } from "../../middleware/csrfOrigin.js";

/**
 * Test app: applies the middleware to every method on a small set of routes.
 * テスト用アプリ。複数メソッド・複数パスを 1 つの Hono に同居させる。
 */
function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", csrfOriginCheck);
  for (const path of [
    "/api/state",
    "/api/webhooks/stripe",
    "/api/ext/session",
    "/api/ext/clip-and-create",
    "/api/ext/authorize-code",
  ]) {
    app.get(path, (c) => c.json({ ok: true }));
    app.post(path, (c) => c.json({ ok: true }));
    app.put(path, (c) => c.json({ ok: true }));
    app.patch(path, (c) => c.json({ ok: true }));
    app.delete(path, (c) => c.json({ ok: true }));
    app.options(path, (c) => c.json({ ok: true }));
  }
  return app;
}

describe("csrfOriginCheck", () => {
  // CORS_ORIGIN を直接読み出すヘルパに依存しているため、
  // 各テストで明示的に設定し、終了時に元に戻す。
  // The middleware reads CORS_ORIGIN at call time; reset around each test.
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  beforeEach(() => {
    process.env.CORS_ORIGIN = "https://app.example.com,https://admin.example.com";
  });

  afterEach(() => {
    if (originalCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = originalCorsOrigin;
    }
  });

  describe("safe methods bypass entirely", () => {
    it.each(["GET", "OPTIONS"] as const)("%s does not require Origin/Referer", async (method) => {
      const res = await createApp().request("/api/state", { method });
      expect(res.status).toBe(200);
    });
  });

  describe("mutation methods enforce Origin/Referer", () => {
    it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
      "%s allows requests whose Origin matches the allow-list",
      async (method) => {
        const res = await createApp().request("/api/state", {
          method,
          headers: { Origin: "https://app.example.com" },
        });
        expect(res.status).toBe(200);
      },
    );

    it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
      "%s rejects requests whose Origin is NOT in the allow-list",
      async (method) => {
        const res = await createApp().request("/api/state", {
          method,
          headers: { Origin: "https://evil.example.org" },
        });
        expect(res.status).toBe(403);
        // HTTPException without an onError serializes the message as plain text.
        // onError 未登録時の HTTPException は本文がテキストで返る。
        const body = await res.text();
        expect(body).toMatch(/Origin or Referer/i);
      },
    );

    it("rejects mutation when neither Origin nor Referer is set", async () => {
      const res = await createApp().request("/api/state", { method: "POST" });
      expect(res.status).toBe(403);
    });

    it("falls back to Referer when Origin is absent (allowed)", async () => {
      const res = await createApp().request("/api/state", {
        method: "POST",
        headers: { Referer: "https://app.example.com/some/path?x=1" },
      });
      expect(res.status).toBe(200);
    });

    it("rejects when Referer is from an untrusted origin", async () => {
      const res = await createApp().request("/api/state", {
        method: "POST",
        headers: { Referer: "https://evil.example.org/" },
      });
      expect(res.status).toBe(403);
    });

    it("rejects when Referer is malformed (URL parse fails → null)", async () => {
      const res = await createApp().request("/api/state", {
        method: "POST",
        headers: { Referer: "not-a-url" },
      });
      expect(res.status).toBe(403);
    });

    it("prefers Origin over Referer when both are present", async () => {
      // Origin 単独で許可されていれば、Referer の値は無視される。
      // When Origin is explicitly trusted, the Referer check is bypassed.
      const res = await createApp().request("/api/state", {
        method: "POST",
        headers: {
          Origin: "https://app.example.com",
          Referer: "https://evil.example.org/",
        },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("CORS_ORIGIN configuration edge cases", () => {
    it("skips validation entirely when CORS_ORIGIN is unset (dev default)", async () => {
      delete process.env.CORS_ORIGIN;
      const res = await createApp().request("/api/state", { method: "POST" });
      expect(res.status).toBe(200);
    });

    it('skips validation entirely when CORS_ORIGIN is "*"', async () => {
      process.env.CORS_ORIGIN = "*";
      const res = await createApp().request("/api/state", {
        method: "POST",
        headers: { Origin: "https://anywhere.example.org" },
      });
      expect(res.status).toBe(200);
    });

    it("respects multi-origin CORS_ORIGIN (second entry also accepted)", async () => {
      const res = await createApp().request("/api/state", {
        method: "POST",
        headers: { Origin: "https://admin.example.com" },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("excluded paths", () => {
    it("does not validate Origin for /api/webhooks/* (signed by sender)", async () => {
      // Webhook は送信側の署名で検証されるため Origin 検査の対象外。
      // Webhook payloads are verified by signature, not by Origin.
      const res = await createApp().request("/api/webhooks/stripe", {
        method: "POST",
        headers: { Origin: "https://evil.example.org" },
      });
      expect(res.status).toBe(200);
    });

    it("does not validate Origin for /api/ext/session (Bearer-only)", async () => {
      const res = await createApp().request("/api/ext/session", { method: "POST" });
      expect(res.status).toBe(200);
    });

    it("does not validate Origin for /api/ext/clip-and-create (Bearer-only)", async () => {
      const res = await createApp().request("/api/ext/clip-and-create", { method: "POST" });
      expect(res.status).toBe(200);
    });

    it("STILL validates /api/ext/authorize-code (cookie-based, not exempt)", async () => {
      // /api/ext/authorize-code は Cookie 認証のため CSRF 対象に残す必要がある。
      // The authorize-code endpoint uses cookie auth, so it must remain protected.
      const res = await createApp().request("/api/ext/authorize-code", { method: "POST" });
      expect(res.status).toBe(403);
    });
  });
});
