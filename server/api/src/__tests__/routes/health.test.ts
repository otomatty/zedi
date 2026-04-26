/**
 * /health のテスト。認証不要、レート制限なし、現在時刻を返すだけ。
 * Tests for /health: no auth, no rate limiting, returns current timestamp.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import healthRoutes from "../../routes/health.js";

function createHealthApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.route("/", healthRoutes);
  return app;
}

describe("GET /health", () => {
  it("returns 200 with status ok and an ISO timestamp", async () => {
    const app = createHealthApp();

    const before = Date.now();
    const res = await app.request("/health");
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");

    // ISO 8601 の妥当性確認 + ハンドラ実行範囲内の時刻であること。
    // Validate ISO 8601 parseability and that the timestamp falls within the call window.
    const parsed = new Date(body.timestamp).getTime();
    expect(Number.isFinite(parsed)).toBe(true);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("does not require auth", async () => {
    const app = createHealthApp();

    // 認証ヘッダなしでも 200 を返すことを確認する。
    // Confirm 200 is returned even without auth headers.
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
