/**
 * /health のテスト。認証不要、レート制限なし、現在時刻とデプロイ SHA を返す。
 * Tests for /health: no auth, no rate limiting, returns timestamp and deploy SHA.
 */
import { afterEach, describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import healthRoutes from "../../routes/health.js";

function createHealthApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.route("/", healthRoutes);
  return app;
}

describe("GET /health", () => {
  const originalGitSha = process.env.RAILWAY_GIT_COMMIT_SHA;

  afterEach(() => {
    if (originalGitSha === undefined) {
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
    } else {
      process.env.RAILWAY_GIT_COMMIT_SHA = originalGitSha;
    }
  });

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

  it("returns git_commit_sha null when RAILWAY_GIT_COMMIT_SHA is unset", async () => {
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    const app = createHealthApp();

    const res = await app.request("/health");
    const body = (await res.json()) as { git_commit_sha: string | null };

    expect(res.status).toBe(200);
    expect(body.git_commit_sha).toBeNull();
  });

  it("returns git_commit_sha from RAILWAY_GIT_COMMIT_SHA when set", async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = "abc123def456";
    const app = createHealthApp();

    const res = await app.request("/health");
    const body = (await res.json()) as { git_commit_sha: string | null };

    expect(res.status).toBe(200);
    expect(body.git_commit_sha).toBe("abc123def456");
  });
});
